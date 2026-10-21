import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  db,
  membersTable,
  pollingStationsTable,
  turnoutAssumptionsTable,
  tallyResultsTable,
  opinionPollsTable,
  pollVotesTable,
  insightResponsesTable,
  socialMentionsTable,
  donationsTable,
  canvassSessionsTable,
  canvassVisitsTable,
  volunteersTable,
  diQuestionsTable,
  diBriefingsTable,
  diSnapshotsTable,
  diChangesTable,
  diDatasetsTable,
  diDatasetRowsTable,
  type DiDataset,
  type DiColumnMeta,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { CAMPAIGN_CONTEXT } from "./ai";

const router = Router();

// ---------------------------------------------------------------------------
// Rate limiting: these endpoints burn AI credits, so mirror the speeches/social
// guard — one generation at a time globally plus a short per-IP cooldown.
// ---------------------------------------------------------------------------
const DI_COOLDOWN_MS = 12_000;
let diInFlight = false;
const lastDiByIp = new Map<string, number>();

function checkDiRateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  if (diInFlight) return { ok: false, retryAfter: 8 };
  const now = Date.now();
  const last = lastDiByIp.get(ip) ?? 0;
  const elapsed = now - last;
  if (elapsed < DI_COOLDOWN_MS) return { ok: false, retryAfter: Math.ceil((DI_COOLDOWN_MS - elapsed) / 1000) };
  if (lastDiByIp.size > 500) {
    for (const [k, t] of lastDiByIp) if (now - t > DI_COOLDOWN_MS) lastDiByIp.delete(k);
  }
  return { ok: true };
}

