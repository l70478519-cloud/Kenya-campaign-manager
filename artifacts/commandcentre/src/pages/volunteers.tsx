import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useState, useEffect, useCallback } from "react";
import { useListVolunteers, useCreateVolunteer, getListVolunteersQueryKey } from "@workspace/api-client-react";
import type { VolunteerInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Check, MapPin, Clock, AlertTriangle, Target, BarChart2,
  CheckCircle, XCircle, FileText, RefreshCw, Edit2, Trash2,
  ChevronDown, ChevronUp, TrendingUp, Flag, User, Shield, Calendar,
  Link2, Copy, ExternalLink
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const ROLES = ["canvasser", "team_lead", "coordinator", "phone_banker", "data_entry", "mobilizer", "agent"];
const TASK_CATEGORIES = ["canvassing", "voter_registration", "distribution", "mobilization", "data_collection", "media", "logistics", "security"];
const PRIORITIES = ["low", "medium", "high", "critical"];
const SEVERITIES = ["low", "medium", "high", "critical"];

type Tab = "roster" | "tasks" | "progress" | "issues" | "report";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}api/volunteers${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmt(v: unknown) { return v == null ? "—" : String(v); }

function priorityColor(p: string) {
  return p === "critical" ? "text-red-500 border-red-500/40" :
    p === "high" ? "text-orange-400 border-orange-400/40" :
    p === "medium" ? "text-yellow-400 border-yellow-400/30" : "text-blue-400 border-blue-400/30";
}
function severityColor(s: string) {
  return s === "critical" ? "text-red-500 border-red-500/40" :
    s === "high" ? "text-orange-400 border-orange-400/30" :
    s === "medium" ? "text-yellow-400 border-yellow-400/30" : "text-blue-400 border-blue-400/30";
}
function statusColor(s: string) {
  return s === "completed" ? "text-green-400 border-green-400/30" :
    s === "in_progress" ? "text-blue-400 border-blue-400/30" :
    s === "overdue" ? "text-red-400 border-red-400/30" :
    s === "assigned" ? "text-yellow-400 border-yellow-400/30" : "text-muted-foreground border-border";
}
function progressBar(pct: number) {
  const color = pct >= 80 ? "bg-green-400" : pct >= 50 ? "bg-yellow-400" : pct >= 25 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-secondary h-1.5 rounded-none">
        <div className={`h-1.5 transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="font-mono text-[10px] w-8 text-right">{pct}%</span>
    </div>
  );
}
function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${className}`}>[ {label} ]</span>;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function Volunteers() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("roster");

  // roster
  const { data: volunteers, isLoading: volLoading } = useListVolunteers();
  const [showEnlist, setShowEnlist] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const publicFormPath = "/insights/volunteer";
  const publicFormUrl = typeof window !== "undefined" ? `${window.location.origin}${publicFormPath}` : publicFormPath;
  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicFormUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* ignore */ }
  }
  const [enlistForm, setEnlistForm] = useState<Partial<VolunteerInput>>({});
  const createVolunteer = useCreateVolunteer({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListVolunteersQueryKey() }); setShowEnlist(false); setEnlistForm({}); } } });

  // tasks
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [taskForm, setTaskForm] = useState<Record<string, string>>({ priority: "medium", category: "canvassing" });
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [taskLogs, setTaskLogs] = useState<Record<number, any[]>>({});
  const [logForm, setLogForm] = useState<Record<string, string>>({});
  const [loggingTaskId, setLoggingTaskId] = useState<number | null>(null);
  const [filterVolId, setFilterVolId] = useState<string>("all");

  // issues
  const [issues, setIssues] = useState<any[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [issueForm, setIssueForm] = useState<Record<string, string>>({ severity: "medium" });
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");

  // report
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try { setTasks(await apiFetch("/tasks")); } catch { /* ignore */ } finally { setTasksLoading(false); }
  }, []);
  const loadIssues = useCallback(async () => {
    setIssuesLoading(true);
    try { setIssues(await apiFetch("/issues")); } catch { /* ignore */ } finally { setIssuesLoading(false); }
  }, []);
  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try { setReport(await apiFetch("/daily-report")); } catch { /* ignore */ } finally { setReportLoading(false); }
  }, []);

  useEffect(() => { if (tab === "tasks" || tab === "progress") loadTasks(); }, [tab, loadTasks]);
  useEffect(() => { if (tab === "issues") loadIssues(); }, [tab, loadIssues]);
  useEffect(() => { if (tab === "report") loadReport(); }, [tab, loadReport]);

  async function loadTaskLogs(taskId: number) {
    const logs = await apiFetch(`/tasks/${taskId}/progress`);
    setTaskLogs(prev => ({ ...prev, [taskId]: logs }));
  }

  async function createTask() {
    if (!taskForm.volunteerId || !taskForm.title) return;
    await apiFetch("/tasks", { method: "POST", body: JSON.stringify({ ...taskForm, targetValue: taskForm.targetValue ? parseInt(taskForm.targetValue) : undefined }) });
    await loadTasks();
    setShowNewTask(false);
    setTaskForm({ priority: "medium", category: "canvassing" });
  }

  async function updateTaskStatus(id: number, status: string) {
    await apiFetch(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadTasks();
  }

  async function deleteTask(id: number) {
    await apiFetch(`/tasks/${id}`, { method: "DELETE" });
    await loadTasks();
  }

  async function submitLog(taskId: number, volunteerId: number) {
    await apiFetch(`/tasks/${taskId}/progress`, { method: "POST", body: JSON.stringify({ volunteerId, ...logForm, completionPct: parseInt(logForm.completionPct ?? "0"), valueAchieved: logForm.valueAchieved ? parseInt(logForm.valueAchieved) : undefined, hoursSpent: logForm.hoursSpent ? parseInt(logForm.hoursSpent) : undefined }) });
    await loadTaskLogs(taskId);
    await loadTasks();
    setLoggingTaskId(null);
    setLogForm({});
  }

  async function createIssue() {
    if (!issueForm.volunteerId || !issueForm.title || !issueForm.description) return;
    await apiFetch("/issues", { method: "POST", body: JSON.stringify(issueForm) });
    await loadIssues();
    setShowNewIssue(false);
    setIssueForm({ severity: "medium" });
  }

  async function resolveIssue(id: number) {
    await apiFetch(`/issues/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved", resolution, resolvedBy: "Campaign Manager" }) });
    await loadIssues();
    setResolvingId(null);
    setResolution("");
  }

  const today = new Date().toISOString().slice(0, 10);
  const openIssueCount = issues.filter(i => i.status === "open").length;
  const criticalIssueCount = issues.filter(i => i.status === "open" && i.severity === "critical").length;
  const activeTasks = tasks.filter(t => t.status !== "completed").length;
  const completedTasks = tasks.filter(t => t.status === "completed").length;

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: "roster", label: "ROSTER", icon: <User className="w-3 h-3" /> },
    { id: "tasks", label: "TASK ASSIGNMENTS", icon: <Target className="w-3 h-3" />, badge: activeTasks || undefined },
    { id: "progress", label: "DAILY PROGRESS", icon: <BarChart2 className="w-3 h-3" /> },
    { id: "issues", label: "ISSUES", icon: <Flag className="w-3 h-3" />, badge: openIssueCount || undefined },
    { id: "report", label: "DAILY REPORT", icon: <FileText className="w-3 h-3" /> },
  ];

  // ── Summary stats ──
  const volCount = volunteers?.length ?? 0;
  const activeVols = volunteers?.filter(v => v.status === "active").length ?? 0;
  const pendingVols = volunteers?.filter(v => v.status === "pending").length ?? 0;

  async function setVolunteerStatus(id: number, status: string) {
    await apiFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    qc.invalidateQueries({ queryKey: getListVolunteersQueryKey() });
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">VOLUNTEER COMMAND</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">FIELD TEAM MANAGEMENT · {CAMPAIGN.areaLabel.toUpperCase()}</p>
        </div>
        {tab === "roster" && (
          <button onClick={() => setShowEnlist(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
            <Plus className="w-3 h-3" /> ENLIST VOLUNTEER
          </button>
        )}
        {tab === "tasks" && (
          <button onClick={() => setShowNewTask(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
            <Plus className="w-3 h-3" /> ASSIGN TASK
          </button>
        )}
        {tab === "issues" && (
          <button onClick={() => setShowNewIssue(v => !v)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
            <AlertTriangle className="w-3 h-3" /> REPORT ISSUE
          </button>
        )}
        {tab === "report" && (
          <button onClick={loadReport} disabled={reportLoading} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary disabled:opacity-60">
            <RefreshCw className={`w-3 h-3 ${reportLoading ? "animate-spin" : ""}`} /> REFRESH
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        {[
          { label: "TOTAL VOLUNTEERS", value: volCount, color: "text-foreground" },
          { label: "ACTIVE", value: activeVols, color: "text-green-400" },
          { label: "PENDING REVIEW", value: pendingVols, color: pendingVols > 0 ? "text-cyan-400 animate-pulse" : "text-muted-foreground" },
          { label: "ACTIVE TASKS", value: activeTasks, color: "text-yellow-400" },
          { label: "COMPLETED TASKS", value: completedTasks, color: "text-green-400" },
          { label: "OPEN ISSUES", value: openIssueCount, color: openIssueCount > 0 ? "text-orange-400" : "text-muted-foreground" },
          { label: "CRITICAL ISSUES", value: criticalIssueCount, color: criticalIssueCount > 0 ? "text-red-500 animate-pulse" : "text-muted-foreground" },
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
              <span className={`absolute -top-1.5 -right-1.5 font-mono text-[8px] font-bold px-1 min-w-[16px] text-center ${t.id === "issues" ? "bg-orange-400 text-black" : "bg-yellow-400 text-black"}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── ROSTER ─── */}
      {tab === "roster" && (
        <div className="space-y-3">
          {/* Public registration link */}
          <div className="bg-card border border-cyan-400/30 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Link2 className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-[10px] tracking-widest text-cyan-400">PUBLIC SIGN-UP LINK</span>
            </div>
            <code className="flex-1 font-mono text-[11px] text-foreground bg-secondary/60 px-3 py-1.5 truncate">{publicFormUrl}</code>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={copyPublicLink} className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">
                {linkCopied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />} {linkCopied ? "COPIED" : "COPY"}
              </button>
              <a href={publicFormPath} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-cyan-500/90 text-black px-3 py-1.5 font-mono text-[10px] hover:bg-cyan-400">
                <ExternalLink className="w-3 h-3" /> OPEN FORM
              </a>
            </div>
          </div>

          {showEnlist && (
            <div className="bg-card border border-primary/50 p-4">
              <h3 className="font-mono text-xs tracking-widest mb-4">ENLIST NEW OPERATIVE</h3>
              <form onSubmit={e => { e.preventDefault(); createVolunteer.mutate({ data: enlistForm as VolunteerInput }); }} className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">FIRST NAME *</label><input required value={enlistForm.firstName ?? ""} onChange={e => setEnlistForm(p => ({ ...p, firstName: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">LAST NAME *</label><input required value={enlistForm.lastName ?? ""} onChange={e => setEnlistForm(p => ({ ...p, lastName: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">PHONE</label><input value={enlistForm.phone ?? ""} onChange={e => setEnlistForm(p => ({ ...p, phone: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">WARD</label>
                  <select value={enlistForm.ward ?? ""} onChange={e => setEnlistForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">— SELECT —</option>{WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">ROLE *</label>
                  <select required value={enlistForm.role ?? ""} onChange={e => setEnlistForm(p => ({ ...p, role: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">— SELECT —</option>{ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ").toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><label className="text-[10px] font-mono text-muted-foreground">EMAIL</label><input type="email" value={enlistForm.email ?? ""} onChange={e => setEnlistForm(p => ({ ...p, email: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" /></div>
                <div className="col-span-3 flex gap-2 justify-end">
                  <button type="button" onClick={() => { setShowEnlist(false); setEnlistForm({}); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                  <button type="submit" disabled={createVolunteer.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Check className="w-3 h-3" /> ENLIST</button>
                </div>
              </form>
            </div>
          )}

          {/* Ward breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {WARDS.map(ward => {
              const wardVols = (volunteers ?? []).filter(v => v.ward === ward);
              const wardTasks = tasks.filter(t => wardVols.some(v => v.id === t.volunteerId));
              return (
                <div key={ward} className="bg-card border border-border p-3">
                  <p className="font-mono text-[9px] text-muted-foreground">{ward.toUpperCase()}</p>
                  <p className="text-xl font-bold text-foreground">{wardVols.length}</p>
                  <p className="font-mono text-[9px] text-muted-foreground mt-0.5">{wardTasks.length} tasks</p>
                </div>
              );
            })}
          </div>

          <div className="bg-card border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  {["NAME", "ROLE", "WARD", "TASKS", "DOORS", "HOURS", "STATUS", "ACTIONS"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {volLoading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ LOADING... ]</td></tr>
                ) : !volunteers || volunteers.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_VOLUNTEERS_ENLISTED ]</td></tr>
                ) : volunteers.map(v => {
                  const volTasks = tasks.filter(t => t.volunteerId === v.id);
                  const isPending = v.status === "pending";
                  const statusClass = v.status === "active" ? "text-green-400 border-green-400/30"
                    : isPending ? "text-cyan-400 border-cyan-400/40"
                    : v.status === "rejected" ? "text-red-400 border-red-400/30"
                    : "text-muted-foreground border-border";
                  const details = [
                    v.phone ? `Phone: ${v.phone}` : null,
                    v.email ? `Email: ${v.email}` : null,
                    v.interests ? `Interests: ${v.interests}` : null,
                    v.availability ? `Availability: ${v.availability}` : null,
                    v.message ? `Message: ${v.message}` : null,
                    v.source ? `Source: ${v.source}` : null,
                  ].filter(Boolean).join("\n");
                  return (
                    <tr key={v.id} className={`hover:bg-secondary/30 transition-colors ${isPending ? "bg-cyan-400/5" : ""}`} title={details || undefined}>
                      <td className="px-4 py-2.5 font-medium">{v.firstName} {v.lastName}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{v.role.replace(/_/g, " ").toUpperCase()}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px]"><span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5 text-primary" />{fmt(v.ward)}</span></td>
                      <td className="px-4 py-2.5 font-mono text-[10px]">
                        <span className="text-yellow-400">{volTasks.filter(t => t.status !== "completed").length}</span>
                        <span className="text-muted-foreground">/{volTasks.length}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-green-400">{v.doorsKnocked}</td>
                      <td className="px-4 py-2.5 font-mono">{v.hoursLogged.toFixed(1)}h</td>
                      <td className="px-4 py-2.5">
                        <Badge label={v.status.toUpperCase()} className={statusClass} />
                      </td>
                      <td className="px-4 py-2.5">
                        {isPending ? (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setVolunteerStatus(v.id, "active")} title="Approve registration" className="flex items-center gap-1 border border-green-400/40 text-green-400 px-2 py-1 font-mono text-[10px] hover:bg-green-400/10">
                              <Check className="w-3 h-3" /> APPROVE
                            </button>
                            <button onClick={() => setVolunteerStatus(v.id, "rejected")} title="Reject registration" className="flex items-center gap-1 border border-red-400/40 text-red-400 px-2 py-1 font-mono text-[10px] hover:bg-red-400/10">
                              <X className="w-3 h-3" /> REJECT
                            </button>
                          </div>
                        ) : v.status === "rejected" ? (
                          <button onClick={() => setVolunteerStatus(v.id, "active")} title="Reinstate volunteer" className="flex items-center gap-1 border border-border text-muted-foreground px-2 py-1 font-mono text-[10px] hover:bg-secondary">
                            <RefreshCw className="w-3 h-3" /> REINSTATE
                          </button>
                        ) : (
                          <span className="font-mono text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TASK ASSIGNMENTS ─── */}
      {tab === "tasks" && (
        <div className="space-y-3">
          {showNewTask && (
            <div className="bg-card border border-primary/50 p-4">
              <h3 className="font-mono text-xs tracking-widest mb-4">ASSIGN NEW TASK</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">VOLUNTEER *</label>
                  <select value={taskForm.volunteerId ?? ""} onChange={e => setTaskForm(p => ({ ...p, volunteerId: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">— SELECT —</option>
                    {(volunteers ?? []).map(v => <option key={v.id} value={v.id}>{v.firstName} {v.lastName} — {fmt(v.ward)}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">CATEGORY</label>
                  <select value={taskForm.category ?? "canvassing"} onChange={e => setTaskForm(p => ({ ...p, category: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    {TASK_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ").toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">PRIORITY</label>
                  <select value={taskForm.priority ?? "medium"} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    {PRIORITIES.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">TASK TITLE *</label>
                  <input value={taskForm.title ?? ""} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Support a Wote community service activity" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">DUE DATE</label>
                  <input type="date" value={taskForm.dueDate ?? ""} onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">WARD</label>
                  <select value={taskForm.ward ?? ""} onChange={e => setTaskForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">— SELECT —</option>{WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">TARGET METRIC</label>
                  <input value={taskForm.targetMetric ?? ""} onChange={e => setTaskForm(p => ({ ...p, targetMetric: e.target.value }))} placeholder="e.g. Doors Knocked" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">TARGET VALUE</label>
                  <input type="number" value={taskForm.targetValue ?? ""} onChange={e => setTaskForm(p => ({ ...p, targetValue: e.target.value }))} placeholder="200" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="col-span-3 space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION / INSTRUCTIONS</label>
                  <textarea value={taskForm.description ?? ""} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none" />
                </div>
                <div className="col-span-3 flex gap-2 justify-end">
                  <button onClick={() => { setShowNewTask(false); setTaskForm({ priority: "medium", category: "canvassing" }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                  <button onClick={createTask} disabled={!taskForm.volunteerId || !taskForm.title} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Target className="w-3 h-3" /> ASSIGN TASK</button>
                </div>
              </div>
            </div>
          )}

          {/* Filter by volunteer */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-muted-foreground">FILTER BY:</span>
            <select value={filterVolId} onChange={e => setFilterVolId(e.target.value)} className="bg-secondary border border-border px-3 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary">
              <option value="all">ALL VOLUNTEERS</option>
              {(volunteers ?? []).map(v => <option key={v.id} value={v.id}>{v.firstName} {v.lastName}</option>)}
            </select>
            <button onClick={loadTasks} className="flex items-center gap-1 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary"><RefreshCw className="w-3 h-3" /></button>
          </div>

          {tasksLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-20" />)}</div>
          ) : tasks.filter(t => filterVolId === "all" || String(t.volunteerId) === filterVolId).length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Target className="w-6 h-6 text-muted-foreground" />
              <p className="font-mono text-xs text-muted-foreground">[ NO_TASKS_ASSIGNED ]</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.filter(t => filterVolId === "all" || String(t.volunteerId) === filterVolId)
                .sort((a, b) => {
                  const po = { critical: 0, high: 1, medium: 2, low: 3 };
                  return (po[a.priority as keyof typeof po] ?? 4) - (po[b.priority as keyof typeof po] ?? 4);
                }).map(task => {
                  const vol = (volunteers ?? []).find(v => v.id === task.volunteerId);
                  const isExpanded = expandedTask === task.id;
                  const pct = task.targetValue ? Math.round((task.currentValue / task.targetValue) * 100) : task.currentValue;
                  const isOverdue = task.dueDate && task.dueDate < today && task.status !== "completed";
                  return (
                    <div key={task.id} className={`bg-card border p-4 ${task.priority === "critical" ? "border-red-500/30" : task.priority === "high" ? "border-orange-400/20" : "border-border"}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge label={task.priority.toUpperCase()} className={priorityColor(task.priority)} />
                          <Badge label={isOverdue ? "OVERDUE" : task.status.replace(/_/g, " ").toUpperCase()} className={isOverdue ? "text-red-400 border-red-400/30 animate-pulse" : statusColor(task.status)} />
                          <span className="font-mono text-[10px] text-muted-foreground">{task.category.replace(/_/g, " ").toUpperCase()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.dueDate && <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><Calendar className="w-2.5 h-2.5" />{task.dueDate}</span>}
                          <button onClick={() => { setExpandedTask(isExpanded ? null : task.id); if (!isExpanded) loadTaskLogs(task.id); }} className="text-muted-foreground hover:text-foreground">
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <h3 className="font-bold text-sm mt-2">{task.title}</h3>
                      {vol && <p className="font-mono text-[10px] text-muted-foreground mt-0.5">ASSIGNED TO: {vol.firstName} {vol.lastName} · {fmt(vol.ward)}</p>}
                      {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}

                      {task.targetMetric && (
                        <div className="mt-2">
                          <p className="font-mono text-[9px] text-muted-foreground mb-1">{task.targetMetric.toUpperCase()}: {task.currentValue}{task.targetValue ? ` / ${task.targetValue}` : ""}</p>
                          {task.targetValue && progressBar(pct)}
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mt-4 space-y-3">
                          {/* Progress logs */}
                          <div>
                            <p className="font-mono text-[9px] text-muted-foreground mb-2">PROGRESS LOG</p>
                            {(taskLogs[task.id] ?? []).length === 0 ? (
                              <p className="font-mono text-[10px] text-muted-foreground">[ NO_LOGS_YET ]</p>
                            ) : (
                              <div className="space-y-1.5">
                                {(taskLogs[task.id] ?? []).map((log: any) => (
                                  <div key={log.id} className="bg-secondary border border-border p-2.5">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-mono text-[9px] text-muted-foreground">{log.logDate}</span>
                                      <span className="font-mono text-[10px] text-green-400">{log.completionPct}% complete</span>
                                    </div>
                                    {log.valueAchieved != null && <p className="font-mono text-[10px]">{task.targetMetric ?? "VALUE"}: {log.valueAchieved}</p>}
                                    {log.hoursSpent != null && <p className="font-mono text-[10px] text-muted-foreground">⏱ {log.hoursSpent}h logged</p>}
                                    {log.notes && <p className="text-xs mt-1">{log.notes}</p>}
                                    {log.blockers && <p className="text-xs text-red-400 mt-0.5">⚠ BLOCKER: {log.blockers}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Log today's progress */}
                          {task.status !== "completed" && (
                            loggingTaskId === task.id ? (
                              <div className="bg-secondary border border-primary/30 p-3 space-y-2">
                                <p className="font-mono text-[10px] text-muted-foreground">LOG PROGRESS FOR {today}</p>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="space-y-0.5">
                                    <label className="font-mono text-[9px] text-muted-foreground">COMPLETION %</label>
                                    <input type="number" min="0" max="100" value={logForm.completionPct ?? ""} onChange={e => setLogForm(p => ({ ...p, completionPct: e.target.value }))} placeholder="0-100" className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                                  </div>
                                  {task.targetMetric && (
                                    <div className="space-y-0.5">
                                      <label className="font-mono text-[9px] text-muted-foreground">{task.targetMetric.toUpperCase()} ACHIEVED</label>
                                      <input type="number" value={logForm.valueAchieved ?? ""} onChange={e => setLogForm(p => ({ ...p, valueAchieved: e.target.value }))} className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                                    </div>
                                  )}
                                  <div className="space-y-0.5">
                                    <label className="font-mono text-[9px] text-muted-foreground">HOURS SPENT</label>
                                    <input type="number" value={logForm.hoursSpent ?? ""} onChange={e => setLogForm(p => ({ ...p, hoursSpent: e.target.value }))} placeholder="0" className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                                  </div>
                                  <div className="col-span-3 space-y-0.5">
                                    <label className="font-mono text-[9px] text-muted-foreground">PROGRESS NOTES</label>
                                    <input value={logForm.notes ?? ""} onChange={e => setLogForm(p => ({ ...p, notes: e.target.value }))} placeholder="What was accomplished today?" className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                                  </div>
                                  <div className="col-span-3 space-y-0.5">
                                    <label className="font-mono text-[9px] text-red-400">BLOCKERS / ISSUES (if any)</label>
                                    <input value={logForm.blockers ?? ""} onChange={e => setLogForm(p => ({ ...p, blockers: e.target.value }))} placeholder="Any obstacles preventing progress?" className="w-full bg-card border border-border border-red-400/20 px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-red-400" />
                                  </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => { setLoggingTaskId(null); setLogForm({}); }} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-card">CANCEL</button>
                                  <button onClick={() => submitLog(task.id, task.volunteerId)} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px] hover:bg-primary/90"><Check className="w-3 h-3 inline mr-1" /> SUBMIT LOG</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setLoggingTaskId(task.id)} className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">
                                <BarChart2 className="w-3 h-3" /> LOG TODAY'S PROGRESS
                              </button>
                            )
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-2 flex-wrap pt-1 border-t border-border">
                            {task.status === "assigned" && <button onClick={() => updateTaskStatus(task.id, "in_progress")} className="flex items-center gap-1 border border-blue-400/30 text-blue-400 px-3 py-1.5 font-mono text-[10px] hover:bg-blue-400/10"><TrendingUp className="w-3 h-3" /> MARK IN PROGRESS</button>}
                            {task.status !== "completed" && <button onClick={() => updateTaskStatus(task.id, "completed")} className="flex items-center gap-1 border border-green-400/30 text-green-400 px-3 py-1.5 font-mono text-[10px] hover:bg-green-400/10"><CheckCircle className="w-3 h-3" /> MARK COMPLETE</button>}
                            <button onClick={() => deleteTask(task.id)} className="ml-auto flex items-center gap-1 border border-border px-2 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-red-400 hover:border-red-400/30"><Trash2 className="w-3 h-3" /></button>
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

      {/* ─── DAILY PROGRESS ─── */}
      {tab === "progress" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] text-muted-foreground">CHECK-IN STATUS · {today}</p>
            <button onClick={loadTasks} className="flex items-center gap-1 border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary"><RefreshCw className="w-3 h-3" /> REFRESH</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(volunteers ?? []).map(vol => {
              const volTasks = tasks.filter(t => t.volunteerId === vol.id);
              const hasBlockers = volTasks.some(t => t.status !== "completed");
              const allDone = volTasks.length > 0 && volTasks.every(t => t.status === "completed");
              const overdueTasks = volTasks.filter(t => t.dueDate && t.dueDate < today && t.status !== "completed");
              return (
                <div key={vol.id} className={`bg-card border p-4 ${overdueTasks.length > 0 ? "border-orange-400/20" : allDone ? "border-green-400/15" : "border-border"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-sm">{vol.firstName} {vol.lastName}</h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{vol.role.replace(/_/g, " ").toUpperCase()}</span>
                        {vol.ward && <span className="flex items-center gap-0.5 font-mono text-[10px] text-primary"><MapPin className="w-2.5 h-2.5" />{vol.ward}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {allDone && <span className="font-mono text-[9px] text-green-400 border border-green-400/30 px-1.5 py-0.5">[ ALL COMPLETE ]</span>}
                      {overdueTasks.length > 0 && <span className="font-mono text-[9px] text-orange-400 border border-orange-400/30 px-1.5 py-0.5 animate-pulse">[ {overdueTasks.length} OVERDUE ]</span>}
                    </div>
                  </div>

                  {volTasks.length === 0 ? (
                    <p className="font-mono text-[10px] text-muted-foreground">[ NO_TASKS_ASSIGNED ]</p>
                  ) : (
                    <div className="space-y-2">
                      {volTasks.map(task => {
                        const pct = task.targetValue ? Math.round((task.currentValue / task.targetValue) * 100) : 0;
                        const isOverdue = task.dueDate && task.dueDate < today && task.status !== "completed";
                        return (
                          <div key={task.id} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs truncate max-w-[200px]">{task.title}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isOverdue && <AlertTriangle className="w-3 h-3 text-orange-400" />}
                                <Badge label={task.status.replace(/_/g, " ").toUpperCase()} className={statusColor(task.status)} />
                              </div>
                            </div>
                            {task.targetValue && progressBar(pct)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── ISSUES ─── */}
      {tab === "issues" && (
        <div className="space-y-3">
          {showNewIssue && (
            <div className="bg-card border border-primary/50 p-4">
              <h3 className="font-mono text-xs tracking-widest mb-4">REPORT FIELD ISSUE</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">VOLUNTEER *</label>
                  <select value={issueForm.volunteerId ?? ""} onChange={e => setIssueForm(p => ({ ...p, volunteerId: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">— SELECT —</option>
                    {(volunteers ?? []).map(v => <option key={v.id} value={v.id}>{v.firstName} {v.lastName}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">SEVERITY *</label>
                  <select value={issueForm.severity ?? "medium"} onChange={e => setIssueForm(p => ({ ...p, severity: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    {SEVERITIES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">WARD</label>
                  <select value={issueForm.ward ?? ""} onChange={e => setIssueForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">— SELECT —</option>{WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">ISSUE TITLE *</label>
                  <input value={issueForm.title ?? ""} onChange={e => setIssueForm(p => ({ ...p, title: e.target.value }))} placeholder="Brief description" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">FULL DESCRIPTION *</label>
                  <textarea value={issueForm.description ?? ""} onChange={e => setIssueForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary resize-none" />
                </div>
                <div className="col-span-2 flex gap-2 justify-end">
                  <button onClick={() => { setShowNewIssue(false); setIssueForm({ severity: "medium" }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                  <button onClick={createIssue} disabled={!issueForm.volunteerId || !issueForm.title || !issueForm.description} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Flag className="w-3 h-3" /> REPORT ISSUE</button>
                </div>
              </div>
            </div>
          )}

          {issuesLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-20" />)}</div>
          ) : issues.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Shield className="w-6 h-6 text-green-400" />
              <p className="font-mono text-xs text-green-400">[ NO_OPEN_ISSUES — FIELD_CLEAR ]</p>
            </div>
          ) : (
            <div className="space-y-2">
              {issues.map(issue => {
                const vol = (volunteers ?? []).find(v => v.id === issue.volunteerId);
                return (
                  <div key={issue.id} className={`bg-card border p-4 ${issue.severity === "critical" ? "border-red-500/40" : issue.severity === "high" ? "border-orange-400/20" : "border-border"}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={issue.severity.toUpperCase()} className={severityColor(issue.severity)} />
                        <Badge label={issue.status.toUpperCase()} className={issue.status === "resolved" ? "text-green-400 border-green-400/30" : issue.status === "acknowledged" ? "text-blue-400 border-blue-400/30" : "text-red-400 border-red-400/30"} />
                        {issue.ward && <span className="flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground"><MapPin className="w-2.5 h-2.5" />{issue.ward}</span>}
                      </div>
                      <span className="font-mono text-[9px] text-muted-foreground">{new Date(issue.reportedAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>

                    <h3 className="font-bold text-sm">{issue.title}</h3>
                    {vol && <p className="font-mono text-[10px] text-muted-foreground mt-0.5">REPORTED BY: {vol.firstName} {vol.lastName}</p>}
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{issue.description}</p>

                    {issue.resolution && (
                      <div className="mt-2 border-l-2 border-green-400 pl-3">
                        <p className="font-mono text-[9px] text-green-400">RESOLUTION: {issue.resolvedBy}</p>
                        <p className="text-xs mt-0.5">{issue.resolution}</p>
                      </div>
                    )}

                    {issue.status === "open" && (
                      resolvingId === issue.id ? (
                        <div className="mt-3 flex gap-2">
                          <input value={resolution} onChange={e => setResolution(e.target.value)} placeholder="RESOLUTION NOTES…" className="flex-1 bg-secondary border border-green-400/30 px-3 py-1.5 font-mono text-xs focus:outline-none focus:border-green-400" />
                          <button onClick={() => resolveIssue(issue.id)} className="bg-green-500 text-white px-3 py-1.5 font-mono text-[10px]"><Check className="w-3 h-3 inline mr-1" /> RESOLVE</button>
                          <button onClick={() => { setResolvingId(null); setResolution(""); }} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                        </div>
                      ) : (
                        <div className="flex gap-2 mt-3">
                          <button onClick={async () => { await apiFetch(`/issues/${issue.id}`, { method: "PATCH", body: JSON.stringify({ status: "acknowledged" }) }); await loadIssues(); }} className="flex items-center gap-1 border border-blue-400/30 text-blue-400 px-3 py-1.5 font-mono text-[10px] hover:bg-blue-400/10"><Clock className="w-3 h-3" /> ACKNOWLEDGE</button>
                          <button onClick={() => setResolvingId(issue.id)} className="flex items-center gap-1 border border-green-400/30 text-green-400 px-3 py-1.5 font-mono text-[10px] hover:bg-green-400/10"><CheckCircle className="w-3 h-3" /> RESOLVE</button>
                        </div>
                      )
                    )}
                    {issue.status === "acknowledged" && (
                      <button onClick={() => setResolvingId(issue.id)} className="flex items-center gap-1 border border-green-400/30 text-green-400 px-3 py-1.5 font-mono text-[10px] hover:bg-green-400/10 mt-3"><CheckCircle className="w-3 h-3" /> RESOLVE</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── DAILY REPORT ─── */}
      {tab === "report" && (
        <div className="space-y-4">
          {reportLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-24" />)}</div>
          ) : !report ? (
            <div className="bg-card border border-border flex items-center justify-center py-16"><p className="font-mono text-xs text-muted-foreground">[ LOADING DAILY REPORT... ]</p></div>
          ) : (
            <>
              {/* Report header */}
              <div className="bg-card border border-primary/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-mono text-sm font-bold tracking-widest">CAMPAIGN MANAGER DAILY REPORT</h2>
                    <p className="font-mono text-[10px] text-muted-foreground">{CAMPAIGN.areaLabel.toUpperCase()} · DAILY REPORT · DATE: {report.date}</p>
                  </div>
                  {report.summary.criticalIssues > 0 && (
                    <span className="font-mono text-[10px] text-red-500 border border-red-500/40 px-2 py-1 animate-pulse">⚠ {report.summary.criticalIssues} CRITICAL ISSUE{report.summary.criticalIssues > 1 ? "S" : ""} REQUIRE ATTENTION</span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: "TOTAL VOLUNTEERS", value: report.summary.totalVolunteers, color: "text-foreground" },
                    { label: "CHECKED IN TODAY", value: `${report.summary.checkedInToday}/${report.summary.totalVolunteers}`, color: report.summary.checkedInToday === report.summary.totalVolunteers ? "text-green-400" : "text-yellow-400" },
                    { label: "TOTAL TASKS", value: report.summary.totalTasks, color: "text-foreground" },
                    { label: "COMPLETED", value: report.summary.completedTasks, color: "text-green-400" },
                    { label: "OVERDUE", value: report.summary.overdueTasks, color: report.summary.overdueTasks > 0 ? "text-red-400 animate-pulse" : "text-muted-foreground" },
                    { label: "OPEN ISSUES", value: report.summary.openIssues, color: report.summary.openIssues > 0 ? "text-orange-400" : "text-muted-foreground" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-secondary border border-border p-2.5">
                      <p className="font-mono text-[9px] text-muted-foreground">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Critical issues callout */}
              {report.criticalIssues.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/30 p-4">
                  <h3 className="font-mono text-xs text-red-400 tracking-widest mb-3">⚠ CRITICAL ISSUES — IMMEDIATE ACTION REQUIRED</h3>
                  <div className="space-y-2">
                    {report.criticalIssues.map((issue: any) => {
                      const vol = (volunteers ?? []).find(v => v.id === issue.volunteerId);
                      return (
                        <div key={issue.id} className="flex items-start gap-3">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-bold">{issue.title}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{vol ? `${vol.firstName} ${vol.lastName}` : "Unknown"} · {issue.ward ?? "—"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ward breakdown */}
              <div>
                <h3 className="font-mono text-[10px] text-muted-foreground tracking-widest mb-2">WARD BREAKDOWN</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {report.wardBreakdown.map((ward: any) => (
                    <div key={ward.ward} className="bg-card border border-border p-3">
                      <p className="font-mono text-[9px] text-muted-foreground mb-2">{ward.ward.toUpperCase()}</p>
                      <p className="font-mono text-xs"><span className="text-foreground font-bold">{ward.checkedIn}</span><span className="text-muted-foreground">/{ward.volunteers} checked in</span></p>
                      <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{ward.completed}/{ward.tasks} tasks done</p>
                      {ward.volunteers > 0 && progressBar(ward.volunteers > 0 ? Math.round((ward.checkedIn / ward.volunteers) * 100) : 0)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-volunteer table */}
              <div>
                <h3 className="font-mono text-[10px] text-muted-foreground tracking-widest mb-2">VOLUNTEER STATUS</h3>
                <div className="bg-card border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40">
                        {["NAME", "WARD", "TASKS", "DONE", "CHECKED IN", "BLOCKERS", "TODAY'S NOTES"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-mono text-[10px] text-muted-foreground tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.volunteerSummaries.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">[ NO_VOLUNTEERS_ENLISTED ]</td></tr>
                      ) : report.volunteerSummaries.map((v: any) => (
                        <tr key={v.id} className={`hover:bg-secondary/30 transition-colors ${v.hasBlockers ? "border-l-2 border-orange-400/50" : ""}`}>
                          <td className="px-3 py-2 font-medium">{v.name}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{fmt(v.ward)}</td>
                          <td className="px-3 py-2 font-mono text-[10px]">{v.totalTasks}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-green-400">{v.completedTasks}</td>
                          <td className="px-3 py-2">
                            {v.checkedIn ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                          </td>
                          <td className="px-3 py-2">
                            {v.hasBlockers ? <span className="text-orange-400 font-mono text-[10px] flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> YES</span> : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">{v.todayNotes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Blockers section */}
              {report.volunteerSummaries.some((v: any) => v.blockers) && (
                <div>
                  <h3 className="font-mono text-[10px] text-orange-400 tracking-widest mb-2">BLOCKERS REPORTED TODAY</h3>
                  <div className="space-y-2">
                    {report.volunteerSummaries.filter((v: any) => v.blockers).map((v: any) => (
                      <div key={v.id} className="bg-card border border-orange-400/20 p-3 flex items-start gap-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-mono text-[10px] font-bold">{v.name} · {fmt(v.ward)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{v.blockers}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}