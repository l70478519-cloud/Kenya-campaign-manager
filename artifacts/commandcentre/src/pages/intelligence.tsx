import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useState, useEffect, useCallback } from "react";
import {
  useListNarrativeMentions, useCreateNarrativeMention, useRespondToMention, useGetNarrativeScore,
  useListCompetitors, useCreateCompetitor,
  useListWarRoomBriefs, useCreateWarRoomBrief,
  getListNarrativeMentionsQueryKey, getGetNarrativeScoreQueryKey, getListCompetitorsQueryKey, getListWarRoomBriefsQueryKey
} from "@workspace/api-client-react";
import type { NarrativeMention, NarrativeMentionInput, CompetitorInput, WarRoomBriefInput } from "@workspace/api-client-react";

// The API enriches mentions with AI analysis fields not yet in the generated OpenAPI type.
type MentionEx = NarrativeMention & {
  sentiment?: string | null;
  sentimentScore?: number | null;
  aiSummary?: string | null;
  suggestedResponse?: string | null;
  source?: string | null;
  aiAnalyzed?: boolean | null;
  engagementCount?: number | null;
};

// The narrative-score endpoint returns extra aggregates not yet in the generated OpenAPI type.
type ScoreEx = {
  highThreats: number;
  pendingApproval: number;
  negativeMentions: number;
  positiveMentions: number;
  aiEnabled?: boolean;
};
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Check, ShieldAlert, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Target, Zap, Eye, Send, Settings, RefreshCw,
  Clock, CheckCircle, XCircle, Radio, Globe, Twitter, Facebook,
  Newspaper, ThumbsUp, ThumbsDown, Bot, Shield, ChevronDown, ChevronUp, Edit2, Trash2, BookOpen, Megaphone, MapPin
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

type Tab = "feed" | "queue" | "rebuttal" | "platforms" | "competitors" | "warroom" | "playbook";

// ─── narrative playbook (core storylines; also grounds all AI generation) ─────

const NARRATIVE_PLAYBOOK = [
  { tag: "WATER", title: "Water Services", core: "Publish verified updates on water access, repairs and project timelines.", lines: [{ lang: "EN", text: "verified water-service updates and next steps." }, { lang: "SW", text: "taarifa zilizothibitishwa kuhusu huduma za maji." }], why: "Use source-backed public-service information and clearly identify unresolved issues." },
  { tag: "ROADS", title: "Roads & Infrastructure", core: "Track road maintenance, access and documented project progress.", lines: [{ lang: "EN", text: "road maintenance updates based on official records." }, { lang: "SW", text: "taarifa za matengenezo ya barabara kutoka rekodi rasmi." }], why: "Report verified status, responsible department and the date of the latest update." },
  { tag: "HEALTH", title: "Health Services", core: "Share confirmed facility, staffing and service-delivery updates.", lines: [{ lang: "EN", text: "confirmed health-service information." }, { lang: "SW", text: "taarifa zilizothibitishwa kuhusu huduma za afya." }], why: "Distinguish official information from unverified reports." },
  { tag: "BUDGET", title: "Budgets & Accountability", core: "Link public claims to approved budgets, reports and source documents.", lines: [{ lang: "EN", text: "follow the evidence, budget and published results." }, { lang: "SW", text: "fuatilia ushahidi, bajeti na matokeo yaliyochapishwa." }], why: "Support transparent public understanding of county services." },
  { tag: "COMMUNITY", title: "Community Issues", core: "Collect service requests and publish verified responses without political targeting.", lines: [{ lang: "EN", text: "report a service issue and follow its verified status." }, { lang: "SW", text: "ripoti tatizo la huduma na ufuatilie hali yake." }], why: "Keep updates factual, accessible and focused on residents and services." },
] as const;

const PLAYBOOK_WARDS = WARDS.map(ward => ({ ward, focus: "County services, development projects and public accountability" }));

const PLAYBOOK_CHANNELS = [
  { channel: "Official website", guidance: "Publish verified county updates with source links and dates." },
  { channel: "Public notices", guidance: "Use accessible language and identify the responsible county department." },
  { channel: "Community meetings", guidance: "Record questions, decisions and follow-up actions neutrally." },
  { channel: "Online channels", guidance: "Correct misinformation with evidence and avoid unverified claims." },
] as const;

// ─── severity ────────────────────────────────────────────────────────────────

const SEVERITY_ORDER = ["normal", "elevated", "high", "critical"] as const;
type Severity = typeof SEVERITY_ORDER[number];

function severityColor(level: string) {
  return level === "critical" ? "text-red-500 border-red-500/40 bg-red-500/5"
    : level === "high" ? "text-orange-400 border-orange-400/40 bg-orange-400/5"
    : level === "elevated" ? "text-yellow-400 border-yellow-400/40 bg-yellow-400/5"
    : "text-blue-400 border-blue-400/30 bg-blue-400/5";
}
function severityPulse(level: string) {
  return level === "critical" ? "animate-pulse" : "";
}
function sentimentColor(s: string) {
  return s === "positive" ? "text-green-400" : s === "negative" ? "text-red-400" : "text-muted-foreground";
}
function statusColor(s: string) {
  return s === "pending_approval" ? "text-yellow-400 border-yellow-400/30"
    : s === "approved" ? "text-green-400 border-green-400/30"
    : s === "published" ? "text-blue-400 border-blue-400/30"
    : s === "rejected" ? "text-red-400 border-red-400/30"
    : "text-muted-foreground border-border";
}

function ThreatBadge({ level }: { level: string }) {
  return (
    <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${severityColor(level)} ${severityPulse(level)}`}>
      [ {(level === "normal" ? "NORMAL" : level).toUpperCase()} ]
    </span>
  );
}
function SentimentBadge({ sentiment, score }: { sentiment: string; score: number }) {
  const icon = sentiment === "positive" ? <ThumbsUp className="w-2.5 h-2.5" /> : sentiment === "negative" ? <ThumbsDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />;
  return (
    <span className={`flex items-center gap-1 font-mono text-[10px] ${sentimentColor(sentiment)}`}>
      {icon} {sentiment.toUpperCase()} {score}%
    </span>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${statusColor(status)}`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </span>
  );
}
function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  if (p.includes("twitter") || p.includes("x")) return <Twitter className="w-3 h-3 text-sky-400" />;
  if (p.includes("facebook")) return <Facebook className="w-3 h-3 text-blue-500" />;
  if (p.includes("news") || p.includes("star") || p.includes("nation") || p.includes("standard")) return <Newspaper className="w-3 h-3 text-yellow-400" />;
  if (p.includes("whatsapp")) return <Radio className="w-3 h-3 text-green-400" />;
  return <Globe className="w-3 h-3 text-muted-foreground" />;
}

