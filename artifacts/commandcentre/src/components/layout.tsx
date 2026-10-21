import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { AiAssistPanel } from "@/components/ai-assist-panel";
import { useAuth } from "@/lib/auth";
import { useRecordModules } from "@/pages/module-records";
import { iconFor } from "@/lib/records";
import { useTenancy, switchCampaign, LEGACY_HREFS, legacyHidden } from "@/lib/tenancy";
import { CAMPAIGN } from "@/lib/wards";
import { 
  Menu, X, Activity, Users, PieChart, MessageSquare, 
  Map, UserPlus, FileText, Calendar, 
  ShieldAlert, Target, Star, Shield, LayoutDashboard, LogOut, Banknote, Vote, Database, Award, Settings, BarChart2, Crosshair, Radio, TrendingUp, Mic, BrainCircuit, ClipboardList, Crown, LayoutGrid, ServerCog, Building2, KeyRound
} from "lucide-react";


const navGroups = [
  {
    title: "COMMAND",
    items: [
      { href: "/command-centre", label: "EXECUTIVE COMMAND CENTRE", icon: Crown },
      { href: "/dashboard", label: "COMMAND OVERVIEW", icon: LayoutDashboard },
      { href: "/strategist", label: "AI CHIEF STRATEGIST", icon: BrainCircuit },
      { href: "/analytics", label: "ANALYTICS HUB", icon: BarChart2 },
      { href: "/campaign-plan", label: "CAMPAIGN COUNTDOWN", icon: Target },
    ],
  },
  {
    title: "VOTER DATA",
    items: [
      { href: "/members", label: "VOTERS", icon: Users },
      { href: "/voters-db", label: "CONSTITUENT DATABASE", icon: Database },
      { href: "/segments", label: "SEGMENTATION", icon: PieChart },
    ],
  },
  {
    title: "OUTREACH & MESSAGING",
    items: [
      { href: "/messaging", label: "MESSAGING", icon: MessageSquare },
      { href: "/speeches", label: "SPEECH & MANIFESTO", icon: Mic },
      { href: "/events", label: "EVENT LOGISTICS", icon: Calendar },
      { href: "/operations", label: "TASKS · APPROVALS · INCIDENTS", icon: ClipboardList },
      { href: "/kol", label: "KOL INFLUENCE NETWORK", icon: Star },
    ],
  },
  {
    title: "FIELD OPERATIONS",
    items: [
      { href: "/field-ops", label: "FIELD OPERATIONS", icon: Map },
      { href: "/volunteers", label: "VOLUNTEER COMMAND", icon: UserPlus },
    ],
  },
  {
    title: "INTELLIGENCE",
    items: [
      { href: "/surveys", label: "OPINION POLLS & SURVEYS", icon: FileText },
      { href: "/intelligence", label: "POLITICAL INTELLIGENCE", icon: ShieldAlert },
      { href: "/narrative-response", label: "NARRATIVE RESPONSE CENTRE", icon: MessageSquare },
      { href: "/social-listening", label: "POLITICAL SOCIAL LISTENING", icon: Radio },
      { href: "/swot", label: "SWOT ANALYSIS", icon: Crosshair },
    ],
  },
  {
    title: "ELECTION DAY",
    items: [
      { href: "/election-day", label: "ELECTION DAY OPS", icon: Vote },
      { href: "/turnout", label: "TURNOUT FORECAST", icon: TrendingUp },
    ],
  },
  {
    title: "ADMINISTRATION",
    items: [
      { href: "/fundraising", label: "PLEDGES & FUNDRAISING", icon: Banknote },
      { href: "/credentials", label: "CREDENTIALS HUB", icon: Award },
      { href: "/admin", label: "SYSTEM ADMIN", icon: Settings },
      { href: "/system-health", label: "SYSTEM HEALTH & AUDIT", icon: ServerCog },
      { href: "/tenancy", label: "ORGANISATIONS & CAMPAIGNS", icon: Building2 },
      { href: "/security", label: "ACCOUNT SECURITY", icon: KeyRound },
      { href: "/features", label: "ALL FEATURES", icon: LayoutGrid },
    ],
  },
];

