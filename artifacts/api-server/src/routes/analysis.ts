import { Router } from "express";
import { db, campaignWards, currentCampaignProfile } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { KAITI_REGISTERED_VOTERS_2022, KAITI_REGISTER_SOURCE, KAITI_FACTS, MAKUENI_2022_PRESIDENTIAL } from "../data/kaiti-facts";

/**
 * Path to victory: ward-by-ward win arithmetic built only from data the
 * campaign holds (official registers, imported past results, its own polls,
 * canvass returns, volunteers and events). Every number says where it came
 * from; missing data is reported as missing, never estimated silently.
 * All queries run inside the active campaign (row-level security).
 */
const router = Router();

async function rows<T = Record<string, unknown>>(q: SQL): Promise<T[]> {
  try { return (await db.execute(q)).rows as T[]; } catch { return []; }
}
const norm = (s: string) => s.toLowerCase().replace(/^(hon\.?|dr\.?|eng\.?|mr\.?|mrs\.?|ms\.?|prof\.?)\s+/, "").replace(/[^a-z ]/g, "").trim();
const sameWard = (a: string | null | undefined, b: string) => !!a && a.trim().toLowerCase() === b.toLowerCase();
const pct = (n: number) => Math.round(n * 1000) / 10;

type WardOut = {
  ward: string;
  registered: number | null; registeredSource: string | null;
  stations: number;
  lastElection: { year: number; seat: string; totalVotes: number; turnoutPct: number | null; winner: string; winnerShare: number; ourShare: number | null; candidates: { name: string; party: string | null; votes: number; share: number }[] } | null;
  poll: { responses: number; ourShare: number; leader: string; leaderShare: number; undecidedShare: number } | null;
  canvass: { contacts: number; supportShare: number; undecidedShare: number; opposedShare: number } | null;
  volunteers: number; events90d: number;
  expectedTurnoutPct: number; projectedVotes: number | null;
  targetShare: number; estimatedShare: number | null; estimateSource: string | null;
  votesToGain: number | null;
  contactsPer1000: number | null;
  status: "stronghold" | "lean" | "battleground" | "behind" | "no-data";
  priority: number;
  actions: string[];
};