// The production AI proxy caps non-streaming output around ~350 tokens, so
// every AI call here is a small single-purpose call (classification, one
// narrative, one briefing section) — never one big generation.
async function aiCall(system: string, user: string, maxTokens: number): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return (completion.choices[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Intent catalog
// ---------------------------------------------------------------------------
type ChartType = "bar" | "pie" | "table" | "stat";
type ChartRow = Record<string, string | number>;
interface AggregateResult {
  chartType: ChartType;
  chartData: ChartRow[];
  chartMeta: { xKey: string; yKeys: string[]; valueLabel?: string };
}

const INTENTS: Record<string, { label: string; description: string }> = {
  ward_support: {
    label: "Support by Ward",
    description: "Voter/member support levels broken down by ward (strong, leaning, undecided, opposed counts per ward)",
  },
  turnout_forecast: {
    label: "Turnout Forecast",
    description: "Predicted voter turnout, predicted votes and predicted Mule votes per ward based on registered voters and assumptions",
  },
  gotv_priority: {
    label: "GOTV Priority",
    description: "Which wards have the biggest get-out-the-vote upside (untapped supporter votes), ranked",
  },
  registration: {
    label: "Registered Voters",
    description: "Registered voter counts per ward from the polling station register",
  },
  poll_results: {
    label: "Poll Results",
    description: "Results of the latest opinion poll (votes per option)",
  },
  sentiment: {
    label: "Social Sentiment",
    description: "Sentiment mix (positive/neutral/negative) of social media mentions",
  },
  fundraising: {
    label: "Fundraising",
    description: "Donation totals overall and by ward (KES)",
  },
  canvassing: {
    label: "Canvassing Progress",
    description: "Door-to-door canvassing progress: doors targeted vs completed per ward",
  },
  volunteers: {
    label: "Volunteers",
    description: "Volunteer counts by ward",
  },
  overview: {
    label: "Campaign Overview",
    description: "Headline campaign numbers: registered voters, members, poll responses, mentions, donations, volunteers",
  },
};

const SUGGESTED_QUESTIONS = [
  "How is our support distributed across the five wards?",
  "What does the turnout forecast look like ward by ward?",
  "Which wards should we prioritize for GOTV?",
  "How many registered voters are in each ward?",
  "What did the latest opinion poll say?",
  "What is the sentiment of our social media mentions?",
  "How much have we raised, and from which wards?",
  "How is door-to-door canvassing progressing?",
  "How many volunteers do we have per ward?",
  "Give me the headline campaign numbers.",
];

// ---------------------------------------------------------------------------
// Aggregate queries (deterministic — AI never touches raw data computation)
// ---------------------------------------------------------------------------
async function aggWardSupport(): Promise<AggregateResult> {
  const rows = await db
    .select({
      ward: sql<string>`COALESCE(${membersTable.ward}, 'Unknown')`,
      supportLevel: sql<string>`COALESCE(${membersTable.supportLevel}, 'unspecified')`,
      count: sql<number>`count(*)::int`,
    })
    .from(membersTable)
    .groupBy(sql`1`, sql`2`);
  const byWard = new Map<string, ChartRow>();
  const levels = new Set<string>();
  for (const r of rows) {
    levels.add(r.supportLevel);
    const row = byWard.get(r.ward) ?? { ward: r.ward };
    row[r.supportLevel] = r.count;
    byWard.set(r.ward, row);
  }
  const yKeys = [...levels].sort();
  const chartData = [...byWard.values()].map((row) => {
    for (const k of yKeys) if (!(k in row)) row[k] = 0;
    return row;
  });
  return { chartType: "bar", chartData, chartMeta: { xKey: "ward", yKeys, valueLabel: "Members" } };
}

interface WardForecast {
  ward: string;
  registered: number;
  turnoutRate: number;
  supportShare: number;
  predictedVotes: number;
  predictedMuleVotes: number;
  gotvUpside: number;
}

async function computeForecast(): Promise<WardForecast[]> {
  const stations = await db
    .select({
      ward: pollingStationsTable.ward,
      registered: sql<number>`sum(${pollingStationsTable.registeredVoters})::int`,
    })
    .from(pollingStationsTable)
    .groupBy(pollingStationsTable.ward);
  const assumptions = await db.select().from(turnoutAssumptionsTable);
  const assumptionByWard = new Map(assumptions.map((a) => [a.ward, a]));
  return stations.map((s) => {
    const a = assumptionByWard.get(s.ward);
    const turnoutRate = a?.expectedTurnoutRate ?? 65;
    const supportShare = a?.muleSupportShare ?? 50;
    const predictedVotes = Math.round((s.registered * turnoutRate) / 100);
    const predictedMuleVotes = Math.round((predictedVotes * supportShare) / 100);
    const gotvUpside = Math.round((s.registered * (supportShare / 100) * (1 - turnoutRate / 100)));
    return { ward: s.ward, registered: s.registered, turnoutRate, supportShare, predictedVotes, predictedMuleVotes, gotvUpside };
  });
}

async function aggTurnoutForecast(): Promise<AggregateResult> {
  const forecast = await computeForecast();
  const chartData: ChartRow[] = forecast.map((f) => ({
    ward: f.ward,
    registered: f.registered,
    predictedVotes: f.predictedVotes,
    predictedMuleVotes: f.predictedMuleVotes,
  }));
  return {
    chartType: "bar",
    chartData,
    chartMeta: { xKey: "ward", yKeys: ["registered", "predictedVotes", "predictedMuleVotes"], valueLabel: "Voters" },
  };
}

async function aggGotvPriority(): Promise<AggregateResult> {
  const forecast = await computeForecast();
  const chartData: ChartRow[] = forecast
    .sort((a, b) => b.gotvUpside - a.gotvUpside)
    .map((f, i) => ({
      rank: i + 1,
      ward: f.ward,
      gotvUpside: f.gotvUpside,
      turnoutRate: f.turnoutRate,
      supportShare: f.supportShare,
      registered: f.registered,
    }));
  return { chartType: "table", chartData, chartMeta: { xKey: "ward", yKeys: ["gotvUpside"], valueLabel: "GOTV upside (votes)" } };
}

async function aggRegistration(): Promise<AggregateResult> {
  const rows = await db
    .select({
      ward: pollingStationsTable.ward,
      registered: sql<number>`sum(${pollingStationsTable.registeredVoters})::int`,
      stations: sql<number>`count(*)::int`,
    })
    .from(pollingStationsTable)
    .groupBy(pollingStationsTable.ward);
  return {
    chartType: "bar",
    chartData: rows.map((r) => ({ ward: r.ward, registered: r.registered, stations: r.stations })),
    chartMeta: { xKey: "ward", yKeys: ["registered"], valueLabel: "Registered voters" },
  };
}

async function aggPollResults(): Promise<AggregateResult> {
  const [poll] = await db
    .select()
    .from(opinionPollsTable)
    .orderBy(desc(opinionPollsTable.createdAt))
    .limit(1);
  if (!poll) return { chartType: "pie", chartData: [], chartMeta: { xKey: "option", yKeys: ["votes"] } };
  const votes = await db
    .select({ optionIndex: pollVotesTable.optionIndex, count: sql<number>`count(*)::int` })
    .from(pollVotesTable)
    .where(eq(pollVotesTable.pollId, poll.id))
    .groupBy(pollVotesTable.optionIndex);
  const voteByIndex = new Map(votes.map((v) => [v.optionIndex, v.count]));
  const options = Array.isArray(poll.options) ? (poll.options as unknown[]) : [];
  const chartData: ChartRow[] = options.map((opt, i) => ({
    option: typeof opt === "string" ? opt : String((opt as Record<string, unknown>)?.["label"] ?? `Option ${i + 1}`),
    votes: voteByIndex.get(i) ?? 0,
  }));
  return { chartType: "pie", chartData, chartMeta: { xKey: "option", yKeys: ["votes"], valueLabel: poll.title } };
}

async function aggSentiment(): Promise<AggregateResult> {
  const rows = await db
    .select({ sentiment: socialMentionsTable.sentiment, count: sql<number>`count(*)::int` })
    .from(socialMentionsTable)
    .groupBy(socialMentionsTable.sentiment);
  return {
    chartType: "pie",
    chartData: rows.map((r) => ({ sentiment: r.sentiment, mentions: r.count })),
    chartMeta: { xKey: "sentiment", yKeys: ["mentions"], valueLabel: "Mentions" },
  };
}

async function aggFundraising(): Promise<AggregateResult> {
  const rows = await db
    .select({
      ward: sql<string>`COALESCE(${donationsTable.ward}, 'Unattributed')`,
      totalKes: sql<number>`sum(${donationsTable.amount})::int`,
      donations: sql<number>`count(*)::int`,
    })
    .from(donationsTable)
    .groupBy(sql`1`);
  return {
    chartType: "bar",
    chartData: rows.map((r) => ({ ward: r.ward, totalKes: r.totalKes, donations: r.donations })),
    chartMeta: { xKey: "ward", yKeys: ["totalKes"], valueLabel: "KES raised" },
  };
}

async function aggCanvassing(): Promise<AggregateResult> {
  const rows = await db
    .select({
      ward: canvassSessionsTable.ward,
      doorsTarget: sql<number>`sum(${canvassSessionsTable.doorsTarget})::int`,
      doorsCompleted: sql<number>`sum(${canvassSessionsTable.doorsCompleted})::int`,
      sessions: sql<number>`count(*)::int`,
    })
    .from(canvassSessionsTable)
    .groupBy(canvassSessionsTable.ward);
  return {
    chartType: "bar",
    chartData: rows.map((r) => ({ ward: r.ward, doorsTarget: r.doorsTarget, doorsCompleted: r.doorsCompleted, sessions: r.sessions })),
    chartMeta: { xKey: "ward", yKeys: ["doorsTarget", "doorsCompleted"], valueLabel: "Doors" },
  };
}

async function aggVolunteers(): Promise<AggregateResult> {
  const rows = await db
    .select({
      ward: sql<string>`COALESCE(${volunteersTable.ward}, 'Unassigned')`,
      count: sql<number>`count(*)::int`,
    })
    .from(volunteersTable)
    .groupBy(sql`1`);
  return {
    chartType: "bar",
    chartData: rows.map((r) => ({ ward: r.ward, volunteers: r.count })),
    chartMeta: { xKey: "ward", yKeys: ["volunteers"], valueLabel: "Volunteers" },
  };
}

async function computeHeadlineMetrics(): Promise<Record<string, number>> {
  const [reg] = await db
    .select({ voters: sql<number>`COALESCE(sum(${pollingStationsTable.registeredVoters}), 0)::int`, wards: sql<number>`count(distinct ${pollingStationsTable.ward})::int` })
    .from(pollingStationsTable);
  const [members] = await db.select({ count: sql<number>`count(*)::int` }).from(membersTable);
  const [pollVotes] = await db.select({ count: sql<number>`count(*)::int` }).from(pollVotesTable);
  const [insightResponses] = await db.select({ count: sql<number>`count(*)::int` }).from(insightResponsesTable);
  const [mentions] = await db
    .select({
      total: sql<number>`count(*)::int`,
      negative: sql<number>`count(*) FILTER (WHERE ${socialMentionsTable.sentiment} = 'negative')::int`,
    })
    .from(socialMentionsTable);
  const [donations] = await db.select({ totalKes: sql<number>`COALESCE(sum(${donationsTable.amount}), 0)::int`, count: sql<number>`count(*)::int` }).from(donationsTable);
  const [vols] = await db.select({ count: sql<number>`count(*)::int` }).from(volunteersTable);
  const [visits] = await db.select({ count: sql<number>`count(*)::int` }).from(canvassVisitsTable);
  const [doors] = await db.select({ completed: sql<number>`COALESCE(sum(${canvassSessionsTable.doorsCompleted}), 0)::int` }).from(canvassSessionsTable);
  const [tally] = await db.select({ votes: sql<number>`COALESCE(sum(${tallyResultsTable.votes}), 0)::int` }).from(tallyResultsTable);
  return {
    registeredVoters: reg?.voters ?? 0,
    wards: reg?.wards ?? 0,
    members: members?.count ?? 0,
    pollResponses: (pollVotes?.count ?? 0) + (insightResponses?.count ?? 0),
    socialMentions: mentions?.total ?? 0,
    negativeMentions: mentions?.negative ?? 0,
    donationsKes: donations?.totalKes ?? 0,
    donationCount: donations?.count ?? 0,
    volunteers: vols?.count ?? 0,
    canvassVisits: visits?.count ?? 0,
    doorsCompleted: doors?.completed ?? 0,
    tallyVotes: tally?.votes ?? 0,
  };
}

async function aggOverview(): Promise<AggregateResult> {
  const m = await computeHeadlineMetrics();
  const chartData: ChartRow[] = [
    { label: "Registered voters", value: m["registeredVoters"] ?? 0 },
    { label: "Members on file", value: m["members"] ?? 0 },
    { label: "Poll responses", value: m["pollResponses"] ?? 0 },
    { label: "Social mentions", value: m["socialMentions"] ?? 0 },
    { label: "Donations (KES)", value: m["donationsKes"] ?? 0 },
    { label: "Volunteers", value: m["volunteers"] ?? 0 },
  ];
  return { chartType: "stat", chartData, chartMeta: { xKey: "label", yKeys: ["value"] } };
}

const AGGREGATORS: Record<string, () => Promise<AggregateResult>> = {
  ward_support: aggWardSupport,
  turnout_forecast: aggTurnoutForecast,
  gotv_priority: aggGotvPriority,
  registration: aggRegistration,
  poll_results: aggPollResults,
  sentiment: aggSentiment,
  fundraising: aggFundraising,
  canvassing: aggCanvassing,
  volunteers: aggVolunteers,
  overview: aggOverview,
};

// ---------------------------------------------------------------------------
// Dataset engine — uploaded CSV/Excel datasets stored as jsonb rows. The AI
// only ever plans an analysis (which columns, which aggregation); the server
// executes it deterministically. AI never computes numbers.
// ---------------------------------------------------------------------------
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 40;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

type DataRow = Record<string, string | number>;

async function getDataset(id: number): Promise<DiDataset | null> {
  const [ds] = await db.select().from(diDatasetsTable).where(eq(diDatasetsTable.id, id)).limit(1);
  return ds ?? null;
}

async function getBuiltinDataset(): Promise<DiDataset | null> {
  const [ds] = await db.select().from(diDatasetsTable).where(eq(diDatasetsTable.sourceType, "builtin")).limit(1);
  return ds ?? null;
}

async function loadDatasetRows(datasetId: number): Promise<DataRow[]> {
  const rows = await db
    .select({ row: diDatasetRowsTable.row })
    .from(diDatasetRowsTable)
    .where(eq(diDatasetRowsTable.datasetId, datasetId))
    .limit(MAX_ROWS);
  return rows.map((r) => r.row as DataRow);
}

function parseSpreadsheet(buffer: Buffer, filename: string): { columns: DiColumnMeta[]; rows: DataRow[] } {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The file contains no sheets");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("The first sheet could not be read");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  if (raw.length === 0) throw new Error("The file has no data rows");

  const keys: string[] = [];
  for (const rec of raw.slice(0, 200)) {
    for (const k of Object.keys(rec)) {
      const key = k.trim();
      if (key && !key.startsWith("__EMPTY") && !keys.includes(key)) keys.push(key);
    }
  }
  if (keys.length === 0) throw new Error(`No usable columns found in ${filename}`);
  if (keys.length > MAX_COLUMNS) throw new Error(`Too many columns (${keys.length}); the limit is ${MAX_COLUMNS}`);

  const rows: DataRow[] = [];
  const numericCount: Record<string, number> = {};
  const presentCount: Record<string, number> = {};
  for (const rec of raw.slice(0, MAX_ROWS)) {
    const out: DataRow = {};
    let hasValue = false;
    for (const key of keys) {
      const found = Object.keys(rec).find((k) => k.trim() === key);
      const value = found !== undefined ? rec[found] : null;
      if (value === null || value === undefined || value === "") continue;
      hasValue = true;
      presentCount[key] = (presentCount[key] ?? 0) + 1;
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = value;
        numericCount[key] = (numericCount[key] ?? 0) + 1;
      } else {
        const str = String(value).trim();
        const asNumber = Number(str.replace(/,/g, ""));
        if (str !== "" && Number.isFinite(asNumber) && /^-?[\d,]+(\.\d+)?$/.test(str)) {
          out[key] = asNumber;
          numericCount[key] = (numericCount[key] ?? 0) + 1;
        } else {
          out[key] = str.slice(0, 500);
        }
      }
    }
    if (hasValue) rows.push(out);
  }
  if (rows.length === 0) throw new Error("No non-empty rows found");

  const columns: DiColumnMeta[] = keys.map((key) => {
    const present = presentCount[key] ?? 0;
    const numeric = numericCount[key] ?? 0;
    const type: DiColumnMeta["type"] = present > 0 && numeric / present >= 0.8 ? "number" : "text";
    return { key, label: key, type };
  });
  return { columns, rows };
}

const AGG_FNS = ["sum", "avg", "count", "min", "max"] as const;
type AggFn = (typeof AGG_FNS)[number];

interface AnalysisPlan {
  groupBy: string | null;
  metric: string | null;
  agg: AggFn;
  chartType: ChartType;
  limit: number;
}

function normalizePlan(raw: unknown, columns: DiColumnMeta[]): AnalysisPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const colByKey = new Map(columns.map((c) => [c.key.toLowerCase(), c]));
  const groupByCol = typeof p["groupBy"] === "string" ? colByKey.get((p["groupBy"] as string).toLowerCase()) : undefined;
  const metricCol = typeof p["metric"] === "string" ? colByKey.get((p["metric"] as string).toLowerCase()) : undefined;
  const agg = AGG_FNS.includes(p["agg"] as AggFn) ? (p["agg"] as AggFn) : metricCol ? "sum" : "count";
  if (agg !== "count" && (!metricCol || metricCol.type !== "number")) {
    if (!groupByCol) return null;
    return { groupBy: groupByCol.key, metric: null, agg: "count", chartType: coerceChartType(p["chartType"]), limit: coerceLimit(p["limit"]) };
  }
  if (!groupByCol && !metricCol) return null;
  return {
    groupBy: groupByCol?.key ?? null,
    metric: agg === "count" ? null : (metricCol?.key ?? null),
    agg,
    chartType: coerceChartType(p["chartType"]),
    limit: coerceLimit(p["limit"]),
  };
}

