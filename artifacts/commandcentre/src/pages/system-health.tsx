import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ServerCog, RefreshCw } from "lucide-react";
import { api, humanize } from "@/lib/records";

type Integrations = {
  providers: { id: number; channel: string; provider: string; isActive: boolean; testStatus: string | null; lastTested: string | null }[] | null;
  deliveries: { status: string; n: number }[] | null;
  sources: { sourceKey: string; sourceType: string; status: string; lastSuccessAt: string | null; lastError: string | null }[] | null;
  failuresByArea: { area: string; n: number; lastAt: string }[] | null;
  configured: Record<string, boolean>;
};
type Failures = { failures: { id: string; method: string; path: string; status: number; error: string | null; actor: string | null; at: string }[] };
type Audit = {
  records: { at: string; actor: string; module: string; action: string; fromStatus: string | null; toStatus: string | null; title: string | null }[];
  admin: { at: string; actor: string; module: string; action: string; details: string | null; severity: string }[];
  operations: { at: string; actor: string; module: string; action: string }[];
  exports: { at: string; actor: string; module: string; reason: string; rowCount: number; includeSensitive: boolean }[];
};
type Backup = { provider: string; recordCounts: { module: string; n: number }[]; restoreRehearsals: { at: string; actor: string; notes: string }[]; checkedAt: string };

const tabs = ["integrations", "failures", "audit", "exports", "backups", "demo-requests"] as const;
type Demo = { id: number; name: string; organisation: string | null; role: string | null; seat: string | null; county: string | null; phone: string | null; email: string | null; message: string | null; status: string; createdAt: string };
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "never";
const dot = (ok: boolean | null) => <span aria-hidden className={`inline-block w-2 h-2 rounded-full mr-2 ${ok === null ? "bg-gray-500" : ok ? "bg-green-500" : "bg-red-500"}`} />;

