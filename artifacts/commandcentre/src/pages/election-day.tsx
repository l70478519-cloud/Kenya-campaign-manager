import { WARDS, CAMPAIGN } from "@/lib/wards";
import { api, parseCsv } from "@/lib/records";
import { useState } from "react";
import {
  useGetElectionDaySummary,
  useListPollingStations,
  useUpdatePollingStation,
  useListTallyResults,
  useSubmitStationResults,
  useVerifyTallyResult,
  useDisputeTallyResult,
  useDeleteTallyResult,
  useListElectionEvents,
  useCreateElectionEvent,
  useUpdateElectionEvent,
  useGetElectionDayWorkqueue,
  useGetPublishedResults,
  getGetElectionDaySummaryQueryKey,
  getListPollingStationsQueryKey,
  getListTallyResultsQueryKey,
  getListElectionEventsQueryKey,
  getGetElectionDayWorkqueueQueryKey,
  getGetPublishedResultsQueryKey,
} from "@workspace/api-client-react";
import type { PollingStation, TallyResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Vote, AlertTriangle, CheckCircle, Clock, Radio, Shield, Send, List, BarChart2, Layers, X } from "lucide-react";

type Tab = "warroom" | "submit" | "stations" | "events" | "verification" | "workqueue" | "publish";

const CANDIDATES: Array<{ name: string; party: string }> = [];


const STATUS_STYLE: Record<string, string> = {
  pending: "text-muted-foreground border-muted-foreground/30",
  open: "text-yellow-400 border-yellow-400/30",
  submitted: "text-blue-400 border-blue-400/30",
  verified: "text-green-400 border-green-400/30",
  draft: "text-muted-foreground border-muted-foreground/30",
  disputed: "text-red-400 border-red-400/30",
};

const EVENT_TYPE_STYLE: Record<string, string> = {
  info: "text-blue-400",
  alert: "text-yellow-400",
  incident: "text-red-400",
  milestone: "text-green-400",
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-yellow-400",
  urgent: "text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${STATUS_STYLE[status] ?? "text-muted-foreground border-border"}`}>
      [ {status.toUpperCase()} ]
    </span>
  );
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.min(100, Math.round((a / b) * 100));
}

function fmt(n: number) { return n.toLocaleString(); }

