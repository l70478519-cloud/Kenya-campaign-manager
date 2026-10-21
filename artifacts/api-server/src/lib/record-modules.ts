/**
 * KaitiOS feature-module registry.
 *
 * Each entry defines a full module: fields, validation, workflow statuses,
 * allowed transitions, RBAC module, and navigation placement. The generic
 * records API (routes/records.ts) and the generic React page
 * (pages/module-records.tsx) are both driven by this file, so adding a module
 * is a matter of adding an entry here.
 */

/** Ward fields accept the active campaign's wards (see campaignWards() in @workspace/db). */

export type FieldType =
  | "text" | "textarea" | "number" | "money" | "date" | "datetime"
  | "select" | "email" | "phone" | "url" | "ward" | "rating" | "boolean";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  help?: string;
  /** Show in the list view card. */
  list?: boolean;
  /** Personal data: masked for read-only roles and excluded from exports unless requested. */
  sensitive?: boolean;
  max?: number;
  min?: number;
}

export interface ModuleDef {
  key: string;
  title: string;
  /** Matches the campaignsmaster.com feature this module delivers. */
  feature: string;
  description: string;
  rbac: string;
  navGroup: string;
  icon: string;
  titleField: string;
  fields: FieldDef[];
  statuses: readonly string[];
  initialStatus: string;
  /** from -> allowed next statuses. Omitted = any status may follow. */
  transitions?: Record<string, readonly string[]>;
  /** Statuses the record's creator cannot set themselves (maker-checker). */
  separateApprover?: readonly string[];
  /** Statuses counted as "closed" for overdue / open counts. */
  closedStatuses: readonly string[];
  /** Field holding a due date, used for overdue tracking on the command centre. */
  dueField?: string;
  importable?: boolean;
}

