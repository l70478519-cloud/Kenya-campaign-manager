import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isEmergencySession, permissionsForRole, type PermLevel } from "../lib/auth";
import { RECORD_MODULES, MODULE_BY_KEY, type FieldDef, type ModuleDef } from "../lib/record-modules";
import { campaignWards } from "@workspace/db";

/**
 * Generic records engine for the registry modules in lib/record-modules.ts.
 * Authentication and module-level RBAC are enforced upstream by the
 * access-control middleware; this router adds maker-checker rules, workflow
 * transitions, sensitive-field masking, history, logged exports and validated
 * imports.
 */
const router = Router();

type Row = {
  id: number; module: string; title: string; status: string; ward: string | null;
  data: Record<string, unknown>; createdBy: string; updatedBy: string | null;
  createdAt: string; updatedAt: string;
};

async function permFor(req: Request, mod: string): Promise<PermLevel> {
  if (isEmergencySession(req)) return "write";
  const perms = await permissionsForRole(req.currentUser!.role);
  return perms[mod] ?? "none";
}
const actorOf = (req: Request) => req.currentUser?.email || req.currentUser?.username || "unknown";

function getModule(req: Request, res: Response): ModuleDef | null {
  const m = MODULE_BY_KEY.get(String(req.params.module));
  if (!m) { res.status(404).json({ error: "Unknown module" }); return null; }
  return m;
}
function idOf(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// ── Validation ───────────────────────────────────────────────────────────────
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

function coerce(field: FieldDef, raw: unknown): { value?: unknown; error?: string } {
  const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
  if (empty) return field.required ? { error: `${field.label} is required` } : { value: null };
  const s = typeof raw === "string" ? raw.trim() : raw;
  switch (field.type) {
    case "number": case "money": case "rating": {
      const n = typeof s === "number" ? s : Number(String(s).replace(/[, ]/g, ""));
      if (!Number.isFinite(n)) return { error: `${field.label} must be a number` };
      const min = field.type === "rating" ? 1 : field.min;
      const max = field.type === "rating" ? 5 : field.max;
      if (min !== undefined && n < min) return { error: `${field.label} must be at least ${min}` };
      if (max !== undefined && n > max) return { error: `${field.label} must be at most ${max}` };
      return { value: field.type === "money" ? Math.round(n * 100) / 100 : n };
    }
    case "boolean":
      if (typeof s === "boolean") return { value: s };
      if (/^(true|yes|1|y)$/i.test(String(s))) return { value: true };
      if (/^(false|no|0|n)$/i.test(String(s))) return { value: false };
      return { error: `${field.label} must be yes or no` };
    case "date": {
      const d = String(s);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return { error: `${field.label} must be a date (YYYY-MM-DD)` };
      return { value: d };
    }
    case "datetime": {
      const t = Date.parse(String(s));
      if (Number.isNaN(t)) return { error: `${field.label} must be a valid date and time` };
      return { value: new Date(t).toISOString() };
    }
    case "select": {
      const opt = field.options?.find(o => o.toLowerCase() === String(s).toLowerCase());
      return opt ? { value: opt } : { error: `${field.label} must be one of: ${field.options?.join(", ")}` };
    }
    case "ward": {
      const wards = campaignWards();
      const w = wards.find(o => o.toLowerCase() === String(s).toLowerCase());
      return w ? { value: w } : { error: `${field.label} must be one of: ${wards.join(", ")}` };
    }
    case "email": return EMAIL.test(String(s)) ? { value: String(s).toLowerCase() } : { error: `${field.label} is not a valid email` };
    case "phone": return PHONE.test(String(s)) ? { value: String(s) } : { error: `${field.label} is not a valid phone number` };
    case "url": {
      try { const u = new URL(String(s)); if (!/^https?:$/.test(u.protocol)) throw new Error(); return { value: u.toString() }; }
      catch { return { error: `${field.label} must be an http(s) link` }; }
    }
    default: {
      const text = String(s);
      const max = field.max ?? (field.type === "textarea" ? 8000 : 500);
      return text.length > max ? { error: `${field.label} is longer than ${max} characters` } : { value: text };
    }
  }
}

function validate(mod: ModuleDef, input: Record<string, unknown>, partial: boolean) {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of mod.fields) {
    if (partial && !(f.key in input)) continue;
    const r = coerce(f, input[f.key]);
    if (r.error) errors.push(r.error); else data[f.key] = r.value;
  }
  return { data, errors };
}

