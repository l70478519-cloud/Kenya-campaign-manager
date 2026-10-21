import { Router } from "express";
import { db, narrativeMentionsTable, competitorsTable, warRoomBriefsTable, narrativeResponsesTable, platformIntegrationsTable, narrativeScansTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
const isOutOfCountyText = (value: unknown) => /\b(mule|matungulu|kangundo|tala|kyeleni|machakos county|makueni north|makueni east|makueni west)\b/i.test(String(value ?? ""));

// ─── helpers ────────────────────────────────────────────────────────────────

const THREAT_KEYWORDS: Record<string, string[]> = {
  critical: ["fake", "corrupt", "scandal", "arrested", "bribe", "resign", "impeach", "criminal", "rigged", "fraud", "stolen", "looted", "drugs", "murder", "thief"],
  high: ["fail", "failure", "incompetent", "useless", "waste", "rejected", "protest", "shame", "disappointing", "betrayed", "liar", "lied"],
  elevated: ["slow", "delay", "problem", "concern", "worried", "weak", "poor", "bad", "wrong", "issue", "lack"],
  normal: [],
};

const NEG_KEYWORDS = ["bad", "fail", "corrupt", "scandal", "wrong", "poor", "weak", "hate", "against", "oppose", "reject", "fake", "fraud", "lie", "bribe", "shame", "useless", "incompetent", "protest", "angry", "disappointed"];
const POS_KEYWORDS = ["great", "good", "excellent", "support", "love", "well done", "progress", "development", "achievement", "proud", "impressive", "thank", "success", "win", "victory", "best", "outstanding", "hero"];

function heuristicAnalysis(content: string): { threatLevel: string; sentiment: string; sentimentScore: number; aiSummary: string } {
  const lower = content.toLowerCase();
  let threatLevel = "normal";
  for (const level of ["critical", "high", "elevated"]) {
    if (THREAT_KEYWORDS[level].some(k => lower.includes(k))) { threatLevel = level; break; }
  }
  const negCount = NEG_KEYWORDS.filter(k => lower.includes(k)).length;
  const posCount = POS_KEYWORDS.filter(k => lower.includes(k)).length;
  let sentiment = "neutral";
  let sentimentScore = 50;
  if (negCount > posCount) { sentiment = "negative"; sentimentScore = Math.max(10, 50 - negCount * 12); }
  else if (posCount > negCount) { sentiment = "positive"; sentimentScore = Math.min(95, 50 + posCount * 12); }
  const aiSummary = `[HEURISTIC] Threat: ${threatLevel.toUpperCase()} — Sentiment: ${sentiment} (${sentimentScore}/100). Content contains ${negCount} negative and ${posCount} positive signal words.`;
  return { threatLevel, sentiment, sentimentScore, aiSummary };
}

async function openAiAnalyze(content: string, platform: string): Promise<{ threatLevel: string; sentiment: string; sentimentScore: number; aiSummary: string; suggestedResponse: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 500,
      messages: [
        { role: "system", content: `You are a neutral public-service information analyst for Makueni County, Kenya. Assess content about county services, development projects, public safety and accountability. Do not create political persuasion or personal attacks. Respond with valid JSON only.` },
        { role: "user", content: `Analyze this ${platform} post concerning Makueni County public services:\n\n"${content}"\n\nRespond with JSON: { "threatLevel": "normal"|"elevated"|"high"|"critical", "sentiment": "positive"|"neutral"|"negative", "sentimentScore": 0-100, "aiSummary": "2-sentence analysis", "suggestedResponse": "1-2 sentence counter-narrative if needed, else empty string" }` },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, ""));
    return {
      threatLevel: parsed.threatLevel ?? "normal",
      sentiment: parsed.sentiment ?? "neutral",
      sentimentScore: Number(parsed.sentimentScore ?? 50),
      aiSummary: parsed.aiSummary ?? "",
      suggestedResponse: parsed.suggestedResponse ?? "",
    };
  } catch {
    const h = heuristicAnalysis(content);
    return { ...h, suggestedResponse: "" };
  }
}

async function openAiGenerateResponse(content: string, platform: string, threatLevel: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: `You are a neutral Makueni County public information officer. Draft a factual, respectful public-service update for ${platform}. Do not promote candidates, attack people or invent facts.` },
        { role: "user", content: `Draft a ${platform} counter-narrative response to this ${threatLevel}-level threat:\n\n"${content}"\n\nWrite only the response text, no preamble.` },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    return "Makueni County will share a verified update when the relevant department confirms the facts and next steps.";
  }
}

// ─── Narrative Score ─────────────────────────────────────────────────────────