function coerceChartType(v: unknown): ChartType {
  return v === "bar" || v === "pie" || v === "table" || v === "stat" ? v : "bar";
}

function coerceLimit(v: unknown): number {
  const n = typeof v === "number" ? Math.floor(v) : 12;
  return Math.min(Math.max(Number.isFinite(n) ? n : 12, 1), 50);
}

function executePlan(rows: DataRow[], plan: AnalysisPlan): AggregateResult {
  const valueKey = plan.agg === "count" ? "count" : `${plan.agg}_${plan.metric}`;
  if (!plan.groupBy) {
    const values = plan.metric ? rows.map((r) => Number(r[plan.metric as string])).filter((v) => Number.isFinite(v)) : [];
    let value = 0;
    if (plan.agg === "count") value = rows.length;
    else if (values.length > 0) {
      if (plan.agg === "sum") value = values.reduce((a, b) => a + b, 0);
      else if (plan.agg === "avg") value = values.reduce((a, b) => a + b, 0) / values.length;
      else if (plan.agg === "min") value = Math.min(...values);
      else value = Math.max(...values);
    }
    const label = plan.agg === "count" ? "Records" : `${plan.agg} of ${plan.metric}`;
    return {
      chartType: "stat",
      chartData: [{ label, value: roundTo(value) }],
      chartMeta: { xKey: "label", yKeys: ["value"], valueLabel: label },
    };
  }
  const groups = new Map<string, { sum: number; count: number; numericCount: number; min: number; max: number }>();
  for (const row of rows) {
    const groupValue = row[plan.groupBy];
    const group = groupValue === undefined || groupValue === null || groupValue === "" ? "(blank)" : String(groupValue).slice(0, 80);
    const entry = groups.get(group) ?? { sum: 0, count: 0, numericCount: 0, min: Infinity, max: -Infinity };
    entry.count += 1;
    if (plan.metric) {
      const v = Number(row[plan.metric]);
      if (Number.isFinite(v)) {
        entry.sum += v;
        entry.numericCount += 1;
        entry.min = Math.min(entry.min, v);
        entry.max = Math.max(entry.max, v);
      }
    }
    groups.set(group, entry);
  }
  const chartData: ChartRow[] = [...groups.entries()]
    .map(([group, s]) => {
      let value = s.count;
      if (plan.agg === "sum") value = s.sum;
      else if (plan.agg === "avg") value = s.numericCount > 0 ? s.sum / s.numericCount : 0;
      else if (plan.agg === "min") value = Number.isFinite(s.min) ? s.min : 0;
      else if (plan.agg === "max") value = Number.isFinite(s.max) ? s.max : 0;
      return { [plan.groupBy as string]: group, [valueKey]: roundTo(value) } as ChartRow;
    })
    .sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]))
    .slice(0, plan.limit);
  const chartType = plan.chartType === "stat" ? "bar" : plan.chartType;
  return {
    chartType: chartType === "pie" && chartData.length > 8 ? "bar" : chartType,
    chartData,
    chartMeta: { xKey: plan.groupBy, yKeys: [valueKey], valueLabel: valueKey },
  };
}

