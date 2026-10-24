import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth";
import { useRecordModules } from "@/pages/module-records";
import { api } from "@/lib/records";
import { useQuery } from "@tanstack/react-query";
import {
  useTenancy,
  switchCampaign,
  LEGACY_HREFS,
  legacyHidden,
} from "@/lib/tenancy";

import {
  Menu,
  X,
  Mail,
  Users,
  PieChart,
  MessageSquare,
  Map,
  FileText,
  Calendar,
  ShieldAlert,
  Target,
  LayoutDashboard,
  MapPin,
  LogOut,
  Banknote,
  Vote,
  Award,
  Settings,
  BarChart2,
  BrainCircuit,
  ClipboardList,
  Building2,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Mission Control",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/my-area", label: "My Area", icon: MapPin },
      { href: "/members", label: "Members", icon: Users },
      { href: "/segments", label: "Segments", icon: PieChart },
      {
        href: "/deepfake",
        label: "AI Deepfake Detection",
        icon: ShieldAlert,
      },
      {
        href: "/surveys",
        label: "Opinion Polls",
        icon: BarChart2,
      },
      { href: "/messaging", label: "Messaging", icon: MessageSquare },
      {
        href: "/wa-templates",
        label: "WA Templates",
        icon: ClipboardList,
      },
      { href: "/field-ops", label: "Field Ops", icon: Map },
      { href: "/events", label: "Events", icon: Calendar },
      {
        href: "/messaging?channel=email",
        label: "Email Marketing",
        icon: Mail,
      },
      { href: "/fundraising", label: "Fundraising", icon: Banknote },
      { href: "/credentials", label: "Credentials Hub", icon: Award },
    ],
  },
  {
    title: "Strategic Events",
    items: [
      { href: "/m/strategic-events", label: "Event Operations", icon: Target },
      {
        href: "/strategist",
        label: "AI Planner & Briefings",
        icon: BrainCircuit,
      },
    ],
  },
  {
    title: "Stakeholder CRM",
    items: [{ href: "/m/stakeholders", label: "Contacts", icon: Users }],
  },
  {
    title: "Publishing",
    items: [
      {
        href: "/content-studio",
        label: "Content Studio",
        icon: FileText,
      },
    ],
  },
  {
    title: "Election Day Command",
    items: [{ href: "/election-day", label: "HQ Tally", icon: Vote }],
  },
];

