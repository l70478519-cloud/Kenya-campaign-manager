import {
  db,
  membersTable,
  segmentsTable,
  messageCampaignsTable,
  canvassSessionsTable,
  canvassVisitsTable,
  volunteersTable,
  volunteerAssignmentsTable,
  surveysTable,
  surveyResponsesTable,
  campaignEventsTable,
  narrativeMentionsTable,
  competitorsTable,
  warRoomBriefsTable,
  milestonesTable,
  campaignSettingsTable,
  kolTable,
  fundraisingCampaignsTable,
  donationsTable,
  donorsTable,
  pledgesTable,
  pollingStationsTable,
  tallyResultsTable,
  electionEventsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";

const WARDS = [
  "Makueni North",
  "Makueni West",
  "Makueni East",
  "Tala",
  "Kyeleni",
];

const SUPPORT_LEVELS = [
  "strong_supporter",
  "supporter",
  "undecided",
  "soft_opponent",
  "opponent",
];

const FIRST_NAMES = [
  "Peter", "Mary", "John", "Grace", "James", "Faith", "David", "Rose", "Paul",
  "Agnes", "Joseph", "Beatrice", "Samuel", "Esther", "Michael", "Charity",
  "Daniel", "Mercy", "George", "Purity", "Patrick", "Lilian", "Stephen",
  "Caroline", "Francis", "Judith", "Anthony", "Eunice", "Charles", "Joyce",
  "Simon", "Lydia", "Moses", "Margaret", "Isaac", "Priscilla", "Thomas",
  "Winnie", "Robert", "Naomi", "Martin", "Eunice", "Alex", "Millicent",
  "Kevin", "Sharon", "Brian", "Cynthia", "Dennis", "Anne",
];

const LAST_NAMES = [
  "Mutua", "Mwangi", "Njoroge", "Kamau", "Odhiambo", "Wambua", "Musyoka",
  "Nzomo", "Kioko", "Muthiani", "Muema", "Ndunda", "Muli", "Ngei", "Mutiso",
  "Mbula", "Kimeu", "Mwenda", "Kavivya", "Mweu", "Musau", "Kiilu", "Munyao",
  "Ndeti", "Maluki", "Nzioka", "Masila", "Mutunga", "Mutuku", "Nganga",
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function phone(): string {
  return `07${randInt(10, 99)}${randInt(100000, 999999)}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function clearAll() {
  console.log("Clearing existing data...");
  await db.execute(sql`TRUNCATE TABLE tally_results, polling_stations, election_events_log, donations, fundraising_campaigns, survey_responses, surveys, canvass_visits, canvass_sessions, volunteer_assignments, volunteers, message_campaigns, segments, narrative_mentions, competitors, war_room_briefs, milestones, campaign_settings, kol, campaign_events, members RESTART IDENTITY CASCADE`);
}

async function seedMembers() {
  console.log("Seeding members...");
  const members = [];
  const supportWeights: [string, number][] = [
    ["strong_supporter", 30],
    ["supporter", 28],
    ["undecided", 22],
    ["soft_opponent", 12],
    ["opponent", 8],
  ];

  function weightedSupport(): string {
    const roll = randInt(1, 100);
    let cum = 0;
    for (const [level, weight] of supportWeights) {
      cum += weight;
      if (roll <= cum) return level;
    }
    return "undecided";
  }

  for (let i = 0; i < 120; i++) {
    const ward = rand(WARDS);
    const support = weightedSupport();
    const sms = Math.random() > 0.3;
    const wa = Math.random() > 0.4;
    const email = Math.random() > 0.6;
    members.push({
      firstName: rand(FIRST_NAMES),
      lastName: rand(LAST_NAMES),
      email: Math.random() > 0.5 ? `voter${i + 1}@makueni.ke` : null,
      phone: phone(),
      ward,
      status: Math.random() > 0.08 ? "active" : "inactive",
      supportLevel: support,
      smsConsent: sms,
      whatsappConsent: wa,
      emailConsent: email,
      notes: i % 15 === 0 ? "Key community elder — handle personally" : i % 20 === 0 ? "Women's group chair" : null,
    });
  }

  const inserted = await db.insert(membersTable).values(members).returning();
  console.log(`  ✓ ${inserted.length} members`);
  return inserted;
}

async function seedSegments() {
  console.log("Seeding segments...");
  const segs = [
    {
      name: "Strong Supporters — All Wards",
      description: "Confirmed base voters ready for GOTV mobilisation",
      criteria: { supportLevel: "strong_supporter" },
      memberCount: 36,
      isLocked: true,
    },
    {
      name: "Undecided — Tala & Makueni East",
      description: "Swing voters in key wards — priority persuasion targets",
      criteria: { ward: "Tala", supportLevel: "undecided" },
      memberCount: 14,
      isLocked: false,
    },
    {
      name: "SMS Consented — Makueni North",
      description: "Bulk SMS broadcast list for Makueni North",
      criteria: { ward: "Makueni North", smsConsent: true },
      memberCount: 22,
      isLocked: false,
    },
    {
      name: "WhatsApp Network — All Wards",
      description: "WhatsApp broadcast list for all consented contacts",
      criteria: { whatsappConsent: true },
      memberCount: 71,
      isLocked: false,
    },
    {
      name: "Soft Opponents — Kyeleni",
      description: "Persuadable opponents in Kyeleni — targeted engagement",
      criteria: { ward: "Kyeleni", supportLevel: "soft_opponent" },
      memberCount: 9,
      isLocked: false,
    },
    {
      name: "GOTV Master List",
      description: "All supporters and strong supporters across constituency",
      criteria: { supportLevel: "supporter" },
      memberCount: 70,
      isLocked: true,
    },
  ];
  const inserted = await db.insert(segmentsTable).values(segs).returning();
  console.log(`  ✓ ${inserted.length} segments`);
  return inserted;
}

async function seedMessaging(segments: any[]) {
  console.log("Seeding message campaigns...");
  const campaigns = [
    {
      name: "Masaa ya Thamani — Launch Broadcast",
      channel: "sms",
      status: "sent",
      messageBody: "Mheshimiwa Stephen Mule anakuomba ushiriki kwenye mkutano mkuu wa Tala siku ya Ijumaa saa tatu usiku. Pamoja tunaweza! Piga kura Mule 2027.",
      segmentId: segments[0]!.id,
      recipientCount: 36,
      deliveredCount: 33,
      openedCount: 0,
      clickedCount: 0,
      sentAt: daysAgo(21),
    },
    {
      name: "Makueni Development Manifesto — WhatsApp",
      channel: "whatsapp",
      status: "sent",
      messageBody: "🇰🇪 Hon. Stephen Mule's 2027 Manifesto: Roads, Water, Jobs. Download your copy at mule2027.ke. Share with your neighbours!",
      segmentId: segments[3]!.id,
      recipientCount: 71,
      deliveredCount: 68,
      openedCount: 52,
      clickedCount: 19,
      sentAt: daysAgo(14),
    },
    {
      name: "Tala Rally Reminder — SMS",
      channel: "sms",
      status: "sent",
      messageBody: "KUMBUSHO: Mkutano Mkuu wa Tala ni KESHO saa nne asubuhi. Mheshimiwa Mule atakuwa hapo. Njoo na jirani yako!",
      segmentId: segments[1]!.id,
      recipientCount: 14,
      deliveredCount: 13,
      openedCount: 0,
      clickedCount: 0,
      sentAt: daysAgo(7),
    },
    {
      name: "Manifesto Email Blast",
      channel: "email",
      status: "sent",
      messageBody: "Dear Supporter, Thank you for your continued support for Hon. Stephen Mule. As we approach 2027, our development agenda for Makueni is clear...",
      segmentId: null,
      recipientCount: 48,
      deliveredCount: 45,
      openedCount: 31,
      clickedCount: 12,
      sentAt: daysAgo(10),
    },
    {
      name: "GOTV Final Push — SMS Blast",
      channel: "sms",
      status: "draft",
      messageBody: "LEO NI SIKU YA KUPIGA KURA. Nenda polling station yako SASA HIVI. Piga kura Stephen Mule — Nafasi ya 01. Mpiganieni kila mmoja!",
      segmentId: segments[5]!.id,
      recipientCount: 0,
      deliveredCount: 0,
      openedCount: 0,
      clickedCount: 0,
    },
    {
      name: "Undecided Persuasion — WhatsApp",
      channel: "whatsapp",
      status: "scheduled",
      messageBody: "Stephen Mule amewaletea barabara ya Tala–Makueni. Miradi mingine inakuja 2027. Jiunge nasi leo.",
      segmentId: segments[1]!.id,
      recipientCount: 14,
      deliveredCount: 0,
      openedCount: 0,
      clickedCount: 0,
      scheduledAt: new Date(Date.now() + 3 * 86400000),
    },
  ];
  const inserted = await db.insert(messageCampaignsTable).values(campaigns).returning();
  console.log(`  ✓ ${inserted.length} campaigns`);
}

async function seedVolunteers() {
  console.log("Seeding volunteers...");
  const vols = [
    { firstName: "Josephine", lastName: "Mutua", ward: "Tala", role: "coordinator", doorsKnocked: 142, hoursLogged: 38 },
    { firstName: "Bernard", lastName: "Mwangi", ward: "Makueni North", role: "team_lead", doorsKnocked: 98, hoursLogged: 24 },
    { firstName: "Lucy", lastName: "Ndunda", ward: "Makueni West", role: "canvasser", doorsKnocked: 76, hoursLogged: 18 },
    { firstName: "Edwin", lastName: "Kioko", ward: "Makueni East", role: "canvasser", doorsKnocked: 63, hoursLogged: 15 },
    { firstName: "Veronica", lastName: "Musyoka", ward: "Kyeleni", role: "team_lead", doorsKnocked: 87, hoursLogged: 22 },
    { firstName: "Collins", lastName: "Muema", ward: "Makueni East", role: "canvasser", doorsKnocked: 54, hoursLogged: 13 },
    { firstName: "Sylvia", lastName: "Wambua", ward: "Tala", role: "phone_banker", doorsKnocked: 0, hoursLogged: 31 },
    { firstName: "Jackson", lastName: "Mutiso", ward: "Makueni North", role: "canvasser", doorsKnocked: 89, hoursLogged: 20 },
    { firstName: "Peninah", lastName: "Kimeu", ward: "Kyeleni", role: "canvasser", doorsKnocked: 47, hoursLogged: 11 },
    { firstName: "Victor", lastName: "Mwenda", ward: "Makueni East", role: "canvasser", doorsKnocked: 71, hoursLogged: 17 },
    { firstName: "Lorna", lastName: "Munyao", ward: "Makueni West", role: "data_entry", doorsKnocked: 0, hoursLogged: 26 },
    { firstName: "Felix", lastName: "Ndeti", ward: "Makueni East", role: "canvasser", doorsKnocked: 58, hoursLogged: 14 },
    { firstName: "Gloria", lastName: "Maluki", ward: "Tala", role: "canvasser", doorsKnocked: 83, hoursLogged: 19 },
    { firstName: "Henry", lastName: "Nzioka", ward: "Makueni North", role: "team_lead", doorsKnocked: 112, hoursLogged: 29 },
    { firstName: "Diana", lastName: "Masila", ward: "Kyeleni", role: "canvasser", doorsKnocked: 39, hoursLogged: 9 },
  ];
  const inserted = await db.insert(volunteersTable).values(
    vols.map(v => ({ ...v, email: `${v.firstName.toLowerCase()}@campaign.ke`, phone: phone(), status: "active" }))
  ).returning();

  // Assignments
  const assignments = inserted.map(v => ({ volunteerId: v.id, ward: v.ward! }));
  await db.insert(volunteerAssignmentsTable).values(assignments);
  console.log(`  ✓ ${inserted.length} volunteers`);
  return inserted;
}

async function seedFieldOps(volunteers: any[]) {
  console.log("Seeding field ops...");
  const sessions = [
    { name: "Tala Market Blitz", ward: "Tala", date: daysAgo(30).toISOString().slice(0,10), status: "completed", doorsTarget: 80, doorsCompleted: 74, assignedVolunteers: 4 },
    { name: "Makueni North Door Knock", ward: "Makueni North", date: daysAgo(22).toISOString().slice(0,10), status: "completed", doorsTarget: 60, doorsCompleted: 58, assignedVolunteers: 3 },
    { name: "Kyeleni Sweep", ward: "Kyeleni", date: daysAgo(15).toISOString().slice(0,10), status: "completed", doorsTarget: 50, doorsCompleted: 43, assignedVolunteers: 3 },
    { name: "Makueni East Saturday Drive", ward: "Makueni East", date: daysAgo(8).toISOString().slice(0,10), status: "completed", doorsTarget: 70, doorsCompleted: 61, assignedVolunteers: 3 },
    { name: "Makueni West Outreach", ward: "Makueni West", date: daysAgo(3).toISOString().slice(0,10), status: "completed", doorsTarget: 55, doorsCompleted: 49, assignedVolunteers: 2 },
    { name: "Makueni East Phase 2", ward: "Makueni East", date: daysAgo(1).toISOString().slice(0,10), status: "active", doorsTarget: 65, doorsCompleted: 31, assignedVolunteers: 2 },
    { name: "Tala Town Follow-Up", ward: "Tala", date: daysFromNow(3), status: "planned", doorsTarget: 90, doorsCompleted: 0, assignedVolunteers: 5 },
    { name: "Kyeleni Phase 2", ward: "Kyeleni", date: daysFromNow(7), status: "planned", doorsTarget: 60, doorsCompleted: 0, assignedVolunteers: 3 },
  ];
  const insertedSessions = await db.insert(canvassSessionsTable).values(sessions).returning();

  // Visits for completed sessions
  const outcomesByWard: Record<string, [string, number][]> = {
    "Tala":            [["support",35],["strong_supporter",12],["undecided",18],["oppose",6],["not_home",3]],
    "Makueni North": [["support",28],["strong_supporter",10],["undecided",14],["oppose",4],["not_home",2]],
    "Kyeleni":         [["support",18],["strong_supporter",6],["undecided",12],["oppose",5],["not_home",2]],
    "Makueni East":  [["support",24],["strong_supporter",9],["undecided",16],["oppose",8],["not_home",4]],
    "Makueni West":  [["support",22],["strong_supporter",8],["undecided",11],["oppose",6],["not_home",2]],
  };

  const streets: Record<string, string[]> = {
    "Tala":            ["Tala–Matuu Rd","Market St","Church Lane","Cooperative Ave","Kibauni Rd"],
    "Makueni North": ["Kangundo Rd","Katangi Rd","Kyumbi Lane","Ndalani Rd","Chief's Rd"],
    "Kyeleni":         ["Kyeleni–Tala Rd","Stoneham St","Mwea Rd","Irrigation Way","Mission Rd"],
    "Makueni West":  ["Athi River Rd","Mwala–Makueni Rd","Junction St","Githua Rd","Valley Rd"],
    "Makueni East":  ["Masinga Rd","Yatta Rd","Thika–Garissa Hwy","Kyatune Lane","School Rd"],
  };

  const visits: any[] = [];
  for (const session of insertedSessions.filter(s => ["completed","active"].includes(s.status))) {
    const outcomes = outcomesByWard[session.ward] ?? outcomesByWard["Tala"]!;
    const wardStreets = streets[session.ward] ?? streets["Tala"]!;
    for (const [outcome, count] of outcomes) {
      for (let i = 0; i < count; i++) {
        visits.push({
          sessionId: session.id,
          address: `${randInt(1, 200)} ${rand(wardStreets)}, ${session.ward}`,
          outcome: outcome === "strong_supporter" ? "support" : outcome,
          supportLevel: outcome === "strong_supporter" ? "strong_supporter" : outcome === "support" ? "supporter" : null,
          notes: outcome === "oppose" && Math.random() > 0.6 ? "Asked about road funding — follow up" : null,
          visitedAt: daysAgo(randInt(1, 30)),
        });
      }
    }
  }
  await db.insert(canvassVisitsTable).values(visits);
  console.log(`  ✓ ${insertedSessions.length} sessions, ${visits.length} visits`);
}

async function seedSurveys() {
  console.log("Seeding surveys...");
  const [survey] = await db.insert(surveysTable).values({
    title: "Makueni 2027 Voter Priorities Survey",
    description: "Understanding what issues matter most to Makueni residents",
    status: "active",
    questions: [
      { id: "q1", text: "What is the most important issue in Makueni?", type: "single_choice", options: ["Roads & Infrastructure", "Water Access", "Youth Employment", "Education", "Healthcare", "Security"], order: 1 },
      { id: "q2", text: "How would you rate the current MP's performance?", type: "rating", options: ["1","2","3","4","5"], order: 2 },
      { id: "q3", text: "Will you vote for Hon. Stephen Mule in 2027?", type: "single_choice", options: ["Definitely Yes", "Probably Yes", "Undecided", "Probably No", "Definitely No"], order: 3 },
      { id: "q4", text: "Any additional comments or requests?", type: "text", options: [], order: 4 },
    ],
    responseCount: 0,
  }).returning();

  const answers = [
    [{ q1: "Roads & Infrastructure", q2: "4", q3: "Definitely Yes", q4: "We need the Tala–Matuu road tarmacked" }],
    [{ q1: "Water Access", q2: "5", q3: "Definitely Yes", q4: "" }],
    [{ q1: "Youth Employment", q2: "3", q3: "Probably Yes", q4: "More bursaries needed" }],
    [{ q1: "Roads & Infrastructure", q2: "4", q3: "Definitely Yes", q4: "" }],
    [{ q1: "Education", q2: "4", q3: "Definitely Yes", q4: "School facilities need upgrade" }],
    [{ q1: "Healthcare", q2: "3", q3: "Undecided", q4: "Need a dispensary at Kyeleni" }],
    [{ q1: "Roads & Infrastructure", q2: "5", q3: "Definitely Yes", q4: "" }],
    [{ q1: "Youth Employment", q2: "4", q3: "Probably Yes", q4: "Youth programs working well" }],
    [{ q1: "Water Access", q2: "2", q3: "Undecided", q4: "Water project stalled since 2022" }],
    [{ q1: "Roads & Infrastructure", q2: "4", q3: "Definitely Yes", q4: "Makueni East feeder roads remain murram" }],
    [{ q1: "Education", q2: "5", q3: "Definitely Yes", q4: "" }],
    [{ q1: "Security", q2: "3", q3: "Probably Yes", q4: "Night security in Tala market is poor" }],
  ];

  const responses = answers.map((a) => ({
    surveyId: survey!.id,
    memberId: null,
    answers: a[0],
  }));
  await db.insert(surveyResponsesTable).values(responses);
  await db.update(surveysTable).set({ responseCount: responses.length }).returning();
  console.log(`  ✓ 1 survey, ${responses.length} responses`);
}

async function seedEvents() {
  console.log("Seeding events...");
  const events = [
    { title: "Tala Ward Rally", type: "rally", location: "Tala Social Hall", ward: "Tala", startDate: daysAgo(20).toISOString().slice(0,10), status: "completed", attendeeCount: 312, maxAttendees: 400, description: "Main launch rally for Makueni 2027 campaign" },
    { title: "Makueni North Townhall", type: "townhall", location: "Kyumbi Primary School Grounds", ward: "Makueni North", startDate: daysAgo(12).toISOString().slice(0,10), status: "completed", attendeeCount: 184, maxAttendees: 250, description: "Community Q&A session with Hon. Mule" },
    { title: "Women's Empowerment Forum — Kyeleni", type: "community", location: "Kyeleni SDA Church Hall", ward: "Kyeleni", startDate: daysAgo(6).toISOString().slice(0,10), status: "completed", attendeeCount: 97, maxAttendees: 120, description: "Women's forum — bursary distribution" },
    { title: "Youth Jobs Fair — Makueni East", type: "community", location: "Yatta Junction Market Square", ward: "Makueni East", startDate: daysAgo(2).toISOString().slice(0,10), status: "completed", attendeeCount: 228, maxAttendees: 300, description: "Youth employment linkage event with Machakos County" },
    { title: "Volunteer Training & Briefing", type: "training", location: "Tala Resource Centre", ward: "Tala", startDate: daysFromNow(4), status: "scheduled", attendeeCount: 0, maxAttendees: 40, description: "GOTV training for all ward teams" },
    { title: "Makueni West Townhall", type: "townhall", location: "Makueni West Chief's Camp", ward: "Makueni West", startDate: daysFromNow(9), status: "scheduled", attendeeCount: 0, maxAttendees: 200, description: "Community forum — roads and water agenda" },
    { title: "Manifesto Launch — Constituency Wide", type: "rally", location: "Tala Stadium", ward: "Tala", startDate: daysFromNow(18), status: "scheduled", attendeeCount: 0, maxAttendees: 2000, description: "Full manifesto launch — all five wards" },
    { title: "Fundraising Dinner — Nairobi Diaspora", type: "fundraiser", location: "Sarova Panafric Hotel, Nairobi", ward: null, startDate: daysFromNow(25), status: "scheduled", attendeeCount: 0, maxAttendees: 120, description: "Campaign fundraiser targeting Makueni diaspora in Nairobi" },
    { title: "Makueni East Ward Drive", type: "canvass", location: "Yatta Junction", ward: "Makueni East", startDate: daysFromNow(11), status: "scheduled", attendeeCount: 0, maxAttendees: 0, description: "Coordinated door-to-door sweep of Makueni East" },
  ];
  const inserted = await db.insert(campaignEventsTable).values(events).returning();
  console.log(`  ✓ ${inserted.length} events`);
}

async function seedIntelligence() {
  console.log("Seeding intelligence...");
  await db.insert(narrativeMentionsTable).values([
    { platform: "Facebook", content: "Mule amejaza mifuko yake tu! Hajafanya kitu Makueni kwa miaka 5. Acheni uwongo!", author: "MakueniMtaa", threatLevel: "high", status: "responded", counterNarrative: "Hon. Mule amewaletea Makueni miradi ya maji ya Kyeleni, bursaries 847, na ujenzi wa barabara ya Tala–Matuu. Tunaendelea.", detectedAt: daysAgo(18), respondedAt: daysAgo(17) },
    { platform: "Twitter/X", content: "Why is Tala–Matuu road still unpaved after 5 years? Mule keep promising, zero delivery. #MakueniDeservesBetter", author: "@TalaActivist", threatLevel: "medium", status: "responded", counterNarrative: "Phase 1 of Tala–Matuu road (8km) completed 2024. Phase 2 funded by NG-CDF. Works commence Q3 2026.", detectedAt: daysAgo(11), respondedAt: daysAgo(10) },
    { platform: "WhatsApp", content: "Mule anataka kukaa bunge tu. Mpinzani wake ndiye mwenye miradi ya kweli — angalia alichofanya Kangundo!", author: "Unknown", threatLevel: "high", status: "open", counterNarrative: null, detectedAt: daysAgo(4) },
    { platform: "Facebook", content: "BREAKING: Voter bribery allegations surface in Makueni East — unnamed MP accused of vote buying scheme", author: "MakueniNews254", threatLevel: "critical", status: "open", counterNarrative: null, detectedAt: daysAgo(2) },
    { platform: "TikTok", content: "Ndani ya gari ya Mule — hizo zimekuwa bei gani? Wananchi wanaomba uji, yeye ana Range Rover mbili", author: "@MakueniVlogger", threatLevel: "medium", status: "monitoring", counterNarrative: null, detectedAt: daysAgo(6) },
    { platform: "Radio", content: "Kambi ya upinzani inadai NG-CDF funds zilitumika vibaya — wanasema watapeleka kesi mahakamani", author: "Radio Citizen Machakos", threatLevel: "high", status: "monitoring", counterNarrative: null, detectedAt: daysAgo(3) },
    { platform: "Facebook", content: "Asante Mheshimiwa Mule! Mtoto wangu amepata bursary — sasa anasoma university. Mungu akubariki!", author: "MamaWaMercy", threatLevel: "low", status: "resolved", counterNarrative: "Thank you Mama Mercy! Education is our priority — 847 bursaries awarded this term alone.", detectedAt: daysAgo(9), respondedAt: daysAgo(9) },
  ]);

  await db.insert(competitorsTable).values([
    {
      name: "Hon. Julius Malombe",
      party: "UDA",
      constituency: "Makueni",
      strengths: ["National government backing", "Control of county resources", "Strong youth following in Makueni East", "Well-funded war chest"],
      weaknesses: ["Weak ground presence in Kyeleni", "No track record on water projects", "Viewed as outsider to Makueni North", "Recent land scandal allegations"],
      promisesMade: ["Tarmac all 6 ward roads", "50 boreholes constituency-wide", "1000 youth jobs program"],
      promisesKept: 0,
      promisesBroken: 1,
    },
    {
      name: "Dr. Beatrice Ndunda",
      party: "ODM",
      constituency: "Makueni",
      strengths: ["Academic credentials", "Women's vote potential", "Machakos University connections"],
      weaknesses: ["First-time candidate", "Limited ground network", "Poor name recognition outside Tala", "Under-resourced campaign"],
      promisesMade: ["Free maternal healthcare", "Girls' bursaries programme"],
      promisesKept: 0,
      promisesBroken: 0,
    },
    {
      name: "Mr. Wycliffe Mutunga",
      party: "Independent",
      constituency: "Makueni",
      strengths: ["Popular businessman in Tala", "Self-financed campaign", "Known in Makueni West"],
      weaknesses: ["No political experience", "No party machinery", "Limited reach outside Tala ward"],
      promisesMade: ["Market upgrade at Tala", "Road maintenance fund"],
      promisesKept: 0,
      promisesBroken: 0,
    },
  ]);

  await db.insert(warRoomBriefsTable).values([
    { title: "CRITICAL: Vote Buying Allegations — Makueni East", summary: "Social media and local informants report opposition distributing cash in Makueni East ward. Targeting undecided voters aged 18–35. Network of 6 brokers identified.", priority: "urgent", category: "NARRATIVE", actions: ["Deploy rapid response team to Makueni East immediately", "Document evidence — photograph + video", "Issue press statement by COB today", "Alert IEBC field officers"], status: "active" },
    { title: "Malombe Ground Team Gaining in Makueni East", summary: "Opposition coordinator Bernard Muli running parallel voter registration exercise in Makueni East. Handing out branded merchandise. Estimate 200+ new registrations in 3 weeks.", priority: "high", category: "FIELD INTEL", actions: ["Accelerate Makueni East canvass sessions", "Counter with bursary distribution event", "Deploy 2 additional volunteers to Makueni East"], status: "active" },
    { title: "Tala–Matuu Road Narrative — Positive Momentum", summary: "Phase 1 completion generating organic positive conversation. 3 community leaders have publicly endorsed Mule citing road project. Opportunity to amplify.", priority: "medium", category: "NARRATIVE", actions: ["Film testimonials with road users", "Amplify on WhatsApp broadcast lists", "Arrange site visit photo opportunity for candidate"], status: "active" },
    { title: "Radio Claim on NG-CDF — Pre-emptive Response Needed", summary: "Radio Citizen Machakos to air opposition segment on alleged NG-CDF misuse Monday 7am. We have 48-hour window to set the record straight.", priority: "high", category: "MEDIA", actions: ["Prepare NG-CDF expenditure brief for distribution", "Book response slot on same station", "Send documentation to friendly journalists"], status: "active" },
  ]);
  console.log(`  ✓ intelligence data seeded`);
}

async function seedCampaignPlan() {
  console.log("Seeding campaign plan...");

  // Set election date: August 9, 2027
  await db.insert(campaignSettingsTable).values({ key: "election_date", value: "2027-08-09" });

  await db.insert(milestonesTable).values([
    // Completed
    { title: "Campaign Headquarters Established (Tala)", category: "Ground Game", dueDate: "2025-11-01", status: "completed", owner: "Campaign Manager", description: "Secure and set up main campaign office in Tala town" },
    { title: "Core Team Assembled", category: "Ground Game", dueDate: "2025-11-15", status: "completed", owner: "Campaign Manager", description: "Recruit ward coordinators for all 6 wards" },
    { title: "Voter Register Analysis Complete", category: "Ground Game", dueDate: "2025-12-01", status: "completed", owner: "Data Team", description: "Map registered voters by ward, polling station, and demographic" },
    { title: "Manifesto Drafted (v1)", category: "Messaging", dueDate: "2026-01-15", status: "completed", owner: "Policy Team", description: "First draft of 2027 manifesto based on survey findings" },
    { title: "Digital Presence Launched", category: "Messaging", dueDate: "2026-02-01", status: "completed", owner: "Comms Team", description: "Facebook, WhatsApp, TikTok official pages live" },
    { title: "NG-CDF Projects Publicised", category: "Narrative", dueDate: "2026-03-01", status: "completed", owner: "Comms Team", description: "Document and broadcast all completed NG-CDF projects" },
    { title: "Ward Launch Rallies (Tala + North)", category: "Events", dueDate: "2026-04-30", status: "completed", owner: "Events Team", description: "Rallies completed in Tala and Makueni North" },
    { title: "First Canvass Wave Complete", category: "Ground Game", dueDate: "2026-05-31", status: "completed", owner: "Field Director", description: "First door-to-door sweep across all 6 wards" },

    // In Progress
    { title: "Volunteer Database — 100+ Enlisted", category: "Ground Game", dueDate: daysFromNow(10), status: "in_progress", owner: "Field Director", description: "Target 100 active volunteers across 6 wards" },
    { title: "Manifesto Final Version", category: "Messaging", dueDate: daysFromNow(14), status: "in_progress", owner: "Policy Team", description: "Finalise and print 10,000 copies of 2027 manifesto" },
    { title: "Constituency-Wide Manifesto Launch", category: "Events", dueDate: daysFromNow(18), status: "in_progress", owner: "Events Team", description: "Main manifesto launch at Tala Stadium — all 6 wards represented" },
    { title: "Opposition Research — Malombe Dossier", category: "Narrative", dueDate: daysFromNow(7), status: "in_progress", owner: "Intel Team", description: "Complete opposition profile and vulnerability analysis" },

    // Pending
    { title: "Polling Agent Recruitment (500 target)", category: "Ground Game", dueDate: daysFromNow(45), status: "pending", owner: "Field Director", description: "Recruit and train polling agents for every polling station" },
    { title: "GOTV Campaign Launch", category: "Ground Game", dueDate: daysFromNow(60), status: "pending", owner: "Field Director", description: "Get-Out-The-Vote mobilisation — final 60 days" },
    { title: "Fundraising Target: KES 8M", category: "Fundraising", dueDate: daysFromNow(90), status: "pending", owner: "Finance Team", description: "Raise KES 8M to fund final campaign phase" },
    { title: "Polling Agent Training", category: "Ground Game", dueDate: daysFromNow(50), status: "pending", owner: "Legal Team", description: "Train all polling agents on IEBC procedures and rights" },
    { title: "Legal Team on Standby", category: "Legal", dueDate: daysFromNow(40), status: "pending", owner: "Legal Counsel", description: "Engage legal team for election petitions and dispute resolution" },
    { title: "Election Day Command Centre Setup", category: "Ground Game", dueDate: daysFromNow(380), status: "pending", owner: "Campaign Manager", description: "Set up real-time results collection centre for polling day" },
    { title: "Final Rally — Eve of Election", category: "Events", dueDate: daysFromNow(408), status: "pending", owner: "Events Team", description: "Grand final rally night before election" },
    { title: "Media Blackout Strategy", category: "Messaging", dueDate: daysFromNow(400), status: "pending", owner: "Comms Team", description: "Plan for 48-hour media blackout period before election" },

    // Overdue
    { title: "Fundraising Dinner — Nairobi Diaspora", category: "Fundraising", dueDate: daysAgo(5).toISOString().slice(0,10), status: "overdue", owner: "Finance Team", description: "Nairobi diaspora fundraiser — postponed, needs rescheduling" },
    { title: "Kyeleni Ward Rally", category: "Events", dueDate: daysAgo(8).toISOString().slice(0,10), status: "overdue", owner: "Events Team", description: "Rally for Kyeleni ward postponed due to weather" },
  ]);
  console.log(`  ✓ campaign plan seeded (election: Aug 9 2027)`);
}

async function seedKOL() {
  console.log("Seeding KOLs...");
  await db.insert(kolTable).values([
    { name: "Pastor Emmanuel Mutua", platform: "Facebook", handle: "PastorMutuaTala", tier: "mid", influenceScore: 78, followerCount: 12400, alignment: "supporter", ward: "Tala", notes: "Chairs Tala Interfaith Council. Endorsed Mule publicly April 2026." },
    { name: "Mama Grace Ndunda", platform: "WhatsApp", handle: null, tier: "micro", influenceScore: 62, followerCount: 800, alignment: "supporter", ward: "Makueni North", notes: "Chairs women's group network across North ward. Key mobiliser." },
    { name: "Bw. Kamau Mwangangi", platform: "Facebook", handle: "KamauMwangangi254", tier: "mid", influenceScore: 71, followerCount: 9800, alignment: "neutral", ward: "Makueni East", notes: "Respected teacher and blogger. Neutral — needs cultivation." },
    { name: "Kyeleni Youth Network", platform: "TikTok", handle: "@kyeleniyouth", tier: "micro", influenceScore: 55, followerCount: 3200, alignment: "neutral", ward: "Kyeleni", notes: "Influential youth collective. Swing group — priority engagement." },
    { name: "Fr. Benedict Kioko", platform: "Facebook", handle: "FrBenedictKioko", tier: "mid", influenceScore: 68, followerCount: 7100, alignment: "supporter", ward: "Makueni East", notes: "Catholic priest. Spoken positively of Mule's bursary programme." },
    { name: "Makueni Business Forum", platform: "Facebook", handle: "MakueniBizForum", tier: "macro", influenceScore: 83, followerCount: 21000, alignment: "neutral", ward: null, notes: "Business association covering all 5 wards. Key endorsement target." },
    { name: "Teacher Waweru Mwangi", platform: "Twitter/X", handle: "@WaweruMakueni", tier: "micro", influenceScore: 47, followerCount: 2100, alignment: "opponent", ward: "Makueni West", notes: "Critical of NG-CDF allocation. Active online — monitor closely." },
    { name: "Mama Mbula — Tala Market Chair", platform: "WhatsApp", handle: null, tier: "micro", influenceScore: 69, followerCount: 1200, alignment: "supporter", ward: "Tala", notes: "Chairs Tala Market Women's Association. Controls large trader network." },
    { name: "Machakos Youth Connect", platform: "Instagram", handle: "@machakosyouth", tier: "macro", influenceScore: 77, followerCount: 18500, alignment: "neutral", ward: null, notes: "County-wide youth platform. Could amplify manifesto." },
    { name: "Daktari James Muema", platform: "Facebook", handle: "DrMuemaMakueni", tier: "mid", influenceScore: 64, followerCount: 5400, alignment: "supporter", ward: "Kyeleni", notes: "Clinic owner. Champions healthcare agenda. Publicly backed Mule." },
  ]);
  console.log(`  ✓ 10 KOLs seeded`);
}

async function seedFundraising() {
  console.log("Seeding fundraising...");

  const campaigns = await db.insert(fundraisingCampaignsTable).values([
    { name: "Nairobi Diaspora Dinner", description: "Fundraising dinner targeting Makueni diaspora in Nairobi", goalAmount: 2000000, raisedAmount: 0, status: "active", startDate: "2026-06-01", endDate: "2026-08-31" },
    { name: "Grassroots Ward Fund", description: "Small contributions from supporters across all 6 wards", goalAmount: 1500000, raisedAmount: 0, status: "active", startDate: "2026-05-01", endDate: "2027-07-31" },
    { name: "Business Community Levy", description: "Contributions from Tala and Makueni business community", goalAmount: 3000000, raisedAmount: 0, status: "active", startDate: "2026-04-01", endDate: "2027-06-30" },
    { name: "Online Campaign — GoFundMe", description: "Online donations from Kenyan diaspora and supporters", goalAmount: 500000, raisedAmount: 0, status: "active", startDate: "2026-06-15", endDate: "2027-08-01" },
    { name: "Phase 1 — Launch Fund", description: "Initial campaign launch expenses — completed", goalAmount: 800000, raisedAmount: 0, status: "completed", startDate: "2025-10-01", endDate: "2025-12-31" },
  ]).returning();

  const donationRows = [
    // Nairobi Diaspora Dinner (id 1)
    { campaignId: campaigns[0]!.id, donorName: "Dr. Mutua Kioko", amount: 200000, channel: "bank", ward: null, reference: "TXN20260615001", notes: "Pledge from dinner — first instalment" },
    { campaignId: campaigns[0]!.id, donorName: "Eng. James Nzomo", amount: 150000, channel: "bank", ward: null, reference: "TXN20260615002", notes: "Full payment at dinner" },
    { campaignId: campaigns[0]!.id, donorName: "Mama Esther Mwangi", amount: 50000, channel: "mpesa", ward: null, reference: "QGT7X3KP0N", notes: null },
    { campaignId: campaigns[0]!.id, donorName: "Hon. Patrick Mutiso", amount: 300000, channel: "cheque", ward: null, reference: "CHQ-004421", notes: "Cheque deposited 16 Jun 2026" },
    { campaignId: campaigns[0]!.id, donorName: "Bw. Francis Kimeu", amount: 75000, channel: "mpesa", ward: null, reference: "RMP9X2LQ4T", notes: null },

    // Grassroots Ward Fund (id 2)
    { campaignId: campaigns[1]!.id, donorName: "Josephine Mutua", amount: 5000, channel: "mpesa", ward: "Tala", reference: "QA7GH2KL1N", notes: "Monthly pledge" },
    { campaignId: campaigns[1]!.id, donorName: "Bernard Mwangi", amount: 3000, channel: "cash", ward: "Makueni North", reference: null, notes: null },
    { campaignId: campaigns[1]!.id, donorName: "Lucy Ndunda", amount: 2000, channel: "mpesa", ward: "Makueni West", reference: "MP8X3TQ9LP", notes: null },
    { campaignId: campaigns[1]!.id, donorName: "Edwin Kioko", amount: 5000, channel: "cash", ward: "Makueni East", reference: null, notes: null },
    { campaignId: campaigns[1]!.id, donorName: "Veronica Musyoka", amount: 3000, channel: "mpesa", ward: "Kyeleni", reference: "QT5RX2MN7P", notes: null },
    { campaignId: campaigns[1]!.id, donorName: "Collins Muema", amount: 2500, channel: "cash", ward: "Makueni East", reference: null, notes: null },
    { campaignId: campaigns[1]!.id, donorName: "Mama Grace Ndunda", amount: 10000, channel: "mpesa", ward: "Makueni North", reference: "GN8TX3QR2P", notes: "Women's group collection" },
    { campaignId: campaigns[1]!.id, donorName: "Tala Market Association", amount: 25000, channel: "bank", ward: "Tala", reference: "TXN20260520001", notes: "Market traders collective contribution" },

    // Business Community Levy (id 3)
    { campaignId: campaigns[2]!.id, donorName: "Tala Hardware Ltd", amount: 100000, channel: "bank", ward: "Tala", reference: "TXN20260501001", notes: null },
    { campaignId: campaigns[2]!.id, donorName: "Makueni Farmers Coop", amount: 150000, channel: "bank", ward: "Makueni West", reference: "TXN20260501002", notes: "Cooperative annual pledge" },
    { campaignId: campaigns[2]!.id, donorName: "Bw. Wycliffe Njoroge", amount: 80000, channel: "cheque", ward: "Tala", reference: "CHQ-004380", notes: "Petrol station owner" },
    { campaignId: campaigns[2]!.id, donorName: "Kyeleni Dairy Farmers", amount: 60000, channel: "mpesa", ward: "Kyeleni", reference: "KD7TX3QP2N", notes: null },
    { campaignId: campaigns[2]!.id, donorName: "Makueni Quarry Owners", amount: 200000, channel: "bank", ward: "Makueni East", reference: "TXN20260510001", notes: "Annual contribution from quarry consortium" },

    // Online Campaign (id 4)
    { campaignId: campaigns[3]!.id, donorName: "John Mutua (UK)", amount: 15000, channel: "online", ward: null, reference: "GF-2026-001", notes: "GoFundMe — London diaspora" },
    { campaignId: campaigns[3]!.id, donorName: "Grace Kioko (Canada)", amount: 12000, channel: "online", ward: null, reference: "GF-2026-002", notes: "GoFundMe — Toronto diaspora" },
    { campaignId: campaigns[3]!.id, donorName: "Samuel Mwenda (US)", amount: 20000, channel: "online", ward: null, reference: "GF-2026-003", notes: null },
    { campaignId: campaigns[3]!.id, donorName: "Mary Ndunda (Australia)", amount: 8000, channel: "online", ward: null, reference: "GF-2026-004", notes: null },

    // Phase 1 (completed, id 5)
    { campaignId: campaigns[4]!.id, donorName: "Campaign Launch Donors", amount: 400000, channel: "cash", ward: "Tala", reference: null, notes: "Launch day collections — Tala HQ" },
    { campaignId: campaigns[4]!.id, donorName: "Anonymous Donor", amount: 250000, channel: "bank", ward: null, reference: "TXN20251101001", notes: "Anonymous seed donation" },
    { campaignId: campaigns[4]!.id, donorName: "Makueni Business Forum", amount: 150000, channel: "bank", ward: null, reference: "TXN20251115001", notes: "Forum inaugural contribution" },
  ];

  await db.insert(donationsTable).values(donationRows);

  // Update raised amounts per campaign
  for (const c of campaigns) {
    const campaignDonations = donationRows.filter(d => d.campaignId === c.id);
    const totalRaised = campaignDonations.reduce((sum, d) => sum + d.amount, 0);
    await db.update(fundraisingCampaignsTable)
      .set({ raisedAmount: totalRaised })
      .where(sql`id = ${c.id}`);
  }

  const totalDonations = donationRows.length;
  const totalRaised = donationRows.reduce((s, d) => s + d.amount, 0);
  console.log(`  ✓ ${campaigns.length} campaigns, ${totalDonations} donations, KES ${totalRaised.toLocaleString()} total`);

  // ── Donors ──────────────────────────────────────────────────────────────
  console.log("  Seeding donors...");
  const donors = await db.insert(donorsTable).values([
    { name: "Dr. Mutua Kioko", phone: "0722-001-001", email: "mutua.kioko@gmail.com", ward: null, type: "individual", tier: "major", totalGiven: 200000, notes: "Nairobi-based physician, loyal supporter since 2017", tags: "physician, diaspora-nairobi, major" },
    { name: "Eng. James Nzomo", phone: "0733-002-002", email: null, ward: null, type: "individual", tier: "major", totalGiven: 150000, notes: "Civil engineer, Nairobi. Full payment at dinner", tags: "engineer, business" },
    { name: "Hon. Patrick Mutiso", phone: "0722-003-003", email: null, ward: "Tala", type: "individual", tier: "major", totalGiven: 300000, notes: "Former councillor, strong political ally", tags: "politician, ally, tala" },
    { name: "Tala Hardware Ltd", phone: "0700-100-100", email: "info@talahardware.co.ke", ward: "Tala", type: "business", tier: "major", totalGiven: 100000, notes: "Largest hardware supplier in Tala", tags: "hardware, tala, business" },
    { name: "Makueni Farmers Coop", phone: "0700-200-200", email: "coop@makuenifarmers.co.ke", ward: "Makueni West", type: "organization", tier: "major", totalGiven: 150000, notes: "Cooperative annual pledge agreement", tags: "coop, farmers, makueni-west" },
    { name: "Makueni Quarry Owners", phone: "0700-300-300", email: null, ward: "Makueni East", type: "organization", tier: "major", totalGiven: 200000, notes: "Annual contribution from quarry consortium", tags: "quarry, consortium, makueni-east" },
    { name: "Bw. Wycliffe Njoroge", phone: "0711-004-004", email: null, ward: "Tala", type: "individual", tier: "regular", totalGiven: 80000, notes: "Petrol station owner, Tala town", tags: "business, tala" },
    { name: "Bw. Francis Kimeu", phone: "0722-005-005", email: null, ward: null, type: "individual", tier: "regular", totalGiven: 75000, notes: "Nairobi-based, recurring supporter", tags: "regular" },
    { name: "Mama Esther Mwangi", phone: "0713-006-006", email: null, ward: "Makueni North", type: "individual", tier: "regular", totalGiven: 50000, notes: "Community leader, women's group chair", tags: "women-leader, makueni-north" },
    { name: "Kyeleni Dairy Farmers", phone: "0700-400-400", email: null, ward: "Kyeleni", type: "organization", tier: "regular", totalGiven: 60000, notes: "Dairy farmers association", tags: "dairy, kyeleni" },
    { name: "Tala Market Association", phone: "0700-500-500", email: null, ward: "Tala", type: "organization", tier: "regular", totalGiven: 25000, notes: "Market traders collective", tags: "traders, tala, market" },
    { name: "John Mutua (UK)", phone: null, email: "john.mutua@gmail.com", ward: null, type: "diaspora", tier: "regular", totalGiven: 15000, notes: "London diaspora, GoFundMe contributor", tags: "diaspora, uk, online" },
    { name: "Grace Kioko (Canada)", phone: null, email: "grace.kioko@hotmail.com", ward: null, type: "diaspora", tier: "regular", totalGiven: 12000, notes: "Toronto diaspora", tags: "diaspora, canada, online" },
    { name: "Samuel Mwenda (US)", phone: null, email: "samuel.mwenda@yahoo.com", ward: null, type: "diaspora", tier: "regular", totalGiven: 20000, notes: "Washington DC area", tags: "diaspora, usa, online" },
    { name: "Makueni Business Forum", phone: "0700-600-600", email: null, ward: null, type: "organization", tier: "regular", totalGiven: 150000, notes: "Forum inaugural contribution", tags: "business-forum, inaugural" },
    { name: "Josephine Mutua", phone: "0712-007-007", email: null, ward: "Tala", type: "individual", tier: "grassroots", totalGiven: 5000, notes: "Monthly pledge contributor", tags: "grassroots, tala" },
    { name: "Bernard Mwangi", phone: "0713-008-008", email: null, ward: "Makueni North", type: "individual", tier: "grassroots", totalGiven: 3000, notes: null, tags: "grassroots" },
    { name: "Lucy Ndunda", phone: "0714-009-009", email: null, ward: "Makueni West", type: "individual", tier: "grassroots", totalGiven: 2000, notes: null, tags: "grassroots" },
    { name: "Edwin Kioko", phone: "0715-010-010", email: null, ward: "Makueni East", type: "individual", tier: "grassroots", totalGiven: 5000, notes: null, tags: "grassroots" },
    { name: "Veronica Musyoka", phone: "0716-011-011", email: null, ward: "Kyeleni", type: "individual", tier: "grassroots", totalGiven: 3000, notes: null, tags: "grassroots, kyeleni" },
  ]).returning();

  console.log(`  ✓ ${donors.length} donors seeded`);

  // ── Pledges ──────────────────────────────────────────────────────────────
  console.log("  Seeding pledges...");
  await db.insert(pledgesTable).values([
    { donorName: "Dr. Mutua Kioko", donorId: donors[0]!.id, campaignId: campaigns[0]!.id, amount: 300000, promisedDate: "2026-07-15", status: "pending", channel: "bank", notes: "Second instalment of Nairobi dinner pledge" },
    { donorName: "Eng. James Nzomo", donorId: donors[1]!.id, campaignId: campaigns[0]!.id, amount: 100000, promisedDate: "2026-07-30", status: "pending", channel: "bank", notes: "Balance after initial payment" },
    { donorName: "Hon. Patrick Mutiso", donorId: donors[2]!.id, campaignId: campaigns[2]!.id, amount: 200000, promisedDate: "2026-08-01", status: "pending", channel: "cheque", notes: "Second cheque — business levy contribution" },
    { donorName: "Makueni Farmers Coop", donorId: donors[4]!.id, campaignId: campaigns[2]!.id, amount: 200000, promisedDate: "2026-09-01", status: "pending", channel: "bank", notes: "Second annual cooperative pledge" },
    { donorName: "Tala Hardware Ltd", donorId: donors[3]!.id, campaignId: campaigns[2]!.id, amount: 150000, promisedDate: "2026-07-01", status: "fulfilled", channel: "bank", notes: "Paid in full", fulfilledDate: "2026-06-20" },
    { donorName: "Bw. Wycliffe Njoroge", donorId: donors[6]!.id, campaignId: campaigns[2]!.id, amount: 100000, promisedDate: "2026-08-15", status: "pending", channel: "cheque", notes: "Petrol station pledge — second cheque" },
    { donorName: "Makueni Quarry Owners", donorId: donors[5]!.id, campaignId: campaigns[2]!.id, amount: 300000, promisedDate: "2026-10-01", status: "pending", channel: "bank", notes: "Quarry consortium Q3 pledge" },
    { donorName: "John Mutua (UK)", donorId: donors[11]!.id, campaignId: campaigns[3]!.id, amount: 30000, promisedDate: "2026-07-10", status: "pending", channel: "online", notes: "GoFundMe next tranche" },
    { donorName: "Samuel Mwenda (US)", donorId: donors[13]!.id, campaignId: campaigns[3]!.id, amount: 50000, promisedDate: "2026-08-01", status: "pending", channel: "online", notes: "Washington DC fundraiser proceeds" },
    { donorName: "Mama Esther Mwangi", donorId: donors[8]!.id, campaignId: campaigns[1]!.id, amount: 50000, promisedDate: "2026-07-01", status: "fulfilled", channel: "mpesa", notes: "Women's group collection — fulfilled", fulfilledDate: "2026-06-22" },
    { donorName: "Kyeleni Dairy Farmers", donorId: donors[9]!.id, campaignId: campaigns[1]!.id, amount: 40000, promisedDate: "2026-09-15", status: "pending", channel: "mpesa", notes: "Dairy farmers pledge — harvest season" },
    { donorName: "Makueni Business Forum", donorId: donors[14]!.id, campaignId: campaigns[2]!.id, amount: 250000, promisedDate: "2026-06-30", status: "defaulted", channel: "bank", notes: "Forum failed to deliver — follow up required" },
  ]);

  console.log("  ✓ Pledges seeded");
}

async function seedElectionDay() {
  console.log("Seeding election day data...");

  const CANDIDATES = [
    { name: "Hon. Stephen Mule", party: "ODM" },
    { name: "Hon. Julius Malombe", party: "UDA" },
    { name: "George Mutisya Mwangi", party: "Independent" },
    { name: "Lucy Ndunda Muema", party: "Wiper" },
  ];

  const stationsByWard: Record<string, { code: string; name: string; voters: number; streams: number; agent: string; phone: string }[]> = {
    "Tala": [
      { code: "TAL-001", name: "Tala Primary School", voters: 820, streams: 2, agent: "James Mutua", phone: "0712-345-001" },
      { code: "TAL-002", name: "Tala Market Social Hall", voters: 640, streams: 2, agent: "Grace Mwikali", phone: "0712-345-002" },
      { code: "TAL-003", name: "Tala Township ECD Centre", voters: 510, streams: 1, agent: "Peter Musyoka", phone: "0712-345-003" },
      { code: "TAL-004", name: "St. Mary's Tala", voters: 730, streams: 2, agent: "Ann Ndunda", phone: "0712-345-004" },
    ],
    "Makueni North": [
      { code: "MTN-001", name: "Makueni North Primary", voters: 690, streams: 2, agent: "David Kioko", phone: "0712-345-010" },
      { code: "MTN-002", name: "Muumandu Primary School", voters: 580, streams: 1, agent: "Mary Muthiani", phone: "0712-345-011" },
      { code: "MTN-003", name: "Kaewa Primary School", voters: 610, streams: 2, agent: "John Mutisya", phone: "0712-345-012" },
      { code: "MTN-004", name: "Ndithini Social Hall", voters: 490, streams: 1, agent: "Susan Muema", phone: "0712-345-013" },
    ],
    "Makueni West": [
      { code: "MTW-001", name: "Makueni West Primary", voters: 770, streams: 2, agent: "Paul Malonza", phone: "0712-345-020" },
      { code: "MTW-002", name: "Kivaani Primary School", voters: 530, streams: 1, agent: "Ruth Ndavi", phone: "0712-345-021" },
      { code: "MTW-003", name: "Kyamumbi Community Hall", voters: 620, streams: 2, agent: "Charles Mutuku", phone: "0712-345-022" },
      { code: "MTW-004", name: "Ikombe Primary School", voters: 455, streams: 1, agent: "Esther Mwende", phone: "0712-345-023" },
    ],
    "Makueni East": [
      { code: "MTE-001", name: "Makueni East Primary", voters: 760, streams: 2, agent: "Thomas Muli", phone: "0712-345-030" },
      { code: "MTE-002", name: "Kathiani Community Hall", voters: 590, streams: 2, agent: "Janet Mutua", phone: "0712-345-031" },
      { code: "MTE-003", name: "Kithimani Primary School", voters: 680, streams: 2, agent: "Francis Kyalo", phone: "0712-345-032" },
      { code: "MTE-004", name: "Nguluini Social Hall", voters: 510, streams: 1, agent: "Alice Mwikali", phone: "0712-345-033" },
    ],
    "Kyeleni": [
      { code: "KYL-001", name: "Kyeleni Primary School", voters: 700, streams: 2, agent: "Simon Mutisya", phone: "0712-345-040" },
      { code: "KYL-002", name: "Kyeleni Market Hall", voters: 540, streams: 1, agent: "Josephine Mumo", phone: "0712-345-041" },
      { code: "KYL-003", name: "Yathui Primary School", voters: 630, streams: 2, agent: "Moses Mutuku", phone: "0712-345-042" },
      { code: "KYL-004", name: "Ikalaasa Community Hall", voters: 480, streams: 1, agent: "Priscilla Muema", phone: "0712-345-043" },
    ],
  };

  const insertedStations = [];
  for (const [ward, stations] of Object.entries(stationsByWard)) {
    for (const s of stations) {
      const [row] = await db.insert(pollingStationsTable).values({
        code: s.code, name: s.name, ward, registeredVoters: s.voters,
        streamCount: s.streams, agentName: s.agent, agentPhone: s.phone,
        status: "pending",
      }).returning();
      insertedStations.push(row!);
    }
  }

  // Submit results for 8 stations (2 per ward for 4 of 5 wards)
  const voteShares: Record<string, number[]> = {
    "Hon. Stephen Mule": [0.44, 0.47, 0.41, 0.49, 0.43, 0.46, 0.38, 0.45],
    "Hon. Julius Malombe": [0.28, 0.26, 0.31, 0.25, 0.29, 0.27, 0.34, 0.28],
    "George Mutisya Mwangi": [0.18, 0.16, 0.17, 0.15, 0.19, 0.17, 0.18, 0.17],
    "Lucy Ndunda Muema": [0.10, 0.11, 0.11, 0.11, 0.09, 0.10, 0.10, 0.10],
  };

  const submittedStations = insertedStations.filter((_, i) => i < 8);
  let idx = 0;
  for (const station of submittedStations) {
    const totalValid = Math.round(station.registeredVoters * 0.72);
    const rejected = Math.round(totalValid * 0.02);
    const validAfterReject = totalValid - rejected;

    for (const candidate of CANDIDATES) {
      const share = voteShares[candidate.name]?.[idx] ?? 0.25;
      const votes = Math.round(validAfterReject * share);
      const status = idx < 4 ? "verified" : "submitted";
      const submittedAt = new Date(Date.now() - (8 - idx) * 3600_000);
      const verifiedAt = status === "verified" ? new Date(submittedAt.getTime() + 1800_000) : null;
      await db.insert(tallyResultsTable).values({
        stationId: station.id,
        stationCode: station.code,
        candidateName: candidate.name,
        party: candidate.party,
        votes,
        totalValidVotes: validAfterReject,
        rejectedVotes: rejected,
        registeredVoters: station.registeredVoters,
        status,
        submittedBy: station.agentName,
        verifiedBy: status === "verified" ? "HQ Verification Team" : null,
        submittedAt,
        verifiedAt,
      });
    }
    await db.update(pollingStationsTable)
      .set({ status: idx < 4 ? "verified" : "submitted" })
      .where(sql`id = ${station.id}`);
    idx++;
  }

  await db.insert(electionEventsTable).values([
    { type: "milestone", title: "Polling Stations Open", description: "All 20 polling stations in Makueni opened on time at 06:00 hrs", ward: null, stationCode: null, priority: "normal", status: "resolved" },
    { type: "info", title: "High Turnout in Tala", description: "Queues observed at Tala Primary and Tala Market — estimated 85% turnout by 10:00 hrs", ward: "Tala", stationCode: "TAL-001", priority: "normal", status: "resolved" },
    { type: "alert", title: "Ballot Shortage MTN-002", description: "Muumandu Primary School reported 40 extra ballots needed — supply dispatched", ward: "Makueni North", stationCode: "MTN-002", priority: "high", status: "resolved" },
    { type: "incident", title: "Minor Scuffle at MTW-003", description: "Brief altercation outside Kyamumbi Community Hall — police intervened, polling resumed normally", ward: "Makueni West", stationCode: "MTW-003", priority: "high", status: "resolved" },
    { type: "milestone", title: "First Results Transmitted", description: "TAL-001 Tala Primary submitted first Form 34A via electronic transmission", ward: "Tala", stationCode: "TAL-001", priority: "normal", status: "resolved" },
    { type: "info", title: "Counting Ongoing — 5 Wards", description: "All stations in Tala, Makueni North processing results. 4 verified so far.", ward: null, stationCode: null, priority: "normal", status: "open" },
    { type: "alert", title: "Unsubmitted: 12 Stations", description: "12 polling stations yet to transmit results. Agents have been contacted.", ward: null, stationCode: null, priority: "high", status: "open" },
  ]);

  console.log(`  ✓ ${insertedStations.length} polling stations, ${submittedStations.length * CANDIDATES.length} tally results, 7 election events`);
}

async function main() {
  console.log("\n=== COMMANDCENTRE OS — SEED: HON. STEPHEN MULE, MATUNGULU ===\n");
  await clearAll();
  const members = await seedMembers();
  const segments = await seedSegments();
  await seedMessaging(segments);
  const volunteers = await seedVolunteers();
  await seedFieldOps(volunteers);
  await seedSurveys();
  await seedEvents();
  await seedIntelligence();
  await seedCampaignPlan();
  await seedKOL();
  await seedFundraising();
  await seedElectionDay();
  console.log("\n=== SEED COMPLETE ===\n");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
