import { Link } from "wouter";
import { LayoutGrid } from "lucide-react";
import { useAuth } from "@/lib/auth";

type State = "live" | "new" | "partial" | "planned";
type Item = { name: string; summary: string; state: State; links: { href: string; label: string; perm: string }[]; gap?: string };

// Mirrors the Command Centre OS feature list (campaignsmaster.com/features), plus the
// Operations additions. "partial" and "planned" are stated plainly so nobody relies on a
// capability that isn't built yet.
const PLATFORM: Item[] = [
  { name: "Members & Identity Graph", summary: "Supporter database, households, history of every contact.", state: "live", links: [{ href: "/members", label: "Voters", perm: "voters" }, { href: "/voters-db", label: "Constituent database", perm: "constituents" }] },
  { name: "Audience Segmentation", summary: "Target by ward, age, event attendance and canvass outcome.", state: "live", links: [{ href: "/segments", label: "Segmentation", perm: "segmentation" }] },
  { name: "Multi-Channel Messaging", summary: "SMS through Onfon, Twilio and Africa's Talking with delivery reports.", state: "live", links: [{ href: "/messaging", label: "Messaging", perm: "messaging" }] },
  { name: "Field Operations", summary: "Canvass sessions, door outcomes and ward coverage.", state: "partial", gap: "Offline capture with later sync is in the next batch.", links: [{ href: "/field-ops", label: "Field operations", perm: "field-ops" }] },
  { name: "Events & Check-in", summary: "Rallies and meetings with registration and attendance.", state: "live", links: [{ href: "/events", label: "Event logistics", perm: "events" }] },
  { name: "Intelligence Dashboards", summary: "Growth, engagement, field coverage and sentiment.", state: "live", links: [{ href: "/analytics", label: "Analytics hub", perm: "dashboard" }] },
  { name: "Narrative Command Centre", summary: "Mention monitoring, threat scoring and KOL tracking.", state: "live", links: [{ href: "/intelligence", label: "Political intelligence", perm: "narrative" }, { href: "/social-listening", label: "Social listening", perm: "intelligence" }, { href: "/kol", label: "KOL network", perm: "kol" }] },
  { name: "AI-Powered Tools", summary: "AI strategist, speech and manifesto drafting, poll summaries.", state: "live", links: [{ href: "/strategist", label: "AI chief strategist", perm: "dashboard" }, { href: "/speeches", label: "Speech & manifesto", perm: "messaging" }] },
  { name: "Security & Governance", summary: "Enforced role permissions, two-factor sign-in, audit trail, logged exports, API failure monitoring.", state: "partial", gap: "Field-level encryption of personal data is still to come.", links: [{ href: "/security", label: "Account security", perm: "dashboard" }, { href: "/system-health", label: "System health & audit", perm: "admin" }, { href: "/admin", label: "System admin", perm: "admin" }] },
  { name: "Campaign Intelligence Platform", summary: "SWOT, opponent tracking and war-room briefs.", state: "live", links: [{ href: "/swot", label: "SWOT analysis", perm: "intelligence" }] },
  { name: "Multi-Tenant Architecture", summary: "Organisations and campaigns on one platform, with members and a campaign switcher.", state: "partial", gap: "New modules and the Command Centre are separated per campaign. Older modules (voters, messaging, field ops…) still serve the primary campaign only and are hidden elsewhere.", links: [{ href: "/tenancy", label: "Organisations & campaigns", perm: "admin" }] },
  { name: "Campaign Plan & Readiness", summary: "Countdown, milestones and readiness scoring.", state: "live", links: [{ href: "/campaign-plan", label: "Campaign countdown", perm: "campaign-plan" }] },
  { name: "Fundraising & Payments", summary: "Donations and pledges with M-Pesa STK push.", state: "live", links: [{ href: "/fundraising", label: "Pledges & fundraising", perm: "finance" }] },
  { name: "Email Marketing", summary: "Email campaigns through your own SMTP sender.", state: "partial", gap: "Email sends through Messaging; template library and send-time tools are not built yet.", links: [{ href: "/messaging", label: "Messaging", perm: "messaging" }] },
  { name: "Political CRM & Stakeholders", summary: "Politicians, journalists, leaders and organisations with outreach readiness.", state: "new", links: [{ href: "/m/stakeholders", label: "Stakeholders", perm: "kol" }] },
  { name: "Strategic Events", summary: "Operational briefs, itinerary, security and debriefs.", state: "new", links: [{ href: "/m/strategic-events", label: "Strategic events & itinerary", perm: "events" }] },
  { name: "Nominations Management", summary: "Application, vetting, ballot, disputes and handover.", state: "new", links: [{ href: "/m/nominations", label: "Nominations", perm: "credentials" }] },
  { name: "Election Day Command", summary: "War room, tallies, station readiness and incidents.", state: "live", links: [{ href: "/election-day", label: "Election day ops", perm: "election-day" }, { href: "/m/station-readiness", label: "Station readiness", perm: "election-day" }, { href: "/m/election-incidents", label: "Incidents", perm: "election-day" }] },
  { name: "Credentials Hub", summary: "Candidate qualifications, endorsements and evidence.", state: "live", links: [{ href: "/credentials", label: "Credentials hub", perm: "credentials" }] },
  { name: "Voter Roll Enrichment", summary: "Registry import and de-duplication with review.", state: "partial", gap: "Confidence-scored matching queue is not built yet.", links: [{ href: "/voters-db", label: "Constituent database", perm: "constituents" }] },
  { name: "Data Rights & Compliance", summary: "Access, correction and erasure requests tracked to deadline.", state: "new", links: [{ href: "/m/data-rights", label: "Data rights requests", perm: "admin" }] },
  { name: "WhatsApp Campaigns", summary: "Consent-gated WhatsApp sends via Meta Cloud API.", state: "partial", gap: "Provider settings exist; template approval tracking and two-way threads are not built yet.", links: [{ href: "/messaging", label: "Messaging", perm: "messaging" }] },
  { name: "Manifesto Builder", summary: "AI-drafted manifesto by pillar, saved to a library.", state: "live", links: [{ href: "/speeches", label: "Speech & manifesto", perm: "messaging" }] },
];

