import { cleanText, stripSourceSuffix } from "./social-text";

/**
 * Free public sources for social listening (docs/SOCIAL_LISTENING_PLAN.md, SL-2).
 * Every collector returns the same item shape and reports its own health.
 */

export type SourceItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  text: string;
  /** Which collector found it, e.g. "kenyan_feeds", "youtube". */
  collector: string;
};

export type SourceHealth = { key: string; label: string; ok: boolean; items: number; error?: string };

type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const UA = { "User-Agent": "Mozilla/5.0 (compatible; KenyaCampaignListening/1.0)" };

/**
 * Kenyan news feeds checked on 22 Oct 2026: each returned valid RSS with
 * same-day items. Not included because they failed that check: Nation (403),
 * Citizen Digital (400), The Star (404), People Daily (HTML, not RSS),
 * Kenya News Agency (connection failed). Re-check before adding them.
 */
export const KENYAN_FEEDS: { name: string; url: string; language: "en" | "sw" }[] = [
  { name: "The Standard", url: "https://www.standardmedia.co.ke/rss/headlines.php", language: "en" },
  { name: "Tuko", url: "https://www.tuko.co.ke/rss/all.rss", language: "en" },
  { name: "Kenyans.co.ke", url: "https://www.kenyans.co.ke/feeds/news", language: "en" },
  { name: "Capital FM", url: "https://www.capitalfm.co.ke/news/feed/", language: "en" },
  { name: "KBC", url: "https://www.kbc.co.ke/feed/", language: "en" },
  { name: "Taifa Leo", url: "https://taifaleo.nation.co.ke/feed/", language: "sw" },
];

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";

/** Parses RSS 2.0 items (title, link, pubDate, description). */
export function parseRss(xml: string, sourceName: string, collector = "kenyan_feeds"): SourceItem[] {
  const blocks = xml.slice(0, 2_000_000).match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks.map((block) => {
    const link = cleanText(tag(block, "link")) || cleanText(block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1]);
    const date = cleanText(tag(block, "pubDate"));
    const parsed = date ? new Date(date) : null;
    return {
      title: stripSourceSuffix(tag(block, "title"), sourceName),
      url: link,
      source: sourceName,
      publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      text: cleanText(tag(block, "description")).slice(0, 600),
      collector,
    };
  }).filter(item => item.title && /^https?:\/\//i.test(item.url));
}

// Public feed content is the same for every campaign, so one fetch per feed
// every 10 minutes serves the whole platform.
const FEED_TTL_MS = 10 * 60_000;
const feedCache = new Map<string, { at: number; items: SourceItem[] }>();

export async function fetchKenyanFeeds(opts: { fetcher?: Fetcher; now?: number; feeds?: typeof KENYAN_FEEDS } = {}):
  Promise<{ items: SourceItem[]; health: SourceHealth[] }> {
  const fetcher = opts.fetcher ?? (fetch as unknown as Fetcher);
  const now = opts.now ?? Date.now();
  const results = await Promise.all((opts.feeds ?? KENYAN_FEEDS).map(async (feed) => {
    const cached = feedCache.get(feed.url);
    if (cached && now - cached.at < FEED_TTL_MS) {
      return { items: cached.items, health: { key: `feed:${feed.name}`, label: feed.name, ok: true, items: cached.items.length } };
    }
    try {
      const res = await fetcher(feed.url, { headers: UA, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseRss(await res.text(), feed.name);
      if (!items.length) throw new Error("no items in feed");
      feedCache.set(feed.url, { at: now, items });
      return { items, health: { key: `feed:${feed.name}`, label: feed.name, ok: true, items: items.length } };
    } catch (err) {
      return { items: [] as SourceItem[], health: { key: `feed:${feed.name}`, label: feed.name, ok: false, items: 0, error: err instanceof Error ? err.message : String(err) } };
    }
  }));
  return { items: results.flatMap(r => r.items), health: results.map(r => r.health) };
}

/** Clears cached feeds (tests). */
export function resetFeedCache() { feedCache.clear(); }

/**
 * YouTube Data API v3 video search (optional; needs YOUTUBE_API_KEY). Each
 * search costs 100 of the default 10,000 daily quota units, so at most two
 * searches run per scan. Only video titles and descriptions are stored; viewer
 * comments are personal data of private individuals and are not collected.
 */
export async function searchYouTube(queries: string[], opts: { apiKey: string; fetcher?: Fetcher; now?: number; maxSearches?: number }):
  Promise<{ items: SourceItem[]; health: SourceHealth }> {
  const fetcher = opts.fetcher ?? (fetch as unknown as Fetcher);
  const publishedAfter = new Date((opts.now ?? Date.now()) - 90 * 24 * 3600_000).toISOString();
  const items: SourceItem[] = [];
  const errors: string[] = [];
  for (const q of queries.slice(0, opts.maxSearches ?? 2)) {
    const url = "https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({
      part: "snippet", type: "video", q, regionCode: "KE", maxResults: "10", order: "date", publishedAfter, key: opts.apiKey,
    });
    try {
      const res = await fetcher(url, { headers: UA, signal: AbortSignal.timeout(12_000) });
      const body = JSON.parse(await res.text()) as {
        items?: { id?: { videoId?: string }; snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string } }[];
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      for (const v of body.items ?? []) {
        if (!v.id?.videoId || !v.snippet?.title) continue;
        items.push({
          title: cleanText(v.snippet.title),
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id.videoId)}`,
          source: `YouTube · ${cleanText(v.snippet.channelTitle) || "channel"}`,
          publishedAt: v.snippet.publishedAt ?? null,
          text: cleanText(v.snippet.description).slice(0, 600),
          collector: "youtube",
        });
      }
    } catch (err) {
      // Never echo the request URL: it contains the API key.
      errors.push(err instanceof Error ? err.message.replace(/key=[^&\s]+/g, "key=…") : "request failed");
    }
  }
  const ok = errors.length < Math.min(queries.length, opts.maxSearches ?? 2) || items.length > 0;
  return { items, health: { key: "youtube", label: "YouTube", ok, items: items.length, ...(errors.length ? { error: errors[0] } : {}) } };
}
