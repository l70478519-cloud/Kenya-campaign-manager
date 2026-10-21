import { Router } from "express";
import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";

/**
 * Administration & monitoring: integration health, API failures, unified audit
 * trail and export log. Admin RBAC is enforced by the access-control middleware.
 */
const router = Router();

async function safe<T = Record<string, unknown>>(q: SQL): Promise<T[] | null> {
  try { return (await db.execute(q)).rows as T[]; } catch { return null; }
}

router.get("/integrations", async (_req, res) => {
  // Never select credential columns.
  const providers = await safe(sql`SELECT id, channel, provider, is_active AS "isActive", test_status AS "testStatus",
    last_tested AS "lastTested", updated_at AS "updatedAt" FROM messaging_providers ORDER BY channel, provider`);
  const deliveries = await safe(sql`SELECT status, count(*)::int AS n FROM message_deliveries
    WHERE COALESCE(sent_at, updated_at) > now() - interval '7 days' GROUP BY status ORDER BY n DESC`);
  const sources = await safe(sql`SELECT source_key AS "sourceKey", source_type AS "sourceType", status,
    last_attempt_at AS "lastAttemptAt", last_success_at AS "lastSuccessAt", last_error AS "lastError" FROM social_source_health ORDER BY source_key`);
  const failuresByArea = await safe(sql`SELECT split_part(path, '/', 2) AS area, count(*)::int AS n, max(at) AS "lastAt"
    FROM public.kaiti_api_failures WHERE at > now() - interval '24 hours' GROUP BY 1 ORDER BY n DESC`);
  const env = {
    mpesa: Boolean(process.env.MPESA_CONSUMER_KEY || process.env.DARAJA_CONSUMER_KEY),
    ai: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
    facebook: Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN),
  };
  res.json({ providers, deliveries, sources, failuresByArea, configured: env });
});

router.get("/api-failures", async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * 30);
  const rows = await safe(sql`SELECT id, method, path, status, error, actor, at FROM public.kaiti_api_failures
    WHERE at > now() - make_interval(hours => ${hours}) ORDER BY at DESC LIMIT 500`);
  const hourly = await safe(sql`SELECT date_trunc('hour', at) AS hour, count(*)::int AS n FROM public.kaiti_api_failures
    WHERE at > now() - make_interval(hours => ${hours}) GROUP BY 1 ORDER BY 1`);
  res.json({ failures: rows ?? [], hourly: hourly ?? [] });
});

router.get("/audit", async (req, res) => {
  const q = typeof req.query.q === "string" && req.query.q.trim() ? `%${req.query.q.trim().slice(0, 80)}%` : null;
  const records = await safe(sql`SELECT h.at, h.actor, h.module, h.action, h.from_status AS "fromStatus", h.to_status AS "toStatus",
    h.record_id AS "recordId", r.title FROM public.kaiti_record_history h LEFT JOIN public.kaiti_records r ON r.id = h.record_id
    WHERE (${q}::text IS NULL OR h.actor ILIKE ${q} OR h.module ILIKE ${q} OR r.title ILIKE ${q})
    ORDER BY h.at DESC LIMIT 300`);
  const admin = await safe(sql`SELECT created_at AS at, user_email AS actor, module, action, details, severity FROM audit_logs
    WHERE (${q}::text IS NULL OR user_email ILIKE ${q} OR module ILIKE ${q} OR action ILIKE ${q})
    ORDER BY created_at DESC LIMIT 300`);
  const operations = await safe(sql`SELECT created_at AS at, actor, 'operations' AS module,
    action || ': ' || COALESCE(previous_status,'new') || ' → ' || COALESCE(next_status,'') AS action
    FROM public.kaiti_operation_history ORDER BY created_at DESC LIMIT 200`);
  const exports = await safe(sql`SELECT at, actor, module, reason, row_count AS "rowCount", include_sensitive AS "includeSensitive"
    FROM public.kaiti_export_log ORDER BY at DESC LIMIT 200`);
  res.json({ records: records ?? [], admin: admin ?? [], operations: operations ?? [], exports: exports ?? [] });
});

router.get("/backup-status", async (_req, res) => {
  // The database is hosted on Supabase; backups are managed there. This endpoint
  // reports what the app can verify and records manual restore rehearsals.
  const counts = await safe(sql`SELECT module, count(*)::int AS n FROM public.kaiti_records WHERE deleted_at IS NULL GROUP BY module ORDER BY module`);
  const rehearsals = await safe(sql`SELECT at, actor, reason AS notes FROM public.kaiti_export_log WHERE module='__restore_rehearsal__' ORDER BY at DESC LIMIT 20`);
  res.json({ provider: "Supabase (managed backups / PITR depending on plan)", recordCounts: counts ?? [], restoreRehearsals: rehearsals ?? [], checkedAt: new Date().toISOString() });
});

router.post("/backup-status/rehearsal", async (req, res) => {
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  if (notes.length < 10) { res.status(400).json({ error: "Describe what was restored and verified (at least 10 characters)." }); return; }
  await db.execute(sql`INSERT INTO public.kaiti_export_log (module, actor, reason, row_count, include_sensitive)
    VALUES ('__restore_rehearsal__', ${req.currentUser?.email ?? "unknown"}, ${notes.slice(0, 500)}, 0, false)`);
  res.status(201).json({ ok: true });
});

router.get("/demo-requests", async (_req, res) => {
  const r = await safe(sql`SELECT id::int, name, organisation, role, seat, county, phone, email, message, source_page AS "sourcePage", status, created_at AS "createdAt"
    FROM public.kaiti_demo_requests ORDER BY created_at DESC LIMIT 500`);
  res.json(r ?? []);
});

router.patch("/demo-requests/:id", async (req, res) => {
  const status = String(req.body?.status ?? "");
  if (!["new", "contacted", "demo_booked", "won", "closed"].includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  await db.execute(sql`UPDATE public.kaiti_demo_requests SET status=${status} WHERE id=${Number(req.params.id)}`);
  res.json({ ok: true });
});

export default router;