export default function SystemHealth() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("integrations");
  const [q, setQ] = useState("");
  const integ = useQuery<Integrations>({ queryKey: ["sys-integrations"], queryFn: () => api("system/integrations"), enabled: tab === "integrations" });
  const fails = useQuery<Failures>({ queryKey: ["sys-failures"], queryFn: () => api("system/api-failures?hours=72"), enabled: tab === "failures" });
  const audit = useQuery<Audit>({ queryKey: ["sys-audit", q], queryFn: () => api(`system/audit${q ? `?q=${encodeURIComponent(q)}` : ""}`), enabled: tab === "audit" || tab === "exports" });
  const backup = useQuery<Backup>({ queryKey: ["sys-backup"], queryFn: () => api("system/backup-status"), enabled: tab === "backups" });
  const demos = useQuery<Demo[]>({ queryKey: ["sys-demos"], queryFn: () => api("system/demo-requests"), enabled: tab === "demo-requests" });
  const [notes, setNotes] = useState(""); const [msg, setMsg] = useState("");
  async function logRehearsal(e: FormEvent) {
    e.preventDefault(); setMsg("");
    try { await api("system/backup-status/rehearsal", { method: "POST", body: JSON.stringify({ notes }) }); setNotes(""); setMsg("Restore rehearsal recorded."); void backup.refetch(); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
  }
  const active = { integrations: integ, failures: fails, audit, exports: audit, backups: backup, "demo-requests": demos }[tab];

  return (
    <div className="space-y-5 min-w-0">
      <header className="flex flex-wrap justify-between gap-3">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><ServerCog className="text-primary" size={24} /> System Health & Audit</h1>
          <p className="text-sm text-muted-foreground">Integrations, API failures, the audit trail, data exports and backups.</p></div>
        <button type="button" onClick={() => void active.refetch()} className="border border-border rounded-xl px-3 py-2 text-sm flex gap-2 items-center"><RefreshCw size={16} /> Refresh</button>
      </header>
      <div role="tablist" className="flex flex-wrap gap-2">{tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
        className={`rounded-xl px-3 py-2 text-sm border ${tab === t ? "bg-primary text-primary-foreground border-primary" : "border-border kaiti-glass"}`}>{t === "failures" ? "API failures" : humanize(t)}</button>)}</div>
      {active.error && <p role="alert" className="text-red-300 text-sm">{(active.error as Error).message}</p>}
      {active.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {tab === "integrations" && integ.data && <div className="grid lg:grid-cols-2 gap-4">
        <section className="kaiti-glass rounded-2xl p-4"><h2 className="font-semibold mb-3">Messaging providers</h2>
          {!integ.data.providers?.length ? <p className="text-sm text-muted-foreground">No providers configured. Add one in Messaging.</p> :
            <ul className="space-y-2 text-sm">{integ.data.providers.map(p => <li key={p.id} className="flex justify-between gap-2"><span>{dot(p.isActive && p.testStatus !== "failed")}{p.provider} ({p.channel})</span><span className="text-xs text-muted-foreground">{p.isActive ? "active" : "inactive"} · tested {fmt(p.lastTested)}{p.testStatus ? ` · ${p.testStatus}` : ""}</span></li>)}</ul>}
          <h3 className="font-medium mt-4 mb-2 text-sm">Other services</h3>
          <ul className="text-sm space-y-1">{Object.entries(integ.data.configured).map(([k, v]) => <li key={k}>{dot(v)}{k === "ai" ? "AI provider" : k === "mpesa" ? "M-Pesa (Daraja)" : "Facebook Page"} — {v ? "configured" : "not configured"}</li>)}</ul>
        </section>
        <section className="kaiti-glass rounded-2xl p-4"><h2 className="font-semibold mb-3">Message delivery, last 7 days</h2>
          {!integ.data.deliveries?.length ? <p className="text-sm text-muted-foreground">No deliveries recorded.</p> :
            <ul className="text-sm space-y-1">{integ.data.deliveries.map(d => <li key={d.status} className="flex justify-between"><span>{humanize(d.status)}</span><span className="tabular-nums">{d.n.toLocaleString()}</span></li>)}</ul>}
          <h2 className="font-semibold mt-5 mb-3">Errors by area, last 24 h</h2>
          {!integ.data.failuresByArea?.length ? <p className="text-sm text-muted-foreground">No server errors.</p> :
            <ul className="text-sm space-y-1">{integ.data.failuresByArea.map(f => <li key={f.area} className="flex justify-between"><span>/{f.area}</span><span className="tabular-nums text-amber-300">{f.n} · last {fmt(f.lastAt)}</span></li>)}</ul>}
        </section>
        {!!integ.data.sources?.length && <section className="kaiti-glass rounded-2xl p-4 lg:col-span-2"><h2 className="font-semibold mb-3">Social listening sources</h2>
          <ul className="text-sm space-y-1">{integ.data.sources.map(s => <li key={s.sourceKey} className="flex flex-wrap justify-between gap-2"><span>{dot(s.status === "ok" || s.status === "healthy")}{s.sourceKey}</span><span className="text-xs text-muted-foreground">last success {fmt(s.lastSuccessAt)}{s.lastError ? ` · ${s.lastError.slice(0, 80)}` : ""}</span></li>)}</ul></section>}
      </div>}

      {tab === "failures" && fails.data && <section className="kaiti-glass rounded-2xl p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Server errors, last 72 hours ({fails.data.failures.length})</h2>
        {fails.data.failures.length === 0 ? <p className="text-sm text-muted-foreground">No server errors recorded.</p> :
          <table className="w-full text-sm min-w-[600px]"><thead className="text-xs text-muted-foreground text-left"><tr><th className="py-1">When</th><th>Request</th><th>Status</th><th>User</th></tr></thead>
            <tbody>{fails.data.failures.map(f => <tr key={f.id} className="border-t border-border/50"><td className="py-1.5 whitespace-nowrap">{fmt(f.at)}</td><td className="font-mono text-xs">{f.method} {f.path}</td><td className="text-red-300">{f.status}</td><td className="text-xs">{f.actor ?? "—"}</td></tr>)}</tbody></table>}
      </section>}

      {tab === "audit" && <>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by person, module or record" aria-label="Filter audit trail" className="w-full max-w-md bg-background border border-border rounded-xl p-2 text-sm" />
        {audit.data && <section className="kaiti-glass rounded-2xl p-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]"><thead className="text-xs text-muted-foreground text-left"><tr><th className="py-1">When</th><th>Who</th><th>Module</th><th>What</th></tr></thead>
            <tbody>{[
              ...audit.data.records.map(r => ({ at: r.at, actor: r.actor, module: r.module, what: `${humanize(r.action)}${r.title ? ` “${r.title}”` : ""}${r.toStatus && r.fromStatus !== r.toStatus ? ` → ${humanize(r.toStatus)}` : ""}` })),
              ...audit.data.admin.map(a => ({ at: a.at, actor: a.actor, module: a.module, what: `${a.action}${a.details ? `: ${a.details}` : ""}` })),
              ...audit.data.operations.map(o => ({ at: o.at, actor: o.actor, module: o.module, what: o.action })),
            ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 400).map((r, i) => <tr key={i} className="border-t border-border/50"><td className="py-1.5 whitespace-nowrap">{fmt(r.at)}</td><td className="text-xs">{r.actor}</td><td>{humanize(r.module)}</td><td className="break-words">{r.what}</td></tr>)}</tbody></table>
        </section>}
      </>}

      {tab === "exports" && audit.data && <section className="kaiti-glass rounded-2xl p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Data exports</h2>
        {audit.data.exports.filter(x => x.module !== "__restore_rehearsal__").length === 0 ? <p className="text-sm text-muted-foreground">No exports yet.</p> :
          <table className="w-full text-sm min-w-[600px]"><thead className="text-xs text-muted-foreground text-left"><tr><th className="py-1">When</th><th>Who</th><th>Module</th><th>Rows</th><th>Reason</th></tr></thead>
            <tbody>{audit.data.exports.filter(x => x.module !== "__restore_rehearsal__").map((x, i) => <tr key={i} className="border-t border-border/50"><td className="py-1.5 whitespace-nowrap">{fmt(x.at)}</td><td className="text-xs">{x.actor}</td><td>{humanize(x.module)}{x.includeSensitive && <span className="text-amber-300 text-xs"> (with contact details)</span>}</td><td className="tabular-nums">{x.rowCount}</td><td>{x.reason}</td></tr>)}</tbody></table>}
      </section>}

      {tab === "demo-requests" && demos.data && <section className="kaiti-glass rounded-2xl p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Demo requests from the website ({demos.data.length})</h2>
        {demos.data.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet. They arrive from the Contact page of the website.</p> :
          <table className="w-full text-sm min-w-[720px]"><thead className="text-xs text-muted-foreground text-left"><tr><th className="py-1">When</th><th>Who</th><th>Seat / county</th><th>Contact</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>{demos.data.map(d => <tr key={d.id} className="border-t border-border/50 align-top">
              <td className="py-1.5 whitespace-nowrap">{fmt(d.createdAt)}</td>
              <td>{d.name}<span className="block text-xs text-muted-foreground">{[d.role, d.organisation].filter(Boolean).join(" · ")}</span></td>
              <td>{[d.seat, d.county].filter(Boolean).join(" · ") || "—"}</td>
              <td className="text-xs">{d.phone && <a className="underline block" href={`tel:${d.phone}`}>{d.phone}</a>}{d.email && <a className="underline block" href={`mailto:${d.email}`}>{d.email}</a>}</td>
              <td className="text-xs max-w-[16rem] break-words">{d.message ?? "—"}</td>
              <td><select aria-label={`Status for ${d.name}`} value={d.status} onChange={e => void api(`system/demo-requests/${d.id}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }).then(() => demos.refetch())} className="bg-background border border-border rounded-lg p-1 text-xs">
                {["new", "contacted", "demo_booked", "won", "closed"].map(x => <option key={x} value={x}>{humanize(x)}</option>)}</select></td>
            </tr>)}</tbody></table>}
      </section>}

      {tab === "backups" && backup.data && <div className="grid lg:grid-cols-2 gap-4">
        <section className="kaiti-glass rounded-2xl p-4 text-sm space-y-2"><h2 className="font-semibold">Backups</h2>
          <p>Database backups are handled by <strong>{backup.data.provider}</strong>. Check the backup schedule and retention in the Supabase dashboard under Database → Backups, and confirm point-in-time recovery is enabled on your plan.</p>
          <p className="text-muted-foreground">A backup you’ve never restored isn’t proven. Restore to a separate project at least once a month, check the record counts below match, then log the rehearsal.</p>
          <form onSubmit={e => void logRehearsal(e)} className="space-y-2 pt-2">
            <label className="block">What was restored and verified<textarea required minLength={10} value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="block w-full bg-background border border-border rounded-lg p-2 mt-1" /></label>
            <button type="submit" className="bg-primary text-primary-foreground rounded-xl px-3 py-2">Log restore rehearsal</button>{msg && <span role="status" className="ml-3">{msg}</span>}
          </form>
          {backup.data.restoreRehearsals.length > 0 && <ul className="text-xs pt-2 space-y-1">{backup.data.restoreRehearsals.map((r, i) => <li key={i}>{fmt(r.at)} · {r.actor}: {r.notes}</li>)}</ul>}
        </section>
        <section className="kaiti-glass rounded-2xl p-4"><h2 className="font-semibold mb-3">Record counts (for restore checks)</h2>
          <ul className="text-sm space-y-1">{backup.data.recordCounts.map(c => <li key={c.module} className="flex justify-between"><span>{humanize(c.module)}</span><span className="tabular-nums">{c.n.toLocaleString()}</span></li>)}</ul>
          <p className="text-xs text-muted-foreground mt-3">Checked {fmt(backup.data.checkedAt)}</p></section>
      </div>}
    </div>
  );
}