// Module-specific defaults applied on create.
function applyDefaults(mod: ModuleDef, data: Record<string, unknown>) {
  if (mod.key === "data-rights" && !data.dueOn && typeof data.receivedOn === "string") {
    const d = new Date(data.receivedOn + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7);
    data.dueOn = d.toISOString().slice(0, 10);
  }
}

function mask(mod: ModuleDef, row: Row, canWrite: boolean): Row {
  if (canWrite) return row;
  const data = { ...row.data };
  for (const f of mod.fields) {
    if (f.sensitive && typeof data[f.key] === "string") {
      const v = data[f.key] as string;
      data[f.key] = v.length > 3 ? "•••" + v.slice(-2) : "•••";
    }
  }
  const title = mod.fields.find(f => f.key === mod.titleField)?.sensitive ? (data[mod.titleField] as string) ?? row.title : row.title;
  return { ...row, data, title };
}

const SELECT = sql`id, module, title, status, ward, data, created_by AS "createdBy", updated_by AS "updatedBy",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

async function history(recordId: number, module: string, action: string, actor: string,
  fromStatus: string | null, toStatus: string | null, changes: unknown) {
  await db.execute(sql`INSERT INTO public.kaiti_record_history (record_id, module, action, from_status, to_status, changes, actor)
    VALUES (${recordId}, ${module}, ${action}, ${fromStatus}, ${toStatus}, ${JSON.stringify(changes ?? {})}::jsonb, ${actor})`);
}

// ── Module catalogue ─────────────────────────────────────────────────────────
router.get("/_modules", async (req, res) => {
  const out = [];
  for (const m of RECORD_MODULES) {
    const p = await permFor(req, m.rbac);
    if (p !== "none") out.push({ ...m, access: p });
  }
  res.json({ wards: campaignWards(), modules: out });
});

// ── List ─────────────────────────────────────────────────────────────────────
router.get("/:module", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  const status = typeof req.query.status === "string" && mod.statuses.includes(req.query.status) ? req.query.status : null;
  const ward = typeof req.query.ward === "string" && campaignWards().includes(req.query.ward) ? req.query.ward : null;
  const q = typeof req.query.q === "string" && req.query.q.trim() ? `%${req.query.q.trim().slice(0, 80)}%` : null;
  const result = await db.execute(sql`SELECT ${SELECT} FROM public.kaiti_records
    WHERE owner_campaign_id = ${req.campaignId!} AND module = ${mod.key} AND deleted_at IS NULL
      AND (${status}::text IS NULL OR status = ${status})
      AND (${ward}::text IS NULL OR ward = ${ward})
      AND (${q}::text IS NULL OR title ILIKE ${q} OR data::text ILIKE ${q})
    ORDER BY updated_at DESC LIMIT 1000`);
  const canWrite = (await permFor(req, mod.rbac)) === "write";
  res.json((result.rows as Row[]).map(r => mask(mod, r, canWrite)));
});

// ── Summary (status counts, overdue, module-specific metrics) ────────────────
router.get("/:module/summary", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  const counts = await db.execute(sql`SELECT status, count(*)::int AS n FROM public.kaiti_records
    WHERE owner_campaign_id = ${req.campaignId!} AND module = ${mod.key} AND deleted_at IS NULL GROUP BY status`);
  const byStatus = Object.fromEntries((counts.rows as { status: string; n: number }[]).map(r => [r.status, r.n]));
  let overdue = 0;
  if (mod.dueField) {
    const closed = mod.closedStatuses.length ? mod.closedStatuses : ["__none__"];
    const r = await db.execute(sql`SELECT count(*)::int AS n FROM public.kaiti_records
      WHERE owner_campaign_id = ${req.campaignId!} AND module = ${mod.key} AND deleted_at IS NULL
        AND NOT (status = ANY(${sql.raw(`ARRAY[${closed.map(s => `'${s.replace(/'/g, "''")}'`).join(",")}]`)}))
        AND (data->>${mod.dueField}) IS NOT NULL AND (data->>${mod.dueField})::timestamptz < now()`);
    overdue = (r.rows[0] as { n: number }).n;
  }
  const metrics: Record<string, unknown> = {};
  if (mod.key === "budgets" || mod.key === "expenses") {
    const lines = await db.execute(sql`
      WITH b AS (SELECT title AS line, data->>'department' AS department, ward, COALESCE((data->>'allocated')::numeric,0) AS allocated
                 FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module='budgets' AND deleted_at IS NULL AND status <> 'closed'),
           e AS (SELECT data->>'budgetLine' AS line, sum(COALESCE((data->>'amount')::numeric,0)) AS spent
                 FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module='expenses' AND deleted_at IS NULL
                   AND status IN ('approved','paid','reconciled') GROUP BY 1)
      SELECT b.line, b.department, b.ward, b.allocated::float AS allocated, COALESCE(e.spent,0)::float AS actual,
             (b.allocated - COALESCE(e.spent,0))::float AS variance
      FROM b LEFT JOIN e ON lower(e.line) = lower(b.line) ORDER BY b.department, b.line`);
    const unbudgeted = await db.execute(sql`SELECT COALESCE(sum((data->>'amount')::numeric),0)::float AS amount FROM public.kaiti_records x
      WHERE x.owner_campaign_id = ${req.campaignId!} AND module='expenses' AND deleted_at IS NULL AND status IN ('approved','paid','reconciled')
        AND NOT EXISTS (SELECT 1 FROM public.kaiti_records b WHERE b.owner_campaign_id = ${req.campaignId!} AND b.module='budgets' AND b.deleted_at IS NULL AND lower(b.title)=lower(x.data->>'budgetLine'))`);
    const rows = lines.rows as { allocated: number; actual: number }[];
    metrics.budgetVsActual = rows;
    metrics.totalAllocated = rows.reduce((s, r) => s + r.allocated, 0);
    metrics.totalActual = rows.reduce((s, r) => s + r.actual, 0);
    metrics.unbudgetedSpend = (unbudgeted.rows[0] as { amount: number }).amount;
    const pending = await db.execute(sql`SELECT count(*)::int AS n, COALESCE(sum((data->>'amount')::numeric),0)::float AS amount
      FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module='expenses' AND deleted_at IS NULL AND status='requested'`);
    metrics.pendingRequests = pending.rows[0];
  }
  if (mod.key === "kpis") {
    const r = await db.execute(sql`SELECT title AS name, ward, (data->>'target')::float AS target, (data->>'current')::float AS current,
      data->>'unit' AS unit, status FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module='kpis' AND deleted_at IS NULL ORDER BY title`);
    metrics.kpis = r.rows;
  }
  if (mod.key === "election-history") {
    const r = await db.execute(sql`SELECT (data->>'year')::int AS year, data->>'seat' AS seat, title AS candidate, data->>'party' AS party,
      sum((data->>'votes')::numeric)::float AS votes, bool_and(status='verified') AS verified
      FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module='election-history' AND deleted_at IS NULL
      GROUP BY 1,2,3,4 ORDER BY year DESC, seat, votes DESC LIMIT 200`);
    metrics.resultsByCandidate = r.rows;
  }
  res.json({ byStatus, overdue, total: Object.values(byStatus).reduce((a: number, b) => a + (b as number), 0), metrics });
});

// ── Data quality ─────────────────────────────────────────────────────────────
router.get("/:module/quality", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  const dupes = await db.execute(sql`SELECT lower(title) AS key, COALESCE(ward,'') AS ward, count(*)::int AS n, array_agg(id ORDER BY id) AS ids
    FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module = ${mod.key} AND deleted_at IS NULL
    GROUP BY 1,2 HAVING count(*) > 1 ORDER BY n DESC LIMIT 100`);
  const closed = mod.closedStatuses.length ? mod.closedStatuses : ["__none__"];
  const stale = await db.execute(sql`SELECT count(*)::int AS n FROM public.kaiti_records
    WHERE owner_campaign_id = ${req.campaignId!} AND module = ${mod.key} AND deleted_at IS NULL AND updated_at < now() - interval '30 days'
      AND NOT (status = ANY(${sql.raw(`ARRAY[${closed.map(s => `'${s.replace(/'/g, "''")}'`).join(",")}]`)}))`);
  const rows = await db.execute(sql`SELECT data FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module = ${mod.key} AND deleted_at IS NULL LIMIT 5000`);
  const completeness = mod.fields.map(f => {
    const filled = (rows.rows as { data: Record<string, unknown> }[]).filter(r => r.data?.[f.key] !== null && r.data?.[f.key] !== undefined && r.data?.[f.key] !== "").length;
    return { field: f.label, filled, total: rows.rows.length, pct: rows.rows.length ? Math.round((filled / rows.rows.length) * 100) : 100 };
  });
  res.json({ duplicates: dupes.rows, staleOpenRecords: (stale.rows[0] as { n: number }).n, completeness });
});

// ── Create ───────────────────────────────────────────────────────────────────
router.post("/:module", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  const { data, errors } = validate(mod, (req.body?.data ?? {}) as Record<string, unknown>, false);
  if (errors.length) { res.status(400).json({ error: errors[0], errors }); return; }
  applyDefaults(mod, data);
  const actor = actorOf(req);
  const title = String(data[mod.titleField] ?? "").slice(0, 300) || "(untitled)";
  const ward = (data.ward as string | null) ?? null;
  const r = await db.execute(sql`INSERT INTO public.kaiti_records (owner_campaign_id, module, title, status, ward, data, created_by, updated_by)
    VALUES (${req.campaignId!}, ${mod.key}, ${title}, ${mod.initialStatus}, ${ward}, ${JSON.stringify(data)}::jsonb, ${actor}, ${actor})
    RETURNING ${SELECT}`);
  const row = r.rows[0] as Row;
  await history(row.id, mod.key, "created", actor, null, row.status, data);
  res.status(201).json(row);
});

// ── Update fields and/or status ──────────────────────────────────────────────
router.patch("/:module/:id", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  const id = idOf(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const existingQ = await db.execute(sql`SELECT ${SELECT} FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND id=${id} AND module=${mod.key} AND deleted_at IS NULL`);
  const existing = existingQ.rows[0] as Row | undefined;
  if (!existing) { res.status(404).json({ error: "Record not found" }); return; }
  const actor = actorOf(req);

  let nextStatus = existing.status;
  if (req.body?.status !== undefined) {
    const s = String(req.body.status);
    if (!mod.statuses.includes(s)) { res.status(400).json({ error: "Invalid status" }); return; }
    if (s !== existing.status) {
      const allowed = mod.transitions?.[existing.status];
      if (allowed && !allowed.includes(s)) {
        res.status(409).json({ error: `Cannot move from ${existing.status} to ${s}. Allowed: ${allowed.join(", ") || "none (final)"}` }); return;
      }
      if (mod.separateApprover?.includes(s) && existing.createdBy === actor && !isEmergencySession(req)) {
        res.status(403).json({ error: "A different authorised person must make this decision (maker-checker)." }); return;
      }
      nextStatus = s;
    }
  }
  const { data: changes, errors } = validate(mod, (req.body?.data ?? {}) as Record<string, unknown>, true);
  if (errors.length) { res.status(400).json({ error: errors[0], errors }); return; }
  const hasContentChanges = Object.entries(changes).some(([k,v]) => JSON.stringify(existing.data[k] ?? null) !== JSON.stringify(v));
  if (mod.key === "content-calendar" && hasContentChanges) {
    if (existing.status === "published") { res.status(409).json({ error: "Published content is final. Create a new draft for revisions." }); return; }
    if (["in_review", "approved", "rejected"].includes(existing.status)) nextStatus = "draft";
  }
  const merged = { ...existing.data, ...changes };
  const title = String(merged[mod.titleField] ?? existing.title).slice(0, 300);
  const ward = (merged.ward as string | null) ?? null;
  const r = await db.execute(sql`UPDATE public.kaiti_records SET data=${JSON.stringify(merged)}::jsonb, title=${title}, ward=${ward},
    status=${nextStatus}, updated_by=${actor}, updated_at=now() WHERE id=${id} AND owner_campaign_id=${req.campaignId!} RETURNING ${SELECT}`);
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(changes)) if (JSON.stringify(existing.data[k]) !== JSON.stringify(v)) diff[k] = { from: existing.data[k] ?? null, to: v };
  const action = nextStatus !== existing.status ? "status_changed" : "updated";
  if (Object.keys(diff).length || action === "status_changed") await history(id, mod.key, action, actor, existing.status, nextStatus, diff);
  res.json(r.rows[0]);
});

