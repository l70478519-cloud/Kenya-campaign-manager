import { Router } from "express";
import { db, voterRegistryTable, voterSyncLogsTable, iebcCredentialsTable, campaignWards, campaignConstituencies } from "@workspace/db";
import { eq, sql, desc, ilike, or, and, inArray, isNull } from "drizzle-orm";
const isMakueniConstituency = (value: unknown): value is string => typeof value === "string" && campaignConstituencies().includes(value);
const isMakueniWard = (ward: unknown): ward is string => typeof ward === "string" && campaignWards().includes(ward);

const router = Router();

// ── Stats ──────────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  const [totals] = await db.select({
    total: sql<number>`count(*)`,
    verified: sql<number>`count(*) filter (where status = 'verified')`,
    pending: sql<number>`count(*) filter (where status = 'pending')`,
    rejected: sql<number>`count(*) filter (where status = 'rejected')`,
    fromUpload: sql<number>`count(*) filter (where source = 'upload')`,
    fromApi: sql<number>`count(*) filter (where source = 'api')`,
    fromManual: sql<number>`count(*) filter (where source = 'manual')`,
  }).from(voterRegistryTable).where(or(inArray(voterRegistryTable.ward, campaignWards()), isNull(voterRegistryTable.ward)));

  const wardBreakdown = await db
    .select({ ward: voterRegistryTable.ward, count: sql<number>`count(*)` })
    .from(voterRegistryTable)
    .where(or(inArray(voterRegistryTable.ward, campaignWards()), isNull(voterRegistryTable.ward)))
    .groupBy(voterRegistryTable.ward);

  const recentLogs = await db
    .select()
    .from(voterSyncLogsTable)
    .orderBy(desc(voterSyncLogsTable.createdAt))
    .limit(5);

  res.json({
    total: Number(totals?.total ?? 0),
    verified: Number(totals?.verified ?? 0),
    pending: Number(totals?.pending ?? 0),
    rejected: Number(totals?.rejected ?? 0),
    fromUpload: Number(totals?.fromUpload ?? 0),
    fromApi: Number(totals?.fromApi ?? 0),
    fromManual: Number(totals?.fromManual ?? 0),
    wardBreakdown: wardBreakdown.map(w => ({ ward: w.ward ?? "Unknown", count: Number(w.count) })),
    recentLogs,
  });
});