function roundTo(v: number): number {
  return Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
}

function datasetContext(ds: DiDataset): string {
  return `You are the decision-intelligence analyst for the "${ds.name}" dataset (sector: ${ds.sector}).${ds.description ? ` Dataset description: ${ds.description}` : ""} Ground every claim in the provided data — never invent numbers.`;
}

function profileDataset(columns: DiColumnMeta[], rows: DataRow[]): Record<string, unknown> {
  const numericProfiles: Record<string, unknown> = {};
  const categoryProfiles: Record<string, unknown> = {};
  let textProfiled = 0;
  for (const col of columns) {
    if (col.type === "number") {
      const values = rows.map((r) => Number(r[col.key])).filter((v) => Number.isFinite(v));
      if (values.length === 0) continue;
      const sum = values.reduce((a, b) => a + b, 0);
      numericProfiles[col.key] = {
        sum: roundTo(sum),
        avg: roundTo(sum / values.length),
        min: roundTo(Math.min(...values)),
        max: roundTo(Math.max(...values)),
      };
    } else if (textProfiled < 4) {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const v = r[col.key];
        if (v === undefined || v === null || v === "") continue;
        const s = String(v).slice(0, 60);
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const distinct = counts.size;
      if (distinct > 0 && distinct <= 200) {
        categoryProfiles[col.key] = {
          distinct,
          top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => ({ value: v, count: n })),
        };
        textProfiled += 1;
      }
    }
  }
  return { rowCount: rows.length, numeric: numericProfiles, categories: categoryProfiles };
}

function datasetSuggestions(ds: DiDataset): string[] {
  const columns = (ds.columns ?? []) as DiColumnMeta[];
  const numeric = columns.filter((c) => c.type === "number").slice(0, 3);
  const text = columns.filter((c) => c.type === "text").slice(0, 3);
  const suggestions: string[] = [];
  for (const n of numeric) {
    for (const t of text) {
      suggestions.push(`What is the total ${n.label} by ${t.label}?`);
      if (suggestions.length >= 4) break;
    }
    if (suggestions.length >= 4) break;
  }
  if (numeric[0]) suggestions.push(`What is the average ${numeric[0].label}?`);
  if (text[0]) suggestions.push(`How many records are there per ${text[0].label}?`);
  suggestions.push("Give me an overview of this dataset.");
  return suggestions.slice(0, 8);
}

function computeDatasetMetrics(columns: DiColumnMeta[], rows: DataRow[]): Record<string, number> {
  const metrics: Record<string, number> = { rowCount: rows.length };
  for (const col of columns) {
    if (col.type !== "number") continue;
    const values = rows.map((r) => Number(r[col.key])).filter((v) => Number.isFinite(v));
    if (values.length === 0) continue;
    const sum = values.reduce((a, b) => a + b, 0);
    metrics[`sum_${col.key}`] = clampInt(Math.round(sum));
  }
  return metrics;
}

function clampInt(v: number): number {
  return Math.max(Math.min(v, 2_147_483_647), -2_147_483_648);
}

function datasetChangeLabel(metric: string, columns: DiColumnMeta[]): string {
  if (metric === "rowCount") return "Records";
  const key = metric.replace(/^sum_/, "");
  const col = columns.find((c) => c.key === key);
  return col ? `Total ${col.label}` : metric;
}