const ADDITIONS: Item[] = [
  { name: "Executive Command Centre", summary: "Decisions waiting, overdue work, budget use and the next 14 days.", state: "new", links: [{ href: "/command-centre", label: "Open", perm: "dashboard" }] },
  { name: "Campaign Finance & Resources", summary: "Budget lines, expense approvals with maker-checker, supplier register, budget vs actual.", state: "new", links: [{ href: "/m/budgets", label: "Budgets", perm: "finance" }, { href: "/m/expenses", label: "Expenses", perm: "finance" }, { href: "/m/suppliers", label: "Suppliers", perm: "finance" }] },
  { name: "Communications Studio", summary: "Content calendar with review and approval before publishing.", state: "new", gap: "Direct posting to Facebook is not connected yet.", links: [{ href: "/m/content-calendar", label: "Content calendar", perm: "messaging" }] },
  { name: "Media Monitoring & Rapid Response", summary: "Verified facts library and an approval-gated response desk.", state: "new", links: [{ href: "/m/facts", label: "Verified facts", perm: "narrative" }, { href: "/m/rapid-response", label: "Rapid response", perm: "narrative" }] },
  { name: "Data Intelligence", summary: "Historical results import with validation, configurable KPIs, data-quality checks on every module.", state: "new", links: [{ href: "/m/election-history", label: "Historical results", perm: "intelligence" }, { href: "/m/kpis", label: "Performance indicators", perm: "dashboard" }] },
  { name: "Volunteer & Organisation Management", summary: "Hierarchy from HQ to polling station, training and shifts.", state: "new", links: [{ href: "/m/org-structure", label: "Organisation", perm: "volunteers" }, { href: "/m/trainings", label: "Training & shifts", perm: "volunteers" }, { href: "/volunteers", label: "Volunteer command", perm: "volunteers" }] },
  { name: "GIS Electoral Map", summary: "Wards and polling stations on a map with coverage and travel planning.", state: "planned", gap: "Needs verified polling-station coordinates before it can be built honestly.", links: [] },
];

const badge: Record<State, string> = { live: "Live", new: "New", partial: "Partial", planned: "Planned" };
const badgeCls: Record<State, string> = {
  live: "border-green-500/50 text-green-200", new: "border-primary text-primary",
  partial: "border-amber-500/50 text-amber-200", planned: "border-border text-muted-foreground",
};

function Grid({ items }: { items: Item[] }) {
  const { can } = useAuth();
  return <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{items.map(i => <li key={i.name} className="kaiti-glass rounded-2xl p-4 flex flex-col gap-2">
    <div className="flex justify-between gap-2 items-start"><h3 className="font-semibold">{i.name}</h3><span className={`text-xs border rounded-full px-2 py-0.5 shrink-0 ${badgeCls[i.state]}`}>{badge[i.state]}</span></div>
    <p className="text-sm text-muted-foreground">{i.summary}</p>
    {i.gap && <p className="text-xs text-amber-200/90">{i.gap}</p>}
    {i.links.length > 0 && <div className="flex flex-wrap gap-2 mt-auto pt-1">{i.links.map(l => can(l.perm)
      ? <Link key={l.href} href={l.href} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-background/40">{l.label}</Link>
      : <span key={l.href} className="text-xs border border-border/50 rounded-lg px-2 py-1 text-muted-foreground" title="Your role doesn’t include this module">{l.label}</span>)}</div>}
  </li>)}</ul>;
}

export default function FeatureCatalogue() {
  const count = (s: State) => [...PLATFORM, ...ADDITIONS].filter(i => i.state === s).length;
  return <div className="space-y-6 min-w-0">
    <header><h1 className="text-2xl font-bold flex items-center gap-2"><LayoutGrid className="text-primary" size={24} /> All features</h1>
      <p className="text-sm text-muted-foreground max-w-3xl">Every module and where to find it. {count("live") + count("new")} available, {count("partial")} partly built, {count("planned")} planned.</p></header>
    <section><h2 className="font-semibold mb-3">Command Centre OS platform (23 modules)</h2><Grid items={PLATFORM} /></section>
    <section><h2 className="font-semibold mb-3">Operations additions</h2><Grid items={ADDITIONS} /></section>
  </div>;
}
