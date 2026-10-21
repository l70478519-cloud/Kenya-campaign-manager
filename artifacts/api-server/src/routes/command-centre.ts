import { Router } from "express";
import { db, tenantEnforcementActive } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { RECORD_MODULES } from "../lib/record-modules";

/**
 * Executive Campaign Command Centre: one read-only digest for leadership,
 * built from records that already exist. Every figure is computed in SQL;
 * nothing is estimated. Sections whose tables are missing return null.
 */
const router = Router();

async function one<T = Record<string, unknown>>(q: SQL): Promise<T | null> {
  try { return ((await db.execute(q)).rows[0] as T) ?? null; } catch { return null; }
}
async function many<T = Record<string, unknown>>(q: SQL): Promise<T[] | null> {
  try { return (await db.execute(q)).rows as T[]; } catch { return null; }
}

router.get("/overview", async (req, res) => {
  const cid = req.campaignId ?? 1;
  const isPrimary = cid === 1 || tenantEnforcementActive();
  const budget = await one(sql`
    WITH b AS (SELECT COALESCE(sum((data->>'allocated')::numeric),0) AS a FROM public.kaiti_records WHERE owner_campaign_id = ${cid} AND module='budgets' AND deleted_at IS NULL AND status <> 'closed'),
         e AS (SELECT COALESCE(sum((data->>'amount')::numeric),0) AS s FROM public.kaiti_records WHERE owner_campaign_id = ${cid} AND module='expenses' AND deleted_at IS NULL AND status IN ('approved','paid','reconciled')),
         p AS (SELECT count(*)::int AS n, COALESCE(sum((data->>'amount')::numeric),0) AS amt FROM public.kaiti_records WHERE owner_campaign_id = ${cid} AND module='expenses' AND deleted_at IS NULL AND status='requested')
    SELECT b.a::float AS allocated, e.s::float AS spent, p.n AS "pendingCount", p.amt::float AS "pendingAmount" FROM b, e, p`);

  const upcoming = await many(sql`
    SELECT 'strategic-events' AS source, id, title, data->>'startsAt' AS "startsAt", ward, status FROM public.kaiti_records
      WHERE owner_campaign_id = ${cid} AND module='strategic-events' AND deleted_at IS NULL AND status IN ('planning','confirmed')
        AND (data->>'startsAt')::timestamptz BETWEEN now() AND now() + interval '14 days'
    ORDER BY "startsAt" LIMIT 15`);
  const legacyEvents = !isPrimary ? null : await many(sql`SELECT 'events' AS source, id, title, start_date AS "startsAt", ward, status FROM campaign_events
    WHERE start_date >= to_char(now(), 'YYYY-MM-DD') AND start_date <= to_char(now() + interval '14 days', 'YYYY-MM-DD')
    ORDER BY start_date LIMIT 15`);

  const tasks = !isPrimary ? null : await one(sql`SELECT
      count(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open,
      count(*) FILTER (WHERE status IN ('open','in_progress') AND due_at < now())::int AS overdue,
      count(*) FILTER (WHERE kind='approval' AND status='pending')::int AS "pendingApprovals",
      count(*) FILTER (WHERE kind='incident' AND status IN ('open','in_progress') AND priority IN ('high','critical'))::int AS "criticalIncidents"
    FROM public.kaiti_operations`);

  // Decisions waiting on leadership across modules (maker-checker queues).
  const decisions = await many(sql`SELECT module, id, title, status, ward, updated_at AS "updatedAt" FROM public.kaiti_records
    WHERE owner_campaign_id = ${cid} AND deleted_at IS NULL AND (
      (module='expenses' AND status='requested') OR (module='content-calendar' AND status='in_review') OR
      (module='rapid-response' AND status IN ('awaiting_approval','escalated')) OR (module='nominations' AND status IN ('vetting','dispute')) OR
      (module='data-rights' AND status IN ('received','verifying','in_progress')) OR (module='election-incidents' AND status='escalated'))
    ORDER BY updated_at ASC LIMIT 25`);

  const overdueByModule: { module: string; title: string; overdue: number }[] = [];
  for (const m of RECORD_MODULES) {
    if (!m.dueField) continue;
    const closed = m.closedStatuses.length ? m.closedStatuses : ["__none__"];
    const r = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM public.kaiti_records WHERE owner_campaign_id = ${cid} AND module=${m.key} AND deleted_at IS NULL
      AND NOT (status = ANY(${sql.raw(`ARRAY[${closed.map(s => `'${s.replace(/'/g, "''")}'`).join(",")}]`)}))
      AND (data->>${m.dueField}) IS NOT NULL AND (data->>${m.dueField})::timestamptz < now()`);
    if (r && r.n > 0) overdueByModule.push({ module: m.key, title: m.title, overdue: r.n });
  }

  const field = !isPrimary ? null : await one(sql`SELECT count(*)::int AS "visits7d" FROM canvass_visits WHERE visited_at > now() - interval '7 days'`);
  const fieldReports = !isPrimary ? null : await one(sql`SELECT count(*)::int AS "issuesOpen" FROM volunteer_issues WHERE status <> 'resolved'`);
  const kpis = await many(sql`SELECT title AS name, ward, (data->>'target')::float AS target, (data->>'current')::float AS current, data->>'unit' AS unit, status
    FROM public.kaiti_records WHERE owner_campaign_id = ${cid} AND module='kpis' AND deleted_at IS NULL ORDER BY status DESC, title LIMIT 12`);
  const failures = await one(sql`SELECT count(*)::int AS n FROM public.kaiti_api_failures WHERE at > now() - interval '24 hours'`);

  res.json({
    generatedAt: new Date().toISOString(),
    campaignId: cid,
    legacyAvailable: isPrimary,
    budget, tasks, decisions: decisions ?? [], overdueByModule, kpis: kpis ?? [],
    upcoming: [...(upcoming ?? []), ...(legacyEvents ?? [])].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))).slice(0, 15),
    field: { ...(field ?? {}), ...(fieldReports ?? {}) },
    apiFailures24h: failures?.n ?? null,
  });
});

export default router;
