import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Tables holding per-campaign rows (owner_campaign_id), ordered children before
 * parents using the database's live foreign keys, so deletes never trip a
 * reference between campaign tables.
 */
async function campaignTablesInDeleteOrder(): Promise<string[]> {
  const tables = ((await db.execute(sql`SELECT table_name AS t FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'owner_campaign_id'`)).rows as { t: string }[]).map(r => r.t);
  const fks = (await db.execute(sql`SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace`)).rows as { child: string; parent: string }[];
  const bare = (n: string) => n.replace(/^public\./, "").replace(/"/g, "");
  const order: string[] = [], left = new Set(tables);
  while (left.size) {
    const ready = [...left].filter(t => !fks.some(f => bare(f.parent) === t && bare(f.child) !== t && left.has(bare(f.child))));
    for (const t of ready.length ? ready : [...left]) { order.push(t); left.delete(t); }
  }
  return order;
}

/**
 * Deletes campaigns and every row they own, inside the caller's transaction.
 * Memberships go with the campaign (ON DELETE CASCADE). Never pass the primary
 * campaign (1). Returns the number of campaign-owned rows removed.
 */
export async function deleteCampaignsTx(tx: Tx, ids: number[]): Promise<number> {
  const safe = ids.filter(id => Number.isInteger(id) && id !== 1);
  if (!safe.length) return 0;
  const list = sql.join(safe.map(id => sql`${id}`), sql`, `);
  let removed = 0;
  for (const t of await campaignTablesInDeleteOrder()) {
    const r = await tx.execute(sql`DELETE FROM ${sql.raw(`public."${t.replace(/"/g, '""')}"`)} WHERE owner_campaign_id IN (${list})`);
    removed += r.rowCount ?? 0;
  }
  await tx.execute(sql`DELETE FROM public.kaiti_campaigns WHERE id IN (${list})`);
  return removed;
}

/** Parties (organisations) left with no campaigns are removed; the primary organisation stays. */
export async function removeEmptyPartiesTx(tx: Tx): Promise<void> {
  await tx.execute(sql`DELETE FROM public.kaiti_organisations o WHERE o.id <> 1
    AND NOT EXISTS (SELECT 1 FROM public.kaiti_campaigns c WHERE c.organisation_id = o.id)`);
}