// ── Soft delete ──────────────────────────────────────────────────────────────
router.delete("/:module/:id", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  const id = idOf(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const r = await db.execute(sql`UPDATE public.kaiti_records SET deleted_at=now(), updated_by=${actorOf(req)}
    WHERE id=${id} AND module=${mod.key} AND owner_campaign_id=${req.campaignId!} AND deleted_at IS NULL RETURNING id, status`);
  if (!r.rows.length) { res.status(404).json({ error: "Record not found" }); return; }
  await history(id, mod.key, "deleted", actorOf(req), (r.rows[0] as { status: string }).status, null, {});
  res.json({ ok: true });
});

// ── History ──────────────────────────────────────────────────────────────────
router.get("/:module/:id/history", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  const id = idOf(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const r = await db.execute(sql`SELECT id, action, from_status AS "fromStatus", to_status AS "toStatus", changes, actor, at
    FROM public.kaiti_record_history WHERE record_id=${id} AND module=${mod.key}
      AND EXISTS (SELECT 1 FROM public.kaiti_records r WHERE r.id=${id} AND r.owner_campaign_id=${req.campaignId!})
    ORDER BY at DESC LIMIT 200`);
  res.json(r.rows);
});

// ── Logged CSV export (write permission + stated reason) ─────────────────────
router.post("/:module/export", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 10) { res.status(400).json({ error: "State the reason for this export (at least 10 characters)." }); return; }
  const includeSensitive = req.body?.includeSensitive === true;
  const isAdmin = (await permFor(req, "admin")) === "write";
  if (includeSensitive && !isAdmin) {
    res.status(403).json({ error: "Only a campaign administrator can export sensitive fields." }); return;
  }
  const rows = (await db.execute(sql`SELECT ${SELECT} FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module=${mod.key} AND deleted_at IS NULL ORDER BY id`)).rows as Row[];
  const maxRows = Number(process.env.EXPORT_MAX_ROWS) || 2000;
  if (!isAdmin && rows.length > maxRows) {
    res.status(403).json({ error: `This export has ${rows.length} rows. Exports over ${maxRows} rows need a campaign administrator.` }); return;
  }
  const fields = mod.fields.filter(f => includeSensitive || !f.sensitive);
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["id", "status", ...fields.map(f => f.key), "createdBy", "createdAt", "updatedAt"];
  const lines = [header.join(",")].concat(rows.map(r =>
    [r.id, r.status, ...fields.map(f => r.data?.[f.key]), r.createdBy, r.createdAt, r.updatedAt].map(esc).join(",")));
  await db.execute(sql`INSERT INTO public.kaiti_export_log (campaign_id, module, actor, reason, row_count, include_sensitive)
    VALUES (${req.campaignId!}, ${mod.key}, ${actorOf(req)}, ${reason.slice(0, 500)}, ${rows.length}, ${includeSensitive})`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${mod.key}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join("\n"));
});

