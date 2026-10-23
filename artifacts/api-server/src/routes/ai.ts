import { evidenceBundle, evidenceContext } from "../lib/kenya-evidence";
import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { buildFreeMakueniAnswer, buildFreeMakueniSpeech, fetchMakueniOfficialSources, searchFreeMakueniWeb } from "./makueni-free-ai";
import { getCidp2013Context } from "./cidp-2013-2017-knowledge";
import { localizeDeep } from "../lib/campaign-ai";
import { computeWinAnalysis, winDigest, type WinAnalysis } from "./analysis";
import { kaitiFactsContext } from "../data/kaiti-facts";
import { currentCampaignProfile } from "@workspace/db";
import { permissionsForRole, isEmergencySession } from "../lib/auth";

type SwotItem = { title: string; detail: string; impact: string; category: string; action: string; source?: string };
type SwotLike = { strengths: SwotItem[]; weaknesses: SwotItem[]; opportunities: SwotItem[]; threats: SwotItem[] };
/** Campaign data first (ward results, polls, canvass), then AI or template items; capped per quadrant. */
function mergeSwot(win: WinAnalysis | null, other: Partial<SwotLike>) {
  const q = ["strengths", "weaknesses", "opportunities", "threats"] as const;
  const out: Record<string, unknown> = { generatedAt: new Date().toISOString() };
  for (const k of q) {
    const data = (win?.swot[k] ?? []).map(i => ({ ...i, source: "campaign data" }));
    const extra = ((other[k] ?? []) as SwotItem[]).map(i => ({ ...i, source: i.source ?? "analysis" }));
    out[k] = [...data, ...extra].slice(0, 8);
  }
  if (win) out.pathToWin = { summary: win.summary, candidates: win.candidates, wards: win.wards, dataGaps: win.dataGaps, sources: win.sources };
  return out;
}
async function safeWin(): Promise<WinAnalysis | null> { try { return await computeWinAnalysis(); } catch { return null; } }
const isKaitiCampaign = () => (currentCampaignProfile()?.constituency ?? "").toLowerCase() === "kaiti";

const router = Router();
/** In free mode these generation routes must never fall through to OpenAI. */
router.use((req, res, next) => {
  // Template answers are written for Kaiti; adapt names, wards and places for other campaigns.
  const sendJson = res.json.bind(res);
  res.json = (body: unknown) => sendJson(localizeDeep(body));
  if (process.env.MAKUENI_AI_MODE !== "free" || req.method !== "POST") return next();
  const routePath = req.path;
  if (routePath === "/generate-readiness") return res.json({ mode: "free-template", items: [
    { domain: "Evidence and records", item: "Confirm each reported service issue against a dated official source.", weight: "high" },
    { domain: "Ward coverage", item: "Check that reports identify the configured Kenyan sub-county and ward.", weight: "high" },
    { domain: "Public participation", item: "Record concerns, responsible office, action owner and follow-up date.", weight: "medium" },
    { domain: "Budget transparency", item: "Distinguish approved allocation, expenditure and verified outputs.", weight: "high" },
    { domain: "Data protection", item: "Restrict personal data to authorized users and log access.", weight: "high" },
    { domain: "Reporting", item: "Publish reviewed information with source links and update dates.", weight: "medium" }
  ], note: "Template checklist, not a live audit." });
  if (routePath === "/generate-campaign-plan") {
    const today = new Date().toISOString().slice(0, 10);
    const focus = typeof req.body?.focus === "string" ? req.body.focus.slice(0, 200).replace(/[<>]/g, "") : "county service delivery";
    return res.json({ mode: "free-template", milestones: [
      { title: "Verify official source material", description: "Collect current county plans, ward profiles, budget reports and project records.", dueDate: today, category: "Research", priority: "high", owner: "Research team" },
      { title: "Map service issues by ward", description: "Record location, department, source date and verification status.", dueDate: today, category: "Service delivery", priority: "high", owner: "County information team" },
      { title: "Review budget evidence", description: "Separate allocations, expenditure and documented outputs.", dueDate: today, category: "Finance", priority: "high", owner: "Finance review team" },
      { title: "Prepare public information brief", description: "Prepare a neutral brief about " + focus + " using verified sources only.", dueDate: today, category: "Reporting", priority: "medium", owner: "Communications team" },
      { title: "Schedule follow-up", description: "Assign owners and dates to unresolved service questions.", dueDate: today, category: "Follow-up", priority: "medium", owner: "Operations team" }
    ], note: "Template milestones only; no live project status is implied." });
  }
  if (routePath === "/generate-swot") { void safeWin().then(win => res.json(mergeSwot(win, buildKaitiEvidenceSwot()))); return; }
  return next();
});


