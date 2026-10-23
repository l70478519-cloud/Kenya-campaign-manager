import { Router } from "express";
import { db, pollingStationsTable, tallyResultsTable, electionEventsTable, campaignWards, currentCampaignProfile } from "@workspace/db";
import { eq, sql, desc, and, inArray, like } from "drizzle-orm";
import { campaignArea, referenceStationRows, REFERENCE_CODE_PREFIX } from "../lib/polling-centres";
import { nameKey } from "../data/kenya-electoral-units";

const router = Router();

// ── Summary / HQ Tally ─────────────────────────────────────────────────────
router.get("/summary", async (req, res) => {
  const totalStations = await db.select({ count: sql<number>`count(*)` }).from(pollingStationsTable).where(inArray(pollingStationsTable.ward, campaignWards()));
  const submittedStations = await db.select({ count: sql<number>`count(distinct ${tallyResultsTable.stationCode})` }).from(tallyResultsTable).innerJoin(pollingStationsTable, eq(tallyResultsTable.stationCode, pollingStationsTable.code)).where(inArray(pollingStationsTable.ward, campaignWards()));
  const verifiedStations = await db.select({ count: sql<number>`count(distinct ${tallyResultsTable.stationCode})` }).from(tallyResultsTable).innerJoin(pollingStationsTable, eq(tallyResultsTable.stationCode, pollingStationsTable.code)).where(and(eq(tallyResultsTable.status, "verified"), inArray(pollingStationsTable.ward, campaignWards())));

  const tallyByCandidate = await db
    .select({
      candidateName: tallyResultsTable.candidateName,
      party: tallyResultsTable.party,
      totalVotes: sql<number>`coalesce(sum(${tallyResultsTable.votes}), 0)`,
      verifiedVotes: sql<number>`coalesce(sum(case when ${tallyResultsTable.status} = 'verified' then ${tallyResultsTable.votes} else 0 end), 0)`,
    })
    .from(tallyResultsTable)
    .innerJoin(pollingStationsTable, eq(tallyResultsTable.stationCode, pollingStationsTable.code))
    .where(inArray(pollingStationsTable.ward, campaignWards()))
    .groupBy(tallyResultsTable.candidateName, tallyResultsTable.party)
    .orderBy(sql`sum(${tallyResultsTable.votes}) desc`);

  const wardBreakdown = await db
    .select({
      ward: pollingStationsTable.ward,
      totalStations: sql<number>`count(distinct ${pollingStationsTable.id})`,
      submittedStations: sql<number>`count(distinct ${tallyResultsTable.stationCode})`,
    })
    .from(pollingStationsTable)
    .leftJoin(tallyResultsTable, eq(pollingStationsTable.code, tallyResultsTable.stationCode))
    .where(inArray(pollingStationsTable.ward, campaignWards()))
    .groupBy(pollingStationsTable.ward);

  const totalRegistered = await db.select({ total: sql<number>`coalesce(sum(registered_voters), 0)` }).from(pollingStationsTable).where(inArray(pollingStationsTable.ward, campaignWards()));
  const totalVotesCast = await db.select({ total: sql<number>`coalesce(sum(${tallyResultsTable.votes}), 0)` }).from(tallyResultsTable).innerJoin(pollingStationsTable, eq(tallyResultsTable.stationCode, pollingStationsTable.code)).where(inArray(pollingStationsTable.ward, campaignWards()));

  res.json({
    totalStations: Number(totalStations[0]?.count ?? 0),
    submittedStations: Number(submittedStations[0]?.count ?? 0),
    verifiedStations: Number(verifiedStations[0]?.count ?? 0),
    totalRegisteredVoters: Number(totalRegistered[0]?.total ?? 0),
    tallyByCandidate,
    wardBreakdown,
  });
});

// ── Stations ───────────────────────────────────────────────────────────────
router.get("/stations", async (req, res) => {
  const { ward, status } = req.query as Record<string, string>;
  let query = db.select().from(pollingStationsTable).where(inArray(pollingStationsTable.ward, campaignWards())).orderBy(pollingStationsTable.ward, pollingStationsTable.code);
  const rows = await query;
  let filtered = rows;
  if (ward) { if (!campaignWards().includes(ward)) { res.status(400).json({ error: "Select a ward for this campaign" }); return; } filtered = filtered.filter(r => r.ward === ward); }
  if (status) filtered = filtered.filter(r => r.status === status);
  res.json(filtered);
});

