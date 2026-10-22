import { publicSourceUrl, PUBLIC_LISTENING_COVERAGE } from "../lib/public-source-quality";
import { Router } from "express";
import { z } from "zod/v4";
import { db, socialMentionsTable, socialSourceHealthTable, narrativeMentionsTable, competitorsTable, campaignWards, currentCampaignProfile } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requirePermission } from "../lib/auth";
import { searchFreeMakueniWeb, classifySentiment } from "./makueni-free-ai";
import { searchScope, categoryQueries, categoryPrompt, type CategoryKey, type SearchScope } from "../lib/social-terms";
import { checkLinks } from "../lib/link-check";

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
  const text = [raw.summary, raw.url].filter((v): v is string => typeof v === "string").join(" ");
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
      summary: item.title + (item.snippet ? " — " + item.snippet.slice(0, 180) : ""),
      source: item.source, url: item.url,
      sentiment: classifySentiment(`${item.title} ${item.snippet}`),
      topic: categoryTopic(key, scope),
      date: item.publishedAt ?? "",
    },
    category: key,
    origin: "feed" as const,
  }));
}

/** Records the outcome of one source for this campaign (row-level security scopes the rows). */
async function recordSourceHealth(sourceKey: string, values: { sourceType: string; failed: boolean; count: number }, now: Date) {
  const set = {
    sourceType: values.sourceType,
    status: values.failed ? "error" : "healthy",
    lastAttemptAt: now,
    ...(values.failed ? {} : { lastSuccessAt: now }),
    lastItemCount: values.count,
    lastError: values.failed ? "Public-source scan failed for this category; inspect API logs and source availability." : null,
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

  const normalized = perCategory
    .flat()
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

  // Dedupe within this batch (by url, else summary).
  const seen = new Set<string>();
  const deduped = normalized.filter((m) => {
    const key = (m.url ?? m.summary).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Dedupe against already-stored mentions by url.
  const urls = deduped.map((m) => m.url).filter((u): u is string => !!u);
  let existingUrls = new Set<string>();
  if (urls.length > 0) {
    const rows = await db
      .select({ url: socialMentionsTable.url })
      .from(socialMentionsTable)
      .where(inArray(socialMentionsTable.url, urls));
    existingUrls = new Set(rows.map((r) => r.url).filter((u): u is string => !!u));
  }
  const fresh = deduped.filter((m) => !(m.url && existingUrls.has(m.url)));

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

  const now = new Date();
  await Promise.all(categories.map((cat) => recordSourceHealth(cat.key, {
    sourceType: freeMode || usedFallback.has(cat.key) ? "google_news_rss" : "openai_web_search",
    failed: failedCategories.has(cat.key),
    count: deduped.filter((mention) => mention.category === cat.key).length,
  }, now)));

  req.log.info({ scanned: deduped.length, inserted: inserted.length, links: linkSummary }, "social scan complete");
  return res.json({
    scanned: deduped.length, inserted: inserted.length, mentions: inserted,
    source: freeMode ? "public news search" : usedFallback.size ? "AI web search with public-news fallback" : "AI web search",
    failedCategories: [...failedCategories],
    skippedCategories,
    links: linkSummary,
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
