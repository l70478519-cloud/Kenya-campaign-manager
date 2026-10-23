import { Router } from "express";
import { z } from "zod/v4";
import { db, kolTable, kolHandlesTable, kolStanceHistoryTable, auditLogsTable, campaignWards } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { KOL_WEIGHTS, tierFor } from "../lib/kol-score";
import { handlesByKol, scoreKols, linkedMentions, relinkRecentMentions } from "../lib/kol-service";

// Key opinion leaders with measured, explainable influence scores
// (docs/SOCIAL_LISTENING_PLAN.md, KOL-1). Writes need KOL write access.

// KOLs belong to one of the campaign's operational units (wards; counties for a
// presidential campaign), to the whole area, or to no recorded ward.
const AREA_WIDE = new Set(["county-wide", "all"]);
const isCampaignArea = (ward: unknown): ward is string =>
  typeof ward === "string" && (campaignWards().includes(ward) || AREA_WIDE.has(ward));
const AREA_ERROR = "Select one of this campaign's wards (or counties for a presidential campaign), or the whole area.";
const STANCES = ["supporter", "neutral", "opponent"] as const;
const TIERS = ["micro", "mid", "macro", "mega"] as const;

const router = Router();

const actorOf = (req: { currentUser?: { email?: string | null; name?: string | null } }) =>
  ({ email: req.currentUser?.email ?? "unknown", name: req.currentUser?.name ?? req.currentUser?.email ?? "unknown" });

async function audit(req: Parameters<typeof actorOf>[0], action: string, details: string) {
  try {
    const a = actorOf(req);
    await db.insert(auditLogsTable).values({ userEmail: a.email, userName: a.name, action, module: "kol", details, severity: "info" });
  } catch { /* non-critical */ }
}

const visible = (k: typeof kolTable.$inferSelect) => k.ward === null || k.ward === "" || isCampaignArea(k.ward);

/** KOLs with handles and a freshly computed score, highest score first. */
async function listWithScores(tier?: string) {
  const kols = (await db.select().from(kolTable).where(tier ? eq(kolTable.tier, tier) : undefined)).filter(visible);
  const [handles, scores] = await Promise.all([handlesByKol(kols.map(k => k.id)), scoreKols(kols)]);
  return kols
    .map(k => ({ ...k, influenceScore: scores.get(k.id)?.score ?? k.influenceScore, handles: handles.get(k.id) ?? [], score: scores.get(k.id) }))
    .sort((a, b) => b.influenceScore - a.influenceScore || a.name.localeCompare(b.name));
}

router.get("/weights", (_req, res) => res.json(KOL_WEIGHTS));

router.get("/leaderboard", async (_req, res) => {
  res.json(await listWithScores());
});

router.get("/", async (req, res) => {
  const tier = typeof req.query.tier === "string" && (TIERS as readonly string[]).includes(req.query.tier) ? req.query.tier : undefined;
  res.json(await listWithScores(tier));
});

const idSchema = z.coerce.number().int().positive();
const handleSchema = z.object({
  platform: z.string().trim().min(1).max(40),
  handle: z.string().trim().min(1).max(120),
  url: z.url().max(500).optional().nullable(),
  followers: z.number().int().min(0).max(500_000_000).optional().nullable(),
  engagementRate: z.number().min(0).max(100).optional().nullable(),
});
// No defaults here: edits use .partial(), and a default would overwrite fields the request left out.
const baseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["online", "offline"]),
  platform: z.string().trim().max(40).optional(),
  handle: z.string().trim().max(120).optional(),
  role: z.string().trim().max(60).optional().nullable(),
  reachEstimate: z.number().int().min(0).max(10_000_000).optional().nullable(),
  followerCount: z.number().int().min(0).max(500_000_000).optional(),
  engagementRate: z.number().min(0).max(100).optional().nullable(),
  tier: z.enum(TIERS).optional(),
  alignment: z.enum(STANCES),
  ward: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  scoreOverride: z.number().int().min(0).max(100).optional().nullable(),
  overrideReason: z.string().trim().max(300).optional().nullable(),
});
const createSchema = baseSchema.extend({
  kind: z.enum(["online", "offline"]).default("online"),
  alignment: z.enum(STANCES).default("neutral"),
});
const overrideNeedsReason = (v: { scoreOverride?: number | null; overrideReason?: string | null }) =>
  v.scoreOverride === undefined || v.scoreOverride === null || (v.overrideReason ?? "").trim().length >= 5;

