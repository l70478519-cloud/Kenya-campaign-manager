import { Router } from "express";
import { db, campaignWards, volunteersTable, volunteerAssignmentsTable, volunteerTasksTable, volunteerProgressLogsTable, volunteerIssuesTable } from "@workspace/db";
import { eq, and, sql, desc, gte, inArray } from "drizzle-orm";
import { z } from "zod/v4";


const isKaitiWard = (ward: unknown): ward is string => typeof ward === "string" && campaignWards().includes(ward);

const router = Router();

// ─── Public self-registration ────────────────────────────────────────────────

const registrationSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  phone: z.string().trim().min(7, "A valid phone number is required").max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  ward: z.string().trim().refine((ward) => isKaitiWard(ward), "Select a valid Kaiti Constituency ward"),
  interests: z.string().trim().max(500).optional().or(z.literal("")),
  availability: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

// Best-effort in-memory per-IP rate limit (single instance). 6 registrations / 10 min.
const REG_WINDOW_MS = 10 * 60 * 1000;
const REG_MAX_PER_WINDOW = 6;
const regHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (regHits.get(ip) ?? []).filter((t) => now - t < REG_WINDOW_MS);
  if (hits.length >= REG_MAX_PER_WINDOW) {
    regHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  regHits.set(ip, hits);
  return false;
}

router.post("/register", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (rateLimited(ip)) {
    res.status(429).json({ error: "rate_limited", message: "Too many registrations. Please try again later." });
    return;
  }
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_registration", details: z.flattenError(parsed.error) });
    return;
  }
  const d = parsed.data;

  // Dedupe: if this phone already self-registered, return the existing record (idempotent re-submit).
  const existing = await db
    .select()
    .from(volunteersTable)
    .where(and(eq(volunteersTable.phone, d.phone), eq(volunteersTable.source, "online_registration")))
    .limit(1);
  if (existing.length > 0) {
    res.status(201).json(existing[0]);
    return;
  }

  const [volunteer] = await db.insert(volunteersTable).values({
    firstName: d.firstName,
    lastName: d.lastName,
    phone: d.phone,
    email: d.email || null,
    ward: d.ward,
    interests: d.interests || null,
    availability: d.availability || null,
    message: d.message || null,
    source: "online_registration",
    status: "pending",
    role: "volunteer",
  }).returning();
  req.log.info({ volunteerId: volunteer.id }, "volunteer self-registered");
  res.status(201).json(volunteer);
});

// ─── Assignments (before /:id wildcard) ──────────────────────────────────────

router.get("/assignments", async (req, res) => {
  const assignments = await db.select().from(volunteerAssignmentsTable).where(inArray(volunteerAssignmentsTable.ward, campaignWards())).orderBy(volunteerAssignmentsTable.assignedAt);
  res.json(assignments);
});

router.post("/assignments", async (req, res) => {
  const { volunteerId, ward, sessionId } = req.body;
  if (!volunteerId || !ward) { res.status(400).json({ error: "volunteerId and ward required" }); return; }
  if (!isKaitiWard(ward)) { res.status(400).json({ error: "A valid ward for this campaign is required" }); return; }
  const [assignment] = await db.insert(volunteerAssignmentsTable).values({ volunteerId, ward, sessionId }).returning();
  res.status(201).json(assignment);
});

// ─── Tasks ───────────────────────────────────────────────────────────────────

