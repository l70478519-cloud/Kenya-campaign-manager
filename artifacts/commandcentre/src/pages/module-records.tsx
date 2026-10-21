import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Download, History as HistoryIcon, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X, ShieldCheck, Activity } from "lucide-react";
import {
  api, BASE, formatValue, humanize, iconFor, parseCsv, toInputValue,
  type FieldDef, type ModuleDef, type RecordRow,
} from "@/lib/records";

type Catalogue = { wards: string[]; modules: ModuleDef[] };
type Summary = { byStatus: Record<string, number>; overdue: number; total: number; metrics: Record<string, unknown> };
type Quality = { duplicates: { key: string; ward: string; n: number; ids: string[] }[]; staleOpenRecords: number; completeness: { field: string; pct: number }[] };
type HistoryRow = { id: string; action: string; fromStatus: string | null; toStatus: string | null; changes: Record<string, { from: unknown; to: unknown }>; actor: string; at: string };

export function useRecordModules() {
  return useQuery<Catalogue>({ queryKey: ["record-modules"], queryFn: () => api<Catalogue>("records/_modules"), staleTime: 5 * 60_000 });
}

const inputCls = "block w-full bg-background border border-border rounded-lg p-2.5 text-sm";
const btn = "border border-border rounded-xl px-3 py-2 text-sm flex gap-2 items-center hover:bg-background/40 disabled:opacity-50";
const primary = "bg-primary text-primary-foreground rounded-xl px-3 py-2 text-sm flex gap-2 items-center disabled:opacity-50";

function FieldInput({ field, value, onChange, wards }: { field: FieldDef; value: string; onChange: (v: string) => void; wards: string[] }) {
  const common = { id: `f-${field.key}`, required: field.required, value, className: inputCls };
  switch (field.type) {
    case "textarea": return <textarea {...common} rows={3} maxLength={field.max ?? 8000} onChange={e => onChange(e.target.value)} />;
    case "select": return <select {...common} onChange={e => onChange(e.target.value)}><option value="">Select…</option>{field.options?.map(o => <option key={o}>{o}</option>)}</select>;
    case "ward": return <select {...common} onChange={e => onChange(e.target.value)}><option value="">{field.required ? "Select ward…" : "Constituency-wide"}</option>{wards.map(w => <option key={w}>{w}</option>)}</select>;
    case "boolean": return <select {...common} onChange={e => onChange(e.target.value)}><option value="">Not recorded</option><option value="true">Yes</option><option value="false">No</option></select>;
    case "rating": return <select {...common} onChange={e => onChange(e.target.value)}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} – {"★".repeat(n)}</option>)}</select>;
    case "number": case "money": return <input {...common} type="number" step={field.type === "money" ? "0.01" : "any"} min={field.min} max={field.max} onChange={e => onChange(e.target.value)} />;
    case "date": return <input {...common} type="date" onChange={e => onChange(e.target.value)} />;
    case "datetime": return <input {...common} type="datetime-local" onChange={e => onChange(e.target.value)} />;
    case "email": return <input {...common} type="email" onChange={e => onChange(e.target.value)} />;
    case "phone": return <input {...common} type="tel" placeholder="+2547…" onChange={e => onChange(e.target.value)} />;
    case "url": return <input {...common} type="url" placeholder="https://" onChange={e => onChange(e.target.value)} />;
    default: return <input {...common} type="text" maxLength={field.max ?? 500} onChange={e => onChange(e.target.value)} />;
  }
}

function nextStatuses(mod: ModuleDef, current: string): string[] {
  const allowed = mod.transitions?.[current];
  return [current, ...(allowed ?? mod.statuses.filter(s => s !== current))];
}