router.post("/stations", async (req, res) => {
  const { code, name, ward, registeredVoters, streamCount, agentName, agentPhone } = req.body;
  if (!code || !name || !ward) { res.status(400).json({ error: "code, name, ward required" }); return; }
  if (!campaignWards().includes(ward)) { res.status(400).json({ error: "Select a ward for this campaign" }); return; }
  const [station] = await db.insert(pollingStationsTable).values({ code, name, ward, registeredVoters: registeredVoters ?? 0, streamCount: streamCount ?? 1, agentName, agentPhone, status: "pending" }).returning();
  res.status(201).json(station);
});

/**
 * Loads this campaign's polling centres from the IEBC register bundled with
 * the app (only the campaign's own wards). Safe to repeat: centres already
 * present, by code or by name in the same ward, are skipped. Codes start with
 * KCM- because the register has no IEBC codes; importing the official list
 * below replaces them and adds registered voters and streams.
 */
router.post("/stations/load-reference", async (_req, res) => {
  const p = currentCampaignProfile();
  const area = campaignArea({ seat: p?.seat, county: p?.county, constituency: p?.constituency, area: p?.area, wards: campaignWards() });
  if (area.scope === "national") {
    res.status(400).json({ error: "Presidential campaigns track results by county. Import polling stations from the official IEBC list per county instead." });
    return;
  }
  const rows = referenceStationRows(area);
  if (!rows.length) {
    res.status(400).json({ error: `None of this campaign's wards (${campaignWards().join(", ") || "none set"}) match the IEBC ward list. Check the campaign's seat and area.`, unmatched: area.unmatched });
    return;
  }
  const existing = await db.select({ code: pollingStationsTable.code, name: pollingStationsTable.name, ward: pollingStationsTable.ward })
    .from(pollingStationsTable).where(inArray(pollingStationsTable.ward, campaignWards()));
  const codes = new Set(existing.map(e => e.code));
  const names = new Set(existing.map(e => `${e.ward}|${nameKey(e.name)}`));
  const fresh = rows.filter(r => !codes.has(r.code) && !names.has(`${r.ward}|${nameKey(r.name)}`));
  for (let i = 0; i < fresh.length; i += 500) {
    await db.insert(pollingStationsTable).values(fresh.slice(i, i + 500).map(r => ({
      code: r.code, name: r.name, ward: r.ward, registeredVoters: 0, streamCount: 1, status: "pending",
      notes: `IEBC register reference centre (${r.constituency}). Import the official IEBC list for the station code, registered voters and streams.`,
    })));
  }
  res.json({
    area: area.label, added: fresh.length, alreadyPresent: rows.length - fresh.length, total: rows.length,
    unmatched: area.unmatched, ambiguous: area.ambiguous, note: area.source.note,
  });
});

/**
 * Bulk import of polling stations (e.g. from the IEBC "Registered Voters per
 * Polling Station" list). Rows are matched to this campaign's wards
 * case-insensitively; existing codes are updated, new ones created.
 */