// Maps a nav href to its backend permission module key (see admin MODULES list).
const NAV_PERM: Record<string, string> = {
  "/dashboard": "dashboard",
  "/strategist": "dashboard",
  "/members": "voters",
  "/voters-db": "constituents",
  "/segments": "segmentation",
  "/messaging": "messaging",
  "/field-ops": "field-ops",
  "/volunteers": "volunteers",
  "/surveys": "intelligence",
  "/events": "events",
  "/operations": "events",
  "/intelligence": "narrative",
  "/narrative-response": "narrative",
  "/swot": "intelligence",
  "/campaign-plan": "campaign-plan",
  "/kol": "kol",
  "/speeches": "messaging",
  "/fundraising": "finance",
  "/election-day": "election-day",
  "/turnout": "election-day",
  "/credentials": "credentials",
  "/analytics": "dashboard",
  "/admin": "admin",
  "/command-centre": "dashboard",
  "/system-health": "admin",
  "/tenancy": "admin",
};

const PATH_MODULE: Record<string, string> = {
  "/dashboard": "dashboard",
  "/strategist": "dashboard",
  "/members": "members",
  "/voters-db": "voters-db",
  "/segments": "segments",
  "/messaging": "messaging",
  "/field-ops": "field-ops",
  "/volunteers": "volunteers",
  "/surveys": "surveys",
  "/events": "events",
  "/intelligence": "narrative",
  "/narrative-response": "narrative-response",
  "/social-listening": "social-listening",
  "/swot": "swot",
  "/campaign-plan": "campaign-plan",
  "/kol": "kol",
  "/speeches": "speeches",
  "/fundraising": "fundraising",
  "/election-day": "election-day",
  "/turnout": "turnout",
  "/credentials": "credentials",
  "/analytics": "analytics",
  "/admin": "admin",
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, can, logout } = useAuth();
  const currentModule = PATH_MODULE[location] ?? "dashboard";

  // Registry modules (finance, CRM, nominations, …) come from the API, already
  // filtered to what this user's role can open, and slot into their nav group.
  const { data: recordCatalogue } = useRecordModules();
  const GROUP_ORDER = ["COMMAND", "VOTER DATA", "OUTREACH & MESSAGING", "FIELD OPERATIONS", "INTELLIGENCE", "DATA INTELLIGENCE", "CANDIDATE & PARTY", "ELECTION DAY", "FINANCE & RESOURCES", "ADMINISTRATION"];
  const mergedGroups = (() => {
    const map = new globalThis.Map<string, { title: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }>();
    for (const g of navGroups) map.set(g.title, { title: g.title, items: [...g.items] });
    for (const m of recordCatalogue?.modules ?? []) {
      if (!map.has(m.navGroup)) map.set(m.navGroup, { title: m.navGroup, items: [] });
      map.get(m.navGroup)!.items.push({ href: `/m/${m.key}`, label: m.title.toUpperCase(), icon: iconFor(m.icon) });
    }
    const rank = (t: string) => { const i = GROUP_ORDER.indexOf(t); return i === -1 ? GROUP_ORDER.length : i; };
    return [...map.values()].sort((a, b) => rank(a.title) - rank(b.title));
  })();

  const { data: tenancy } = useTenancy();

  const visibleGroups = mergedGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (legacyHidden(tenancy) && LEGACY_HREFS.has(item.href)) return false;
        const mod = NAV_PERM[item.href];
        return mod ? can(mod) : true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <div className="kaiti-shell flex h-dvh min-h-0 w-full max-w-full overflow-hidden bg-background text-foreground font-sans">
      {mobileMenuOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] border-r border-border bg-card kaiti-glass-sidebar flex flex-col transition-transform lg:static lg:translate-x-0 lg:shrink-0`}>
        <div className="p-4 md:p-6 flex items-center gap-3 border-b border-border">
          <div role="img" aria-label="Command Centre logo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full kenya-emblem shadow-sm"><span className="text-sm font-black tracking-tight">C</span></div>
          <div className="flex flex-col">
            <span className="font-bold tracking-widest text-sm">COMMAND CENTRE · CAMPAIGN OPERATIONS SYSTEM</span>
            <span className="text-[10px] text-primary font-mono tracking-widest">[ SYSTEM_ACTIVE ]</span>
          </div>
          <button type="button" aria-label="Close menu" className="ml-auto p-1 lg:hidden" onClick={() => setMobileMenuOpen(false)}><X className="w-5 h-5" /></button>
          <div className="hidden">
          </div>
        </div>
        
        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="space-y-5 px-2">
            {visibleGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-1.5 flex items-center gap-2 bg-secondary/60 border-l-2 border-primary px-3 py-1.5">
                  <span className="text-primary font-mono text-[10px] font-bold">▸</span>
                  <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-foreground uppercase">
                    {group.title}
                  </span>
                </div>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <li key={item.href}>
                        <Link href={item.href} onClick={() => setMobileMenuOpen(false)} className={cn(
                          "flex items-center gap-3 px-3 py-2 text-xs font-mono tracking-wider transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground border-l-2 border-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground border-l-2 border-transparent"
                        )}>
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-border mt-auto space-y-2">
          {user && (
            <div className="px-3 py-2 bg-secondary/50 border border-border">
              <p className="font-mono text-[11px] text-foreground truncate">{user.name}</p>
              <p className="font-mono text-[9px] text-primary tracking-widest uppercase truncate">{user.role}</p>
            </div>
          )}
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-xs font-mono tracking-wider text-muted-foreground hover:bg-secondary hover:text-foreground">
            <LogOut className="w-4 h-4" />
            TERMINATE SESSION
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 flex flex-col h-full overflow-hidden">
        <header className="min-h-14 border-b border-border flex items-center gap-2 px-3 md:px-6 justify-between shrink-0 bg-card/50 kaiti-glass-header">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <button type="button" aria-label="Open navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)} className="p-2 border border-border lg:hidden"><Menu className="w-5 h-5" /></button>
            <div className="hidden md:block w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-[10px] md:text-xs text-muted-foreground tracking-widest truncate">COMMAND CENTRE · OPERATIONS SYSTEM</span>
          </div>
          <div className="hidden lg:flex items-center gap-4">
            <span className="font-mono text-[10px] text-muted-foreground">TIME: {new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi", hour12: false })}</span>
            {!tenancy || tenancy.campaigns.length <= 1 ? (
              <div className="px-2 py-1 bg-primary/10 text-primary font-mono text-[10px] border border-primary/30">
                {[CAMPAIGN.candidate, `${CAMPAIGN.constituency} ${CAMPAIGN.seat ?? ""}`.trim()].filter(Boolean).join(" · ").toUpperCase() || "SET UP YOUR CAMPAIGN"}
              </div>
            ) : null}
          </div>
          {tenancy && tenancy.campaigns.length > 1 && (
            <label className="flex items-center gap-2 text-xs min-w-0">
              <span className="sr-only">Active campaign</span>
              <Building2 className="w-4 h-4 text-primary shrink-0" aria-hidden />
              <select
                value={tenancy.activeCampaignId ?? ""}
                onChange={e => void switchCampaign(Number(e.target.value))}
                className="bg-background border border-primary/40 text-primary px-2 py-1 font-mono text-[11px] max-w-[14rem] truncate"
              >
                {tenancy.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.organisationName && tenancy.campaigns.some(x => x.organisationId !== c.organisationId) ? ` — ${c.organisationName}` : ""}</option>)}
              </select>
            </label>
          )}
        </header>
        <div className="min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6">
          {tenancy && !(tenancy.campaigns.find(c => c.id === tenancy.activeCampaignId)?.wards?.length) && (
            <div role="alert" className="kaiti-glass rounded-xl p-3 mb-4 text-sm border border-amber-500/50">
              <strong>Finish setting up this campaign.</strong> Choose its seat (President, Governor, Senator, Woman Rep, MP or MCA) and area so every module knows its wards.{" "}
              {can("admin", "write") ? <Link href="/tenancy" className="underline font-semibold">Open Organisations &amp; campaigns</Link> : "Ask an administrator to complete the setup."}
            </div>
          )}
          {children}
        </div>
      </main>
      <AiAssistPanel module={currentModule} />
    </div>
  );
}
