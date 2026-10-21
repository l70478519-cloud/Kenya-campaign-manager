import { useState, useEffect, useCallback, useRef } from "react";
import {
  useListMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone,
  useGetReadinessScore, useGetElectionCountdown, useSetElectionDate,
  getListMilestonesQueryKey, getGetReadinessScoreQueryKey, getGetElectionCountdownQueryKey
} from "@workspace/api-client-react";
import type { Milestone, MilestoneInput, MilestoneUpdate, ReadinessScore } from "@workspace/api-client-react";

// The API returns fields not yet present in the generated OpenAPI types.
type MilestoneEx = Milestone & { priority?: string | null };
type ReadinessEx = ReadinessScore & { overdueCount?: number };
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Check, Trash2, Clock, AlertTriangle, Target, TrendingUp,
  ChevronDown, ChevronUp, Printer, Download, RefreshCw, Edit2, Save,
  Flag, Users, MapPin, BarChart2, CheckCircle, Circle, AlertCircle, Zap,
  Sparkles, Loader2, Square, CheckSquare, UploadCloud
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const CATEGORIES = ["Ground Game", "Messaging", "Narrative", "Fundraising", "Events", "Polling", "GOTV", "Legal", "Media", "Logistics"];
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["pending", "in_progress", "completed", "overdue"] as const;

const READINESS_DOMAINS = [
  { domain: "Legal & Compliance", items: ["Nomination papers filed", "Party ticket secured", "IEBC clearance obtained", "Running mate confirmed", "Legal team in place"] },
  { domain: "Financial", items: ["Campaign budget approved", "Primary donors secured", "Bank account opened", "Financial controller appointed", "Expenditure tracking active"] },
  { domain: "Ground Game", items: ["All wards have captains", "Volunteer register complete", "Door-to-door campaign started", "All polling stations mapped", "GOTV teams deployed"] },
  { domain: "Messaging & Brand", items: ["Manifesto published", "Campaign slogan adopted", "Social media accounts active", "Campaign website live", "Branded materials printed"] },
  { domain: "Media & PR", items: ["Press team in place", "Local radio spots booked", "Community barazas scheduled", "Media monitoring active", "Crisis comms plan ready"] },
  { domain: "Polling & Intelligence", items: ["Baseline poll conducted", "Opponent tracking active", "Voter sentiment tracked weekly", "Key issues identified", "Swing wards identified"] },
];

