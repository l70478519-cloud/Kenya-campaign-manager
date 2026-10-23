import { cleanText } from "./social-text";

/**
 * Links social listening mentions to KOLs (docs/SOCIAL_LISTENING_PLAN.md, KOL-1.2).
 *
 * A KOL matches a mention when one of their handles, or their full name (two
 * or more words), appears as a whole word. Single-word names are not matched:
 * too many people share them. When the match is in the mention's source
 * (e.g. a YouTube channel or the publishing account), the KOL is its author;
 * otherwise they are mentioned in it.
 */

export type KolMatcher = { kolId: number; name: string; handles: string[] };
export type KolMatch = { kolId: number; matchedOn: "handle" | "name"; role: "author" | "mentioned" };

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, term: string) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(term)}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(text);

function terms(k: KolMatcher): { term: string; kind: "handle" | "name" }[] {
  const out: { term: string; kind: "handle" | "name" }[] = [];
  for (const raw of k.handles) {
    const h = cleanText(raw).replace(/^@+/, "").trim();
    if (h.length >= 3) out.push({ term: h, kind: "handle" });
  }
  const name = cleanText(k.name).replace(/^((hon|dr|mr|mrs|ms|eng|prof|rev|pastor|bishop|chief|h\.?e)\.?\s+)+/i, "").trim();
  if (name.split(/\s+/).length >= 2 && name.length >= 5) out.push({ term: name, kind: "name" });
  return out;
}

export function matchKols(mention: { summary: string; source: string | null }, kols: KolMatcher[]): KolMatch[] {
  const text = cleanText(mention.summary);
  const source = cleanText(mention.source);
  const out: KolMatch[] = [];
  for (const k of kols) {
    let best: KolMatch | null = null;
    for (const { term, kind } of terms(k)) {
      const inSource = !!source && has(source, term);
      if (!inSource && !has(text, term)) continue;
      const candidate: KolMatch = { kolId: k.kolId, matchedOn: kind, role: inSource ? "author" : "mentioned" };
      // Prefer author over mentioned, and a handle over a name.
      if (!best || (candidate.role === "author" && best.role !== "author") || (candidate.role === best.role && kind === "handle" && best.matchedOn !== "handle")) best = candidate;
    }
    if (best) out.push(best);
  }
  return out;
}