export default function ModuleRecords() {
  const { key } = useParams<{ key: string }>();
  const { data: catalogue, isLoading: catLoading, error: catError } = useRecordModules();
  const mod = catalogue?.modules.find(m => m.key === key);
  const wards = catalogue?.wards ?? [];

  const [rows, setRows] = useState<RecordRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("");
  const [ward, setWard] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<RecordRow | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<RecordRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [panel, setPanel] = useState<"" | "export" | "import" | "quality">("");

  const canWrite = mod?.access === "write";

  const load = useCallback(async () => {
    if (!mod) return;
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (ward) params.set("ward", ward);
    if (q.trim()) params.set("q", q.trim());
    try {
      const [list, sum] = await Promise.all([
        api<RecordRow[]>(`records/${mod.key}?${params}`),
        api<Summary>(`records/${mod.key}/summary`),
      ]);
      setRows(list); setSummary(sum);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load records"); }
    finally { setLoading(false); }
  }, [mod, status, ward, q]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setStatus(""); setWard(""); setQ(""); setEditing(null); setPanel(""); setNotice(""); }, [key]);

  function openForm(row: RecordRow | "new") {
    if (!mod) return;
    const next: Record<string, string> = {};
    for (const f of mod.fields) next[f.key] = row === "new" ? "" : toInputValue(f, row.data[f.key]);
    setForm(next); setEditing(row); setNotice(""); setError("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!mod || !editing) return;
    setSaving(true); setError("");
    const data: Record<string, unknown> = {};
    for (const f of mod.fields) {
      const v = form[f.key] ?? "";
      if (editing !== "new" && f.sensitive && v.startsWith("•••")) continue; // masked, unchanged
      data[f.key] = f.type === "datetime" && v ? new Date(v).toISOString() : v;
    }
    try {
      if (editing === "new") await api(`records/${mod.key}`, { method: "POST", body: JSON.stringify({ data }) });
      else await api(`records/${mod.key}/${editing.id}`, { method: "PATCH", body: JSON.stringify({ data }) });
      setNotice(editing === "new" ? "Record created." : "Changes saved.");
      setEditing(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function changeStatus(row: RecordRow, next: string) {
    if (!mod || next === row.status) return;
    setError(""); setNotice("");
    try {
      await api(`records/${mod.key}/${row.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      setNotice(`Moved to ${humanize(next)}.`); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Status change failed"); }
  }

  async function remove(row: RecordRow) {
    if (!mod || !window.confirm(`Delete “${row.title}”? It stays in the audit trail.`)) return;
    try { await api(`records/${mod.key}/${row.id}`, { method: "DELETE" }); setNotice("Record deleted."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); }
  }

  async function openHistory(row: RecordRow) {
    if (!mod) return;
    setHistoryFor(row); setHistory([]);
    try { setHistory(await api<HistoryRow[]>(`records/${mod.key}/${row.id}/history`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load history"); }
  }

  const listFields = useMemo(() => mod?.fields.filter(f => f.list && f.key !== mod.titleField && f.type !== "ward") ?? [], [mod]);
  const fieldByKey = useMemo(() => new Map(mod?.fields.map(f => [f.key, f]) ?? []), [mod]);

  if (catLoading) return <p className="text-muted-foreground p-6">Loading module…</p>;
  if (catError) return <p role="alert" className="text-red-300 p-6">{(catError as Error).message}</p>;
  if (!mod) return <p className="text-muted-foreground p-6">This module doesn’t exist or your role can’t open it.</p>;

  const Icon = iconFor(mod.icon);
  const isOverdue = (row: RecordRow): boolean => Boolean(mod.dueField && !mod.closedStatuses.includes(row.status)
    && row.data[mod.dueField] && new Date(String(row.data[mod.dueField])).getTime() < Date.now());

  return (
    <div className="space-y-5 min-w-0">
      <header className="flex flex-wrap gap-3 items-start justify-between">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Icon size={24} className="text-primary shrink-0" />{mod.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{mod.description}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={btn} onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
          <button type="button" className={btn} onClick={() => setPanel(p => p === "quality" ? "" : "quality")}><Activity size={16} /> Data quality</button>
          {canWrite && <button type="button" className={btn} onClick={() => setPanel(p => p === "export" ? "" : "export")}><Download size={16} /> Export</button>}
          {canWrite && mod.importable && <button type="button" className={btn} onClick={() => setPanel(p => p === "import" ? "" : "import")}><Upload size={16} /> Import CSV</button>}
          {canWrite && <button type="button" className={primary} onClick={() => openForm("new")}><Plus size={16} /> New record</button>}
        </div>
      </header>

      {summary && <SummaryStrip mod={mod} summary={summary} active={status} onPick={s => setStatus(cur => cur === s ? "" : s)} />}
      {summary?.metrics && <ModuleMetrics mod={mod} metrics={summary.metrics} />}

      {error && <p role="alert" className="border border-red-500/40 bg-red-950/30 rounded-xl p-3 text-red-200 text-sm">{error}</p>}
      {notice && <p role="status" className="border border-green-500/40 rounded-xl p-3 text-green-200 text-sm">{notice}</p>}

      {panel === "export" && <ExportPanel mod={mod} onClose={() => setPanel("")} onDone={m => setNotice(m)} />}
      {panel === "import" && <ImportPanel mod={mod} onClose={() => setPanel("")} onDone={async m => { setNotice(m); await load(); }} />}
      {panel === "quality" && <QualityPanel mod={mod} onClose={() => setPanel("")} />}

      {editing && <form onSubmit={e => void save(e)} className="kaiti-glass rounded-2xl p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">{editing === "new" ? `New ${mod.title.toLowerCase()} record` : `Edit “${editing.title}”`}</h2>
          <button type="button" aria-label="Close form" onClick={() => setEditing(null)} className="p-1"><X size={18} /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {mod.fields.map(f => <label key={f.key} htmlFor={`f-${f.key}`} className={`text-sm space-y-1 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
            <span>{f.label}{f.required && <span className="text-primary"> *</span>}</span>
            <FieldInput field={f} wards={wards} value={form[f.key] ?? ""} onChange={v => setForm(cur => ({ ...cur, [f.key]: v }))} />
            {f.help && <span className="block text-xs text-muted-foreground">{f.help}</span>}
          </label>)}
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={primary}>{saving ? "Saving…" : editing === "new" ? "Create record" : "Save changes"}</button>
          <button type="button" className={btn} onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </form>}

      <div className="flex flex-wrap gap-2 items-center">
        <label className="relative flex-1 min-w-[200px]">
          <span className="sr-only">Search</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${mod.title.toLowerCase()}`} className="w-full bg-background border border-border rounded-xl py-2 pl-9 pr-3 text-sm" />
        </label>
        <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)} className="bg-background border border-border rounded-xl p-2 text-sm">
          <option value="">All statuses</option>{mod.statuses.map(s => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <select aria-label="Filter by ward" value={ward} onChange={e => setWard(e.target.value)} className="bg-background border border-border rounded-xl p-2 text-sm">
          <option value="">All wards</option>{wards.map(w => <option key={w}>{w}</option>)}
        </select>
      </div>

      <section className="kaiti-glass rounded-2xl p-4" aria-busy={loading}>
        {loading && rows.length === 0 ? <p className="text-muted-foreground text-sm">Loading…</p>
          : rows.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">
              No records{status || ward || q ? " match these filters" : " yet"}.{canWrite && !status && !ward && !q && <> <button type="button" className="underline text-foreground" onClick={() => openForm("new")}>Create the first one</button>.</>}
            </div>
          : <ul className="grid gap-3">{rows.map(row => <li key={row.id} className={`border rounded-xl p-3 bg-background/30 flex flex-wrap justify-between gap-3 ${isOverdue(row) ? "border-red-500/50" : "border-border"}`}>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold break-words">{row.title}</h3>
                <p className="text-xs text-muted-foreground">{row.ward ?? "Constituency-wide"}{isOverdue(row) && <span className="text-red-300 font-medium"> · overdue</span>}</p>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-sm">
                  {listFields.map(f => <div key={f.key} className="min-w-0"><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="truncate">{formatValue(f, row.data[f.key])}</dd></div>)}
                </dl>
              </div>
              <div className="flex flex-col gap-2 items-end">
                {canWrite ? <select aria-label={`Status of ${row.title}`} value={row.status} onChange={e => void changeStatus(row, e.target.value)} className="bg-background border border-border rounded-lg p-1.5 text-sm">
                    {nextStatuses(mod, row.status).map(s => <option key={s} value={s}>{humanize(s)}</option>)}
                  </select>
                  : <span className="text-xs rounded-full border border-border px-2 py-1">{humanize(row.status)}</span>}
                <div className="flex gap-1">
                  <button type="button" aria-label={`History of ${row.title}`} title="History" onClick={() => void openHistory(row)} className="p-1.5 border border-border rounded-lg"><HistoryIcon size={14} /></button>
                  {canWrite && <button type="button" aria-label={`Edit ${row.title}`} title="Edit" onClick={() => openForm(row)} className="p-1.5 border border-border rounded-lg"><Pencil size={14} /></button>}
                  {canWrite && <button type="button" aria-label={`Delete ${row.title}`} title="Delete" onClick={() => void remove(row)} className="p-1.5 border border-border rounded-lg text-red-300"><Trash2 size={14} /></button>}
                </div>
              </div>
            </li>)}</ul>}
      </section>

      {historyFor && <div role="dialog" aria-modal="true" aria-label={`History of ${historyFor.title}`} className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setHistoryFor(null)}>
        <div className="bg-background border-l border-border w-full max-w-md h-full overflow-y-auto p-5 space-y-3" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center"><h2 className="font-semibold">History · {historyFor.title}</h2><button type="button" aria-label="Close history" onClick={() => setHistoryFor(null)}><X size={18} /></button></div>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">Loading…</p> : <ol className="space-y-3">{history.map(h => <li key={h.id} className="border-l-2 border-primary/60 pl-3 text-sm">
            <p className="font-medium">{humanize(h.action)}{h.fromStatus !== h.toStatus && h.toStatus && <> · {h.fromStatus ? humanize(h.fromStatus) : "new"} → {humanize(h.toStatus)}</>}</p>
            <p className="text-xs text-muted-foreground">{h.actor} · {new Date(h.at).toLocaleString("en-KE")}</p>
            {h.action === "updated" && <ul className="text-xs mt-1 space-y-0.5">{Object.entries(h.changes).map(([k, c]) => <li key={k}><span className="text-muted-foreground">{fieldByKey.get(k)?.label ?? k}:</span> {formatValue(fieldByKey.get(k), c.from)} → {formatValue(fieldByKey.get(k), c.to)}</li>)}</ul>}
          </li>)}</ol>}
        </div>
      </div>}

      {mod.separateApprover?.length ? <p className="text-xs text-muted-foreground flex items-center gap-2"><ShieldCheck size={14} />
        {mod.separateApprover.map(humanize).join(", ")} must be set by someone other than the person who created the record. Every change is kept in the history.</p> : null}
    </div>
  );
}

function SummaryStrip({ mod, summary, active, onPick }: { mod: ModuleDef; summary: Summary; active: string; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Records by status">
      <div className="rounded-xl border border-border px-3 py-2"><div className="text-xl font-bold tabular-nums">{summary.total}</div><div className="text-xs text-muted-foreground">Total</div></div>
      {mod.statuses.map(s => <button type="button" key={s} onClick={() => onPick(s)} aria-pressed={active === s}
        className={`rounded-xl border px-3 py-2 text-left ${active === s ? "border-primary bg-primary/10" : "border-border"}`}>
        <div className="text-xl font-bold tabular-nums">{summary.byStatus[s] ?? 0}</div><div className="text-xs text-muted-foreground">{humanize(s)}</div>
      </button>)}
      {mod.dueField && <div className={`rounded-xl border px-3 py-2 ${summary.overdue ? "border-red-500/50 text-red-200" : "border-border"}`}>
        <div className="text-xl font-bold tabular-nums">{summary.overdue}</div><div className="text-xs opacity-80">Overdue</div></div>}
    </div>
  );
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

function ModuleMetrics({ mod, metrics }: { mod: ModuleDef; metrics: Record<string, unknown> }) {
  if ((mod.key === "budgets" || mod.key === "expenses") && Array.isArray(metrics.budgetVsActual)) {
    const lines = metrics.budgetVsActual as { line: string; department: string; ward: string | null; allocated: number; actual: number; variance: number }[];
    const pending = metrics.pendingRequests as { n: number; amount: number } | undefined;
    const allocated = Number(metrics.totalAllocated ?? 0), actual = Number(metrics.totalActual ?? 0);
    return (
      <section className="kaiti-glass rounded-2xl p-4 space-y-3">
        <h2 className="font-semibold">Budget vs actual</h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <div><div className="text-muted-foreground text-xs">Allocated</div><div className="text-lg font-bold">{kes(allocated)}</div></div>
          <div><div className="text-muted-foreground text-xs">Spent (approved + paid)</div><div className="text-lg font-bold">{kes(actual)}</div></div>
          <div><div className="text-muted-foreground text-xs">Utilisation</div><div className="text-lg font-bold">{allocated ? Math.round((actual / allocated) * 100) : 0}%</div></div>
          {pending && <div><div className="text-muted-foreground text-xs">Awaiting approval</div><div className="text-lg font-bold">{pending.n} · {kes(pending.amount)}</div></div>}
          {Number(metrics.unbudgetedSpend) > 0 && <div className="text-amber-200"><div className="text-xs">Spend not linked to a budget line</div><div className="text-lg font-bold">{kes(Number(metrics.unbudgetedSpend))}</div></div>}
        </div>
        {lines.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]">
          <thead className="text-xs text-muted-foreground text-left"><tr><th className="py-1">Line</th><th>Department</th><th>Ward</th><th className="text-right">Allocated</th><th className="text-right">Actual</th><th className="w-40">Used</th></tr></thead>
          <tbody>{lines.map(l => { const pct = l.allocated ? Math.min(100, (l.actual / l.allocated) * 100) : 0; const over = l.actual > l.allocated; return (
            <tr key={l.line + l.department} className="border-t border-border/50"><td className="py-1.5">{l.line}</td><td>{l.department}</td><td>{l.ward ?? "All"}</td>
              <td className="text-right tabular-nums">{kes(l.allocated)}</td><td className={`text-right tabular-nums ${over ? "text-red-300" : ""}`}>{kes(l.actual)}</td>
              <td><div className="h-2 rounded-full bg-border overflow-hidden" role="img" aria-label={`${Math.round(pct)}% used`}><div className={`h-full ${over ? "bg-red-500" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div></td></tr>); })}</tbody>
        </table></div>}
      </section>
    );
  }
  if (mod.key === "kpis" && Array.isArray(metrics.kpis) && metrics.kpis.length) {
    const kpis = metrics.kpis as { name: string; ward: string | null; target: number; current: number; unit: string | null }[];
    return <section className="kaiti-glass rounded-2xl p-4"><h2 className="font-semibold mb-3">Progress to target</h2>
      <ul className="grid sm:grid-cols-2 gap-3">{kpis.map((k, i) => { const pct = k.target ? Math.min(100, (k.current / k.target) * 100) : 0; return (
        <li key={i} className="text-sm"><div className="flex justify-between gap-2"><span className="truncate">{k.name}{k.ward ? ` (${k.ward})` : ""}</span><span className="tabular-nums text-muted-foreground">{k.current.toLocaleString()} / {k.target.toLocaleString()} {k.unit ?? ""}</span></div>
          <div className="h-2 mt-1 rounded-full bg-border overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div></li>); })}</ul></section>;
  }
  if (mod.key === "election-history" && Array.isArray(metrics.resultsByCandidate) && metrics.resultsByCandidate.length) {
    const r = metrics.resultsByCandidate as { year: number; seat: string; candidate: string; party: string | null; votes: number; verified: boolean }[];
    return <section className="kaiti-glass rounded-2xl p-4 overflow-x-auto"><h2 className="font-semibold mb-3">Totals by candidate</h2>
      <table className="w-full text-sm min-w-[480px]"><thead className="text-xs text-muted-foreground text-left"><tr><th>Year</th><th>Seat</th><th>Candidate</th><th>Party</th><th className="text-right">Votes</th><th>Status</th></tr></thead>
        <tbody>{r.map((x, i) => <tr key={i} className="border-t border-border/50"><td className="py-1.5">{x.year}</td><td>{x.seat}</td><td>{x.candidate}</td><td>{x.party ?? "—"}</td><td className="text-right tabular-nums">{Number(x.votes).toLocaleString()}</td><td>{x.verified ? "Verified" : "Provisional"}</td></tr>)}</tbody></table></section>;
  }
  return null;
}

function ExportPanel({ mod, onClose, onDone }: { mod: ModuleDef; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hasSensitive = mod.fields.some(f => f.sensitive);
  async function run(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const res = await fetch(`${BASE}api/records/${mod.key}/export`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, includeSensitive: sensitive }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${mod.key}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
      onDone("Export downloaded and logged."); onClose();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Export failed"); } finally { setBusy(false); }
  }
  return <form onSubmit={e => void run(e)} className="kaiti-glass rounded-2xl p-4 space-y-3">
    <h2 className="font-semibold">Export to CSV</h2>
    <p className="text-sm text-muted-foreground">Exports are logged with your name and reason, and appear in the audit console.</p>
    <label className="text-sm block">Reason for export<input required minLength={10} value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="e.g. Weekly finance committee review" /></label>
    {hasSensitive && <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={sensitive} onChange={e => setSensitive(e.target.checked)} /> Include personal contact details ({mod.fields.filter(f => f.sensitive).map(f => f.label).join(", ")})</label>}
    {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
    <div className="flex gap-2"><button type="submit" disabled={busy} className={primary}>{busy ? "Exporting…" : "Download CSV"}</button><button type="button" onClick={onClose} className={btn}>Cancel</button></div>
  </form>;
}

type ImportResult = { dryRun: boolean; received: number; imported: number; valid: number; duplicatesSkipped: number[]; rejected: { row: number; errors: string[] }[] };
function ImportPanel({ mod, onClose, onDone }: { mod: ModuleDef; onClose: () => void; onDone: (m: string) => void | Promise<void> }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function pick(file: File | undefined) {
    setResult(null); setErr("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErr("File is larger than 5 MB."); return; }
    setFileName(file.name);
    const parsed = parseCsv(await file.text());
    if (!parsed.length) { setErr("No data rows found. The first row must be column headings."); return; }
    setRows(parsed);
  }
  async function send(dryRun: boolean) {
    setBusy(true); setErr("");
    try {
      const r = await api<ImportResult>(`records/${mod.key}/import`, { method: "POST", body: JSON.stringify({ rows, dryRun }) });
      setResult(r);
      if (!dryRun) await onDone(`Imported ${r.imported} of ${r.received} rows.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Import failed"); } finally { setBusy(false); }
  }
  const template = mod.fields.map(f => f.label).join(",");
  return <section className="kaiti-glass rounded-2xl p-4 space-y-3">
    <div className="flex justify-between"><h2 className="font-semibold">Import from CSV</h2><button type="button" aria-label="Close import" onClick={onClose}><X size={18} /></button></div>
    <p className="text-sm text-muted-foreground">Use column headings that match the field names. Rows are checked first; nothing is saved until you confirm.</p>
    <details className="text-xs"><summary className="cursor-pointer">Column headings</summary><code className="block mt-1 p-2 bg-background/60 rounded break-words">{template}</code></details>
    <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={e => void pick(e.target.files?.[0])} className="text-sm" />
    {rows.length > 0 && !result && <div className="flex gap-2 items-center text-sm"><span>{fileName}: {rows.length} rows</span><button type="button" disabled={busy} onClick={() => void send(true)} className={btn}>{busy ? "Checking…" : "Check rows"}</button></div>}
    {result && <div className="text-sm space-y-2">
      <p>{result.dryRun ? "Check complete" : "Import complete"}: <strong>{result.valid}</strong> valid, <strong>{result.duplicatesSkipped.length}</strong> duplicates skipped, <strong>{result.rejected.length}</strong> rejected.</p>
      {result.rejected.length > 0 && <ul className="max-h-40 overflow-y-auto text-xs border border-border rounded-lg p-2 space-y-1">{result.rejected.map(r => <li key={r.row}>Row {r.row}: {r.errors.join("; ")}</li>)}</ul>}
      {result.dryRun && result.valid > 0 && <button type="button" disabled={busy} onClick={() => void send(false)} className={primary}>{busy ? "Importing…" : `Import ${result.valid} valid rows`}</button>}
    </div>}
    {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
  </section>;
}

function QualityPanel({ mod, onClose }: { mod: ModuleDef; onClose: () => void }) {
  const { data, error, isLoading } = useQuery<Quality>({ queryKey: ["quality", mod.key], queryFn: () => api<Quality>(`records/${mod.key}/quality`) });
  return <section className="kaiti-glass rounded-2xl p-4 space-y-3">
    <div className="flex justify-between"><h2 className="font-semibold">Data quality</h2><button type="button" aria-label="Close data quality" onClick={onClose}><X size={18} /></button></div>
    {isLoading ? <p className="text-sm text-muted-foreground">Checking…</p> : error ? <p className="text-sm text-red-300">{(error as Error).message}</p> : data && <>
      <p className="text-sm">{data.duplicates.length ? `${data.duplicates.length} possible duplicate groups` : "No duplicates found"} · {data.staleOpenRecords} open records not updated in 30 days</p>
      {data.duplicates.length > 0 && <ul className="text-xs space-y-1">{data.duplicates.slice(0, 20).map(d => <li key={d.key + d.ward}>“{d.key}” {d.ward && `(${d.ward})`} × {d.n} — record IDs {d.ids.join(", ")}</li>)}</ul>}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">{data.completeness.map(c => <div key={c.field} className="text-xs"><div className="flex justify-between"><span>{c.field}</span><span className="tabular-nums">{c.pct}%</span></div>
        <div className="h-1.5 rounded-full bg-border overflow-hidden"><div className={`h-full ${c.pct < 50 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${c.pct}%` }} /></div></div>)}</div>
    </>}
  </section>;
}
