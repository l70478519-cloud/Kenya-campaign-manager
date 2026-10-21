import { Router } from "express";
import { db, fundraisingCampaignsTable, donationsTable, donorsTable, pledgesTable, campaignWards } from "@workspace/db";
import { eq, sql, desc, ilike, or } from "drizzle-orm";
const isMakueniWard = (ward: unknown) => typeof ward === "string" && (campaignWards().includes(ward) || ward === "county-wide");
const isOutOfCountyText = (value: unknown) => /\b(mule|matungulu|kangundo|tala|kyeleni|machakos county|makueni north|makueni east|makueni west)\b/i.test(String(value ?? ""));

const router = Router();

// ── Summary ────────────────────────────────────────────────────────────────
router.get("/summary", async (req, res) => {
  const donations = (await db.select().from(donationsTable)).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.donorName, d.notes, d.reference].join(" ")));
  const donors = (await db.select().from(donorsTable)).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.name, d.email, d.notes, ...(d.tags ?? [])].join(" ")));
  const donorIds = new Set(donors.map(d => d.id));
  const pledges = (await db.select().from(pledgesTable)).filter(p => p.donorId != null && donorIds.has(p.donorId));
  const campaigns = (await db.select().from(fundraisingCampaignsTable)).filter(c => !isOutOfCountyText([c.name, c.description].join(" ")));
  const totalRaised = donations.reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
  const totalPledged = pledges.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const channelMap = new Map<string, { total: number; count: number }>();
  for (const d of donations) { const row = channelMap.get(d.channel) ?? { total: 0, count: 0 }; row.total += Number(d.amount ?? 0); row.count += 1; channelMap.set(d.channel, row); }
  res.json({
    totalRaised,
    donorCount: donations.length,
    totalDonors: donors.length,
    totalGoal: campaigns.reduce((sum, c) => sum + Number(c.goalAmount ?? 0), 0),
    activeCampaigns: campaigns.filter(c => c.status === "active").length,
    channelBreakdown: Array.from(channelMap, ([channel, v]) => ({ channel, total: v.total, count: v.count })),
    totalPledged,
    pendingPledges: pledges.filter(p => p.status === "pending").length,
    fulfilledPledges: pledges.filter(p => p.status === "fulfilled").length,
  });
});
// ── Campaigns ──────────────────────────────────────────────────────────────
router.get("/campaigns", async (req, res) => {
  const campaigns = (await db.select().from(fundraisingCampaignsTable).orderBy(desc(fundraisingCampaignsTable.createdAt))).filter(c => !isOutOfCountyText([c.name, c.description].join(" ")));
  res.json(campaigns);
});

router.post("/campaigns", async (req, res) => {
  const { name, description, goalAmount, startDate, endDate } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  if (isOutOfCountyText([name, description].join(" "))) { res.status(400).json({ error: "Only Makueni County campaigns are accepted" }); return; }
  const [campaign] = await db.insert(fundraisingCampaignsTable)
    .values({ name, description, goalAmount: goalAmount ?? 0, startDate, endDate, status: "active", raisedAmount: 0 })
    .returning();
  res.status(201).json(campaign);
});

router.get("/campaigns/:id", async (req, res) => {
  const [campaign] = await db.select().from(fundraisingCampaignsTable).where(eq(fundraisingCampaignsTable.id, parseInt(req.params.id)));
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
  res.json(campaign);
});

