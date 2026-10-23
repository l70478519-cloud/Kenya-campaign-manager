import { db, kolTable, kolHandlesTable, kolMentionLinksTable, socialMentionsTable, campaignWards } from "@workspace/db";
import { and, eq, gte, inArray, sql, desc } from "drizzle-orm";
import { scoreKol, type KolScore } from "./kol-score";
import { matchKols, type KolMatcher } from "./kol-match";

/**
 * KOL scoring and mention linking (docs/SOCIAL_LISTENING_PLAN.md, KOL-1).
 * All queries run in the request's campaign (row-level security).
 */

type KolRow = typeof kolTable.$inferSelect;
type HandleRow = typeof kolHandlesTable.$inferSelect;

export async function handlesByKol(kolIds?: number[]): Promise<Map<number, HandleRow[]>> {
  const rows = kolIds?.length === 0 ? [] : await db.select().from(kolHandlesTable)
    .where(kolIds ? inArray(kolHandlesTable.kolId, kolIds) : undefined).orderBy(kolHandlesTable.id);
  const out = new Map<number, HandleRow[]>();
  for (const r of rows) out.set(r.kolId, [...(out.get(r.kolId) ?? []), r]);
  return out;
}

/** Links mentions to KOLs by handle or full name; returns how many new links were made. */
export async function linkMentionsToKols(mentions: { id: number; summary: string; source: string | null }[]): Promise<number> {
  if (!mentions.length) return 0;
  const kols = await db.select({ id: kolTable.id, name: kolTable.name, handle: kolTable.handle }).from(kolTable);
  if (!kols.length) return 0;
  const handles = await handlesByKol();
  const matchers: KolMatcher[] = kols.map(k => ({
    kolId: k.id, name: k.name,
    handles: [...(k.handle ? [k.handle] : []), ...(handles.get(k.id) ?? []).map(h => h.handle)],
  }));
  const rows = mentions.flatMap(m => matchKols(m, matchers).map(x => ({ kolId: x.kolId, mentionId: m.id, matchedOn: x.matchedOn, role: x.role })));
  if (!rows.length) return 0;
  const inserted = await db.insert(kolMentionLinksTable).values(rows).onConflictDoNothing().returning({ id: kolMentionLinksTable.id });
  return inserted.length;
}

/** Computes scores for the given KOLs (all when omitted) and stores changed ones in influence_score. */
export async function scoreKols(kols: KolRow[], now = new Date()): Promise<Map<number, KolScore & { mentions90d: number; mentionsTotal: number }>> {
  const ids = kols.map(k => k.id);
  const out = new Map<number, KolScore & { mentions90d: number; mentionsTotal: number }>();
  if (!ids.length) return out;
  const handles = await handlesByKol(ids);
  // A mention's date is when it was published when known (feeds and news give it), otherwise when
  // it was collected. Using the collection date alone would make old articles look recent.
  const since = now.getTime() - 90 * 24 * 3600_000;
  const links = await db.select({ kolId: kolMentionLinksTable.kolId, publishedAt: socialMentionsTable.publishedAt, scannedAt: socialMentionsTable.scannedAt })
    .from(kolMentionLinksTable)
    .innerJoin(socialMentionsTable, eq(socialMentionsTable.id, kolMentionLinksTable.mentionId))
    .where(and(inArray(kolMentionLinksTable.kolId, ids), sql`(${socialMentionsTable.reviewStatus} IS NULL OR ${socialMentionsTable.reviewStatus} <> 'rejected')`));
  const byKol = new Map<number, { total: number; recent: number; last: number | null }>();
  for (const l of links) {
    const published = l.publishedAt ? Date.parse(l.publishedAt) : NaN;
    const at = Number.isFinite(published) && published <= now.getTime() ? published : l.scannedAt.getTime();
    const s = byKol.get(l.kolId) ?? { total: 0, recent: 0, last: null };
    s.total++;
    if (at >= since) s.recent++;
    s.last = s.last === null ? at : Math.max(s.last, at);
    byKol.set(l.kolId, s);
  }
  const wards = campaignWards();

  for (const k of kols) {
    const hs = handles.get(k.id) ?? [];
    const st = byKol.get(k.id);
    const engaged = k.lastEngaged ? new Date(k.lastEngaged) : null;
    const lastMention = st?.last != null ? new Date(st.last) : null;
    const candidates = [engaged, lastMention].filter((d): d is Date => !!d && !isNaN(d.getTime()));
    const score = scoreKol({
      kind: k.kind === "offline" ? "offline" : "online",
      followers: [k.followerCount, ...hs.map(h => h.followers ?? 0)],
      reachEstimate: k.reachEstimate,
      engagementRates: hs.map(h => h.engagementRate).filter((r): r is number => r !== null),
      mentions90d: Number(st?.recent ?? 0),
      ward: k.ward,
      campaignWards: wards,
      lastActivity: candidates.length ? new Date(Math.max(...candidates.map(d => d.getTime()))) : null,
      now,
      override: k.scoreOverride,
      overrideReason: k.overrideReason,
    });
    out.set(k.id, { ...score, mentions90d: Number(st?.recent ?? 0), mentionsTotal: Number(st?.total ?? 0) });
    // Keep the stored score current for sorting and Analytics.
    if (k.influenceScore !== score.score) await db.update(kolTable).set({ influenceScore: score.score }).where(eq(kolTable.id, k.id));
  }
  return out;
}

/** Recent mentions linked to one KOL, newest first. */
export async function linkedMentions(kolId: number, limit = 20) {
  return db.select({
    id: socialMentionsTable.id, summary: socialMentionsTable.summary, source: socialMentionsTable.source, url: socialMentionsTable.url,
    sentiment: socialMentionsTable.sentiment, reviewStatus: socialMentionsTable.reviewStatus, scannedAt: socialMentionsTable.scannedAt,
    role: kolMentionLinksTable.role, matchedOn: kolMentionLinksTable.matchedOn,
  }).from(kolMentionLinksTable)
    .innerJoin(socialMentionsTable, eq(socialMentionsTable.id, kolMentionLinksTable.mentionId))
    .where(eq(kolMentionLinksTable.kolId, kolId))
    .orderBy(desc(socialMentionsTable.scannedAt)).limit(limit);
}

/** Re-links recent mentions (e.g. after a KOL or handle is added). */
export async function relinkRecentMentions(limit = 500): Promise<number> {
  const recent = await db.select({ id: socialMentionsTable.id, summary: socialMentionsTable.summary, source: socialMentionsTable.source })
    .from(socialMentionsTable).where(gte(socialMentionsTable.scannedAt, new Date(Date.now() - 365 * 24 * 3600_000)))
    .orderBy(desc(socialMentionsTable.scannedAt)).limit(limit);
  return linkMentionsToKols(recent);
}