router.post("/", async (req, res) => {
  const parsed = createSchema.refine(overrideNeedsReason, { message: "Give a reason (5+ characters) for a manual score." }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the KOL details" }); return; }
  const v = parsed.data;
  if (v.ward && !isCampaignArea(v.ward)) { res.status(400).json({ error: AREA_ERROR }); return; }
  const reach = v.kind === "offline" ? v.reachEstimate ?? 0 : v.followerCount ?? 0;
  const [kol] = await db.insert(kolTable).values({
    name: v.name, kind: v.kind, role: v.role ?? null,
    platform: v.kind === "offline" ? "Offline" : v.platform || "Other",
    handle: v.kind === "online" ? v.handle || null : null,
    tier: v.tier ?? tierFor(reach),
    followerCount: v.followerCount ?? 0,
    reachEstimate: v.kind === "offline" ? v.reachEstimate ?? null : null,
    alignment: v.alignment, ward: v.ward || null, notes: v.notes ?? null,
    scoreOverride: v.scoreOverride ?? null, overrideReason: v.scoreOverride != null ? v.overrideReason ?? null : null,
    stanceUpdatedAt: new Date(),
  }).returning();
  if (v.kind === "online" && v.handle) {
    await db.insert(kolHandlesTable).values({
      kolId: kol.id, platform: v.platform || "Other", handle: v.handle,
      followers: v.followerCount ?? null, engagementRate: v.engagementRate ?? null,
      figuresAsOf: v.followerCount != null || v.engagementRate != null ? new Date() : null,
    });
  }
  await db.insert(kolStanceHistoryTable).values({ kolId: kol.id, stance: v.alignment, source: "initial", recordedBy: actorOf(req).email });
  await relinkRecentMentions();
  const [scored] = await listWithScores().then(list => list.filter(k => k.id === kol.id));
  await audit(req, "Added KOL", `#${kol.id} ${kol.name} (${v.kind}${v.role ? `, ${v.role}` : ""})${v.scoreOverride != null ? `; manual score ${v.scoreOverride}: ${v.overrideReason}` : ""}`);
  res.status(201).json(scored ?? kol);
});

router.get("/:id", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid KOL id" }); return; }
  const [kol] = await db.select().from(kolTable).where(eq(kolTable.id, id.data));
  if (!kol || !visible(kol)) { res.status(404).json({ error: "Not found" }); return; }
  const [handles, scores, history, mentions] = await Promise.all([
    handlesByKol([kol.id]), scoreKols([kol]),
    db.select().from(kolStanceHistoryTable).where(eq(kolStanceHistoryTable.kolId, kol.id)).orderBy(desc(kolStanceHistoryTable.recordedAt)),
    linkedMentions(kol.id),
  ]);
  // What the KOL published, by tone toward the candidate: evidence for staff, never applied automatically.
  const authored = mentions.filter(m => m.role === "author" && m.reviewStatus !== "rejected");
  const authoredSentiment = { positive: 0, neutral: 0, negative: 0 } as Record<string, number>;
  for (const m of authored) authoredSentiment[m.sentiment] = (authoredSentiment[m.sentiment] ?? 0) + 1;
  res.json({ ...kol, influenceScore: scores.get(kol.id)?.score ?? kol.influenceScore, handles: handles.get(kol.id) ?? [], score: scores.get(kol.id), history, mentions, authoredSentiment });
});

