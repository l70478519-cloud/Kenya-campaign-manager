import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Kind = "approval" | "task" | "incident" | "resource";
type Item = {
  id: number; kind: Kind; title: string; description: string; ward: string | null;
  status: string; priority: string; assignedTo: string | null; dueAt: string | null;
  resourceKey: string | null; startsAt: string | null; endsAt: string | null;
  createdBy: string; createdAt: string;
};
const BASE = import.meta.env.BASE_URL;
const kinds: Kind[] = ["approval", "task", "incident", "resource"];
const labels: Record<Kind, string> = {
  approval: "Approval Centre", task: "Task Centre", incident: "Incident Centre", resource: "Resource Scheduling",
};
const statuses: Record<Kind, string[]> = {
  approval: ["pending", "approved", "rejected"],
  task: ["open", "in_progress", "resolved", "closed"],
  incident: ["open", "in_progress", "resolved", "closed"],
  resource: ["open", "in_progress", "closed"],
};
const toIso = (v: string) => v ? new Date(v).toISOString() : null;

export default function OperationsCentre() {
  const { can } = useAuth();
  const [kind, setKind] = useState<Kind>("task");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ward, setWard] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [resourceKey, setResourceKey] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const canWrite = can("events", "write");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BASE}api/operations?kind=${kind}`, { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 503 ? "Apply the Supabase operations migration first." : `Could not load records (HTTP ${res.status})`);
      setItems(await res.json());
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load"); }
    finally { setLoading(false); }
  }, [kind]);
  useEffect(() => { void load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const body = { kind, title, description, ward: ward || null, priority, assignedTo: assignedTo || null,
        dueAt: toIso(dueAt), resourceKey: resourceKey || null, startsAt: toIso(startsAt), endsAt: toIso(endsAt) };
      const res = await fetch(`${BASE}api/operations`, { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (HTTP ${res.status})`);
      setTitle(""); setDescription(""); setAssignedTo(""); setResourceKey(""); setStartsAt(""); setEndsAt(""); setDueAt("");
      setShowForm(false); setNotice("Record saved."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setSaving(false); }
  }
  async function changeStatus(item: Item, status: string) {
    if (status === item.status) return;
    setError(""); setNotice("");
    try {
      const res = await fetch(`${BASE}api/operations/${item.id}/status`, { method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Update failed (HTTP ${res.status})`);
      setNotice("Status updated and recorded in history."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Update failed"); }
  }
  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operations & Approvals</h1>
          <p className="text-sm text-muted-foreground">{CAMPAIGN.areaLabel} · auditable operational records</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="border border-border rounded-xl px-3 py-2 flex gap-2 items-center"><RefreshCw size={16}/> Refresh</button>
          {canWrite && <button type="button" onClick={() => setShowForm(v => !v)} className="bg-primary text-primary-foreground rounded-xl px-3 py-2 flex gap-2 items-center"><Plus size={16}/> New record</button>}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {kinds.map(k => <button type="button" key={k} onClick={() => { setKind(k); setShowForm(false); }}
          className={`rounded-xl px-3 py-2 text-sm border ${kind === k ? "bg-primary text-primary-foreground border-primary" : "border-border kaiti-glass"}`}>{labels[k]}</button>)}
      </div>
      {error && <p role="alert" className="border border-red-500/40 bg-red-950/30 rounded-xl p-3 text-red-200">{error}</p>}
      {notice && <p role="status" className="border border-green-500/40 rounded-xl p-3 text-green-200">{notice}</p>}
      {showForm && canWrite && <form onSubmit={e => void create(e)} className="kaiti-glass rounded-2xl p-4 space-y-3">
        <h2 className="font-semibold">New {labels[kind]}</h2>
        <input required minLength={3} maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" aria-label="Title" className="w-full bg-background/60 border border-border rounded-lg p-3"/>
        <textarea maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description / evidence reference" aria-label="Description" className="w-full bg-background/60 border border-border rounded-lg p-3"/>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Ward
            <select value={ward} onChange={e => setWard(e.target.value)} className="block w-full bg-background border border-border rounded-lg p-3"><option value="">Constituency-wide</option>{WARDS.map(w => <option key={w}>{w}</option>)}</select>
          </label>
          <label className="text-sm">Priority
            <select value={priority} onChange={e => setPriority(e.target.value)} className="block w-full bg-background border border-border rounded-lg p-3">{["low","normal","high","critical"].map(p => <option key={p}>{p}</option>)}</select>
          </label>
          <label className="text-sm">Assigned to<input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} maxLength={160} className="block w-full bg-background border border-border rounded-lg p-3"/></label>
          <label className="text-sm">Due date<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="block w-full bg-background border border-border rounded-lg p-3"/></label>
          {kind === "resource" && <>
            <label className="text-sm">Resource ID / vehicle / equipment<input required value={resourceKey} onChange={e => setResourceKey(e.target.value)} className="block w-full bg-background border border-border rounded-lg p-3"/></label>
            <label className="text-sm">Start<input required type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="block w-full bg-background border border-border rounded-lg p-3"/></label>
            <label className="text-sm">End<input required type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="block w-full bg-background border border-border rounded-lg p-3"/></label>
          </>}
        </div>
        <button type="submit" disabled={saving} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 disabled:opacity-50">{saving ? "Saving…" : "Save record"}</button>
      </form>}
      <div className="kaiti-glass rounded-2xl p-4">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><ClipboardList size={18}/>{labels[kind]} <span className="text-muted-foreground text-sm">({items.length})</span></h2>
        {loading ? <p className="text-muted-foreground">Loading…</p> : items.length === 0 ? <p className="text-muted-foreground">No records found.</p> :
          <div className="grid gap-3">{items.map(item => <article key={item.id} className="border border-border rounded-xl p-3 bg-background/30 flex flex-wrap justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold break-words">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.ward || "Constituency-wide"} · {item.priority} priority · {item.assignedTo || "Unassigned"}</p>
              {item.description && <p className="text-sm mt-2 whitespace-pre-wrap break-words">{item.description}</p>}
              {item.dueAt && <p className="text-xs text-muted-foreground mt-1">Due: {new Date(item.dueAt).toLocaleString("en-KE")}</p>}
              {item.resourceKey && <p className="text-xs text-muted-foreground mt-1">Resource: {item.resourceKey}</p>}
            </div>
            <div className="flex flex-col gap-1 items-end">
              <span className="text-xs rounded-full border border-border px-2 py-1">{item.status}</span>
              {canWrite && <select aria-label={`Update ${item.title} status`} value={item.status} onChange={e => void changeStatus(item,e.target.value)}
                className="bg-background border border-border rounded-lg p-2 text-sm">{statuses[item.kind].map(s => <option key={s} value={s}>{s}</option>)}</select>}
            </div>
          </article>)}</div>}
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-2"><ShieldCheck size={14}/> Status changes are recorded in the database history. Approval decisions require a separate authorised reviewer.</p>
    </div>
  );
}