// ---------------------------------------------------------------------------
// Shared serializers
// ---------------------------------------------------------------------------
function serializeQuestion(row: typeof diQuestionsTable.$inferSelect, suggestions?: string[]) {
  if (row.status === "unsupported") {
    return {
      id: row.id,
      datasetId: row.datasetId,
      question: row.question,
      status: "unsupported" as const,
      message: row.message ?? "That question is outside the current data catalog.",
      suggestions: (suggestions ?? SUGGESTED_QUESTIONS).slice(0, 4),
      createdAt: row.createdAt.toISOString(),
    };
  }
  return {
    id: row.id,
    datasetId: row.datasetId,
    question: row.question,
    status: "answered" as const,
    intent: row.intent ?? "",
    intentLabel: row.intentLabel ?? "",
    chartType: (row.chartType ?? "table") as ChartType,
    chartData: (row.chartData ?? []) as ChartRow[],
    chartMeta: (row.chartMeta ?? { xKey: "label", yKeys: ["value"] }) as AggregateResult["chartMeta"],
    explanation: row.explanation ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeDataset(ds: DiDataset) {
  return {
    id: ds.id,
    name: ds.name,
    sector: ds.sector,
    description: ds.description,
    sourceType: ds.sourceType as "builtin" | "upload",
    columns: (ds.columns ?? []) as DiColumnMeta[],
    rowCount: ds.rowCount,
    createdAt: ds.createdAt.toISOString(),
  };
}

async function resolveDataset(rawId: unknown): Promise<DiDataset | null> {
  const id = Number(rawId);
  if (Number.isInteger(id) && id > 0) return getDataset(id);
  return getBuiltinDataset();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
router.get("/overview", async (req, res) => {
  try {
    const [datasets] = await db.select({ count: sql<number>`count(*)::int`, rows: sql<number>`COALESCE(sum(${diDatasetsTable.rowCount}), 0)::int` }).from(diDatasetsTable);
    const [questions] = await db.select({ count: sql<number>`count(*)::int` }).from(diQuestionsTable);
    const [briefings] = await db.select({ count: sql<number>`count(*)::int` }).from(diBriefingsTable);
    const [snap] = await db.select().from(diSnapshotsTable).orderBy(desc(diSnapshotsTable.createdAt)).limit(1);
    res.json({
      datasets: datasets?.count ?? 0,
      datasetRows: datasets?.rows ?? 0,
      questionsAnswered: questions?.count ?? 0,
      briefings: briefings?.count ?? 0,
      lastSnapshotAt: snap ? snap.createdAt.toISOString() : null,
    });
  } catch (err) {
    req.log.error({ err }, "di overview failed");
    res.status(500).json({ error: "Failed to load overview" });
  }
});

router.get("/suggestions", async (req, res) => {
  try {
    const ds = await resolveDataset(req.query["datasetId"]);
    if (!ds || ds.sourceType === "builtin") {
      res.json({ suggestions: SUGGESTED_QUESTIONS });
      return;
    }
    res.json({ suggestions: datasetSuggestions(ds) });
  } catch (err) {
    req.log.error({ err }, "di suggestions failed");
    res.status(500).json({ error: "Failed to load suggestions" });
  }
});

// ---------------------------------------------------------------------------
// Datasets — CRUD + CSV/Excel upload
// ---------------------------------------------------------------------------
router.get("/datasets", async (req, res) => {
  try {
    const rows = await db.select().from(diDatasetsTable).orderBy(desc(diDatasetsTable.createdAt));
    rows.sort((a, b) => (a.sourceType === "builtin" ? -1 : b.sourceType === "builtin" ? 1 : 0));
    res.json(rows.map(serializeDataset));
  } catch (err) {
    req.log.error({ err }, "di datasets list failed");
    res.status(500).json({ error: "Failed to load datasets" });
  }
});

const uploadMetaSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sector: z.string().trim().min(2).max(80).default("General"),
  description: z.string().trim().max(500).optional(),
});

router.post("/datasets/upload", upload.single("file"), async (req, res) => {
  const parsed = uploadMetaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a dataset name (2-120 chars) and sector." });
    return;
  }
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Attach a CSV or Excel file as 'file'." });
    return;
  }
  const okName = /\.(csv|xlsx|xls)$/i.test(file.originalname);
  if (!okName) {
    res.status(400).json({ error: "Only .csv, .xlsx and .xls files are supported." });
    return;
  }
  try {
    const { columns, rows } = parseSpreadsheet(file.buffer, file.originalname);
    const [ds] = await db
      .insert(diDatasetsTable)
      .values({
        name: parsed.data.name,
        sector: parsed.data.sector,
        description: parsed.data.description ?? null,
        sourceType: "upload",
        columns,
        rowCount: rows.length,
      })
      .returning();
    if (!ds) throw new Error("failed to persist dataset");
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(diDatasetRowsTable).values(rows.slice(i, i + 500).map((row) => ({ datasetId: ds.id, row })));
    }
    res.status(201).json(serializeDataset(ds));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse the file";
    req.log.error({ err }, "di dataset upload failed");
    res.status(400).json({ error: message });
  }
});

router.get("/datasets/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const ds = await getDataset(id);
    if (!ds) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }
    const preview =
      ds.sourceType === "upload"
        ? (await db.select({ row: diDatasetRowsTable.row }).from(diDatasetRowsTable).where(eq(diDatasetRowsTable.datasetId, id)).limit(50)).map((r) => r.row)
        : [];
    res.json({ ...serializeDataset(ds), preview });
  } catch (err) {
    req.log.error({ err }, "di dataset detail failed");
    res.status(500).json({ error: "Failed to load dataset" });
  }
});

router.delete("/datasets/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const ds = await getDataset(id);
    if (!ds) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }
    if (ds.sourceType === "builtin") {
      res.status(400).json({ error: "The built-in dataset cannot be deleted." });
      return;
    }
    await db.delete(diDatasetRowsTable).where(eq(diDatasetRowsTable.datasetId, id));
    await db.delete(diQuestionsTable).where(eq(diQuestionsTable.datasetId, id));
    await db.delete(diBriefingsTable).where(eq(diBriefingsTable.datasetId, id));
    await db.delete(diChangesTable).where(eq(diChangesTable.datasetId, id));
    await db.delete(diSnapshotsTable).where(eq(diSnapshotsTable.datasetId, id));
    await db.delete(diDatasetsTable).where(eq(diDatasetsTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "di dataset delete failed");
    res.status(500).json({ error: "Failed to delete dataset" });
  }
});

const askSchema = z.object({
  question: z.string().trim().min(3).max(400),
  datasetId: z.number().int().positive().optional(),
});

