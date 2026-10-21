import { Router } from "express";
import { db, kolTable, campaignWards } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
const isMakueniWard = (ward: unknown): ward is string => typeof ward === "string" && (campaignWards().includes(ward) || ward === "county-wide" || ward === "all");

const router = Router();

router.get("/leaderboard", async (req, res) => {
  const kols = (await db.select().from(kolTable).orderBy(desc(kolTable.influenceScore))).filter(k => isMakueniWard(k.ward));
  res.json(kols);
});

router.get("/", async (req, res) => {
  const { tier } = req.query as Record<string, string>;
  const kols = tier
    ? (await db.select().from(kolTable).where(eq(kolTable.tier, tier)).orderBy(desc(kolTable.influenceScore))).filter(k => isMakueniWard(k.ward))
    : (await db.select().from(kolTable).orderBy(desc(kolTable.influenceScore))).filter(k => isMakueniWard(k.ward));
  res.json(kols);
});

router.post("/", async (req, res) => {
  const { name, platform, handle, tier, influenceScore = 0, followerCount, alignment, ward, notes } = req.body;
  if (!name || !platform || !tier || followerCount === undefined) { res.status(400).json({ error: "name, platform, tier, followerCount required" }); return; }
  if (ward != null && ward !== "" && !isMakueniWard(ward)) { res.status(400).json({ error: "Select a valid Makueni County ward" }); return; }
  if (ward != null && ward !== "" && !isMakueniWard(ward)) { res.status(400).json({ error: "Select a valid Makueni County ward" }); return; }
  const [kol] = await db.insert(kolTable).values({ name, platform, handle, tier, influenceScore, followerCount, alignment: alignment ?? "neutral", ward, notes }).returning();
  res.status(201).json(kol);
});

router.patch("/:id", async (req, res) => {
  const updates: any = {};
  const fields = ["name","handle","tier","influenceScore","followerCount","alignment","ward","notes","lastEngaged"];
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (updates.ward !== undefined && !isMakueniWard(updates.ward)) { res.status(400).json({ error: "Select a valid Makueni County ward or county-wide" }); return; }
  const [kol] = await db.update(kolTable).set(updates).where(eq(kolTable.id, parseInt(req.params.id))).returning();
  if (!kol) { res.status(404).json({ error: "Not found" }); return; }
  res.json(kol);
});

export default router;