export async function computeWinAnalysis() {
  const profile = currentCampaignProfile();
  const wards = campaignWards();
  const candidate = (profile?.candidateName ?? (profile && !profile.isPrimary ? "the candidate" : "the candidate"));
  const ourKey = norm(candidate).split(" ").slice(-1)[0] ?? "";
  const isOurs = (name: string) => !!ourKey && norm(name).includes(ourKey);
  const seat = (profile?.seat ?? "MP").toUpperCase();
  const isKaiti = (profile?.constituency ?? "").toLowerCase() === "kaiti";

  // ── Registers and stations ────────────────────────────────────────────────
  const stations = await rows<{ ward: string; n: number; registered: number }>(sql`
    SELECT ward, count(*)::int AS n, COALESCE(sum(registered_voters),0)::int AS registered FROM polling_stations GROUP BY ward`);

  // ── Past results (Historical Election Results module) ─────────────────────
  const history = await rows<{ year: number; seat: string; ward: string | null; candidate: string; party: string | null; votes: number; registered: number | null }>(sql`
    SELECT (data->>'year')::int AS year, data->>'seat' AS seat, ward, title AS candidate, data->>'party' AS party,
      COALESCE((data->>'votes')::numeric,0)::int AS votes, NULLIF(data->>'registeredVoters','')::int AS registered
    FROM public.kaiti_records WHERE module='election-history' AND deleted_at IS NULL`);
  const seatHistory = history.filter(h => (h.seat ?? "").toUpperCase() === seat);
  const usable = seatHistory.length ? seatHistory : history;
  const lastYear = usable.reduce((m, h) => Math.max(m, h.year ?? 0), 0) || null;
  const last = usable.filter(h => h.year === lastYear);
  const lastSeat = last[0]?.seat ?? seat;

  // ── Campaign's own candidate polls ────────────────────────────────────────
  const polls = await rows<{ id: number; title: string; options: unknown }>(sql`SELECT id, title, options FROM opinion_polls`);
  // Poll options are stored as strings or as { label, votes } objects.
  const optLabel = (o: unknown) => typeof o === "string" ? o : o && typeof o === "object" && typeof (o as { label?: unknown }).label === "string" ? (o as { label: string }).label : "";
  const candidatePolls = polls.filter(p => Array.isArray(p.options) && (p.options as unknown[]).some(o => isOurs(optLabel(o))));
  const pollIds = candidatePolls.map(p => p.id);
  const votes = pollIds.length ? await rows<{ poll_id: number; option_index: number; ward: string | null; n: number }>(sql`
    SELECT poll_id, option_index, ward, count(*)::int AS n FROM poll_votes
    WHERE poll_id IN (${sql.join(pollIds.map(id => sql`${id}`), sql`, `)}) GROUP BY 1,2,3`) : [];
  const optionName = (pollId: number, idx: number) => {
    const p = candidatePolls.find(x => x.id === pollId);
    const o = Array.isArray(p?.options) ? (p!.options as unknown[])[idx] : null;
    return optLabel(o) || `Option ${idx + 1}`;
  };
  const isUndecided = (name: string) => /undecided|not sure|none|sijui|bado/i.test(name);

  // ── Field data ────────────────────────────────────────────────────────────
  const canvass = await rows<{ ward: string; level: string | null; n: number }>(sql`
    SELECT s.ward, v.support_level AS level, count(*)::int AS n FROM canvass_visits v JOIN canvass_sessions s ON s.id = v.session_id GROUP BY 1,2`);
  const memberLevels = await rows<{ ward: string; level: string | null; n: number }>(sql`
    SELECT ward, support_level AS level, count(*)::int AS n FROM members WHERE status = 'active' GROUP BY 1,2`);
  const vols = await rows<{ ward: string; n: number }>(sql`SELECT ward, count(*)::int AS n FROM volunteers WHERE status = 'active' GROUP BY 1`);
  const events = await rows<{ ward: string; n: number }>(sql`
    SELECT ward, count(*)::int AS n FROM campaign_events WHERE start_date >= to_char(now() - interval '90 days', 'YYYY-MM-DD') GROUP BY 1`);
  const turnout = await rows<{ ward: string; rate: number }>(sql`SELECT ward, expected_turnout_rate AS rate FROM turnout_assumptions`);

  const SUPPORT = new Set(["strong_supporter", "supporter"]);
  const OPPOSED = new Set(["soft_opponent", "opposed"]);

  const out: WardOut[] = wards.map(ward => {
    const st = stations.find(s => sameWard(s.ward, ward));
    const hist = last.filter(h => sameWard(h.ward, ward));
    const histRegistered = hist.find(h => h.registered)?.registered ?? null;
    const officialReg = isKaiti ? KAITI_REGISTERED_VOTERS_2022[ward] ?? null : null;
    // A partial station import must not shrink the ward: use the official register until stations cover it.
    const stationsComplete = !!st?.registered && (!officialReg || st.registered >= officialReg * 0.9);
    const registered = stationsComplete ? st!.registered : officialReg ?? (st?.registered || histRegistered);
    const registeredSource = stationsComplete ? "Imported polling-station register" : officialReg ? KAITI_REGISTER_SOURCE : st?.registered ? "Imported polling stations (partial)" : histRegistered ? `Historical results ${lastYear}` : null;

    // Last election in this ward
    let lastElection: WardOut["lastElection"] = null;
    if (hist.length) {
      const byCand = new Map<string, { name: string; party: string | null; votes: number }>();
      for (const h of hist) {
        const k = norm(h.candidate);
        const e = byCand.get(k) ?? { name: h.candidate, party: h.party, votes: 0 };
        e.votes += h.votes; byCand.set(k, e);
      }
      const total = [...byCand.values()].reduce((s, c) => s + c.votes, 0);
      const cands = [...byCand.values()].sort((a, b) => b.votes - a.votes).map(c => ({ ...c, share: total ? pct(c.votes / total) : 0 }));
      const ours = cands.find(c => isOurs(c.name));
      lastElection = {
        year: lastYear!, seat: lastSeat, totalVotes: total,
        turnoutPct: registered && total ? pct(total / registered) : null,
        winner: cands[0]?.name ?? "—", winnerShare: cands[0]?.share ?? 0,
        ourShare: ours ? ours.share : null, candidates: cands.slice(0, 6),
      };
    }

    // Our polls in this ward
    let poll: WardOut["poll"] = null;
    const wv = votes.filter(v => sameWard(v.ward, ward));
    const pollTotal = wv.reduce((s, v) => s + v.n, 0);
    if (pollTotal > 0) {
      const byName = new Map<string, number>();
      for (const v of wv) { const n = optionName(v.poll_id, v.option_index); byName.set(n, (byName.get(n) ?? 0) + v.n); }
      const sorted = [...byName.entries()].filter(([n]) => !isUndecided(n)).sort((a, b) => b[1] - a[1]);
      const ourVotes = [...byName.entries()].filter(([n]) => isOurs(n)).reduce((s, [, n]) => s + n, 0);
      const und = [...byName.entries()].filter(([n]) => isUndecided(n)).reduce((s, [, n]) => s + n, 0);
      poll = { responses: pollTotal, ourShare: pct(ourVotes / pollTotal), leader: sorted[0]?.[0] ?? "—", leaderShare: pct((sorted[0]?.[1] ?? 0) / pollTotal), undecidedShare: pct(und / pollTotal) };
    }

    // Canvass + member support levels
    const levels = [...canvass, ...memberLevels].filter(c => sameWard(c.ward, ward) && c.level);
    const contacts = levels.reduce((s, c) => s + c.n, 0);
    const canvassOut = contacts ? {
      contacts,
      supportShare: pct(levels.filter(c => SUPPORT.has(c.level!)).reduce((s, c) => s + c.n, 0) / contacts),
      undecidedShare: pct(levels.filter(c => c.level === "undecided").reduce((s, c) => s + c.n, 0) / contacts),
      opposedShare: pct(levels.filter(c => OPPOSED.has(c.level!)).reduce((s, c) => s + c.n, 0) / contacts),
    } : null;

    // Ward assumption > last ward result > Makueni's actual 2022 turnout (61%) as the evidence-based default.
    const isMakueni = /makueni/i.test(profile?.county ?? "");
    const expectedTurnoutPct = turnout.find(t => sameWard(t.ward, ward))?.rate
      ?? (lastElection?.turnoutPct ? Math.round(lastElection.turnoutPct) : isMakueni ? Math.round(MAKUENI_2022_PRESIDENTIAL.turnoutPct) : 65);
    const projectedVotes = registered ? Math.round(registered * expectedTurnoutPct / 100) : null;

    // Target: beat the strongest rival with a 3-point cushion (first past the post), within sane bounds.
    const rivalShare = Math.max(
      lastElection ? Math.max(0, ...lastElection.candidates.filter(c => !isOurs(c.name)).map(c => c.share)) : 0,
      poll && !isOurs(poll.leader) ? poll.leaderShare : 0,
    );
    const targetShare = Math.min(55, Math.max(40, Math.round(rivalShare + 3)));

    // Current estimate: our poll (≥30 responses) > canvass (≥30 contacts) > last result.
    let estimatedShare: number | null = null; let estimateSource: string | null = null;
    if (poll && poll.responses >= 30) { estimatedShare = poll.ourShare; estimateSource = `Campaign poll (${poll.responses} responses)`; }
    else if (canvassOut && canvassOut.contacts >= 30) { estimatedShare = canvassOut.supportShare; estimateSource = `Canvass and supporter records (${canvassOut.contacts} contacts)`; }
    else if (lastElection?.ourShare != null) { estimatedShare = lastElection.ourShare; estimateSource = `${lastElection.year} result`; }

    const votesToGain = projectedVotes != null && estimatedShare != null ? Math.max(0, Math.round(projectedVotes * (targetShare - estimatedShare) / 100)) : null;
    const contactsPer1000 = registered ? Math.round((contacts / registered) * 10000) / 10 : null;
    const gap = estimatedShare == null ? null : targetShare - estimatedShare;
    const status: WardOut["status"] = gap == null ? "no-data" : gap <= -5 ? "stronghold" : gap <= 5 ? "lean" : gap <= 15 ? "battleground" : "behind";

    const actions: string[] = [];
    if (estimatedShare == null) actions.push(`Run a ward poll or canvass at least 200 households in ${ward} — there is no support data yet.`);
    if (!st) actions.push(`Import ${ward}'s polling stations so agents, readiness and tallies can be planned.`);
    if (contactsPer1000 != null && contactsPer1000 < 20) actions.push(`Field coverage is ${contactsPer1000} contacts per 1,000 voters — schedule door-to-door sessions.`);
    if ((poll?.undecidedShare ?? 0) >= 15 || (canvassOut?.undecidedShare ?? 0) >= 20) actions.push("A large undecided group — hold issue forums and follow up undecided contacts personally.");
    if (status === "behind" || status === "battleground") actions.push(`Candidate visits and local endorsements: about ${votesToGain?.toLocaleString() ?? "?"} more votes are needed here.`);
    if (status === "stronghold" || status === "lean") actions.push("Protect the base: register supporters, recruit polling agents, plan election-day turnout.");
    if (lastElection?.turnoutPct != null && lastElection.turnoutPct < 60) actions.push(`Turnout was only ${lastElection.turnoutPct}% last time — a turnout drive could decide this ward.`);
    if ((vols.find(v => sameWard(v.ward, ward))?.n ?? 0) < 10) actions.push("Recruit and train more ward volunteers (fewer than 10 active).");

    const size = registered ?? 0;
    const priority = Math.round(
      (votesToGain ?? size * 0.1) / 100 +
      (status === "battleground" ? 25 : status === "behind" ? 15 : status === "no-data" ? 20 : status === "lean" ? 10 : 0) +
      (contactsPer1000 != null && contactsPer1000 < 20 ? 10 : 0),
    );

    return {
      ward, registered, registeredSource, stations: st?.n ?? 0, lastElection, poll, canvass: canvassOut,
      volunteers: vols.find(v => sameWard(v.ward, ward))?.n ?? 0, events90d: events.find(e => sameWard(e.ward, ward))?.n ?? 0,
      expectedTurnoutPct, projectedVotes, targetShare, estimatedShare, estimateSource, votesToGain, contactsPer1000, status, priority, actions,
    };
  }).sort((a, b) => b.priority - a.priority);

  // ── Constituency totals and candidates ────────────────────────────────────
  const totalRegistered = out.reduce((s, w) => s + (w.registered ?? 0), 0);
  const projected = out.reduce((s, w) => s + (w.projectedVotes ?? 0), 0);
  const known = out.filter(w => w.estimatedShare != null && w.projectedVotes);
  const estimatedVotes = known.reduce((s, w) => s + (w.projectedVotes! * w.estimatedShare! / 100), 0);
  const coveredProjected = known.reduce((s, w) => s + w.projectedVotes!, 0);

  const candidateTotals = new Map<string, { name: string; party: string | null; lastVotes: number; pollVotes: number }>();
  for (const h of last) {
    const k = norm(h.candidate); const e = candidateTotals.get(k) ?? { name: h.candidate, party: h.party, lastVotes: 0, pollVotes: 0 };
    e.lastVotes += h.votes; candidateTotals.set(k, e);
  }
  for (const v of votes) {
    const name = optionName(v.poll_id, v.option_index); if (isUndecided(name)) continue;
    const k = norm(name); const e = candidateTotals.get(k) ?? { name, party: null, lastVotes: 0, pollVotes: 0 };
    e.pollVotes += v.n; candidateTotals.set(k, e);
  }
  const lastTotal = [...candidateTotals.values()].reduce((s, c) => s + c.lastVotes, 0);
  const pollTotal = votes.reduce((s, v) => s + v.n, 0);
  const candidates = [...candidateTotals.values()].map(c => ({
    ...c, isOurs: isOurs(c.name),
    lastShare: lastTotal ? pct(c.lastVotes / lastTotal) : null,
    pollShare: pollTotal ? pct(c.pollVotes / pollTotal) : null,
  })).sort((a, b) => (b.pollShare ?? b.lastShare ?? 0) - (a.pollShare ?? a.lastShare ?? 0));
  if (!candidates.some(c => c.isOurs)) candidates.unshift({ name: candidate, party: profile?.party ?? null, lastVotes: 0, pollVotes: 0, isOurs: true, lastShare: null, pollShare: null });

  const rival = candidates.find(c => !c.isOurs);

  // ── Data-driven SWOT ──────────────────────────────────────────────────────
  type Item = { title: string; detail: string; impact: "high" | "medium" | "low"; category: string; action: string };
  const S: Item[] = [], W: Item[] = [], O: Item[] = [], T: Item[] = [];
  for (const w of out) {
    if (w.status === "stronghold" || w.status === "lean") S.push({ title: `${w.ward}: ${w.status === "stronghold" ? "strong base" : "within reach"}`, detail: `Estimated ${w.estimatedShare}% against a ${w.targetShare}% target (${w.estimateSource}).`, impact: w.status === "stronghold" ? "high" : "medium", category: "Grassroots", action: "Convert supporters into registered voters, agents and turnout captains." });
    if (w.status === "behind") W.push({ title: `${w.ward}: behind`, detail: `Estimated ${w.estimatedShare}% vs ${w.targetShare}% needed; about ${w.votesToGain?.toLocaleString()} votes to gain.`, impact: "high", category: "Grassroots", action: w.actions[0] ?? "Intensify field work." });
    if (w.status === "no-data") W.push({ title: `${w.ward}: no support data`, detail: `${w.registered?.toLocaleString() ?? "Unknown"} registered voters with no poll or canvass returns.`, impact: (w.registered ?? 0) > 15000 ? "high" : "medium", category: "Data", action: `Poll or canvass ${w.ward} this month.` });
    if (w.contactsPer1000 != null && w.contactsPer1000 < 20 && w.status !== "no-data") W.push({ title: `${w.ward}: thin field coverage`, detail: `${w.contactsPer1000} contacts per 1,000 voters.`, impact: "medium", category: "Grassroots", action: "Schedule door-to-door sessions and assign volunteers." });
    if (w.status === "battleground") O.push({ title: `${w.ward}: winnable battleground`, detail: `${w.estimatedShare}% now, ${w.targetShare}% needed — ${w.votesToGain?.toLocaleString()} votes.`, impact: "high", category: "Grassroots", action: "Prioritise candidate visits, endorsements and issue forums here." });
    if (w.lastElection?.turnoutPct != null && w.lastElection.turnoutPct < 60) O.push({ title: `${w.ward}: low past turnout`, detail: `${w.lastElection.turnoutPct}% voted in ${w.lastElection.year}; non-voters are an untapped pool.`, impact: "medium", category: "Demographic", action: "Run a registration and turnout drive." });
    if (w.lastElection && !isOurs(w.lastElection.winner) && w.lastElection.winnerShare >= 45) T.push({ title: `${w.ward}: rival stronghold`, detail: `${w.lastElection.winner} took ${w.lastElection.winnerShare}% here in ${w.lastElection.year}.`, impact: "high", category: "Political", action: "Contest selectively; focus on persuadable groups and turnout of own supporters." });
    if (w.poll && !isOurs(w.poll.leader) && w.poll.responses >= 30) T.push({ title: `${w.ward}: ${w.poll.leader} leads our poll`, detail: `${w.poll.leader} ${w.poll.leaderShare}% vs us ${w.poll.ourShare}% (${w.poll.responses} responses).`, impact: "high", category: "Political", action: "Study the rival's message here and answer it with local delivery commitments." });
  }
  if (isKaiti) {
    const biggest = [...out].sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0))[0];
    if (biggest?.registered) O.push({ title: `${biggest.ward} decides the seat`, detail: `${biggest.registered.toLocaleString()} of ${totalRegistered.toLocaleString()} registered voters (${pct(biggest.registered / totalRegistered)}%). ${KAITI_REGISTER_SOURCE}.`, impact: "high", category: "Demographic", action: `Allocate the largest share of field time and budget to ${biggest.ward}.` });
    const facts = KAITI_FACTS.filter(f => ["Water", "Roads", "Agriculture"].includes(f.topic)).slice(0, 3);
    for (const f of facts) O.push({ title: `Local issue: ${f.topic.toLowerCase()}`, detail: f.fact, impact: "medium", category: "Narrative", action: `Build a verified, costed commitment on ${f.topic.toLowerCase()} (source: ${f.source}).` });
  }
  if (rival) T.push({ title: `Main rival: ${rival.name}`, detail: [rival.pollShare != null ? `${rival.pollShare}% in campaign polls` : null, rival.lastShare != null ? `${rival.lastShare}% in ${lastYear}` : null].filter(Boolean).join("; ") || "Named in campaign records.", impact: "high", category: "Political", action: "Track the rival's appearances, endorsements and messages in Political Intelligence." });
  if (!lastYear) W.push({ title: "Past results not imported", detail: "No historical results are loaded, so turnout and rival strength per ward are unknown.", impact: "high", category: "Data", action: "Import IEBC Form 34A/35A results for the last election into Historical Election Results." });

  return {
    generatedAt: new Date().toISOString(),
    campaign: { name: profile?.name ?? "", candidate, seat, constituency: profile?.constituency ?? "" },
    summary: {
      registered: totalRegistered || null,
      projectedVotes: projected || null,
      estimatedVotes: known.length ? Math.round(estimatedVotes) : null,
      estimatedShare: coveredProjected ? pct(estimatedVotes / coveredProjected) : null,
      wardsWithData: known.length, wards: out.length,
      lastElectionYear: lastYear, candidatePolls: candidatePolls.map(p => p.title),
      topPriorities: out.slice(0, 2).map(w => w.ward),
    },
    candidates, wards: out,
    swot: { strengths: S.slice(0, 6), weaknesses: W.slice(0, 6), opportunities: O.slice(0, 6), threats: T.slice(0, 6) },
    dataGaps: [
      ...(lastYear ? [] : ["Historical election results (IEBC Forms 34A/35A)"]),
      ...(stations.length ? [] : ["Polling stations with registered voters (IEBC register per polling station)"]),
      ...(candidatePolls.length ? [] : [`A campaign poll that lists ${candidate} among the options`]),
      ...(canvass.length ? [] : ["Canvass returns with support levels"]),
    ],
    sources: [KAITI_REGISTER_SOURCE, `Default turnout ${MAKUENI_2022_PRESIDENTIAL.turnoutPct}%: ${MAKUENI_2022_PRESIDENTIAL.source}`, ...(lastYear ? [`Historical Election Results module (${lastYear})`] : []), "Campaign polls, canvass, members and volunteers in KaitiOS"],
  };
}