router.post("/ask", async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a question (3-400 characters)." });
    return;
  }
  const limit = checkDiRateLimit(req.ip ?? "unknown");
  if (!limit.ok) {
    res.status(429).json({ error: `Another analysis is in progress or cooling down. Try again in ~${limit.retryAfter}s.` });
    return;
  }
  diInFlight = true;
  try {
    const question = parsed.data.question;
    const ds = await resolveDataset(parsed.data.datasetId);
    if (!ds) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }

    if (ds.sourceType === "builtin") {
      const catalog = Object.entries(INTENTS)
        .map(([key, v]) => `- ${key}: ${v.description}`)
        .join("\n");
      const classification = await aiCall(
        `You classify campaign data questions into exactly one intent from a fixed catalog. Catalog:\n${catalog}\n\nRespond ONLY with JSON: {"intent":"<intent_key>"} — use {"intent":"unsupported"} if no catalog entry can answer the question.`,
        `Question: ${question}`,
        100,
      );
      const parsedIntent = extractJson(classification) as { intent?: string } | null;
      const intent = parsedIntent?.intent ?? "";

      if (!intent || !AGGREGATORS[intent]) {
        const [saved] = await db
          .insert(diQuestionsTable)
          .values({
            datasetId: ds.id,
            question,
            status: "unsupported",
            message:
              "I can't answer that from the campaign data catalog yet. I can analyze ward support, turnout forecasts, GOTV priorities, voter registration, poll results, social sentiment, fundraising, canvassing and volunteers.",
          })
          .returning();
        if (!saved) throw new Error("failed to persist question");
        res.json(serializeQuestion(saved));
        return;
      }

      const aggregate = await AGGREGATORS[intent]();
      const intentMeta = INTENTS[intent];
      const dataDigest = JSON.stringify(aggregate.chartData).slice(0, 2500);
      const explanation = await aiCall(
        `${CAMPAIGN_CONTEXT}\n\nYou are the decision-intelligence analyst. Given a question and the exact aggregated data that answers it, write a sharp 2-4 sentence strategic narrative: what the data says and what the campaign should do about it. Plain prose, no markdown, no lists, no emojis. Never invent numbers not present in the data.`,
        `Question: ${question}\nIntent: ${intentMeta?.label ?? intent}\nAggregated data (JSON): ${dataDigest}`,
        350,
      );
      if (!explanation) {
        res.status(502).json({ error: "The AI analyst did not return a narrative. Please try again." });
        return;
      }

      const [saved] = await db
        .insert(diQuestionsTable)
        .values({
          datasetId: ds.id,
          question,
          status: "answered",
          intent,
          intentLabel: intentMeta?.label ?? intent,
          chartType: aggregate.chartType,
          chartData: aggregate.chartData,
          chartMeta: aggregate.chartMeta,
          explanation,
        })
        .returning();
      if (!saved) throw new Error("failed to persist answer");
      res.json(serializeQuestion(saved));
      return;
    }

    // Uploaded dataset: AI plans the analysis, the server executes it.
    const columns = (ds.columns ?? []) as DiColumnMeta[];
    const rows = await loadDatasetRows(ds.id);
    if (rows.length === 0 || columns.length === 0) {
      res.status(400).json({ error: "This dataset has no rows to analyze." });
      return;
    }
    const sample = rows.slice(0, 3);
    const columnCatalog = columns
      .map((c) => `- "${c.key}" (${c.type}), examples: ${sample.map((r) => JSON.stringify(r[c.key] ?? null)).join(", ")}`)
      .join("\n");
    const planText = await aiCall(
      `You plan a single aggregation over a tabular dataset to answer a question. Available columns:\n${columnCatalog}\n\nRespond ONLY with JSON: {"groupBy":"<text column key or null>","metric":"<number column key or null>","agg":"sum|avg|count|min|max","chartType":"bar|pie|table|stat"}. Use agg "count" with a groupBy to count records per group. Use groupBy null for a single overall number. If the question cannot be answered from these columns, respond {"unsupported":true}.`,
      `Question: ${question}`,
      150,
    );
    const rawPlan = extractJson(planText) as Record<string, unknown> | null;
    const plan = rawPlan && rawPlan["unsupported"] !== true ? normalizePlan(rawPlan, columns) : null;

    if (!plan) {
      const [saved] = await db
        .insert(diQuestionsTable)
        .values({
          datasetId: ds.id,
          question,
          status: "unsupported",
          message: `I can't answer that from the "${ds.name}" dataset. Try asking about the columns it actually contains: ${columns.map((c) => c.label).slice(0, 8).join(", ")}.`,
        })
        .returning();
      if (!saved) throw new Error("failed to persist question");
      res.json(serializeQuestion(saved, datasetSuggestions(ds)));
      return;
    }

    const aggregate = executePlan(rows, plan);
    const dataDigest = JSON.stringify(aggregate.chartData).slice(0, 2500);
    const explanation = await aiCall(
      `${datasetContext(ds)}\n\nGiven a question and the exact aggregated data that answers it, write a sharp 2-4 sentence narrative: what the data says and what the decision-maker should do about it. Plain prose, no markdown, no lists, no emojis.`,
      `Question: ${question}\nAggregation: ${plan.agg}${plan.metric ? ` of ${plan.metric}` : ""}${plan.groupBy ? ` grouped by ${plan.groupBy}` : ""}\nAggregated data (JSON): ${dataDigest}`,
      350,
    );
    if (!explanation) {
      res.status(502).json({ error: "The AI analyst did not return a narrative. Please try again." });
      return;
    }

    const intentLabel = plan.groupBy
      ? `${plan.agg === "count" ? "Count" : `${plan.agg} of ${plan.metric}`} by ${plan.groupBy}`
      : plan.agg === "count"
        ? "Record count"
        : `${plan.agg} of ${plan.metric}`;
    const [saved] = await db
      .insert(diQuestionsTable)
      .values({
        datasetId: ds.id,
        question,
        status: "answered",
        intent: "dataset_analysis",
        intentLabel,
        chartType: aggregate.chartType,
        chartData: aggregate.chartData,
        chartMeta: aggregate.chartMeta,
        explanation,
      })
      .returning();
    if (!saved) throw new Error("failed to persist answer");
    res.json(serializeQuestion(saved));
  } catch (err) {
    req.log.error({ err }, "di ask failed");
    res.status(500).json({ error: "Failed to analyze the question" });
  } finally {
    diInFlight = false;
    lastDiByIp.set(req.ip ?? "unknown", Date.now());
  }
});

router.get("/ask/history", async (req, res) => {
  try {
    const datasetId = Number(req.query["datasetId"]);
    const rows = await db
      .select()
      .from(diQuestionsTable)
      .where(Number.isInteger(datasetId) && datasetId > 0 ? eq(diQuestionsTable.datasetId, datasetId) : undefined)
      .orderBy(desc(diQuestionsTable.createdAt))
      .limit(30);
    res.json(rows.map((r) => serializeQuestion(r)));
  } catch (err) {
    req.log.error({ err }, "di history failed");
    res.status(500).json({ error: "Failed to load history" });
  }
});