router.get("/tasks", async (req, res) => {
  const { volunteerId, status } = req.query as Record<string, string>;
  const conditions = [];
  if (volunteerId) conditions.push(eq(volunteerTasksTable.volunteerId, parseInt(volunteerId)));
  if (status) conditions.push(eq(volunteerTasksTable.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  const tasks = await db.select().from(volunteerTasksTable).where(where).orderBy(desc(volunteerTasksTable.createdAt));
  res.json(tasks);
});

router.post("/tasks", async (req, res) => {
  const { volunteerId, title, description, category = "canvassing", ward, priority = "medium", targetMetric, targetValue, dueDate, assignedBy = "Campaign Manager", notes } = req.body;
  if (!volunteerId || !title) { res.status(400).json({ error: "volunteerId and title required" }); return; }
  const [task] = await db.insert(volunteerTasksTable).values({
    volunteerId, title, description, category, ward, priority, targetMetric,
    targetValue: targetValue ? parseInt(targetValue) : undefined,
    dueDate, assignedBy, notes, status: "assigned",
  }).returning();
  res.status(201).json(task);
});

router.patch("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const fields = ["title","description","category","ward","priority","status","targetMetric","targetValue","currentValue","dueDate","notes","assignedBy"];
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (updates.ward !== undefined && !isKaitiWard(updates.ward)) { res.status(400).json({ error: "Select a valid ward for this campaign" }); return; }
  if (req.body.status === "completed") updates.completedAt = new Date();
  const [task] = await db.update(volunteerTasksTable).set(updates).where(eq(volunteerTasksTable.id, id)).returning();
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  res.json(task);
});

router.delete("/tasks/:id", async (req, res) => {
  await db.delete(volunteerTasksTable).where(eq(volunteerTasksTable.id, parseInt(req.params.id)));
  res.json({ ok: true });
});

// ─── Progress Logs ────────────────────────────────────────────────────────────

router.get("/tasks/:id/progress", async (req, res) => {
  const logs = await db.select().from(volunteerProgressLogsTable)
    .where(eq(volunteerProgressLogsTable.taskId, parseInt(req.params.id)))
    .orderBy(desc(volunteerProgressLogsTable.logDate));
  res.json(logs);
});

router.post("/tasks/:id/progress", async (req, res) => {
  const taskId = parseInt(req.params.id);
  const { volunteerId, completionPct, valueAchieved, notes, blockers, hoursSpent } = req.body;
  if (!volunteerId) { res.status(400).json({ error: "volunteerId required" }); return; }
  const today = new Date().toISOString().slice(0, 10);
  // upsert today's log
  const existing = await db.select().from(volunteerProgressLogsTable)
    .where(and(eq(volunteerProgressLogsTable.taskId, taskId), eq(volunteerProgressLogsTable.logDate, today)));
  let log;
  if (existing.length > 0) {
    [log] = await db.update(volunteerProgressLogsTable).set({ completionPct, valueAchieved, notes, blockers, hoursSpent }).where(eq(volunteerProgressLogsTable.id, existing[0].id)).returning();
  } else {
    [log] = await db.insert(volunteerProgressLogsTable).values({ taskId, volunteerId, logDate: today, completionPct, valueAchieved, notes, blockers, hoursSpent }).returning();
  }
  // update task currentValue
  if (valueAchieved !== undefined) {
    await db.update(volunteerTasksTable).set({ currentValue: valueAchieved, updatedAt: new Date() }).where(eq(volunteerTasksTable.id, taskId));
  }
  res.status(201).json(log);
});

// ─── Issues ───────────────────────────────────────────────────────────────────

router.get("/issues", async (req, res) => {
  const { status, severity } = req.query as Record<string, string>;
  const conditions = [];
  if (status) conditions.push(eq(volunteerIssuesTable.status, status));
  if (severity) conditions.push(eq(volunteerIssuesTable.severity, severity));
  const where = conditions.length ? and(...conditions) : undefined;
  const issues = await db.select().from(volunteerIssuesTable).where(where).orderBy(desc(volunteerIssuesTable.reportedAt));
  res.json(issues);
});

router.post("/issues", async (req, res) => {
  const { volunteerId, taskId, severity = "medium", title, description, ward } = req.body;
  if (!volunteerId || !title || !description) { res.status(400).json({ error: "volunteerId, title, description required" }); return; }
  const [issue] = await db.insert(volunteerIssuesTable).values({ volunteerId, taskId, severity, title, description, ward, status: "open" }).returning();
  res.status(201).json(issue);
});

router.patch("/issues/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates: Record<string, unknown> = {};
  if (req.body.status) updates.status = req.body.status;
  if (req.body.resolution) updates.resolution = req.body.resolution;
  if (req.body.resolvedBy) updates.resolvedBy = req.body.resolvedBy;
  if (req.body.status === "resolved") updates.resolvedAt = new Date();
  const [issue] = await db.update(volunteerIssuesTable).set(updates).where(eq(volunteerIssuesTable.id, id)).returning();
  if (!issue) { res.status(404).json({ error: "Not found" }); return; }
  res.json(issue);
});

// ─── Daily Report ─────────────────────────────────────────────────────────────

