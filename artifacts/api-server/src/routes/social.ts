import { publicSourceUrl, PUBLIC_LISTENING_COVERAGE } from "../lib/public-source-quality";
import { Router } from "express";
import { z } from "zod/v4";
import { db, socialMentionsTable, socialSourceHealthTable, narrativeMentionsTable, competitorsTable, auditLogsTable, campaignWards, currentCampaignProfile } from "@workspace/db";
import { eq, and, desc, inArray, isNull, gte, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requirePermission } from "../lib/auth";
import { searchFreeMakueniWeb, classifySentiment } from "./makueni-free-ai";
import { searchScope, categoryQueries, categoryPrompt, type CategoryKey, type SearchScope } from "../lib/social-terms";
import { checkLinks } from "../lib/link-check";
import { cleanText, cleanSummary, dedupeStories } from "../lib/social-text";
import { fetchKenyanFeeds, searchYouTube, type SourceHealth, type SourceItem } from "../lib/social-sources";
import { classifyByRules, needsReview, classificationPrompt, parseAiClassifications, detectLanguage, COUNTED_MENTIONS_SQL, type Classification } from "../lib/social-classify";

const router = Router();
// Social listening is open to every signed-in user (view, search, scan).
// Removing saved mentions still requires Intelligence write access.
router.use(requireAuth);

const SENTIMENTS = new Set(["positive", "negative", "neutral"]);
const CATEGORY_KEYS: CategoryKey[] = ["candidate", "issues", "opponent", "competitor"];

// Guard the expensive AI/web-search scan per campaign: one scan at a time,
// with a short cooldown afterwards to prevent accidental or abusive credit
// burn. Campaigns never block each other.
const SCAN_COOLDOWN_MS = 15_000;
const scanState = new Map<number, { inFlight: boolean; lastAt: number }>();