export const RECORD_MODULES: ModuleDef[] = [
  // ── Campaign finance & resources ───────────────────────────────────────────
  {
    key: "budgets", title: "Budget Lines", feature: "Campaign Finance and Resource Management",
    description: "Allocate budget by department, activity and ward. Actual spend is computed from approved and paid expense requests.",
    rbac: "finance", navGroup: "FINANCE & RESOURCES", icon: "PiggyBank", titleField: "line",
    fields: [
      { key: "line", label: "Budget line", type: "text", required: true, list: true, max: 160 },
      { key: "department", label: "Department", type: "select", required: true, list: true, options: ["Field", "Communications", "Events", "Transport", "Logistics", "Media", "Administration", "Election Day", "Other"] },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "allocated", label: "Allocated (KES)", type: "money", required: true, list: true, min: 0 },
      { key: "period", label: "Period", type: "text", max: 60, help: "e.g. Q1 2027 or Nomination phase" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    statuses: ["draft", "active", "frozen", "closed"], initialStatus: "draft",
    closedStatuses: ["closed"], importable: true,
  },
  {
    key: "expenses", title: "Expense Requests", feature: "Campaign Finance and Resource Management",
    description: "Request, approve and record campaign spending with receipts. The person who raises a request cannot approve it.",
    rbac: "finance", navGroup: "FINANCE & RESOURCES", icon: "Receipt", titleField: "purpose",
    fields: [
      { key: "purpose", label: "Purpose", type: "text", required: true, list: true, max: 200 },
      { key: "budgetLine", label: "Budget line", type: "text", list: true, help: "Must match a budget line name for budget-vs-actual" },
      { key: "department", label: "Department", type: "select", required: true, list: true, options: ["Field", "Communications", "Events", "Transport", "Logistics", "Media", "Administration", "Election Day", "Other"] },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "amount", label: "Amount (KES)", type: "money", required: true, list: true, min: 0 },
      { key: "supplier", label: "Supplier / payee", type: "text", list: true, max: 160 },
      { key: "activityType", label: "Activity type", type: "select", options: ["Event", "Field visit", "Media", "Transport", "Materials", "Staff", "Other"] },
      { key: "receiptRef", label: "Receipt / M-Pesa reference", type: "text", max: 80 },
      { key: "neededBy", label: "Needed by", type: "date" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    statuses: ["requested", "approved", "rejected", "paid", "reconciled"], initialStatus: "requested",
    transitions: { requested: ["approved", "rejected"], approved: ["paid", "rejected"], paid: ["reconciled"], rejected: [], reconciled: [] },
    separateApprover: ["approved", "rejected"],
    closedStatuses: ["rejected", "paid", "reconciled"], dueField: "neededBy", importable: true,
  },
  {
    key: "suppliers", title: "Supplier Register", feature: "Campaign Finance and Resource Management",
    description: "Approved suppliers with contacts, categories and payment details reference.",
    rbac: "finance", navGroup: "FINANCE & RESOURCES", icon: "Truck", titleField: "name",
    fields: [
      { key: "name", label: "Supplier name", type: "text", required: true, list: true, max: 160 },
      { key: "category", label: "Category", type: "select", list: true, options: ["Transport", "Printing", "Sound & stage", "Catering", "Media", "Security", "Venue", "Other"] },
      { key: "contactPerson", label: "Contact person", type: "text", max: 120 },
      { key: "phone", label: "Phone", type: "phone", list: true, sensitive: true },
      { key: "email", label: "Email", type: "email", sensitive: true },
      { key: "kraPin", label: "KRA PIN", type: "text", max: 20, sensitive: true },
      { key: "rating", label: "Performance rating", type: "rating" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    statuses: ["pending", "approved", "suspended"], initialStatus: "pending",
    separateApprover: ["approved"], closedStatuses: ["suspended"], importable: true,
  },

  // ── Political CRM & stakeholders ───────────────────────────────────────────
  {
    key: "stakeholders", title: "Political CRM & Stakeholders", feature: "Political CRM & Stakeholders",
    description: "Politicians, journalists, influencers, community leaders and allied organisations, with outreach readiness and next actions.",
    rbac: "kol", navGroup: "OUTREACH & MESSAGING", icon: "Handshake", titleField: "name",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, list: true, max: 160 },
      { key: "category", label: "Category", type: "select", required: true, list: true, options: ["Politician", "Journalist", "Influencer", "Community leader", "Religious leader", "Business leader", "Organisation", "Other"] },
      { key: "organisation", label: "Organisation / title", type: "text", list: true, max: 160 },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "phone", label: "Phone", type: "phone", sensitive: true },
      { key: "email", label: "Email", type: "email", sensitive: true },
      { key: "warmth", label: "Outreach readiness", type: "rating", list: true, help: "1 = cold, 5 = ready for direct engagement" },
      { key: "alignment", label: "Alignment", type: "select", list: true, options: ["Supporter", "Leaning", "Neutral", "Opposed", "Unknown"] },
      { key: "nextAction", label: "Next action", type: "text", max: 200 },
      { key: "nextActionDue", label: "Next action due", type: "date", list: true },
      { key: "owner", label: "Relationship owner", type: "text", max: 120 },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    statuses: ["identified", "contacted", "engaged", "committed", "dormant"], initialStatus: "identified",
    closedStatuses: ["dormant"], dueField: "nextActionDue", importable: true,
  },
  {
    key: "content-calendar", title: "Content Calendar & Approvals", feature: "Communications and Digital Media Studio",
    description: "Plan posts, press statements and media briefings across channels, with a review-and-approve workflow before publishing.",
    rbac: "messaging", navGroup: "OUTREACH & MESSAGING", icon: "CalendarClock", titleField: "headline",
    fields: [
      { key: "headline", label: "Headline / working title", type: "text", required: true, list: true, max: 200 },
      { key: "channel", label: "Channel", type: "select", required: true, list: true, options: ["Facebook", "X / Twitter", "Instagram", "TikTok", "WhatsApp", "SMS", "Radio", "Press release", "Media briefing", "Website"] },
      { key: "contentType", label: "Type", type: "select", options: ["Post", "Video", "Graphic", "Press statement", "Speech", "Rebuttal", "Event promo"] },
      { key: "publishAt", label: "Scheduled for", type: "datetime", list: true },
      { key: "ward", label: "Target ward", type: "ward", list: true },
      { key: "body", label: "Draft copy", type: "textarea", required: true },
      { key: "assetLink", label: "Creative asset link", type: "url" },
      { key: "owner", label: "Owner", type: "text", max: 120 },
    ],
    statuses: ["draft", "in_review", "approved", "published", "rejected"], initialStatus: "draft",
    transitions: { draft: ["in_review"], in_review: ["approved", "rejected", "draft"], approved: ["published", "draft"], rejected: ["draft"], published: [] },
    separateApprover: ["approved"], closedStatuses: ["published", "rejected"], dueField: "publishAt",
  },
  {
    key: "facts", title: "Verified Facts Library", feature: "Media Monitoring and Rapid Response",
    description: "Approved facts with sources, used to prepare rapid responses. Every fact needs a source and a verifier.",
    rbac: "narrative", navGroup: "INTELLIGENCE", icon: "BookCheck", titleField: "topic",
    fields: [
      { key: "topic", label: "Topic", type: "text", required: true, list: true, max: 160 },
      { key: "claim", label: "Claim / question being addressed", type: "textarea", list: true },
      { key: "fact", label: "Verified fact", type: "textarea", required: true },
      { key: "sourceUrl", label: "Source link", type: "url", required: true },
      { key: "sourceName", label: "Source name", type: "text", list: true, max: 160 },
      { key: "verifiedOn", label: "Verified on", type: "date", list: true },
      { key: "expiresOn", label: "Review by", type: "date" },
    ],
    statuses: ["draft", "verified", "outdated"], initialStatus: "draft",
    separateApprover: ["verified"], closedStatuses: ["outdated"], dueField: "expiresOn",
  },
  {
    key: "rapid-response", title: "Rapid Response Desk", feature: "Media Monitoring and Rapid Response",
    description: "Track emerging issues and prepare response drafts for human approval, with escalation for urgent items.",
    rbac: "narrative", navGroup: "INTELLIGENCE", icon: "Siren", titleField: "issue",
    fields: [
      { key: "issue", label: "Issue / development", type: "text", required: true, list: true, max: 200 },
      { key: "sourceUrl", label: "Where it appeared", type: "url" },
      { key: "severity", label: "Severity", type: "select", required: true, list: true, options: ["low", "medium", "high", "critical"] },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "draftResponse", label: "Draft response", type: "textarea" },
      { key: "factIds", label: "Supporting fact IDs", type: "text", help: "Comma-separated IDs from the Verified Facts Library" },
      { key: "respondBy", label: "Respond by", type: "datetime", list: true },
      { key: "owner", label: "Owner", type: "text", max: 120 },
    ],
    statuses: ["new", "drafting", "awaiting_approval", "approved", "published", "escalated", "closed"], initialStatus: "new",
    separateApprover: ["approved"], closedStatuses: ["published", "closed"], dueField: "respondBy",
  },

  // ── Candidate & party ──────────────────────────────────────────────────────
  {
    key: "nominations", title: "Nominations Management", feature: "Nominations Management",
    description: "Multi-phase nominations from application and vetting to ballot, disputes and official handover.",
    rbac: "credentials", navGroup: "CANDIDATE & PARTY", icon: "FileSignature", titleField: "aspirant",
    fields: [
      { key: "aspirant", label: "Aspirant", type: "text", required: true, list: true, max: 160 },
      { key: "seat", label: "Seat", type: "select", required: true, list: true, options: ["MP", "MCA", "Governor", "Senator", "Woman Rep", "Other"] },
      { key: "ward", label: "Ward (for MCA)", type: "ward", list: true },
      { key: "party", label: "Party", type: "text", list: true, max: 120 },
      { key: "phone", label: "Phone", type: "phone", sensitive: true },
      { key: "vettingChecklist", label: "Vetting checklist notes", type: "textarea", help: "Documents received, clearances, fees" },
      { key: "ballotResult", label: "Ballot result / votes", type: "text", max: 120 },
      { key: "disputeNotes", label: "Dispute / appeal notes", type: "textarea" },
      { key: "certificateRef", label: "Certificate reference", type: "text", max: 80 },
      { key: "phaseDeadline", label: "Current phase deadline", type: "date", list: true },
    ],
    statuses: ["application", "vetting", "cleared", "disqualified", "ballot", "nominated", "lost", "dispute", "handover_complete"],
    initialStatus: "application",
    transitions: {
      application: ["vetting", "disqualified"], vetting: ["cleared", "disqualified"], cleared: ["ballot"],
      ballot: ["nominated", "lost", "dispute"], dispute: ["nominated", "lost"], nominated: ["handover_complete"],
      disqualified: ["dispute"], lost: ["dispute"], handover_complete: [],
    },
    separateApprover: ["cleared", "disqualified", "nominated"],
    closedStatuses: ["handover_complete", "lost", "disqualified"], dueField: "phaseDeadline",
  },

  // ── Data intelligence ──────────────────────────────────────────────────────
  {
    key: "election-history", title: "Historical Election Results", feature: "Historical election analysis",
    description: "Import and validate past official results by year, seat, ward and polling station. Only enter figures from official published sources.",
    rbac: "intelligence", navGroup: "DATA INTELLIGENCE", icon: "History", titleField: "candidate",
    fields: [
      { key: "year", label: "Election year", type: "number", required: true, list: true, min: 1992, max: 2100 },
      { key: "seat", label: "Seat", type: "select", required: true, list: true, options: ["MP", "MCA", "Governor", "Senator", "Woman Rep", "President"] },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "pollingStation", label: "Polling station", type: "text", list: true, max: 160 },
      { key: "candidate", label: "Candidate", type: "text", required: true, list: true, max: 160 },
      { key: "party", label: "Party", type: "text", list: true, max: 80 },
      { key: "votes", label: "Votes", type: "number", required: true, list: true, min: 0 },
      { key: "registeredVoters", label: "Registered voters", type: "number", min: 0 },
      { key: "source", label: "Official source (form / gazette / URL)", type: "text", required: true, max: 300 },
    ],
    statuses: ["provisional", "verified"], initialStatus: "provisional",
    separateApprover: ["verified"], closedStatuses: [], importable: true,
  },
  {
    key: "kpis", title: "Performance Indicators", feature: "Configurable performance indicators",
    description: "Define campaign KPIs with targets by ward, and track progress against them.",
    rbac: "dashboard", navGroup: "DATA INTELLIGENCE", icon: "Gauge", titleField: "name",
    fields: [
      { key: "name", label: "Indicator", type: "text", required: true, list: true, max: 160 },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "target", label: "Target", type: "number", required: true, list: true },
      { key: "current", label: "Current value", type: "number", required: true, list: true },
      { key: "unit", label: "Unit", type: "text", list: true, max: 40, help: "e.g. doors, volunteers, %" },
      { key: "deadline", label: "Target date", type: "date", list: true },
      { key: "owner", label: "Owner", type: "text", max: 120 },
    ],
    statuses: ["on_track", "at_risk", "off_track", "achieved"], initialStatus: "on_track",
    closedStatuses: ["achieved"], dueField: "deadline", importable: true,
  },

  // ── Volunteers & organisation ──────────────────────────────────────────────
  {
    key: "org-structure", title: "Organisation Structure", feature: "Volunteer and Organisation Management",
    description: "The campaign hierarchy from HQ to ward and polling-station teams, with responsibilities.",
    rbac: "volunteers", navGroup: "FIELD OPERATIONS", icon: "Network", titleField: "position",
    fields: [
      { key: "position", label: "Position", type: "text", required: true, list: true, max: 160 },
      { key: "holder", label: "Holder", type: "text", list: true, max: 160 },
      { key: "level", label: "Level", type: "select", required: true, list: true, options: ["HQ", "Constituency", "Ward", "Polling station", "Village"] },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "reportsTo", label: "Reports to (position)", type: "text", max: 160 },
      { key: "phone", label: "Phone", type: "phone", sensitive: true },
      { key: "responsibilities", label: "Responsibilities", type: "textarea" },
    ],
    statuses: ["vacant", "filled", "acting"], initialStatus: "vacant", closedStatuses: [], importable: true,
  },
  {
    key: "trainings", title: "Training & Shifts", feature: "Volunteer and Organisation Management",
    description: "Training sessions, attendance and deployment shifts for volunteers and agents.",
    rbac: "volunteers", navGroup: "FIELD OPERATIONS", icon: "GraduationCap", titleField: "session",
    fields: [
      { key: "session", label: "Session / shift", type: "text", required: true, list: true, max: 160 },
      { key: "kind", label: "Type", type: "select", required: true, list: true, options: ["Training", "Shift", "Deployment"] },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "startsAt", label: "Starts", type: "datetime", list: true },
      { key: "facilitator", label: "Facilitator / supervisor", type: "text", max: 120 },
      { key: "expected", label: "Expected attendees", type: "number", min: 0, list: true },
      { key: "attended", label: "Attended", type: "number", min: 0, list: true },
      { key: "notes", label: "Notes / attendee list reference", type: "textarea" },
    ],
    statuses: ["planned", "completed", "cancelled"], initialStatus: "planned",
    closedStatuses: ["completed", "cancelled"], dueField: "startsAt",
  },

  // ── Events & planning ──────────────────────────────────────────────────────
  {
    key: "strategic-events", title: "Strategic Events & Itinerary", feature: "Strategic Events / Campaign Planning and Itinerary",
    description: "Operational briefs for high-stakes events and the candidate's itinerary: venue, logistics, security, travel and debrief.",
    rbac: "events", navGroup: "OUTREACH & MESSAGING", icon: "Briefcase", titleField: "name",
    fields: [
      { key: "name", label: "Event", type: "text", required: true, list: true, max: 200 },
      { key: "startsAt", label: "Starts", type: "datetime", required: true, list: true },
      { key: "endsAt", label: "Ends", type: "datetime" },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "venue", label: "Venue", type: "text", list: true, max: 200 },
      { key: "travelFrom", label: "Travelling from", type: "text", max: 160 },
      { key: "travelMinutes", label: "Est. travel time (min)", type: "number", min: 0 },
      { key: "vehicle", label: "Vehicle", type: "text", max: 80 },
      { key: "logistics", label: "Logistics", type: "textarea" },
      { key: "security", label: "Security plan", type: "textarea" },
      { key: "stakeholders", label: "Stakeholders attending / speaking", type: "textarea" },
      { key: "risks", label: "Risks & contingencies", type: "textarea" },
      { key: "debrief", label: "Debrief & action items", type: "textarea" },
    ],
    statuses: ["planning", "confirmed", "completed", "cancelled"], initialStatus: "planning",
    closedStatuses: ["completed", "cancelled"], dueField: "startsAt",
  },

  // ── Election day ───────────────────────────────────────────────────────────
  {
    key: "station-readiness", title: "Polling Station Readiness", feature: "Election-Day Operations and Results Tracking",
    description: "Readiness checklist per polling station: agents, transport, materials and escalation contacts.",
    rbac: "election-day", navGroup: "ELECTION DAY", icon: "ListChecks", titleField: "station",
    fields: [
      { key: "station", label: "Polling station", type: "text", required: true, list: true, max: 160 },
      { key: "ward", label: "Ward", type: "ward", required: true, list: true },
      { key: "chiefAgent", label: "Chief agent", type: "text", list: true, max: 120 },
      { key: "agentPhone", label: "Agent phone", type: "phone", sensitive: true },
      { key: "agentsAssigned", label: "Agents assigned", type: "number", min: 0, list: true },
      { key: "agentsTrained", label: "Agents trained", type: "boolean" },
      { key: "transportArranged", label: "Transport arranged", type: "boolean" },
      { key: "materialsDelivered", label: "Materials delivered", type: "boolean" },
      { key: "escalationContact", label: "Escalation contact", type: "text", max: 160 },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    statuses: ["not_ready", "partially_ready", "ready"], initialStatus: "not_ready",
    closedStatuses: ["ready"], importable: true,
  },
  {
    key: "election-incidents", title: "Election-Day Incidents", feature: "Election-Day Operations and Results Tracking",
    description: "Log incidents at polling stations and track escalation to resolution. Report factually; do not include unverified allegations about individuals.",
    rbac: "election-day", navGroup: "ELECTION DAY", icon: "AlertTriangle", titleField: "summary",
    fields: [
      { key: "summary", label: "Summary", type: "text", required: true, list: true, max: 200 },
      { key: "station", label: "Polling station", type: "text", list: true, max: 160 },
      { key: "ward", label: "Ward", type: "ward", list: true },
      { key: "category", label: "Category", type: "select", required: true, list: true, options: ["Logistics", "Agent access", "Equipment / KIEMS", "Security", "Procedure", "Results transmission", "Other"] },
      { key: "severity", label: "Severity", type: "select", required: true, list: true, options: ["low", "medium", "high", "critical"] },
      { key: "reportedBy", label: "Reported by", type: "text", max: 120 },
      { key: "details", label: "Details", type: "textarea" },
      { key: "escalatedTo", label: "Escalated to", type: "text", max: 160 },
      { key: "resolution", label: "Resolution", type: "textarea" },
    ],
    statuses: ["reported", "escalated", "resolved", "closed"], initialStatus: "reported",
    closedStatuses: ["resolved", "closed"],
  },

  // ── Governance ─────────────────────────────────────────────────────────────
  {
    key: "data-rights", title: "Data Rights Requests", feature: "Data Rights & Compliance",
    description: "Subject access, correction and erasure requests from supporters, tracked to their statutory deadline. Confirm deadlines with your Data Protection Officer.",
    rbac: "admin", navGroup: "ADMINISTRATION", icon: "ShieldCheck", titleField: "subjectName",
    fields: [
      { key: "subjectName", label: "Data subject", type: "text", required: true, list: true, max: 160, sensitive: true },
      { key: "requestType", label: "Request type", type: "select", required: true, list: true, options: ["Access", "Correction", "Erasure", "Objection / opt-out", "Portability"] },
      { key: "contact", label: "Contact (phone / email)", type: "text", max: 160, sensitive: true },
      { key: "receivedOn", label: "Received on", type: "date", required: true, list: true },
      { key: "dueOn", label: "Respond by", type: "date", list: true, help: "Defaults to 7 days after receipt if left blank" },
      { key: "identityVerified", label: "Identity verified", type: "boolean" },
      { key: "systemsChecked", label: "Systems / records checked", type: "textarea" },
      { key: "outcome", label: "Outcome", type: "textarea" },
    ],
    statuses: ["received", "verifying", "in_progress", "fulfilled", "refused"], initialStatus: "received",
    separateApprover: ["fulfilled", "refused"], closedStatuses: ["fulfilled", "refused"], dueField: "dueOn",
  },
];

export const MODULE_BY_KEY = new Map(RECORD_MODULES.map(m => [m.key, m]));