router.get("/daily-report", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  // all volunteers with their task counts
  const volunteers = await db.select().from(volunteersTable).where(inArray(volunteersTable.ward, campaignWards())).orderBy(volunteersTable.ward, volunteersTable.lastName);

  // all tasks
  const volunteerIds = volunteers.map(v => v.id);
  const allTasks = volunteerIds.length ? await db.select().from(volunteerTasksTable).where(inArray(volunteerTasksTable.volunteerId, volunteerIds)) : [];

  // today's progress logs
  const todayLogs = volunteerIds.length ? await db.select().from(volunteerProgressLogsTable)
    .where(and(eq(volunteerProgressLogsTable.logDate, today), inArray(volunteerProgressLogsTable.volunteerId, volunteerIds))) : [];

  // open issues
  const openIssues = await db.select().from(volunteerIssuesTable)
    .where(and(eq(volunteerIssuesTable.status, "open"), inArray(volunteerIssuesTable.ward, campaignWards())))
    .orderBy(desc(volunteerIssuesTable.reportedAt));

  // task stats
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.status === "completed").length;
  const overdueTasks = allTasks.filter(t => t.status !== "completed" && t.dueDate && t.dueDate < today).length;
  const checkedInToday = new Set(todayLogs.map(l => l.volunteerId)).size;

  // per-volunteer summary
  const volunteerSummaries = volunteers.map(v => {
    const tasks = allTasks.filter(t => t.volunteerId === v.id);
    const logs = todayLogs.filter(l => l.volunteerId === v.id);
    const avgCompletion = tasks.length > 0
      ? Math.round(tasks.reduce((sum, t) => sum + t.currentValue, 0) / tasks.length)
      : 0;
    const hasBlockers = logs.some(l => l.blockers && l.blockers.trim().length > 0);
    const checkedIn = logs.length > 0;
    return {
      id: v.id,
      name: `${v.firstName} ${v.lastName}`,
      ward: v.ward,
      role: v.role,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === "completed").length,
      activeTasks: tasks.filter(t => t.status === "assigned" || t.status === "in_progress").length,
      checkedIn,
      avgCompletion,
      hasBlockers,
      todayNotes: logs.map(l => l.notes).filter(Boolean).join("; "),
      blockers: logs.map(l => l.blockers).filter(Boolean).join("; "),
    };
  });

  // ward breakdown
  const wardBreakdown = campaignWards().map(ward => {
    const wardVols = volunteers.filter(v => v.ward === ward);
    const wardTasks = allTasks.filter(t => wardVols.some(v => v.id === t.volunteerId));
    const wardLogs = todayLogs.filter(l => wardVols.some(v => v.id === l.volunteerId));
    return {
      ward,
      volunteers: wardVols.length,
      checkedIn: new Set(wardLogs.map(l => l.volunteerId)).size,
      tasks: wardTasks.length,
      completed: wardTasks.filter(t => t.status === "completed").length,
    };
  });

  res.json({
    date: today,
    summary: { totalVolunteers: volunteers.length, checkedInToday, totalTasks, completedTasks, overdueTasks, openIssues: openIssues.length },
    volunteerSummaries,
    wardBreakdown,
    openIssues,
    criticalIssues: openIssues.filter(i => i.severity === "critical"),
  });
});

// ─── Volunteers CRUD ──────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const { ward, status } = req.query as Record<string, string>;
  const conditions = [inArray(volunteersTable.ward, campaignWards())];
  if (ward) { if (!isKaitiWard(ward)) { res.status(400).json({ error: "Select a valid ward for this campaign" }); return; } conditions.push(eq(volunteersTable.ward, ward)); }
  if (status) conditions.push(eq(volunteersTable.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  const volunteers = await db.select().from(volunteersTable).where(where).orderBy(volunteersTable.ward, volunteersTable.lastName);
  res.json(volunteers);
});

router.post("/", async (req, res) => {
  const { firstName, lastName, email, phone, ward, role = "canvasser" } = req.body;
  if (!firstName || !lastName) { res.status(400).json({ error: "firstName and lastName required" }); return; }
  if (!isKaitiWard(ward)) { res.status(400).json({ error: "A valid ward for this campaign is required" }); return; }
  const [volunteer] = await db.insert(volunteersTable).values({ firstName, lastName, email, phone, ward, role, status: "active", doorsKnocked: 0, hoursLogged: 0 }).returning();
  res.status(201).json(volunteer);
});

router.get("/:id", async (req, res) => {
  const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, parseInt(req.params.id)));
  if (!volunteer) { res.status(404).json({ error: "Not found" }); return; }
  res.json(volunteer);
});

router.patch("/:id", async (req, res) => {
  const updates: Record<string, unknown> = {};
  const fields = ["firstName","lastName","email","phone","ward","status","role","hoursLogged","doorsKnocked"];
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (updates.ward !== undefined && !isKaitiWard(updates.ward)) { res.status(400).json({ error: "Select a valid ward for this campaign" }); return; }
  const [volunteer] = await db.update(volunteersTable).set(updates).where(eq(volunteersTable.id, parseInt(req.params.id))).returning();
  if (!volunteer) { res.status(404).json({ error: "Not found" }); return; }
  res.json(volunteer);
});

export default router;