// Maps a nav href to its backend permission module key (see admin MODULES list).
const NAV_PERM: Record<string, string> = {
  "/dashboard": "dashboard",
  "/my-area": "dashboard",
  "/deepfake": "intelligence",
  "/wa-templates": "messaging",
  "/content-studio": "messaging",
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

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { can, logout } = useAuth();
  const { data: recordCatalogue } = useRecordModules();
  const health = useQuery({
    queryKey: ["server-health"],
    queryFn: () => api<{ status: string }>("healthz"),
    retry: false,
    refetchInterval: 30_000,
  });
  const { data: tenancy } = useTenancy();

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (legacyHidden(tenancy) && LEGACY_HREFS.has(item.href)) return false;
        if (item.href.startsWith("/m/"))
          return !!recordCatalogue?.modules.some(
            (m) => `/m/${m.key}` === item.href,
          );
        const mod = NAV_PERM[item.href.split("?")[0]];
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
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className={`${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] border-r border-border bg-card kaiti-glass-sidebar flex flex-col transition-transform lg:static lg:translate-x-0 lg:shrink-0`}
      >
        <div className="h-20 px-6 flex shrink-0 items-center gap-3 border-b border-border">
          <div
            role="img"
            aria-label="Command Centre logo"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full kenya-emblem shadow-sm"
          >
            <span className="text-sm font-black tracking-tight">C</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold tracking-tight text-base">
              Command Centre
            </span>
            <span className="text-xs text-muted-foreground">
              Kenya campaign workspace
            </span>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="ml-auto p-1 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="hidden"></div>
        </div>

        <nav className="min-h-0 flex-1 py-10 overflow-y-auto">
          <div className="space-y-7 px-4">
            {visibleGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-3 flex items-center gap-2 px-3 py-1.5">
                  <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.title}
                  </span>
                </div>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const isActive =
                      (location === item.href.split("?")[0] &&
                        (item.href.includes("?")
                          ? window.location.search.includes("channel=email")
                          : !window.location.search.includes(
                              "channel=email",
                            ))) ||
                      (item.href === "/dashboard" &&
                        location === "/command-centre");
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-4 rounded-sm px-4 py-3 text-base font-medium transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                          )}
                        >
                          <item.icon className="w-5 h-5 shrink-0" />
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

        <div className="p-4 border-t border-border mt-auto space-y-2 shrink-0">
          <Link
            href="/security"
            className="flex items-center gap-4 px-4 py-3 text-base text-muted-foreground"
          >
            <Users className="h-5 w-5" />
            My Profile
          </Link>
          {can("admin") && (
            <Link
              href="/tenancy"
              className="flex items-center gap-4 px-4 py-3 text-base text-muted-foreground"
            >
              <Settings className="h-5 w-5" />
              Settings
            </Link>
          )}
          <div
            className="px-4 py-3 text-sm text-muted-foreground"
            aria-label="English"
          >
            🇰🇪 EN
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-3 text-base text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-20 border-b border-border flex items-center gap-2 px-3 md:px-6 justify-between shrink-0 bg-card/50 kaiti-glass-header">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 border border-border lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:block w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs md:text-sm text-muted-foreground tracking-normal truncate">
              {location === "/dashboard" || location === "/command-centre"
                ? "Main Dashboard"
                : (navGroups
                    .flatMap((g) => g.items)
                    .find((i) => i.href.split("?")[0] === location)?.label ??
                  "Command Centre")}
            </span>
          </div>
          <div
            title="Application server availability; provider integrations have separate health checks"
            className="ml-auto flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                health.isSuccess && health.data.status === "ok"
                  ? "bg-emerald-500"
                  : "bg-amber-500",
              )}
            />
            {health.isFetching && !health.data
              ? "Checking system…"
              : health.isError
                ? "System unavailable"
                : health.data?.status === "ok"
                  ? "System Online"
                  : "Checking system…"}
          </div>
          {tenancy && tenancy.campaigns.length > 1 && (
            <label className="flex items-center gap-2 text-xs min-w-0">
              <span className="sr-only">Active campaign</span>
              <Building2
                className="w-4 h-4 text-primary shrink-0"
                aria-hidden
              />
              <select
                value={tenancy.activeCampaignId ?? ""}
                onChange={(e) => void switchCampaign(Number(e.target.value))}
                className="bg-background border border-primary/40 text-primary px-2 py-1 font-mono text-[11px] max-w-[14rem] truncate"
              >
                {tenancy.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.candidateName ? `${c.candidateName} — ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>
        <div className="min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 lg:p-10">
          {location !== "/dashboard" &&
            location !== "/command-centre" &&
            tenancy &&
            !tenancy.campaigns.find((c) => c.id === tenancy.activeCampaignId)
              ?.wards?.length && (
              <div
                role="alert"
                className="kaiti-glass rounded-xl p-3 mb-4 text-sm border border-amber-500/50"
              >
                <strong>Finish setting up this campaign.</strong> Choose its
                seat (President, Governor, Senator, Woman Rep, MP or MCA) and
                area so every module knows its wards.{" "}
                {can("admin", "write") ? (
                  <Link href="/tenancy" className="underline font-semibold">
                    Open Campaign setup
                  </Link>
                ) : (
                  "Ask an administrator to complete the setup."
                )}
              </div>
            )}
          {children}
          <footer className="mt-10 border-t border-border pt-5 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()}. All rights reserved.
          </footer>
        </div>
      </main>
    </div>
  );
}
