/**
 * Text clean-up and duplicate detection for social listening
 * (docs/SOCIAL_LISTENING_PLAN.md, SL-2.5 and SL-2.6). Pure functions with no
 * imports, so they can be unit-tested directly.
 */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", laquo: "«", raquo: "»",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

/**
 * Plain, comparable text: CDATA and tags removed, entities decoded (twice, for
 * feeds that double-encode), Unicode normalised with NFKC so decorative
 * letters such as "𝗞𝗮𝗶𝘁𝗶" become "Kaiti", whitespace collapsed.
 */
export function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  const noCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(decodeEntities(noCdata.replace(/<[^>]+>/g, " ")))
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes a trailing " - Source" or " | Source" that news aggregators append to titles. */
export function stripSourceSuffix(title: string, source?: string | null): string {
  const t = cleanText(title);
  const s = cleanText(source);
  if (!s) return t;
  return t.replace(new RegExp(`\\s+[-|–—]\\s+${escapeRe(s)}\\s*$`, "i"), "").trim();
}

/** "Title — snippet", without repeating the title or the source name in the snippet. */
export function cleanSummary(title: string, snippet: string | null | undefined, source?: string | null, max = 280): string {
  const t = stripSourceSuffix(title, source);
  let sn = cleanText(snippet);
  if (t && sn.toLowerCase().startsWith(t.toLowerCase())) sn = sn.slice(t.length).trim();
  const s = cleanText(source);
  if (s) sn = sn.replace(new RegExp(`^${escapeRe(s)}\\b`, "i"), "").replace(new RegExp(`\\b${escapeRe(s)}$`, "i"), "").trim();
  sn = sn.replace(/^[-|–—:\s]+/, "").trim();
  const out = sn && !t.toLowerCase().includes(sn.toLowerCase()) ? `${t} — ${sn}` : t;
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}

const TRACKING = /^(utm_|fbclid$|gclid$|ocid$|cmpid$|ref$|ref_src$|mc_cid$|mc_eid$|igshid$)/i;

/** Comparable form of a URL: host without www/m/amp, no tracking parameters, fragment or trailing slash. */
export function normalizeUrl(value: string): string {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase().replace(/^(www|m|amp)\./, "");
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const path = u.pathname.replace(/\/amp\/?$/i, "/").replace(/\/+$/, "") || "/";
    const query = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
    return `${host}${path}${query}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

function titleWords(title: string): string[] {
  return cleanText(title).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 1);
}

/** True when two headlines are the same story (identical, or at least 80% word overlap on 5+ words). */
export function sameStory(a: string, b: string): boolean {
  const wa = titleWords(a), wb = titleWords(b);
  if (!wa.length || !wb.length) return false;
  if (wa.join(" ") === wb.join(" ")) return true;
  if (wa.length < 5 || wb.length < 5) return false;
  const sa = new Set(wa), sb = new Set(wb);
  const shared = [...sa].filter(w => sb.has(w)).length;
  return shared / new Set([...sa, ...sb]).size >= 0.8;
}

/** Keeps the first of each story, comparing normalised links and headlines. */
export function dedupeStories<T extends { url: string; title: string }>(items: T[], known: { url: string; title: string }[] = []): T[] {
  const urls = new Set(known.map(k => normalizeUrl(k.url)));
  const titles = known.map(k => k.title);
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeUrl(item.url);
    const duplicate = urls.has(key) || titles.some(t => sameStory(t, item.title));
    // Remember a skipped duplicate's link too, so later copies of that link are caught.
    urls.add(key);
    if (duplicate) continue;
    titles.push(item.title);
    out.push(item);
  }
  return out;
}
