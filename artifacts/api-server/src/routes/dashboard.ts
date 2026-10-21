import { Router } from "express";
import { db, membersTable, volunteersTable, messageCampaignsTable, canvassVisitsTable, canvassSessionsTable, narrativeMentionsTable, milestonesTable, campaignEventsTable, campaignSettingsTable, warRoomBriefsTable, campaignWards } from "@workspace/db";
import { sql, eq, gte, inArray, and, or, isNull, isNotNull } from "drizzle-orm";

import { DASHBOARD_OVERVIEW_SQL } from "../lib/dashboard-overview-sql";

const router = Router();

router.get("/overview", async (_req, res) => {
  const result = await db.execute(sql.raw(DASHBOARD_OVERVIEW_SQL));
  const row = result.rows[0];
  if (!row) { res.status(503).json({ error: "Dashboard unavailable" }); return; }
  const previous = Number(row.previousMonth);
  res.json({ ...row, growthRate: previous > 0 ? Math.round((Number(row.newThisMonth) - previous) / previous * 100) : null });
});

router.get("/summary", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [members, volunteers, messages, doors, wards, threats, milestones, events, settings] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(membersTable).where(inArray(membersTable.ward, campaignWards())),
    db.select({ count: sql<number>`count(*)` }).from(volunteersTable).where(and(eq(volunteersTable.status, "active"), inArray(volunteersTable.ward, campaignWards()))),
    db.select({ total: sql<number>`sum(${messageCampaignsTable.recipientCount})` }).from(messageCampaignsTable).where(isNotNull(messageCampaignsTable.sentAt)),
    db.select({ total: sql<number>`count(*)` }).from(canvassVisitsTable).innerJoin(canvassSessionsTable, eq(canvassVisitsTable.sessionId, canvassSessionsTable.id)).where(inArray(canvassSessionsTable.ward, campaignWards())),
    db.select({ ward: canvassSessionsTable.ward }).from(canvassSessionsTable).where(inArray(canvassSessionsTable.ward, campaignWards())).groupBy(canvassSessionsTable.ward),
    db.select({ count: sql<number>`count(*)` }).from(narrativeMentionsTable).where(eq(narrativeMentionsTable.status, "open")),
    db.select({ total: sql<number>`count(*)`, completed: sql<number>`sum(case when ${milestonesTable.status} = 'completed' then 1 else 0 end)` }).from(milestonesTable),
    db.select({ count: sql<number>`count(*)` }).from(campaignEventsTable).where(and(gte(campaignEventsTable.startDate, today), or(isNull(campaignEventsTable.ward), inArray(campaignEventsTable.ward, campaignWards())))),
    db.select().from(campaignSettingsTable).where(eq(campaignSettingsTable.key, "election_date")),
  ]);

  const total = Number(milestones[0]?.total ?? 0);
  const completed = Number(milestones[0]?.completed ?? 0);
  const readiness = total > 0 ? Math.round((completed / total) * 100) : 0;

  let daysToElection: number | null = null;
  if (settings[0]) {
    const diff = Math.ceil((new Date(settings[0].value).getTime() - new Date().getTime()) / 86400000);
    daysToElection = diff;
  }

  res.json({
    totalMembers: Number(members[0]?.count ?? 0),
    activeVolunteers: Number(volunteers[0]?.count ?? 0),
    messagesSent: Number(messages[0]?.total ?? 0),
    doorsKnocked: Number(doors[0]?.total ?? 0),
    wardsCovered: wards.length,
    openThreats: Number(threats[0]?.count ?? 0),
    campaignReadiness: readiness,
    daysToElection,
    recentMilestones: completed,
    upcomingEvents: Number(events[0]?.count ?? 0),
  });
});

router.get("/activity", async (req, res) => {
  const activity: Array<{ id: number; type: string; description: string; timestamp: string; module: string }> = [];

  const [members, visits, campaigns, events, mentions, briefs] = await Promise.all([
    db.select({ id: membersTable.id, firstName: membersTable.firstName, lastName: membersTable.lastName, createdAt: membersTable.createdAt }).from(membersTable).orderBy(sql`${membersTable.createdAt} desc`).limit(3),
    db.select({ id: canvassVisitsTable.id, address: canvassVisitsTable.address, outcome: canvassVisitsTable.outcome, visitedAt: canvassVisitsTable.visitedAt }).from(canvassVisitsTable).orderBy(sql`${canvassVisitsTable.visitedAt} desc`).limit(3),
    db.select({ id: messageCampaignsTable.id, name: messageCampaignsTable.name, channel: messageCampaignsTable.channel, sentAt: messageCampaignsTable.sentAt }).from(messageCampaignsTable).where(sql`${messageCampaignsTable.sentAt} is not null`).orderBy(sql`${messageCampaignsTable.sentAt} desc`).limit(3),
    db.select({ id: campaignEventsTable.id, title: campaignEventsTable.title, createdAt: campaignEventsTable.createdAt }).from(campaignEventsTable).orderBy(sql`${campaignEventsTable.createdAt} desc`).limit(2),
    db.select({ id: narrativeMentionsTable.id, platform: narrativeMentionsTable.platform, threatLevel: narrativeMentionsTable.threatLevel, detectedAt: narrativeMentionsTable.detectedAt }).from(narrativeMentionsTable).orderBy(sql`${narrativeMentionsTable.detectedAt} desc`).limit(2),
    db.select({ id: warRoomBriefsTable.id, title: warRoomBriefsTable.title, createdAt: warRoomBriefsTable.createdAt }).from(warRoomBriefsTable).orderBy(sql`${warRoomBriefsTable.createdAt} desc`).limit(2),
  ]);

  members.forEach((m, i) => activity.push({ id: i * 100 + 1, type: "member_added", description: `New contact registered: ${m.firstName} ${m.lastName}`, timestamp: m.createdAt.toISOString(), module: "members" }));
  visits.forEach((v, i) => activity.push({ id: i * 100 + 2, type: "visit_logged", description: `Door knock logged at ${v.address} — ${v.outcome}`, timestamp: v.visitedAt.toISOString(), module: "field-ops" }));
  campaigns.forEach((c, i) => activity.push({ id: i * 100 + 3, type: "campaign_sent", description: `${c.channel.toUpperCase()} campaign dispatched: ${c.name}`, timestamp: (c.sentAt ?? new Date()).toISOString(), module: "messaging" }));
  events.forEach((e, i) => activity.push({ id: i * 100 + 4, type: "event_created", description: `Event scheduled: ${e.title}`, timestamp: e.createdAt.toISOString(), module: "events" }));
  mentions.forEach((m, i) => activity.push({ id: i * 100 + 5, type: "threat_detected", description: `[ ${m.threatLevel.toUpperCase()} ] Narrative threat on ${m.platform}`, timestamp: m.detectedAt.toISOString(), module: "intelligence" }));
  briefs.forEach((b, i) => activity.push({ id: i * 100 + 6, type: "brief_filed", description: `Intel brief filed: ${b.title}`, timestamp: b.createdAt.toISOString(), module: "intelligence" }));

  activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(activity.slice(0, 15));
});

export default router;
