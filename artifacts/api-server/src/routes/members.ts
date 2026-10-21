import { Router } from "express";
import { db, campaignWards, membersTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";


const isKaitiWard = (ward: unknown): ward is string => typeof ward === "string" && campaignWards().includes(ward);

const router = Router();

router.get("/", async (req, res) => {
  const { search, ward, status, page = "1", limit = "50" } = req.query as Record<string, string>;
  // Kaiti-only view; records in other wards are not deleted.
  const conditions = [inArray(membersTable.ward, campaignWards())];
  if (search) conditions.push(sql`(${membersTable.firstName} ilike ${`%${search}%`} OR ${membersTable.lastName} ilike ${`%${search}%`} OR ${membersTable.email} ilike ${`%${search}%`})`);
  if (ward) {
    if (!isKaitiWard(ward)) { res.status(400).json({ error: "Select a valid ward for this campaign" }); return; }
    conditions.push(eq(membersTable.ward, ward));
  }
  if (status) conditions.push(eq(membersTable.status, status));
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 50));
  const offset = (pageNumber - 1) * pageSize;
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, countResult] = await Promise.all([
    db.select().from(membersTable).where(where).orderBy(sql`case when nullif(trim(${membersTable.phone}), '') is not null then 0 else 1 end`, membersTable.id).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(membersTable).where(where),
  ]);
  res.json({ data, total: Number(countResult[0]?.count ?? 0), page: pageNumber, limit: pageSize });
});

router.post("/", async (req, res) => {
  const { firstName, lastName, email, phone, ward, status = "active", supportLevel, smsConsent = false, whatsappConsent = false, emailConsent = false, notes } = req.body;
  if (!firstName || !lastName) { res.status(400).json({ error: "firstName and lastName required" }); return; }
  if (!isKaitiWard(ward)) { res.status(400).json({ error: "A valid ward for this campaign is required" }); return; }
  const [member] = await db.insert(membersTable).values({ firstName, lastName, email, phone, ward, status, supportLevel, smsConsent, whatsappConsent, emailConsent, notes }).returning();
  res.status(201).json(member);
});

router.get("/stats", async (req, res) => {
  const kaitiOnly = inArray(membersTable.ward, campaignWards());
  const [total, byWardRaw, bySupportRaw, consented] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(membersTable).where(kaitiOnly),
    db.select({ ward: membersTable.ward, count: sql<number>`count(*)` }).from(membersTable).where(kaitiOnly).groupBy(membersTable.ward),
    db.select({ label: membersTable.supportLevel, count: sql<number>`count(*)` }).from(membersTable).where(and(kaitiOnly, sql`${membersTable.supportLevel} is not null`)).groupBy(membersTable.supportLevel),
    db.select({
      sms: sql<number>`sum(case when ${membersTable.smsConsent} then 1 else 0 end)`,
      wa: sql<number>`sum(case when ${membersTable.whatsappConsent} then 1 else 0 end)`,
      email: sql<number>`sum(case when ${membersTable.emailConsent} then 1 else 0 end)`,
    }).from(membersTable).where(kaitiOnly),
  ]);
  res.json({
    total: Number(total[0]?.count ?? 0),
    byWard: byWardRaw.filter(r => r.ward).map(r => ({ ward: r.ward!, count: Number(r.count) })),
    bySupportLevel: bySupportRaw.filter(r => r.label).map(r => ({ label: r.label!, count: Number(r.count) })),
    consentedSms: Number(consented[0]?.sms ?? 0),
    consentedWhatsapp: Number(consented[0]?.wa ?? 0),
    consentedEmail: Number(consented[0]?.email ?? 0),
  });
});

router.get("/:id", async (req, res) => {
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, parseInt(req.params.id)));
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  res.json(member);
});

router.patch("/:id", async (req, res) => {
  const updates: any = {};
  const fields = ["firstName","lastName","email","phone","ward","status","supportLevel","smsConsent","whatsappConsent","emailConsent","notes"];
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (updates.ward !== undefined && !isKaitiWard(updates.ward)) { res.status(400).json({ error: "Select a valid ward for this campaign" }); return; }
  updates.updatedAt = new Date();
  const [member] = await db.update(membersTable).set(updates).where(eq(membersTable.id, parseInt(req.params.id))).returning();
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  res.json(member);
});

router.delete("/:id", async (req, res) => {
  await db.delete(membersTable).where(eq(membersTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

export default router;
