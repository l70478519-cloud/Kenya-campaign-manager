import { Router } from "express";
import { db, membersTable, messageCampaignsTable, canvassSessionsTable, canvassVisitsTable, volunteersTable, opinionPollsTable, pollVotesTable, topicalIssuesTable, kolTable, fundraisingCampaignsTable, donationsTable, surveysTable, surveyResponsesTable, narrativeMentionsTable, volunteerTasksTable, volunteerIssuesTable, legislativeRecordsTable, achievementsTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";

const router = Router();

// ─── Growth ──────────────────────────────────────────────────────────────────
router.get("/growth", async (_req, res) => {
  const [totals] = await db.select({
    total: sql<number>`count(*)`,
    active: sql<number>`sum(case when ${membersTable.status} = 'active' then 1 else 0 end)`,
    smsConsent: sql<number>`sum(case when ${membersTable.smsConsent} = true then 1 else 0 end)`,
    whatsappConsent: sql<number>`sum(case when ${membersTable.whatsappConsent} = true then 1 else 0 end)`,
    emailConsent: sql<number>`sum(case when ${membersTable.emailConsent} = true then 1 else 0 end)`,
  }).from(membersTable);

  const byWard = await db.select({
    ward: membersTable.ward,
    count: sql<number>`count(*)`,
    active: sql<number>`sum(case when ${membersTable.status} = 'active' then 1 else 0 end)`,
  }).from(membersTable).groupBy(membersTable.ward).orderBy(desc(sql`count(*)`));

  const bySupportLevel = await db.select({
    level: membersTable.supportLevel,
    count: sql<number>`count(*)`,
  }).from(membersTable).groupBy(membersTable.supportLevel).orderBy(desc(sql`count(*)`));

  const monthly = await db.select({
    month: sql<string>`to_char(${membersTable.createdAt}, 'YYYY-MM')`,
    count: sql<number>`count(*)`,
  }).from(membersTable).groupBy(sql`to_char(${membersTable.createdAt}, 'YYYY-MM')`).orderBy(sql`to_char(${membersTable.createdAt}, 'YYYY-MM')`).limit(24);

  res.json({
    totals: {
      total: Number(totals?.total ?? 0),
      active: Number(totals?.active ?? 0),
      smsConsent: Number(totals?.smsConsent ?? 0),
      whatsappConsent: Number(totals?.whatsappConsent ?? 0),
      emailConsent: Number(totals?.emailConsent ?? 0),
    },
    byWard: byWard.map(r => ({ ward: r.ward ?? "Unknown", count: Number(r.count), active: Number(r.active) })),
    bySupportLevel: bySupportLevel.map(r => ({ level: r.level ?? "Unknown", count: Number(r.count) })),
    monthly: monthly.map(r => ({ month: r.month, count: Number(r.count) })),
  });
});

// ─── Messaging ───────────────────────────────────────────────────────────────
router.get("/messaging", async (_req, res) => {
  const [totals] = await db.select({
    total: sql<number>`count(*)`,
    sent: sql<number>`sum(case when ${messageCampaignsTable.status} = 'sent' then 1 else 0 end)`,
    totalRecipients: sql<number>`sum(${messageCampaignsTable.recipientCount})`,
    totalDelivered: sql<number>`sum(${messageCampaignsTable.deliveredCount})`,
    totalOpened: sql<number>`sum(${messageCampaignsTable.openedCount})`,
    totalClicked: sql<number>`sum(${messageCampaignsTable.clickedCount})`,
  }).from(messageCampaignsTable);

  const byChannel = await db.select({
    channel: messageCampaignsTable.channel,
    count: sql<number>`count(*)`,
    recipients: sql<number>`sum(${messageCampaignsTable.recipientCount})`,
    delivered: sql<number>`sum(${messageCampaignsTable.deliveredCount})`,
    opened: sql<number>`sum(${messageCampaignsTable.openedCount})`,
  }).from(messageCampaignsTable).groupBy(messageCampaignsTable.channel).orderBy(desc(sql`count(*)`));

  const byStatus = await db.select({
    status: messageCampaignsTable.status,
    count: sql<number>`count(*)`,
  }).from(messageCampaignsTable).groupBy(messageCampaignsTable.status);

  const recent = await db.select().from(messageCampaignsTable).orderBy(desc(messageCampaignsTable.createdAt)).limit(10);

  const monthly = await db.select({
    month: sql<string>`to_char(${messageCampaignsTable.createdAt}, 'YYYY-MM')`,
    campaigns: sql<number>`count(*)`,
    recipients: sql<number>`sum(${messageCampaignsTable.recipientCount})`,
  }).from(messageCampaignsTable).groupBy(sql`to_char(${messageCampaignsTable.createdAt}, 'YYYY-MM')`).orderBy(sql`to_char(${messageCampaignsTable.createdAt}, 'YYYY-MM')`).limit(12);

  const tot = totals ?? { total: 0, sent: 0, totalRecipients: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0 };
  const recipients = Number(tot.totalRecipients);
  const delivered = Number(tot.totalDelivered);
  const opened = Number(tot.totalOpened);
  res.json({
    totals: {
      campaigns: Number(tot.total), sent: Number(tot.sent),
      recipients, delivered, opened, clicked: Number(tot.totalClicked),
      deliveryRate: recipients > 0 ? Math.round((delivered / recipients) * 100) : 0,
      openRate: delivered > 0 ? Math.round((opened / delivered) * 100) : 0,
    },
    byChannel: byChannel.map(r => ({
      channel: r.channel, count: Number(r.count),
      recipients: Number(r.recipients), delivered: Number(r.delivered), opened: Number(r.opened),
      deliveryRate: Number(r.recipients) > 0 ? Math.round((Number(r.delivered) / Number(r.recipients)) * 100) : 0,
    })),
    byStatus: byStatus.map(r => ({ status: r.status, count: Number(r.count) })),
    monthly: monthly.map(r => ({ month: r.month, campaigns: Number(r.campaigns), recipients: Number(r.recipients) })),
    recent,
  });
});

// ─── Field ───────────────────────────────────────────────────────────────────
router.get("/field", async (_req, res) => {
  const [sessionTotals] = await db.select({
    total: sql<number>`count(*)`,
    completed: sql<number>`sum(case when ${canvassSessionsTable.status} = 'completed' then 1 else 0 end)`,
    active: sql<number>`sum(case when ${canvassSessionsTable.status} = 'active' then 1 else 0 end)`,
    doorsTarget: sql<number>`sum(${canvassSessionsTable.doorsTarget})`,
    doorsCompleted: sql<number>`sum(${canvassSessionsTable.doorsCompleted})`,
    volunteersDeployed: sql<number>`sum(${canvassSessionsTable.assignedVolunteers})`,
  }).from(canvassSessionsTable);

  const byWard = await db.select({
    ward: canvassSessionsTable.ward,
    sessions: sql<number>`count(*)`,
    doorsTarget: sql<number>`sum(${canvassSessionsTable.doorsTarget})`,
    doorsCompleted: sql<number>`sum(${canvassSessionsTable.doorsCompleted})`,
    volunteers: sql<number>`sum(${canvassSessionsTable.assignedVolunteers})`,
  }).from(canvassSessionsTable).groupBy(canvassSessionsTable.ward).orderBy(desc(sql`sum(${canvassSessionsTable.doorsCompleted})`));

  const [visitTotals] = await db.select({
    total: sql<number>`count(*)`,
    supporters: sql<number>`sum(case when ${canvassVisitsTable.outcome} = 'supportive' then 1 else 0 end)`,
    neutral: sql<number>`sum(case when ${canvassVisitsTable.outcome} = 'neutral' then 1 else 0 end)`,
    opposed: sql<number>`sum(case when ${canvassVisitsTable.outcome} = 'opposed' then 1 else 0 end)`,
    noAnswer: sql<number>`sum(case when ${canvassVisitsTable.outcome} = 'no_answer' then 1 else 0 end)`,
  }).from(canvassVisitsTable);

  const [volTotals] = await db.select({
    total: sql<number>`count(*)`,
    active: sql<number>`sum(case when ${volunteersTable.status} = 'active' then 1 else 0 end)`,
    totalDoors: sql<number>`sum(${volunteersTable.doorsKnocked})`,
    totalHours: sql<number>`sum(${volunteersTable.hoursLogged})`,
  }).from(volunteersTable);

  const volByWard = await db.select({
    ward: volunteersTable.ward,
    count: sql<number>`count(*)`,
    doors: sql<number>`sum(${volunteersTable.doorsKnocked})`,
    hours: sql<number>`sum(${volunteersTable.hoursLogged})`,
  }).from(volunteersTable).groupBy(volunteersTable.ward).orderBy(desc(sql`count(*)`));

  const volByRole = await db.select({
    role: volunteersTable.role,
    count: sql<number>`count(*)`,
  }).from(volunteersTable).groupBy(volunteersTable.role).orderBy(desc(sql`count(*)`));

  const [issueTotals] = await db.select({
    total: sql<number>`count(*)`,
    open: sql<number>`sum(case when ${volunteerIssuesTable.status} = 'open' then 1 else 0 end)`,
    critical: sql<number>`sum(case when ${volunteerIssuesTable.severity} = 'critical' then 1 else 0 end)`,
  }).from(volunteerIssuesTable);

  const st = sessionTotals ?? {};
  const vt = visitTotals ?? {};
  const vols = volTotals ?? {};
  const doorsTarget = Number(st.doorsTarget ?? 0);
  const doorsCompleted = Number(st.doorsCompleted ?? 0);

  res.json({
    sessions: {
      total: Number(st.total ?? 0), completed: Number(st.completed ?? 0), active: Number(st.active ?? 0),
      doorsTarget, doorsCompleted, volunteersDeployed: Number(st.volunteersDeployed ?? 0),
      coveragePct: doorsTarget > 0 ? Math.round((doorsCompleted / doorsTarget) * 100) : 0,
    },
    visits: {
      total: Number(vt.total ?? 0),
      supporters: Number(vt.supporters ?? 0), neutral: Number(vt.neutral ?? 0),
      opposed: Number(vt.opposed ?? 0), noAnswer: Number(vt.noAnswer ?? 0),
    },
    volunteers: {
      total: Number(vols.total ?? 0), active: Number(vols.active ?? 0),
      totalDoors: Number(vols.totalDoors ?? 0), totalHours: Number(vols.totalHours ?? 0),
    },
    byWard: byWard.map(r => ({
      ward: r.ward, sessions: Number(r.sessions),
      doorsTarget: Number(r.doorsTarget), doorsCompleted: Number(r.doorsCompleted),
      volunteers: Number(r.volunteers),
      coveragePct: Number(r.doorsTarget) > 0 ? Math.round((Number(r.doorsCompleted) / Number(r.doorsTarget)) * 100) : 0,
    })),
    volByWard: volByWard.map(r => ({ ward: r.ward ?? "Unknown", count: Number(r.count), doors: Number(r.doors), hours: Number(r.hours) })),
    volByRole: volByRole.map(r => ({ role: r.role, count: Number(r.count) })),
    issues: { total: Number(issueTotals?.total ?? 0), open: Number(issueTotals?.open ?? 0), critical: Number(issueTotals?.critical ?? 0) },
  });
});

// ─── Sentiment ───────────────────────────────────────────────────────────────
router.get("/sentiment", async (_req, res) => {
  const polls = await db.select().from(opinionPollsTable).orderBy(desc(opinionPollsTable.totalVotes)).limit(10);

  const [pollTotals] = await db.select({
    totalPolls: sql<number>`count(*)`,
    totalVotes: sql<number>`sum(${opinionPollsTable.totalVotes})`,
    activePolls: sql<number>`sum(case when ${opinionPollsTable.status} = 'active' then 1 else 0 end)`,
  }).from(opinionPollsTable);

  const votesByWard = await db.select({
    ward: pollVotesTable.ward,
    count: sql<number>`count(*)`,
  }).from(pollVotesTable).groupBy(pollVotesTable.ward).orderBy(desc(sql`count(*)`));

  const votesByGender = await db.select({
    gender: pollVotesTable.gender,
    count: sql<number>`count(*)`,
  }).from(pollVotesTable).groupBy(pollVotesTable.gender);

  const votesByAge = await db.select({
    age: pollVotesTable.ageGroup,
    count: sql<number>`count(*)`,
  }).from(pollVotesTable).groupBy(pollVotesTable.ageGroup).orderBy(pollVotesTable.ageGroup);

  const [issueTotals] = await db.select({
    total: sql<number>`count(*)`,
    open: sql<number>`sum(case when ${topicalIssuesTable.status} = 'open' then 1 else 0 end)`,
    resolved: sql<number>`sum(case when ${topicalIssuesTable.status} = 'resolved' then 1 else 0 end)`,
    critical: sql<number>`sum(case when ${topicalIssuesTable.urgency} = 'critical' then 1 else 0 end)`,
    high: sql<number>`sum(case when ${topicalIssuesTable.urgency} = 'high' then 1 else 0 end)`,
  }).from(topicalIssuesTable);

  const issuesByCategory = await db.select({
    category: topicalIssuesTable.category,
    count: sql<number>`count(*)`,
    open: sql<number>`sum(case when ${topicalIssuesTable.status} = 'open' then 1 else 0 end)`,
  }).from(topicalIssuesTable).groupBy(topicalIssuesTable.category).orderBy(desc(sql`count(*)`));

  const issuesByWard = await db.select({
    ward: topicalIssuesTable.ward,
    count: sql<number>`count(*)`,
    critical: sql<number>`sum(case when ${topicalIssuesTable.urgency} = 'critical' then 1 else 0 end)`,
  }).from(topicalIssuesTable).groupBy(topicalIssuesTable.ward).orderBy(desc(sql`count(*)`));

  res.json({
    polls: { total: Number(pollTotals?.totalPolls ?? 0), votes: Number(pollTotals?.totalVotes ?? 0), active: Number(pollTotals?.activePolls ?? 0) },
    topPolls: polls,
    votesByWard: votesByWard.map(r => ({ ward: r.ward ?? "Unknown", count: Number(r.count) })),
    votesByGender: votesByGender.map(r => ({ gender: r.gender ?? "Unknown", count: Number(r.count) })),
    votesByAge: votesByAge.map(r => ({ age: r.age ?? "Unknown", count: Number(r.count) })),
    issues: { total: Number(issueTotals?.total ?? 0), open: Number(issueTotals?.open ?? 0), resolved: Number(issueTotals?.resolved ?? 0), critical: Number(issueTotals?.critical ?? 0), high: Number(issueTotals?.high ?? 0) },
    issuesByCategory: issuesByCategory.map(r => ({ category: r.category, count: Number(r.count), open: Number(r.open) })),
    issuesByWard: issuesByWard.map(r => ({ ward: r.ward ?? "All", count: Number(r.count), critical: Number(r.critical) })),
  });
});

// ─── KOLs ────────────────────────────────────────────────────────────────────
router.get("/kols", async (_req, res) => {
  const [totals] = await db.select({
    total: sql<number>`count(*)`,
    totalFollowers: sql<number>`sum(${kolTable.followerCount})`,
    avgInfluence: sql<number>`avg(${kolTable.influenceScore})`,
    aligned: sql<number>`sum(case when ${kolTable.alignment} = 'aligned' then 1 else 0 end)`,
    neutral: sql<number>`sum(case when ${kolTable.alignment} = 'neutral' then 1 else 0 end)`,
    opposed: sql<number>`sum(case when ${kolTable.alignment} = 'opposed' then 1 else 0 end)`,
  }).from(kolTable);

  const byTier = await db.select({
    tier: kolTable.tier,
    count: sql<number>`count(*)`,
    followers: sql<number>`sum(${kolTable.followerCount})`,
    avgScore: sql<number>`avg(${kolTable.influenceScore})`,
  }).from(kolTable).groupBy(kolTable.tier).orderBy(desc(sql`sum(${kolTable.followerCount})`));

  const byPlatform = await db.select({
    platform: kolTable.platform,
    count: sql<number>`count(*)`,
    followers: sql<number>`sum(${kolTable.followerCount})`,
    avgScore: sql<number>`avg(${kolTable.influenceScore})`,
  }).from(kolTable).groupBy(kolTable.platform).orderBy(desc(sql`sum(${kolTable.followerCount})`));

  const byAlignment = await db.select({
    alignment: kolTable.alignment,
    count: sql<number>`count(*)`,
    followers: sql<number>`sum(${kolTable.followerCount})`,
  }).from(kolTable).groupBy(kolTable.alignment);

  const byWard = await db.select({
    ward: kolTable.ward,
    count: sql<number>`count(*)`,
    followers: sql<number>`sum(${kolTable.followerCount})`,
  }).from(kolTable).groupBy(kolTable.ward).orderBy(desc(sql`count(*)`));

  const topKOLs = await db.select().from(kolTable).orderBy(desc(kolTable.influenceScore)).limit(10);

  res.json({
    totals: {
      total: Number(totals?.total ?? 0),
      followers: Number(totals?.totalFollowers ?? 0),
      avgInfluence: Math.round(Number(totals?.avgInfluence ?? 0)),
      aligned: Number(totals?.aligned ?? 0),
      neutral: Number(totals?.neutral ?? 0),
      opposed: Number(totals?.opposed ?? 0),
    },
    byTier: byTier.map(r => ({ tier: r.tier, count: Number(r.count), followers: Number(r.followers), avgScore: Math.round(Number(r.avgScore)) })),
    byPlatform: byPlatform.map(r => ({ platform: r.platform, count: Number(r.count), followers: Number(r.followers), avgScore: Math.round(Number(r.avgScore)) })),
    byAlignment: byAlignment.map(r => ({ alignment: r.alignment, count: Number(r.count), followers: Number(r.followers) })),
    byWard: byWard.map(r => ({ ward: r.ward ?? "Unknown", count: Number(r.count), followers: Number(r.followers) })),
    topKOLs,
  });
});

// ─── Insights (cross-module) ──────────────────────────────────────────────────
router.get("/insights", async (_req, res) => {
  const [members] = await db.select({ total: sql<number>`count(*)`, active: sql<number>`sum(case when ${membersTable.status} = 'active' then 1 else 0 end)` }).from(membersTable);
  const [vols] = await db.select({ total: sql<number>`count(*)`, active: sql<number>`sum(case when ${volunteersTable.status} = 'active' then 1 else 0 end)`, doors: sql<number>`sum(${volunteersTable.doorsKnocked})`, hours: sql<number>`sum(${volunteersTable.hoursLogged})` }).from(volunteersTable);
  const [sessions] = await db.select({ total: sql<number>`count(*)`, doorsTarget: sql<number>`sum(${canvassSessionsTable.doorsTarget})`, doorsCompleted: sql<number>`sum(${canvassSessionsTable.doorsCompleted})` }).from(canvassSessionsTable);
  const [msgs] = await db.select({ total: sql<number>`count(*)`, recipients: sql<number>`sum(${messageCampaignsTable.recipientCount})`, delivered: sql<number>`sum(${messageCampaignsTable.deliveredCount})` }).from(messageCampaignsTable);
  const [polls] = await db.select({ total: sql<number>`count(*)`, votes: sql<number>`sum(${opinionPollsTable.totalVotes})` }).from(opinionPollsTable);
  const [issues] = await db.select({ total: sql<number>`count(*)`, open: sql<number>`sum(case when ${topicalIssuesTable.status} = 'open' then 1 else 0 end)` }).from(topicalIssuesTable);
  const [kols] = await db.select({ total: sql<number>`count(*)`, followers: sql<number>`sum(${kolTable.followerCount})`, aligned: sql<number>`sum(case when ${kolTable.alignment} = 'aligned' then 1 else 0 end)` }).from(kolTable);
  const [finance] = await db.select({ total: sql<number>`sum(${donationsTable.amount})`, count: sql<number>`count(*)` }).from(donationsTable);
  const [records] = await db.select({ total: sql<number>`count(*)`, passed: sql<number>`sum(case when ${legislativeRecordsTable.status} = 'passed' then 1 else 0 end)` }).from(legislativeRecordsTable);
  const [achievements] = await db.select({ total: sql<number>`count(*)`, completed: sql<number>`sum(case when ${achievementsTable.status} = 'completed' then 1 else 0 end)` }).from(achievementsTable);

  const doorsTarget = Number(sessions?.doorsTarget ?? 0);
  const doorsCompleted = Number(sessions?.doorsCompleted ?? 0);
  const recipients = Number(msgs?.recipients ?? 0);
  const delivered = Number(msgs?.delivered ?? 0);
  const totalKOLs = Number(kols?.total ?? 0);
  const alignedKOLs = Number(kols?.aligned ?? 0);

  res.json({
    members: { total: Number(members?.total ?? 0), active: Number(members?.active ?? 0) },
    volunteers: { total: Number(vols?.total ?? 0), active: Number(vols?.active ?? 0), doors: Number(vols?.doors ?? 0), hours: Number(vols?.hours ?? 0) },
    field: { sessions: Number(sessions?.total ?? 0), doorsTarget, doorsCompleted, coveragePct: doorsTarget > 0 ? Math.round((doorsCompleted / doorsTarget) * 100) : 0 },
    messaging: { campaigns: Number(msgs?.total ?? 0), recipients, delivered, deliveryRate: recipients > 0 ? Math.round((delivered / recipients) * 100) : 0 },
    sentiment: { polls: Number(polls?.total ?? 0), votes: Number(polls?.votes ?? 0), issues: Number(issues?.total ?? 0), openIssues: Number(issues?.open ?? 0) },
    kols: { total: totalKOLs, followers: Number(kols?.followers ?? 0), alignedPct: totalKOLs > 0 ? Math.round((alignedKOLs / totalKOLs) * 100) : 0 },
    finance: { totalRaised: Number(finance?.total ?? 0), donations: Number(finance?.count ?? 0) },
    credentials: { records: Number(records?.total ?? 0), passed: Number(records?.passed ?? 0), achievements: Number(achievements?.total ?? 0), completed: Number(achievements?.completed ?? 0) },
  });
});

export default router;