router.patch("/campaigns/:id", async (req, res) => {
  const updates: Record<string, unknown> = {};
  ["name", "description", "goalAmount", "status", "startDate", "endDate"].forEach(f => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  if (isOutOfCountyText([updates.name, updates.description].join(" "))) { res.status(400).json({ error: "Only Makueni County campaigns are accepted" }); return; }
  const [campaign] = await db.update(fundraisingCampaignsTable).set(updates).where(eq(fundraisingCampaignsTable.id, parseInt(req.params.id))).returning();
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
  res.json(campaign);
});

router.delete("/campaigns/:id", async (req, res) => {
  await db.delete(fundraisingCampaignsTable).where(eq(fundraisingCampaignsTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

// ── Donors ─────────────────────────────────────────────────────────────────
router.get("/donors", async (req, res) => {
  const { search, ward, tier, type } = req.query as Record<string, string>;
  let rows = (await db.select().from(donorsTable).orderBy(desc(donorsTable.totalGiven))).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.name, d.email, d.notes, ...(d.tags ?? [])].join(" ")));
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(d => d.name.toLowerCase().includes(s) || (d.phone ?? "").includes(s) || (d.email ?? "").toLowerCase().includes(s));
  }
  if (ward) rows = rows.filter(d => d.ward === ward);
  if (tier) rows = rows.filter(d => d.tier === tier);
  if (type) rows = rows.filter(d => d.type === type);
  res.json(rows);
});

router.post("/donors", async (req, res) => {
  const { name, phone, email, ward, type, tier, notes, tags } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [donor] = await db.insert(donorsTable)
    .values({ name, phone, email, ward, type: type ?? "individual", tier: tier ?? "regular", notes, tags, totalGiven: 0 })
    .returning();
  res.status(201).json(donor);
});

router.patch("/donors/:id", async (req, res) => {
  const updates: Record<string, unknown> = {};
  ["name", "phone", "email", "ward", "type", "tier", "notes", "tags"].forEach(f => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  if (updates.ward !== undefined && !isMakueniWard(updates.ward)) { res.status(400).json({ error: "Select a valid Makueni County ward or county-wide" }); return; }
  if (isOutOfCountyText([updates.name, updates.email, updates.notes, ...(Array.isArray(updates.tags) ? updates.tags : [])].join(" "))) { res.status(400).json({ error: "Only Makueni County records are accepted" }); return; }
  const [donor] = await db.update(donorsTable).set(updates).where(eq(donorsTable.id, parseInt(req.params.id))).returning();
  if (!donor) { res.status(404).json({ error: "Not found" }); return; }
  res.json(donor);
});

router.delete("/donors/:id", async (req, res) => {
  await db.delete(donorsTable).where(eq(donorsTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

// ── Donations ──────────────────────────────────────────────────────────────
router.get("/donations", async (req, res) => {
  const { campaignId, donorId } = req.query as Record<string, string>;
  let rows = (await db.select().from(donationsTable).orderBy(desc(donationsTable.receivedAt))).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.donorName, d.notes, d.reference].join(" ")));
  if (campaignId) rows = rows.filter(r => r.campaignId === parseInt(campaignId));
  if (donorId) rows = rows.filter(r => r.donorId === parseInt(donorId));
  res.json(rows);
});

router.post("/donations", async (req, res) => {
  const { campaignId, donorId, donorName, amount, channel, reference, ward, notes } = req.body;
  if (!donorName || !amount) { res.status(400).json({ error: "donorName and amount required" }); return; }
  if (!isMakueniWard(ward)) { res.status(400).json({ error: "Select a valid Makueni County ward or county-wide" }); return; }
  if (isOutOfCountyText([donorName, notes, reference].join(" "))) { res.status(400).json({ error: "Only Makueni County records are accepted" }); return; }

  const [donation] = await db.insert(donationsTable)
    .values({ campaignId: campaignId ?? null, donorId: donorId ?? null, donorName, amount: parseInt(amount), channel: channel ?? "cash", reference, ward, notes })
    .returning();

  if (campaignId) {
    await db.update(fundraisingCampaignsTable)
      .set({ raisedAmount: sql`raised_amount + ${parseInt(amount)}` })
      .where(eq(fundraisingCampaignsTable.id, parseInt(campaignId)));
  }
  if (donorId) {
    await db.update(donorsTable)
      .set({ totalGiven: sql`total_given + ${parseInt(amount)}` })
      .where(eq(donorsTable.id, parseInt(donorId)));
  }

  res.status(201).json(donation);
});

router.patch("/donations/:id/reconcile", async (req, res) => {
  const [donation] = await db.update(donationsTable)
    .set({ reconciled: 1 })
    .where(eq(donationsTable.id, parseInt(req.params.id)))
    .returning();
  if (!donation) { res.status(404).json({ error: "Not found" }); return; }
  res.json(donation);
});

router.delete("/donations/:id", async (req, res) => {
  const [donation] = await db.select().from(donationsTable).where(eq(donationsTable.id, parseInt(req.params.id)));
  if (donation?.campaignId && donation?.amount) {
    await db.update(fundraisingCampaignsTable)
      .set({ raisedAmount: sql`greatest(0, raised_amount - ${donation.amount})` })
      .where(eq(fundraisingCampaignsTable.id, donation.campaignId));
  }
  if (donation?.donorId && donation?.amount) {
    await db.update(donorsTable)
      .set({ totalGiven: sql`greatest(0, total_given - ${donation.amount})` })
      .where(eq(donorsTable.id, donation.donorId));
  }
  await db.delete(donationsTable).where(eq(donationsTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

// ── Pledges ────────────────────────────────────────────────────────────────
router.get("/pledges", async (req, res) => {
  const { status, campaignId } = req.query as Record<string, string>;
  const donors = (await db.select().from(donorsTable)).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.name, d.email, d.notes, ...(d.tags ?? [])].join(" ")));
  const donorIds = new Set(donors.map(d => d.id));
  let rows = (await db.select().from(pledgesTable).orderBy(desc(pledgesTable.createdAt))).filter(p => p.donorId != null && donorIds.has(p.donorId));
  if (status) rows = rows.filter(r => r.status === status);
  if (campaignId) rows = rows.filter(r => r.campaignId === parseInt(campaignId));
  res.json(rows);
});

router.post("/pledges", async (req, res) => {
  const { donorName, donorId, campaignId, amount, promisedDate, channel, notes } = req.body;
  if (!donorName || !amount) { res.status(400).json({ error: "donorName and amount required" }); return; }
  const [pledge] = await db.insert(pledgesTable)
    .values({ donorName, donorId: donorId ?? null, campaignId: campaignId ?? null, amount: parseInt(amount), promisedDate, channel, notes, status: "pending" })
    .returning();
  res.status(201).json(pledge);
});

router.patch("/pledges/:id", async (req, res) => {
  const updates: Record<string, unknown> = {};
  ["status", "fulfilledDate", "notes", "channel", "promisedDate"].forEach(f => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  const [pledge] = await db.update(pledgesTable).set(updates).where(eq(pledgesTable.id, parseInt(req.params.id))).returning();
  if (!pledge) { res.status(404).json({ error: "Not found" }); return; }
  res.json(pledge);
});

router.delete("/pledges/:id", async (req, res) => {
  await db.delete(pledgesTable).where(eq(pledgesTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

// ── Pipeline ───────────────────────────────────────────────────────────────
router.get("/pipeline", async (req, res) => {
  const donors = (await db.select().from(donorsTable)).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.name, d.email, d.notes, ...(d.tags ?? [])].join(" ")));
  const donorIds = new Set(donors.map(d => d.id));
  const pledges = (await db.select().from(pledgesTable)).filter(p => p.donorId != null && donorIds.has(p.donorId));
  const donations = (await db.select().from(donationsTable)).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.donorName, d.notes, d.reference].join(" ")));
  const donorBreakdown = { major: donors.filter(d => d.tier === "major").length, regular: donors.filter(d => d.tier === "regular").length, grassroots: donors.filter(d => d.tier === "grassroots").length };
  const wardMap = new Map<string, { count: number; total: number }>();
  for (const d of donors) { const key = d.ward ?? "county-wide"; const row = wardMap.get(key) ?? { count: 0, total: 0 }; row.count++; row.total += Number(d.totalGiven ?? 0); wardMap.set(key, row); }
  const wardBreakdown = Array.from(wardMap, ([ward, v]) => ({ ward, count: v.count, total: v.total })).sort((a, b) => b.total - a.total);
  const typeMap = new Map<string, { count: number; total: number }>();
  for (const d of donors) { const row = typeMap.get(d.type) ?? { count: 0, total: 0 }; row.count++; row.total += Number(d.totalGiven ?? 0); typeMap.set(d.type, row); }
  const typeBreakdown = Array.from(typeMap, ([type, v]) => ({ type, count: v.count, total: v.total }));
  const pendingPledges = pledges.filter(p => p.status === "pending").sort((a, b) => Number(b.amount) - Number(a.amount));
  const topDonors = [...donors].sort((a, b) => Number(b.totalGiven) - Number(a.totalGiven)).slice(0, 10);
  const monthMap = new Map<string, { total: number; count: number }>();
  for (const d of donations) { const month = new Date(d.receivedAt).toISOString().slice(0, 7); const row = monthMap.get(month) ?? { total: 0, count: 0 }; row.total += Number(d.amount ?? 0); row.count++; monthMap.set(month, row); }
  const monthlyTrend = Array.from(monthMap, ([month, v]) => ({ month, total: v.total, count: v.count })).sort((a, b) => a.month.localeCompare(b.month));
  res.json({ donorBreakdown, wardBreakdown, typeBreakdown, pendingPledges, topDonors, monthlyTrend });
});
// ── Reconciliation ─────────────────────────────────────────────────────────
router.get("/reconciliation", async (req, res) => {
  const all = (await db.select().from(donationsTable).orderBy(desc(donationsTable.receivedAt))).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.donorName, d.notes, d.reference].join(" ")));
  const reconciled = all.filter(d => d.reconciled === 1);
  const unreconciled = all.filter(d => d.reconciled !== 1);
  const channelMap = new Map<string, { total: number; reconciled: number; unreconciled: number; count: number }>();
  for (const d of all) { const row = channelMap.get(d.channel) ?? { total: 0, reconciled: 0, unreconciled: 0, count: 0 }; const amount = Number(d.amount ?? 0); row.total += amount; row.count++; if (d.reconciled === 1) row.reconciled += amount; else row.unreconciled += amount; channelMap.set(d.channel, row); }
  res.json({ total: all.length, reconciled: reconciled.length, unreconciled: unreconciled.length, totalAmount: all.reduce((sum, d) => sum + Number(d.amount ?? 0), 0), reconciledAmount: reconciled.reduce((sum, d) => sum + Number(d.amount ?? 0), 0), unreconciledAmount: unreconciled.reduce((sum, d) => sum + Number(d.amount ?? 0), 0), byChannel: Array.from(channelMap, ([channel, v]) => ({ channel, ...v })), unreconciledDonations: unreconciled });
});
// ── Insights (computed) ─────────────────────────────────────────────────────
router.get("/insights", async (req, res) => {
  const donations = (await db.select().from(donationsTable)).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.donorName, d.notes, d.reference].join(" ")));
  const donors = (await db.select().from(donorsTable)).filter(d => isMakueniWard(d.ward) && !isOutOfCountyText([d.name, d.email, d.notes, ...(d.tags ?? [])].join(" ")));
  const donorIds = new Set(donors.map(d => d.id));
  const pledges = (await db.select().from(pledgesTable)).filter(p => p.donorId != null && donorIds.has(p.donorId));
  const campaigns = (await db.select().from(fundraisingCampaignsTable)).filter(c => !isOutOfCountyText([c.name, c.description].join(" ")) && c.status === "active");
  const raised = donations.reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
  const goal = campaigns.reduce((sum, c) => sum + Number(c.goalAmount ?? 0), 0);
  const pledgePending = pledges.filter(p => p.status === "pending").reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const majorDonors = donors.filter(d => d.tier === "major");
  const majorTotal = majorDonors.reduce((sum, d) => sum + Number(d.totalGiven ?? 0), 0);
  const gap = Math.max(0, goal - raised);
  const pct = goal > 0 ? Math.round((raised / goal) * 100) : 0;
  const insights = [
    { type: pct >= 80 ? "success" : pct >= 50 ? "info" : "warning", title: `${pct}% of active county campaign goals reached`, body: `KES ${raised.toLocaleString()} raised of KES ${goal.toLocaleString()} target. Gap: KES ${gap.toLocaleString()}`, action: "Reconcile and verify recorded transactions" },
    { type: "info", title: `${pledges.filter(p => p.status === "pending").length} pending pledges totalling KES ${pledgePending.toLocaleString()}`, body: "Pending pledges are limited to donors assigned to Makueni County wards.", action: "Verify pledge records and follow up through approved finance procedures" },
    { type: majorDonors.length < 5 ? "warning" : "success", title: `${majorDonors.length} major donors — KES ${majorTotal.toLocaleString()} recorded`, body: `Major donors account for ${raised > 0 ? Math.round((majorTotal / raised) * 100) : 0}% of recorded Makueni donations.`, action: "Check donor records and reconcile contributions" },
  ];
  res.json({ insights, raised, goal, pct, gap, pledgePending, donorCount: donors.length });
});

export default router;
