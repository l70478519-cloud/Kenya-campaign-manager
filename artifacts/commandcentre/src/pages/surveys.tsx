import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useState, useEffect, useCallback } from "react";
import {
  useListSurveys, useCreateSurvey, useGetSurvey, useGetSurveyResponses,
  getListSurveysQueryKey, getGetSurveyResponsesQueryKey, getGetSurveyQueryKey
} from "@workspace/api-client-react";
import type { SurveyInput, SurveyQuestionInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Check, BarChart2, FileText, AlertTriangle, Target,
  TrendingUp, RefreshCw, ChevronDown, ChevronUp, Trash2, MapPin,
  Users, Vote, Layers, Eye, Send, Flag, CheckCircle, Clock
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const POLL_CATEGORIES = ["general", "leadership", "development", "security", "economy", "health", "education", "infrastructure", "water"];
const ISSUE_CATEGORIES = ["infrastructure", "water", "health", "education", "security", "land", "economy", "governance", "environment", "youth", "women", "other"];
const URGENCIES = ["low", "medium", "high", "critical"] as const;
const Q_TYPES = ["text", "single_choice", "multiple_choice", "rating"] as const;
const AGE_GROUPS = ["18-25", "26-35", "36-45", "46-55", "56+"];

type Tab = "polls" | "issues" | "surveys" | "analytics";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}api/surveys${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmt(v: unknown) { return v == null ? "—" : String(v); }

function urgencyColor(u: string) {
  return u === "critical" ? "text-red-500 border-red-500/40 bg-red-500/5"
    : u === "high" ? "text-orange-400 border-orange-400/30 bg-orange-400/5"
    : u === "medium" ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/5"
    : "text-blue-400 border-blue-400/30 bg-blue-400/5";
}
function statusColor(s: string) {
  return s === "active" ? "text-green-400 border-green-400/30"
    : s === "closed" ? "text-muted-foreground border-border"
    : s === "resolved" ? "text-green-400 border-green-400/30"
    : s === "monitoring" ? "text-blue-400 border-blue-400/30"
    : "text-yellow-400 border-yellow-400/30";
}
function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${className}`}>[ {label} ]</span>;
}

// ─── Poll Result Bar ──────────────────────────────────────────────────────────
function ResultBar({ label, votes, pct, total, color = "bg-primary" }: { label: string; votes: number; pct: number; total: number; color?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{votes} votes</span>
          <span className={`font-mono text-sm font-bold ${pct >= 50 ? "text-primary" : "text-foreground"}`}>{pct}%</span>
        </div>
      </div>
      <div className="bg-secondary h-5 w-full relative overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ${pct >= 50 ? "bg-primary" : pct >= 30 ? "bg-yellow-400/70" : "bg-muted-foreground/40"}`}
          style={{ width: `${pct}%` }}
        />
        {pct >= 50 && <span className="absolute right-2 top-0 h-full flex items-center font-mono text-[9px] text-primary-foreground">LEADING</span>}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Surveys() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("polls");
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [registrationError, setRegistrationError] = useState("");
  const [showRegistrations, setShowRegistrations] = useState(false);
  const [requestError, setRequestError] = useState("");

  // Polls
  const [polls, setPolls] = useState<any[]>([]);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [showNewPoll, setShowNewPoll] = useState(false);
  const [pollForm, setPollForm] = useState<Record<string, any>>({ category: "general", ward: "all", options: ["", ""] });
  const [selectedPoll, setSelectedPoll] = useState<number | null>(null);
  const [pollResults, setPollResults] = useState<Record<number, any>>({});
  const [votingPollId, setVotingPollId] = useState<number | null>(null);
  const [voteForm, setVoteForm] = useState<Record<string, any>>({ optionIndex: null });

  // Issues
  const [issues, setIssues] = useState<any[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [issueForm, setIssueForm] = useState<Record<string, any>>({ urgency: "medium", category: "infrastructure", ward: "all" });
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [reportingIssueId, setReportingIssueId] = useState<number | null>(null);
  const [reportForm, setReportForm] = useState<Record<string, string>>({});
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterWard, setFilterWard] = useState("all");
  const [resolvingIssueId, setResolvingIssueId] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");

  // Surveys
  const { data: surveys, isLoading: surveysLoading } = useListSurveys();
  const [showNewSurvey, setShowNewSurvey] = useState(false);
  const [surveyTitle, setSurveyTitle] = useState("");
  const [surveyDesc, setSurveyDesc] = useState("");
  const [questions, setQuestions] = useState<Partial<SurveyQuestionInput>[]>([{ type: "text", text: "", order: 1 }]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const { data: selectedSurvey } = useGetSurvey(selectedSurveyId!, { query: { queryKey: getGetSurveyQueryKey(selectedSurveyId!), enabled: !!selectedSurveyId } });
  const { data: surveyResponses } = useGetSurveyResponses(selectedSurveyId!, { query: { queryKey: getGetSurveyResponsesQueryKey(selectedSurveyId!), enabled: !!selectedSurveyId } });
  const createSurvey = useCreateSurvey({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSurveysQueryKey() }); setShowNewSurvey(false); setSurveyTitle(""); setSurveyDesc(""); setQuestions([{ type: "text", text: "", order: 1 }]); } } });

  // Analytics
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const loadRegistrations = useCallback(async () => {
    try {
      const data = await apiFetch("/participant-registrations");
      setRegistrations(data.registrations ?? []); setRegistrationError("");
    } catch (e) { setRegistrationError(e instanceof Error ? e.message : "Unable to load registrations"); }
  }, []);
  function exportRegistrations() {
    const quote = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const csv = [["Full name","Phone","Ward","Thank-you SMS consent","Registered at"], ...registrations.map(r => [r.fullName,r.phone,r.ward,r.thankYouSmsConsent ? "Yes" : "No",r.createdAt])].map(row => row.map(quote).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "poll-voluntary-registrations.csv"; a.click(); URL.revokeObjectURL(url);
  }
  const loadPolls = useCallback(async () => {
    setPollsLoading(true);
    try { setRequestError(""); setPolls(await apiFetch("/polls")); } catch (e) { setRequestError(e instanceof Error ? e.message : "Could not load polls"); } finally { setPollsLoading(false); }
  }, []);
  const loadIssues = useCallback(async () => {
    setIssuesLoading(true);
    try { setRequestError(""); setIssues(await apiFetch("/issues")); } catch (e) { setRequestError(e instanceof Error ? e.message : "Could not load issues"); } finally { setIssuesLoading(false); }
  }, []);
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try { setRequestError(""); setAnalytics(await apiFetch("/analytics")); } catch (e) { setRequestError(e instanceof Error ? e.message : "Could not load analytics"); } finally { setAnalyticsLoading(false); }
  }, []);
  const loadPollResults = useCallback(async (id: number) => {
    const results = await apiFetch(`/polls/${id}/results`);
    setPollResults(prev => ({ ...prev, [id]: results }));
  }, []);

  useEffect(() => { if (tab === "polls") loadPolls(); }, [tab, loadPolls]);
  useEffect(() => { if (tab === "issues") loadIssues(); }, [tab, loadIssues]);
  useEffect(() => { if (tab === "analytics") loadAnalytics(); }, [tab, loadAnalytics]);
  useEffect(() => { if (selectedPoll) loadPollResults(selectedPoll); }, [selectedPoll, loadPollResults]);

  async function createPoll() {
    const opts = (pollForm.options as string[]).filter(o => o.trim().length > 0);
    if (!pollForm.title || opts.length < 2) return;
    await apiFetch("/polls", { method: "POST", body: JSON.stringify({ ...pollForm, options: opts }) });
    await loadPolls();
    setShowNewPoll(false);
    setPollForm({ category: "general", ward: "all", options: ["", ""] });
  }

  async function submitVote(pollId: number) {
    if (voteForm.optionIndex === null) return;
    await apiFetch(`/polls/${pollId}/vote`, { method: "POST", body: JSON.stringify(voteForm) });
    await loadPollResults(pollId);
    await loadPolls();
    setVotingPollId(null);
    setVoteForm({ optionIndex: null });
  }

  async function closePoll(id: number) {
    await apiFetch(`/polls/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
    await loadPolls();
    if (selectedPoll === id) await loadPollResults(id);
  }

  async function keepPollOpen(id: number) {
    await apiFetch(`/polls/${id}`, { method: "PATCH", body: JSON.stringify({ status: "active", deadline: null }) });
    await loadPolls();
    if (selectedPoll === id) await loadPollResults(id);
  }

  async function deletePoll(id: number) {
    await apiFetch(`/polls/${id}`, { method: "DELETE" });
    await loadPolls();
    if (selectedPoll === id) setSelectedPoll(null);
  }

  async function createIssue() {
    if (!issueForm.title || !issueForm.description) return;
    await apiFetch("/issues", { method: "POST", body: JSON.stringify(issueForm) });
    await loadIssues();
    setShowNewIssue(false);
    setIssueForm({ urgency: "medium", category: "infrastructure", ward: "all" });
  }

  async function addFieldReport(issueId: number) {
    if (!reportForm.notes) return;
    await apiFetch(`/issues/${issueId}/report`, { method: "POST", body: JSON.stringify(reportForm) });
    await loadIssues();
    setReportingIssueId(null);
    setReportForm({});
  }

  async function resolveIssue(id: number) {
    await apiFetch(`/issues/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved", resolution }) });
    await loadIssues();
    setResolvingIssueId(null);
    setResolution("");
  }

  async function updateIssueStatus(id: number, status: string) {
    await apiFetch(`/issues/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadIssues();
  }

  async function deleteIssue(id: number) {
    await apiFetch(`/issues/${id}`, { method: "DELETE" });
    await loadIssues();
    if (expandedIssue === id) setExpandedIssue(null);
  }

  const filteredIssues = issues.filter(i => {
    if (filterUrgency !== "all" && i.urgency !== filterUrgency) return false;
    if (filterCategory !== "all" && i.category !== filterCategory) return false;
    if (filterWard !== "all" && i.ward !== filterWard && i.ward !== "all") return false;
    return true;
  });

  // Stats
  const activePolls = polls.filter(p => p.status === "active").length;
  const totalVotes = polls.reduce((s, p) => s + (p.totalVotes ?? 0), 0);
  const openIssues = issues.filter(i => i.status === "open").length;
  const criticalIssues = issues.filter(i => i.urgency === "critical" && i.status === "open").length;

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: "polls", label: "OPINION POLLS", icon: <Vote className="w-3 h-3" />, badge: activePolls || undefined },
    { id: "issues", label: "TOPICAL ISSUES", icon: <Flag className="w-3 h-3" />, badge: criticalIssues || undefined },
    { id: "surveys", label: "FIELD SURVEYS", icon: <FileText className="w-3 h-3" /> },
    { id: "analytics", label: "ANALYTICS", icon: <BarChart2 className="w-3 h-3" /> },
  ];

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">INTELLIGENCE GATHERING</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">OPINION POLLS · TOPICAL ISSUES · FIELD SURVEYS · {CAMPAIGN.areaLabel.toUpperCase()}</p>
        </div>
        <div className="flex gap-2">
          {tab === "polls" && <button onClick={() => setShowNewPoll(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> NEW POLL</button>}
          {tab === "issues" && <button onClick={() => setShowNewIssue(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> LOG ISSUE</button>}
          {tab === "surveys" && <button onClick={() => setShowNewSurvey(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> NEW SURVEY</button>}
          {tab === "analytics" && <button onClick={loadAnalytics} disabled={analyticsLoading} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary disabled:opacity-60"><RefreshCw className={`w-3 h-3 ${analyticsLoading ? "animate-spin" : ""}`} /> REFRESH</button>}
        </div>
      </div>

      <section className="border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div><h2 className="text-xs font-bold tracking-wider">VOLUNTARY PARTICIPANT CONTACTS</h2><p className="text-[10px] text-muted-foreground mt-1">Independent registration list · No individual ballot selections are stored here.</p></div>
          <div className="flex gap-2 flex-wrap"><button type="button" className="border border-border px-3 py-2 text-xs" onClick={() => { setShowRegistrations(v => !v); if (!showRegistrations) loadRegistrations(); }}>{showRegistrations ? "HIDE LIST" : "VIEW LIST"}</button>{showRegistrations && <button type="button" className="border border-border px-3 py-2 text-xs" onClick={loadRegistrations}>REFRESH</button>}{showRegistrations && registrations.length > 0 && <button type="button" className="border border-border px-3 py-2 text-xs" onClick={exportRegistrations}>EXPORT CSV</button>}</div>
        </div>
        {showRegistrations && <>
          {registrationError && <p role="alert" className="text-red-400 text-xs">{registrationError}</p>}
          <p className="text-xs text-muted-foreground">{registrations.length} voluntary contact registrations (up to 5,000 most recent). This is not a verified count of unique voters.</p>
          <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[540px] text-xs"><thead><tr className="text-left border-b border-border"><th className="p-2">Full name</th><th className="p-2">Phone</th><th className="p-2">Ward</th><th className="p-2">Thank-you SMS</th><th className="p-2">Date</th></tr></thead><tbody>{registrations.map(r=><tr key={r.id} className="border-b border-border"><td className="p-2">{r.fullName}</td><td className="p-2">{r.phone}</td><td className="p-2">{r.ward}</td><td className="p-2">{r.thankYouSmsConsent ? "Opted in" : "No"}</td><td className="p-2">{new Date(r.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        </>}
      </section>

      {/* Stats bar */}
      {requestError && <div role="alert" className="border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-300">Unable to load data: {requestError} <button type="button" className="ml-3 underline" onClick={() => { if (tab === "polls") loadPolls(); else if (tab === "issues") loadIssues(); else if (tab === "analytics") loadAnalytics(); }}>Retry</button></div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {[
          { label: "ACTIVE POLLS", value: activePolls, color: "text-green-400" },
          { label: "TOTAL VOTES", value: totalVotes, color: "text-foreground" },
          { label: "TOTAL SURVEYS", value: surveys?.length ?? 0, color: "text-foreground" },
          { label: "SURVEY RESPONSES", value: surveys?.reduce((s, sv) => s + (sv.responseCount ?? 0), 0) ?? 0, color: "text-blue-400" },
          { label: "OPEN ISSUES", value: openIssues, color: openIssues > 0 ? "text-orange-400" : "text-muted-foreground" },
          { label: "CRITICAL ISSUES", value: criticalIssues, color: criticalIssues > 0 ? "text-red-500 animate-pulse" : "text-muted-foreground" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border p-3">
            <p className="font-mono text-[9px] text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 font-mono text-[10px] border px-4 py-2 transition-colors relative ${tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {t.icon} {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground font-mono text-[8px] font-bold px-1 min-w-[16px] text-center">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── OPINION POLLS ─── */}
      {tab === "polls" && (
        <div className="space-y-3">
          {showNewPoll && (
            <div className="bg-card border border-primary/50 p-4">
              <h3 className="font-mono text-xs tracking-widest mb-4">CREATE OPINION POLL</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">POLL QUESTION *</label>
                  <input value={pollForm.title ?? ""} onChange={e => setPollForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Which development project should be prioritised?" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">CATEGORY</label>
                  <select value={pollForm.category ?? "general"} onChange={e => setPollForm(p => ({ ...p, category: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    {POLL_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">TARGET WARD</label>
                  <select value={pollForm.ward ?? "all"} onChange={e => setPollForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="all">ALL WARDS</option>
                    {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">DEADLINE</label>
                  <input type="date" value={pollForm.deadline ?? ""} onChange={e => setPollForm(p => ({ ...p, deadline: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</label>
                  <input value={pollForm.description ?? ""} onChange={e => setPollForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional context for respondents" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="col-span-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono text-muted-foreground">ANSWER OPTIONS (min. 2) *</label>
                    <button type="button" onClick={() => setPollForm(p => ({ ...p, options: [...(p.options as string[]), ""] }))} className="font-mono text-[10px] border border-primary/40 text-primary px-2 py-0.5 hover:bg-primary hover:text-primary-foreground">+ OPTION</button>
                  </div>
                  {(pollForm.options as string[]).map((opt: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground w-6 text-right">{idx + 1}.</span>
                      <input
                        value={opt}
                        onChange={e => setPollForm(p => ({ ...p, options: (p.options as string[]).map((o: string, i: number) => i === idx ? e.target.value : o) }))}
                        placeholder={`Option ${idx + 1}…`}
                        className="flex-1 bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
                      />
                      {(pollForm.options as string[]).length > 2 && (
                        <button onClick={() => setPollForm(p => ({ ...p, options: (p.options as string[]).filter((_: string, i: number) => i !== idx) }))} className="text-muted-foreground hover:text-red-400"><X className="w-3 h-3" /></button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="col-span-3 flex gap-2 justify-end">
                  <button onClick={() => { setShowNewPoll(false); setPollForm({ category: "general", ward: "all", options: ["", ""] }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                  <button onClick={createPoll} disabled={!pollForm.title || (pollForm.options as string[]).filter((o: string) => o.trim()).length < 2} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Vote className="w-3 h-3" /> DEPLOY POLL</button>
                </div>
              </div>
            </div>
          )}

          {pollsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-24" />)}</div>
          ) : polls.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Vote className="w-6 h-6 text-muted-foreground" />
              <p className="font-mono text-xs text-muted-foreground">[ NO_POLLS_DEPLOYED ]</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Poll list */}
              <div className="space-y-2">
                {polls.map(poll => {
                  const opts = poll.options as Array<{ label: string; votes: number }>;
                  const isSelected = selectedPoll === poll.id;
                  return (
                    <div
                      key={poll.id}
                      className={`bg-card border p-4 cursor-pointer transition-colors ${isSelected ? "border-primary/50" : "border-border hover:border-border/80"}`}
                      onClick={() => setSelectedPoll(isSelected ? null : poll.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge label={poll.status.toUpperCase()} className={statusColor(poll.status)} />
                          <span className="font-mono text-[10px] text-muted-foreground">{poll.category.toUpperCase()}</span>
                          {poll.ward !== "all" && <span className="flex items-center gap-0.5 font-mono text-[10px] text-primary"><MapPin className="w-2.5 h-2.5" />{poll.ward}</span>}
                        </div>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <button type="button" onClick={async () => {
                            const link = new URL(`poll/${poll.id}`, window.location.origin + import.meta.env.BASE_URL).toString();
                            try { await navigator.clipboard.writeText(link); window.alert("Public poll link copied: " + link); }
                            catch { window.prompt("Copy public poll link:", link); }
                          }} className="border border-primary/50 text-primary px-2 py-1 font-mono text-[9px] hover:bg-primary/10">COPY SHARE LINK</button>
                          <a href={`https://wa.me/?text=${encodeURIComponent(poll.title + " " + new URL(`poll/${poll.id}`, window.location.origin + import.meta.env.BASE_URL).toString())}`} target="_blank" rel="noopener noreferrer" className="border border-border px-2 py-1 font-mono text-[9px] hover:bg-secondary">WHATSAPP</a>
                          {poll.status === "active" && (
                            <button onClick={() => { setVotingPollId(poll.id); setVoteForm({ optionIndex: null }); }} className="flex items-center gap-1 border border-primary/30 text-primary px-2 py-0.5 font-mono text-[9px] hover:bg-primary hover:text-primary-foreground">CAST VOTE</button>
                          )}
                          {(poll.status !== "active" || (poll.deadline && poll.deadline < new Date().toISOString().slice(0, 10))) && <button onClick={() => keepPollOpen(poll.id)} className="font-mono text-[9px] text-green-400 hover:text-green-300 px-1">REOPEN · NO DEADLINE</button>}
                          {poll.status === "active" && <button onClick={() => closePoll(poll.id)} className="font-mono text-[9px] text-muted-foreground hover:text-foreground px-1">CLOSE</button>}
                          <button onClick={() => deletePoll(poll.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                      <h3 className="font-bold text-sm mb-2">{poll.title}</h3>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-muted-foreground">{opts.length} OPTIONS · {poll.totalVotes} VOTES</span>
                        {poll.deadline && <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><Clock className="w-2.5 h-2.5" /> CLOSES {poll.deadline}</span>}
                      </div>

                      {/* Quick result preview */}
                      {poll.totalVotes > 0 && (
                        <div className="mt-2 space-y-1">
                          {opts.sort((a: any, b: any) => b.votes - a.votes).slice(0, 2).map((opt: any, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className="flex-1 bg-secondary h-1.5">
                                <div className="h-1.5 bg-primary/60" style={{ width: `${poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0}%` }} />
                              </div>
                              <span className="font-mono text-[9px] text-muted-foreground w-20 truncate">{opt.label}</span>
                              <span className="font-mono text-[9px] w-8 text-right">{poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0}%</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Vote form inline */}
                      {votingPollId === poll.id && poll.status === "active" && (
                        <div className="mt-3 border-t border-border pt-3 space-y-2" onClick={e => e.stopPropagation()}>
                          <p className="font-mono text-[10px] text-muted-foreground">RECORD RESPONSE</p>
                          <div className="grid grid-cols-2 gap-2">
                            <input placeholder="RESPONDENT NAME (optional)" value={voteForm.respondentName ?? ""} onChange={e => setVoteForm(p => ({ ...p, respondentName: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary" />
                            <select value={voteForm.ward ?? ""} onChange={e => setVoteForm(p => ({ ...p, ward: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary">
                              <option value="">WARD (optional)</option>
                              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                            <select value={voteForm.ageGroup ?? ""} onChange={e => setVoteForm(p => ({ ...p, ageGroup: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary">
                              <option value="">AGE GROUP (optional)</option>
                              {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                            <select value={voteForm.gender ?? ""} onChange={e => setVoteForm(p => ({ ...p, gender: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary">
                              <option value="">GENDER (optional)</option>
                              <option value="male">MALE</option>
                              <option value="female">FEMALE</option>
                              <option value="other">OTHER</option>
                            </select>
                          </div>
                          <p className="font-mono text-[10px] text-muted-foreground mt-2">SELECT ANSWER: *</p>
                          <div className="space-y-1">
                            {opts.map((opt: any, idx: number) => (
                              <label key={idx} className={`flex items-center gap-2 p-2 border cursor-pointer transition-colors ${voteForm.optionIndex === idx ? "border-primary bg-primary/10" : "border-border hover:border-border/80"}`}>
                                <input type="radio" name={`vote-${poll.id}`} checked={voteForm.optionIndex === idx} onChange={() => setVoteForm(p => ({ ...p, optionIndex: idx }))} className="accent-primary" />
                                <span className="text-xs">{opt.label}</span>
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setVotingPollId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                            <button onClick={() => submitVote(poll.id)} disabled={voteForm.optionIndex === null} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px] hover:bg-primary/90 disabled:opacity-60"><Send className="w-3 h-3 inline mr-1" /> SUBMIT VOTE</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Results panel */}
              {selectedPoll && pollResults[selectedPoll] && (
                <div className="bg-card border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground">RESULTS — {pollResults[selectedPoll].total} TOTAL VOTES</h3>
                    <button onClick={() => loadPollResults(selectedPoll)} className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"><RefreshCw className="w-3 h-3" /></button>
                  </div>

                  {pollResults[selectedPoll].total === 0 ? (
                    <p className="font-mono text-xs text-muted-foreground text-center py-6">[ NO_VOTES_CAST_YET ]</p>
                  ) : (
                    <>
                      {/* Option bars */}
                      <div className="space-y-3">
                        {(pollResults[selectedPoll].options as any[]).sort((a: any, b: any) => b.votes - a.votes).map((opt: any) => (
                          <ResultBar key={opt.index} label={opt.label} votes={opt.votes} pct={opt.pct} total={pollResults[selectedPoll].total} />
                        ))}
                      </div>

                      {/* Ward breakdown */}
                      <div>
                        <p className="font-mono text-[10px] text-muted-foreground mb-2">WARD BREAKDOWN</p>
                        <div className="space-y-1">
                          {(pollResults[selectedPoll].wardBreakdown as any[]).filter((w: any) => w.total > 0).map((w: any) => (
                            <div key={w.ward} className="flex items-center gap-3">
                              <span className="font-mono text-[10px] w-28 shrink-0">{w.ward}</span>
                              <div className="flex-1 bg-secondary h-3">
                                <div className="h-3 bg-primary/40" style={{ width: `${pollResults[selectedPoll].total > 0 ? Math.round((w.total / pollResults[selectedPoll].total) * 100) : 0}%` }} />
                              </div>
                              <span className="font-mono text-[10px] w-8 text-right text-muted-foreground">{w.total}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Gender split */}
                      <div>
                        <p className="font-mono text-[10px] text-muted-foreground mb-2">GENDER SPLIT</p>
                        <div className="flex gap-4">
                          {(pollResults[selectedPoll].genderBreakdown as any[]).filter((g: any) => g.count > 0).map((g: any) => (
                            <div key={g.gender} className="text-center">
                              <p className="text-xl font-bold">{g.count}</p>
                              <p className="font-mono text-[9px] text-muted-foreground">{g.gender.toUpperCase()}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── TOPICAL ISSUES ─── */}
      {tab === "issues" && (
        <div className="space-y-3">
          {showNewIssue && (
            <div className="bg-card border border-primary/50 p-4">
              <h3 className="font-mono text-xs tracking-widest mb-4">LOG TOPICAL ISSUE</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">ISSUE TITLE *</label>
                  <input value={issueForm.title ?? ""} onChange={e => setIssueForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Wote water access or feeder-road maintenance" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">URGENCY *</label>
                  <select value={issueForm.urgency ?? "medium"} onChange={e => setIssueForm(p => ({ ...p, urgency: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    {URGENCIES.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">CATEGORY *</label>
                  <select value={issueForm.category ?? "infrastructure"} onChange={e => setIssueForm(p => ({ ...p, category: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">WARD</label>
                  <select value={issueForm.ward ?? "all"} onChange={e => setIssueForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="all">ALL WARDS</option>
                    {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">AFFECTED POPULATION</label>
                  <input type="number" value={issueForm.affectedPopulation ?? ""} onChange={e => setIssueForm(p => ({ ...p, affectedPopulation: e.target.value }))} placeholder="Est. number of residents" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">REPORTED BY</label>
                  <input value={issueForm.reportedBy ?? ""} onChange={e => setIssueForm(p => ({ ...p, reportedBy: e.target.value }))} placeholder="Field agent / source" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="col-span-3 space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION *</label>
                  <textarea value={issueForm.description ?? ""} onChange={e => setIssueForm(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Full description of the issue, background, and impact…" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none" />
                </div>
                <div className="col-span-3 flex gap-2 justify-end">
                  <button onClick={() => { setShowNewIssue(false); setIssueForm({ urgency: "medium", category: "infrastructure", ward: "all" }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                  <button onClick={createIssue} disabled={!issueForm.title || !issueForm.description} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Flag className="w-3 h-3" /> LOG ISSUE</button>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[10px] text-muted-foreground">FILTER:</span>
            <div className="flex gap-1">
              {["all", ...URGENCIES].map(u => (
                <button key={u} onClick={() => setFilterUrgency(u)} className={`font-mono text-[10px] px-2 py-1 border transition-colors ${filterUrgency === u ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{u.toUpperCase()}</button>
              ))}
            </div>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
              <option value="all">ALL CATEGORIES</option>
              {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
            <select value={filterWard} onChange={e => setFilterWard(e.target.value)} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary">
              <option value="all">ALL WARDS</option>
              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <button onClick={loadIssues} className="ml-auto flex items-center gap-1 border border-border px-3 py-1 font-mono text-[10px] hover:bg-secondary"><RefreshCw className="w-3 h-3" /></button>
          </div>

          {issuesLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-20" />)}</div>
          ) : filteredIssues.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <p className="font-mono text-xs text-green-400">{issues.length > 0 ? "No issues match the current filters." : "No topical issues recorded yet."}</p>
              {issues.length > 0 && <button type="button" className="text-xs underline text-primary" onClick={() => { setFilterUrgency("all"); setFilterCategory("all"); setFilterWard("all"); }}>CLEAR FILTERS</button>}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredIssues.sort((a, b) => {
                const uo = { critical: 0, high: 1, medium: 2, low: 3 };
                return (uo[a.urgency as keyof typeof uo] ?? 4) - (uo[b.urgency as keyof typeof uo] ?? 4);
              }).map(issue => {
                const isExpanded = expandedIssue === issue.id;
                const reports = (issue.fieldReports ?? []) as any[];
                return (
                  <div key={issue.id} className={`bg-card border p-4 ${issue.urgency === "critical" ? "border-red-500/30" : issue.urgency === "high" ? "border-orange-400/20" : "border-border"}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={issue.urgency.toUpperCase()} className={urgencyColor(issue.urgency)} />
                        <Badge label={issue.status.toUpperCase()} className={statusColor(issue.status)} />
                        <span className="font-mono text-[10px] text-muted-foreground">{issue.category.toUpperCase()}</span>
                        {issue.ward && issue.ward !== "all" && <span className="flex items-center gap-0.5 font-mono text-[10px] text-primary"><MapPin className="w-2.5 h-2.5" />{issue.ward}</span>}
                        {issue.affectedPopulation && <span className="flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground"><Users className="w-2.5 h-2.5" />{issue.affectedPopulation.toLocaleString()} affected</span>}
                        {reports.length > 0 && <span className="font-mono text-[9px] border border-border px-1 py-0.5 text-muted-foreground">{reports.length} field report{reports.length > 1 ? "s" : ""}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[9px] text-muted-foreground">{new Date(issue.createdAt).toLocaleDateString("en-KE", { dateStyle: "short" })}</span>
                        <button onClick={() => setExpandedIssue(isExpanded ? null : issue.id)} className="text-muted-foreground hover:text-foreground">
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <h3 className="font-bold text-sm mt-2">{issue.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{issue.description}</p>
                    {issue.reportedBy && <p className="font-mono text-[10px] text-muted-foreground mt-1">SOURCE: {issue.reportedBy}</p>}

                    {isExpanded && (
                      <div className="mt-4 space-y-3">
                        {/* Field reports */}
                        {reports.length > 0 && (
                          <div>
                            <p className="font-mono text-[9px] text-muted-foreground mb-2">FIELD INTELLIGENCE REPORTS</p>
                            <div className="space-y-2">
                              {reports.map((r: any) => (
                                <div key={r.id} className="bg-secondary border border-border p-2.5">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-mono text-[9px] text-primary">{r.reportedBy ?? "Field Agent"}{r.location ? ` · ${r.location}` : ""}</span>
                                    <span className="font-mono text-[9px] text-muted-foreground">{r.date}</span>
                                  </div>
                                  <p className="text-xs leading-relaxed">{r.notes}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Resolution */}
                        {issue.resolution && (
                          <div className="border-l-2 border-green-400 pl-3">
                            <p className="font-mono text-[9px] text-green-400 mb-0.5">RESOLUTION</p>
                            <p className="text-xs">{issue.resolution}</p>
                          </div>
                        )}

                        {/* Add field report */}
                        {reportingIssueId === issue.id ? (
                          <div className="bg-secondary border border-border p-3 space-y-2">
                            <p className="font-mono text-[10px] text-muted-foreground">ADD FIELD REPORT</p>
                            <div className="grid grid-cols-3 gap-2">
                              <input placeholder="AGENT NAME" value={reportForm.reportedBy ?? ""} onChange={e => setReportForm(p => ({ ...p, reportedBy: e.target.value }))} className="bg-card border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary" />
                              <input placeholder="LOCATION" value={reportForm.location ?? ""} onChange={e => setReportForm(p => ({ ...p, location: e.target.value }))} className="bg-card border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary" />
                              <input type="date" value={reportForm.date ?? ""} onChange={e => setReportForm(p => ({ ...p, date: e.target.value }))} className="bg-card border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary" />
                              <div className="col-span-3">
                                <textarea value={reportForm.notes ?? ""} onChange={e => setReportForm(p => ({ ...p, notes: e.target.value }))} placeholder="Intelligence report notes…" rows={2} className="w-full bg-card border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary resize-none" />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => { setReportingIssueId(null); setReportForm({}); }} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-card">CANCEL</button>
                              <button onClick={() => addFieldReport(issue.id)} disabled={!reportForm.notes} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px] disabled:opacity-60"><Check className="w-3 h-3 inline mr-1" /> SUBMIT REPORT</button>
                            </div>
                          </div>
                        ) : resolvingIssueId === issue.id ? (
                          <div className="flex gap-2">
                            <input value={resolution} onChange={e => setResolution(e.target.value)} placeholder="RESOLUTION NOTES…" className="flex-1 bg-secondary border border-green-400/30 px-3 py-1.5 font-mono text-xs focus:outline-none focus:border-green-400" />
                            <button onClick={() => resolveIssue(issue.id)} className="bg-green-500 text-white px-3 py-1.5 font-mono text-[10px]"><Check className="w-3 h-3 inline mr-1" /> RESOLVE</button>
                            <button onClick={() => setResolvingIssueId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                          </div>
                        ) : (
                          <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                            <button onClick={() => setReportingIssueId(issue.id)} className="flex items-center gap-1 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary"><FileText className="w-3 h-3" /> ADD FIELD REPORT</button>
                            {issue.status === "open" && <button onClick={() => updateIssueStatus(issue.id, "monitoring")} className="flex items-center gap-1 border border-blue-400/30 text-blue-400 px-3 py-1.5 font-mono text-[10px] hover:bg-blue-400/10"><Eye className="w-3 h-3" /> MARK MONITORING</button>}
                            {issue.status !== "resolved" && <button onClick={() => setResolvingIssueId(issue.id)} className="flex items-center gap-1 border border-green-400/30 text-green-400 px-3 py-1.5 font-mono text-[10px] hover:bg-green-400/10"><CheckCircle className="w-3 h-3" /> RESOLVE</button>}
                            <button onClick={() => deleteIssue(issue.id)} className="ml-auto flex items-center gap-1 border border-border px-2 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-red-400 hover:border-red-400/30"><Trash2 className="w-3 h-3" /></button>
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

      {/* ─── FIELD SURVEYS ─── */}
      {tab === "surveys" && (
        <div className="space-y-3">
          {showNewSurvey && (
            <div className="bg-card border border-primary/50 p-4">
              <h3 className="font-mono text-xs tracking-widest mb-4">BUILD FIELD SURVEY</h3>
              <form onSubmit={e => { e.preventDefault(); createSurvey.mutate({ data: { title: surveyTitle, description: surveyDesc, questions: questions as SurveyQuestionInput[] } as SurveyInput }); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">SURVEY TITLE *</label><input required value={surveyTitle} onChange={e => setSurveyTitle(e.target.value)} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</label><input value={surveyDesc} onChange={e => setSurveyDesc(e.target.value)} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono text-muted-foreground">QUESTIONS</label>
                    <button type="button" onClick={() => setQuestions(qs => [...qs, { type: "text", text: "", order: qs.length + 1, options: [] }])} className="font-mono text-[10px] border border-primary/40 text-primary px-2 py-1 hover:bg-primary hover:text-primary-foreground">+ ADD QUESTION</button>
                  </div>
                  {questions.map((q, idx) => (
                    <div key={idx} className="bg-secondary border border-border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">Q{idx + 1}</span>
                        <input value={q.text ?? ""} onChange={e => setQuestions(qs => qs.map((item, i) => i === idx ? { ...item, text: e.target.value } : item))} placeholder="Question text…" className="flex-1 bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                        <select value={q.type ?? "text"} onChange={e => setQuestions(qs => qs.map((item, i) => i === idx ? { ...item, type: e.target.value as any } : item))} className="bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                          {Q_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ").toUpperCase()}</option>)}
                        </select>
                        {questions.length > 1 && <button type="button" onClick={() => setQuestions(qs => qs.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 })))} className="text-muted-foreground hover:text-red-400"><X className="w-3 h-3" /></button>}
                      </div>
                      {(q.type === "single_choice" || q.type === "multiple_choice") && (
                        <input value={(q.options ?? []).join(", ")} onChange={e => setQuestions(qs => qs.map((item, i) => i === idx ? { ...item, options: e.target.value.split(",").map(s => s.trim()) } : item))} placeholder="Option 1, Option 2, Option 3…" className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowNewSurvey(false)} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                  <button type="submit" disabled={createSurvey.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Send className="w-3 h-3" /> DEPLOY SURVEY</button>
                </div>
              </form>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              {surveysLoading ? (
                <div className="animate-pulse bg-card border border-border h-20" />
              ) : !surveys || surveys.length === 0 ? (
                <div className="bg-card border border-border flex items-center justify-center py-12"><p className="font-mono text-xs text-muted-foreground">No field surveys yet. Select NEW SURVEY to create one.</p></div>
              ) : surveys.map(s => (
                <div key={s.id} onClick={() => setSelectedSurveyId(s.id === selectedSurveyId ? null : s.id)} className={`bg-card border p-4 cursor-pointer transition-colors ${s.id === selectedSurveyId ? "border-primary/50" : "border-border hover:border-border/80"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-sm">{s.title}</h3>
                    <Badge label={s.status.toUpperCase()} className={statusColor(s.status)} />
                  </div>
                  {s.description && <p className="text-xs text-muted-foreground mb-2">{s.description}</p>}
                  <div className="flex gap-4 font-mono text-[10px] text-muted-foreground">
                    <span>{(s.questions as any[]).length} QUESTIONS</span>
                    <span className="text-primary">{s.responseCount} RESPONSES</span>
                  </div>
                </div>
              ))}
            </div>

            {selectedSurvey && (
              <div className="lg:col-span-2 space-y-3">
                <div className="bg-card border border-border p-4">
                  <h3 className="font-bold mb-3">{selectedSurvey.title}</h3>
                  <div className="space-y-3">
                    {(selectedSurvey.questions as any[]).map((q: any, i: number) => (
                      <div key={q.id ?? i} className="border-l-2 border-primary/30 pl-3">
                        <p className="text-xs font-medium">Q{i + 1}: {q.text}</p>
                        <p className="font-mono text-[9px] text-muted-foreground">{q.type.replace("_", " ").toUpperCase()}</p>
                        {q.options && q.options.length > 0 && (
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {q.options.map((opt: string) => <span key={opt} className="font-mono text-[9px] bg-secondary border border-border px-1.5 py-0.5">{opt}</span>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-card border border-border">
                  <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    <span className="font-mono text-[10px] tracking-widest">RESPONSES ({surveyResponses?.length ?? 0})</span>
                  </div>
                  {!surveyResponses || surveyResponses.length === 0 ? (
                    <div className="flex items-center justify-center py-8"><p className="font-mono text-xs text-muted-foreground">[ NO_RESPONSES_RECEIVED ]</p></div>
                  ) : (
                    <div className="divide-y divide-border max-h-72 overflow-y-auto">
                      {surveyResponses.map(r => (
                        <div key={r.id} className="px-4 py-3">
                          <div className="flex justify-between mb-1">
                            <span className="font-mono text-[9px] text-muted-foreground">RESPONSE #{r.id}</span>
                            <span className="font-mono text-[9px] text-muted-foreground">{new Date(r.submittedAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</span>
                          </div>
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{JSON.stringify(r.answers, null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ANALYTICS ─── */}
      {tab === "analytics" && (
        <div className="space-y-4">
          {analyticsLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-24" />)}</div>
          ) : !analytics ? (
            <div className="bg-card border border-border flex items-center justify-center py-16"><p className="font-mono text-xs text-muted-foreground">[ LOADING... ]</p></div>
          ) : (
            <>
              {/* Top-level stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border border-border p-4">
                  <p className="font-mono text-[10px] text-muted-foreground mb-3 flex items-center gap-1"><Vote className="w-3 h-3" /> OPINION POLLS</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: "TOTAL", value: analytics.polls.total }, { label: "ACTIVE", value: analytics.polls.active }, { label: "VOTES", value: analytics.polls.totalVotes }].map(({ label, value }) => (
                      <div key={label}><p className="text-xl font-bold">{value}</p><p className="font-mono text-[9px] text-muted-foreground">{label}</p></div>
                    ))}
                  </div>
                </div>
                <div className="bg-card border border-border p-4">
                  <p className="font-mono text-[10px] text-muted-foreground mb-3 flex items-center gap-1"><Flag className="w-3 h-3" /> TOPICAL ISSUES</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[{ label: "TOTAL", value: analytics.issues.total, color: "" }, { label: "OPEN", value: analytics.issues.open, color: "text-orange-400" }, { label: "CRITICAL", value: analytics.issues.critical, color: "text-red-400" }, { label: "RESOLVED", value: analytics.issues.resolved, color: "text-green-400" }].map(({ label, value, color }) => (
                      <div key={label}><p className={`text-xl font-bold ${color}`}>{value}</p><p className="font-mono text-[9px] text-muted-foreground">{label}</p></div>
                    ))}
                  </div>
                </div>
                <div className="bg-card border border-border p-4">
                  <p className="font-mono text-[10px] text-muted-foreground mb-3 flex items-center gap-1"><FileText className="w-3 h-3" /> FIELD SURVEYS</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[{ label: "SURVEYS", value: analytics.surveys.total }, { label: "RESPONSES", value: analytics.surveys.totalResponses }].map(({ label, value }) => (
                      <div key={label}><p className="text-xl font-bold">{value}</p><p className="font-mono text-[9px] text-muted-foreground">{label}</p></div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Issues by Category */}
                <div className="bg-card border border-border p-4">
                  <p className="font-mono text-[10px] text-muted-foreground mb-3">OPEN ISSUES BY CATEGORY</p>
                  {analytics.byCategory.length === 0 ? (
                    <p className="font-mono text-xs text-muted-foreground">[ NO_DATA ]</p>
                  ) : (
                    <div className="space-y-2">
                      {analytics.byCategory.map((item: any) => {
                        const max = analytics.byCategory[0]?.count ?? 1;
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

                {/* Issues by Ward */}
                <div className="bg-card border border-border p-4">
                  <p className="font-mono text-[10px] text-muted-foreground mb-3">ISSUES BY WARD</p>
                  {analytics.byWard.filter((w: any) => w.ward && w.ward !== "all").length === 0 ? (
                    <p className="font-mono text-xs text-muted-foreground">[ NO_DATA ]</p>
                  ) : (
                    <div className="space-y-2">
                      {analytics.byWard.filter((w: any) => w.ward).map((item: any) => {
                        const max = analytics.byWard[0]?.count ?? 1;
                        return (
                          <div key={item.ward} className="space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px]">{item.ward}</span>
                              <div className="flex items-center gap-2">
                                {item.critical > 0 && <span className="font-mono text-[9px] text-red-400">⚠ {item.critical} critical</span>}
                                <span className="font-mono text-[10px] text-muted-foreground">{item.count}</span>
                              </div>
                            </div>
                            <div className="bg-secondary h-3">
                              <div className={`h-3 ${item.critical > 0 ? "bg-red-400/60" : "bg-primary/50"}`} style={{ width: `${Math.round((item.count / max) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top Polls */}
                <div className="bg-card border border-border p-4">
                  <p className="font-mono text-[10px] text-muted-foreground mb-3">TOP POLLS BY ENGAGEMENT</p>
                  {analytics.topPolls.length === 0 ? (
                    <p className="font-mono text-xs text-muted-foreground">[ NO_POLLS_YET ]</p>
                  ) : (
                    <div className="space-y-2">
                      {analytics.topPolls.map((poll: any, i: number) => (
                        <div key={poll.id} className="flex items-center gap-3 py-1.5 border-b border-border/50">
                          <span className="font-mono text-[10px] text-muted-foreground w-4">{i + 1}.</span>
                          <span className="text-xs flex-1 truncate">{poll.title}</span>
                          <Badge label={poll.status.toUpperCase()} className={statusColor(poll.status)} />
                          <span className="font-mono text-[10px] text-primary">{poll.totalVotes} votes</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Issues */}
                <div className="bg-card border border-border p-4">
                  <p className="font-mono text-[10px] text-muted-foreground mb-3">RECENTLY LOGGED ISSUES</p>
                  {analytics.recentIssues.length === 0 ? (
                    <p className="font-mono text-xs text-muted-foreground">[ NO_ISSUES_YET ]</p>
                  ) : (
                    <div className="space-y-2">
                      {analytics.recentIssues.map((issue: any) => (
                        <div key={issue.id} className="flex items-start gap-2 py-1.5 border-b border-border/50">
                          <Badge label={issue.urgency.toUpperCase()} className={urgencyColor(issue.urgency)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate">{issue.title}</p>
                            <p className="font-mono text-[9px] text-muted-foreground">{issue.category} · {issue.ward !== "all" ? issue.ward : "All Wards"}</p>
                          </div>
                          <Badge label={issue.status.toUpperCase()} className={statusColor(issue.status)} />
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
    </div>
  );
}