// ── WAR ROOM TAB ──────────────────────────────────────────────────────────
function WarRoomTab() {
  const { data: summary, isLoading } = useGetElectionDaySummary();

  if (isLoading) return <div className="p-8 font-mono text-xs text-muted-foreground">LOADING TALLY DATA...</div>;
  if (!summary) return null;

  const grandTotal = summary.tallyByCandidate.reduce((s, c) => s + Number(c.totalVotes), 0);
  const reportingPct = pct(summary.submittedStations, summary.totalStations);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4">
          <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">STATIONS REPORTING</div>
          <div className="text-2xl font-bold">{summary.submittedStations}<span className="text-sm text-muted-foreground font-normal"> / {summary.totalStations}</span></div>
          <div className="mt-2 w-full h-1 bg-secondary">
            <div className="h-full bg-primary" style={{ width: `${reportingPct}%` }} />
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">{reportingPct}% REPORTING</div>
        </div>
        <div className="bg-card border border-border p-4">
          <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">VERIFIED STATIONS</div>
          <div className="text-2xl font-bold text-green-400">{summary.verifiedStations}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">{pct(summary.verifiedStations, summary.totalStations)}% VERIFIED</div>
        </div>
        <div className="bg-card border border-border p-4">
          <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">TOTAL VOTES TALLIED</div>
          <div className="text-2xl font-bold">{fmt(grandTotal)}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">ACROSS {summary.submittedStations} STATIONS</div>
        </div>
        <div className="bg-card border border-border p-4">
          <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">REGISTERED VOTERS</div>
          <div className="text-2xl font-bold">{fmt(summary.totalRegisteredVoters)}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">{CAMPAIGN.areaLabel.toUpperCase()}</div>
        </div>
      </div>

      <div className="bg-card border border-border p-4">
        <div className="font-mono text-[10px] text-muted-foreground mb-4 tracking-widest">LIVE CANDIDATE TALLY</div>
        <div className="space-y-3">
          {summary.tallyByCandidate.map((c, i) => {
            const share = pct(Number(c.totalVotes), grandTotal);
            const isLeading = i === 0;
            return (
              <div key={c.candidateName} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isLeading && <span className="text-yellow-400 font-mono text-[10px]">▶ LEADING</span>}
                    <span className="font-semibold text-sm">{c.candidateName}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.party}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs text-muted-foreground">{share}%</span>
                    <span className="font-bold font-mono">{fmt(Number(c.totalVotes))}</span>
                    {Number(c.verifiedVotes) > 0 && (
                      <span className="font-mono text-[10px] text-green-400">✓ {fmt(Number(c.verifiedVotes))} verified</span>
                    )}
                  </div>
                </div>
                <div className="w-full h-2 bg-secondary">
                  <div
                    className="h-full bg-muted-foreground/40"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border p-4">
        <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">WARD REPORTING STATUS</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {summary.wardBreakdown.map((w) => {
            const p = pct(Number(w.submittedStations), Number(w.totalStations));
            return (
              <div key={w.ward} className="border border-border p-3 text-center">
                <div className="font-mono text-[10px] text-muted-foreground mb-1">{w.ward?.toUpperCase()}</div>
                <div className="text-lg font-bold">{Number(w.submittedStations)}<span className="text-xs text-muted-foreground">/{Number(w.totalStations)}</span></div>
                <div className="w-full h-1 bg-secondary mt-2">
                  <div className="h-full bg-primary" style={{ width: `${p}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── SUBMIT RESULTS TAB ─────────────────────────────────────────────────────
function SubmitResultsTab() {
  const qc = useQueryClient();
  const { data: stations } = useListPollingStations({});
  const submitResults = useSubmitStationResults({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTallyResultsQueryKey({}) });
        qc.invalidateQueries({ queryKey: getGetElectionDaySummaryQueryKey() });
        qc.invalidateQueries({ queryKey: getGetElectionDayWorkqueueQueryKey() });
        qc.invalidateQueries({ queryKey: getListPollingStationsQueryKey({}) });
        setSelectedStation("");
        setVotes({});
        setSubmittedBy("");
        setDone(true);
      },
    },
  });

  const [selectedStation, setSelectedStation] = useState("");
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [rejectedVotes, setRejectedVotes] = useState("0");
  const [submittedBy, setSubmittedBy] = useState("");
  const [done, setDone] = useState(false);

  const unsubmittedStations = (stations ?? []).filter(s => s.status === "pending" || s.status === "open");
  const totalVotes = Object.values(votes).reduce((s, v) => s + (parseInt(v) || 0), 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStation) return;
    setDone(false);
    submitResults.mutate({
      data: {
        stationCode: selectedStation,
        rejectedVotes: parseInt(rejectedVotes) || 0,
        totalValidVotes: totalVotes,
        submittedBy: submittedBy || "Field Agent",
        results: CANDIDATES.map(c => ({
          candidateName: c.name,
          party: c.party,
          votes: parseInt(votes[c.name] ?? "0") || 0,
        })),
      },
    });
  }

  return (
    <div className="max-w-2xl">
      <div className="font-mono text-[10px] text-muted-foreground mb-4 tracking-widest">FORM 34A — RESULTS SUBMISSION</div>

      {done && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-xs p-3 mb-4">
          ✓ RESULTS SUBMITTED SUCCESSFULLY
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-mono text-[10px] text-muted-foreground mb-1 tracking-widest">POLLING STATION</label>
          <select
            required
            value={selectedStation}
            onChange={e => { setSelectedStation(e.target.value); setVotes({}); }}
            className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
          >
            <option value="">— SELECT STATION —</option>
            {unsubmittedStations.map(s => (
              <option key={s.code} value={s.code}>{s.code} — {s.name} ({s.ward})</option>
            ))}
          </select>
          {unsubmittedStations.length === 0 && (
            <div className="text-[10px] font-mono text-yellow-400 mt-1">ALL STATIONS HAVE SUBMITTED RESULTS</div>
          )}
        </div>

        <div className="bg-card border border-border p-4 space-y-3">
          <div className="font-mono text-[10px] text-muted-foreground tracking-widest mb-2">CANDIDATE VOTES</div>
          {CANDIDATES.map(c => (
            <div key={c.name} className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-xs font-semibold">{c.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{c.party}</div>
              </div>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={votes[c.name] ?? ""}
                onChange={e => setVotes(p => ({ ...p, [c.name]: e.target.value }))}
                className="w-28 bg-secondary border border-border px-3 py-1.5 font-mono text-sm text-right focus:outline-none focus:border-primary"
              />
            </div>
          ))}
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">TOTAL VALID VOTES</span>
            <span className="font-bold font-mono">{fmt(totalVotes)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-mono text-[10px] text-muted-foreground mb-1 tracking-widest">REJECTED VOTES</label>
            <input
              type="number"
              min={0}
              value={rejectedVotes}
              onChange={e => setRejectedVotes(e.target.value)}
              className="w-full bg-secondary border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-muted-foreground mb-1 tracking-widest">SUBMITTED BY</label>
            <input
              type="text"
              placeholder="Agent name"
              value={submittedBy}
              onChange={e => setSubmittedBy(e.target.value)}
              className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!selectedStation || submitResults.isPending}
          className="w-full bg-primary text-white font-mono text-xs tracking-widest py-3 disabled:opacity-50 hover:bg-primary/90"
        >
          {submitResults.isPending ? "TRANSMITTING..." : "▶ TRANSMIT RESULTS"}
        </button>
      </form>
    </div>
  );
}

// ── STATIONS TAB ───────────────────────────────────────────────────────────
function StationsTab() {
  const qc = useQueryClient();
  const { data: stations, isLoading } = useListPollingStations({});
  const updateStation = useUpdatePollingStation({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListPollingStationsQueryKey({}) }) } });
  const [wardFilter, setWardFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = (stations ?? []).filter(s =>
    (!wardFilter || s.ward === wardFilter) &&
    (!statusFilter || s.status === statusFilter)
  );

  const statusCounts = (stations ?? []).reduce((acc, s) => { acc[s.status] = (acc[s.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const [importMsg, setImportMsg] = useState<string | null>(null);
  async function importCsv(file: File | undefined) {
    if (!file) return;
    setImportMsg("Importing…");
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) { setImportMsg("No rows found. The first row must be column headings."); return; }
      const r = await api<{ imported: number; updated: number; rejected: { row: number; error: string }[] }>("election-day/stations/import", { method: "POST", body: JSON.stringify({ rows }) });
      setImportMsg(`Imported ${r.imported} new and updated ${r.updated} stations.${r.rejected.length ? ` ${r.rejected.length} rows skipped — first: row ${r.rejected[0].row}: ${r.rejected[0].error}` : ""}`);
      qc.invalidateQueries({ queryKey: getListPollingStationsQueryKey({}) });
    } catch (e) { setImportMsg(e instanceof Error ? e.message : "Import failed"); }
  }

  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  async function loadReference() {
    setLoadMsg("Loading IEBC polling centres…");
    try {
      const r = await api<{ area: string; added: number; alreadyPresent: number; unmatched: string[]; ambiguous: { ward: string }[] }>("election-day/stations/load-reference", { method: "POST", body: "{}" });
      const notes = [
        r.unmatched.length ? `Not in the IEBC ward list: ${r.unmatched.join(", ")}.` : "",
        r.ambiguous.length ? `Wards sharing a name in this county: ${r.ambiguous.map(a => a.ward).join(", ")}.` : "",
      ].filter(Boolean).join(" ");
      setLoadMsg(`${r.area}: added ${r.added} centres, ${r.alreadyPresent} already listed. ${notes}`.trim());
      qc.invalidateQueries({ queryKey: getListPollingStationsQueryKey({}) });
    } catch (e) { setLoadMsg(e instanceof Error ? e.message : "Loading failed"); }
  }

  if (isLoading) return <div className="font-mono text-xs text-muted-foreground p-4">LOADING STATIONS...</div>;

  return (
    <div className="space-y-4">
      <div className="kaiti-glass rounded-xl p-3 text-xs space-y-2">
        <p><strong>Import polling stations</strong> from the IEBC “Registered Voters per Polling Station” list as CSV with columns: <code>code, name, ward, registered_voters, streams</code>. Wards must be {WARDS.join(", ")}.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 border border-primary/50 rounded-lg px-3 py-2 cursor-pointer text-primary font-semibold">
            Choose CSV file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => void importCsv(e.target.files?.[0])} />
          </label>
          {importMsg && <span role="status" className="text-muted-foreground">{importMsg}</span>}
        </div>
        <p><strong>Or start from the IEBC register:</strong> loads the polling centres for {CAMPAIGN.areaLabel} only. Centre names only, with KCM- reference codes; importing the official list above later adds the IEBC codes, registered voters and streams to the same rows.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void loadReference()} className="inline-flex items-center gap-2 border border-primary/50 rounded-lg px-3 py-2 text-primary font-semibold">
            Load IEBC polling centres
          </button>
          {loadMsg && <span role="status" className="text-muted-foreground">{loadMsg}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          {Object.entries(statusCounts).map(([s, n]) => (
            <span key={s} className={`border px-2 py-1 cursor-pointer ${statusFilter === s ? "border-primary text-primary" : STATUS_STYLE[s] ?? "border-border"}`} onClick={() => setStatusFilter(p => p === s ? "" : s)}>
              {s.toUpperCase()} ({n})
            </span>
          ))}
        </div>
        <select value={wardFilter} onChange={e => setWardFilter(e.target.value)} className="bg-secondary border border-border px-3 py-1 font-mono text-xs focus:outline-none">
          <option value="">ALL WARDS</option>
          {WARDS.map(w => <option key={w}>{w}</option>)}
        </select>
        {(wardFilter || statusFilter) && (
          <button onClick={() => { setWardFilter(""); setStatusFilter(""); }} className="font-mono text-[10px] text-muted-foreground hover:text-foreground">✕ CLEAR</button>
        )}
      </div>

      <div className="border border-border">
        <table className="w-full text-xs">
          <thead className="bg-card border-b border-border">
            <tr className="font-mono text-[10px] text-muted-foreground tracking-widest">
              <th className="text-left px-3 py-2">CODE</th>
              <th className="text-left px-3 py-2">STATION</th>
              <th className="text-left px-3 py-2">WARD</th>
              <th className="text-right px-3 py-2">VOTERS</th>
              <th className="text-right px-3 py-2">STREAMS</th>
              <th className="text-left px-3 py-2">AGENT</th>
              <th className="text-left px-3 py-2">STATUS</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="border-b border-border/50 hover:bg-card/50">
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{s.code}</td>
                <td className="px-3 py-2 font-semibold">{s.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.ward}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(s.registeredVoters)}</td>
                <td className="px-3 py-2 text-right font-mono">{s.streamCount}</td>
                <td className="px-3 py-2">
                  {s.agentName ? (
                    <div>
                      <div className="font-semibold">{s.agentName}</div>
                      {s.agentPhone && <div className="text-[10px] text-muted-foreground font-mono">{s.agentPhone}</div>}
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                <td className="px-3 py-2">
                  {s.status === "pending" && (
                    <button onClick={() => updateStation.mutate({ id: s.id, data: { status: "open" } })} className="font-mono text-[10px] text-yellow-400 border border-yellow-400/30 px-2 py-0.5 hover:bg-yellow-400/10">OPEN</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="font-mono text-[10px] text-muted-foreground">{filtered.length} of {(stations ?? []).length} stations</div>
    </div>
  );
}

// ── EVENTS TAB ─────────────────────────────────────────────────────────────
function EventsTab() {
  const qc = useQueryClient();
  const { data: events, isLoading } = useListElectionEvents();
  const createEvent = useCreateElectionEvent({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListElectionEventsQueryKey() }); setForm({ type: "info", title: "", description: "", ward: "", stationCode: "", priority: "normal" }); setShowAdd(false); } } });
  const resolveEvent = useUpdateElectionEvent({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListElectionEventsQueryKey() }) } });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: "info", title: "", description: "", ward: "", stationCode: "", priority: "normal" });

  if (isLoading) return <div className="font-mono text-xs text-muted-foreground p-4">LOADING EVENTS...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="font-mono text-[10px] text-muted-foreground">{(events ?? []).filter(e => e.status === "open").length} OPEN EVENTS</div>
        <button onClick={() => setShowAdd(p => !p)} className="flex items-center gap-2 bg-primary text-white font-mono text-[10px] tracking-widest px-3 py-1.5 hover:bg-primary/90">
          + LOG EVENT
        </button>
      </div>

      {showAdd && (
        <form onSubmit={e => { e.preventDefault(); createEvent.mutate({ data: { type: form.type as any, title: form.title, description: form.description, ward: form.ward || undefined, stationCode: form.stationCode || undefined, priority: form.priority as any } }); }} className="bg-card border border-border p-4 space-y-3">
          <div className="font-mono text-[10px] text-muted-foreground tracking-widest mb-2">LOG NEW EVENT</div>
          <div className="grid grid-cols-3 gap-3">
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none">
              <option value="info">INFO</option>
              <option value="alert">ALERT</option>
              <option value="incident">INCIDENT</option>
              <option value="milestone">MILESTONE</option>
            </select>
            <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none">
              <option value="low">LOW</option>
              <option value="normal">NORMAL</option>
              <option value="high">HIGH</option>
              <option value="urgent">URGENT</option>
            </select>
            <select value={form.ward} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))} className="bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none">
              <option value="">ALL WARDS</option>
              {WARDS.map(w => <option key={w}>{w}</option>)}
            </select>
          </div>
          <input required placeholder="Event title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
          <textarea required rows={2} placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none" />
          <div className="flex gap-2">
            <button type="submit" className="bg-primary text-white font-mono text-[10px] tracking-widest px-4 py-2 hover:bg-primary/90">SUBMIT</button>
            <button type="button" onClick={() => setShowAdd(false)} className="border border-border font-mono text-[10px] px-4 py-2 hover:bg-card">CANCEL</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {(events ?? []).map(ev => (
          <div key={ev.id} className={`border p-3 ${ev.status === "resolved" ? "border-border/30 opacity-60" : "border-border"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`font-mono text-[10px] font-bold ${EVENT_TYPE_STYLE[ev.type] ?? ""}`}>[{ev.type.toUpperCase()}]</span>
                <span className={`font-mono text-[10px] ${PRIORITY_STYLE[ev.priority] ?? ""}`}>◆ {ev.priority.toUpperCase()}</span>
                {ev.ward && <span className="font-mono text-[10px] text-muted-foreground">{ev.ward}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{new Date(ev.createdAt).toLocaleTimeString()}</span>
                {ev.status === "open" && (
                  <button onClick={() => resolveEvent.mutate({ id: ev.id, data: { status: "resolved" } })} className="font-mono text-[10px] text-green-400 border border-green-400/30 px-2 py-0.5 hover:bg-green-400/10">RESOLVE</button>
                )}
              </div>
            </div>
            <div className="font-semibold text-sm mt-1">{ev.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{ev.description}</div>
          </div>
        ))}
        {(events ?? []).length === 0 && <div className="font-mono text-xs text-muted-foreground py-4">NO EVENTS LOGGED</div>}
      </div>
    </div>
  );
}

// ── VERIFICATION TAB ───────────────────────────────────────────────────────
function VerificationTab() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListTallyResultsQueryKey({}) });
    qc.invalidateQueries({ queryKey: getGetElectionDaySummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getGetElectionDayWorkqueueQueryKey() });
    qc.invalidateQueries({ queryKey: getListPollingStationsQueryKey({}) });
    qc.invalidateQueries({ queryKey: getGetPublishedResultsQueryKey() });
  };
  const { data: allResults, isLoading } = useListTallyResults({});
  const verifyResult = useVerifyTallyResult({ mutation: { onSuccess: invalidate } });
  const disputeResult = useDisputeTallyResult({ mutation: { onSuccess: invalidate } });

  if (isLoading) return <div className="font-mono text-xs text-muted-foreground p-4">LOADING...</div>;

  const submitted = (allResults ?? []).filter(r => r.status === "submitted");
  const byStation = Object.values(
    submitted.reduce((acc, r) => {
      if (!acc[r.stationCode]) acc[r.stationCode] = { stationCode: r.stationCode, results: [] };
      acc[r.stationCode]!.results.push(r);
      return acc;
    }, {} as Record<string, { stationCode: string; results: TallyResult[] }>)
  );

  return (
    <div className="space-y-4">
      <div className="font-mono text-[10px] text-muted-foreground">{byStation.length} STATIONS PENDING VERIFICATION</div>
      {byStation.length === 0 && (
        <div className="border border-border p-6 text-center font-mono text-xs text-muted-foreground">
          NO RESULTS PENDING VERIFICATION
        </div>
      )}
      {byStation.map(({ stationCode, results }) => {
        const totalVotes = results.reduce((s, r) => s + r.votes, 0);
        const firstResult = results[0]!;
        return (
          <div key={stationCode} className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold">{stationCode}</div>
                <div className="font-mono text-[10px] text-muted-foreground">Submitted by {firstResult.submittedBy} · {new Date(firstResult.submittedAt).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => verifyResult.mutate({ id: firstResult.id, data: { verifiedBy: "HQ Verification Team" } })} className="font-mono text-[10px] text-green-400 border border-green-400/30 px-3 py-1.5 hover:bg-green-400/10">
                  ✓ VERIFY ALL
                </button>
                <button onClick={() => disputeResult.mutate({ id: firstResult.id, data: { notes: "Flagged by HQ for discrepancy" } })} className="font-mono text-[10px] text-red-400 border border-red-400/30 px-3 py-1.5 hover:bg-red-400/10">
                  ✗ DISPUTE
                </button>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="font-mono text-[10px] text-muted-foreground border-b border-border">
                  <th className="text-left pb-1">CANDIDATE</th>
                  <th className="text-left pb-1">PARTY</th>
                  <th className="text-right pb-1">VOTES</th>
                  <th className="text-right pb-1">SHARE</th>
                </tr>
              </thead>
              <tbody>
                {results.sort((a, b) => b.votes - a.votes).map(r => (
                  <tr key={r.id} className={false ? "text-primary" : ""}>
                    <td className="py-1 font-semibold">{r.candidateName}</td>
                    <td className="py-1 text-muted-foreground">{r.party}</td>
                    <td className="py-1 text-right font-mono font-bold">{fmt(r.votes)}</td>
                    <td className="py-1 text-right font-mono text-muted-foreground">{pct(r.votes, totalVotes)}%</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-mono font-bold">
                  <td colSpan={2} className="pt-1 text-[10px] text-muted-foreground">TOTAL VALID</td>
                  <td className="pt-1 text-right">{fmt(totalVotes)}</td>
                  <td />
                </tr>
                {firstResult.rejectedVotes > 0 && (
                  <tr className="font-mono text-[10px] text-muted-foreground">
                    <td colSpan={2}>REJECTED</td>
                    <td className="text-right">{firstResult.rejectedVotes}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── WORKQUEUE TAB ──────────────────────────────────────────────────────────
function WorkqueueTab({ setTab }: { setTab: (t: Tab) => void }) {
  const { data: wq, isLoading } = useGetElectionDayWorkqueue();

  if (isLoading) return <div className="font-mono text-xs text-muted-foreground p-4">LOADING...</div>;
  if (!wq) return null;

  const unsubByWard = wq.unsubmittedStations.reduce((acc, s) => {
    acc[s.ward] = (acc[s.ward] ?? []).concat(s);
    return acc;
  }, {} as Record<string, PollingStation[]>);

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">
          ◆ OUTSTANDING — RESULTS NOT SUBMITTED ({wq.unsubmittedStations.length})
        </div>
        {wq.unsubmittedStations.length === 0 ? (
          <div className="border border-green-500/30 bg-green-500/5 p-4 font-mono text-xs text-green-400">✓ ALL STATIONS SUBMITTED</div>
        ) : (
          <div className="space-y-3">
            {WARDS.map(ward => {
              const wardStations = unsubByWard[ward] ?? [];
              if (wardStations.length === 0) return null;
              return (
                <div key={ward} className="border border-border">
                  <div className="bg-card px-3 py-2 font-mono text-[10px] text-muted-foreground flex justify-between">
                    <span>{ward.toUpperCase()}</span>
                    <span className="text-yellow-400">{wardStations.length} OUTSTANDING</span>
                  </div>
                  {wardStations.map(s => (
                    <div key={s.id} className="px-3 py-2 border-t border-border/50 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{s.code} · {fmt(s.registeredVoters)} voters</div>
                      </div>
                      <button onClick={() => setTab("submit")} className="font-mono text-[10px] text-primary border border-primary/30 px-2 py-0.5 hover:bg-primary/10">SUBMIT</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">
          ◆ PENDING VERIFICATION ({wq.pendingVerification.length})
        </div>
        {wq.pendingVerification.length === 0 ? (
          <div className="border border-green-500/30 bg-green-500/5 p-4 font-mono text-xs text-green-400">✓ ALL SUBMITTED RESULTS VERIFIED</div>
        ) : (
          <div className="space-y-2">
            {wq.pendingVerification.map(r => (
              <div key={r.id} className="border border-blue-400/30 bg-blue-400/5 px-3 py-2 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold">{r.stationCode}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">Submitted {new Date(r.submittedAt).toLocaleTimeString()}</div>
                </div>
                <button onClick={() => setTab("verification")} className="font-mono text-[10px] text-blue-400 border border-blue-400/30 px-2 py-0.5 hover:bg-blue-400/10">VERIFY</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PUBLISH RESULTS TAB ────────────────────────────────────────────────────
function PublishResultsTab() {
  const { data: pub, isLoading } = useGetPublishedResults();
  const { data: summary } = useGetElectionDaySummary();

  if (isLoading) return <div className="font-mono text-xs text-muted-foreground p-4">LOADING...</div>;
  if (!pub) return null;

  const grandTotal = pub.totals.reduce((s, c) => s + (c.totalVotes ?? 0), 0);
  const winner = pub.totals[0];

  return (
    <div className="space-y-6">
      <div className="bg-yellow-400/5 border border-yellow-400/30 p-4 font-mono text-xs">
        <span className="text-yellow-400">◆ DRAFT — VERIFIED RESULTS ONLY</span>
        <span className="text-muted-foreground ml-4">
          {summary?.verifiedStations ?? 0} of {summary?.totalStations ?? 0} stations verified
        </span>
      </div>

      {pub.totals.length === 0 ? (
        <div className="border border-border p-8 text-center font-mono text-xs text-muted-foreground">
          NO VERIFIED RESULTS TO PUBLISH YET
        </div>
      ) : (
        <>
          {winner && (
            <div className="border border-primary/30 bg-primary/5 p-6 text-center">
              <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">LEADING CANDIDATE</div>
              <div className="text-2xl font-bold">{winner.candidateName}</div>
              <div className="font-mono text-sm text-muted-foreground">{winner.party}</div>
              <div className="text-4xl font-bold mt-3">{fmt(winner.totalVotes ?? 0)}</div>
              <div className="font-mono text-[10px] text-muted-foreground mt-1">{pct(winner.totalVotes ?? 0, grandTotal)}% OF VERIFIED VOTES</div>
            </div>
          )}

          <div className="border border-border">
            <div className="bg-card border-b border-border px-4 py-2 font-mono text-[10px] text-muted-foreground tracking-widest">
              VERIFIED RESULTS — {pub.totals[0]?.stationCount ?? 0} STATIONS
            </div>
            <table className="w-full text-sm">
              <thead className="bg-card border-b border-border">
                <tr className="font-mono text-[10px] text-muted-foreground">
                  <th className="text-left px-4 py-2">CANDIDATE</th>
                  <th className="text-left px-4 py-2">PARTY</th>
                  <th className="text-right px-4 py-2">VOTES</th>
                  <th className="text-right px-4 py-2">%</th>
                  <th className="text-right px-4 py-2">STATIONS</th>
                </tr>
              </thead>
              <tbody>
                {pub.totals.map((c, i) => (
                  <tr key={c.candidateName} className={`border-b border-border/50 ${i === 0 ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3 font-semibold">
                      {i === 0 && <span className="text-yellow-400 mr-2">▶</span>}{c.candidateName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.party}</td>
                    <td className="px-4 py-3 text-right font-bold font-mono">{fmt(c.totalVotes ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{pct(c.totalVotes ?? 0, grandTotal)}%</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.stationCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="w-full border border-primary text-primary font-mono text-xs tracking-widest py-3 hover:bg-primary hover:text-white transition-colors">
            ▶ EXPORT OFFICIAL RESULTS DECLARATION
          </button>
        </>
      )}
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "warroom", label: "WAR ROOM", icon: Radio },
  { id: "submit", label: "SUBMIT RESULTS", icon: Send },
  { id: "stations", label: "STATIONS", icon: List },
  { id: "events", label: "EVENTS", icon: AlertTriangle },
  { id: "verification", label: "VERIFICATION", icon: CheckCircle },
  { id: "workqueue", label: "WORKQUEUE", icon: Layers },
  { id: "publish", label: "PUBLISH RESULTS", icon: Shield },
];

export default function ElectionDay() {
  const [tab, setTab] = useState<Tab>("warroom");
  const { data: wq } = useGetElectionDayWorkqueue();
  const { data: summary } = useGetElectionDaySummary();

  const pendingCount = (wq?.unsubmittedStations.length ?? 0) + (wq?.pendingVerification.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-widest flex items-center gap-3">
            <Vote className="w-5 h-5 text-primary" />
            ELECTION DAY OPS
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">VOTES TALLYING & TRANSMISSION — {CAMPAIGN.areaLabel.toUpperCase()}</p>
        </div>
        {summary && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
            <span className={`border px-2 py-1 ${summary.submittedStations === summary.totalStations ? "border-green-400/30 text-green-400" : "border-yellow-400/30 text-yellow-400"}`}>
              {summary.submittedStations}/{summary.totalStations} REPORTED
            </span>
            <span className="border border-green-400/30 text-green-400 px-2 py-1">{summary.verifiedStations} VERIFIED</span>
            {pendingCount > 0 && (
              <span className="border border-red-400/30 text-red-400 px-2 py-1">{pendingCount} PENDING</span>
            )}
          </div>
        )}
      </div>

      <div className="flex border-b border-border overflow-x-auto -mx-1 px-1" role="tablist">
        {TABS.map(t => {
          const Icon = t.icon;
          const badge = t.id === "workqueue" && pendingCount > 0 ? pendingCount : null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 sm:px-4 py-3 font-mono text-[10px] tracking-widest border-b-2 transition-colors ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
              {badge && <span className="bg-red-500 text-white text-[9px] font-bold px-1 rounded-sm">{badge}</span>}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "warroom" && <WarRoomTab />}
        {tab === "submit" && <SubmitResultsTab />}
        {tab === "stations" && <StationsTab />}
        {tab === "events" && <EventsTab />}
        {tab === "verification" && <VerificationTab />}
        {tab === "workqueue" && <WorkqueueTab setTab={setTab} />}
        {tab === "publish" && <PublishResultsTab />}
      </div>
    </div>
  );
}