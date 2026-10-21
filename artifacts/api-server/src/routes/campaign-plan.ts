import { Router } from "express";
import { db, milestonesTable, campaignSettingsTable, candidateReadinessTable } from "@workspace/db";
import { eq, sql, desc, asc, and, lte, gte } from "drizzle-orm";

const router = Router();

// ─── Milestones ───────────────────────────────────────────────────────────────

router.get("/milestones", async (req, res) => {
  const { category, status } = req.query as Record<string, string>;
  const conditions = [];
  if (category) conditions.push(eq(milestonesTable.category, category));
  if (status) conditions.push(eq(milestonesTable.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  const milestones = await db.select().from(milestonesTable).where(where).orderBy(asc(milestonesTable.dueDate));
  res.json(milestones);
});

router.post("/milestones", async (req, res) => {
  const { title, description, dueDate, startDate, category, priority = "medium", owner, notes } = req.body;
  if (!title || !dueDate || !category) { res.status(400).json({ error: "title, dueDate, category required" }); return; }
  const [milestone] = await db.insert(milestonesTable).values({ title, description, dueDate, startDate, category, priority, owner, notes, status: "pending" }).returning();
  res.status(201).json(milestone);
});

router.patch("/milestones/:id", async (req, res) => {
  const updates: Record<string, unknown> = {};
  const fields = ["title","description","dueDate","startDate","status","category","priority","owner","notes"];
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (req.body.status === "completed") updates.completedAt = new Date();
  else if (req.body.status !== undefined) updates.completedAt = null;
  const [milestone] = await db.update(milestonesTable).set(updates).where(eq(milestonesTable.id, parseInt(req.params.id))).returning();
  if (!milestone) { res.status(404).json({ error: "Not found" }); return; }
  res.json(milestone);
});

router.delete("/milestones/:id", async (req, res) => {
  await db.delete(milestonesTable).where(eq(milestonesTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

// ─── Readiness score ─────────────────────────────────────────────────────────

router.get("/readiness", async (req, res) => {
  const milestones = await db.select().from(milestonesTable);
  const total = milestones.length;
  const completed = milestones.filter(m => m.status === "completed").length;
  const overall = total > 0 ? Math.round((completed / total) * 100) : 0;
  const categories: Record<string, { total: number; completed: number; overdue: number }> = {};
  const now = new Date().toISOString().slice(0, 10);
  for (const m of milestones) {
    if (!categories[m.category]) categories[m.category] = { total: 0, completed: 0, overdue: 0 };
    categories[m.category]!.total++;
    if (m.status === "completed") categories[m.category]!.completed++;
    if (m.status !== "completed" && m.dueDate < now) categories[m.category]!.overdue++;
  }
  const byCategory = Object.entries(categories).map(([category, c]) => ({
    category,
    score: c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0,
    total: c.total,
    completed: c.completed,
    overdue: c.overdue,
  })).sort((a, b) => a.score - b.score);
  const overdueCount = milestones.filter(m => m.status !== "completed" && m.dueDate < now).length;
  const inProgressCount = milestones.filter(m => m.status === "in_progress").length;
  res.json({ overall, byCategory, completedMilestones: completed, totalMilestones: total, overdueCount, inProgressCount });
});

// ─── Countdown ────────────────────────────────────────────────────────────────

router.get("/countdown", async (req, res) => {
  const settings = await db.select().from(campaignSettingsTable).where(eq(campaignSettingsTable.key, "election_date"));
  const setting = settings[0];
  if (!setting) { res.json({ electionDate: null, daysRemaining: null, phase: "planning" }); return; }
  const electionDate = new Date(setting.value);
  const now = new Date();
  const diff = Math.ceil((electionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  let phase = "planning";
  if (diff <= 0) phase = "post-election";
  else if (diff <= 7) phase = "final_push";
  else if (diff <= 30) phase = "gotv";
  else if (diff <= 90) phase = "active_campaign";
  else if (diff <= 180) phase = "pre_campaign";
  res.json({ electionDate: setting.value, daysRemaining: diff, phase });
});

router.post("/countdown", async (req, res) => {
  const { electionDate } = req.body;
  if (!electionDate) { res.status(400).json({ error: "electionDate required" }); return; }
  const existing = await db.select().from(campaignSettingsTable).where(eq(campaignSettingsTable.key, "election_date"));
  if (existing.length > 0) {
    await db.update(campaignSettingsTable).set({ value: electionDate, updatedAt: new Date() }).where(eq(campaignSettingsTable.key, "election_date"));
  } else {
    await db.insert(campaignSettingsTable).values({ key: "election_date", value: electionDate });
  }
  const date = new Date(electionDate);
  const diff = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  res.json({ electionDate, daysRemaining: diff, phase: diff > 90 ? "planning" : diff > 30 ? "active_campaign" : "gotv" });
});

// ─── Candidate Readiness Checklist ───────────────────────────────────────────

router.get("/candidate-readiness", async (req, res) => {
  const items = await db.select().from(candidateReadinessTable).orderBy(asc(candidateReadinessTable.domain), asc(candidateReadinessTable.id));
  res.json(items);
});

router.post("/candidate-readiness", async (req, res) => {
  const { domain, item, status = "not_started", owner, notes, weight = "medium" } = req.body;
  if (!domain || !item) { res.status(400).json({ error: "domain and item required" }); return; }
  const [row] = await db.insert(candidateReadinessTable).values({ domain, item, status, owner, notes, weight }).returning();
  res.status(201).json(row);
});

router.patch("/candidate-readiness/:id", async (req, res) => {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const fields = ["domain", "item", "status", "owner", "notes", "weight"];
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  const [row] = await db.update(candidateReadinessTable).set(updates).where(eq(candidateReadinessTable.id, parseInt(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/candidate-readiness/:id", async (req, res) => {
  await db.delete(candidateReadinessTable).where(eq(candidateReadinessTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

// ─── Pacing & Alerts ─────────────────────────────────────────────────────────

router.get("/alerts", async (req, res) => {
  const milestones = await db.select().from(milestonesTable).orderBy(asc(milestonesTable.dueDate));
  const settings = await db.select().from(campaignSettingsTable).where(eq(campaignSettingsTable.key, "election_date"));
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const in14 = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const overdue = milestones.filter(m => m.status !== "completed" && m.dueDate < todayStr);
  const dueIn7 = milestones.filter(m => m.status !== "completed" && m.dueDate >= todayStr && m.dueDate <= in7);
  const dueIn14 = milestones.filter(m => m.status !== "completed" && m.dueDate > in7 && m.dueDate <= in14);
  const dueIn30 = milestones.filter(m => m.status !== "completed" && m.dueDate > in14 && m.dueDate <= in30);
  const noOwner = milestones.filter(m => !m.owner && m.status !== "completed");
  const critical = milestones.filter(m => m.priority === "critical" && m.status !== "completed");

  const electionDate = settings[0]?.value ?? null;
  let daysToElection: number | null = null;
  if (electionDate) {
    daysToElection = Math.ceil((new Date(electionDate).getTime() - now.getTime()) / 86400000);
  }

  // Phase-based recommendations
  const recommendations: string[] = [];
  if (overdue.length > 0) recommendations.push(`${overdue.length} milestone(s) are overdue — immediate action required.`);
  if (dueIn7.length > 0) recommendations.push(`${dueIn7.length} milestone(s) due in the next 7 days — assign owners if not done.`);
  if (noOwner.length > 0) recommendations.push(`${noOwner.length} milestone(s) have no owner assigned — risk of slippage.`);
  if (critical.length > 0) recommendations.push(`${critical.length} CRITICAL priority item(s) still pending — escalate immediately.`);
  if (daysToElection !== null && daysToElection <= 90 && daysToElection > 0) recommendations.push(`${daysToElection} days to election. Prioritise GOTV and ground game activities.`);
  if (daysToElection !== null && daysToElection <= 30) recommendations.push("FINAL PHASE: Focus on voter mobilisation, polling station coverage, and logistics.");
  if (recommendations.length === 0) recommendations.push("Campaign is on track. Continue current pace and monitor upcoming milestones.");

  res.json({ overdue, dueIn7, dueIn14, dueIn30, noOwner, critical, recommendations, daysToElection, electionDate });
});

// ─── Report data ─────────────────────────────────────────────────────────────

router.get("/report", async (req, res) => {
  const milestones = await db.select().from(milestonesTable).orderBy(asc(milestonesTable.dueDate));
  const readiness = await db.select().from(candidateReadinessTable).orderBy(asc(candidateReadinessTable.domain));
  const settings = await db.select().from(campaignSettingsTable).where(eq(campaignSettingsTable.key, "election_date"));
  const electionDate = settings[0]?.value ?? null;
  const now = new Date();
  const daysToElection = electionDate ? Math.ceil((new Date(electionDate).getTime() - now.getTime()) / 86400000) : null;
  const todayStr = now.toISOString().slice(0, 10);
  const total = milestones.length;
  const completed = milestones.filter(m => m.status === "completed").length;
  const overdue = milestones.filter(m => m.status !== "completed" && m.dueDate < todayStr).length;
  res.json({ milestones, readiness, electionDate, daysToElection, generatedAt: now.toISOString(), stats: { total, completed, overdue, inProgress: milestones.filter(m => m.status === "in_progress").length } });
});

export default router;
