import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { RefreshCw, Crown } from "lucide-react";
import { api, humanize } from "@/lib/records";

type Overview = {
  generatedAt: string;
  budget: { allocated: number; spent: number; pendingCount: number; pendingAmount: number } | null;
  tasks: { open: number; overdue: number; pendingApprovals: number; criticalIncidents: number } | null;
  decisions: { module: string; id: string; title: string; status: string; ward: string | null; updatedAt: string }[];
  overdueByModule: { module: string; title: string; overdue: number }[];
  kpis: { name: string; ward: string | null; target: number; current: number; unit: string | null; status: string }[];
  upcoming: { source: string; id: string; title: string; startsAt: string; ward: string | null; status: string }[];
  field: { visits7d?: number; issuesOpen?: number };
  apiFailures24h: number | null;
};

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const ago = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "1 day" : `${d} days`; };

function Stat({ label, value, tone, href }: { label: string; value: string | number; tone?: "alert"; href?: string }) {
  const body = <div className={`rounded-2xl border p-4 h-full ${tone === "alert" ? "border-red-500/50 bg-red-950/20" : "border-border kaiti-glass"}`}>
    <div className="text-3xl font-bold tabular-nums">{value}</div><div className="text-sm text-muted-foreground mt-1">{label}</div></div>;
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export default function CommandCentre() {
  const { data, error, isLoading, refetch, isFetching } = useQuery<Overview>({ queryKey: ["command-centre"], queryFn: () => api<Overview>("command-centre/overview"), refetchInterval: 60_000 });
  if (isLoading) return <p className="text-muted-foreground p-6">Loading command centre…</p>;
  if (error || !data) return <p role="alert" className="text-red-300 p-6">{(error as Error)?.message ?? "Could not load"}</p>;
  const b = data.budget, t = data.tasks;
  const utilisation = b && b.allocated ? Math.round((b.spent / b.allocated) * 100) : null;
  const totalOverdue = data.overdueByModule.reduce((s, m) => s + m.overdue, 0) + (t?.overdue ?? 0);

  return (
    <div className="space-y-6 min-w-0">
      <header className="flex flex-wrap justify-between gap-3 items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Crown className="text-primary" size={24} /> Executive Command Centre</h1>
          <p className="text-sm text-muted-foreground">What needs leadership attention today. Updated {new Date(data.generatedAt).toLocaleTimeString("en-KE", { timeStyle: "short" })}.</p>
        </div>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className="border border-border rounded-xl px-3 py-2 text-sm flex gap-2 items-center"><RefreshCw size={16} className={isFetching ? "animate-spin" : ""} /> Refresh</button>
      </header>

      <section aria-label="Key figures" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Decisions waiting on leadership" value={data.decisions.length} tone={data.decisions.length ? "alert" : undefined} />
        <Stat label="Overdue items across modules" value={totalOverdue} tone={totalOverdue ? "alert" : undefined} />
        <Stat label={b ? `Budget used (${kes(b.spent)} of ${kes(b.allocated)})` : "Budget used"} value={utilisation === null ? "—" : `${utilisation}%`} href="/m/budgets" />
        <Stat label="Critical incidents open" value={t?.criticalIncidents ?? "—"} tone={t?.criticalIncidents ? "alert" : undefined} href="/operations" />
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="kaiti-glass rounded-2xl p-4">
          <h2 className="font-semibold mb-3">Waiting for a decision</h2>
          {data.decisions.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is waiting. Approval queues are clear.</p> :
            <ul className="divide-y divide-border/60">{data.decisions.map(d => <li key={d.module + d.id} className="py-2 flex justify-between gap-3 text-sm">
              <Link href={`/m/${d.module}`} className="min-w-0 hover:underline"><span className="block truncate font-medium">{d.title}</span><span className="text-xs text-muted-foreground">{humanize(d.module)} · {humanize(d.status)}{d.ward ? ` · ${d.ward}` : ""}</span></Link>
              <span className="text-xs text-muted-foreground shrink-0">waiting {ago(d.updatedAt)}</span></li>)}</ul>}
        </section>

        <section className="kaiti-glass rounded-2xl p-4">
          <h2 className="font-semibold mb-3">Next 14 days</h2>
          {data.upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No events scheduled. Plan one in <Link href="/m/strategic-events" className="underline">Strategic Events</Link>.</p> :
            <ul className="divide-y divide-border/60">{data.upcoming.map(e => <li key={e.source + e.id} className="py-2 flex justify-between gap-3 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium">{e.title}</span><span className="text-xs text-muted-foreground">{e.ward ?? "Constituency-wide"} · {humanize(e.status)}</span></span>
              <time className="text-xs text-muted-foreground shrink-0" dateTime={e.startsAt}>{new Date(e.startsAt).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}</time></li>)}</ul>}
        </section>

        <section className="kaiti-glass rounded-2xl p-4">
          <h2 className="font-semibold mb-3">Overdue by module</h2>
          {data.overdueByModule.length === 0 && !t?.overdue ? <p className="text-sm text-muted-foreground">Nothing overdue.</p> :
            <ul className="space-y-2 text-sm">
              {t?.overdue ? <li className="flex justify-between"><Link href="/operations" className="hover:underline">Tasks</Link><span className="tabular-nums text-red-300">{t.overdue}</span></li> : null}
              {data.overdueByModule.map(m => <li key={m.module} className="flex justify-between"><Link href={`/m/${m.module}`} className="hover:underline">{m.title}</Link><span className="tabular-nums text-red-300">{m.overdue}</span></li>)}
            </ul>}
        </section>

        <section className="kaiti-glass rounded-2xl p-4">
          <h2 className="font-semibold mb-3">Field & operations</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground text-xs">Doors visited, last 7 days</dt><dd className="text-xl font-bold tabular-nums">{data.field.visits7d ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Open field issues</dt><dd className="text-xl font-bold tabular-nums">{data.field.issuesOpen ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Open tasks</dt><dd className="text-xl font-bold tabular-nums">{t?.open ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Expense requests pending</dt><dd className="text-xl font-bold tabular-nums">{b ? `${b.pendingCount} · ${kes(b.pendingAmount)}` : "—"}</dd></div>
            <div><dt className="text-muted-foreground text-xs">System errors, last 24 h</dt><dd className={`text-xl font-bold tabular-nums ${data.apiFailures24h ? "text-amber-300" : ""}`}>{data.apiFailures24h ?? "—"}</dd></div>
          </dl>
        </section>
      </div>

      {data.kpis.length > 0 && <section className="kaiti-glass rounded-2xl p-4">
        <h2 className="font-semibold mb-3"><Link href="/m/kpis" className="hover:underline">Performance indicators</Link></h2>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{data.kpis.map((k, i) => { const pct = k.target ? Math.min(100, (k.current / k.target) * 100) : 0; return (
          <li key={i} className="text-sm"><div className="flex justify-between gap-2"><span className="truncate">{k.name}{k.ward ? ` (${k.ward})` : ""}</span><span className="text-xs text-muted-foreground">{humanize(k.status)}</span></div>
            <div className="h-2 mt-1 rounded-full bg-border overflow-hidden"><div className={`h-full ${k.status === "off_track" ? "bg-red-500" : k.status === "at_risk" ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{k.current.toLocaleString()} of {k.target.toLocaleString()} {k.unit ?? ""}</div></li>); })}</ul>
      </section>}
    </div>
  );
}
