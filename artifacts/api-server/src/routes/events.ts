import { Router } from "express";
import { db, campaignEventsTable, campaignWards } from "@workspace/db";
import { eq, gte, sql, inArray, and, or, isNull } from "drizzle-orm";

const isKaitiWard = (ward: unknown): ward is string => typeof ward === "string" && campaignWards().includes(ward);

const router = Router();

router.get("/", async (req, res) => {
  const { upcoming } = req.query as Record<string, string>;
  let events;
  if (upcoming === "true") {
    const today = new Date().toISOString().slice(0, 10);
    events = await db.select().from(campaignEventsTable).where(and(or(isNull(campaignEventsTable.ward), inArray(campaignEventsTable.ward, campaignWards())), gte(campaignEventsTable.startDate, today))).orderBy(campaignEventsTable.startDate);
  } else {
    events = await db.select().from(campaignEventsTable).where(or(isNull(campaignEventsTable.ward), inArray(campaignEventsTable.ward, campaignWards()))).orderBy(campaignEventsTable.startDate);
  }
  res.json(events);
});

router.post("/", async (req, res) => {
  const { title, description, type, location, ward, startDate, endDate, maxAttendees } = req.body;
  if (!title || !type || !startDate) { res.status(400).json({ error: "title, type, startDate required" }); return; }
  if (ward != null && ward !== "" && !isKaitiWard(ward)) { res.status(400).json({ error: "Select a valid ward for this campaign" }); return; }
  const [event] = await db.insert(campaignEventsTable).values({ title, description, type, location, ward, startDate, endDate, maxAttendees, status: "scheduled", attendeeCount: 0 }).returning();
  res.status(201).json(event);
});

router.get("/:id", async (req, res) => {
  const [event] = await db.select().from(campaignEventsTable).where(and(eq(campaignEventsTable.id, parseInt(req.params.id)), or(isNull(campaignEventsTable.ward), inArray(campaignEventsTable.ward, campaignWards()))));
  if (!event) { res.status(404).json({ error: "Not found" }); return; }
  res.json(event);
});

router.patch("/:id", async (req, res) => {
  const updates: any = {};
  const fields = ["title","description","type","location","ward","startDate","endDate","status","maxAttendees"];
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (updates.ward != null && updates.ward !== "" && !isKaitiWard(updates.ward)) { res.status(400).json({ error: "Select a valid ward for this campaign" }); return; }
  const [event] = await db.update(campaignEventsTable).set(updates).where(and(eq(campaignEventsTable.id, parseInt(req.params.id)), or(isNull(campaignEventsTable.ward), inArray(campaignEventsTable.ward, campaignWards())))).returning();
  if (!event) { res.status(404).json({ error: "Not found" }); return; }
  res.json(event);
});

router.delete("/:id", async (req, res) => {
  await db.delete(campaignEventsTable).where(and(eq(campaignEventsTable.id, parseInt(req.params.id)), or(isNull(campaignEventsTable.ward), inArray(campaignEventsTable.ward, campaignWards()))));
  res.status(204).send();
});

export default router;