router.get("/narrative-score", async (req, res) => {
  const mentions = (await db.select().from(narrativeMentionsTable)).filter(m => !isOutOfCountyText([m.author, m.content, m.url].join(" ")));
  const responses = await db.select().from(narrativeResponsesTable).where(eq(narrativeResponsesTable.status, "pending_approval"));
  const open = mentions.filter(m => m.status === "open").length;
  const criticalCount = mentions.filter(m => m.threatLevel === "critical").length;
  const responded = mentions.filter(m => m.status === "responded").length;
  const positive = mentions.filter(m => m.sentiment === "positive").length;
  const negative = mentions.filter(m => m.sentiment === "negative").length;
  const byPlatformMap = new Map<string, number>();
  for (const m of mentions) byPlatformMap.set(m.platform, (byPlatformMap.get(m.platform) ?? 0) + 1);
  const byPlatform = Array.from(byPlatformMap, ([label, count]) => ({ label, count }));
  const score = Math.max(0, Math.min(100, 100 - open * 5 - criticalCount * 10));
  res.json({ score, trend: open > 5 ? "down" : open < 2 ? "up" : "stable", openThreats: open, criticalThreats: criticalCount, totalMentions: mentions.length, responded, positive, negative, byPlatform, pendingApproval: responses.length });
});
// ─── Mentions ────────────────────────────────────────────────────────────────

router.get("/mentions", async (req, res) => {
  const { threatLevel, status } = req.query as Record<string, string>;
  const conditions = [];
  if (threatLevel) conditions.push(eq(narrativeMentionsTable.threatLevel, threatLevel));
  if (status) conditions.push(eq(narrativeMentionsTable.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  const mentions = (await db.select().from(narrativeMentionsTable).where(where).orderBy(desc(narrativeMentionsTable.detectedAt))).filter(m => !isOutOfCountyText([m.author, m.content, m.url].join(" ")));
  res.json(mentions);
});

router.post("/mentions", async (req, res) => {
  const { platform, content, author, url, threatLevel, source = "manual", engagementCount = 0 } = req.body;
  if (!platform || !content) { res.status(400).json({ error: "platform and content required" }); return; }
  if (isOutOfCountyText(content)) { res.status(400).json({ error: "Only Makueni County public-service content is accepted" }); return; }
  const analysis = heuristicAnalysis(content);
  const [mention] = await db.insert(narrativeMentionsTable).values({
    platform, content, author, url,
    threatLevel: threatLevel ?? analysis.threatLevel,
    status: "open",
    sentiment: analysis.sentiment,
    sentimentScore: analysis.sentimentScore,
    source,
    engagementCount,
  }).returning();
  res.status(201).json(mention);
});

router.post("/mentions/:id/respond", async (req, res) => {
  const { counterNarrative, status = "responded" } = req.body;
  if (!counterNarrative) { res.status(400).json({ error: "counterNarrative required" }); return; }
  const [mention] = await db.update(narrativeMentionsTable).set({ counterNarrative, status, respondedAt: new Date() }).where(eq(narrativeMentionsTable.id, parseInt(req.params.id))).returning();
  if (!mention) { res.status(404).json({ error: "Not found" }); return; }
  res.json(mention);
});

// ─── AI Analysis ─────────────────────────────────────────────────────────────

router.post("/ai-analyze", async (req, res) => {
  const { content, platform = "Unknown", mentionId } = req.body;
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  const analysis = await openAiAnalyze(content, platform);
  if (mentionId) {
    await db.update(narrativeMentionsTable).set({
      threatLevel: analysis.threatLevel,
      sentiment: analysis.sentiment,
      sentimentScore: analysis.sentimentScore,
      aiSummary: analysis.aiSummary,
      aiAnalyzed: true,
    }).where(eq(narrativeMentionsTable.id, mentionId));
  }
  res.json(analysis);
});

router.post("/ai-generate-response", async (req, res) => {
  const { content, platform = "Unknown", threatLevel = "normal", mentionId } = req.body;
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  const responseText = await openAiGenerateResponse(content, platform, threatLevel);
  if (mentionId) {
    await db.insert(narrativeResponsesTable).values({
      mentionId, platform, content: responseText, draftedBy: process.env.OPENAI_API_KEY ? "ai" : "template", status: "pending_approval",
    });
  }
  res.json({ response: responseText, aiGenerated: !!process.env.OPENAI_API_KEY });
});

// ─── AI Rebuttal Center ──────────────────────────────────────────────────────

const CHAR_LIMITS: Record<string, number> = {
  "Twitter/X": 280,
  "Facebook": 500,
  "WhatsApp": 450,
  "Press Statement": 800,
  "Baraza Speech": 600,
  "SMS": 160,
  "TikTok Caption": 150,
};

router.post("/ai-draft-rebuttal", async (req, res) => {
  const { attack, platform = "Twitter/X", urgency = "planned" } = req.body as {
    attack: string; platform?: string; urgency?: string;
  };
  if (!attack?.trim()) { res.status(400).json({ error: "attack text required" }); return; }

  const charLimit = CHAR_LIMITS[platform] ?? 400;

  const BASE = `Neutral public information officer for Makueni County. Prepare a ${urgency === "live" ? "live urgent" : "planned"} service update for ${platform} (max ${charLimit} chars). Do not promote candidates, attack people or invent claims. Use only verifiable facts and note when details require confirmation. Output ONLY raw JSON, no markdown.`;

  const ATTACK_SNIPPET = attack.substring(0, 400);

  const VARIATIONS = [
    { tone: "FACTUAL COUNTER", angle: "Cite specific Makueni achievements/data to disprove the claim.", schema: `{"tone":"FACTUAL COUNTER","angle":"string","content":"string"}` },
    { tone: "FIRM DENIAL",     angle: "Direct, authoritative, dignified denial with brief rationale. No aggression.", schema: `{"tone":"FIRM DENIAL","angle":"string","content":"string"}` },
    { tone: "BRIDGE & PIVOT",  angle: "Acknowledge voter frustration, pivot to positive vision and commitment.", schema: `{"tone":"BRIDGE & PIVOT","angle":"string","content":"string"}` },
  ];

  const makeCall = (v: typeof VARIATIONS[0]) =>
    openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: `${BASE}\nTone: ${v.tone}. ${v.angle}\nSchema: ${v.schema}\nContent must be under ${charLimit} chars.` },
        { role: "user", content: `Draft a ${v.tone} rebuttal for this attack: "${ATTACK_SNIPPET}"` },
      ],
    });

  try {
    const [r1, r2, r3] = await Promise.all(VARIATIONS.map(makeCall));

    const parseOne = (res: any, fallbackTone: string) => {
      const text = res.choices[0]?.message?.content ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return { tone: fallbackTone, angle: "", content: "" };
      try { return JSON.parse(m[0]); } catch { return { tone: fallbackTone, angle: "", content: "" }; }
    };

    const rebuttals = [r1, r2, r3].map((r, i) => {
      const parsed = parseOne(r, VARIATIONS[i].tone);
      return {
        tone: parsed.tone ?? VARIATIONS[i].tone,
        angle: parsed.angle ?? "",
        content: parsed.content ?? "",
        characterCount: (parsed.content ?? "").length,
        platform,
        charLimit,
      };
    });

    res.json({ rebuttals, platform, attack: ATTACK_SNIPPET });
  } catch (err) {
    req.log.error({ err }, "ai-draft-rebuttal failed");
    res.status(500).json({ error: "Rebuttal generation failed. Please retry." });
  }
});