router.patch("/:id", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid KOL id" }); return; }
  const parsed = baseSchema.partial().refine(overrideNeedsReason, { message: "Give a reason (5+ characters) for a manual score." }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the KOL details" }); return; }
  const v = parsed.data;
  if (v.ward && !isCampaignArea(v.ward)) { res.status(400).json({ error: AREA_ERROR }); return; }
  const [current] = await db.select().from(kolTable).where(eq(kolTable.id, id.data));
  if (!current || !visible(current)) { res.status(404).json({ error: "Not found" }); return; }
  const updates: Partial<typeof kolTable.$inferInsert> = {};
  for (const key of ["name", "kind", "role", "reachEstimate", "followerCount", "tier", "notes"] as const) {
    if (v[key] !== undefined) (updates as Record<string, unknown>)[key] = v[key];
  }
  if (v.ward !== undefined) updates.ward = v.ward || null;
  if (v.scoreOverride !== undefined) {
    updates.scoreOverride = v.scoreOverride;
    updates.overrideReason = v.scoreOverride === null ? null : v.overrideReason ?? null;
  }
  // Stance changes go through the history so every change is recorded.
  if (v.alignment !== undefined && v.alignment !== current.alignment) {
    updates.alignment = v.alignment;
    updates.stanceUpdatedAt = new Date();
    await db.insert(kolStanceHistoryTable).values({ kolId: current.id, stance: v.alignment, previousStance: current.alignment, source: "staff", recordedBy: actorOf(req).email });
  }
  if (Object.keys(updates).length) await db.update(kolTable).set(updates).where(eq(kolTable.id, current.id));
  if (v.scoreOverride !== undefined && v.scoreOverride !== current.scoreOverride) {
    await audit(req, v.scoreOverride === null ? "Removed manual KOL score" : "Set manual KOL score", `#${current.id} ${current.name}${v.scoreOverride !== null ? `: ${v.scoreOverride} (${v.overrideReason})` : ""}`);
  }
  if (v.name !== undefined) await relinkRecentMentions();
  const [scored] = (await listWithScores()).filter(k => k.id === current.id);
  res.json(scored);
});

router.post("/:id/stance", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const body = z.object({
    stance: z.enum(STANCES),
    source: z.enum(["staff", "field"]),
    note: z.string().trim().min(5, "Say briefly why the stance changed").max(500),
  }).safeParse(req.body);
  if (!id.success || !body.success) { res.status(400).json({ error: body.success ? "Invalid KOL id" : body.error.issues[0]?.message ?? "Check the stance" }); return; }
  const [current] = await db.select().from(kolTable).where(eq(kolTable.id, id.data));
  if (!current || !visible(current)) { res.status(404).json({ error: "Not found" }); return; }
  const [entry] = await db.insert(kolStanceHistoryTable).values({
    kolId: current.id, stance: body.data.stance, previousStance: current.alignment,
    source: body.data.source, note: body.data.note, recordedBy: actorOf(req).email,
  }).returning();
  await db.update(kolTable).set({ alignment: body.data.stance, stanceUpdatedAt: new Date() }).where(eq(kolTable.id, current.id));
  await audit(req, "Recorded KOL stance", `#${current.id} ${current.name}: ${current.alignment} → ${body.data.stance} (${body.data.source}): ${body.data.note}`);
  res.status(201).json(entry);
});

router.post("/:id/handles", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const body = handleSchema.safeParse(req.body);
  if (!id.success || !body.success) { res.status(400).json({ error: "Give a platform and handle; figures must be valid numbers." }); return; }
  const [kol] = await db.select().from(kolTable).where(eq(kolTable.id, id.data));
  if (!kol || !visible(kol)) { res.status(404).json({ error: "Not found" }); return; }
  const h = body.data;
  const [created] = await db.insert(kolHandlesTable).values({
    kolId: kol.id, platform: h.platform, handle: h.handle, url: h.url ?? null, followers: h.followers ?? null,
    engagementRate: h.engagementRate ?? null, figuresAsOf: h.followers != null || h.engagementRate != null ? new Date() : null,
  }).returning();
  await relinkRecentMentions();
  res.status(201).json(created);
});

router.patch("/:id/handles/:handleId", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const handleId = idSchema.safeParse(req.params.handleId);
  const body = handleSchema.partial().safeParse(req.body);
  if (!id.success || !handleId.success || !body.success) { res.status(400).json({ error: "Check the handle details" }); return; }
  const h = body.data;
  const figuresChanged = h.followers !== undefined || h.engagementRate !== undefined;
  const [updated] = await db.update(kolHandlesTable).set({ ...h, ...(figuresChanged ? { figuresAsOf: new Date() } : {}) })
    .where(and(eq(kolHandlesTable.id, handleId.data), eq(kolHandlesTable.kolId, id.data))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  if (h.handle !== undefined) await relinkRecentMentions();
  res.json(updated);
});

router.delete("/:id/handles/:handleId", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const handleId = idSchema.safeParse(req.params.handleId);
  if (!id.success || !handleId.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const removed = await db.delete(kolHandlesTable).where(and(eq(kolHandlesTable.id, handleId.data), eq(kolHandlesTable.kolId, id.data))).returning({ id: kolHandlesTable.id });
  if (!removed.length) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

router.post("/relink", async (_req, res) => {
  const linked = await relinkRecentMentions();
  res.json({ linked });
});

export default router;
