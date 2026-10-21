import { Router } from "express";
import { db, segmentsTable, membersTable, campaignWards, campaignConstituencies } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";

function hasValidKaitiGeography(criteria: unknown): boolean {
  if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) return true;
  const value = criteria as Record<string, unknown>;
  if (value.manualSize !== undefined || value.supportLevel !== undefined) return false;
  if (typeof value.ward === "string" && !["all", "county-wide"].includes(value.ward) && !campaignWards().includes(value.ward)) return false;
  if (typeof value.constituency === "string" && !campaignConstituencies().includes(value.constituency)) return false;
  if (typeof value.county === "string" && !["makueni", "makueni county"].includes(value.county.toLowerCase())) return false;
  return true;
}

const router = Router();

async function computeMemberCount(criteria: Record<string, any>) {
  const conditions = [inArray(membersTable.ward, campaignWards())];
  if (typeof criteria.ward === "string" && criteria.ward !== "all" && criteria.ward !== "county-wide" && campaignWards().includes(criteria.ward)) conditions.push(eq(membersTable.ward, criteria.ward));
  if (criteria.smsConsent) conditions.push(eq(membersTable.smsConsent, true));
  if (criteria.whatsappConsent) conditions.push(eq(membersTable.whatsappConsent, true));
  if (criteria.emailConsent) conditions.push(eq(membersTable.emailConsent, true));
  const where = and(...conditions);
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(where);
  return Number(result?.count ?? 0);
}

router.get("/", async (_req, res) => {
  const segs = (await db.select().from(segmentsTable).orderBy(segmentsTable.createdAt))
    .filter(seg => hasValidKaitiGeography(seg.criteria));
  res.json(segs);
});

router.post("/", async (req, res) => {
  const { name, description, criteria = {}, isLocked = false } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  if (!hasValidKaitiGeography(criteria)) { res.status(400).json({ error: "Select this campaign’s constituency and one of its wards" }); return; }
  const memberCount = await computeMemberCount(criteria);
  const [seg] = await db.insert(segmentsTable).values({ name, description, criteria, memberCount, isLocked }).returning();
  res.status(201).json(seg);
});

router.get("/:id", async (req, res) => {
  const [seg] = await db.select().from(segmentsTable).where(eq(segmentsTable.id, parseInt(req.params.id)));
  if (!seg || !hasValidKaitiGeography(seg.criteria)) { res.status(404).json({ error: "Not found" }); return; }
  const memberCount = await computeMemberCount(seg.criteria as any);
  res.json({ ...seg, memberCount });
});

router.patch("/:id", async (req, res) => {
  const updates: any = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.criteria !== undefined) {
    if (!hasValidKaitiGeography(req.body.criteria)) { res.status(400).json({ error: "Select this campaign’s constituency and one of its wards" }); return; }
    updates.criteria = req.body.criteria;
    updates.memberCount = await computeMemberCount(req.body.criteria);
  }
  if (req.body.isLocked !== undefined) updates.isLocked = req.body.isLocked;
  const [seg] = await db.update(segmentsTable).set(updates).where(eq(segmentsTable.id, parseInt(req.params.id))).returning();
  if (!seg) { res.status(404).json({ error: "Not found" }); return; }
  res.json(seg);
});

router.delete("/:id", async (req, res) => {
  await db.delete(segmentsTable).where(eq(segmentsTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

export default router;