// ─── Response Queue (Approval Workflow) ──────────────────────────────────────

router.get("/responses", async (req, res) => {
  const { status } = req.query as Record<string, string>;
  const conditions = status ? [eq(narrativeResponsesTable.status, status)] : [];
  const where = conditions.length ? and(...conditions) : undefined;
  const responses = (await db.select().from(narrativeResponsesTable).where(where).orderBy(desc(narrativeResponsesTable.createdAt))).filter(r => !isOutOfCountyText([r.content, r.platform].join(" ")));
  res.json(responses);
});

router.post("/responses", async (req, res) => {
  const { mentionId, platform, content, draftedBy = "manual" } = req.body;
  if (!platform || !content) { res.status(400).json({ error: "platform and content required" }); return; }
  const [response] = await db.insert(narrativeResponsesTable).values({ mentionId, platform, content, draftedBy, status: "pending_approval" }).returning();
  res.status(201).json(response);
});

router.patch("/responses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, approvedBy, rejectionReason, content } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (content) updates.content = content;
  if (status === "approved") { updates.approvedBy = approvedBy ?? "Campaign Manager"; updates.approvedAt = new Date(); }
  if (status === "published") updates.publishedAt = new Date();
  if (status === "rejected" && rejectionReason) updates.rejectionReason = rejectionReason;
  const [response] = await db.update(narrativeResponsesTable).set(updates).where(eq(narrativeResponsesTable.id, id)).returning();
  if (!response) { res.status(404).json({ error: "Not found" }); return; }
  res.json(response);
});

router.delete("/responses/:id", async (req, res) => {
  await db.delete(narrativeResponsesTable).where(eq(narrativeResponsesTable.id, parseInt(req.params.id)));
  res.json({ ok: true });
});

// ─── Platform Integrations ───────────────────────────────────────────────────

router.get("/platform-integrations", async (req, res) => {
  const platforms = await db.select().from(platformIntegrationsTable).orderBy(platformIntegrationsTable.platform);
  res.json(platforms);
});