const mentionsQuerySchema = z.object({
  category: z.enum(["candidate", "issues", "opponent", "competitor"]).optional(),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Search scope for the active campaign: seat, area, wards (lib/social-terms.ts). */
function campaignScope(): SearchScope {
  const p = currentCampaignProfile();
  return searchScope({
    seat: p?.seat ?? null, candidateName: p?.candidateName ?? null,
    county: p?.county ?? null, constituency: p?.constituency ?? null, wards: campaignWards(),
  });
}

/** Opponents the campaign has listed (competitors table, campaign-scoped by row-level security). */
async function campaignCompetitors(scope: SearchScope): Promise<string[]> {
  const rows = await db.select({ name: competitorsTable.name }).from(competitorsTable);
  const own = scope.candidate.toLowerCase();
  return [...new Set(rows.map(r => r.name.trim()).filter(n => n.length >= 3 && n.toLowerCase() !== own))];
}

function buildInput(prompt: string): string {
  return `Use web search to find the most recent and relevant items about: ${prompt}.

Return ONLY a JSON array (no prose, no markdown code fences) of up to 3 objects. Each object must have exactly these keys:
- "summary": a concise one-line summary, max 90 characters
- "source": the publication or platform name (e.g. "People Daily", "X/Twitter", "Facebook")
- "url": the direct source URL
- "sentiment": one of "positive", "negative", or "neutral" — judged only from the factual public-service impact
- "topic": a short 2-4 word topic tag
- "date": the publication date if known (e.g. "2026-05-26"), otherwise an empty string

Only include items you found through web search, with their real URL. Prefer items from the last few months. If nothing relevant is found, return [].`;
}

type RawMention = {
  summary?: unknown;
  source?: unknown;
  url?: unknown;
  sentiment?: unknown;
  topic?: unknown;
  date?: unknown;
};

/** Where an item came from: "ai" links are supplied by the model and must be checked; "feed" links come from a news feed. */
type Origin = "ai" | "feed";
type Collected = { raw: RawMention; category: CategoryKey; origin: Origin };

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Keeps results that are actually about this campaign. Names and places must
 * match as whole words (so "Kee" doesn't match "keep"). Candidate items must
 * name the candidate; opponent items must name a listed opponent; issue and
 * public-record items must name a place in the campaign's area.
 */
function isRelevant(raw: RawMention, category: CategoryKey, scope: SearchScope, competitors: string[]): boolean {
  // Only the item's own text counts; the topic label is ours and would match every item.
  // Normalised so decorative letters ("𝗞𝗮𝗶𝘁𝗶") match plain names ("Kaiti").
  const text = cleanText([raw.summary, raw.url].filter((v): v is string => typeof v === "string").join(" "));
  const terms = category === "candidate" ? [scope.shortName, scope.candidate]
    : category === "competitor" ? competitors
    : scope.national ? ["Kenya", ...scope.placeTerms] : scope.placeTerms;
  return terms.filter(x => x && x.length >= 3).some(term => new RegExp(`\\b${escapeRe(term)}\\b`, "i").test(text));
}

function categoryTopic(key: CategoryKey, scope: SearchScope): string {
  const area = scope.areaName || "Area";
  if (key === "candidate") return `${scope.shortName} coverage`;
  if (key === "issues") return `${area} service delivery`;
  if (key === "competitor") return "Opponent coverage";
  return `${scope.county || area} accountability`;
}

/** Free-mode scan of one category via public news search. */
async function freeCategoryScan(key: CategoryKey, scope: SearchScope, competitors: string[]): Promise<Collected[] | null> {
  const queries = categoryQueries(key, scope, competitors);
  if (!queries.length) return [];
  const settled = await Promise.allSettled(queries.map((q) => searchFreeMakueniWeb(q, { strict: true })));
  const ok = settled.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof searchFreeMakueniWeb>>> => r.status === "fulfilled");
  if (!ok.length) return null;
  const seen = new Set<string>();
  return ok.flatMap(r => r.value).filter((item) => {
    const k = (item.url || item.title).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 15).map((item) => ({
    raw: {
      summary: cleanSummary(item.title, item.snippet?.slice(0, 220), item.source),
      source: item.source, url: item.url,
      sentiment: classifySentiment(`${item.title} ${item.snippet}`),
      topic: categoryTopic(key, scope),
      date: item.publishedAt ?? "",
    },
    category: key,
    origin: "feed" as const,
  }));
}

const PUBLIC_RECORD_WORDS = /\b(budget|audit|auditor|public participation|county assembly|tender|procurement|controller of budget|bursary allocation)\b/i;

/**
 * Sorts a feed or video item into a category by what it names: the
 * candidate, a listed opponent, or a place in the campaign's area. Items that
 * name none of these are dropped. National campaigns take only candidate and
 * opponent items from feeds, since every Kenyan story is "in the area".
 */
function categorise(item: SourceItem, scope: SearchScope, competitors: string[]): CategoryKey | null {
  const text = cleanText(`${item.title} ${item.text}`);
  const names = (list: string[]) => list.filter(n => n && n.length >= 3).some(n => new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(text));
  if (names([scope.shortName, scope.candidate])) return "candidate";
  if (names(competitors)) return "competitor";
  if (scope.national || !names(scope.placeTerms)) return null;
  return PUBLIC_RECORD_WORDS.test(text) ? "opponent" : "issues";
}

/** Kenyan news feeds plus, when YOUTUBE_API_KEY is set, YouTube video search. */
async function collectFeedsAndVideos(scope: SearchScope, competitors: string[]): Promise<{ items: Collected[]; health: SourceHealth[] }> {
  const feeds = await fetchKenyanFeeds();
  const health = [...feeds.health];
  const found: SourceItem[] = [...feeds.items];
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (apiKey) {
    const queries = [...categoryQueries("candidate", scope).slice(0, 1), ...categoryQueries("competitor", scope, competitors).slice(0, 1)];
    const videos = await searchYouTube(queries, { apiKey });
    found.push(...videos.items);
    health.push(videos.health);
  }
  const items: Collected[] = [];
  for (const item of found) {
    const category = categorise(item, scope, competitors);
    if (!category) continue;
    items.push({
      raw: {
        summary: cleanSummary(item.title, item.text, item.source),
        source: item.source, url: item.url,
        sentiment: classifySentiment(`${item.title} ${item.text}`),
        topic: categoryTopic(category, scope),
        date: item.publishedAt ?? "",
      },
      category,
      origin: "feed",
    });
  }
  return { items: items.slice(0, 40), health };
}

/**
 * Labels mentions (sentiment, topic, language, urgency, confidence). Uses the
 * AI when one is configured and the scan isn't in free mode; anything the AI
 * doesn't return in a valid form falls back to the word-list classifier.
 */
async function classifyTexts(texts: string[], scope: SearchScope, useAi: boolean, log: { warn: (o: object, m: string) => void }): Promise<Classification[]> {
  const result: (Classification | undefined)[] = new Array(texts.length);
  if (useAi && texts.length) {
    const context = `${scope.candidate}${scope.office ? `, ${scope.office} race` : ""}${scope.areaLabel ? `, ${scope.areaLabel}` : ""}`;
    for (let start = 0; start < texts.length; start += 20) {
      const batch = texts.slice(start, start + 20).map((text, i) => ({ id: start + i + 1, text }));
      try {
        const response = await openai.responses.create({ model: "gpt-5.1", input: classificationPrompt(batch, context) });
        const labels = parseAiClassifications(response.output_text ?? "", batch.map(b => b.id));
        for (const b of batch) result[b.id - 1] = labels.get(b.id);
      } catch (err) {
        log.warn({ err }, "AI classification unavailable; using word-list classification");
        break;
      }
    }
  }
  return texts.map((text, i) => result[i] ?? classifyByRules(text));
}

function classificationColumns(c: Classification, fallbackTopic: string | null) {
  return {
    sentiment: c.sentiment,
    topic: c.topic ?? fallbackTopic,
    language: c.language,
    urgency: c.urgency,
    confidence: c.confidence,
    classifiedBy: c.classifiedBy,
    reviewStatus: needsReview(c) ? "pending" : "auto",
  };
}

const actorOf = (req: { currentUser?: { email?: string | null; name?: string | null } }) =>
  ({ email: req.currentUser?.email ?? "unknown", name: req.currentUser?.name ?? req.currentUser?.email ?? "unknown" });

async function audit(req: { currentUser?: { email?: string | null; name?: string | null } }, action: string, details: string) {
  try {
    const a = actorOf(req);
    await db.insert(auditLogsTable).values({ userEmail: a.email, userName: a.name, action, module: "social", details, severity: "info" });
  } catch { /* non-critical */ }
}

/** Records the outcome of one source for this campaign (row-level security scopes the rows). */
async function recordSourceHealth(sourceKey: string, values: { sourceType: string; failed: boolean; count: number; error?: string }, now: Date) {
  const set = {
    sourceType: values.sourceType,
    status: values.failed ? "error" : "healthy",
    lastAttemptAt: now,
    ...(values.failed ? {} : { lastSuccessAt: now }),
    lastItemCount: values.count,
    lastError: values.failed ? (values.error ?? "Public-source scan failed for this category; inspect API logs and source availability.") : null,
    updatedAt: now,
  };
  // Update-then-insert rather than ON CONFLICT, so this works whether or not
  // database isolation (and its per-campaign unique key) is active.
  const updated = await db.update(socialSourceHealthTable).set(set)
    .where(eq(socialSourceHealthTable.sourceKey, sourceKey)).returning({ id: socialSourceHealthTable.id });
  if (!updated.length) await db.insert(socialSourceHealthTable).values({ sourceKey, ...set });
}

router.post("/scan", async (req, res) => {
  const campaignKey = req.campaignId ?? 0;
  const state = scanState.get(campaignKey) ?? { inFlight: false, lastAt: 0 };
  scanState.set(campaignKey, state);
  if (state.inFlight) {
    return res.status(429).json({ error: "A scan is already in progress for this campaign. Please wait." });
  }
  const sinceLast = Date.now() - state.lastAt;
  if (sinceLast < SCAN_COOLDOWN_MS) {
    return res.status(429).json({
      error: `Please wait ${Math.ceil((SCAN_COOLDOWN_MS - sinceLast) / 1000)}s before scanning again.`,
    });
  }
  state.inFlight = true;
  const failedCategories = new Set<string>();
  const skippedCategories: string[] = [];
  try {
  const scope = campaignScope();
  const competitors = await campaignCompetitors(scope);
  const categories = CATEGORY_KEYS.map(key => ({ key, prompt: categoryPrompt(key, scope, competitors) }))
    .filter(cat => {
      if (cat.prompt) return true;
      skippedCategories.push(cat.key); // e.g. no opponents listed yet
      return false;
    });
  const freeMode = process.env.MAKUENI_AI_MODE === "free";
  const usedFallback = new Set<string>();
  // Kenyan news feeds (and YouTube when configured) run alongside the category searches.
  const extraPromise = collectFeedsAndVideos(scope, competitors).catch((err) => {
    req.log.error({ err }, "feed and video collection failed");
    return { items: [] as Collected[], health: [] as SourceHealth[] };
  });
  const perCategory = await Promise.all(
    categories.map(async (cat): Promise<Collected[]> => {
      if (!freeMode) {
        try {
          const response = await openai.responses.create({
            model: "gpt-5.1",
            tools: [{ type: "web_search" }],
            input: buildInput(cat.prompt!),
          });
          const text = response.output_text ?? "";
          const match = text.match(/\[[\s\S]*\]/);
          const arr = match ? (JSON.parse(match[0]) as unknown) : [];
          if (Array.isArray(arr)) return (arr as RawMention[]).map((raw) => ({ raw, category: cat.key, origin: "ai" as const }));
        } catch (err) {
          req.log.warn({ err, category: cat.key }, "AI web search unavailable; using public news search instead");
        }
        usedFallback.add(cat.key);
      }
      // Free mode, or the AI provider failed: public news search still works.
      try {
        const items = await freeCategoryScan(cat.key, scope, competitors);
        if (items === null) { failedCategories.add(cat.key); return []; }
        return items;
      } catch (err) {
        failedCategories.add(cat.key);
        req.log.error({ err, category: cat.key }, "social scan category failed");
        return [];
      }
    }),
  );

  const extra = await extraPromise;
  const normalized = [...perCategory.flat(), ...extra.items]
    .filter(({ raw, category }) => isRelevant(raw, category, scope, competitors))
    .map(({ raw, category, origin }) => {
      const summary = asStr(raw.summary);
      const url = publicSourceUrl(raw.url);
      if (!summary || !url) return null;
      const sentiment = (asStr(raw.sentiment) ?? "neutral").toLowerCase();
      return {
        summary: summary.slice(0, 280),
        source: asStr(raw.source)?.slice(0, 120) ?? null,
        url,
        sentiment: SENTIMENTS.has(sentiment) ? sentiment : "neutral",
        category,
        topic: asStr(raw.topic)?.slice(0, 80) ?? null,
        publishedAt: asStr(raw.date)?.slice(0, 40) ?? null,
        origin,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // One copy of each story across all sources (same link, or the same headline
  // from different outlets or aggregators), then skip stories already stored.
  const headline = (summary: string) => summary.split(" — ")[0];
  const deduped = dedupeStories(normalized.map((m) => ({ ...m, title: headline(m.summary) })));
  const recent = await db
    .select({ url: socialMentionsTable.url, summary: socialMentionsTable.summary })
    .from(socialMentionsTable)
    .orderBy(desc(socialMentionsTable.scannedAt))
    .limit(500);
  const known = recent.filter((r): r is { url: string; summary: string } => !!r.url).map((r) => ({ url: r.url, title: headline(r.summary) }));
  const fresh = dedupeStories(deduped, known).map(({ title: _title, ...m }) => m);

  // Links supplied by the AI must open; dead or unsafe links are dropped.
  const checkedAt = new Date();
  const checks = await checkLinks(fresh.filter(m => m.origin === "ai").map(m => m.url));
  const linkSummary = { verified: 0, unconfirmed: 0, dropped: 0, fromFeed: 0 };
  const toInsert: (typeof socialMentionsTable.$inferInsert)[] = [];
  for (const { origin, ...m } of fresh) {
    if (origin === "feed") {
      linkSummary.fromFeed++;
      toInsert.push({ ...m, linkStatus: "feed", linkCheckedAt: null });
      continue;
    }
    const check = checks.get(m.url);
    if (!check || check.status === "broken") { linkSummary.dropped++; continue; }
    linkSummary[check.status]++;
    toInsert.push({ ...m, linkStatus: check.status, linkCheckedAt: checkedAt });
  }

  // Label each new mention. The AI (when configured) only labels the text; it never adds items.
  const labels = await classifyTexts(toInsert.map(m => m.summary), scope, !freeMode, req.log);
  toInsert.forEach((m, i) => Object.assign(m, classificationColumns(labels[i], m.topic ?? null)));

  let inserted: (typeof socialMentionsTable.$inferSelect)[] = [];
  if (toInsert.length > 0) {
    inserted = await db.insert(socialMentionsTable).values(toInsert).returning();
    // Share saved public-source records with Political Intelligence / Narrative Response.
    // Preserve the original URL so the two modules refer to the same source.
    try {
      const sourceUrls = inserted.map(m => m.url).filter((url): url is string => !!url);
      const already = sourceUrls.length ? await db.select({ url: narrativeMentionsTable.url })
        .from(narrativeMentionsTable).where(inArray(narrativeMentionsTable.url, sourceUrls)) : [];
      const known = new Set(already.map(m => m.url));
      const incoming = inserted.filter(m => m.url && !known.has(m.url)).map(m => ({
        platform: m.source || "public_web",
        content: m.summary,
        author: m.source || "Public source",
        url: m.url,
        threatLevel: "normal",
        status: "open",
        sentiment: m.sentiment,
        source: "social_listening",
        aiSummary: "Imported public-source mention; not independently verified.",
        aiAnalyzed: false,
      }));
      if (incoming.length) await db.insert(narrativeMentionsTable).values(incoming);
    } catch (syncError) {
      req.log.warn({ err: syncError }, "Social mentions saved; narrative sync pending");
    }
  }

  // Catch up older mentions saved before classification existed (a few per scan).
  let backfilled = 0;
  try {
    const older = await db.select({ id: socialMentionsTable.id, summary: socialMentionsTable.summary, topic: socialMentionsTable.topic })
      .from(socialMentionsTable).where(isNull(socialMentionsTable.classifiedBy)).limit(50);
    if (older.length) {
      const olderLabels = await classifyTexts(older.map(o => o.summary), scope, !freeMode, req.log);
      for (const [i, o] of older.entries()) {
        await db.update(socialMentionsTable).set(classificationColumns(olderLabels[i], o.topic)).where(eq(socialMentionsTable.id, o.id));
      }
      backfilled = older.length;
    }
  } catch (err) {
    req.log.warn({ err }, "classifying older mentions failed; will retry on the next scan");
  }

  const now = new Date();
  await Promise.all(categories.map((cat) => recordSourceHealth(cat.key, {
    sourceType: freeMode || usedFallback.has(cat.key) ? "google_news_rss" : "openai_web_search",
    failed: failedCategories.has(cat.key),
    count: deduped.filter((mention) => mention.category === cat.key).length,
  }, now)));
  await Promise.all(extra.health.map((h) => recordSourceHealth(h.key, {
    sourceType: h.key === "youtube" ? "youtube_api" : "rss",
    failed: !h.ok,
    count: h.items,
    error: h.error,
  }, now)));

  req.log.info({ scanned: deduped.length, inserted: inserted.length, links: linkSummary }, "social scan complete");
  return res.json({
    scanned: deduped.length, inserted: inserted.length, mentions: inserted,
    source: freeMode ? "public news search" : usedFallback.size ? "AI web search with public-news fallback" : "AI web search",
    failedCategories: [...failedCategories],
    skippedCategories,
    links: linkSummary,
    sources: extra.health.map(({ key, label, ok, items }) => ({ key, label, ok, items })),
    review: {
      pending: inserted.filter(m => m.reviewStatus === "pending").length,
      classifiedBy: freeMode ? "rules" : labels.some(l => l.classifiedBy === "ai") ? "ai" : "rules",
      olderMentionsClassified: backfilled,
    },
    area: scope.areaLabel || null,
    ...PUBLIC_LISTENING_COVERAGE,
    checkedAt: new Date().toISOString(),
  });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    req.log.error({ err, name: error.name, message: error.message }, "social scan failed outside provider query handling");
    return res.status(500).json({
      error: "The scan reached the API but failed while processing or saving results. Check the Render API logs for the 'social scan failed outside provider query handling' entry.",
      code: "SOCIAL_SCAN_PROCESSING_FAILED",
    });
  } finally {
    state.inFlight = false;
    state.lastAt = Date.now();
  }
});

// ── Review queue (SL-3.2) ─────────────────────────────────────────────
// Urgent items and uncertain opinions wait here; they don't count in totals
// until a person confirms them. POST routes need Intelligence write access.

router.get("/review", async (_req, res) => {
  const items = await db.select().from(socialMentionsTable)
    .where(eq(socialMentionsTable.reviewStatus, "pending"))
    .orderBy(desc(socialMentionsTable.scannedAt)).limit(200);
  res.json(items);
});

const reviewSchema = z.object({
  decision: z.enum(["confirm", "reject"]),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  urgency: z.enum(["high", "normal", "low"]).optional(),
  topic: z.string().trim().min(1).max(40).optional(),
});

router.post("/mentions/:id/review", async (req, res) => {
  const id = idParamSchema.safeParse(req.params);
  const body = reviewSchema.safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: "Choose confirm or reject; corrections must be valid labels." });
  const { decision, sentiment, urgency, topic } = body.data;
  const [updated] = await db.update(socialMentionsTable).set({
    reviewStatus: decision === "confirm" ? "confirmed" : "rejected",
    reviewedBy: actorOf(req).email,
    reviewedAt: new Date(),
    ...(sentiment ? { sentiment } : {}),
    ...(urgency ? { urgency } : {}),
    ...(topic ? { topic } : {}),
  }).where(eq(socialMentionsTable.id, id.data.id)).returning();
  if (!updated) return res.status(404).json({ error: "Mention not found" });
  const changes = [sentiment && `sentiment ${sentiment}`, urgency && `urgency ${urgency}`, topic && `topic ${topic}`].filter(Boolean).join(", ");
  await audit(req, decision === "confirm" ? "Confirmed social mention" : "Rejected social mention", `#${updated.id}${changes ? ` (${changes})` : ""}: ${updated.summary.slice(0, 120)}`);
  return res.json(updated);
});

// ── Field-reported mentions (SL-3.3) ───────────────────────────────────
// Radio, barazas, churches, markets: what staff heard in person.

const fieldMentionSchema = z.object({
  summary: z.string().trim().min(5).max(500),
  sourceName: z.string().trim().min(2).max(120),
  sourceType: z.enum(["radio", "baraza", "church", "market", "meeting", "other"]),
  ward: z.string().trim().min(1).max(80),
  category: z.enum(["candidate", "issues", "competitor", "opponent"]),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  urgency: z.enum(["high", "normal", "low"]).optional(),
  heardOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post("/field-mentions", async (req, res) => {
  const parsed = fieldMentionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the field report" });
  const f = parsed.data;
  if (f.ward !== "all" && !campaignWards().includes(f.ward)) {
    return res.status(400).json({ error: "Choose one of this campaign's wards (or the whole area)." });
  }
  const rules = classifyByRules(f.summary);
  const reporter = actorOf(req).email;
  const [created] = await db.insert(socialMentionsTable).values({
    summary: cleanText(f.summary).slice(0, 500),
    source: `${f.sourceName} (${f.sourceType})`,
    url: null,
    sentiment: f.sentiment,
    category: f.category,
    topic: rules.topic,
    publishedAt: f.heardOn ?? null,
    linkStatus: "field",
    language: detectLanguage(f.summary),
    urgency: f.urgency ?? rules.urgency,
    confidence: null,
    classifiedBy: "staff",
    reviewStatus: "confirmed",
    reviewedBy: reporter,
    reviewedAt: new Date(),
    channel: "field",
    ward: f.ward,
    reportedBy: reporter,
  }).returning();
  await audit(req, "Logged field mention", `#${created.id} ${f.sourceType} · ${f.sourceName} · ${f.ward}: ${created.summary.slice(0, 120)}`);
  return res.status(201).json(created);
});

// ── Report (SL-3.4) ────────────────────────────────────────────────────

router.get("/report", async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const inWindow = gte(socialMentionsTable.scannedAt, since);
  const counted = and(inWindow, sql.raw(COUNTED_MENTIONS_SQL));
  const group = async (column: typeof socialMentionsTable.source | typeof socialMentionsTable.topic | typeof socialMentionsTable.language | typeof socialMentionsTable.sentiment | typeof socialMentionsTable.channel | typeof socialMentionsTable.classifiedBy, limit = 10) =>
    (await db.select({ key: column, count: sql<number>`count(*)::int` }).from(socialMentionsTable).where(counted)
      .groupBy(column).orderBy(desc(sql`count(*)`)).limit(limit))
      .map(r => ({ key: r.key ?? "unknown", count: Number(r.count) }));

  const [status] = await db.select({
    counted: sql<number>`count(*) FILTER (WHERE ${sql.raw(COUNTED_MENTIONS_SQL)})::int`,
    pending: sql<number>`count(*) FILTER (WHERE review_status = 'pending')::int`,
    rejected: sql<number>`count(*) FILTER (WHERE review_status = 'rejected')::int`,
    urgent: sql<number>`count(*) FILTER (WHERE urgency = 'high' AND review_status IS DISTINCT FROM 'rejected')::int`,
  }).from(socialMentionsTable).where(inWindow);

  const weekly = await db.select({
    week: sql<string>`to_char(date_trunc('week', ${socialMentionsTable.scannedAt}), 'YYYY-MM-DD')`,
    positive: sql<number>`count(*) FILTER (WHERE ${socialMentionsTable.sentiment} = 'positive')::int`,
    negative: sql<number>`count(*) FILTER (WHERE ${socialMentionsTable.sentiment} = 'negative')::int`,
    neutral: sql<number>`count(*) FILTER (WHERE ${socialMentionsTable.sentiment} = 'neutral')::int`,
  }).from(socialMentionsTable).where(counted)
    .groupBy(sql`date_trunc('week', ${socialMentionsTable.scannedAt})`).orderBy(sql`date_trunc('week', ${socialMentionsTable.scannedAt})`);

  res.json({
    asOf: new Date().toISOString(),
    days,
    since: since.toISOString(),
    totals: { counted: Number(status?.counted ?? 0), pendingReview: Number(status?.pending ?? 0), rejected: Number(status?.rejected ?? 0), urgent: Number(status?.urgent ?? 0) },
    bySentiment: await group(socialMentionsTable.sentiment),
    bySource: await group(socialMentionsTable.source),
    byChannel: (await group(socialMentionsTable.channel)).map(r => ({ ...r, key: r.key === "unknown" ? "web" : r.key })),
    byLanguage: await group(socialMentionsTable.language),
    topTopics: await group(socialMentionsTable.topic, 8),
    labelledBy: await group(socialMentionsTable.classifiedBy),
    weekly: weekly.map(w => ({ week: w.week, positive: Number(w.positive), negative: Number(w.negative), neutral: Number(w.neutral) })),
    notes: [
      PUBLIC_LISTENING_COVERAGE.coverage,
      PUBLIC_LISTENING_COVERAGE.sentimentMethod,
      "Counts include only mentions accepted automatically or confirmed by a reviewer; pending and rejected items are excluded.",
      "Dates are when a mention was collected or logged, not necessarily when it was published.",
      "Field mentions are entered by staff and reflect what was heard in person; they are not a sample of public opinion.",
    ],
  });
});

router.get("/search-feed", async (req, res) => {
  const platformSchema = z.enum(["facebook", "x", "tiktok"]);
  const parsedPlatform = platformSchema.safeParse(req.query.platform);
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  if (!parsedPlatform.success || !query) {
    return res.status(400).json({ error: "Choose a supported platform and enter a search term." });
  }
  const platform = parsedPlatform.data;
  const domain = platform === "facebook" ? "facebook.com" : platform === "x" ? "x.com" : "tiktok.com";
  try {
    // News search can't read inside Facebook, X or TikTok. Return news coverage
    // mentioning the platform plus a direct link to the platform's own live search.
    const [onPlatform, news] = await Promise.all([
      searchFreeMakueniWeb(`site:${domain} ${query}`),
      searchFreeMakueniWeb(`${query} ${platform === "x" ? "Twitter" : platform === "facebook" ? "Facebook" : "TikTok"}`),
    ]);
    const seen = new Set<string>();
    const results = [...onPlatform, ...news].filter(r => { const k = r.url.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const liveSearchUrl = platform === "facebook" ? `https://www.facebook.com/search/top?q=${encodeURIComponent(query)}`
      : platform === "x" ? `https://x.com/search?q=${encodeURIComponent(query)}&f=live`
      : `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
    return res.json({
      platform,
      query,
      checkedAt: new Date().toISOString(),
      coverage: "Indexed news and public pages only. Open the live search link to see current posts on the platform itself.",
      liveSearchUrl,
      results: results.slice(0, 10),
    });
  } catch (err) {
    req.log.error({ err, platform }, "social platform search failed");
    return res.status(502).json({ error: "The public search provider could not return results. Please retry later." });
  }
});

router.get("/coverage", (_req, res) => res.json(PUBLIC_LISTENING_COVERAGE));

router.get("/source-health", async (_req, res) => {
  const rows = await db.select().from(socialSourceHealthTable).orderBy(socialSourceHealthTable.sourceKey);
  res.json(rows);
});

router.get("/mentions", async (req, res) => {
  const parsed = mentionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query parameters" });
  }
  const { category, sentiment } = parsed.data;
  const conditions = [];
  if (category) conditions.push(eq(socialMentionsTable.category, category));
  if (sentiment) conditions.push(eq(socialMentionsTable.sentiment, sentiment));
  const where = conditions.length ? and(...conditions) : undefined;
  const mentions = await db
    .select()
    .from(socialMentionsTable)
    .where(where)
    .orderBy(desc(socialMentionsTable.scannedAt))
    .limit(300);
  return res.json(mentions);
});

router.delete("/mentions/:id", requirePermission("intelligence", "write"), async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid mention id" });
  }
  await db.delete(socialMentionsTable).where(eq(socialMentionsTable.id, parsed.data.id));
  return res.json({ ok: true });
});

export default router;