/** Free, explicitly non-live evidence-review framework. Do not misrepresent as AI research. */
function buildKaitiEvidenceSwot() {
  const scope = currentCampaignProfile() ?? {};
  const bundle = evidenceBundle(scope, "public services planning mandate");
  const item = (title: string, detail: string, action: string) => ({ title, detail, action, impact: "medium", category: "Evidence review" });
  return {
    mode: "document-evidence-review", generatedAt: new Date().toISOString(), sources: bundle.sources,
    strengths: bundle.facts.slice(0, 3).map(f => ({ ...item("Documented public-policy baseline", f.text, "Check the dated original source before public use."), source: f.sourceId, period: f.period, scope: f.county ?? "Kenya" })),
    weaknesses: [item("Current local evidence gaps", "Historical plans do not establish current ward outcomes or project completion.", "Attach dated local reports with geographic units and source pages.")],
    opportunities: [item("Consistent evidence review", "Compare proposals, approved allocations and verified outputs as separate records.", "Record source, period, responsible institution and review date.")],
    threats: [item("Geographic and time-period mismatch", "Using one county's historical data for another area produces invalid conclusions.", "Keep county-specific evidence scoped to its original county; label unknowns.")],
    note: bundle.limitations.join(" "),
  };
}

export const CAMPAIGN_CONTEXT = `You are the Kenya public-policy and operational information assistant for the active campaign. Work only with Kenyan information and the configured county, constituency, ward and seat. Use the shared source evidence supplied with this request. Identify source, period and geographic scope for factual claims. Treat policy proposals as proposals; targets are not achievements. Do not invent candidate identities, current outcomes, statistics or electoral predictions. Do not use sensitive personal data for political targeting.`;

const MODULE_CONTEXTS: Record<string, string> = {
  swot: "Review service-delivery strengths, evidence gaps, operational risks and improvement opportunities for the selected campaign area departments.",
  dashboard: "Summarize verified the selected campaign area service activity, reporting gaps and operational priorities.",
  messaging: "Draft neutral, factual public-service notices for the selected campaign area residents.",
  members: "Help maintain accurate the selected campaign area constituent records and data quality; do not infer political preferences.",
  segments: "Organize records by configured wards and service needs, not political persuasion or demographic targeting.",
  "field-ops": "Plan county service visits, inspections, public participation and issue follow-up within the selected campaign area.",
  volunteers: "Coordinate authorized county service and public participation activities within the selected campaign area.",
  surveys: "Design neutral surveys about the selected campaign area services and interpret results with clear limitations.",
  events: "Plan public participation forums and county service events within the selected campaign area.",
  intelligence: "Analyze verified public-service information, emerging issues and misinformation affecting the selected campaign area.",
  "campaign-plan": "Track the selected campaign area project milestones, dependencies, deadlines and evidence of completion.",
  kol: "Maintain a directory of the selected campaign area public-service stakeholders and community organizations.",
  fundraising: "Support transparent, compliant finance recording for authorized the selected campaign area activities.",
  "election-day": "Support neutral election administration records for polling stations located in the selected campaign area.",
  credentials: "Research the selected campaign area public records, county plans, budgets and documented development outcomes.",
  analytics: "Analyze the selected campaign area service and operational data without unsupported causal claims.",
  admin: "Help maintain secure access, auditability and data integrity for the the selected campaign area Command Centre.",
  "voters-db": "Maintain the the selected campaign area voter registry only where legally authorized; preserve source, year and provenance.",
};