// ── Validated import (JSON rows parsed client-side from CSV) ─────────────────
router.post("/:module/import", async (req, res) => {
  const mod = getModule(req, res); if (!mod) return;
  if (!mod.importable) { res.status(400).json({ error: "This module does not support bulk import" }); return; }
  const rows = Array.isArray(req.body?.rows) ? (req.body.rows as Record<string, unknown>[]) : null;
  if (!rows || rows.length === 0) { res.status(400).json({ error: "No rows supplied" }); return; }
  if (rows.length > 5000) { res.status(400).json({ error: "Maximum 5,000 rows per import" }); return; }
  const dryRun = req.body?.dryRun === true;
  const byLabel = new Map<string, string>();
  for (const f of mod.fields) { byLabel.set(f.key.toLowerCase(), f.key); byLabel.set(f.label.toLowerCase(), f.key); }

  const existing = await db.execute(sql`SELECT lower(title) AS t, COALESCE(ward,'') AS w FROM public.kaiti_records WHERE owner_campaign_id = ${req.campaignId!} AND module=${mod.key} AND deleted_at IS NULL`);
  const seen = new Set((existing.rows as { t: string; w: string }[]).map(r => `${r.t}|${r.w}`));
  const valid: Record<string, unknown>[] = [];
  const rejected: { row: number; errors: string[] }[] = [];
  const duplicates: number[] = [];
  rows.forEach((raw, i) => {
    const mapped: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw ?? {})) { const key = byLabel.get(k.trim().toLowerCase()); if (key) mapped[key] = v; }
    const { data, errors } = validate(mod, mapped, false);
    if (errors.length) { rejected.push({ row: i + 2, errors }); return; }
    const sig = `${String(data[mod.titleField] ?? "").toLowerCase()}|${(data.ward as string) ?? ""}`;
    if (seen.has(sig)) { duplicates.push(i + 2); return; }
    seen.add(sig); applyDefaults(mod, data); valid.push(data);
  });
  if (!dryRun && valid.length) {
    const actor = actorOf(req);
    await db.transaction(async tx => {
      for (const data of valid) {
        const title = String(data[mod.titleField] ?? "").slice(0, 300) || "(untitled)";
        const ins = await tx.execute(sql`INSERT INTO public.kaiti_records (owner_campaign_id, module, title, status, ward, data, created_by, updated_by)
          VALUES (${req.campaignId!}, ${mod.key}, ${title}, ${mod.initialStatus}, ${(data.ward as string | null) ?? null}, ${JSON.stringify(data)}::jsonb, ${actor}, ${actor}) RETURNING id`);
        await tx.execute(sql`INSERT INTO public.kaiti_record_history (record_id, module, action, to_status, changes, actor)
          VALUES (${(ins.rows[0] as { id: number }).id}, ${mod.key}, 'imported', ${mod.initialStatus}, '{}'::jsonb, ${actor})`);
      }
    });
  }
  res.json({ dryRun, received: rows.length, imported: dryRun ? 0 : valid.length, valid: valid.length, duplicatesSkipped: duplicates, rejected: rejected.slice(0, 200) });
});

export default router;