router.post("/stations/import", async (req, res) => {
  const input = Array.isArray(req.body?.rows) ? (req.body.rows as Record<string, unknown>[]) : null;
  if (!input?.length) { res.status(400).json({ error: "No rows supplied" }); return; }
  if (input.length > 3000) { res.status(400).json({ error: "Maximum 3,000 stations per import" }); return; }
  const wards = campaignWards();
  const pick = (r: Record<string, unknown>, ...keys: string[]) => {
    for (const [k, v] of Object.entries(r)) if (keys.includes(k.trim().toLowerCase().replace(/[^a-z]/g, ""))) return String(v ?? "").trim();
    return "";
  };
  const rejected: { row: number; error: string }[] = [];
  let imported = 0, updated = 0;
  for (const [i, r] of input.entries()) {
    const code = pick(r, "code", "stationcode", "pollingstationcode", "pscode");
    const name = pick(r, "name", "station", "stationname", "pollingstation", "pollingstationname", "pollingcentre", "centre");
    const wardRaw = pick(r, "ward", "caw", "countyassemblyward", "wardname");
    const ward = wards.find(w => w.toLowerCase() === wardRaw.toLowerCase());
    const registered = Number(pick(r, "registeredvoters", "registered", "voters", "regvoters").replace(/[, ]/g, "")) || 0;
    const streams = Number(pick(r, "streams", "streamcount", "nostreams")) || 1;
    if (!code || !name) { rejected.push({ row: i + 2, error: "Missing station code or name" }); continue; }
    if (!ward) { rejected.push({ row: i + 2, error: `Ward "${wardRaw}" is not one of: ${wards.join(", ")}` }); continue; }
    const [existing] = await db.select({ id: pollingStationsTable.id }).from(pollingStationsTable).where(eq(pollingStationsTable.code, code)).limit(1);
    // An official row for a centre loaded from the reference register takes over that row (keeps agents and status).
    const reference = existing ? undefined : (await db.select({ id: pollingStationsTable.id, name: pollingStationsTable.name }).from(pollingStationsTable)
      .where(and(eq(pollingStationsTable.ward, ward), like(pollingStationsTable.code, `${REFERENCE_CODE_PREFIX}%`))))
      .find(s => nameKey(s.name) === nameKey(name));
    if (existing || reference) {
      await db.update(pollingStationsTable).set({ code, name, ward, registeredVoters: registered, streamCount: streams, ...(reference ? { notes: null } : {}) })
        .where(eq(pollingStationsTable.id, (existing ?? reference)!.id));
      updated++;
    } else {
      await db.insert(pollingStationsTable).values({ code, name, ward, registeredVoters: registered, streamCount: streams, status: "pending" });
      imported++;
    }
  }
  res.json({ received: input.length, imported, updated, rejected: rejected.slice(0, 200) });
});

