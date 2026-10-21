import { Router } from "express";
import { z } from "zod";
import { db, campaignWards } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requirePermission } from "../lib/auth";

const router = Router();
router.use(requireAuth, requirePermission("events", "read"));

const kindSchema = z.enum(["approval", "task", "incident", "resource"]);
const statusSchema = z.enum(["open", "in_progress", "pending", "approved", "rejected", "resolved", "closed"]);
const createSchema = z.object({
  kind: kindSchema,
  title: z.string().trim().min(3).max(180),
  description: z.string().max(4000).default(""),
  ward: z.string().trim().max(80).refine(w => campaignWards().includes(w), { message: "Choose one of this campaign’s wards" }).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  assignedTo: z.string().trim().max(160).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  resourceKey: z.string().trim().max(160).nullable().optional(),
}).strict();
const updateSchema = z.object({ status: statusSchema }).strict();
const allowedStatuses: Record<z.infer<typeof kindSchema>, string[]> = {
  approval: ["pending", "approved", "rejected"],
  task: ["open", "in_progress", "resolved", "closed"],
  incident: ["open", "in_progress", "resolved", "closed"],
  resource: ["open", "in_progress", "closed"],
};
function idOf(raw: string | string[]): number | null {
  if (Array.isArray(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

router.get("/", async (req, res) => {
  const kind = req.query.kind;
  if (kind !== undefined && !kindSchema.safeParse(kind).success) {
    res.status(400).json({ error: "Invalid record type" }); return;
  }
  const result = await db.execute(sql`
    SELECT id, kind, title, description, ward, status, priority, assigned_to AS "assignedTo",
           due_at AS "dueAt", starts_at AS "startsAt", ends_at AS "endsAt",
           resource_key AS "resourceKey", created_by AS "createdBy",
           reviewed_by AS "reviewedBy", created_at AS "createdAt"
    FROM public.kaiti_operations
    WHERE (${kind === undefined ? null : kind}::text IS NULL OR kind = ${kind === undefined ? null : kind})
    ORDER BY created_at DESC LIMIT 250
  `);
  res.json(result.rows);
});

router.post("/", requirePermission("events", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid record" }); return; }
  const v = parsed.data;
  if (v.kind === "approval" && req.currentUser?.role?.toLowerCase().replace(/[_-]/g, "") !== "superadmin") {
    // Approval creation is restricted to admins/finance permission, checked in approval decision route too.
    const { permissionsForRole } = await import("../lib/auth");
    const permissions = await permissionsForRole(req.currentUser!.role);
    if (permissions.finance !== "write") { res.status(403).json({ error: "Finance write access required" }); return; }
  }
  if (v.kind === "resource" && (!v.resourceKey || !v.startsAt || !v.endsAt)) {
    res.status(400).json({ error: "Resource key and booking start/end are required" }); return;
  }
  if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
    res.status(400).json({ error: "End must be after start" }); return;
  }
  const actor = req.currentUser!.email;
  try {
    const result = await db.transaction(async tx => {
      if (v.kind === "resource") {
        // Transaction-level advisory lock serialises bookings for the same resource.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${v.resourceKey!}))`);
        const conflict = await tx.execute(sql`
          SELECT id FROM public.kaiti_operations
          WHERE kind='resource' AND resource_key=${v.resourceKey!}
            AND status NOT IN ('closed','rejected')
            AND starts_at < ${v.endsAt!}::timestamptz
            AND ends_at > ${v.startsAt!}::timestamptz LIMIT 1
        `);
        if (conflict.rows.length) return { conflict: true } as const;
      }
      const initialStatus = v.kind === "approval" ? "pending" : "open";
      const saved = await tx.execute(sql`
        INSERT INTO public.kaiti_operations
          (kind,title,description,ward,status,priority,assigned_to,due_at,starts_at,ends_at,resource_key,created_by)
        VALUES (${v.kind},${v.title},${v.description},${v.ward ?? null},${initialStatus},
          ${v.priority},${v.assignedTo ?? null},${v.dueAt ?? null}::timestamptz,
          ${v.startsAt ?? null}::timestamptz,${v.endsAt ?? null}::timestamptz,${v.resourceKey ?? null},${actor})
        RETURNING id,kind,title,status
      `);
      const item = saved.rows[0] as { id: number; kind: string; title: string; status: string };
      await tx.execute(sql`INSERT INTO public.kaiti_operation_history(operation_id,actor,action,next_status)
        VALUES (${item.id},${actor},'created',${initialStatus})`);
      return { item } as const;
    });
    if ("conflict" in result) { res.status(409).json({ error: "Resource is already booked during this period" }); return; }
    res.status(201).json(result.item);
  } catch (err) {
    req.log.error({ err }, "Operation creation failed");
    res.status(503).json({ error: "Operations storage unavailable; apply the migration and check database connectivity" });
  }
});

router.patch("/:id/status", requirePermission("events", "write"), async (req, res) => {
  const id = idOf(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!id || !parsed.success) { res.status(400).json({ error: "Invalid ID or status" }); return; }
  const actor = req.currentUser!.email;
  const saved = await db.transaction(async tx => {
    const current = await tx.execute(sql`SELECT id,kind,status,created_by FROM public.kaiti_operations WHERE id=${id} FOR UPDATE`);
    if (!current.rows.length) return { missing: true } as const;
    const row = current.rows[0] as { kind: z.infer<typeof kindSchema>; status: string; created_by: string };
    if (!allowedStatuses[row.kind].includes(parsed.data.status)) return { invalid: true } as const;
    if (row.kind === "approval") {
      const { permissionsForRole } = await import("../lib/auth");
      const role = req.currentUser!.role;
      const isSuper = role.toLowerCase().replace(/[_-]/g, "") === "superadmin";
      const perms = isSuper ? { finance: "write" } : await permissionsForRole(role);
      if (perms.finance !== "write" || row.created_by === actor) return { forbidden: true } as const;
    }
    await tx.execute(sql`UPDATE public.kaiti_operations SET status=${parsed.data.status},
      reviewed_by=${row.kind === "approval" ? actor : null},
      reviewed_at=${row.kind === "approval" ? new Date() : null}, updated_at=now() WHERE id=${id}`);
    await tx.execute(sql`INSERT INTO public.kaiti_operation_history(operation_id,actor,action,previous_status,next_status)
      VALUES (${id},${actor},'status_change',${row.status},${parsed.data.status})`);
    return { ok: true } as const;
  });
  if ("missing" in saved) { res.status(404).json({ error: "Not found" }); return; }
  if ("forbidden" in saved) { res.status(403).json({ error: "Finance approval requires another authorised reviewer" }); return; }
  if ("invalid" in saved) { res.status(400).json({ error: "Status not valid for this record type" }); return; }
  res.json({ id, status: parsed.data.status });
});

router.get("/:id/history", async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const result = await db.execute(sql`SELECT actor,action,previous_status AS "previousStatus",
    next_status AS "nextStatus",created_at AS "createdAt"
    FROM public.kaiti_operation_history WHERE operation_id=${id} ORDER BY created_at DESC LIMIT 100`);
  res.json(result.rows);
});

export default router;