router.delete("/ask/history/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db.delete(diQuestionsTable).where(eq(diQuestionsTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "di history delete failed");
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ---------------------------------------------------------------------------
// Briefings — 5 sections generated in parallel (each under the ~350-token
// prod proxy ceiling), assembled server-side. Any empty section → 502.
// ---------------------------------------------------------------------------
const BRIEFING_SECTIONS: Array<{ key: string; title: string; instruction: string }> = [
  { key: "headline", title: "Headline Summary", instruction: "Write a 3-4 sentence executive summary of the campaign's current position using the data digest. Lead with the single most important number." },
  { key: "polling", title: "Polling Pulse", instruction: "Analyze the opinion poll and public feedback signals in 3-4 sentences. What is voter mood telling us?" },
  { key: "turnout", title: "Turnout & GOTV Outlook", instruction: "Analyze the ward turnout forecast and GOTV upside in 3-4 sentences. Name the wards that matter most." },
  { key: "social", title: "Social & Narrative Watch", instruction: "Analyze social mention volume and sentiment in 3-4 sentences. Flag narrative risks." },
  { key: "actions", title: "Recommended Actions", instruction: "Give exactly 4 concrete, prioritized action recommendations as short sentences separated by newlines. No numbering, no bullets, no markdown." },
];

const GENERIC_BRIEFING_SECTIONS: Array<{ key: string; title: string; instruction: string }> = [
  { key: "headline", title: "Headline Summary", instruction: "Write a 3-4 sentence executive summary of what this dataset shows overall. Lead with the single most important number from the profile." },
  { key: "composition", title: "Composition & Segments", instruction: "Analyze the categorical breakdowns (top values per category) in 3-4 sentences. Which segments dominate and which are underrepresented?" },
  { key: "metrics", title: "Key Metric Analysis", instruction: "Analyze the numeric columns (totals, averages, ranges) in 3-4 sentences. Call out the most decision-relevant figures." },
  { key: "risks", title: "Risks & Data Gaps", instruction: "In 3-4 sentences, flag outliers, extreme ranges, skewed segments or data-quality gaps a decision-maker should be careful about." },
  { key: "actions", title: "Recommended Actions", instruction: "Give exactly 4 concrete, prioritized action recommendations as short sentences separated by newlines. No numbering, no bullets, no markdown." },
];

const briefingSchema = z.object({ datasetId: z.number().int().positive().optional() });

router.post("/briefings/generate", async (req, res) => {
  const parsedBody = briefingSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: "Invalid datasetId" });
    return;
  }
  const limit = checkDiRateLimit(req.ip ?? "unknown");
  if (!limit.ok) {
    res.status(429).json({ error: `Another generation is in progress or cooling down. Try again in ~${limit.retryAfter}s.` });
    return;
  }
  diInFlight = true;
  try {
    const ds = await resolveDataset(parsedBody.data.datasetId);
    if (!ds) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }

    let digest: string;
    let system: string;
    let sectionDefs: typeof BRIEFING_SECTIONS;
    if (ds.sourceType === "builtin") {
      const [metrics, forecast, sentimentAgg, pollAgg] = await Promise.all([
        computeHeadlineMetrics(),
        computeForecast(),
        aggSentiment(),
        aggPollResults(),
      ]);
      digest = JSON.stringify({
        headline: metrics,
        turnoutForecast: forecast,
        sentiment: sentimentAgg.chartData,
        latestPoll: { title: pollAgg.chartMeta.valueLabel ?? null, results: pollAgg.chartData },
      }).slice(0, 3000);
      system = `${CAMPAIGN_CONTEXT}\n\nYou write one section of a daily intelligence briefing for the campaign leadership. Ground every claim in the provided data digest — never invent numbers. Plain prose only: no markdown, no headings, no emojis.`;
      sectionDefs = BRIEFING_SECTIONS;
    } else {
      const columns = (ds.columns ?? []) as DiColumnMeta[];
      const rows = await loadDatasetRows(ds.id);
      if (rows.length === 0) {
        res.status(400).json({ error: "This dataset has no rows to brief on." });
        return;
      }
      digest = JSON.stringify(profileDataset(columns, rows)).slice(0, 3000);
      system = `${datasetContext(ds)}\n\nYou write one section of an intelligence briefing about this dataset for a decision-maker in the ${ds.sector} sector. Ground every claim in the provided data profile — never invent numbers. Plain prose only: no markdown, no headings, no emojis.`;
      sectionDefs = GENERIC_BRIEFING_SECTIONS;
    }

    const sections = await Promise.all(
      sectionDefs.map(async (s) => ({
        key: s.key,
        title: s.title,
        content: await aiCall(system, `${s.instruction}\n\nData digest (JSON): ${digest}`, 350),
      })),
    );
    if (sections.some((s) => !s.content)) {
      res.status(502).json({ error: "One or more briefing sections failed to generate. Please try again." });
      return;
    }

    const title = `${ds.sourceType === "builtin" ? "Intelligence Briefing" : `${ds.name} Briefing`} — ${new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}`;
    const [saved] = await db.insert(diBriefingsTable).values({ datasetId: ds.id, title, sections }).returning();
    if (!saved) throw new Error("failed to persist briefing");
    res.json({ id: saved.id, datasetId: saved.datasetId, title: saved.title, sections: saved.sections, createdAt: saved.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "di briefing failed");
    res.status(500).json({ error: "Failed to generate briefing" });
  } finally {
    diInFlight = false;
    lastDiByIp.set(req.ip ?? "unknown", Date.now());
  }
});

