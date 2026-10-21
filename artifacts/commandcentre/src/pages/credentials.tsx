import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useState, useEffect, useCallback } from "react";
import {
  Plus, X, Check, Trash2, Star, Eye, EyeOff, Download, Printer,
  BookOpen, Scroll, Trophy, Search, RefreshCw, ChevronDown, ChevronUp,
  Sparkles, FileText, Tag, Link, Edit2, Save, Globe, Lock, Zap, Clock,
  Brain, CheckCircle2, AlertTriangle
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const RECORD_TYPES = ["bill", "motion", "petition", "speech", "committee", "question", "statement", "amendment"] as const;
const RECORD_CATEGORIES = ["agriculture", "education", "health", "infrastructure", "security", "finance", "environment", "youth", "women", "governance", "trade", "energy", "water", "housing", "general"];
const RECORD_STATUSES = ["passed", "pending", "defeated", "withdrawn", "in_committee", "enacted"] as const;
const ACH_CATEGORIES = ["infrastructure", "education", "health", "water", "security", "youth", "women", "agriculture", "environment", "governance", "economy", "housing"];
const ACH_STATUSES = ["completed", "ongoing", "planned"] as const;
const RESEARCH_TOPICS = ["Infrastructure Development", "Education Policy", "Health Services", "Water & Sanitation", "Youth Employment", "Women Empowerment", "Agriculture", "Security", "Devolution", "Fiscal Policy", "Environment", "Housing"];

type Tab = "overview" | "records" | "achievements" | "research";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}api/credentials${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function typeColor(t: string) {
  const m: Record<string, string> = {
    bill: "text-primary border-primary/40",
    motion: "text-blue-400 border-blue-400/30",
    petition: "text-purple-400 border-purple-400/30",
    speech: "text-cyan-400 border-cyan-400/30",
    committee: "text-yellow-400 border-yellow-400/30",
    question: "text-orange-400 border-orange-400/30",
    statement: "text-green-400 border-green-400/30",
    amendment: "text-pink-400 border-pink-400/30",
  };
  return m[t] ?? "text-muted-foreground border-border";
}
function statusColor(s: string) {
  return s === "passed" || s === "enacted" || s === "completed" ? "text-green-400 border-green-400/30"
    : s === "pending" || s === "in_committee" || s === "ongoing" ? "text-yellow-400 border-yellow-400/30"
    : s === "defeated" || s === "withdrawn" ? "text-red-400 border-red-400/30"
    : "text-blue-400 border-blue-400/30";
}
function Badge({ label, className }: { label: string; className?: string }) {
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 shrink-0 ${className ?? "text-muted-foreground border-border"}`}>[ {label} ]</span>;
}

function MarkdownText({ text }: { text: string }) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm, '<h3 class="text-sm font-bold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h4 class="text-xs font-semibold mt-2 mb-0.5 text-muted-foreground">$1</h4>')
    .replace(/^[-•*] (.+)$/gm, '<div class="flex gap-2 my-0.5"><span class="text-primary shrink-0">▸</span><span>$1</span></div>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  return <div className="text-xs leading-relaxed space-y-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Credentials() {
  const [tab, setTab] = useState<Tab>("overview");

  // Summary
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Records
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [recordForm, setRecordForm] = useState<Record<string, any>>({ type: "bill", category: "general", status: "pending" });
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editRecordForm, setEditRecordForm] = useState<Record<string, any>>({});
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Achievements
  const [achievements, setAchievements] = useState<any[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [showNewAch, setShowNewAch] = useState(false);
  const [achForm, setAchForm] = useState<Record<string, any>>({ category: "infrastructure", ward: "all", status: "completed", year: new Date().getFullYear().toString() });
  const [editingAchId, setEditingAchId] = useState<number | null>(null);
  const [editAchForm, setEditAchForm] = useState<Record<string, any>>({});
  const [expandedAch, setExpandedAch] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [filterWard, setFilterWard] = useState("all");

  // AI Populate
  const [aiPopulating, setAiPopulating] = useState(false);
  const [aiPopulateResult, setAiPopulateResult] = useState<{ recordsAdded: number; achievementsAdded: number } | null>(null);
  const [aiPopulateError, setAiPopulateError] = useState<string | null>(null);

  // Research
  const [researchTopic, setResearchTopic] = useState(RESEARCH_TOPICS[0]);
  const [researchQuery, setResearchQuery] = useState("");
  const [researchLoading, setResearchLoading] = useState(false);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try { setSummary(await apiFetch("/summary")); } catch { } finally { setSummaryLoading(false); }
  }, []);
  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try { setRecords(await apiFetch("/records")); } catch { } finally { setRecordsLoading(false); }
  }, []);
  const loadAchievements = useCallback(async () => {
    setAchievementsLoading(true);
    try { setAchievements(await apiFetch("/achievements")); } catch { } finally { setAchievementsLoading(false); }
  }, []);
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try { setPastSessions(await apiFetch("/research")); } catch { } finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => { if (tab === "overview") loadSummary(); }, [tab, loadSummary]);
  useEffect(() => { if (tab === "records") loadRecords(); }, [tab, loadRecords]);
  useEffect(() => { if (tab === "achievements") loadAchievements(); }, [tab, loadAchievements]);
  useEffect(() => { if (tab === "research") loadSessions(); }, [tab, loadSessions]);

  async function createRecord() {
    if (!recordForm.title || !recordForm.description || !recordForm.date) return;
    await apiFetch("/records", { method: "POST", body: JSON.stringify(recordForm) });
    await loadRecords();
    setShowNewRecord(false);
    setRecordForm({ type: "bill", category: "general", status: "pending" });
  }

  async function saveRecord(id: number) {
    await apiFetch(`/records/${id}`, { method: "PATCH", body: JSON.stringify(editRecordForm) });
    await loadRecords();
    setEditingRecordId(null);
  }

  async function toggleRecordPublish(id: number, current: boolean) {
    await apiFetch(`/records/${id}`, { method: "PATCH", body: JSON.stringify({ published: !current }) });
    await loadRecords();
  }

  async function toggleRecordFeatured(id: number, current: boolean) {
    await apiFetch(`/records/${id}`, { method: "PATCH", body: JSON.stringify({ featured: !current }) });
    await loadRecords();
  }

  async function deleteRecord(id: number) {
    await apiFetch(`/records/${id}`, { method: "DELETE" });
    await loadRecords();
  }

  async function createAchievement() {
    if (!achForm.title || !achForm.description || !achForm.year) return;
    await apiFetch("/achievements", { method: "POST", body: JSON.stringify(achForm) });
    await loadAchievements();
    setShowNewAch(false);
    setAchForm({ category: "infrastructure", ward: "all", status: "completed", year: new Date().getFullYear().toString() });
  }

  async function saveAchievement(id: number) {
    await apiFetch(`/achievements/${id}`, { method: "PATCH", body: JSON.stringify(editAchForm) });
    await loadAchievements();
    setEditingAchId(null);
  }

  async function toggleAchPublish(id: number, current: boolean) {
    await apiFetch(`/achievements/${id}`, { method: "PATCH", body: JSON.stringify({ published: !current }) });
    await loadAchievements();
  }

  async function toggleAchFeatured(id: number, current: boolean) {
    await apiFetch(`/achievements/${id}`, { method: "PATCH", body: JSON.stringify({ featured: !current }) });
    await loadAchievements();
  }

  async function deleteAchievement(id: number) {
    await apiFetch(`/achievements/${id}`, { method: "DELETE" });
    await loadAchievements();
  }

  async function runResearch() {
    if (!researchQuery.trim()) return;
    setResearchLoading(true);
    setCurrentSession(null);
    try {
      const result = await apiFetch("/research", { method: "POST", body: JSON.stringify({ topic: researchTopic, query: researchQuery }) });
      setCurrentSession(result);
      await loadSessions();
    } catch { } finally { setResearchLoading(false); }
  }

  async function deleteSession(id: number) {
    await apiFetch(`/research/${id}`, { method: "DELETE" });
    await loadSessions();
    if (selectedSession?.id === id) setSelectedSession(null);
  }

  async function runAiPopulate() {
    setAiPopulating(true);
    setAiPopulateResult(null);
    setAiPopulateError(null);
    try {
      const result = await apiFetch("/ai-populate", { method: "POST", body: JSON.stringify({}) });
      setAiPopulateResult({ recordsAdded: result.recordsAdded, achievementsAdded: result.achievementsAdded });
      await Promise.all([loadSummary(), loadRecords(), loadAchievements()]);
    } catch (e: any) {
      setAiPopulateError(e?.message ?? "AI research failed. Please retry.");
    } finally {
      setAiPopulating(false);
    }
  }

  function handlePrint() { window.print(); }

  async function handleDownload() {
    const [recs, achs] = await Promise.all([apiFetch("/records"), apiFetch("/achievements")]);
    const lines: string[] = [
      "═══════════════════════════════════════════════════════════════",
      "  ASPIRANT RECORDS HUB",
      `  ${CAMPAIGN.areaLabel.toUpperCase()} · ${WARDS.length} WARDS: ${WARDS.join(", ").toUpperCase()}`,
      "═══════════════════════════════════════════════════════════════",
      `  Generated: ${new Date().toLocaleString("en-KE")}`,
      "",
      `  LEGISLATIVE RECORDS: ${recs.length}  |  ACHIEVEMENTS: ${achs.length}`,
      "",
      "═══════════════════════════════════════════════════════════════",
      "  LEGISLATIVE RECORD",
      "═══════════════════════════════════════════════════════════════",
    ];
    const byType: Record<string, any[]> = {};
    for (const r of recs) { if (!byType[r.type]) byType[r.type] = []; byType[r.type].push(r); }
    for (const [type, items] of Object.entries(byType)) {
      lines.push(`\n  ── ${type.toUpperCase()}S ──`);
      for (const r of items as any[]) {
        lines.push(`  [${r.status.toUpperCase().padEnd(12)}] ${r.title} (${r.date})`);
        if (r.description) lines.push(`    ${r.description}`);
        if (r.impact) lines.push(`    Impact: ${r.impact}`);
      }
    }
    lines.push("", "═══════════════════════════════════════════════════════════════");
    lines.push("  ACHIEVEMENTS & DEVELOPMENT PROJECTS");
    lines.push("═══════════════════════════════════════════════════════════════");
    const byYear: Record<string, any[]> = {};
    for (const a of achs) { if (!byYear[a.year]) byYear[a.year] = []; byYear[a.year].push(a); }
    for (const [year, items] of Object.entries(byYear).sort(([a], [b]) => b.localeCompare(a))) {
      lines.push(`\n  ── ${year} ──`);
      for (const a of items as any[]) {
        lines.push(`  [${a.status.toUpperCase().padEnd(10)}] ${a.title} — ${a.category.toUpperCase()} · ${a.ward !== "all" ? a.ward : "All Wards"}`);
        if (a.description) lines.push(`    ${a.description}`);
        if (a.impactMetric && a.impactValue) lines.push(`    Impact: ${a.impactValue} ${a.impactMetric}`);
      }
    }
    lines.push("", "═══════════════════════════════════════════════════════════════");
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credentials-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredRecords = records.filter(r => {
    if (filterType !== "all" && r.type !== filterType) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });
  const filteredAchs = achievements.filter(a => {
    if (filterCat !== "all" && a.category !== filterCat) return false;
    if (filterWard !== "all" && a.ward !== filterWard && a.ward !== "all") return false;
    return true;
  });

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "OVERVIEW", icon: <Globe className="w-3 h-3" /> },
    { id: "records", label: "LEGISLATIVE RECORD", icon: <Scroll className="w-3 h-3" /> },
    { id: "achievements", label: "ACHIEVEMENTS", icon: <Trophy className="w-3 h-3" /> },
    { id: "research", label: "AI RESEARCH", icon: <Sparkles className="w-3 h-3" /> },
  ];

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } * { color: black !important; background: white !important; border-color: #ccc !important; } }`}</style>
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between no-print">
          <div>
            <h1 className="text-xl font-bold tracking-widest">ASPIRANT RECORDS HUB</h1>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{CAMPAIGN.areaLabel.toUpperCase()} · DEVELOPMENT & PUBLIC RECORDS</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button onClick={handlePrint} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><Printer className="w-3 h-3" /> PRINT</button>
            <button onClick={handleDownload} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><Download className="w-3 h-3" /> DOWNLOAD</button>
            <button
              onClick={runAiPopulate}
              disabled={aiPopulating}
              className="flex items-center gap-2 border border-primary/60 text-primary px-4 py-2 font-mono text-xs hover:bg-primary/10 disabled:opacity-60 transition-colors"
            >
              {aiPopulating
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> AI RESEARCHING…</>
                : <><Brain className="w-3 h-3" /> AI RESEARCH & POPULATE</>
              }
            </button>
            {tab === "records" && <button onClick={() => setShowNewRecord(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> LOG RECORD</button>}
            {tab === "achievements" && <button onClick={() => setShowNewAch(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> LOG ACHIEVEMENT</button>}
          </div>
        </div>

        {/* AI Populate loading / result banners */}
        {aiPopulating && (
          <div className="bg-primary/5 border border-primary/30 p-4 no-print">
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8 shrink-0">
                <div className="absolute inset-0 border-2 border-primary/20 rounded-full" />
                <div className="absolute inset-0 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <Brain className="absolute inset-0 m-auto w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="font-mono text-xs tracking-wider text-primary font-bold">AI RESEARCH IN PROGRESS</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  Researching {CAMPAIGN.areaLabel} development records · Only verified, source-backed information should be recorded
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {["Scanning Parliament Hansard", "Mapping CDF projects", "Documenting achievements", "Writing to database"].map((step, i) => (
                <div key={step} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-primary animate-pulse" : "bg-primary/20"}`} />
                  <span className="font-mono text-[9px] text-muted-foreground">{step.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {aiPopulateResult && !aiPopulating && (
          <div className="bg-green-500/5 border border-green-500/30 p-4 no-print">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <div>
                  <p className="font-mono text-xs tracking-wider text-green-400 font-bold">AI RESEARCH COMPLETE</p>
                  <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                    <span className="text-foreground font-bold">{aiPopulateResult.recordsAdded}</span> legislative records added ·{" "}
                    <span className="text-foreground font-bold">{aiPopulateResult.achievementsAdded}</span> achievements added · All published to the hub
                  </p>
                </div>
              </div>
              <button onClick={() => setAiPopulateResult(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setTab("records")} className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary"><Scroll className="w-3 h-3" /> VIEW RECORDS</button>
              <button onClick={() => setTab("achievements")} className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary"><Trophy className="w-3 h-3" /> VIEW ACHIEVEMENTS</button>
            </div>
          </div>
        )}

        {aiPopulateError && !aiPopulating && (
          <div className="bg-red-500/5 border border-red-500/30 p-3 no-print flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="font-mono text-[10px] text-red-400">{aiPopulateError}</p>
            </div>
            <button onClick={() => setAiPopulateError(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 no-print">
          {[
            { label: "TOTAL RECORDS", value: records.length || summary?.records?.total || 0, color: "text-foreground" },
            { label: "BILLS SPONSORED", value: records.filter(r => r.type === "bill").length || summary?.records?.bills || 0, color: "text-primary" },
            { label: "PASSED/ENACTED", value: records.filter(r => r.status === "passed" || r.status === "enacted").length || summary?.records?.passed || 0, color: "text-green-400" },
            { label: "ACHIEVEMENTS", value: achievements.length || summary?.achievements?.total || 0, color: "text-yellow-400" },
            { label: "PUBLISHED", value: [...records.filter(r => r.published), ...achievements.filter(a => a.published)].length || 0, color: "text-blue-400" },
            { label: "FEATURED", value: [...records.filter(r => r.featured), ...achievements.filter(a => a.featured)].length || 0, color: "text-orange-400" },
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
            <div className="flex justify-end no-print">
              <button onClick={loadSummary} disabled={summaryLoading} className="flex items-center gap-2 border border-border px-3 py-1.5 font-mono text-xs hover:bg-secondary disabled:opacity-60"><RefreshCw className={`w-3 h-3 ${summaryLoading ? "animate-spin" : ""}`} /></button>
            </div>

            {summaryLoading ? (
              <div className="animate-pulse bg-card border border-border h-40" />
            ) : (
              <>
                {/* Intro card */}
                <div className="bg-card border border-primary/20 p-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 border border-primary/20 p-3">
                      <BookOpen className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h2 className="font-bold tracking-wider mb-1">{CAMPAIGN.areaLabel.toUpperCase()}</h2>
                      <p className="font-mono text-[10px] text-muted-foreground mb-2">DEVELOPMENT RECORDS · {CAMPAIGN.areaLabel.toUpperCase()}, KENYA</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        This hub organises {CAMPAIGN.constituency} public records, documented development projects and evidence-backed reports across {WARDS.join(", ")}.
                      </p>
                      <div className="flex gap-4 mt-3">
                        <div><p className="text-xl font-bold">{summary?.records?.total ?? 0}</p><p className="font-mono text-[9px] text-muted-foreground">RECORDS</p></div>
                        <div><p className="text-xl font-bold text-green-400">{summary?.records?.passed ?? 0}</p><p className="font-mono text-[9px] text-muted-foreground">PASSED</p></div>
                        <div><p className="text-xl font-bold text-yellow-400">{summary?.achievements?.total ?? 0}</p><p className="font-mono text-[9px] text-muted-foreground">ACHIEVEMENTS</p></div>
                        <div><p className="text-xl font-bold text-blue-400">{(summary?.records?.published ?? 0) + (summary?.achievements?.published ?? 0)}</p><p className="font-mono text-[9px] text-muted-foreground">PUBLISHED</p></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Featured Records */}
                  <div className="bg-card border border-border">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <Star className="w-3 h-3 text-yellow-400" />
                      <span className="font-mono text-[10px] tracking-widest">FEATURED LEGISLATIVE RECORDS</span>
                    </div>
                    {!summary?.featuredRecords?.length ? (
                      <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_FEATURED_RECORDS ]<br /><span className="text-[10px]">Star a record to feature it here</span></div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {summary.featuredRecords.map((r: any) => (
                          <div key={r.id} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge label={r.type.toUpperCase()} className={typeColor(r.type)} />
                              <Badge label={r.status.toUpperCase()} className={statusColor(r.status)} />
                              {r.published && <Globe className="w-3 h-3 text-green-400" />}
                            </div>
                            <p className="text-sm font-medium">{r.title}</p>
                            <p className="font-mono text-[9px] text-muted-foreground">{r.date} · {r.category.toUpperCase()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Featured Achievements */}
                  <div className="bg-card border border-border">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <Trophy className="w-3 h-3 text-yellow-400" />
                      <span className="font-mono text-[10px] tracking-widest">FEATURED ACHIEVEMENTS</span>
                    </div>
                    {!summary?.featuredAchievements?.length ? (
                      <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_FEATURED_ACHIEVEMENTS ]<br /><span className="text-[10px]">Star an achievement to feature it here</span></div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {summary.featuredAchievements.map((a: any) => (
                          <div key={a.id} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge label={a.category.toUpperCase()} className="text-yellow-400 border-yellow-400/30" />
                              <Badge label={a.status.toUpperCase()} className={statusColor(a.status)} />
                              {a.published && <Globe className="w-3 h-3 text-green-400" />}
                            </div>
                            <p className="text-sm font-medium">{a.title}</p>
                            <p className="font-mono text-[9px] text-muted-foreground">{a.year} · {a.ward !== "all" ? a.ward : "All Wards"}</p>
                            {a.impactValue && <p className="font-mono text-[9px] text-primary mt-0.5">{a.impactValue} {a.impactMetric}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Records by category */}
                  <div className="bg-card border border-border p-4">
                    <p className="font-mono text-[10px] text-muted-foreground mb-3">LEGISLATIVE WORK BY SECTOR</p>
                    {!summary?.byCategory?.length ? (
                      <p className="font-mono text-xs text-muted-foreground">[ NO_DATA_YET ]</p>
                    ) : (
                      <div className="space-y-2">
                        {summary.byCategory.map((item: any) => {
                          const max = summary.byCategory[0]?.count ?? 1;
                          return (
                            <div key={item.category} className="space-y-0.5">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px]">{item.category.toUpperCase()}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">{item.count}</span>
                              </div>
                              <div className="bg-secondary h-3">
                                <div className="h-3 bg-primary/60" style={{ width: `${Math.round((item.count / max) * 100)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recent research */}
                  <div className="bg-card border border-border">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span className="font-mono text-[10px] tracking-widest">RECENT AI RESEARCH SESSIONS</span>
                    </div>
                    {!summary?.recentSessions?.length ? (
                      <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_RESEARCH_YET ]</div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {summary.recentSessions.map((s: any) => (
                          <div key={s.id} className="px-4 py-3">
                            <p className="text-xs font-medium truncate">{s.topic}</p>
                            <p className="font-mono text-[9px] text-muted-foreground truncate">{s.query}</p>
                            <p className="font-mono text-[9px] text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("en-KE")}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── LEGISLATIVE RECORD ─── */}
        {tab === "records" && (
          <div className="space-y-3">
            {showNewRecord && (
              <div className="bg-card border border-primary/50 p-4">
                <h3 className="font-mono text-xs tracking-widest mb-4">LOG LEGISLATIVE RECORD</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">TITLE *</label>
                    <input value={recordForm.title ?? ""} onChange={e => setRecordForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. National Cohesion and Integration (Amendment) Bill, 2024" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">DATE *</label>
                    <input type="date" value={recordForm.date ?? ""} onChange={e => setRecordForm(p => ({ ...p, date: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">TYPE *</label>
                    <select value={recordForm.type ?? "bill"} onChange={e => setRecordForm(p => ({ ...p, type: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {RECORD_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">STATUS</label>
                    <select value={recordForm.status ?? "pending"} onChange={e => setRecordForm(p => ({ ...p, status: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {RECORD_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">SECTOR / CATEGORY</label>
                    <select value={recordForm.category ?? "general"} onChange={e => setRecordForm(p => ({ ...p, category: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {RECORD_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION / SUMMARY *</label>
                    <textarea rows={2} value={recordForm.description ?? ""} onChange={e => setRecordForm(p => ({ ...p, description: e.target.value }))} placeholder="What the bill/motion/petition covers…" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">IMPACT / SIGNIFICANCE</label>
                    <input value={recordForm.impact ?? ""} onChange={e => setRecordForm(p => ({ ...p, impact: e.target.value }))} placeholder="What change this achieves for constituents…" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">BENEFICIARIES</label>
                    <input value={recordForm.beneficiaries ?? ""} onChange={e => setRecordForm(p => ({ ...p, beneficiaries: e.target.value }))} placeholder="e.g. verified beneficiaries" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">PARLIAMENTARY SESSION</label>
                    <input value={recordForm.session ?? ""} onChange={e => setRecordForm(p => ({ ...p, session: e.target.value }))} placeholder="e.g. 13th Parliament, 1st Session" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">EVIDENCE LINKS</label>
                    <input value={(recordForm.evidenceLinks ?? []).join(", ")} onChange={e => setRecordForm(p => ({ ...p, evidenceLinks: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))} placeholder="Hansard URL, Gazette URL…" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-3 flex gap-2 justify-end">
                    <button onClick={() => { setShowNewRecord(false); setRecordForm({ type: "bill", category: "general", status: "pending" }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                    <button onClick={createRecord} disabled={!recordForm.title || !recordForm.description || !recordForm.date} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Scroll className="w-3 h-3" /> LOG RECORD</button>
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground">TYPE:</span>
              <div className="flex gap-1 flex-wrap">
                {["all", ...RECORD_TYPES].map(t => (
                  <button key={t} onClick={() => setFilterType(t)} className={`font-mono text-[10px] px-2 py-1 border transition-colors ${filterType === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{t.toUpperCase()}</button>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap ml-2">
                {["all", ...RECORD_STATUSES].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} className={`font-mono text-[10px] px-2 py-1 border transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{s.replace("_", " ").toUpperCase()}</button>
                ))}
              </div>
              <button onClick={loadRecords} className="ml-auto border border-border px-3 py-1 font-mono text-[10px] hover:bg-secondary"><RefreshCw className="w-3 h-3" /></button>
            </div>

            {recordsLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-20" />)}</div>
            ) : filteredRecords.length === 0 ? (
              <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
                <Scroll className="w-6 h-6 text-muted-foreground" />
                <p className="font-mono text-xs text-muted-foreground">[ NO_RECORDS_LOGGED ]</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRecords.map(r => {
                  const isExpanded = expandedRecord === r.id;
                  const isEditing = editingRecordId === r.id;
                  return (
                    <div key={r.id} className={`bg-card border ${r.featured ? "border-yellow-400/30" : "border-border"}`}>
                      {isEditing ? (
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2"><input value={editRecordForm.title ?? ""} onChange={e => setEditRecordForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                            <input type="date" value={editRecordForm.date ?? ""} onChange={e => setEditRecordForm(p => ({ ...p, date: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                            <select value={editRecordForm.type ?? "bill"} onChange={e => setEditRecordForm(p => ({ ...p, type: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                              {RECORD_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                            </select>
                            <select value={editRecordForm.status ?? "pending"} onChange={e => setEditRecordForm(p => ({ ...p, status: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                              {RECORD_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>)}
                            </select>
                            <select value={editRecordForm.category ?? "general"} onChange={e => setEditRecordForm(p => ({ ...p, category: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                              {RECORD_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                            </select>
                            <div className="col-span-3"><textarea rows={2} value={editRecordForm.description ?? ""} onChange={e => setEditRecordForm(p => ({ ...p, description: e.target.value }))} className="w-full bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary resize-none" /></div>
                            <div className="col-span-2"><input value={editRecordForm.impact ?? ""} onChange={e => setEditRecordForm(p => ({ ...p, impact: e.target.value }))} placeholder="Impact…" className="w-full bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                            <input value={editRecordForm.beneficiaries ?? ""} onChange={e => setEditRecordForm(p => ({ ...p, beneficiaries: e.target.value }))} placeholder="Beneficiaries…" className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingRecordId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                            <button onClick={() => saveRecord(r.id)} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px]"><Save className="w-3 h-3 inline mr-1" /> SAVE</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start gap-3 px-4 py-3">
                            <div className="flex flex-col gap-1 shrink-0">
                              <Badge label={r.type.toUpperCase()} className={typeColor(r.type)} />
                              <Badge label={r.status.replace("_", " ").toUpperCase()} className={statusColor(r.status)} />
                            </div>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedRecord(isExpanded ? null : r.id)}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-bold">{r.title}</p>
                                {r.featured && <Star className="w-3 h-3 text-yellow-400 shrink-0" />}
                                {r.published && <Globe className="w-3 h-3 text-green-400 shrink-0" />}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>
                              <div className="flex items-center gap-3 mt-1 font-mono text-[9px] text-muted-foreground">
                                <span>{r.date}</span>
                                <span>{r.category.toUpperCase()}</span>
                                {r.session && <span>{r.session}</span>}
                                {r.beneficiaries && <span className="text-primary">{r.beneficiaries}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 no-print">
                              <button onClick={() => toggleRecordFeatured(r.id, r.featured)} title={r.featured ? "Unfeature" : "Feature"} className={`${r.featured ? "text-yellow-400" : "text-muted-foreground"} hover:text-yellow-400`}><Star className="w-3.5 h-3.5" /></button>
                              <button onClick={() => toggleRecordPublish(r.id, r.published)} title={r.published ? "Unpublish" : "Publish"} className={`${r.published ? "text-green-400" : "text-muted-foreground"} hover:text-green-400`}>{r.published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                              <button onClick={() => { setEditingRecordId(r.id); setEditRecordForm({ title: r.title, type: r.type, description: r.description, date: r.date, session: r.session, status: r.status, category: r.category, impact: r.impact, beneficiaries: r.beneficiaries }); }} className="text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setExpandedRecord(isExpanded ? null : r.id)} className="text-muted-foreground hover:text-foreground">{isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
                              <button onClick={() => deleteRecord(r.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-border/50 px-4 py-3 space-y-3 bg-secondary/30">
                              {r.impact && (
                                <div className="border-l-2 border-primary/40 pl-3">
                                  <p className="font-mono text-[9px] text-muted-foreground mb-0.5">IMPACT</p>
                                  <p className="text-xs">{r.impact}</p>
                                </div>
                              )}
                              {r.beneficiaries && (
                                <div className="border-l-2 border-green-400/40 pl-3">
                                  <p className="font-mono text-[9px] text-muted-foreground mb-0.5">BENEFICIARIES</p>
                                  <p className="text-xs">{r.beneficiaries}</p>
                                </div>
                              )}
                              {(r.evidenceLinks as string[])?.length > 0 && (
                                <div>
                                  <p className="font-mono text-[9px] text-muted-foreground mb-1">EVIDENCE LINKS</p>
                                  <div className="flex flex-wrap gap-2">
                                    {(r.evidenceLinks as string[]).map((link: string, i: number) => (
                                      <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-mono text-[9px] border border-border px-2 py-0.5 hover:border-primary hover:text-primary transition-colors"><Link className="w-2.5 h-2.5" /> {link.length > 40 ? link.slice(0, 40) + "…" : link}</a>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                                <span className={`font-mono text-[9px] ${r.published ? "text-green-400" : "text-muted-foreground"}`}>{r.published ? "✓ PUBLISHED" : "○ DRAFT"}</span>
                                <span className={`font-mono text-[9px] ${r.featured ? "text-yellow-400" : "text-muted-foreground"}`}>{r.featured ? "★ FEATURED" : ""}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── ACHIEVEMENTS ─── */}
        {tab === "achievements" && (
          <div className="space-y-3">
            {showNewAch && (
              <div className="bg-card border border-primary/50 p-4">
                <h3 className="font-mono text-xs tracking-widest mb-4">LOG ACHIEVEMENT / DEVELOPMENT PROJECT</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">TITLE *</label>
                    <input value={achForm.title ?? ""} onChange={e => setAchForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Wote water supply rehabilitation (attach official source)" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">YEAR *</label>
                    <input value={achForm.year ?? ""} onChange={e => setAchForm(p => ({ ...p, year: e.target.value }))} placeholder="2024" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">CATEGORY *</label>
                    <select value={achForm.category ?? "infrastructure"} onChange={e => setAchForm(p => ({ ...p, category: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {ACH_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">WARD</label>
                    <select value={achForm.ward ?? "all"} onChange={e => setAchForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      <option value="all">ALL WARDS</option>
                      {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">STATUS</label>
                    <select value={achForm.status ?? "completed"} onChange={e => setAchForm(p => ({ ...p, status: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {ACH_STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION *</label>
                    <textarea rows={2} value={achForm.description ?? ""} onChange={e => setAchForm(p => ({ ...p, description: e.target.value }))} placeholder="Detailed description of the project or achievement…" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">IMPACT METRIC</label>
                    <input value={achForm.impactMetric ?? ""} onChange={e => setAchForm(p => ({ ...p, impactMetric: e.target.value }))} placeholder="e.g. households connected" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">IMPACT VALUE</label>
                    <input value={achForm.impactValue ?? ""} onChange={e => setAchForm(p => ({ ...p, impactValue: e.target.value }))} placeholder="e.g. 1,200" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">BUDGET (KSh)</label>
                    <input value={achForm.budget ?? ""} onChange={e => setAchForm(p => ({ ...p, budget: e.target.value }))} placeholder="e.g. 45,000,000" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">FUNDING SOURCE</label>
                    <input value={achForm.fundingSource ?? ""} onChange={e => setAchForm(p => ({ ...p, fundingSource: e.target.value }))} placeholder="e.g. NG-CDF, National Government, County" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">PARTNER AGENCIES</label>
                    <input value={(achForm.partnerAgencies ?? []).join(", ")} onChange={e => setAchForm(p => ({ ...p, partnerAgencies: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))} placeholder="e.g. KeNHA, Ministry of Health, KPLC" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-3 flex gap-2 justify-end">
                    <button onClick={() => { setShowNewAch(false); setAchForm({ category: "infrastructure", ward: "all", status: "completed", year: new Date().getFullYear().toString() }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                    <button onClick={createAchievement} disabled={!achForm.title || !achForm.description || !achForm.year} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Trophy className="w-3 h-3" /> LOG ACHIEVEMENT</button>
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground">FILTER:</span>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
                <option value="all">ALL CATEGORIES</option>
                {ACH_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
              <select value={filterWard} onChange={e => setFilterWard(e.target.value)} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
                <option value="all">ALL WARDS</option>
                {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <button onClick={loadAchievements} className="ml-auto border border-border px-3 py-1 font-mono text-[10px] hover:bg-secondary"><RefreshCw className="w-3 h-3" /></button>
            </div>

            {achievementsLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-20" />)}</div>
            ) : filteredAchs.length === 0 ? (
              <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
                <Trophy className="w-6 h-6 text-muted-foreground" />
                <p className="font-mono text-xs text-muted-foreground">[ NO_ACHIEVEMENTS_LOGGED ]</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredAchs.map(a => {
                  const isExpanded = expandedAch === a.id;
                  const isEditing = editingAchId === a.id;
                  return (
                    <div key={a.id} className={`bg-card border ${a.featured ? "border-yellow-400/30" : a.status === "completed" ? "border-green-400/10" : "border-border"}`}>
                      {isEditing ? (
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2"><input value={editAchForm.title ?? ""} onChange={e => setEditAchForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                            <select value={editAchForm.category ?? "infrastructure"} onChange={e => setEditAchForm(p => ({ ...p, category: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                              {ACH_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                            </select>
                            <select value={editAchForm.status ?? "completed"} onChange={e => setEditAchForm(p => ({ ...p, status: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                              {ACH_STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                            </select>
                            <div className="col-span-2"><textarea rows={2} value={editAchForm.description ?? ""} onChange={e => setEditAchForm(p => ({ ...p, description: e.target.value }))} className="w-full bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary resize-none" /></div>
                            <input value={editAchForm.impactValue ?? ""} onChange={e => setEditAchForm(p => ({ ...p, impactValue: e.target.value }))} placeholder="Impact value…" className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                            <input value={editAchForm.impactMetric ?? ""} onChange={e => setEditAchForm(p => ({ ...p, impactMetric: e.target.value }))} placeholder="Impact metric…" className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingAchId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                            <button onClick={() => saveAchievement(a.id)} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px]"><Save className="w-3 h-3 inline mr-1" /> SAVE</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex flex-wrap gap-1">
                                <Badge label={a.category.toUpperCase()} className="text-yellow-400 border-yellow-400/30" />
                                <Badge label={a.status.toUpperCase()} className={statusColor(a.status)} />
                                {a.ward !== "all" && <Badge label={a.ward} className="text-primary border-primary/30" />}
                              </div>
                              <div className="flex items-center gap-1.5 no-print">
                                <button onClick={() => toggleAchFeatured(a.id, a.featured)} className={`${a.featured ? "text-yellow-400" : "text-muted-foreground"} hover:text-yellow-400`}><Star className="w-3.5 h-3.5" /></button>
                                <button onClick={() => toggleAchPublish(a.id, a.published)} className={`${a.published ? "text-green-400" : "text-muted-foreground"} hover:text-green-400`}>{a.published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                                <button onClick={() => { setEditingAchId(a.id); setEditAchForm({ title: a.title, description: a.description, category: a.category, ward: a.ward, year: a.year, status: a.status, impactMetric: a.impactMetric, impactValue: a.impactValue, budget: a.budget, fundingSource: a.fundingSource }); }} className="text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setExpandedAch(isExpanded ? null : a.id)} className="text-muted-foreground hover:text-foreground">{isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
                                <button onClick={() => deleteAchievement(a.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-bold mb-0.5">{a.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-mono text-[10px] text-muted-foreground">{a.year}</p>
                                {a.impactValue && <p className="font-mono text-sm font-bold text-primary">{a.impactValue}</p>}
                                {a.impactMetric && <p className="font-mono text-[9px] text-muted-foreground">{a.impactMetric}</p>}
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-border/50 px-4 py-3 space-y-2 bg-secondary/30">
                              {a.budget && <p className="font-mono text-[10px]">BUDGET: <span className="text-foreground">KSh {a.budget}</span></p>}
                              {a.fundingSource && <p className="font-mono text-[10px]">FUNDED BY: <span className="text-foreground">{a.fundingSource}</span></p>}
                              {(a.partnerAgencies as string[])?.filter(Boolean).length > 0 && (
                                <div>
                                  <p className="font-mono text-[9px] text-muted-foreground mb-1">PARTNER AGENCIES</p>
                                  <div className="flex flex-wrap gap-1">
                                    {(a.partnerAgencies as string[]).filter(Boolean).map((ag: string, i: number) => <span key={i} className="font-mono text-[9px] border border-border px-1.5 py-0.5">{ag}</span>)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── AI RESEARCH ─── */}
        {tab === "research" && (
          <div className="grid grid-cols-3 gap-4">
            {/* Research panel */}
            <div className="col-span-2 space-y-3">
              <div className="bg-card border border-primary/30 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="font-mono text-[10px] tracking-widest text-primary">AI RESEARCH ASSISTANT</span>
                  <span className="ml-auto font-mono text-[9px] text-muted-foreground">Powered by AI · campaign area context</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">TOPIC AREA</label>
                    <select value={researchTopic} onChange={e => setResearchTopic(e.target.value)} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {RESEARCH_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">RESEARCH QUERY *</label>
                    <input
                      value={researchQuery}
                      onChange={e => setResearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runResearch(); } }}
                      placeholder="e.g. What legislation can improve water access in rural wards?"
                      className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={runResearch} disabled={researchLoading || !researchQuery.trim()} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60">
                    {researchLoading ? <><RefreshCw className="w-3 h-3 animate-spin" /> RESEARCHING…</> : <><Search className="w-3 h-3" /> RUN RESEARCH</>}
                  </button>
                </div>
              </div>

              {/* Current result */}
              {researchLoading && (
                <div className="bg-card border border-border p-8 flex flex-col items-center gap-3">
                  <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                  <p className="font-mono text-xs text-muted-foreground">AI ANALYSING QUERY…</p>
                  <div className="w-48 h-1 bg-secondary overflow-hidden">
                    <div className="h-full bg-primary animate-[slide_1.5s_ease-in-out_infinite]" style={{ width: "60%" }} />
                  </div>
                </div>
              )}

              {currentSession && !researchLoading && (() => {
                const s = currentSession.session;
                const points = (s.keyPoints ?? []) as string[];
                const sources = (s.sources ?? []) as any[];
                return (
                  <div className="bg-card border border-border space-y-0">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span className="font-mono text-[10px] tracking-widest">{s.topic.toUpperCase()}</span>
                      {currentSession.aiGenerated && <span className="ml-auto font-mono text-[9px] text-green-400">[ AI_GENERATED ]</span>}
                      {!currentSession.aiGenerated && <span className="ml-auto font-mono text-[9px] text-muted-foreground">[ TEMPLATE — add OPENAI_API_KEY for full AI ]</span>}
                    </div>

                    <div className="px-4 py-4 border-b border-border/50">
                      <p className="font-mono text-[9px] text-muted-foreground mb-2">RESEARCH SUMMARY</p>
                      <MarkdownText text={s.response} />
                    </div>

                    {points.length > 0 && (
                      <div className="px-4 py-3 border-b border-border/50">
                        <p className="font-mono text-[9px] text-muted-foreground mb-2">KEY TALKING POINTS</p>
                        <div className="space-y-1.5">
                          {points.map((pt: string, i: number) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="font-mono text-[9px] text-primary shrink-0 mt-0.5">{String(i + 1).padStart(2, "0")}.</span>
                              <p className="text-xs">{pt}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {sources.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="font-mono text-[9px] text-muted-foreground mb-2">RECOMMENDED SOURCES</p>
                        <div className="space-y-1.5">
                          {sources.map((src: any, i: number) => (
                            <div key={i} className="flex items-start gap-3 py-1 border-b border-border/30">
                              <Badge label={src.type.toUpperCase()} className="text-blue-400 border-blue-400/30 shrink-0" />
                              <div>
                                <p className="text-xs font-medium">{src.title}</p>
                                <p className="font-mono text-[9px] text-muted-foreground">{src.relevance}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Empty state */}
              {!currentSession && !researchLoading && (
                <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
                  <Search className="w-8 h-8 text-muted-foreground" />
                  <p className="font-mono text-xs text-muted-foreground">[ ENTER A QUERY TO BEGIN RESEARCH ]</p>
                  <p className="font-mono text-[10px] text-muted-foreground/60 max-w-sm text-center">AI research provides legislative context, talking points, benchmarks, and source recommendations relevant to {CAMPAIGN.areaLabel}</p>
                </div>
              )}
            </div>

            {/* Session history */}
            <div className="space-y-3">
              <div className="bg-card border border-border">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-widest">RESEARCH HISTORY</span>
                  <button onClick={loadSessions} className="text-muted-foreground hover:text-foreground"><RefreshCw className="w-3 h-3" /></button>
                </div>
                {sessionsLoading ? (
                  <div className="p-4 animate-pulse space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-secondary" />)}</div>
                ) : pastSessions.length === 0 ? (
                  <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_SESSIONS_YET ]</div>
                ) : (
                  <div className="divide-y divide-border/50 max-h-[600px] overflow-y-auto">
                    {pastSessions.map(s => (
                      <div
                        key={s.id}
                        className={`px-4 py-3 cursor-pointer hover:bg-secondary/50 transition-colors ${selectedSession?.id === s.id ? "bg-secondary/80 border-l-2 border-primary" : ""}`}
                        onClick={() => setSelectedSession(selectedSession?.id === s.id ? null : s)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-[10px] text-primary truncate">{s.topic}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{s.query}</p>
                            <p className="font-mono text-[9px] text-muted-foreground mt-0.5">{new Date(s.createdAt).toLocaleDateString("en-KE")}</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="text-muted-foreground/30 hover:text-red-400 shrink-0 mt-0.5"><Trash2 className="w-3 h-3" /></button>
                        </div>

                        {selectedSession?.id === s.id && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <MarkdownText text={s.response} />
                            {(s.keyPoints as string[])?.length > 0 && (
                              <div className="mt-2">
                                <p className="font-mono text-[9px] text-muted-foreground mb-1">KEY POINTS</p>
                                {(s.keyPoints as string[]).slice(0, 3).map((pt: string, i: number) => (
                                  <div key={i} className="flex gap-1 mt-0.5"><span className="text-primary shrink-0 text-[10px]">▸</span><p className="text-[10px]">{pt}</p></div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}