router.patch("/stations/:id", async (req, res) => {
  const updates: Record<string, unknown> = {};
  ["code", "name", "ward", "registeredVoters", "streamCount", "agentName", "agentPhone", "status", "notes"].forEach(f => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  if (updates.ward !== undefined && !campaignWards().includes(String(updates.ward))) { res.status(400).json({ error: "Select a ward for this campaign" }); return; }
  const [station] = await db.update(pollingStationsTable).set(updates).where(eq(pollingStationsTable.id, parseInt(req.params.id))).returning();
  if (!station) { res.status(404).json({ error: "Not found" }); return; }
  res.json(station);
});

// ── Tally Results ──────────────────────────────────────────────────────────
router.get("/results", async (req, res) => {
  const { stationCode, status } = req.query as Record<string, string>;
  const validStations = await db.select({ code: pollingStationsTable.code }).from(pollingStationsTable).where(inArray(pollingStationsTable.ward, campaignWards()));
  const validCodes = new Set(validStations.map(station => station.code));
  let rows = (await db.select().from(tallyResultsTable).orderBy(desc(tallyResultsTable.submittedAt))).filter(row => validCodes.has(row.stationCode));
  if (stationCode) rows = rows.filter(r => r.stationCode === stationCode);
  if (status) rows = rows.filter(r => r.status === status);
  res.json(rows);
});

router.post("/results", async (req, res) => {
  const { stationCode, results, totalValidVotes, rejectedVotes, submittedBy } = req.body;
  if (!stationCode || !results || !Array.isArray(results)) {
    res.status(400).json({ error: "stationCode and results[] required" }); return;
  }

  const [station] = await db.select().from(pollingStationsTable).where(eq(pollingStationsTable.code, stationCode));
  if (!station || !campaignWards().includes(station.ward)) { res.status(404).json({ error: "Makueni polling station not found" }); return; }

  await db.delete(tallyResultsTable).where(eq(tallyResultsTable.stationCode, stationCode));

  const rows = await db.insert(tallyResultsTable).values(
    results.map((r: { candidateName: string; party: string; votes: number }) => ({
      stationId: station.id,
      stationCode,
      candidateName: r.candidateName,
      party: r.party,
      votes: parseInt(r.votes as unknown as string),
      totalValidVotes: totalValidVotes ?? null,
      rejectedVotes: rejectedVotes ?? 0,
      registeredVoters: station.registeredVoters,
      status: "submitted",
      submittedBy: submittedBy ?? "Agent",
      submittedAt: new Date(),
    }))
  ).returning();

  await db.update(pollingStationsTable).set({ status: "submitted" }).where(eq(pollingStationsTable.code, stationCode));
  res.status(201).json(rows);
});

router.patch("/results/:id/verify", async (req, res) => {
  const { verifiedBy } = req.body;
  const [result] = await db.select().from(tallyResultsTable).where(eq(tallyResultsTable.id, parseInt(req.params.id)));
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(tallyResultsTable).set({ status: "verified", verifiedBy: verifiedBy ?? "HQ", verifiedAt: new Date() }).where(eq(tallyResultsTable.stationCode, result.stationCode)).returning();
  await db.update(pollingStationsTable).set({ status: "verified" }).where(eq(pollingStationsTable.code, result.stationCode));
  res.json(updated);
});

router.patch("/results/:id/dispute", async (req, res) => {
  const [updated] = await db.update(tallyResultsTable).set({ status: "disputed", notes: req.body.notes ?? "Flagged for review" }).where(eq(tallyResultsTable.id, parseInt(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/results/:id", async (req, res) => {
  await db.delete(tallyResultsTable).where(eq(tallyResultsTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

// ── Election Events ────────────────────────────────────────────────────────
router.get("/events", async (req, res) => {
  const rows = (await db.select().from(electionEventsTable).orderBy(desc(electionEventsTable.createdAt))).filter(event => !event.ward || campaignWards().includes(event.ward));
  res.json(rows);
});

router.post("/events", async (req, res) => {
  const { type, title, description, ward, stationCode, priority } = req.body;
  if (!title || !description) { res.status(400).json({ error: "title and description required" }); return; }
  const [event] = await db.insert(electionEventsTable).values({ type: type ?? "info", title, description, ward, stationCode, priority: priority ?? "normal", status: "open" }).returning();
  res.status(201).json(event);
});

router.patch("/events/:id", async (req, res) => {
  const updates: Record<string, unknown> = {};
  ["status", "notes"].forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  const [event] = await db.update(electionEventsTable).set(updates).where(eq(electionEventsTable.id, parseInt(req.params.id))).returning();
  if (!event) { res.status(404).json({ error: "Not found" }); return; }
  res.json(event);
});

// ── Workqueue ──────────────────────────────────────────────────────────────
router.get("/workqueue", async (req, res) => {
  const validStations = await db.select({ code: pollingStationsTable.code }).from(pollingStationsTable).where(inArray(pollingStationsTable.ward, campaignWards()));
  const validCodes = new Set(validStations.map(s => s.code));
  const submittedCodes = (await db.select({ code: tallyResultsTable.stationCode }).from(tallyResultsTable).groupBy(tallyResultsTable.stationCode)).map(r => r.code).filter(code => validCodes.has(code));

  const unsubmittedStations = await db.select().from(pollingStationsTable).where(and(inArray(pollingStationsTable.status, ["pending", "open"]), inArray(pollingStationsTable.ward, campaignWards())));

  const pendingVerification = (await db.select().from(tallyResultsTable).where(eq(tallyResultsTable.status, "submitted")).orderBy(tallyResultsTable.stationCode, desc(tallyResultsTable.submittedAt))).filter(row => validCodes.has(row.stationCode));

  const uniquePending = Object.values(
    pendingVerification.reduce((acc, r) => { if (!acc[r.stationCode]) acc[r.stationCode] = r; return acc; }, {} as Record<string, typeof pendingVerification[0]>)
  );

  res.json({ unsubmittedStations, pendingVerification: uniquePending, submittedCodes });
});

// ── Published Results ──────────────────────────────────────────────────────
router.get("/published", async (req, res) => {
  const validStations = await db.select({ code: pollingStationsTable.code }).from(pollingStationsTable).where(inArray(pollingStationsTable.ward, campaignWards()));
  const validCodes = new Set(validStations.map(station => station.code));
  const verified = (await db.select().from(tallyResultsTable).where(eq(tallyResultsTable.status, "verified")).orderBy(tallyResultsTable.candidateName)).filter(row => validCodes.has(row.stationCode));
  const byCandidate: Record<string, { candidateName: string; party: string; totalVotes: number; stationCount: number }> = {};
  for (const r of verified) {
    if (!byCandidate[r.candidateName]) {
      byCandidate[r.candidateName] = { candidateName: r.candidateName, party: r.party ?? "", totalVotes: 0, stationCount: 0 };
    }
    byCandidate[r.candidateName]!.totalVotes += r.votes;
    byCandidate[r.candidateName]!.stationCount += 1;
  }
  const totals = Object.values(byCandidate).sort((a, b) => b.totalVotes - a.totalVotes);
  res.json({ totals, breakdown: verified });
});

export default router;
