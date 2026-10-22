import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

// Free, link-verified sources and text clean-up (docs/SOCIAL_LISTENING_PLAN.md, SL-2).

// The API's source files use extension-less relative imports (resolved by the
// bundler). Let Node resolve "./x" to "./x.ts" so these modules load directly.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); } catch (err) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});
const lib = (name) => import(new URL(`../../artifacts/api-server/src/lib/${name}.ts`, import.meta.url).href);
const { cleanText, cleanSummary, normalizeUrl, sameStory, dedupeStories } = await lib("social-text");
const { parseRss, fetchKenyanFeeds, resetFeedCache, searchYouTube, KENYAN_FEEDS } = await lib("social-sources");
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("text clean-up: entities, HTML and decorative letters", () => {
  assert.equal(cleanText("𝗞𝗮𝗶𝘁𝗶 𝗜𝗩 water project"), "Kaiti IV water project");
  assert.equal(cleanText("Kaiti&nbsp;&nbsp;water &amp;nbsp;&#8217;s &#x2014; done"), "Kaiti water ’s — done");
  assert.equal(cleanText("<![CDATA[<p>Hello <b>Ukia</b></p>]]>"), "Hello Ukia");
});

test("summaries don't repeat the headline or the source", () => {
  // Real shape from a Google News result seen during SL-1 testing.
  assert.equal(
    cleanSummary("Joshua Kimilu retains Kaiti MP seat - Kenya News Agency", "Joshua Kimilu retains Kaiti MP seat&nbsp;&nbsp;Kenya News Agency", "Kenya News Agency"),
    "Joshua Kimilu retains Kaiti MP seat",
  );
  assert.equal(cleanSummary("Wote water project starts", "Works begin next week in four wards.", "KBC"), "Wote water project starts — Works begin next week in four wards.");
  assert.ok(cleanSummary("x".repeat(400), "", null).length <= 280);
});

test("duplicate stories are recognised across outlets and links", () => {
  assert.equal(normalizeUrl("https://www.tuko.co.ke/news/123-kaiti/?utm_source=x&fbclid=y#top"), "tuko.co.ke/news/123-kaiti");
  assert.equal(normalizeUrl("https://m.standardmedia.co.ke/article/9/amp/"), "standardmedia.co.ke/article/9");
  assert.ok(sameStory("Kaiti bodaboda Saccos get Ksh2.5m, urged to invest wisely", "Kaiti bodaboda Saccos get Ksh2.5m, urged to invest wisely!"));
  assert.ok(!sameStory("Kaiti water project starts", "Kaiti road project stalls"));
  const items = [
    { url: "https://news.google.com/rss/articles/abc", title: "Governor opens Wote hospital wing in Makueni" },
    { url: "https://www.kbc.co.ke/wote-hospital/", title: "Governor opens Wote hospital wing in Makueni" },
    { url: "https://www.kbc.co.ke/wote-hospital/?utm_source=fb", title: "Different headline, same link" },
    { url: "https://tuko.co.ke/other", title: "Floods cut off Kilungu roads" },
  ];
  assert.deepEqual(dedupeStories(items).map(i => i.url), ["https://news.google.com/rss/articles/abc", "https://tuko.co.ke/other"]);
  assert.deepEqual(dedupeStories(items, [{ url: "https://tuko.co.ke/other", title: "x" }]).map(i => i.url), ["https://news.google.com/rss/articles/abc"]);
});

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[𝗞𝗮𝗶𝘁𝗶 water works begin - Tuko]]></title><link>https://www.tuko.co.ke/1</link><pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Works&nbsp;begin in Ukia.</p>]]></description></item>
<item><title>No link item</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

test("RSS items are parsed and cleaned; unsafe links are dropped", () => {
  const items = parseRss(RSS, "Tuko");
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { title: "Kaiti water works begin", url: "https://www.tuko.co.ke/1", source: "Tuko", publishedAt: "2026-10-22T10:00:00.000Z", text: "Works begin in Ukia.", collector: "kenyan_feeds" });
});

test("feeds: a failing feed is reported, others still work; fetches are cached", async () => {
  resetFeedCache();
  const feeds = [{ name: "Good", url: "https://good.example/rss", language: "en" }, { name: "Blocked", url: "https://blocked.example/rss", language: "en" }];
  let calls = 0;
  const fetcher = async (url) => { calls++; return url.includes("blocked") ? { ok: false, status: 403, text: async () => "" } : { ok: true, status: 200, text: async () => RSS }; };
  const first = await fetchKenyanFeeds({ fetcher, feeds, now: 1_000 });
  assert.equal(first.items.length, 1);
  assert.deepEqual(first.health.map(h => [h.label, h.ok, h.items]), [["Good", true, 1], ["Blocked", false, 0]]);
  assert.equal(first.health[1].error, "HTTP 403");
  await fetchKenyanFeeds({ fetcher, feeds, now: 2_000 });
  assert.equal(calls, 3, "the good feed is served from cache; only the failed one is retried");
});

test("YouTube: results mapped, searches capped, API key never exposed", async () => {
  const urls = [];
  const ok = async (url) => { urls.push(url); return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ id: { videoId: "v1" }, snippet: { title: "Kaiti town hall &amp; Q&amp;A", channelTitle: "Mbaitu TV", description: "Live from Kilungu", publishedAt: "2026-10-20T08:00:00Z" } }] }) }; };
  const r = await searchYouTube(["a", "b", "c"], { apiKey: "SECRET123", fetcher: ok, now: Date.parse("2026-10-22") });
  assert.equal(urls.length, 2, "at most two 100-unit searches per scan");
  assert.equal(r.items[0].url, "https://www.youtube.com/watch?v=v1");
  assert.equal(r.items[0].title, "Kaiti town hall & Q&A");
  assert.equal(r.items[0].source, "YouTube · Mbaitu TV");
  const bad = async (url) => { throw new Error(`request to ${url} failed`); };
  const failed = await searchYouTube(["a"], { apiKey: "SECRET123", fetcher: bad });
  assert.equal(failed.health.ok, false);
  assert.doesNotMatch(failed.health.error ?? "", /SECRET123/);
});

test("only feeds that passed the live check are configured", () => {
  const names = KENYAN_FEEDS.map(f => f.name);
  assert.deepEqual(names, ["The Standard", "Tuko", "Kenyans.co.ke", "Capital FM", "KBC", "Taifa Leo"]);
  assert.ok(KENYAN_FEEDS.some(f => f.language === "sw"), "includes a Swahili source");
  for (const f of KENYAN_FEEDS) assert.match(f.url, /^https:\/\//);
});

test("scan uses the new sources, normalised matching and cross-source de-duplication", () => {
  const social = read("artifacts/api-server/src/routes/social.ts");
  assert.match(social, /collectFeedsAndVideos\(scope, competitors\)/);
  assert.match(social, /dedupeStories\(deduped, known\)/);
  assert.match(social, /const text = cleanText\(/, "relevance matching uses normalised text");
  assert.match(social, /scope\.national \|\| !names\(scope\.placeTerms\)/, "national campaigns don't take every Kenyan story as local");
  assert.match(read("artifacts/api-server/src/routes/makueni-free-ai.ts"), /const decode = \(value: string\) => cleanText\(value\)/);
});