const QUICK_PROMPTS: Record<string, string[]> = {
  dashboard: ["Summarize verified county service activity", "Identify missing source records", "List upcoming operational deadlines"],
  messaging: ["Draft a neutral water-service notice", "Explain how residents can submit a service request", "Draft a public participation reminder"],
  members: ["Find incomplete Kenya ward records", "Explain the data validation rules", "Summarize record quality issues"],
  segments: ["Count records by configured electoral ward", "Find records with missing ward assignments", "Review consent and data-quality gaps"],
  "field-ops": ["Plan a county road inspection", "Create a water-point follow-up checklist", "Draft a field visit report template"],
  volunteers: ["Prepare a public-service event checklist", "Create a neutral field reporting template", "Summarize open operational issues"],
  surveys: ["Draft a neutral county service survey", "Summarize responses by official ward", "Identify missing survey metadata"],
  events: ["Plan a county public participation forum", "Create an event logistics checklist", "Draft a post-event report template"],
  intelligence: ["Summarize verified public-service issues", "Flag claims that lack source links", "Draft a factual service update"],
  "campaign-plan": ["List overdue county project milestones", "Identify project dependencies", "Prepare a monthly progress report"],
  kol: ["Review the county stakeholder directory", "Find records missing organization details", "Prepare a public meeting attendance template"],
  fundraising: ["Review transaction reconciliation status", "Summarize verified county activity expenses", "List missing payment configuration details"],
  "election-day": ["Check local polling-station data completeness", "Summarize station reporting status", "List records awaiting verification"],
  swot: ["Review service delivery risks and evidence gaps", "Identify operational strengths and constraints", "Suggest data-quality improvements"],
  credentials: ["How does our agenda align with Vision 2030 and MTP IV (BETA)?", "Find the official the selected campaign area development plan", "Summarize a sourced county budget item", "List documents needed to verify a project"],
  analytics: ["Compare service metrics by ward", "Explain missing or outdated data", "Create a source-backed county indicator summary"],
  admin: ["Review role permissions", "Check audit-log completeness", "Review workspace data-isolation controls"],
  "voters-db": ["Check voter records with invalid wards", "Summarize registry provenance", "Identify duplicate records for review"],
};

router.get("/county-knowledge", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.slice(0, 180) : "public services";
  const scope = currentCampaignProfile() ?? {};
  const webResults = await searchFreeMakueniWeb(query);
  res.json({ ...evidenceBundle(scope, query), query, webResults, checkedAt: new Date().toISOString(), guidance: "Reviewed source summaries and unverified web discovery are separate. A check date is not an updated measurement." });
});

router.get("/quick-prompts", (req, res) => {
  const { module = "dashboard" } = req.query as { module?: string };
  // Strategy prompts first: they use the live path-to-victory analysis.
  const strategy = ["Which official sources apply to this campaign area?", "Separate historical baselines, targets and verified outcomes."];
  res.json({ prompts: [...strategy, ...(QUICK_PROMPTS[module] ?? QUICK_PROMPTS.dashboard)].slice(0, 5) });
});

router.post("/generate-speech", async (req, res) => {
  const { area, occasion, topic, language, minutes } = req.body as {
    area?: string; occasion?: string; topic?: string; language?: string; minutes?: number;
  };
  if ([area, occasion, topic, language].some((value) => typeof value === "string" && value.length > 200)) {
    res.status(400).json({ error: "Speech fields must be 200 characters or fewer." });
    return;
  }
  const draft = buildFreeMakueniSpeech({ area, occasion, topic, language, minutes });
  const query = [area || "the selected campaign area", topic || "service delivery", "the selected campaign area"].join(" ");
  const [officialSources, webResults] = await Promise.all([fetchMakueniOfficialSources(), searchFreeMakueniWeb(query)]);
  res.json({
    ...draft,
    generatedAt: new Date().toISOString(),
    mode: "free-template-with-public-source-search",
    research: { query, officialSources, webResults, cidpEvidence: evidenceContext(currentCampaignProfile() ?? {}, [area, topic, occasion].filter(Boolean).join(" ")) },
    notes: [...draft.notes, "Search results are leads, not verified facts. Review linked sources and add only confirmed local details before delivering the speech."],
  });
});

router.post("/generate-readiness", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `${CAMPAIGN_CONTEXT}

You are generating a candidate readiness checklist for a Kenya constituency campaign. Today is ${today}.

Return ONLY a raw JSON object with no markdown, no code fences, no explanation — just the JSON:
{
  "items": [
    {
      "domain": "domain name",
      "item": "specific, actionable checklist item",
      "weight": "low|medium|high",
      "notes": "optional one-line context note relevant to the selected campaign area"
    }
  ]
}

Generate 30-40 checklist items covering ALL of these domains:
- Legal & Compliance (IEBC clearance, nomination papers, party ticket, running mate)
- Financial (budget, donors, bank account, expenditure tracking)
- Ground Game (ward captains, volunteers, door-to-door, polling station mapping)
- Messaging & Brand (manifesto, slogan, social media, website, materials)
- Media & PR (press team, radio, barazas, monitoring, crisis comms)
- Polling & Intelligence (baseline poll, opponent tracking, sentiment, swing wards)
- Technology & Data (voter database, SMS platform, WhatsApp broadcast, reporting tools)
- Candidate Welfare (schedule, security, transportation, health)

Each item must relate to the selected campaign area services, public reporting, or operational readiness. Assign weight "high" to critical pre-election requirements, "medium" to important items, "low" to nice-to-haves.`,
        },
        {
          role: "user",
          content: "Generate a comprehensive candidate readiness checklist for the selected campaign based on the candidate profile and constituency information provided.",
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) { res.status(500).json({ error: "No AI response" }); return; }
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "Invalid AI response format" }); return; }
    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ items: parsed.items ?? [] });
  } catch (err) {
    req.log.error({ err }, "generate-readiness failed");
    res.status(500).json({ error: "Failed to generate readiness checklist. Please retry." });
  }
});