export type WinAnalysis = Awaited<ReturnType<typeof computeWinAnalysis>>;

router.get("/win", async (_req, res) => {
  res.json(await computeWinAnalysis());
});

/** Plain-text digest of the win analysis for AI prompts and no-token answers. */
export function winDigest(a: WinAnalysis): string {
  const lines = [
    `PATH TO VICTORY (computed ${a.generatedAt.slice(0, 10)} from campaign data):`,
    `Registered voters: ${a.summary.registered?.toLocaleString() ?? "unknown"}; projected votes cast: ${a.summary.projectedVotes?.toLocaleString() ?? "unknown"}; estimated current share: ${a.summary.estimatedShare ?? "unknown"}% (data for ${a.summary.wardsWithData} of ${a.summary.wards} wards).`,
    `Candidates: ${a.candidates.slice(0, 5).map(c => `${c.name}${c.isOurs ? " (our candidate)" : ""}${c.pollShare != null ? ` poll ${c.pollShare}%` : ""}${c.lastShare != null ? ` last ${c.lastShare}%` : ""}`).join("; ")}.`,
    ...a.wards.map(w => `- ${w.ward}: ${w.registered?.toLocaleString() ?? "?"} voters, status ${w.status}${w.estimatedShare != null ? `, est. ${w.estimatedShare}% vs ${w.targetShare}% needed` : ""}${w.votesToGain != null ? `, ${w.votesToGain.toLocaleString()} votes to gain` : ""}. Next: ${w.actions[0] ?? "maintain"}`),
    ...(a.dataGaps.length ? [`Missing data: ${a.dataGaps.join("; ")}.`] : []),
  ];
  return lines.join("\n");
}

export default router;
