import { Router } from "express";
import { z } from "zod/v4";
import { db, socialMentionsTable, socialSourceHealthTable, narrativeMentionsTable, campaignWards, currentCampaignProfile } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requirePermission } from "../lib/auth";
import { searchFreeMakueniWeb, classifySentiment } from "./makueni-free-ai";

const router = Router();
// Social listening is open to every signed-in user (view, search, scan).
// Removing saved mentions still requires Intelligence write access.
router.use(requireAuth);

const SENTIMENTS = new Set(["positive", "negative", "neutral"]);

// Guard the expensive AI/web-search scan: only one runs at a time, with a
// short cooldown afterwards to prevent accidental or abusive credit burn.
const SCAN_COOLDOWN_MS = 15_000;
let scanInFlight = false;
let lastScanAt = 0;

const mentionsQuerySchema = z.object({
  category: z.enum(["candidate", "issues", "opponent"]).optional(),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

type CategoryKey = "candidate" | "issues" | "opponent";

/** Scan targets for the active campaign (candidate, constituency, county, wards). */
function campaignTerms() {
  const p = currentCampaignProfile();
  const candidate = (p?.candidateName ?? (p && !p.isPrimary ? "the candidate" : "the candidate"));
  const shortName = candidate.replace(/^(hon\.?|dr\.?|mr\.?|mrs\.?|ms\.?|eng\.?|prof\.?)\s+/i, "").trim();
  const place = p?.constituency ?? "your area";
  const county = p?.county ?? "";
  return { candidate, shortName, place, county, wards: campaignWards() };
}

function scanCategories() {
  const t = campaignTerms();
  return [
    { key: "candidate" as const, prompt: `public mentions, interviews, official notices, community forums and news about ${t.candidate} (also known as ${t.shortName}) in ${t.place} Constituency, ${t.county} County, Kenya` },
    { key: "issues" as const, prompt: `publicly reported ${t.place} Constituency ward-level service issues and projects (${t.wards.join(", ")}), including water, roads, health facilities, ECDE and schools, agriculture, markets, bursaries, budgets and development works` },
    { key: "opponent" as const, prompt: `public ${t.place} Constituency and ${t.county} County news, official notices, public participation, audit and budget documents, project delivery updates and documented service-delivery concerns` },
  ];
}

function queriesForCategory(key: CategoryKey): string[] {
  const t = campaignTerms();
  if (key === "candidate") {
    return [`"${t.shortName}" ${t.place}`, `"${t.shortName}" ${t.county}`, `"${t.shortName}"`];
  }
  if (key === "issues") {
    return [
      `${t.place} Constituency water roads health education agriculture`,
      `${t.place} ${t.wards.slice(0, 3).join(" OR ")} ward project`,
      `${t.place} borehole hospital market ECDE bursary`,
    ];
  }
  return [`${t.place} Constituency budget audit project`, `${t.county} County public participation service delivery`];
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

Prefer items from the last few months. If nothing relevant is found, return [].`;
}

type RawMention = {
  summary?: unknown;
  source?: unknown;
  url?: unknown;
  sentiment?: unknown;
  topic?: unknown;
  date?: unknown;
};

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Keeps results that are actually about this campaign. Names and wards must
 * match as whole words (so "Kee" no longer matches "keep"). County-level items
 * are kept for the issues/opponent categories, where county decisions matter.
 */
function isRelevant(raw: RawMention, category: CategoryKey): boolean {
  const t = campaignTerms();
  // Only the item's own text counts; the topic label is ours and would match every item.
  const text = [raw.summary, raw.url].filter((v): v is string => typeof v === "string").join(" ");
  const terms = [t.place, t.shortName, t.candidate, ...t.wards];
  if (category !== "candidate") terms.push(t.county);
  return terms.filter(x => x && x.length >= 3).some(term => new RegExp(`\\b${escapeRe(term)}\\b`, "i").test(text));
}

/** Free-mode scan of one category via public news search. */
async function freeCategoryScan(key: CategoryKey): Promise<{ raw: RawMention; category: CategoryKey }[] | null> {
  const t = campaignTerms();
  const settled = await Promise.allSettled(queriesForCategory(key).map((q) => searchFreeMakueniWeb(q, { strict: true })));
  const ok = settled.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof searchFreeMakueniWeb>>> => r.status === "fulfilled");
  if (!ok.length) return null;
  const seen = new Set<string>();
  return ok.flatMap(r => r.value).filter((item) => {
    const k = (item.url || item.title).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 15).map((item) => {
    const summary = item.title + (item.snippet ? " — " + item.snippet.slice(0, 180) : "");
    return {
      raw: {
        summary, source: item.source, url: item.url,
        sentiment: classifySentiment(`${item.title} ${item.snippet}`),
        topic: key === "candidate" ? `${t.shortName} coverage` : key === "issues" ? `${t.place} service delivery` : `${t.county} accountability`,
        date: item.publishedAt ?? "",
      } as RawMention,
      category: key,
    };
  });
}

router.post("/scan", async (req, res) => {
  if (scanInFlight) {
    return res.status(429).json({ error: "A scan is already in progress. Please wait." });
  }
  const sinceLast = Date.now() - lastScanAt;
  if (sinceLast < SCAN_COOLDOWN_MS) {
    return res.status(429).json({
      error: `Please wait ${Math.ceil((SCAN_COOLDOWN_MS - sinceLast) / 1000)}s before scanning again.`,
    });
  }
  scanInFlight = true;
  const failedCategories = new Set<string>();
  try {
  const categories = scanCategories();
  const freeMode = process.env.MAKUENI_AI_MODE === "free";
  const usedFallback = new Set<string>();
  const perCategory = await Promise.all(
    categories.map(async (cat) => {
      if (!freeMode) {
        try {
          const response = await openai.responses.create({
            model: "gpt-5.1",
            tools: [{ type: "web_search" }],
            input: buildInput(cat.prompt),
          });
          const text = response.output_text ?? "";
          const match = text.match(/\[[\s\S]*\]/);
          const arr = match ? (JSON.parse(match[0]) as unknown) : [];
          if (Array.isArray(arr)) return (arr as RawMention[]).map((raw) => ({ raw, category: cat.key }));
        } catch (err) {
          req.log.warn({ err, category: cat.key }, "AI web search unavailable; using public news search instead");
        }
        usedFallback.add(cat.key);
      }
      // Free mode, or the AI provider failed: public news search still works.
      try {
        const items = await freeCategoryScan(cat.key);
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
    .filter(({ raw, category }) => isRelevant(raw, category))
    .map(({ raw, category }) => {
      const summary = asStr(raw.summary);
      if (!summary) return null;
      const sentiment = (asStr(raw.sentiment) ?? "neutral").toLowerCase();
      return {
        summary: summary.slice(0, 280),
        source: asStr(raw.source)?.slice(0, 120) ?? null,
        url: asStr(raw.url)?.slice(0, 600) ?? null,
        sentiment: SENTIMENTS.has(sentiment) ? sentiment : "neutral",
        category,
        topic: asStr(raw.topic)?.slice(0, 80) ?? null,
        publishedAt: asStr(raw.date)?.slice(0, 40) ?? null,
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
  const toInsert = deduped.filter((m) => !(m.url && existingUrls.has(m.url)));

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
  await Promise.all(categories.map(async (cat) => {
    const failed = failedCategories.has(cat.key);
    const count = deduped.filter((mention) => mention.category === cat.key).length;
    await db.insert(socialSourceHealthTable).values({
      sourceKey: cat.key,
      sourceType: freeMode || usedFallback.has(cat.key) ? "google_news_rss" : "openai_web_search",
      status: failed ? "error" : "healthy",
      lastAttemptAt: now,
      lastSuccessAt: failed ? undefined : now,
      lastItemCount: count,
      lastError: failed ? "Public-source scan failed for this category; inspect API logs and source availability." : null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: socialSourceHealthTable.sourceKey,
      set: {
        sourceType: freeMode || usedFallback.has(cat.key) ? "google_news_rss" : "openai_web_search",
        status: failed ? "error" : "healthy",
        lastAttemptAt: now,
        ...(failed ? {} : { lastSuccessAt: now }),
        lastItemCount: count,
        lastError: failed ? "Public-source scan failed for this category; inspect API logs and source availability." : null,
        updatedAt: now,
      },
    });
  }));

  req.log.info({ scanned: deduped.length, inserted: inserted.length }, "social scan complete");
  return res.json({
    scanned: deduped.length, inserted: inserted.length, mentions: inserted,
    source: freeMode ? "public news search" : usedFallback.size ? "AI web search with public-news fallback" : "AI web search",
    failedCategories: [...failedCategories],
  });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    req.log.error({ err, name: error.name, message: error.message }, "social scan failed outside provider query handling");
    return res.status(500).json({
      error: "The scan reached the API but failed while processing or saving results. Check the Render API logs for the 'social scan failed outside provider query handling' entry.",
      code: "SOCIAL_SCAN_PROCESSING_FAILED",
    });
  } finally {
    scanInFlight = false;
    lastScanAt = Date.now();
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