router.get("/briefings", async (req, res) => {
  try {
    const datasetId = Number(req.query["datasetId"]);
    const rows = await db
      .select()
      .from(diBriefingsTable)
      .where(Number.isInteger(datasetId) && datasetId > 0 ? eq(diBriefingsTable.datasetId, datasetId) : undefined)
      .orderBy(desc(diBriefingsTable.createdAt));
    res.json(rows.map((r) => ({ id: r.id, datasetId: r.datasetId, title: r.title, sections: r.sections, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "di briefings list failed");
    res.status(500).json({ error: "Failed to load briefings" });
  }
});

router.delete("/briefings/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db.delete(diBriefingsTable).where(eq(diBriefingsTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "di briefing delete failed");
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ---------------------------------------------------------------------------
// What Changed — snapshot diffing over headline metrics with AI one-liners.
// ---------------------------------------------------------------------------
const CHANGE_LABELS: Record<string, string> = {
  registeredVoters: "Registered voters",
  members: "Members on file",
  pollResponses: "Poll responses",
  socialMentions: "Social mentions",
  negativeMentions: "Negative mentions",
  donationsKes: "Donations (KES)",
  donationCount: "Donation count",
  volunteers: "Volunteers",
  canvassVisits: "Canvass visits",
  doorsCompleted: "Doors knocked",
  tallyVotes: "Tally votes reported",
};

function severityFor(metric: string, previous: number, delta: number): "high" | "medium" | "low" {
  const magnitude = Math.abs(delta);
  const relative = previous > 0 ? magnitude / previous : 1;
  if (metric === "negativeMentions" && delta > 0) return magnitude >= 5 || relative >= 0.5 ? "high" : "medium";
  if (relative >= 0.2 || (metric === "donationsKes" && magnitude >= 100_000)) return "high";
  if (relative >= 0.05) return "medium";
  return "low";
}

const scanSchema = z.object({ datasetId: z.number().int().positive().optional() });

router.post("/changes/scan", async (req, res) => {
  const parsedBody = scanSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: "Invalid datasetId" });
    return;
  }
  const limit = checkDiRateLimit(req.ip ?? "unknown");
  if (!limit.ok) {
    res.status(429).json({ error: `Another scan is in progress or cooling down. Try again in ~${limit.retryAfter}s.` });
    return;
  }
  diInFlight = true;
  try {
    const ds = await resolveDataset(parsedBody.data.datasetId);
    if (!ds) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }

    let current: Record<string, number>;
    let labelFor: (metric: string) => string;
    let aiContext: string;
    if (ds.sourceType === "builtin") {
      current = await computeHeadlineMetrics();
      labelFor = (metric) => CHANGE_LABELS[metric] ?? metric;
      aiContext = `${CAMPAIGN_CONTEXT}\n\nYou annotate detected data changes for a campaign war room.`;
    } else {
      const columns = (ds.columns ?? []) as DiColumnMeta[];
      const rows = await loadDatasetRows(ds.id);
      current = computeDatasetMetrics(columns, rows);
      labelFor = (metric) => datasetChangeLabel(metric, columns);
      aiContext = `${datasetContext(ds)}\n\nYou annotate detected data changes in this dataset for a decision-maker.`;
    }

    const [previousSnap] = await db
      .select()
      .from(diSnapshotsTable)
      .where(eq(diSnapshotsTable.datasetId, ds.id))
      .orderBy(desc(diSnapshotsTable.createdAt))
      .limit(1);

    const diffs: Array<{ metric: string; label: string; previous: number; current: number; delta: number; severity: "high" | "medium" | "low" }> = [];
    if (previousSnap) {
      const prev = (previousSnap.metrics ?? {}) as Record<string, number>;
      const metricKeys = new Set([...Object.keys(prev), ...Object.keys(current)]);
      for (const metric of metricKeys) {
        const before = prev[metric] ?? 0;
        const now = current[metric] ?? 0;
        const delta = now - before;
        if (delta !== 0) diffs.push({ metric, label: labelFor(metric), previous: before, current: now, delta, severity: severityFor(metric, before, delta) });
      }
    }

    const noNewData = !previousSnap || diffs.length === 0;
    const [snap] = await db.insert(diSnapshotsTable).values({ datasetId: ds.id, metrics: current, noNewData }).returning();
    if (!snap) throw new Error("failed to persist snapshot");

    let explanations: Record<string, string> = {};
    if (diffs.length > 0) {
      const raw = await aiCall(
        `${aiContext} For each change, write ONE short sentence (max 20 words) on what it means strategically. Respond ONLY with JSON: {"<metric>":"<sentence>", ...}. No markdown.`,
        `Changes since last snapshot: ${JSON.stringify(diffs.map((d) => ({ metric: d.metric, label: d.label, previous: d.previous, current: d.current, delta: d.delta })))}`,
        350,
      );
      const parsedExpl = extractJson(raw);
      if (parsedExpl && typeof parsedExpl === "object") explanations = parsedExpl as Record<string, string>;
    }

    const inserted =
      diffs.length > 0
        ? await db
            .insert(diChangesTable)
            .values(
              diffs.map((d) => ({
                snapshotId: snap.id,
                datasetId: ds.id,
                metric: d.metric,
                label: d.label,
                previous: d.previous,
                current: d.current,
                delta: d.delta,
                severity: d.severity,
                explanation:
                  explanations[d.metric]?.trim() ||
                  `${d.label} moved from ${d.previous.toLocaleString()} to ${d.current.toLocaleString()} (${d.delta > 0 ? "+" : ""}${d.delta.toLocaleString()}).`,
              })),
            )
            .returning()
        : [];

    res.json({
      snapshotId: snap.id,
      datasetId: ds.id,
      noNewData,
      createdAt: snap.createdAt.toISOString(),
      changes: inserted.map((c) => ({
        id: c.id,
        metric: c.metric,
        label: c.label,
        previous: c.previous,
        current: c.current,
        delta: c.delta,
        severity: c.severity,
        explanation: c.explanation,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "di change scan failed");
    res.status(500).json({ error: "Failed to run change scan" });
  } finally {
    diInFlight = false;
    lastDiByIp.set(req.ip ?? "unknown", Date.now());
  }
});

router.get("/changes", async (req, res) => {
  try {
    const datasetId = Number(req.query["datasetId"]);
    const datasetFilter = Number.isInteger(datasetId) && datasetId > 0 ? datasetId : null;
    const snaps = await db
      .select()
      .from(diSnapshotsTable)
      .where(datasetFilter ? eq(diSnapshotsTable.datasetId, datasetFilter) : undefined)
      .orderBy(desc(diSnapshotsTable.createdAt))
      .limit(20);
    const changes = await db
      .select()
      .from(diChangesTable)
      .where(datasetFilter ? eq(diChangesTable.datasetId, datasetFilter) : undefined)
      .orderBy(desc(diChangesTable.createdAt))
      .limit(200);
    const bySnapshot = new Map<number, typeof changes>();
    for (const c of changes) {
      const list = bySnapshot.get(c.snapshotId) ?? [];
      list.push(c);
      bySnapshot.set(c.snapshotId, list);
    }
    res.json({
      lastSnapshotAt: snaps[0] ? snaps[0].createdAt.toISOString() : null,
      scans: snaps.map((s) => ({
        snapshotId: s.id,
        noNewData: s.noNewData,
        createdAt: s.createdAt.toISOString(),
        changes: (bySnapshot.get(s.id) ?? []).map((c) => ({
          id: c.id,
          metric: c.metric,
          label: c.label,
          previous: c.previous,
          current: c.current,
          delta: c.delta,
          severity: c.severity,
          explanation: c.explanation,
          createdAt: c.createdAt.toISOString(),
        })),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "di changes list failed");
    res.status(500).json({ error: "Failed to load changes" });
  }
});

export default router;