// ─── direct-fetch helpers ────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}api/intelligence${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Intelligence() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("feed");

  // score
  const { data: scoreData, refetch: refetchScore } = useGetNarrativeScore();
  const score = scoreData as (typeof scoreData & ScoreEx) | undefined;

  // mentions (feed)
  const { data: mentions, isLoading: mentionsLoading, refetch: refetchMentions } = useListNarrativeMentions();
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterSentiment, setFilterSentiment] = useState<string>("all");
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanPlatform, setScanPlatform] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // response queue
  const [responses, setResponses] = useState<any[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [editingResponseId, setEditingResponseId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // manual log form
  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState<Partial<NarrativeMentionInput & { engagementCount: number }>>({ threatLevel: "elevated" as any });

  // platforms
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [platformForm, setPlatformForm] = useState<Record<string, string>>({});
  const [scans, setScans] = useState<any[]>([]);

  // competitors
  const { data: competitors, isLoading: competitorsLoading } = useListCompetitors();
  const [showAddComp, setShowAddComp] = useState(false);
  const [competitorForm, setCompetitorForm] = useState<Partial<CompetitorInput>>({});

  // rebuttal center
  const [attackText, setAttackText] = useState("");
  const [rebuttalPlatform, setRebuttalPlatform] = useState("Twitter/X");
  const [rebuttalUrgency, setRebuttalUrgency] = useState("planned");
  const [draftingRebuttal, setDraftingRebuttal] = useState(false);
  const [rebuttalError, setRebuttalError] = useState<string | null>(null);
  const [rebuttals, setRebuttals] = useState<Array<{ tone: string; angle: string; content: string; characterCount: number; charLimit: number; platform: string }>>([]);
  const [editingRebuttal, setEditingRebuttal] = useState<Record<number, string>>({});
  const [savedRebuttals, setSavedRebuttals] = useState<Set<number>>(new Set());
  const [attackSource, setAttackSource] = useState("");

  // war room
  const { data: briefs, isLoading: briefsLoading } = useListWarRoomBriefs();
  const [showAddBrief, setShowAddBrief] = useState(false);
  const [briefForm, setBriefForm] = useState<Partial<WarRoomBriefInput>>({ priority: "medium" });

  // mutations
  const createMention = useCreateNarrativeMention({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListNarrativeMentionsQueryKey() }); qc.invalidateQueries({ queryKey: getGetNarrativeScoreQueryKey() }); setShowLog(false); setLogForm({ threatLevel: "elevated" as any }); } } });
  const createCompetitor = useCreateCompetitor({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCompetitorsQueryKey() }); setShowAddComp(false); setCompetitorForm({}); } } });
  const createBrief = useCreateWarRoomBrief({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListWarRoomBriefsQueryKey() }); setShowAddBrief(false); setBriefForm({ priority: "medium" }); } } });

  const loadResponses = useCallback(async () => {
    setResponsesLoading(true);
    try { setResponses(await apiFetch("/responses")); } catch { /* ignore */ } finally { setResponsesLoading(false); }
  }, []);
  const loadPlatforms = useCallback(async () => {
    setPlatformsLoading(true);
    try { const [p, s] = await Promise.all([apiFetch("/platform-integrations"), apiFetch("/scans")]); setPlatforms(p); setScans(s); } catch { /* ignore */ } finally { setPlatformsLoading(false); }
  }, []);

  useEffect(() => { if (tab === "queue") loadResponses(); }, [tab, loadResponses]);
  useEffect(() => { if (tab === "platforms") loadPlatforms(); }, [tab, loadPlatforms]);

  // Keep displayed intelligence current without repeatedly triggering external scans.
  // Feed ingestion remains controlled by SCAN FEEDS until scheduled source polling is configured.
  useEffect(() => {
    const refreshVisibleData = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refetchMentions();
      void refetchScore();
      if (tab === "queue") void loadResponses();
      if (tab === "platforms") void loadPlatforms();
    };
    const timer = window.setInterval(refreshVisibleData, 60_000);
    return () => window.clearInterval(timer);
  }, [tab, refetchMentions, refetchScore, loadResponses, loadPlatforms]);

  // ── Draft Rebuttal ──
  async function handleDraftRebuttal() {
    if (!attackText.trim()) return;
    setDraftingRebuttal(true);
    setRebuttalError(null);
    setRebuttals([]);
    setSavedRebuttals(new Set());
    setEditingRebuttal({});
    try {
      const data = await apiFetch("/ai-draft-rebuttal", {
        method: "POST",
        body: JSON.stringify({ attack: attackText, platform: rebuttalPlatform, urgency: rebuttalUrgency }),
      });
      setRebuttals(data.rebuttals ?? []);
      if ((data.rebuttals ?? []).length > 0) {
        const initial: Record<number, string> = {};
        (data.rebuttals as any[]).forEach((r: any, i: number) => { initial[i] = r.content; });
        setEditingRebuttal(initial);
      }
    } catch (e: any) {
      setRebuttalError(e.message ?? "Rebuttal generation failed. Please retry.");
    } finally {
      setDraftingRebuttal(false);
    }
  }

  async function saveRebuttalToQueue(idx: number) {
    const content = editingRebuttal[idx] ?? rebuttals[idx]?.content;
    if (!content) return;
    await apiFetch("/responses", {
      method: "POST",
      body: JSON.stringify({ platform: rebuttalPlatform, content, draftedBy: "ai", mentionId: null }),
    });
    setSavedRebuttals(prev => new Set([...prev, idx]));
    qc.invalidateQueries({ queryKey: getListNarrativeMentionsQueryKey() });
  }

  // ── AI Analyze ──
  async function handleAiAnalyze(m: any) {
    setAnalyzingId(m.id);
    try {
      await apiFetch("/ai-analyze", { method: "POST", body: JSON.stringify({ content: m.content, platform: m.platform, mentionId: m.id }) });
      refetchMentions(); refetchScore();
    } catch { /* ignore */ } finally { setAnalyzingId(null); }
  }

  // ── Draft Response ──
  async function handleDraftResponse(m: any) {
    setGeneratingId(m.id);
    try {
      await apiFetch("/ai-generate-response", { method: "POST", body: JSON.stringify({ content: m.content, platform: m.platform, threatLevel: m.threatLevel, mentionId: m.id }) });
      await loadResponses();
    } catch { /* ignore */ } finally { setGeneratingId(null); }
  }

  // ── Scan ──
  async function handleScan() {
    setScanning(true);
    try {
      await apiFetch("/scan", { method: "POST", body: JSON.stringify({ platform: scanPlatform }) });
      setTimeout(async () => { await refetchMentions(); await refetchScore(); await loadPlatforms(); setScanning(false); }, 2000);
    } catch { setScanning(false); }
  }

  // ── Approve / Reject / Publish ──
  async function updateResponse(id: number, status: string, extra?: Record<string, string>) {
    await apiFetch(`/responses/${id}`, { method: "PATCH", body: JSON.stringify({ status, ...extra }) });
    await loadResponses(); refetchScore();
  }
  async function deleteResponse(id: number) {
    await apiFetch(`/responses/${id}`, { method: "DELETE" });
    await loadResponses();
  }

  // ── Save Platform ──
  async function savePlatform(platform: string) {
    await apiFetch("/platform-integrations", { method: "POST", body: JSON.stringify({ platform, ...platformForm, isActive: true }) });
    await loadPlatforms();
    setEditingPlatform(null);
    setPlatformForm({});
  }

  const filteredMentions = ((mentions ?? []) as MentionEx[]).filter(m => {
    if (filterSeverity !== "all" && m.threatLevel !== filterSeverity) return false;
    if (filterSentiment !== "all" && m.sentiment !== filterSentiment) return false;
    return true;
  });

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "feed", label: "LIVE FEED", icon: <Radio className="w-3 h-3" /> },
    { id: "queue", label: "RESPONSE QUEUE", icon: <Shield className="w-3 h-3" /> },
    { id: "rebuttal", label: "AI REBUTTAL CENTER", icon: <Zap className="w-3 h-3" /> },
    { id: "platforms", label: "PLATFORM INTEL", icon: <Globe className="w-3 h-3" /> },
    { id: "competitors", label: "COMPETITOR INTEL", icon: <Target className="w-3 h-3" /> },
    { id: "warroom", label: "WAR ROOM", icon: <AlertTriangle className="w-3 h-3" /> },
    { id: "playbook", label: "NARRATIVE PLAYBOOK", icon: <BookOpen className="w-3 h-3" /> },
  ];

  const pendingCount = responses.filter(r => r.status === "pending_approval").length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">POLITICAL INTELLIGENCE</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
            AI-POWERED PUBLIC-SERVICE INTELLIGENCE · {CAMPAIGN.areaLabel.toUpperCase()}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowLog(v => !v)} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary">
            <Plus className="w-3 h-3" /> LOG THREAT
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "SCANNING…" : "SCAN FEEDS"}
          </button>
        </div>
      </div>

      {/* Score Bar */}
      {score && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          {[
            { label: "NARRATIVE SCORE", value: score.score, icon: score.trend === "up" ? <TrendingUp className="w-3 h-3 text-green-400" /> : score.trend === "down" ? <TrendingDown className="w-3 h-3 text-red-400" /> : <Minus className="w-3 h-3 text-yellow-400" />, color: "text-foreground" },
            { label: "CRITICAL", value: score.criticalThreats, color: score.criticalThreats > 0 ? "text-red-500 animate-pulse" : "text-red-400" },
            { label: "HIGH", value: score.highThreats, color: "text-orange-400" },
            { label: "OPEN THREATS", value: score.openThreats, color: "text-yellow-400" },
            { label: "PENDING APPROVAL", value: score.pendingApproval, color: score.pendingApproval > 0 ? "text-yellow-400 animate-pulse" : "text-muted-foreground" },
            { label: "NEGATIVE", value: score.negativeMentions, color: "text-red-400" },
            { label: "POSITIVE", value: score.positiveMentions, color: "text-green-400" },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-card border border-border p-3">
              <p className="font-mono text-[9px] text-muted-foreground">{label}</p>
              <div className={`flex items-center gap-1.5 text-2xl font-bold ${color}`}>
                {value}
                {icon}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual log form */}
      {showLog && (
        <div className="bg-card border border-primary/50 p-4">
          <h3 className="font-mono text-xs tracking-widest mb-4">LOG NARRATIVE THREAT</h3>
          <form onSubmit={e => { e.preventDefault(); createMention.mutate({ data: logForm as NarrativeMentionInput }); }} className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">PLATFORM *</label>
              <select required value={logForm.platform ?? ""} onChange={e => setLogForm(p => ({ ...p, platform: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                <option value="">— SELECT —</option>
                {["Twitter/X", "Facebook", "WhatsApp", "TikTok", "Instagram", "News", "Radio", "Flyer"].map(pl => <option key={pl} value={pl}>{pl}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">SEVERITY *</label>
              <select required value={logForm.threatLevel ?? "elevated"} onChange={e => setLogForm(p => ({ ...p, threatLevel: e.target.value as any }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                {SEVERITY_ORDER.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">AUTHOR / HANDLE</label>
              <input value={logForm.author ?? ""} onChange={e => setLogForm(p => ({ ...p, author: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">URL / LINK</label>
              <input value={logForm.url ?? ""} onChange={e => setLogForm(p => ({ ...p, url: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">CONTENT *</label>
              <textarea required value={logForm.content ?? ""} onChange={e => setLogForm(p => ({ ...p, content: e.target.value }))} rows={3} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none" />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowLog(false)} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
              <button type="submit" disabled={createMention.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><AlertTriangle className="w-3 h-3" /> LOG THREAT</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 font-mono text-[10px] border px-4 py-2 transition-colors relative ${tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {t.icon} {t.label}
            {t.id === "queue" && pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-black font-mono text-[8px] font-bold px-1 min-w-[16px] text-center">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── LIVE FEED ── */}
      {tab === "feed" && (
        <div className="space-y-3">
          {/* filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[10px] text-muted-foreground">FILTER:</span>
            <div className="flex gap-1">
              {["all", ...SEVERITY_ORDER].map(s => (
                <button key={s} onClick={() => setFilterSeverity(s)} className={`font-mono text-[10px] px-2 py-1 border transition-colors ${filterSeverity === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{s.toUpperCase()}</button>
              ))}
            </div>
            <div className="flex gap-1">
              {["all", "positive", "neutral", "negative"].map(s => (
                <button key={s} onClick={() => setFilterSentiment(s)} className={`font-mono text-[10px] px-2 py-1 border transition-colors ${filterSentiment === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{s.toUpperCase()}</button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">SCAN PLATFORM:</span>
              <select value={scanPlatform} onChange={e => setScanPlatform(e.target.value)} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
                <option value="all">ALL PLATFORMS</option>
                <option value="twitter">TWITTER/X</option>
                <option value="facebook">FACEBOOK</option>
                <option value="news">NEWS MEDIA</option>
              </select>
            </div>
          </div>

          {mentionsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-20" />)}</div>
          ) : filteredMentions.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Radio className="w-6 h-6 text-muted-foreground" />
              <p className="font-mono text-xs text-green-400">[ NARRATIVE_CLEAR — NO_THREATS_DETECTED ]</p>
              <button onClick={handleScan} disabled={scanning} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
                <Zap className="w-3 h-3" /> INITIATE SCAN
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* sort by threat level severity */}
              {[...filteredMentions].sort((a, b) => {
                const order = { critical: 0, high: 1, elevated: 2, normal: 3 };
                return (order[a.threatLevel as keyof typeof order] ?? 4) - (order[b.threatLevel as keyof typeof order] ?? 4);
              }).map(m => {
                const isExpanded = expandedId === m.id;
                return (
                  <div key={m.id} className={`bg-card border p-4 transition-colors ${m.threatLevel === "critical" ? "border-red-500/30" : m.threatLevel === "high" ? "border-orange-400/20" : "border-border"}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ThreatBadge level={m.threatLevel} />
                        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><PlatformIcon platform={m.platform} /> {m.platform}</span>
                        {m.author && <span className="font-mono text-[10px] text-muted-foreground">@{m.author}</span>}
                        <SentimentBadge sentiment={m.sentiment ?? "neutral"} score={m.sentimentScore ?? 50} />
                        {m.engagementCount && m.engagementCount > 0 && <span className="font-mono text-[10px] text-muted-foreground">↑ {m.engagementCount.toLocaleString()} engagements</span>}
                        {m.source !== "manual" && <span className="font-mono text-[9px] border border-border px-1 py-0.5 text-muted-foreground">[ AUTO-SCRAPED ]</span>}
                        {m.aiAnalyzed && <span className="font-mono text-[9px] text-green-400 flex items-center gap-0.5"><Bot className="w-2.5 h-2.5" /> AI</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[9px] text-muted-foreground">{new Date(m.detectedAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</span>
                        <button onClick={() => setExpandedId(isExpanded ? null : m.id)} className="text-muted-foreground hover:text-foreground">
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <p className="text-sm mt-2 leading-relaxed">{m.content}</p>

                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        {m.aiSummary && (
                          <div className="bg-secondary border border-border p-3">
                            <p className="font-mono text-[9px] text-muted-foreground mb-1 flex items-center gap-1"><Bot className="w-2.5 h-2.5" /> AI ANALYSIS</p>
                            <p className="text-xs text-muted-foreground">{m.aiSummary}</p>
                          </div>
                        )}
                        {m.counterNarrative && (
                          <div className="border-l-2 border-primary pl-3">
                            <p className="font-mono text-[9px] text-muted-foreground mb-0.5">COUNTER-NARRATIVE FILED:</p>
                            <p className="text-xs text-primary/90">{m.counterNarrative}</p>
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleAiAnalyze(m)}
                            disabled={analyzingId === m.id}
                            className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary disabled:opacity-60"
                          >
                            <Bot className={`w-3 h-3 ${analyzingId === m.id ? "animate-spin" : ""}`} />
                            {analyzingId === m.id ? "ANALYZING…" : "AI ANALYZE"}
                          </button>
                          {["high", "critical", "elevated"].includes(m.threatLevel as string) && (
                            <button
                              onClick={() => handleDraftResponse(m)}
                              disabled={generatingId === m.id}
                              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px] hover:bg-primary/90 disabled:opacity-60"
                            >
                              <Zap className={`w-3 h-3 ${generatingId === m.id ? "animate-spin" : ""}`} />
                              {generatingId === m.id ? "DRAFTING…" : "DRAFT RESPONSE"}
                            </button>
                          )}
                          {m.url && (
                            <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">
                              <Eye className="w-3 h-3" /> VIEW SOURCE
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── RESPONSE QUEUE ── */}
      {tab === "queue" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] text-muted-foreground">COUNTER-NARRATIVES AWAITING APPROVAL BEFORE PLATFORM PUBLICATION</p>
            <button onClick={loadResponses} className="flex items-center gap-1 font-mono text-[10px] border border-border px-3 py-1.5 hover:bg-secondary">
              <RefreshCw className="w-3 h-3" /> REFRESH
            </button>
          </div>

          {responsesLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-24" />)}</div>
          ) : responses.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Shield className="w-6 h-6 text-muted-foreground" />
              <p className="font-mono text-xs text-muted-foreground">[ QUEUE_EMPTY — NO_RESPONSES_PENDING ]</p>
              <p className="font-mono text-[10px] text-muted-foreground">Use "DRAFT RESPONSE" on any feed threat to generate a counter-narrative</p>
            </div>
          ) : (
            <div className="space-y-3">
              {responses.map(r => (
                <div key={r.id} className={`bg-card border p-4 ${r.status === "pending_approval" ? "border-yellow-400/30" : r.status === "approved" ? "border-green-400/20" : r.status === "published" ? "border-blue-400/20" : "border-border"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><PlatformIcon platform={r.platform} /> {r.platform}</span>
                      <span className={`font-mono text-[9px] flex items-center gap-0.5 ${r.draftedBy === "ai" ? "text-green-400" : "text-muted-foreground"}`}>
                        {r.draftedBy === "ai" ? <><Bot className="w-2.5 h-2.5" /> AI-DRAFTED</> : "MANUAL-DRAFT"}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] text-muted-foreground">{new Date(r.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>

                  {editingResponseId === r.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingContent}
                        onChange={e => setEditingContent(e.target.value)}
                        rows={4}
                        className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingResponseId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                        <button onClick={async () => {
                          await apiFetch(`/responses/${r.id}`, { method: "PATCH", body: JSON.stringify({ content: editingContent }) });
                          await loadResponses(); setEditingResponseId(null);
                        }} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px] hover:bg-primary/90"><Check className="w-3 h-3 inline mr-1" /> SAVE</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed mb-3">{r.content}</p>
                  )}

                  {rejectingId === r.id && (
                    <div className="flex gap-2 mb-3">
                      <input
                        placeholder="REJECTION REASON…"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        className="flex-1 bg-secondary border border-red-400/30 px-3 py-1.5 font-mono text-xs focus:outline-none focus:border-primary"
                      />
                      <button onClick={async () => {
                        await updateResponse(r.id, "rejected", { rejectionReason: rejectReason });
                        setRejectingId(null); setRejectReason("");
                      }} className="bg-red-500 text-white px-3 py-1.5 font-mono text-[10px]">CONFIRM REJECT</button>
                      <button onClick={() => setRejectingId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                    </div>
                  )}

                  {r.approvedBy && <p className="font-mono text-[10px] text-green-400 mb-2">✓ APPROVED BY: {r.approvedBy} · {new Date(r.approvedAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</p>}
                  {r.rejectionReason && <p className="font-mono text-[10px] text-red-400 mb-2">✗ REJECTED: {r.rejectionReason}</p>}
                  {r.publishedAt && <p className="font-mono text-[10px] text-blue-400 mb-2">↑ PUBLISHED: {new Date(r.publishedAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</p>}

                  <div className="flex gap-2 flex-wrap">
                    {r.status === "pending_approval" && (
                      <>
                        <button onClick={() => { setEditingResponseId(r.id); setEditingContent(r.content); }} className="flex items-center gap-1 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary"><Edit2 className="w-3 h-3" /> EDIT</button>
                        <button onClick={() => updateResponse(r.id, "approved")} className="flex items-center gap-1 bg-green-500/10 border border-green-500/40 text-green-400 px-3 py-1.5 font-mono text-[10px] hover:bg-green-500/20"><CheckCircle className="w-3 h-3" /> APPROVE</button>
                        <button onClick={() => setRejectingId(r.id)} className="flex items-center gap-1 bg-red-500/10 border border-red-500/40 text-red-400 px-3 py-1.5 font-mono text-[10px] hover:bg-red-500/20"><XCircle className="w-3 h-3" /> REJECT</button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <button onClick={() => updateResponse(r.id, "published")} className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px] hover:bg-primary/90"><Send className="w-3 h-3" /> PUBLISH TO {r.platform.toUpperCase()}</button>
                    )}
                    <button onClick={() => deleteResponse(r.id)} className="ml-auto flex items-center gap-1 border border-border px-2 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-red-400 hover:border-red-400/30"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AI REBUTTAL CENTER ── */}
      {tab === "rebuttal" && (() => {
        const ATTACK_TEMPLATES = [
          { label: "Water service update", text: "Please provide the official status, responsible department and next update date for this water-service issue." },
          { label: "Road maintenance status", text: "What verified information is available on this road maintenance request, including timeline and source?" },
          { label: "Budget accountability", text: "Please link the approved budget line and published implementation report for this project." },
          { label: "Health facility services", text: "Please confirm the current service status with the relevant health department and cite an official update." },
        ];

        const PLATFORMS = ["Twitter/X", "Facebook", "WhatsApp", "Press Statement", "Baraza Speech", "SMS", "TikTok Caption"];
        const CHAR_LIMITS: Record<string, number> = {
          "Twitter/X": 280, "Facebook": 500, "WhatsApp": 450,
          "Press Statement": 800, "Baraza Speech": 600, "SMS": 160, "TikTok Caption": 150,
        };
        const charLimit = CHAR_LIMITS[rebuttalPlatform] ?? 400;

        const TONE_COLORS: Record<string, string> = {
          "FACTUAL COUNTER": "text-blue-400 border-blue-400/40 bg-blue-400/5",
          "FIRM DENIAL": "text-orange-400 border-orange-400/40 bg-orange-400/5",
          "BRIDGE & PIVOT": "text-green-400 border-green-400/40 bg-green-400/5",
        };
        function toneColor(tone: string) {
          const key = Object.keys(TONE_COLORS).find(k => tone.toUpperCase().includes(k.split(" ")[0]));
          return key ? TONE_COLORS[key] : "text-primary border-primary/40 bg-primary/5";
        }

        return (
          <div className="space-y-4">

            {/* Explainer strip */}
            <div className="bg-primary/5 border border-primary/20 px-4 py-3 flex items-center gap-3">
              <Zap className="w-4 h-4 text-primary shrink-0" />
              <p className="font-mono text-[10px] text-muted-foreground">
                Paste any attack, false claim, or social media post below. AI will draft 3 tailored rebuttals in different tones — edit them, then save to the Response Queue for approval and publication.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">

              {/* ── LEFT: Input Panel ── */}
              <div className="col-span-2 space-y-4">

                {/* Common attack templates */}
                <div className="bg-card border border-border p-4 space-y-3">
                  <p className="font-mono text-[10px] text-muted-foreground tracking-widest">COMMON ATTACK TEMPLATES — CLICK TO LOAD</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ATTACK_TEMPLATES.map(t => (
                      <button
                        key={t.label}
                        onClick={() => setAttackText(t.text)}
                        className="font-mono text-[9px] border border-border px-2 py-1 hover:bg-secondary hover:border-primary/40 hover:text-primary transition-colors"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Attack input */}
                <div className="bg-card border border-border p-4 space-y-4">
                  <p className="font-mono text-[10px] tracking-widest">ATTACK / CLAIM TO REBUT</p>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] text-muted-foreground">SOURCE (OPTIONAL)</label>
                    <input
                      value={attackSource}
                      onChange={e => setAttackSource(e.target.value)}
                      placeholder="@handle · Twitter/X · WhatsApp group · etc."
                      className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] text-muted-foreground">ATTACK TEXT *</label>
                    <textarea
                      value={attackText}
                      onChange={e => setAttackText(e.target.value)}
                      rows={5}
                      placeholder="Paste the attack, claim, or negative social media post here…"
                      className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none"
                    />
                    <p className="font-mono text-[9px] text-muted-foreground text-right">{attackText.length} chars</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-mono text-[9px] text-muted-foreground">TARGET PLATFORM</label>
                      <select
                        value={rebuttalPlatform}
                        onChange={e => setRebuttalPlatform(e.target.value)}
                        className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
                      >
                        {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-mono text-[9px] text-muted-foreground">URGENCY</label>
                      <select
                        value={rebuttalUrgency}
                        onChange={e => setRebuttalUrgency(e.target.value)}
                        className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
                      >
                        <option value="planned">PLANNED</option>
                        <option value="live">LIVE · URGENT</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-muted-foreground">CHAR LIMIT FOR {rebuttalPlatform.toUpperCase()}: {charLimit}</span>
                  </div>

                  {rebuttalError && (
                    <div className="bg-red-500/10 border border-red-500/30 px-3 py-2 flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                      <span className="font-mono text-[10px] text-red-400">{rebuttalError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleDraftRebuttal}
                    disabled={draftingRebuttal || !attackText.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"
                  >
                    {draftingRebuttal ? (
                      <><RefreshCw className="w-3 h-3 animate-spin" /> DRAFTING REBUTTALS…</>
                    ) : (
                      <><Bot className="w-3 h-3" /> DRAFT 3 REBUTTALS</>
                    )}
                  </button>
                </div>
              </div>

              {/* ── RIGHT: Rebuttals Output ── */}
              <div className="col-span-3 space-y-3">

                {/* Empty / loading state */}
                {!draftingRebuttal && rebuttals.length === 0 && (
                  <div className="bg-card border border-border flex flex-col items-center justify-center h-full min-h-64 gap-4 p-8">
                    <Bot className="w-8 h-8 text-muted-foreground" />
                    <div className="text-center space-y-1">
                      <p className="font-mono text-xs font-bold tracking-widest">AWAITING ATTACK INPUT</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Select a template or paste an attack on the left, then click DRAFT 3 REBUTTALS.
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        AI will generate 3 variations: Factual Counter · Firm Denial · Bridge & Pivot
                      </p>
                    </div>
                  </div>
                )}

                {draftingRebuttal && (
                  <div className="bg-card border border-primary/40 p-6 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary animate-pulse" />
                      <span className="font-mono text-xs text-primary tracking-widest">GENERATING REBUTTALS</span>
                    </div>
                    {[
                      "Analysing attack vector and threat level…",
                      `Calibrating for ${rebuttalPlatform} character constraints (${charLimit} chars)…`,
                      "Drafting Factual Counter variation…",
                      "Drafting Firm Denial variation…",
                      "Drafting Bridge & Pivot variation…",
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary/50 animate-pulse" style={{ animationDelay: `${i * 250}ms` }} />
                        <span className="font-mono text-[10px] text-muted-foreground">{step}</span>
                      </div>
                    ))}
                  </div>
                )}

                {rebuttals.length > 0 && (
                  <>
                    {/* Attack summary */}
                    <div className="bg-secondary border border-border px-4 py-3">
                      <p className="font-mono text-[9px] text-muted-foreground mb-1">ATTACK BEING REBUTTED:</p>
                      <p className="font-mono text-[10px] text-foreground/80 line-clamp-2">"{attackText}"</p>
                      {attackSource && <p className="font-mono text-[9px] text-muted-foreground mt-1">SOURCE: {attackSource}</p>}
                    </div>

                    {/* Rebuttal cards */}
                    {rebuttals.map((r, i) => {
                      const content = editingRebuttal[i] ?? r.content;
                      const count = content.length;
                      const overLimit = count > r.charLimit;
                      const isSaved = savedRebuttals.has(i);

                      return (
                        <div key={i} className={`bg-card border p-4 space-y-3 ${isSaved ? "border-green-400/30" : "border-border"}`}>
                          {/* Header */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[9px] border px-1.5 py-0.5 text-muted-foreground">V{i + 1}</span>
                              <span className={`font-mono text-[9px] border px-1.5 py-0.5 ${toneColor(r.tone)}`}>
                                {r.tone.toUpperCase()}
                              </span>
                              {r.angle && (
                                <span className="font-mono text-[9px] text-muted-foreground italic">{r.angle}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-[9px] ${overLimit ? "text-red-400" : "text-muted-foreground"}`}>
                                {count}/{r.charLimit}
                              </span>
                              {overLimit && (
                                <span className="font-mono text-[9px] text-red-400 border border-red-400/30 px-1 py-0.5">OVER LIMIT</span>
                              )}
                              {isSaved && (
                                <span className="font-mono text-[9px] text-green-400 border border-green-400/30 px-1.5 py-0.5 flex items-center gap-1">
                                  <CheckCircle className="w-2.5 h-2.5" /> SAVED TO QUEUE
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Editable content */}
                          <textarea
                            value={content}
                            onChange={e => setEditingRebuttal(prev => ({ ...prev, [i]: e.target.value }))}
                            rows={4}
                            className={`w-full bg-secondary border px-3 py-2 font-mono text-xs focus:outline-none resize-none ${overLimit ? "border-red-400/40 focus:border-red-400" : "border-border focus:border-primary"}`}
                          />

                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(content);
                              }}
                              className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary"
                            >
                              <Eye className="w-3 h-3" /> COPY
                            </button>
                            <button
                              onClick={() => setEditingRebuttal(prev => ({ ...prev, [i]: r.content }))}
                              className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary"
                            >
                              <RefreshCw className="w-3 h-3" /> RESET
                            </button>
                            <button
                              onClick={() => saveRebuttalToQueue(i)}
                              disabled={isSaved || overLimit}
                              className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 font-mono text-[10px] hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isSaved ? (
                                <><CheckCircle className="w-3 h-3" /> SAVED</>
                              ) : (
                                <><Send className="w-3 h-3" /> SAVE TO QUEUE</>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Regenerate */}
                    <div className="flex justify-end">
                      <button
                        onClick={handleDraftRebuttal}
                        disabled={draftingRebuttal}
                        className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"
                      >
                        <RefreshCw className="w-3 h-3" /> REGENERATE ALL
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PLATFORM INTEL ── */}
      {tab === "platforms" && (
        <div className="space-y-4">
          {/* Official account references are public links, not OAuth connections. */}
          <div className="bg-card border border-border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-mono text-xs font-bold tracking-wider">OFFICIAL SOCIAL ACCOUNTS</h3>
                <p className="text-[10px] text-muted-foreground mt-1">Public profile references supplied by the administrator. Account authorization is pending.</p>
              </div>
              <span className="font-mono text-[9px] border border-yellow-500/40 text-yellow-400 px-2 py-1">NOT CONNECTED</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { name: "FACEBOOK", handle: "Not connected", guide: "https://developers.facebook.com/apps/" },
                { name: "TIKTOK", handle: "Not connected", guide: "https://developers.tiktok.com/" },
                { name: "X / TWITTER", handle: "Not connected", guide: "https://developer.x.com/" },
              ].map(account => (
                <div key={account.name} className="border border-border bg-secondary/30 p-3 space-y-2">
                  <div className="font-mono text-[10px] font-semibold">{account.name}</div>
                  <div className="text-xs">{account.handle}</div>
                  <div className="text-[10px] text-muted-foreground">Public profile only · OAuth not configured</div>
                  <div className="flex flex-wrap gap-3">
                    <a href={account.guide} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground underline">DEVELOPER SETUP</a>
                  </div>
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">To connect later: create the Meta / TikTok developer apps, register approved HTTPS callback URLs, configure secrets on the server, then authorize via official login. Do not paste passwords or tokens into the dashboard. TikTok Login Kit + Display API supports authorized profile and public video data; it does not grant unrestricted Research API access.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {[
              {
                key: "twitter", label: "TWITTER / X", icon: <Twitter className="w-4 h-4 text-sky-400" />,
                fields: [
                  { key: "bearerToken", label: "BEARER TOKEN", placeholder: "AAAA…" },
                  { key: "apiKey", label: "API KEY (v2)", placeholder: "Your API key" },
                  { key: "apiSecret", label: "API SECRET", placeholder: "Your API secret" },
                ],
                hint: "Requires Twitter Developer Account (v2 API). Use Bearer Token for read-only scraping, API key + secret for posting."
              },
              {
                key: "facebook", label: "FACEBOOK", icon: <Facebook className="w-4 h-4 text-blue-500" />,
                fields: [
                  { key: "accessToken", label: "PAGE ACCESS TOKEN", placeholder: "EAA…" },
                  { key: "pageId", label: "PAGE ID", placeholder: "Your Facebook Page ID" },
                  { key: "apiKey", label: "APP ID", placeholder: "Meta App ID" },
                  { key: "apiSecret", label: "APP SECRET", placeholder: "Meta App Secret" },
                ],
                hint: "Requires Facebook Developer App with pages_read_engagement permission."
              },
              {
                key: "google_alerts", label: "GOOGLE ALERTS / RSS", icon: <Globe className="w-4 h-4 text-yellow-400" />,
                fields: [
                  { key: "rssUrl", label: "GOOGLE ALERTS RSS URL", placeholder: "https://www.google.com/alerts/feeds/…" },
                ],
                hint: "Add a verified government or public-service RSS feed URL here."
              },
              {
                key: "news_rss", label: "NEWS MEDIA RSS", icon: <Newspaper className="w-4 h-4 text-yellow-400" />,
                fields: [
                  { key: "rssUrl", label: "RSS FEED URL", placeholder: "https://www.nation.co.ke/rss or custom feed" },
                ],
                hint: "Nation Media, Standard, The Star, Citizen TV all publish RSS feeds. Paste the URL here."
              },
              {
                key: "tiktok", label: "TIKTOK", icon: <Radio className="w-4 h-4 text-pink-400" />,
                fields: [
                  { key: "accessToken", label: "ACCESS TOKEN", placeholder: "TikTok Developer Access Token" },
                  { key: "apiKey", label: "CLIENT KEY", placeholder: "TikTok Client Key" },
                ],
                hint: "For the official account, use TikTok Login Kit + Display API with approved user.info.basic and video.list scopes. Research API access is separate. OAuth is not configured yet; do not paste account passwords here."
              },
            ].map(p => {
              const existing = platforms.find(pl => pl.platform === p.key);
              const isEditing = editingPlatform === p.key;
              return (
                <div key={p.key} className={`bg-card border p-4 ${existing?.isActive ? "border-green-400/20" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {p.icon}
                      <span className="font-mono text-xs font-bold">{p.label}</span>
                    </div>
                    {existing?.isActive ? (
                      <span className="font-mono text-[9px] text-green-400 border border-green-400/30 px-1.5 py-0.5">[ ACTIVE ]</span>
                    ) : (
                      <span className="font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5">[ INACTIVE ]</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      {p.fields.map(f => (
                        <div key={f.key} className="space-y-0.5">
                          <label className="font-mono text-[9px] text-muted-foreground">{f.label}</label>
                          <input
                            type="password"
                            placeholder={f.placeholder}
                            value={platformForm[f.key] ?? ""}
                            onChange={e => setPlatformForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full bg-secondary border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary"
                          />
                        </div>
                      ))}
                      <p className="font-mono text-[9px] text-muted-foreground leading-relaxed mt-2">{p.hint}</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setEditingPlatform(null); setPlatformForm({}); }} className="flex-1 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                        <button onClick={() => savePlatform(p.key)} className="flex-1 bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px] hover:bg-primary/90"><Check className="w-3 h-3 inline mr-1" /> SAVE</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {existing?.lastSynced && <p className="font-mono text-[9px] text-muted-foreground">LAST SYNC: {new Date(existing.lastSynced).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</p>}
                      <p className="font-mono text-[9px] text-muted-foreground leading-relaxed">{p.hint}</p>
                      <button onClick={() => { setEditingPlatform(p.key); setPlatformForm({}); }} className="w-full flex items-center justify-center gap-2 border border-border px-3 py-2 font-mono text-[10px] hover:bg-secondary">
                        <Settings className="w-3 h-3" /> {existing ? "RECONFIGURE" : "CONFIGURE"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scan History */}
          <div className="bg-card border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[10px] text-muted-foreground">RECENT SCAN HISTORY</p>
              <button onClick={loadPlatforms} className="flex items-center gap-1 font-mono text-[10px] border border-border px-2 py-1 hover:bg-secondary"><RefreshCw className="w-3 h-3" /></button>
            </div>
            {scans.length === 0 ? (
              <p className="font-mono text-[10px] text-muted-foreground">[ NO_SCANS_RUN ]</p>
            ) : (
              <div className="space-y-1">
                {scans.slice(0, 10).map(s => (
                  <div key={s.id} className="flex items-center gap-4 py-1.5 border-b border-border/50">
                    <span className={`font-mono text-[9px] border px-1 py-0.5 ${s.status === "complete" ? "text-green-400 border-green-400/30" : s.status === "failed" ? "text-red-400 border-red-400/30" : "text-yellow-400 border-yellow-400/30 animate-pulse"}`}>
                      {s.status.toUpperCase()}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{s.platform.toUpperCase()}</span>
                    <span className="font-mono text-[10px]">"{s.query}"</span>
                    <span className="font-mono text-[10px] text-green-400">{s.mentionsFound ?? 0} mentions</span>
                    <span className="font-mono text-[9px] text-muted-foreground ml-auto">{new Date(s.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</span>
                    {s.errorMessage && <span className="font-mono text-[9px] text-red-400">{s.errorMessage}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COMPETITORS ── */}
      {tab === "competitors" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowAddComp(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> ADD COMPETITOR</button>
          </div>
          {showAddComp && (
            <div className="bg-card border border-primary/50 p-4">
              <h3 className="font-mono text-xs tracking-widest mb-4">ADD COMPETITOR PROFILE</h3>
              <form onSubmit={e => { e.preventDefault(); createCompetitor.mutate({ data: { name: competitorForm.name!, party: competitorForm.party, constituency: competitorForm.constituency, strengths: [], weaknesses: [], promisesMade: [] } }); }} className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">NAME *</label><input required value={competitorForm.name ?? ""} onChange={e => setCompetitorForm(p => ({ ...p, name: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">PARTY</label><input value={competitorForm.party ?? ""} onChange={e => setCompetitorForm(p => ({ ...p, party: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">CONSTITUENCY</label><input value={competitorForm.constituency ?? ""} onChange={e => setCompetitorForm(p => ({ ...p, constituency: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="col-span-3 flex gap-2 justify-end"><button type="button" onClick={() => setShowAddComp(false)} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button><button type="submit" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs"><Check className="w-3 h-3" /> ADD</button></div>
              </form>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {competitorsLoading ? [...Array(2)].map((_, i) => <div key={i} className="bg-card border border-border h-40 animate-pulse" />) : !competitors || competitors.length === 0 ? (
              <div className="col-span-2 bg-card border border-border flex items-center justify-center py-12"><p className="font-mono text-xs text-muted-foreground">[ NO_COMPETITORS_TRACKED ]</p></div>
            ) : competitors.map(c => (
              <div key={c.id} className="bg-card border border-border p-4">
                <div className="mb-3"><h3 className="font-bold">{c.name}</h3><div className="flex gap-3 text-[10px] font-mono text-muted-foreground mt-0.5">{c.party && <span>{c.party}</span>}{c.constituency && <span>{c.constituency}</span>}</div></div>
                {(c.strengths as string[]).length > 0 && <div className="mb-2"><p className="text-[9px] font-mono text-green-400 mb-1">STRENGTHS</p>{(c.strengths as string[]).map((s, i) => <p key={i} className="text-xs text-muted-foreground">+ {s}</p>)}</div>}
                {(c.weaknesses as string[]).length > 0 && <div className="mb-2"><p className="text-[9px] font-mono text-red-400 mb-1">WEAKNESSES</p>{(c.weaknesses as string[]).map((w, i) => <p key={i} className="text-xs text-muted-foreground">- {w}</p>)}</div>}
                <div className="flex gap-4 mt-3 text-[10px] font-mono"><span>PROMISES: {(c.promisesMade as string[]).length}</span><span className="text-green-400">KEPT: {c.promisesKept}</span><span className="text-red-400">BROKEN: {c.promisesBroken}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── WAR ROOM ── */}
      {tab === "warroom" && (
        <div className="space-y-3">
          {/* SWOT Analysis */}
          <div className="bg-card border border-border">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Shield className="w-3 h-3 text-primary" />
              <span className="font-mono text-[10px] tracking-widest">SERVICE DELIVERY REVIEW · {CAMPAIGN.areaLabel.toUpperCase()}</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-border">
              <div className="p-4">
                <p className="font-mono text-[9px] text-green-400 tracking-widest mb-2">[ STRENGTHS ]</p>
                <ul className="space-y-1">
                  {["Published county plans and budgets","Documented service delivery updates","Official public participation records","Accessible county information","Auditable project documentation"].map(s => (
                    <li key={s} className="font-mono text-[9px] text-muted-foreground flex items-start gap-1.5"><span className="text-green-400 shrink-0">+</span>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="p-4">
                <p className="font-mono text-[9px] text-red-400 tracking-widest mb-2">[ WEAKNESSES ]</p>
                <ul className="space-y-1">
                  {["Missing or outdated public records","Unverified service status reports"].map(s => (
                    <li key={s} className="font-mono text-[9px] text-muted-foreground flex items-start gap-1.5"><span className="text-red-400 shrink-0">−</span>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="p-4">
                <p className="font-mono text-[9px] text-blue-400 tracking-widest mb-2">[ OPPORTUNITIES ]</p>
                <ul className="space-y-1">
                  {["Better access to county service information","Clear project progress reporting","Public feedback and accountability channels"].map(s => (
                    <li key={s} className="font-mono text-[9px] text-muted-foreground flex items-start gap-1.5"><span className="text-blue-400 shrink-0">↑</span>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="p-4">
                <p className="font-mono text-[9px] text-orange-400 tracking-widest mb-2">[ THREATS ]</p>
                <ul className="space-y-1">
                  {["Unverified claims spreading online","Delayed responses to service issues","Incomplete or inconsistent source records"].map(s => (
                    <li key={s} className="font-mono text-[9px] text-muted-foreground flex items-start gap-1.5"><span className="text-orange-400 shrink-0">!</span>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setShowAddBrief(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> FILE BRIEF</button>
          </div>
          {showAddBrief && (
            <div className="bg-card border border-primary/50 p-4">
              <h3 className="font-mono text-xs tracking-widest mb-4">NEW INTELLIGENCE BRIEF</h3>
              <form onSubmit={e => { e.preventDefault(); createBrief.mutate({ data: { ...briefForm, actions: [] } as WarRoomBriefInput }); }} className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-mono text-muted-foreground">TITLE *</label><input required value={briefForm.title ?? ""} onChange={e => setBriefForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">PRIORITY *</label><select required value={briefForm.priority ?? "medium"} onChange={e => setBriefForm(p => ({ ...p, priority: e.target.value as any }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">{["low", "medium", "high", "urgent"].map(pr => <option key={pr} value={pr}>{pr.toUpperCase()}</option>)}</select></div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">CATEGORY *</label><input required value={briefForm.category ?? ""} onChange={e => setBriefForm(p => ({ ...p, category: e.target.value }))} placeholder="NARRATIVE / FIELD / INTEL" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-mono text-muted-foreground">SUMMARY *</label><textarea required value={briefForm.summary ?? ""} onChange={e => setBriefForm(p => ({ ...p, summary: e.target.value }))} rows={3} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none" /></div>
                <div className="col-span-2 flex gap-2 justify-end"><button type="button" onClick={() => setShowAddBrief(false)} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button><button type="submit" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs"><Check className="w-3 h-3" /> FILE BRIEF</button></div>
              </form>
            </div>
          )}
          {briefsLoading ? <div className="animate-pulse bg-card border border-border h-20" /> : !briefs || briefs.length === 0 ? (
            <div className="bg-card border border-border flex items-center justify-center py-12"><p className="font-mono text-xs text-muted-foreground">[ NO_BRIEFS_FILED ]</p></div>
          ) : briefs.map(b => (
            <div key={b.id} className={`bg-card border p-4 ${b.priority === "urgent" ? "border-red-400/30" : "border-border"}`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-sm">{b.title}</h3>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${b.priority === "urgent" ? "text-red-400 border-red-400/30 animate-pulse" : b.priority === "high" ? "text-orange-400 border-orange-400/30" : b.priority === "medium" ? "text-yellow-400 border-yellow-400/30" : "text-blue-400 border-blue-400/30"}`}>[ {b.priority.toUpperCase()} ]</span>
                  <span className="font-mono text-[9px] bg-secondary border border-border px-1.5 py-0.5">{b.category}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{b.summary}</p>
              {(b.actions as string[]).length > 0 && <div><p className="text-[9px] font-mono text-muted-foreground mb-1">ACTIONS REQUIRED:</p>{(b.actions as string[]).map((a, i) => <p key={i} className="text-xs">{i + 1}. {a}</p>)}</div>}
              <p className="text-[9px] font-mono text-muted-foreground mt-2">{new Date(b.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── NARRATIVE PLAYBOOK ── */}
      {tab === "playbook" && (
        <div className="space-y-4">
          <div className="bg-primary/5 border border-primary/30 px-4 py-3 flex items-start gap-3">
            <Megaphone className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-mono text-[11px] tracking-widest text-foreground">COUNTY PUBLIC INFORMATION · MAKUENI</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-1">These templates guide factual public-service updates. Cite official sources and mark unverified details clearly.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {NARRATIVE_PLAYBOOK.map((n, i) => (
              <div key={n.title} className="bg-card border border-border flex flex-col">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-primary shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-bold text-sm truncate">{n.title}</span>
                  </div>
                  <span className={`font-mono text-[9px] border px-1.5 py-0.5 shrink-0 ${n.tag === "WATER" ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground border-border"}`}>[ {n.tag} ]</span>
                </div>
                <div className="p-4 space-y-3 flex-1">
                  <p className="text-xs text-foreground italic">"{n.core}"</p>
                  <div className="space-y-1.5">
                    {n.lines.map((l) => (
                      <div key={l.text} className="flex items-start gap-2">
                        <span className="font-mono text-[8px] text-primary border border-primary/30 px-1 py-0.5 shrink-0 mt-0.5 w-14 text-center">{l.lang}</span>
                        <span className="font-mono text-[11px] text-muted-foreground leading-relaxed">{l.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-2.5 border-t border-border bg-secondary/30">
                  <p className="font-mono text-[9px] text-muted-foreground"><span className="text-green-400">WHY: </span>{n.why}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-card border border-border">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <MapPin className="w-3 h-3 text-primary" />
                <span className="font-mono text-[10px] tracking-widest">LOCALIZE BY WARD</span>
              </div>
              <div className="divide-y divide-border">
                {PLAYBOOK_WARDS.map((w) => (
                  <div key={w.ward} className="px-4 py-3">
                    <p className="font-mono text-[11px] text-foreground">{w.ward}</p>
                    <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{w.focus}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Radio className="w-3 h-3 text-primary" />
                <span className="font-mono text-[10px] tracking-widest">LOCALIZE BY CHANNEL</span>
              </div>
              <div className="divide-y divide-border">
                {PLAYBOOK_CHANNELS.map((c) => (
                  <div key={c.channel} className="px-4 py-3">
                    <p className="font-mono text-[11px] text-foreground">{c.channel}</p>
                    <p className="font-mono text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{c.guidance}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}