// ── List ───────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { search, ward, status, source, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
  const limit = parseInt(limitStr ?? "100");
  const offset = parseInt(offsetStr ?? "0");

  const conditions = [or(inArray(voterRegistryTable.ward, campaignWards()), isNull(voterRegistryTable.ward))!];
  if (search) {
    const searchCondition = or(
      ilike(voterRegistryTable.fullName, `%${search}%`),
      ilike(voterRegistryTable.nationalId, `%${search}%`),
      ilike(voterRegistryTable.voterNumber, `%${search}%`),
      ilike(voterRegistryTable.phone, `%${search}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (ward) { if (!isMakueniWard(ward)) { res.status(400).json({ error: "Select a valid Makueni County ward" }); return; } conditions.push(eq(voterRegistryTable.ward, ward)); }
  if (status) conditions.push(eq(voterRegistryTable.status, status));
  if (source) conditions.push(eq(voterRegistryTable.source, source));

  const rows = await db
    .select()
    .from(voterRegistryTable)
    .where(and(...conditions))
    .orderBy(desc(voterRegistryTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(voterRegistryTable)
    .where(and(...conditions));

  res.json({ data: rows, total: Number(countRow?.count ?? 0), limit, offset });
});

// ── Create (manual capture) ────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const {
    nationalId, voterNumber, fullName, phone, gender, dateOfBirth,
    ward, subCounty, pollingStation, pollingStationCode, stream, importBatch, notes,
  } = req.body;

  if (!fullName) { res.status(400).json({ error: "fullName required" }); return; }
  if (!isMakueniWard(ward)) { res.status(400).json({ error: "A valid Makueni County ward is required" }); return; }
  if (subCounty && !isMakueniConstituency(subCounty)) { res.status(400).json({ error: "Select a constituency that belongs to this campaign" }); return; }

  const [record] = await db.insert(voterRegistryTable).values({
    nationalId, voterNumber, fullName, phone, gender, dateOfBirth,
    ward, subCounty, pollingStation, pollingStationCode, stream,
    importBatch, reviewNotes: notes,
    status: "verified",
    source: "manual",
  }).returning();

  res.status(201).json(record);
});

// ── Bulk upload (CSV parsed on frontend, sent as JSON) ─────────────────────
router.post("/upload", async (req, res) => {
  const { records, batchName } = req.body as {
    records: Array<{
      nationalId?: string; voterNumber?: string; fullName: string; phone?: string;
      gender?: string; dateOfBirth?: string; ward?: string; subCounty?: string;
      pollingStation?: string; pollingStationCode?: string; stream?: string;
    }>;
    batchName: string;
  };

  if (!Array.isArray(records) || records.length === 0) {
    res.status(400).json({ error: "records array required" }); return;
  }
  if (records.length > 1000) {
    res.status(413).json({ error: "Maximum 1,000 contacts per API batch." }); return;
  }

  const batchId = batchName || `UPLOAD-${Date.now()}`;
  let newCount = 0;
  let updatedCount = 0;
  let dupCount = 0;
  let skippedCount = 0;
  const clean = records.map(raw => Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
  ) as typeof raw).filter(r => !!r.fullName);
  skippedCount += records.length - clean.length;

  // Resolve matching contacts in a single query per batch instead of querying
  // the database repeatedly for every CSV row.
  const nationalIds = [...new Set(clean.map(r => r.nationalId).filter((v): v is string => !!v))];
  const voterNumbers = [...new Set(clean.map(r => r.voterNumber).filter((v): v is string => !!v))];
  const phoneDigits = [...new Set(clean.map(r => (r.phone ?? "").replace(/\D/g, "")).filter(Boolean))];
  const matchConditions = [];
  if (nationalIds.length) matchConditions.push(inArray(voterRegistryTable.nationalId, nationalIds));
  if (voterNumbers.length) matchConditions.push(inArray(voterRegistryTable.voterNumber, voterNumbers));
  if (phoneDigits.length) matchConditions.push(inArray(sql<string>`regexp_replace(coalesce(${voterRegistryTable.phone}, ''), '[^0-9]', '', 'g')`, phoneDigits));
  const existingRows = matchConditions.length
    ? await db.select({ id: voterRegistryTable.id, nationalId: voterRegistryTable.nationalId, voterNumber: voterRegistryTable.voterNumber, phone: voterRegistryTable.phone })
        .from(voterRegistryTable).where(or(...matchConditions))
    : [];
  const byNationalId = new Map(existingRows.filter(r => r.nationalId).map(r => [r.nationalId!, r]));
  const byVoterNumber = new Map(existingRows.filter(r => r.voterNumber).map(r => [r.voterNumber!, r]));
  const byPhone = new Map(existingRows.filter(r => r.phone).map(r => [(r.phone ?? "").replace(/\D/g, ""), r]));
  const seenKeys = new Set<string>();
  const insertRows: Array<typeof voterRegistryTable.$inferInsert> = [];

  for (const r of clean) {
    if ((r.ward && !isMakueniWard(r.ward)) || (r.subCounty && !isMakueniConstituency(r.subCounty))) {
      skippedCount++;
      continue;
    }
    const phone = (r.phone ?? "").replace(/\D/g, "");
    const key = r.nationalId ? `id:${r.nationalId}` : r.voterNumber ? `voter:${r.voterNumber}` : phone ? `phone:${phone}` : "";
    if (key && seenKeys.has(key)) { dupCount++; continue; }
    if (key) seenKeys.add(key);
    const existing = (r.nationalId ? byNationalId.get(r.nationalId) : undefined)
      ?? (r.voterNumber ? byVoterNumber.get(r.voterNumber) : undefined)
      ?? (phone ? byPhone.get(phone) : undefined);
    if (existing) {
      const updates: Record<string, unknown> = { fullName: r.fullName, importBatch: batchId, status: "verified", updatedAt: new Date() };
      for (const field of ["nationalId", "voterNumber", "phone", "gender", "dateOfBirth", "ward", "subCounty", "pollingStation", "pollingStationCode", "stream"] as const) {
        const value = r[field];
        if (value !== undefined && value !== "") updates[field] = value;
      }
      await db.update(voterRegistryTable).set(updates).where(eq(voterRegistryTable.id, existing.id));
      updatedCount++;
      dupCount++;
      continue;
    }
    // Names are valid registry records even when the source has no phone or ward.
    // Do not silently drop name-only rows; preserve the contact and let staff enrich it later.
    insertRows.push({ ...r, importBatch: batchId, status: "verified", source: "upload" });
  }

  // One bulk insert per batch instead of one INSERT per contact.
  if (insertRows.length) {
    await db.insert(voterRegistryTable).values(insertRows);
    newCount = insertRows.length;
  }

  await db.insert(voterSyncLogsTable).values({
    source: `upload:${batchId}`,
    status: skippedCount > 0 ? "completed_with_skips" : "completed",
    recordsProcessed: records.length,
    recordsNew: newCount,
    recordsDuplicate: dupCount,
    details: `Processed ${records.length} rows. New: ${newCount}, Updated existing: ${updatedCount}, Invalid/skipped: ${skippedCount}`,
  });
  res.json({ processed: records.length, new: newCount, updated: updatedCount, duplicates: dupCount, skipped: skippedCount, batchId });
});

// ── Review: update status ──────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const updates: Record<string, unknown> = {};
  ["status", "reviewNotes", "fullName", "nationalId", "voterNumber", "phone", "ward", "subCounty", "pollingStation", "gender"].forEach(f => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  if (updates.ward !== undefined && !isMakueniWard(updates.ward)) { res.status(400).json({ error: "Select a valid Makueni County ward" }); return; }
  if (updates.subCounty !== undefined && !isMakueniConstituency(updates.subCounty)) { res.status(400).json({ error: "Select a constituency that belongs to this campaign" }); return; }
  updates.updatedAt = new Date();

  const [record] = await db.update(voterRegistryTable)
    .set(updates)
    .where(and(eq(voterRegistryTable.id, parseInt(req.params.id)), or(inArray(voterRegistryTable.ward, campaignWards()), isNull(voterRegistryTable.ward))))
    .returning();

  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

// ── Bulk review action ─────────────────────────────────────────────────────
router.post("/bulk-review", async (req, res) => {
  const { ids, action } = req.body as { ids: number[]; action: "verify" | "reject" };
  if (!Array.isArray(ids) || !action) { res.status(400).json({ error: "ids and action required" }); return; }
  const numericIds = ids.map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
  if (!numericIds.length || numericIds.length > 5000) { res.status(400).json({ error: "Provide between 1 and 5,000 valid record ids" }); return; }

  const status = action === "verify" ? "verified" : "rejected";
  await db.update(voterRegistryTable)
    .set({ status, updatedAt: new Date() })
    .where(inArray(voterRegistryTable.id, numericIds));

  res.json({ updated: ids.length, status });
});

// ── Delete ─────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  await db.delete(voterRegistryTable).where(and(eq(voterRegistryTable.id, parseInt(req.params.id)), or(inArray(voterRegistryTable.ward, campaignWards()), isNull(voterRegistryTable.ward))));
  res.status(204).send();
});

// ── IEBC Credentials ───────────────────────────────────────────────────────
router.get("/iebc/credentials", async (req, res) => {
  const [creds] = await db.select().from(iebcCredentialsTable).limit(1);
  if (!creds) { res.json({ configured: false }); return; }
  res.json({
    configured: !!(creds.apiKey),
    baseUrl: creds.baseUrl,
    clientId: creds.clientId,
    notes: creds.notes,
    lastTested: creds.lastTested,
    lastStatus: creds.lastStatus,
  });
});

router.post("/iebc/credentials", async (req, res) => {
  const { apiKey, baseUrl, clientId, notes } = req.body;
  const [existing] = await db.select().from(iebcCredentialsTable).limit(1);

  if (existing) {
    const [updated] = await db.update(iebcCredentialsTable)
      .set({ apiKey, baseUrl: baseUrl || "https://api.iebc.or.ke/v1", clientId, notes, updatedAt: new Date() })
      .where(eq(iebcCredentialsTable.id, existing.id))
      .returning();
    res.json({ configured: !!(updated.apiKey), baseUrl: updated.baseUrl, clientId: updated.clientId });
  } else {
    const [created] = await db.insert(iebcCredentialsTable)
      .values({ apiKey, baseUrl: baseUrl || "https://api.iebc.or.ke/v1", clientId, notes })
      .returning();
    res.json({ configured: !!(created.apiKey), baseUrl: created.baseUrl, clientId: created.clientId });
  }
});

// ── IEBC: Test Connection ──────────────────────────────────────────────────
router.post("/iebc/test", async (req, res) => {
  const [creds] = await db.select().from(iebcCredentialsTable).limit(1);
  if (!creds?.apiKey) { res.status(400).json({ ok: false, message: "API key not configured" }); return; }

  let ok = false;
  let message = "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${creds.baseUrl}/ping`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${creds.apiKey}`, "X-Client-ID": creds.clientId ?? "" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    ok = response.ok;
    message = ok ? "Connection successful" : `HTTP ${response.status}: ${response.statusText}`;
  } catch (err: any) {
    ok = false;
    message = err.name === "AbortError" ? "Connection timed out" : `Connection failed: ${err.message}`;
  }

  await db.update(iebcCredentialsTable)
    .set({ lastTested: new Date(), lastStatus: ok ? "connected" : "failed", updatedAt: new Date() })
    .where(eq(iebcCredentialsTable.id, creds.id));

  res.json({ ok, message });
});

// ── IEBC: Sync ─────────────────────────────────────────────────────────────
router.post("/iebc/sync", async (req, res) => {
  const { ward, pollingStation, limit: limitReq } = req.body;
  const [creds] = await db.select().from(iebcCredentialsTable).limit(1);

  if (!creds?.apiKey) { res.status(400).json({ error: "IEBC API not configured" }); return; }

  let imported = 0;
  let message = "";

  try {
    const params = new URLSearchParams();
    if (ward) params.set("ward", ward);
    if (pollingStation) params.set("polling_station", pollingStation);
    if (limitReq) params.set("limit", String(limitReq));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(`${creds.baseUrl}/voters?${params}`, {
      headers: { "Authorization": `Bearer ${creds.apiKey}`, "X-Client-ID": creds.clientId ?? "" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`IEBC API error: ${response.status} ${response.statusText}`);
    }

    const payload: unknown = await response.json();
    const data = payload && typeof payload === "object" && "voters" in payload
      ? (payload as { voters?: unknown }).voters
      : undefined;
    const voters: Array<Record<string, string>> = Array.isArray(data)
      ? data.filter((item): item is Record<string, string> =>
          !!item && typeof item === "object" && !Array.isArray(item) &&
          Object.values(item).every(value => typeof value === "string")
        )
      : [];

    for (const v of voters) {
      const rowWard = v["ward"] ?? ward;
      if (!isMakueniWard(rowWard)) continue;
      const natId = v["national_id"] ?? v["nationalId"];
      if (natId) {
        const [existing] = await db.select({ id: voterRegistryTable.id })
          .from(voterRegistryTable).where(eq(voterRegistryTable.nationalId, natId));
        if (existing) continue;
      }
      await db.insert(voterRegistryTable).values({
        nationalId: v["national_id"] ?? v["nationalId"],
        voterNumber: v["voter_number"] ?? v["voterNumber"],
        fullName: v["full_name"] ?? v["fullName"] ?? v["name"] ?? "Unknown",
        phone: v["phone"],
        gender: v["gender"],
        dateOfBirth: v["date_of_birth"] ?? v["dob"],
        ward: rowWard,
        subCounty: v["sub_county"] ?? v["subCounty"],
        pollingStation: v["polling_station"] ?? v["pollingStation"] ?? pollingStation,
        pollingStationCode: v["station_code"] ?? v["pollingStationCode"],
        stream: v["stream"],
        status: "pending",
        source: "api",
        importBatch: `IEBC-${new Date().toISOString().split("T")[0]}`,
      });
      imported++;
    }

    message = `Synced ${voters.length} records from IEBC — ${imported} new`;

    await db.insert(voterSyncLogsTable).values({
      source: "iebc-api",
      status: "completed",
      recordsProcessed: voters.length,
      recordsNew: imported,
      recordsDuplicate: voters.length - imported,
      details: message,
    });

    res.json({ ok: true, processed: voters.length, imported, message });
  } catch (err: any) {
    message = err.message;
    await db.insert(voterSyncLogsTable).values({
      source: "iebc-api",
      status: "failed",
      recordsProcessed: 0,
      recordsNew: 0,
      recordsDuplicate: 0,
      errorMessage: message,
    });
    res.status(502).json({ ok: false, error: message });
  }
});

// ── Sync logs ──────────────────────────────────────────────────────────────
router.get("/sync-logs", async (req, res) => {
  const logs = await db.select().from(voterSyncLogsTable).orderBy(desc(voterSyncLogsTable.createdAt)).limit(50);
  res.json(logs);
});

export default router;
