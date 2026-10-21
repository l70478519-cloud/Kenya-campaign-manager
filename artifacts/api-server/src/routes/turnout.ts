import { Router } from "express";
import { db, pollingStationsTable, tallyResultsTable, turnoutAssumptionsTable, campaignWards } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

// Candidate identity is not hardcoded in county turnout reporting.

// Baseline assumptions used for any ward that has no saved override.
// These are configurable modelling defaults, not observed Makueni turnout; support is
// intentionally neutral (50%) until the team sets ward-level estimates.
const DEFAULT_TURNOUT = 65;
const DEFAULT_SUPPORT = 50;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── Prediction ─────────────────────────────────────────────────────────────
// Transparent model: predictions are derived from real registered-voter counts
// per ward (polling_stations) combined with adjustable turnout/support
// assumptions. `turnoutDelta`/`supportDelta` let the UI run what-if scenarios
// on top of the saved assumptions without persisting them.
router.get("/prediction", async (req, res) => {
  const turnoutDelta = Number(req.query.turnoutDelta) || 0;
  const supportDelta = Number(req.query.supportDelta) || 0;

  const wardRows = await db
    .select({
      ward: pollingStationsTable.ward,
      registered: sql<number>`coalesce(sum(${pollingStationsTable.registeredVoters}), 0)`,
      stations: sql<number>`count(*)`,
    })
    .from(pollingStationsTable)
    .where(inArray(pollingStationsTable.ward, campaignWards()))
    .groupBy(pollingStationsTable.ward);

  const assumptions = await db.select().from(turnoutAssumptionsTable);
  const aMap = new Map(assumptions.map((a) => [a.ward, a]));

  // Actual turnout so far (from submitted tallies), for prediction-vs-actual.
  const actualRows = await db
    .select({
      ward: pollingStationsTable.ward,
      totalVotes: sql<number>`coalesce(sum(${tallyResultsTable.votes}), 0)`,
      candidateVotes: sql<number>`coalesce(sum(${tallyResultsTable.votes}), 0)`,
      reporting: sql<number>`count(distinct ${tallyResultsTable.stationCode})`,
    })
    .from(pollingStationsTable)
    .leftJoin(tallyResultsTable, eq(pollingStationsTable.code, tallyResultsTable.stationCode))
    .where(inArray(pollingStationsTable.ward, campaignWards()))
    .groupBy(pollingStationsTable.ward);
  const actMap = new Map(actualRows.map((a) => [a.ward, a]));

  const wards = wardRows.map((w) => {
    const registered = Number(w.registered);
    const asmp = aMap.get(w.ward);
    const baseTurnout = asmp?.expectedTurnoutRate ?? DEFAULT_TURNOUT;
    const baseSupport = asmp?.muleSupportShare ?? DEFAULT_SUPPORT;
    const turnoutRate = clamp(baseTurnout + turnoutDelta);
    const supportShare = clamp(baseSupport + supportDelta);
    const predictedVotes = Math.round((registered * turnoutRate) / 100);
    const predictedCandidateVotes = Math.round((predictedVotes * supportShare) / 100);
    // Mobilization upside: expected supporters who are NOT projected to vote.
    // High values flag where GOTV effort converts to the most extra votes.
    const gotvUpside = Math.round(registered * (supportShare / 100) * (1 - turnoutRate / 100));

    const act = actMap.get(w.ward);
    const actualVotesCast = Number(act?.totalVotes ?? 0);
    const actualCandidateVotes = Number(act?.candidateVotes ?? 0);
    const reportingStations = Number(act?.reporting ?? 0);

    return {
      ward: w.ward,
      stations: Number(w.stations),
      registered,
      expectedTurnoutRate: baseTurnout,
      supportShare: baseSupport,
      turnoutRate,
      effectiveSupportShare: supportShare,
      predictedVotes,
      predictedCandidateVotes,
      gotvUpside,
      actualVotesCast,
      actualCandidateVotes,
      actualTurnoutRate: registered ? Math.round((actualVotesCast / registered) * 100) : 0,
      reportingStations,
    };
  });

  const rankMap = new Map<string, number>();
  [...wards]
    .sort((a, b) => b.gotvUpside - a.gotvUpside)
    .forEach((w, i) => rankMap.set(w.ward, i + 1));

  const wardsOut = wards
    .map((w) => ({ ...w, gotvRank: rankMap.get(w.ward) ?? 0 }))
    .sort((a, b) => b.registered - a.registered);

  const totalRegistered = wardsOut.reduce((s, w) => s + w.registered, 0);
  const totalPredictedVotes = wardsOut.reduce((s, w) => s + w.predictedVotes, 0);
  const totalCandidateVotes = wardsOut.reduce((s, w) => s + w.predictedCandidateVotes, 0);
  const topGotv = [...wardsOut].sort((a, b) => b.gotvUpside - a.gotvUpside)[0];

  res.json({
    scope: "Makueni County",
    scenario: { turnoutDelta, supportDelta },
    defaults: { turnout: DEFAULT_TURNOUT, support: DEFAULT_SUPPORT },
    wards: wardsOut,
    totals: {
      registered: totalRegistered,
      predictedVotes: totalPredictedVotes,
      predictedTurnoutRate: totalRegistered ? Math.round((totalPredictedVotes / totalRegistered) * 100) : 0,
      predictedCandidateVotes: totalCandidateVotes,
      predictedCandidateShare: totalPredictedVotes ? Math.round((totalCandidateVotes / totalPredictedVotes) * 100) : 0,
      topGotvWard: topGotv?.ward ?? null,
      topGotvUpside: topGotv?.gotvUpside ?? 0,
    },
  });
});

// ── Assumptions ────────────────────────────────────────────────────────────
router.get("/assumptions", async (_req, res) => {
  const rows = (await db.select().from(turnoutAssumptionsTable)).filter(a => campaignWards().includes(a.ward)).map(a => ({ ward: a.ward, expectedTurnoutRate: a.expectedTurnoutRate, candidateSupportShare: a.muleSupportShare, updatedAt: a.updatedAt }));
  res.json(rows);
});

const assumptionSchema = z.object({
  ward: z.string().min(1),
  expectedTurnoutRate: z.number().int().min(0).max(100),
  candidateSupportShare: z.number().int().min(0).max(100),
});
const putSchema = z.object({ assumptions: z.array(assumptionSchema).min(1) });

router.put("/assumptions", async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.assumptions.some(a => !campaignWards().includes(a.ward))) {
    res.status(400).json({ error: "Invalid assumptions", details: parsed.success ? "Only official Makueni wards are accepted" : parsed.error.issues });
    return;
  }

  for (const a of parsed.data.assumptions) {
    await db
      .insert(turnoutAssumptionsTable)
      .values({
        ward: a.ward,
        expectedTurnoutRate: a.expectedTurnoutRate,
        muleSupportShare: a.candidateSupportShare,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [turnoutAssumptionsTable.ownerCampaignId, turnoutAssumptionsTable.ward],
        set: {
          expectedTurnoutRate: a.expectedTurnoutRate,
          muleSupportShare: a.candidateSupportShare,
          updatedAt: new Date(),
        },
      });
  }

  res.json({ ok: true, count: parsed.data.assumptions.length });
});

export default router;