type Tab = "overview" | "milestones" | "readiness" | "pacing";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}api/campaign-plan${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function priorityColor(p: string) {
  return p === "critical" ? "text-red-500 border-red-500/40"
    : p === "high" ? "text-orange-400 border-orange-400/30"
    : p === "medium" ? "text-yellow-400 border-yellow-400/30"
    : "text-blue-400 border-blue-400/20";
}
function statusColor(s: string) {
  return s === "completed" ? "text-green-400 border-green-400/30"
    : s === "in_progress" ? "text-blue-400 border-blue-400/30"
    : s === "overdue" ? "text-red-400 border-red-400/30"
    : "text-muted-foreground border-border";
}
function readinessStatusColor(s: string) {
  return s === "done" ? "text-green-400" : s === "in_progress" ? "text-yellow-400" : "text-muted-foreground";
}
function readinessStatusIcon(s: string) {
  return s === "done" ? <CheckCircle className="w-4 h-4 text-green-400" />
    : s === "in_progress" ? <AlertCircle className="w-4 h-4 text-yellow-400" />
    : <Circle className="w-4 h-4 text-muted-foreground/40" />;
}
function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${className}`}>[ {label} ]</span>;
}

function PhaseBar({ daysRemaining }: { daysRemaining: number | null }) {
  const phases = [
    { label: "PLANNING", days: 365, color: "bg-blue-500/60" },
    { label: "PRE-CAMPAIGN", days: 180, color: "bg-cyan-400/60" },
    { label: "ACTIVE CAMPAIGN", days: 90, color: "bg-yellow-400/60" },
    { label: "GOTV", days: 30, color: "bg-orange-400/60" },
    { label: "FINAL PUSH", days: 7, color: "bg-red-500/60" },
    { label: "ELECTION DAY", days: 0, color: "bg-primary" },
  ];
  const current = daysRemaining === null ? null
    : daysRemaining > 180 ? "PLANNING"
    : daysRemaining > 90 ? "PRE-CAMPAIGN"
    : daysRemaining > 30 ? "ACTIVE CAMPAIGN"
    : daysRemaining > 7 ? "GOTV"
    : daysRemaining > 0 ? "FINAL PUSH"
    : "ELECTION DAY";

  return (
    <div className="space-y-2">
      <div className="flex">
        {phases.map((p, i) => (
          <div key={p.label} className={`flex-1 text-center ${i < phases.length - 1 ? "border-r border-background" : ""}`}>
            <div className={`h-6 flex items-center justify-center font-mono text-[8px] transition-all ${p.color} ${current === p.label ? "opacity-100 ring-1 ring-white/40" : "opacity-40"}`}>
              {p.label}
            </div>
          </div>
        ))}
      </div>
      {current && <p className="font-mono text-[10px] text-center text-muted-foreground">CURRENT PHASE: <span className="text-foreground">{current}</span></p>}
    </div>
  );
}

export default function CampaignPlan() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [electionDate, setElectionDate] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<MilestoneInput & { priority: string; startDate: string; notes: string }>>({ category: CATEGORIES[0], priority: "medium" });
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const printRef = useRef<HTMLDivElement>(null);

  // Readiness
  const [readinessItems, setReadinessItems] = useState<any[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [showAddReadiness, setShowAddReadiness] = useState(false);
  const [readinessForm, setReadinessForm] = useState({ domain: READINESS_DOMAINS[0].domain, item: "", weight: "medium" });

  // Alerts
  const [alerts, setAlerts] = useState<any>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);

  // AI Readiness generation
  const [showAiReadiness, setShowAiReadiness] = useState(false);
  const [aiReadinessLoading, setAiReadinessLoading] = useState(false);
  const [aiReadinessError, setAiReadinessError] = useState<string | null>(null);
  const [aiReadinessList, setAiReadinessList] = useState<any[]>([]);
  const [aiReadinessSelected, setAiReadinessSelected] = useState<Set<number>>(new Set());
  const [aiReadinessLoadingInto, setAiReadinessLoadingInto] = useState(false);
  const [aiReadinessLoaded, setAiReadinessLoaded] = useState(0);

  // AI Plan generation
  const [showAiPlan, setShowAiPlan] = useState(false);
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlanError, setAiPlanError] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<any[]>([]);
  const [aiPlanSelected, setAiPlanSelected] = useState<Set<number>>(new Set());
  const [aiPlanLoadingInto, setAiPlanLoadingInto] = useState(false);
  const [aiPlanLoaded, setAiPlanLoaded] = useState(0);

  const { data: milestones, isLoading } = useListMilestones();
  const { data: readiness } = useGetReadinessScore();
  const { data: countdown } = useGetElectionCountdown();
  const createMilestone = useCreateMilestone({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMilestonesQueryKey() }); qc.invalidateQueries({ queryKey: getGetReadinessScoreQueryKey() }); setShowAdd(false); setForm({ category: CATEGORIES[0], priority: "medium" }); } } });
  const updateMilestone = useUpdateMilestone({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMilestonesQueryKey() }); qc.invalidateQueries({ queryKey: getGetReadinessScoreQueryKey() }); setEditingId(null); } } });
  const deleteMilestone = useDeleteMilestone({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMilestonesQueryKey() }); qc.invalidateQueries({ queryKey: getGetReadinessScoreQueryKey() }); } } });
  const setElectionDateMutation = useSetElectionDate({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetElectionCountdownQueryKey() }) } });

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try { setReadinessItems(await apiFetch("/candidate-readiness")); } catch { } finally { setReadinessLoading(false); }
  }, []);
  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try { setAlerts(await apiFetch("/alerts")); } catch { } finally { setAlertsLoading(false); }
  }, []);

  useEffect(() => { if (tab === "readiness") loadReadiness(); }, [tab, loadReadiness]);
  useEffect(() => { if (tab === "pacing") { loadAlerts(); } }, [tab, loadAlerts]);

  async function initReadiness() {
    for (const domain of READINESS_DOMAINS) {
      for (const item of domain.items) {
        await apiFetch("/candidate-readiness", { method: "POST", body: JSON.stringify({ domain: domain.domain, item, weight: "medium" }) });
      }
    }
    await loadReadiness();
  }

  async function addReadinessItem() {
    if (!readinessForm.item.trim()) return;
    await apiFetch("/candidate-readiness", { method: "POST", body: JSON.stringify(readinessForm) });
    await loadReadiness();
    setShowAddReadiness(false);
    setReadinessForm({ domain: READINESS_DOMAINS[0].domain, item: "", weight: "medium" });
  }

  async function updateReadinessStatus(id: number, status: string) {
    await apiFetch(`/candidate-readiness/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadReadiness();
  }

  async function updateReadinessNotes(id: number, notes: string) {
    await apiFetch(`/candidate-readiness/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
    await loadReadiness();
  }

  async function deleteReadinessItem(id: number) {
    await apiFetch(`/candidate-readiness/${id}`, { method: "DELETE" });
    await loadReadiness();
  }

  async function generateAiReadiness() {
    setAiReadinessLoading(true);
    setAiReadinessError(null);
    setAiReadinessList([]);
    setAiReadinessLoaded(0);
    try {
      const res = await fetch(`${BASE}api/ai/generate-readiness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const items: any[] = data.items ?? [];
      setAiReadinessList(items);
      setAiReadinessSelected(new Set(items.map((_: any, i: number) => i)));
    } catch (_err) {
      setAiReadinessError("AI generation failed. Please retry.");
    } finally {
      setAiReadinessLoading(false);
    }
  }

  async function loadReadinessIntoChecklist() {
    const selected = aiReadinessList.filter((_, i) => aiReadinessSelected.has(i));
    if (selected.length === 0) return;
    setAiReadinessLoadingInto(true);
    let loaded = 0;
    try {
      for (const r of selected) {
        await apiFetch("/candidate-readiness", {
          method: "POST",
          body: JSON.stringify({ domain: r.domain, item: r.item, weight: r.weight ?? "medium" }),
        });
        loaded++;
        setAiReadinessLoaded(loaded);
      }
      await loadReadiness();
      setTimeout(() => {
        setShowAiReadiness(false);
        setAiReadinessList([]);
        setAiReadinessSelected(new Set());
        setAiReadinessLoaded(0);
      }, 800);
    } catch (_err) {
      setAiReadinessError("Failed to load some items. Please retry.");
    } finally {
      setAiReadinessLoadingInto(false);
    }
  }

  async function generateAiPlan() {
    setAiPlanLoading(true);
    setAiPlanError(null);
    setAiPlan([]);
    setAiPlanLoaded(0);
    try {
      const res = await fetch(`${BASE}api/ai/generate-campaign-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionDate: countdown?.electionDate ?? "2027-08-09" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const plan: any[] = data.milestones ?? [];
      setAiPlan(plan);
      setAiPlanSelected(new Set(plan.map((_: any, i: number) => i)));
    } catch (_err) {
      setAiPlanError("AI plan generation failed. Please retry.");
    } finally {
      setAiPlanLoading(false);
    }
  }

  async function loadSelectedIntoTracker() {
    const selected = aiPlan.filter((_, i) => aiPlanSelected.has(i));
    if (selected.length === 0) return;
    setAiPlanLoadingInto(true);
    let loaded = 0;
    try {
      for (const m of selected) {
        await fetch(`${BASE}api/campaign-plan/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: m.title,
            description: m.description,
            dueDate: m.dueDate,
            category: m.category,
            priority: m.priority,
            owner: m.owner,
          }),
        });
        loaded++;
        setAiPlanLoaded(loaded);
      }
      qc.invalidateQueries({ queryKey: getListMilestonesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetReadinessScoreQueryKey() });
      setTimeout(() => {
        setShowAiPlan(false);
        setAiPlan([]);
        setAiPlanSelected(new Set());
        setAiPlanLoaded(0);
      }, 1000);
    } catch (_err) {
      setAiPlanError("Failed to load some milestones. Please retry.");
    } finally {
      setAiPlanLoadingInto(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  async function handleDownload() {
    const report = await apiFetch("/report");
    const lines: string[] = [
      "═══════════════════════════════════════════════════════",
      "  MAKUENI COMMAND CENTRE — COUNTY PROJECT PLAN REPORT",
      "  MAKUENI COUNTY · PROJECT DELIVERY PLAN",
      "═══════════════════════════════════════════════════════",
      `  Generated: ${new Date().toLocaleString("en-KE")}`,
      `  Election Date: ${report.electionDate ?? "Not set"}`,
      `  Days to Election: ${report.daysToElection ?? "—"}`,
      "",
      "  MILESTONE SUMMARY",
      `  Total: ${report.stats.total}  Completed: ${report.stats.completed}  In Progress: ${report.stats.inProgress}  Overdue: ${report.stats.overdue}`,
      "",
      "═══════════════════════════════════════════════════════",
      "  MILESTONES",
      "═══════════════════════════════════════════════════════",
    ];
    const grouped: Record<string, any[]> = {};
    for (const m of report.milestones) {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m);
    }
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`\n  ── ${cat.toUpperCase()} ──`);
      for (const m of items as any[]) {
        const status = m.status.replace("_", " ").toUpperCase().padEnd(12);
        const priority = m.priority.toUpperCase().padEnd(8);
        lines.push(`  [${status}] [${priority}] ${m.title}`);
        if (m.description) lines.push(`    ${m.description}`);
        lines.push(`    Due: ${m.dueDate}${m.owner ? `  Owner: ${m.owner}` : ""}`);
        if (m.notes) lines.push(`    Notes: ${m.notes}`);
      }
    }
    if (report.readiness.length > 0) {
      lines.push("", "═══════════════════════════════════════════════════════");
      lines.push("  CANDIDATE READINESS CHECKLIST");
      lines.push("═══════════════════════════════════════════════════════");
      const rGrouped: Record<string, any[]> = {};
      for (const r of report.readiness) {
        if (!rGrouped[r.domain]) rGrouped[r.domain] = [];
        rGrouped[r.domain].push(r);
      }
      for (const [domain, items] of Object.entries(rGrouped)) {
        const done = (items as any[]).filter(i => i.status === "done").length;
        lines.push(`\n  ── ${domain} (${done}/${items.length}) ──`);
        for (const r of items as any[]) {
          const tick = r.status === "done" ? "[✓]" : r.status === "in_progress" ? "[~]" : "[ ]";
          lines.push(`  ${tick} ${r.item}`);
          if (r.notes) lines.push(`      → ${r.notes}`);
        }
      }
    }
    lines.push("", "═══════════════════════════════════════════════════════");
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-plan-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const grouped: Record<string, typeof milestones> = {};
  if (milestones) {
    for (const m of milestones) {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category]!.push(m);
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const filteredMilestones = (milestones ?? []).filter(m => {
    if (filterCat !== "all" && m.category !== filterCat) return false;
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    return true;
  });

  const readinessByDomain: Record<string, any[]> = {};
  for (const r of readinessItems) {
    if (!readinessByDomain[r.domain]) readinessByDomain[r.domain] = [];
    readinessByDomain[r.domain].push(r);
  }
  const readinessPct = readinessItems.length > 0
    ? Math.round((readinessItems.filter(r => r.status === "done").length / readinessItems.length) * 100)
    : 0;

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "OVERVIEW", icon: <Target className="w-3 h-3" /> },
    { id: "milestones", label: "MILESTONES", icon: <Flag className="w-3 h-3" /> },
    { id: "readiness", label: "CANDIDATE READINESS", icon: <CheckCircle className="w-3 h-3" /> },
    { id: "pacing", label: "PACING & ALERTS", icon: <Zap className="w-3 h-3" /> },
  ];

  return (
    <>
      {/* Print stylesheet */}
      <style>{`
        @media print {
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; }
          .no-print { display: none !important; }
          * { color: black !important; background: white !important; border-color: #ccc !important; }
          .print-break { page-break-before: always; }
        }
      `}</style>

      <div id="print-root" className="space-y-4" ref={printRef}>
        {/* Header */}
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-xl font-bold tracking-widest">COUNTY PROJECT DELIVERY</h1>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">MISSION PLANNING · MILESTONES · READINESS · MAKUENI COUNTY</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><Printer className="w-3 h-3" /> PRINT</button>
            <button onClick={handleDownload} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><Download className="w-3 h-3" /> DOWNLOAD</button>
            {tab === "milestones" && (
              <>
                <button
                  onClick={() => { setShowAiPlan(v => !v); if (!showAiPlan && aiPlan.length === 0) generateAiPlan(); }}
                  className="flex items-center gap-2 border border-primary/50 text-primary px-4 py-2 font-mono text-xs hover:bg-primary/10"
                >
                  <Sparkles className="w-3 h-3" /> AI PLAN
                </button>
                <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> ADD MILESTONE</button>
              </>
            )}
          </div>
        </div>

        {/* Print header (only visible when printing) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">MAKUENI COMMAND CENTRE — CAMPAIGN PLAN</h1>
          <p className="text-sm">Makueni County · Project Delivery · Generated {new Date().toLocaleString("en-KE")}</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 no-print">
          {[
            { label: "DAYS LEFT", value: countdown?.daysRemaining ?? "—", color: (countdown?.daysRemaining ?? 999) <= 30 ? "text-red-400 animate-pulse" : "text-primary" },
            { label: "TOTAL MILESTONES", value: milestones?.length ?? 0, color: "text-foreground" },
            { label: "COMPLETED", value: milestones?.filter(m => m.status === "completed").length ?? 0, color: "text-green-400" },
            { label: "IN PROGRESS", value: milestones?.filter(m => m.status === "in_progress").length ?? 0, color: "text-blue-400" },
            { label: "OVERDUE", value: milestones?.filter(m => m.status !== "completed" && m.dueDate < todayStr).length ?? 0, color: "text-red-400" },
            { label: "READINESS SCORE", value: readiness ? `${readiness.overall}%` : "—", color: (readiness?.overall ?? 0) >= 70 ? "text-green-400" : (readiness?.overall ?? 0) >= 40 ? "text-yellow-400" : "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border p-3">
              <p className="font-mono text-[9px] text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 no-print">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 font-mono text-[10px] border px-4 py-2 transition-colors ${tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ─── OVERVIEW ─── */}
        {tab === "overview" && (
          <div className="space-y-4">
            {/* Countdown clock */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-border p-6 text-center">
                {countdown?.daysRemaining != null ? (
                  <>
                    <div className={`text-7xl font-bold tabular-nums ${countdown.daysRemaining <= 30 ? "text-red-400 animate-pulse" : countdown.daysRemaining <= 90 ? "text-orange-400" : "text-primary"}`}>{countdown.daysRemaining}</div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-2 tracking-widest">DAYS TO ELECTION</div>
                    <div className={`font-mono text-[10px] mt-2 px-2 py-0.5 border inline-block ${countdown.daysRemaining <= 7 ? "text-red-400 border-red-400/30 animate-pulse" : "text-muted-foreground border-border"}`}>[ {countdown.phase.replace("_", " ").toUpperCase()} ]</div>
                    {countdown.electionDate && <div className="font-mono text-[10px] text-muted-foreground mt-2">ELECTION: {countdown.electionDate}</div>}
                    <button onClick={() => setElectionDate(countdown.electionDate ?? "")} className="mt-3 font-mono text-[9px] text-muted-foreground hover:text-foreground underline">CHANGE DATE</button>
                  </>
                ) : (
                  <div>
                    <p className="font-mono text-[10px] text-muted-foreground mb-3">SET ELECTION DATE</p>
                    <div className="flex gap-2">
                      <input type="date" value={electionDate} onChange={e => setElectionDate(e.target.value)} className="flex-1 bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                      <button onClick={() => electionDate && setElectionDateMutation.mutate({ data: { electionDate } })} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-xs hover:bg-primary/90">SET</button>
                    </div>
                  </div>
                )}
                {electionDate && countdown?.daysRemaining != null && (
                  <div className="mt-3 flex gap-2">
                    <input type="date" value={electionDate} onChange={e => setElectionDate(e.target.value)} className="flex-1 bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary" />
                    <button onClick={() => electionDate && setElectionDateMutation.mutate({ data: { electionDate } })} className="bg-primary text-primary-foreground px-2 py-1 font-mono text-[9px] hover:bg-primary/90">UPDATE</button>
                  </div>
                )}
              </div>

              {/* Readiness score */}
              <div className="bg-card border border-border p-4">
                <p className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">MILESTONE READINESS</p>
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-5xl font-bold">{readiness?.overall ?? 0}</span>
                  <span className="text-xl text-muted-foreground pb-1">%</span>
                </div>
                <div className="h-2 bg-secondary mb-3">
                  <div className={`h-full transition-all ${(readiness?.overall ?? 0) >= 70 ? "bg-green-400" : (readiness?.overall ?? 0) >= 40 ? "bg-yellow-400" : "bg-red-400"}`} style={{ width: `${readiness?.overall ?? 0}%` }} />
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">{readiness?.completedMilestones ?? 0}/{readiness?.totalMilestones ?? 0} MILESTONES COMPLETE</p>
                {((readiness as ReadinessEx | undefined)?.overdueCount ?? 0) > 0 && <p className="font-mono text-[10px] text-red-400 mt-1">⚠ {(readiness as ReadinessEx | undefined)?.overdueCount} OVERDUE</p>}
              </div>

              {/* By category */}
              <div className="bg-card border border-border p-4">
                <p className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">PROGRESS BY CATEGORY</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {(readiness?.byCategory ?? []).map((c: any) => (
                    <div key={c.category} className="space-y-0.5">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground truncate">{c.category.toUpperCase()}</span>
                        <div className="flex items-center gap-2">
                          {c.overdue > 0 && <span className="text-red-400">⚠{c.overdue}</span>}
                          <span>{c.score}%</span>
                        </div>
                      </div>
                      <div className="h-1 bg-secondary">
                        <div className={`h-full transition-all ${c.score === 100 ? "bg-green-400" : c.score >= 50 ? "bg-primary" : c.overdue > 0 ? "bg-red-400/60" : "bg-primary/60"}`} style={{ width: `${c.score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Phase timeline */}
            <div className="bg-card border border-border p-4">
              <p className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">CAMPAIGN PHASE TIMELINE</p>
              <PhaseBar daysRemaining={countdown?.daysRemaining ?? null} />
            </div>

            {/* Upcoming milestones */}
            <div className="bg-card border border-border">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Clock className="w-3 h-3 text-primary" />
                <span className="font-mono text-[10px] tracking-widest">UPCOMING MILESTONES (NEXT 30 DAYS)</span>
              </div>
              <div className="divide-y divide-border">
                {(milestones ?? []).filter(m => m.status !== "completed" && m.dueDate >= todayStr && m.dueDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).length === 0 ? (
                  <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_UPCOMING_MILESTONES ]</div>
                ) : (milestones ?? []).filter(m => m.status !== "completed" && m.dueDate >= todayStr && m.dueDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).slice(0, 8).map(m => (
                  <div key={m.id} className="flex items-center gap-4 px-4 py-2.5">
                    <Badge label={((m as MilestoneEx).priority ?? "medium").toUpperCase()} className={priorityColor((m as MilestoneEx).priority ?? "medium")} />
                    <div className="flex-1">
                      <p className="text-sm">{m.title}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">{m.category}</p>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{m.owner ?? "—"}</span>
                    <span className={`font-mono text-[10px] ${m.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) ? "text-orange-400" : "text-muted-foreground"}`}>{m.dueDate}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Campaign Command Structure */}
            <div className="bg-card border border-border">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Users className="w-3 h-3 text-primary" />
                <span className="font-mono text-[10px] tracking-widest">CAMPAIGN COMMAND STRUCTURE</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-border">
                {[
                  { role: "CAMPAIGN MANAGER" },
                  { role: "DEPUTY CAMPAIGN MANAGER" },
                  { role: "COMMUNICATIONS DIRECTOR" },
                  { role: "FINANCE DIRECTOR" },
                  { role: "VOLUNTEER COORDINATOR" },
                  { role: "LEGAL TEAM" },
                  { role: "ICT / DIGITAL TEAM" },
                ].map(({ role }, i) => (
                  <div key={role} className={`px-4 py-3 border-b border-r border-border ${i % 4 === 3 ? "border-r-0" : ""}`}>
                    <p className="font-mono text-[8px] text-muted-foreground tracking-widest">{role}</p>
                    <p className="font-mono text-xs font-bold tracking-wide mt-0.5">&nbsp;</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Campaign Pillars */}
            <div className="bg-card border border-border">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Target className="w-3 h-3 text-primary" />
                <span className="font-mono text-[10px] tracking-widest">CAMPAIGN PILLARS</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y divide-border">
                {[
                  { num: "01", title: "Grassroots Socioeconomic Empowerment", detail: "Youth & women empowerment, welfare support, bodaboda & table-banking initiatives, bursaries" },
                  { num: "02", title: "Infrastructural Development", detail: "Roads, water, electricity, schools and health facility infrastructure across all 5 wards" },
                  { num: "03", title: "Constitutional Mandate Execution", detail: "Effective legislation, representation and parliamentary oversight duties" },
                  { num: "04", title: "Local Patronage", detail: "Direct constituency presence, barazas, market engagements and ward-level accessibility" },
                ].map(({ num, title, detail }) => (
                  <div key={num} className="px-4 py-3 flex gap-3">
                    <span className="font-mono text-[10px] text-primary font-bold shrink-0">{num}</span>
                    <div>
                      <p className="font-mono text-[10px] font-semibold text-foreground">{title.toUpperCase()}</p>
                      <p className="font-mono text-[9px] text-muted-foreground mt-0.5">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vision & Mission */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "VISION", text: "" },
                { label: "MISSION", text: "" },
              ].map(({ label, text }) => (
                <div key={label} className="bg-card border border-border p-4">
                  <p className="font-mono text-[9px] text-primary tracking-widest mb-2">{label} STATEMENT</p>
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">{text}</p>
                </div>
              ))}
            </div>

            {/* Overdue */}
            {(milestones ?? []).some(m => m.status !== "completed" && m.dueDate < todayStr) && (
              <div className="bg-card border border-red-400/30">
                <div className="px-4 py-3 border-b border-red-400/20 flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span className="font-mono text-[10px] tracking-widest text-red-400">OVERDUE MILESTONES</span>
                </div>
                <div className="divide-y divide-border">
                  {(milestones ?? []).filter(m => m.status !== "completed" && m.dueDate < todayStr).map(m => (
                    <div key={m.id} className="flex items-center gap-4 px-4 py-2.5">
                      <Badge label={(m.status as string).replace("_", " ").toUpperCase()} className={statusColor(m.status as string)} />
                      <div className="flex-1">
                        <p className="text-sm">{m.title}</p>
                        <p className="font-mono text-[9px] text-muted-foreground">{m.category}</p>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{m.owner ?? "—"}</span>
                      <span className="font-mono text-[10px] text-red-400">{m.dueDate}</span>
                      <select value={m.status} onChange={e => updateMilestone.mutate({ id: m.id, data: { status: e.target.value as any } })} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
                        {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── MILESTONES ─── */}
        {tab === "milestones" && (
          <div className="space-y-3">

            {/* AI Plan Panel */}
            {showAiPlan && (
              <div className="bg-card border border-primary/40 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-primary" />
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="font-mono text-xs font-bold tracking-widest text-primary">AI GENERATED CAMPAIGN PLAN</span>
                    {aiPlan.length > 0 && !aiPlanLoading && (
                      <span className="font-mono text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground">
                        {aiPlanSelected.size}/{aiPlan.length} SELECTED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {aiPlan.length > 0 && !aiPlanLoading && (
                      <>
                        <button
                          onClick={() => setAiPlanSelected(aiPlanSelected.size === aiPlan.length ? new Set() : new Set(aiPlan.map((_, i) => i)))}
                          className="font-mono text-[9px] text-muted-foreground hover:text-foreground border border-border px-2 py-1"
                        >
                          {aiPlanSelected.size === aiPlan.length ? "DESELECT ALL" : "SELECT ALL"}
                        </button>
                        <button
                          onClick={generateAiPlan}
                          className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground hover:text-foreground border border-border px-2 py-1"
                        >
                          <RefreshCw className="w-2.5 h-2.5" /> REGENERATE
                        </button>
                      </>
                    )}
                    <button onClick={() => setShowAiPlan(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Loading state */}
                {aiPlanLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <p className="font-mono text-[10px] text-muted-foreground tracking-widest">GENERATING CAMPAIGN PLAN · ACL AI</p>
                  </div>
                )}

                {/* Error state */}
                {aiPlanError && !aiPlanLoading && (
                  <div className="px-4 py-4 flex items-center justify-between">
                    <p className="font-mono text-[10px] text-red-400">⚠ {aiPlanError}</p>
                    <button onClick={generateAiPlan} className="font-mono text-[10px] text-primary hover:underline">RETRY</button>
                  </div>
                )}

                {/* Milestone list */}
                {!aiPlanLoading && aiPlan.length > 0 && (
                  <>
                    <div className="max-h-80 overflow-y-auto divide-y divide-border">
                      {aiPlan.map((m, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            const next = new Set(aiPlanSelected);
                            if (next.has(i)) next.delete(i); else next.add(i);
                            setAiPlanSelected(next);
                          }}
                          className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors ${aiPlanSelected.has(i) ? "bg-primary/5 hover:bg-primary/10" : "opacity-40 hover:opacity-60"}`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {aiPlanSelected.has(i)
                              ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                              : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-mono text-[11px] font-semibold text-foreground">{m.title}</p>
                              <span className={`font-mono text-[8px] border px-1 py-0.5 ${priorityColor(m.priority)}`}>
                                {(m.priority ?? "medium").toUpperCase()}
                              </span>
                            </div>
                            {m.description && (
                              <p className="font-mono text-[9px] text-muted-foreground mt-0.5 leading-relaxed">{m.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="font-mono text-[8px] text-primary/80">{m.category}</span>
                              <span className="font-mono text-[8px] text-muted-foreground">DUE {m.dueDate}</span>
                              {m.owner && <span className="font-mono text-[8px] text-muted-foreground">→ {m.owner}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer action */}
                    <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-primary/5">
                      <p className="font-mono text-[9px] text-muted-foreground">
                        {aiPlanLoadingInto
                          ? `LOADING ${aiPlanLoaded}/${aiPlanSelected.size} MILESTONES...`
                          : `${aiPlanSelected.size} MILESTONE${aiPlanSelected.size !== 1 ? "S" : ""} SELECTED FOR IMPORT`}
                      </p>
                      <button
                        onClick={loadSelectedIntoTracker}
                        disabled={aiPlanLoadingInto || aiPlanSelected.size === 0}
                        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {aiPlanLoadingInto
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> LOADING...</>
                          : <><UploadCloud className="w-3 h-3" /> LOAD INTO TRACKER</>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {showAdd && (
              <div className="bg-card border border-primary/50 p-4">
                <h3 className="font-mono text-xs tracking-widest mb-4">NEW MILESTONE</h3>
                <form onSubmit={e => { e.preventDefault(); createMilestone.mutate({ data: form as MilestoneInput }); }} className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">TITLE *</label>
                    <input required value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">PRIORITY</label>
                    <select value={(form as any).priority ?? "medium"} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {PRIORITIES.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">CATEGORY *</label>
                    <select required value={form.category ?? ""} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">START DATE</label>
                    <input type="date" value={(form as any).startDate ?? ""} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">DUE DATE *</label>
                    <input required type="date" value={form.dueDate ?? ""} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">OWNER</label>
                    <input value={form.owner ?? ""} onChange={e => setForm(p => ({ ...p, owner: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</label>
                    <input value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">NOTES</label>
                    <input value={(form as any).notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-3 flex gap-2 justify-end">
                    <button type="button" onClick={() => { setShowAdd(false); setForm({ category: CATEGORIES[0], priority: "medium" }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                    <button type="submit" disabled={createMilestone.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Check className="w-3 h-3" /> ADD MILESTONE</button>
                  </div>
                </form>
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground">FILTER:</span>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
                <option value="all">ALL CATEGORIES</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-1">
                {["all", ...STATUSES].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} className={`font-mono text-[10px] px-2 py-1 border transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{s.replace("_", " ").toUpperCase()}</button>
                ))}
              </div>
              <button onClick={() => { setFilterCat("all"); setFilterStatus("all"); }} className="ml-auto font-mono text-[10px] text-muted-foreground hover:text-foreground">CLEAR</button>
            </div>

            {isLoading ? (
              <div className="animate-pulse bg-card border border-border h-40" />
            ) : filteredMilestones.length === 0 ? (
              <div className="bg-card border border-border flex items-center justify-center py-12">
                <p className="font-mono text-xs text-muted-foreground">[ NO_MILESTONES ]</p>
              </div>
            ) : (
              Object.entries(
                filteredMilestones.reduce((acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; }, {} as Record<string, typeof filteredMilestones>)
              ).map(([category, items]) => (
                <div key={category} className="bg-card border border-border">
                  <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground tracking-widest">{category.toUpperCase()}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{items.filter(i => i.status === "completed").length}/{items.length} DONE</span>
                  </div>
                  <div className="divide-y divide-border">
                    {items.map(m => (
                      <div key={m.id}>
                        {editingId === m.id ? (
                          <div className="p-4 bg-secondary space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                              <div className="col-span-2">
                                <input value={editForm.title ?? ""} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                              </div>
                              <select value={editForm.priority ?? "medium"} onChange={e => setEditForm(p => ({ ...p, priority: e.target.value }))} className="bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                                {PRIORITIES.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                              </select>
                              <input type="date" value={editForm.startDate ?? ""} onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))} className="bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                              <input type="date" value={editForm.dueDate ?? ""} onChange={e => setEditForm(p => ({ ...p, dueDate: e.target.value }))} className="bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                              <input value={editForm.owner ?? ""} onChange={e => setEditForm(p => ({ ...p, owner: e.target.value }))} placeholder="Owner" className="bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                              <div className="col-span-2">
                                <input value={editForm.description ?? ""} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                              </div>
                              <input value={editForm.notes ?? ""} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-card">CANCEL</button>
                              <button onClick={() => updateMilestone.mutate({ id: m.id, data: editForm as MilestoneUpdate })} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px]"><Save className="w-3 h-3 inline mr-1" /> SAVE</button>
                            </div>
                          </div>
                        ) : (
                          <div className={`flex items-center gap-3 px-4 py-3 ${m.status !== "completed" && m.dueDate < todayStr ? "bg-red-400/5" : ""}`}>
                            <Badge label={((m as MilestoneEx).priority ?? "medium").toUpperCase()} className={priorityColor((m as MilestoneEx).priority ?? "medium")} />
                            <Badge label={(m.status as string).replace("_", " ").toUpperCase()} className={statusColor(m.status as string)} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${m.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{m.title}</p>
                              {m.description && <p className="text-[10px] text-muted-foreground truncate">{m.description}</p>}
                              {(m as any).notes && <p className="text-[10px] text-muted-foreground/60 italic truncate">Note: {(m as any).notes}</p>}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {m.owner && <span className="font-mono text-[10px] text-muted-foreground">{m.owner}</span>}
                              {(m as any).startDate && <span className="font-mono text-[10px] text-muted-foreground/60">{(m as any).startDate} →</span>}
                              <span className={`font-mono text-[10px] ${m.status !== "completed" && m.dueDate < todayStr ? "text-red-400" : "text-muted-foreground"}`}>{m.dueDate}</span>
                              <select value={m.status} onChange={e => updateMilestone.mutate({ id: m.id, data: { status: e.target.value as any } })} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
                                {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>)}
                              </select>
                              <button onClick={() => { setEditingId(m.id); setEditForm({ title: m.title, description: m.description, dueDate: m.dueDate, startDate: (m as any).startDate, category: m.category, priority: (m as any).priority ?? "medium", owner: m.owner, notes: (m as any).notes }); }} className="text-muted-foreground hover:text-foreground"><Edit2 className="w-3 h-3" /></button>
                              <button onClick={() => { if (confirm("Delete?")) deleteMilestone.mutate({ id: m.id }); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── CANDIDATE READINESS ─── */}
        {tab === "readiness" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-card border border-border px-4 py-2">
                  <span className="font-mono text-[10px] text-muted-foreground">OVERALL READINESS: </span>
                  <span className={`font-mono text-sm font-bold ${readinessPct >= 70 ? "text-green-400" : readinessPct >= 40 ? "text-yellow-400" : "text-red-400"}`}>{readinessPct}%</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">{readinessItems.filter(r => r.status === "done").length}/{readinessItems.length} ITEMS COMPLETE</div>
              </div>
              <div className="flex gap-2">
                {readinessItems.length === 0 && (
                  <button onClick={initReadiness} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><Zap className="w-3 h-3" /> LOAD DEFAULT CHECKLIST</button>
                )}
                <button
                  onClick={() => { setShowAiReadiness(v => !v); if (!showAiReadiness && aiReadinessList.length === 0) generateAiReadiness(); }}
                  className="flex items-center gap-2 border border-primary/50 text-primary px-4 py-2 font-mono text-xs hover:bg-primary/10"
                >
                  <Sparkles className="w-3 h-3" /> AI GENERATE
                </button>
                <button onClick={() => setShowAddReadiness(v => !v)} className="flex items-center gap-2 border border-primary/30 text-primary px-4 py-2 font-mono text-xs hover:bg-primary/10"><Plus className="w-3 h-3" /> ADD ITEM</button>
                <button onClick={loadReadiness} className="flex items-center gap-2 border border-border px-3 py-2 font-mono text-xs hover:bg-secondary"><RefreshCw className="w-3 h-3" /></button>
              </div>
            </div>

            {/* AI Readiness Panel */}
            {showAiReadiness && (
              <div className="bg-card border border-primary/40 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-primary" />
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="font-mono text-xs font-bold tracking-widest text-primary">AI GENERATED READINESS CHECKLIST</span>
                    {aiReadinessList.length > 0 && !aiReadinessLoading && (
                      <span className="font-mono text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground">
                        {aiReadinessSelected.size}/{aiReadinessList.length} SELECTED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {aiReadinessList.length > 0 && !aiReadinessLoading && (
                      <>
                        <button
                          onClick={() => setAiReadinessSelected(aiReadinessSelected.size === aiReadinessList.length ? new Set() : new Set(aiReadinessList.map((_: any, i: number) => i)))}
                          className="font-mono text-[9px] text-muted-foreground hover:text-foreground border border-border px-2 py-1"
                        >
                          {aiReadinessSelected.size === aiReadinessList.length ? "DESELECT ALL" : "SELECT ALL"}
                        </button>
                        <button
                          onClick={generateAiReadiness}
                          className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground hover:text-foreground border border-border px-2 py-1"
                        >
                          <RefreshCw className="w-2.5 h-2.5" /> REGENERATE
                        </button>
                      </>
                    )}
                    <button onClick={() => setShowAiReadiness(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {aiReadinessLoading && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <p className="font-mono text-[10px] text-muted-foreground tracking-widest">GENERATING READINESS CHECKLIST · ACL AI</p>
                    <p className="font-mono text-[9px] text-muted-foreground/60">Analysing candidate profile, constituency data and campaign context…</p>
                  </div>
                )}

                {aiReadinessError && !aiReadinessLoading && (
                  <div className="px-4 py-4 flex items-center justify-between">
                    <p className="font-mono text-[10px] text-red-400">⚠ {aiReadinessError}</p>
                    <button onClick={generateAiReadiness} className="font-mono text-[10px] text-primary hover:underline">RETRY</button>
                  </div>
                )}

                {!aiReadinessLoading && aiReadinessList.length > 0 && (() => {
                  const byDomain: Record<string, { item: any; idx: number }[]> = {};
                  aiReadinessList.forEach((r, i) => {
                    if (!byDomain[r.domain]) byDomain[r.domain] = [];
                    byDomain[r.domain].push({ item: r, idx: i });
                  });
                  return (
                    <>
                      <div className="max-h-96 overflow-y-auto">
                        {Object.entries(byDomain).map(([domain, entries]) => (
                          <div key={domain}>
                            <div className="px-4 py-2 border-b border-t border-border bg-secondary/30 flex items-center justify-between">
                              <span className="font-mono text-[9px] tracking-widest text-muted-foreground">{domain.toUpperCase()}</span>
                              <span className="font-mono text-[9px] text-muted-foreground">{entries.filter(e => aiReadinessSelected.has(e.idx)).length}/{entries.length}</span>
                            </div>
                            {entries.map(({ item: r, idx: i }) => (
                              <div
                                key={i}
                                onClick={() => {
                                  const next = new Set(aiReadinessSelected);
                                  if (next.has(i)) next.delete(i); else next.add(i);
                                  setAiReadinessSelected(next);
                                }}
                                className={`flex items-start gap-3 px-4 py-2 cursor-pointer transition-colors border-b border-border/40 ${aiReadinessSelected.has(i) ? "hover:bg-primary/5" : "opacity-40 hover:opacity-60"}`}
                              >
                                <div className="shrink-0 mt-0.5">
                                  {aiReadinessSelected.has(i)
                                    ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                                    : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-mono text-[11px] text-foreground leading-snug">{r.item}</p>
                                  {r.notes && <p className="font-mono text-[9px] text-muted-foreground mt-0.5 italic">{r.notes}</p>}
                                </div>
                                <span className={`font-mono text-[8px] border px-1 py-0.5 shrink-0 mt-0.5 ${r.weight === "high" ? "border-red-400/40 text-red-400" : r.weight === "medium" ? "border-yellow-400/40 text-yellow-400" : "border-border text-muted-foreground"}`}>
                                  {(r.weight ?? "medium").toUpperCase()}
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-primary/5">
                        <p className="font-mono text-[9px] text-muted-foreground">
                          {aiReadinessLoadingInto
                            ? `LOADING ${aiReadinessLoaded}/${aiReadinessSelected.size} ITEMS...`
                            : `${aiReadinessSelected.size} ITEM${aiReadinessSelected.size !== 1 ? "S" : ""} SELECTED FOR IMPORT`}
                        </p>
                        <button
                          onClick={loadReadinessIntoChecklist}
                          disabled={aiReadinessLoadingInto || aiReadinessSelected.size === 0}
                          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-50"
                        >
                          {aiReadinessLoadingInto
                            ? <><Loader2 className="w-3 h-3 animate-spin" /> LOADING...</>
                            : <><UploadCloud className="w-3 h-3" /> LOAD INTO CHECKLIST</>}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {showAddReadiness && (
              <div className="bg-card border border-primary/50 p-4 space-y-3">
                <p className="font-mono text-xs tracking-widest">ADD READINESS ITEM</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <select value={readinessForm.domain} onChange={e => setReadinessForm(p => ({ ...p, domain: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {READINESS_DOMAINS.map(d => <option key={d.domain} value={d.domain}>{d.domain}</option>)}
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input value={readinessForm.item} onChange={e => setReadinessForm(p => ({ ...p, item: e.target.value }))} placeholder="Checklist item description…" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAddReadiness(false)} className="border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3 inline mr-1" /> ABORT</button>
                  <button onClick={addReadinessItem} className="bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Check className="w-3 h-3 inline mr-1" /> ADD</button>
                </div>
              </div>
            )}

            {readinessLoading ? (
              <div className="animate-pulse bg-card border border-border h-40" />
            ) : readinessItems.length === 0 ? (
              <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle className="w-6 h-6 text-muted-foreground" />
                <p className="font-mono text-xs text-muted-foreground">[ NO_READINESS_ITEMS ]</p>
                <button onClick={initReadiness} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Zap className="w-3 h-3" /> LOAD DEFAULT CHECKLIST</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(readinessByDomain).map(([domain, items]) => {
                  const done = items.filter(i => i.status === "done").length;
                  const inProg = items.filter(i => i.status === "in_progress").length;
                  const domainPct = Math.round((done / items.length) * 100);
                  return (
                    <div key={domain} className="bg-card border border-border">
                      <div className="px-4 py-3 border-b border-border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] tracking-widest">{domain.toUpperCase()}</span>
                          <span className={`font-mono text-sm font-bold ${domainPct === 100 ? "text-green-400" : domainPct >= 50 ? "text-yellow-400" : "text-muted-foreground"}`}>{domainPct}%</span>
                        </div>
                        <div className="h-1.5 bg-secondary">
                          <div className={`h-full transition-all ${domainPct === 100 ? "bg-green-400" : domainPct >= 50 ? "bg-yellow-400" : "bg-primary/60"}`} style={{ width: `${domainPct}%` }} />
                        </div>
                        <p className="font-mono text-[9px] text-muted-foreground mt-1">{done} done · {inProg} in progress · {items.length - done - inProg} pending</p>
                      </div>
                      <div className="divide-y divide-border/50">
                        {items.map((r: any) => (
                          <div key={r.id} className={`flex items-start gap-3 px-4 py-2.5 group ${r.status === "done" ? "opacity-70" : ""}`}>
                            <button onClick={() => {
                              const next = r.status === "not_started" ? "in_progress" : r.status === "in_progress" ? "done" : "not_started";
                              updateReadinessStatus(r.id, next);
                            }} className="mt-0.5 shrink-0 hover:scale-110 transition-transform">
                              {readinessStatusIcon(r.status)}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs ${r.status === "done" ? "line-through text-muted-foreground" : ""}`}>{r.item}</p>
                              {r.owner && <p className="font-mono text-[9px] text-muted-foreground">{r.owner}</p>}
                              {r.notes ? (
                                <input
                                  defaultValue={r.notes}
                                  onBlur={e => { if (e.target.value !== r.notes) updateReadinessNotes(r.id, e.target.value); }}
                                  className="mt-0.5 w-full bg-transparent font-mono text-[9px] text-muted-foreground/70 italic focus:outline-none focus:text-foreground border-b border-transparent focus:border-border"
                                />
                              ) : (
                                <input
                                  placeholder="Add note…"
                                  onBlur={e => { if (e.target.value) updateReadinessNotes(r.id, e.target.value); }}
                                  className="mt-0.5 w-full bg-transparent font-mono text-[9px] text-transparent placeholder:text-muted-foreground/30 group-hover:placeholder:text-muted-foreground/60 italic focus:outline-none focus:text-foreground border-b border-transparent focus:border-border"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <select value={r.status} onChange={e => updateReadinessStatus(r.id, e.target.value)} className="bg-secondary border border-border px-1.5 py-0.5 font-mono text-[9px] focus:outline-none focus:border-primary">
                                <option value="not_started">PENDING</option>
                                <option value="in_progress">IN PROGRESS</option>
                                <option value="done">DONE</option>
                              </select>
                              <button onClick={() => deleteReadinessItem(r.id)} className="text-muted-foreground/30 hover:text-red-400 group-hover:text-muted-foreground/60"><X className="w-3 h-3" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── PACING & ALERTS ─── */}
        {tab === "pacing" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={loadAlerts} disabled={alertsLoading} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary disabled:opacity-60"><RefreshCw className={`w-3 h-3 ${alertsLoading ? "animate-spin" : ""}`} /> REFRESH</button>
            </div>

            {alertsLoading ? (
              <div className="animate-pulse bg-card border border-border h-40" />
            ) : !alerts ? (
              <div className="bg-card border border-border flex items-center justify-center py-16"><p className="font-mono text-xs text-muted-foreground">[ LOADING... ]</p></div>
            ) : (
              <>
                {/* Recommendations */}
                <div className="bg-card border border-primary/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="font-mono text-[10px] tracking-widest text-primary">COMMAND RECOMMENDATIONS</span>
                  </div>
                  <div className="space-y-2">
                    {alerts.recommendations.map((r: string, i: number) => (
                      <div key={i} className="flex items-start gap-3 border-l-2 border-primary/30 pl-3">
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{String(i + 1).padStart(2, "0")}.</span>
                        <p className="text-xs">{r}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Phase timeline */}
                <div className="bg-card border border-border p-4">
                  <p className="font-mono text-[10px] text-muted-foreground mb-3">CAMPAIGN PHASE</p>
                  <PhaseBar daysRemaining={alerts.daysToElection} />
                  {alerts.electionDate && <p className="font-mono text-[10px] text-muted-foreground mt-2 text-center">ELECTION: {alerts.electionDate} · {alerts.daysToElection > 0 ? `${alerts.daysToElection} days remaining` : "ELECTION DAY"}</p>}
                </div>

                {/* Alert sections */}
                {[
                  { key: "overdue", label: "OVERDUE", color: "border-red-400/30 text-red-400", icon: <AlertTriangle className="w-3 h-3 text-red-400" /> },
                  { key: "dueIn7", label: "DUE IN 7 DAYS", color: "border-orange-400/30 text-orange-400", icon: <Clock className="w-3 h-3 text-orange-400" /> },
                  { key: "dueIn14", label: "DUE IN 14 DAYS", color: "border-yellow-400/30 text-yellow-400", icon: <Clock className="w-3 h-3 text-yellow-400" /> },
                  { key: "dueIn30", label: "DUE IN 30 DAYS", color: "border-border text-muted-foreground", icon: <Clock className="w-3 h-3 text-muted-foreground" /> },
                  { key: "critical", label: "CRITICAL PRIORITY — UNRESOLVED", color: "border-red-500/30 text-red-500", icon: <Flag className="w-3 h-3 text-red-500" /> },
                  { key: "noOwner", label: "NO OWNER ASSIGNED", color: "border-border text-muted-foreground", icon: <Users className="w-3 h-3 text-muted-foreground" /> },
                ].map(({ key, label, color, icon }) => {
                  const items = alerts[key] as any[];
                  if (items.length === 0) return (
                    <div key={key} className={`bg-card border ${color.split(" ")[0]} p-3 flex items-center gap-3`}>
                      {icon}
                      <span className={`font-mono text-[10px] ${color.split(" ")[1]}`}>{label}</span>
                      <span className="font-mono text-[10px] text-green-400 ml-auto">[ CLEAR ]</span>
                    </div>
                  );
                  return (
                    <div key={key} className={`bg-card border ${color.split(" ")[0]}`}>
                      <div className={`px-4 py-3 border-b ${color.split(" ")[0]} flex items-center gap-2`}>
                        {icon}
                        <span className={`font-mono text-[10px] ${color.split(" ")[1]}`}>{label}</span>
                        <span className={`ml-auto font-mono text-[10px] ${color.split(" ")[1]}`}>{items.length} ITEM{items.length > 1 ? "S" : ""}</span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {items.map((m: any) => (
                          <div key={m.id} className="flex items-center gap-4 px-4 py-2.5">
                            <Badge label={((m as MilestoneEx).priority ?? "medium").toUpperCase()} className={priorityColor((m as MilestoneEx).priority ?? "medium")} />
                            <div className="flex-1">
                              <p className="text-sm">{m.title}</p>
                              <p className="font-mono text-[9px] text-muted-foreground">{m.category}</p>
                            </div>
                            <span className="font-mono text-[10px] text-muted-foreground">{m.owner ?? "UNASSIGNED"}</span>
                            <span className={`font-mono text-[10px] ${key === "overdue" ? "text-red-400" : "text-muted-foreground"}`}>{m.dueDate}</span>
                            <select value={m.status} onChange={e => { updateMilestone.mutate({ id: m.id, data: { status: e.target.value as any } }); setTimeout(loadAlerts, 500); }} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
                              {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}