router.post("/generate-campaign-plan", async (req, res) => {
  const { electionDate, focus } = req.body as { electionDate?: string; focus?: string };
  const today = new Date().toISOString().slice(0, 10);
  const election = electionDate || "2027-08-09";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `${CAMPAIGN_CONTEXT}

You are generating a structured milestone plan. Today is ${today}. Election date: ${election}.

Return ONLY a raw JSON object with no markdown, no code fences, no explanation — just the JSON:
{
  "milestones": [
    {
      "title": "short action title",
      "description": "1-2 sentence detail",
      "dueDate": "YYYY-MM-DD",
      "category": "Ground Game|Messaging|Narrative|Fundraising|Events|Polling|GOTV|Legal|Media|Logistics",
      "priority": "low|medium|high|critical",
      "owner": "team member full name"
    }
  ]
}

Generate 18-22 strategic milestones spanning from today to 2 weeks before election day. Spread them across all categories. Make each milestone specific, actionable and realistic for the configured Kenyan office and area. Assign owners from the campaign team.`,
        },
        {
          role: "user",
          content: focus
            ? `Generate a campaign milestone plan focused on: ${focus}`
            : "Generate a comprehensive campaign milestone plan from today to election day covering ground game, messaging, fundraising, legal, GOTV and all other campaign areas.",
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) { res.status(500).json({ error: "No AI response" }); return; }
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "Invalid AI response format" }); return; }
    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ milestones: parsed.milestones ?? [] });
  } catch (err) {
    req.log.error({ err }, "generate-campaign-plan failed");
    res.status(500).json({ error: "Failed to generate campaign plan. Please retry." });
  }
});

router.post("/generate-swot", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  // One call per quadrant — 4 items each — keeps output ~250 tokens per call (safe in prod)
  const ITEM = `{"title":"string","detail":"string","impact":"high|medium|low","category":"Political|Financial|Grassroots|Narrative|Demographic|Infrastructure|Legal|External","action":"string"}`;
  const CTX = `Public-service policy analyst supporting Hon. Job Tuta in the selected campaign area, Kenya, for the 2027 election. Keep analysis evidence-led and specific to the selected campaign area. Do not reference places outside the selected campaign area. Do not invent personal history, party affiliation, funding, polling, or election results. Output ONLY raw JSON, no markdown. Keep every string field under 90 characters.`;

  const win = await safeWin();
  const evidence = `\n\nCAMPAIGN DATA (use it; cite wards and numbers; do not invent figures):\n${win ? winDigest(win) : "No campaign data available."}${isKaitiCampaign() ? `\n\nOFFICIAL KAITI FACTS:\n${kaitiFactsContext("electorate water roads agriculture", 8)}` : ""}`;
  function makePrompt(quadrant: string, hint: string) {
    return {
      system: `${CTX}${evidence}\nSchema: {"${quadrant}":[${ITEM}]}\nGenerate exactly 4 items. ${hint}`,
      user: `Generate the 4-item ${quadrant} JSON now.`,
    };
  }

  const prompts = {
    strengths: makePrompt("strengths", "Assess verifiable assets such as local community engagement, policy proposals, public profile, team capacity and documented service record. Do not assume any are proven without evidence."),
    weaknesses: makePrompt("weaknesses", "Identify areas requiring evidence and improvement: ward coverage, communications reach, volunteer coordination, resourcing, and documented policy detail. Do not state unverified weaknesses as facts."),
    opportunities: makePrompt("opportunities", "Consider sourced local public-service priorities, youth and women participation, ward listening, public forums, digital information access, and transparent policy commitments."),
    threats: makePrompt("threats", "Consider misinformation, low public trust, fragmented communications, poor source verification, volunteer safety and uneven ward coverage without asserting unverified opponents or polling trends."),
  };

  try {
    const call = (system: string, user: string) =>
      openai.chat.completions.create({
        model: "gpt-5.1",
        max_completion_tokens: 800,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      });

    const [sRes, wRes, oRes, tRes] = await Promise.all([
      call(prompts.strengths.system, prompts.strengths.user),
      call(prompts.weaknesses.system, prompts.weaknesses.user),
      call(prompts.opportunities.system, prompts.opportunities.user),
      call(prompts.threats.system, prompts.threats.user),
    ]);

    function parse(res: any, key: string) {
      const text = res.choices[0]?.message?.content ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return [];
      try { return JSON.parse(m[0])[key] ?? []; } catch { return []; }
    }

    res.json(mergeSwot(win, {
      strengths: parse(sRes, "strengths"),
      weaknesses: parse(wRes, "weaknesses"),
      opportunities: parse(oRes, "opportunities"),
      threats: parse(tRes, "threats"),
    }));
  } catch (err) {
    req.log.warn({ err }, "Paid SWOT unavailable; returning data-driven SWOT with evidence-review framework");
    res.json(mergeSwot(win, buildKaitiEvidenceSwot()));
  }
});