router.post("/platform-integrations", async (req, res) => {
  const { platform, apiKey, apiSecret, accessToken, accessTokenSecret, pageId, bearerToken, rssUrl, webhookUrl, isActive } = req.body;
  if (!platform) { res.status(400).json({ error: "platform required" }); return; }
  const existing = await db.select().from(platformIntegrationsTable).where(eq(platformIntegrationsTable.platform, platform));
  if (existing.length > 0) {
    const [updated] = await db.update(platformIntegrationsTable).set({ apiKey, apiSecret, accessToken, accessTokenSecret, pageId, bearerToken, rssUrl, webhookUrl, isActive: isActive ?? false, updatedAt: new Date() }).where(eq(platformIntegrationsTable.platform, platform)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(platformIntegrationsTable).values({ platform, apiKey, apiSecret, accessToken, accessTokenSecret, pageId, bearerToken, rssUrl, webhookUrl, isActive: isActive ?? false }).returning();
    res.status(201).json(created);
  }
});

// ─── Scan Engine ─────────────────────────────────────────────────────────────

const SIMULATED_MENTIONS: Array<{ platform: string; author: string; content: string; engagementCount: number }> = [];

router.post("/scan", async (req, res) => {
  const { platform = "all", query = "Makueni County public services" } = req.body;
  const [scan] = await db.insert(narrativeScansTable).values({ platform, query, status: "running" }).returning();
  (async () => {
    try {
      const platformIntegration = platform !== "all"
        ? (await db.select().from(platformIntegrationsTable).where(eq(platformIntegrationsTable.platform, platform)))[0]
        : null;
      const isReal = platformIntegration?.isActive && (platformIntegration.bearerToken || platformIntegration.rssUrl);
      const toInsert = !isReal
        ? SIMULATED_MENTIONS.filter(m => platform === "all" || m.platform.toLowerCase().includes(platform.toLowerCase()))
        : [];
      let count = 0;
      for (const m of toInsert) {
        const analysis = heuristicAnalysis(m.content);
        await db.insert(narrativeMentionsTable).values({
          platform: m.platform, content: m.content, author: m.author,
          threatLevel: analysis.threatLevel, sentiment: analysis.sentiment,
          sentimentScore: analysis.sentimentScore, source: "scan",
          engagementCount: m.engagementCount, status: "open",
        });
        count++;
      }
      await db.update(narrativeScansTable).set({ status: "complete", mentionsFound: count }).where(eq(narrativeScansTable.id, scan.id));
    } catch (err: any) {
      await db.update(narrativeScansTable).set({ status: "failed", errorMessage: String(err?.message ?? err) }).where(eq(narrativeScansTable.id, scan.id));
    }
  })();
  res.status(202).json({ scanId: scan.id, message: "Scan initiated" });
});

router.get("/scans", async (req, res) => {
  const scans = (await db.select().from(narrativeScansTable).orderBy(desc(narrativeScansTable.createdAt))).filter(scan => !isOutOfCountyText(scan.query)).slice(0, 20);
  res.json(scans);
});

// ─── Competitors ─────────────────────────────────────────────────────────────

router.get("/competitors", async (req, res) => {
  const competitors = (await db.select().from(competitorsTable).orderBy(competitorsTable.name)).filter(c => !isOutOfCountyText([c.name, c.constituency, ...(Array.isArray(c.strengths) ? c.strengths : []), ...(Array.isArray(c.weaknesses) ? c.weaknesses : [])].join(" ")));
  res.json(competitors);
});

router.post("/competitors", async (req, res) => {
  const { name, party, constituency, strengths = [], weaknesses = [], promisesMade = [] } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  if (isOutOfCountyText([name, constituency].join(" "))) { res.status(400).json({ error: "Only Makueni County records are accepted" }); return; }
  const [competitor] = await db.insert(competitorsTable).values({ name, party, constituency, strengths, weaknesses, promisesMade, promisesKept: 0, promisesBroken: 0 }).returning();
  res.status(201).json(competitor);
});

// ─── War Room Briefs ─────────────────────────────────────────────────────────

router.get("/briefs", async (req, res) => {
  const briefs = (await db.select().from(warRoomBriefsTable).orderBy(desc(warRoomBriefsTable.createdAt))).filter(b => !isOutOfCountyText([b.title, b.summary].join(" ")));
  res.json(briefs);
});

router.post("/briefs", async (req, res) => {
  const { title, summary, priority = "medium", category, actions = [] } = req.body;
  if (!title || !summary || !category) { res.status(400).json({ error: "title, summary, category required" }); return; }
  const [brief] = await db.insert(warRoomBriefsTable).values({ title, summary, priority, category, actions, status: "active" }).returning();
  res.status(201).json(brief);
});

export default router;