router.post("/assist", async (req, res) => {
  const { module = "dashboard", context = {}, message } = req.body as {
    module?: string;
    context?: Record<string, unknown>;
    message: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message required" });
    return;
  }

  const moduleCtx = MODULE_CONTEXTS[module] ?? MODULE_CONTEXTS.dashboard;
  const historicalCidpContext = /makueni/i.test(currentCampaignProfile()?.county ?? "") ? getCidp2013Context(message, 4) : "";
  const currentCidpContext = evidenceContext(currentCampaignProfile() ?? {}, message);
  // Kaiti facts from the county plans, plus live win analysis for strategy questions.
  const kaitiFacts = isKaitiCampaign() ? kaitiFactsContext(message, 6) : "";
  const strategic = /\b(win|winning|ward|wards|focus|strateg|swot|votes?|poll|opponent|rival|turnout|where|improve|priorit|battleground|stronghold)/i.test(message);
  let canSeeIntel = isEmergencySession(req);
  if (!canSeeIntel && req.currentUser) {
    const perms = await permissionsForRole(req.currentUser.role);
    canSeeIntel = perms.intelligence === "read" || perms.intelligence === "write";
  }
  const win = strategic && canSeeIntel ? await safeWin() : null;
  const strategyStr = `${kaitiFacts ? `\n\nOFFICIAL KAITI FACTS (cite the source in brackets):\n${kaitiFacts}` : ""}${win ? `\n\n${winDigest(win)}` : ""}`;
  const contextStr =
    Object.keys(context).length > 0
      ? `\n\nCURRENT MODULE DATA:\n${JSON.stringify(context, null, 2)}`
      : "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Explicit no-token mode avoids calling the paid model at all.
  if (process.env.MAKUENI_AI_MODE === "free") {
    const [liveSources, publicWebResults] = await Promise.all([fetchMakueniOfficialSources(), searchFreeMakueniWeb(message)]);
    const fallback = buildFreeMakueniAnswer({ message, module, context: { ...context, publicWebResults, historicalCidpContext, currentCidpContext, kaitiFacts, winPriorities: win ? win.wards.map(w => ({ ward: w.ward, status: w.status, actions: w.actions.slice(0, 2), votesToGain: w.votesToGain })) : undefined }, liveSources });
    res.write(`data: ${JSON.stringify({ content: fallback, mode: "free-fallback" })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, mode: "free-fallback" })}\n\n`);
    res.end();
    return;
  }

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `${CAMPAIGN_CONTEXT}${strategyStr}\n\nKENYA EVIDENCE (reviewed facts first, then the labelled national development framework; use each stated period and label):\n${currentCidpContext}\n\nHISTORICAL SOURCE — CIDP 2013-2017:\n${historicalCidpContext}\n\nThis source is historical. Never treat its baselines or planned projects as current statistics or current project status. Use it for historical context and compare against current dated evidence.\n\nMODULE: ${module.toUpperCase()}\nROLE: ${moduleCtx}${contextStr}`,
        },
        { role: "user", content: message },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    req.log.warn({ err }, "Paid AI unavailable; using deterministic Makueni fallback");
    const [liveSources, publicWebResults] = await Promise.all([fetchMakueniOfficialSources(), searchFreeMakueniWeb(message)]);
    const fallback = buildFreeMakueniAnswer({ message, module, context: { ...context, publicWebResults, kaitiFacts, winPriorities: win ? win.wards.map(w => ({ ward: w.ward, status: w.status, actions: w.actions.slice(0, 2), votesToGain: w.votesToGain })) : undefined }, liveSources });
    res.write(`data: ${JSON.stringify({ content: fallback, mode: "free-fallback" })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, mode: "free-fallback" })}\n\n`);
  }
  res.end();
});

export default router;
