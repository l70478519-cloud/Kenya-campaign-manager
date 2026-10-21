import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCanvassSessions, useCreateCanvassSession, useGetFieldCoverage,
  useListCanvassVisits, useLogCanvassVisit,
  getListCanvassSessionsQueryKey, getGetFieldCoverageQueryKey, getListCanvassVisitsQueryKey
} from "@workspace/api-client-react";
import type { CanvassSessionInput, CanvassVisitInput } from "@workspace/api-client-react";
import {
  Plus, X, Check, MapPin, Users, Target, Home, Activity,
  ChevronRight, Megaphone, ShoppingBag, Church,
  Zap, Star, TrendingUp, Shield, BarChart2
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const OUTCOMES = ["support", "oppose", "undecided", "not_home", "refused"] as const;

const SESSION_TYPES = [
  { key: "all",              label: "ALL" },
  { key: "baraza",           label: "BARAZA" },
  { key: "door-to-door",    label: "DOOR-TO-DOOR" },
  { key: "market-blitz",    label: "MARKET BLITZ" },
  { key: "church-outreach", label: "CHURCH" },
  { key: "chama-meeting",   label: "CHAMA" },
  { key: "youth-mobilization", label: "YOUTH" },
  { key: "kol-engagement",  label: "KOL MEET" },
  { key: "gotv-prep",       label: "GOTV PREP" },
] as const;

type SessionType = typeof SESSION_TYPES[number]["key"];

const PLAYBOOK = [
  {
    key: "baraza", label: "COMMUNITY BARAZA", icon: Megaphone, color: "#3B82F6",
    tagline: "Most powerful tool in rural Kenya",
    why: "Face-to-face with 50–300 residents at once. Chiefs endorse, crowds question, votes crystallise. A good baraza moves 10–15% of undecideds.",
    tip: "Hold at market days (Mon/Thu/Sat in Wote). Always bring the candidate.",
  },
  {
    key: "door-to-door", label: "DOOR-TO-DOOR CANVASS", icon: Home, color: "#DB143C",
    tagline: "Foundation of voter ID and persuasion",
    why: "Identifies supporters, undecideds and opponents at household level. Data feeds GOTV lists. 40+ doors per volunteer per day in rural wards.",
    tip: "Use the 3-knock rule. Record outcome immediately. Prioritise undecideds for follow-up.",
  },
  {
    key: "market-blitz", label: "MARKET DAY BLITZ", icon: ShoppingBag, color: "#F97316",
    tagline: "High-density contact in hours",
    why: "Wote market (Mon/Thu/Sat) draws 600–1,200 people. Branded tent + music + merchandise = 300+ contacts per session with minimal travel.",
    tip: "Arrive by 7 AM before crowds peak. Branded umbrellas and wristbands drive visibility.",
  },
  {
    key: "church-outreach", label: "FAITH COMMUNITY OUTREACH", icon: Church, color: "#8B5CF6",
    tagline: "Reach organised, high-turnout voters",
    why: "Church and mosque congregations are organised, motivated and vote. A pastor endorsement from the pulpit reaches 200+ voters at zero canvassing cost.",
    tip: "Visit Sunday services weeks before asking for explicit endorsement. Bring a gift for the altar.",
  },
  {
    key: "chama-meeting", label: "CHAMA & WOMEN'S GROUPS", icon: Users, color: "#EC4899",
    tagline: "Organised networks with GOTV muscle",
    why: "Local chamas and community groups are important organizing networks. Women vote at higher rates than men. A chama pledge means 10–30 organised voters who also mobilise neighbours.",
    tip: "Offer table-banking support or group registration assistance as goodwill. Pledge bursaries.",
  },
  {
    key: "youth-mobilization", label: "BODABODA MOBILIZATION", icon: Zap, color: "#EAB308",
    tagline: "High-visibility ambassadors & election-day transport",
    why: "Bodaboda riders are the most visible campaigners in rural Kenya. They carry messaging across the constituency daily and ferry voters on election day.",
    tip: "Recruit 5 bodaboda reps per ward. Give branded jackets. Pre-commit them for GOTV transport.",
  },
  {
    key: "kol-engagement", label: "OPINION LEADER ENGAGEMENT", icon: Star, color: "#10B981",
    tagline: "Gate-keepers who cascade endorsements",
    why: "A chief, headteacher or elder endorsement moves entire villages. One KOL meeting can influence 500–3,000 votes through their networks.",
    tip: "Schedule 1:1 meetings, not group settings. Listen first. Bring manifesto and ward development plan.",
  },
  {
    key: "gotv-prep", label: "GOTV OPERATIONS", icon: Shield, color: "#6366F1",
    tagline: "Convert supporters into actual votes",
    why: "Identifying 1,000 supporters means nothing if they don't vote. GOTV — transport, polling agents, phone trees, early morning wake-ups — is where elections are won.",
    tip: "Map every supporter to their polling station. Pre-assign transport. Deploy agents by 5:30 AM.",
  },
];

const TYPE_CFG: Record<string, { color: string; label: string }> = {
  "baraza":            { color: "#3B82F6", label: "BARAZA" },
  "door-to-door":      { color: "#DB143C", label: "DOOR-TO-DOOR" },
  "market-blitz":      { color: "#F97316", label: "MARKET BLITZ" },
  "church-outreach":   { color: "#8B5CF6", label: "CHURCH" },
  "chama-meeting":     { color: "#EC4899", label: "CHAMA" },
  "youth-mobilization":{ color: "#EAB308", label: "YOUTH MOBI" },
  "kol-engagement":    { color: "#10B981", label: "KOL MEET" },
  "gotv-prep":         { color: "#6366F1", label: "GOTV PREP" },
};

const STATUS_CLS: Record<string, string> = {
  planned:   "text-yellow-400 border-yellow-400/30",
  active:    "text-green-400 border-green-400/30",
  completed: "text-muted-foreground border-border",
  cancelled: "text-red-400 border-red-400/30",
};


function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CFG[type] ?? { color: "#6B7280", label: type.toUpperCase() };
  return (
    <span className="font-mono text-[8px] border px-1.5 py-0.5"
      style={{ borderColor: `${cfg.color}40`, color: cfg.color, background: `${cfg.color}12` }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`font-mono text-[9px] border px-1.5 py-0.5 ${STATUS_CLS[status] ?? "text-muted-foreground border-border"}`}>
      [ {status.toUpperCase()} ]
    </span>
  );
}

interface FieldStats {
  totalSessions: number; active: number; completed: number; planned: number;
  totalContacts: number; supporters: number; undecided: number; oppose: number; wards: number;
}

export default function FieldOps() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<SessionType>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [sessionForm, setSessionForm] = useState<Record<string, any>>({ type: "baraza", ward: WARDS[0] });
  const [visitForm, setVisitForm] = useState<Partial<CanvassVisitInput>>({});
  const [fieldStats, setFieldStats] = useState<FieldStats | null>(null);

  const { data: sessions, isLoading } = useListCanvassSessions();
  const { data: coverage } = useGetFieldCoverage();
  const { data: visits } = useListCanvassVisits({ sessionId: selectedSession ?? undefined });

  const createSession = useCreateCanvassSession({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCanvassSessionsQueryKey() }); setShowAdd(false); setSessionForm({ type: "baraza", ward: WARDS[0] }); } }
  });
  const logVisit = useLogCanvassVisit({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCanvassVisitsQueryKey() }); qc.invalidateQueries({ queryKey: getGetFieldCoverageQueryKey() }); setShowVisitForm(false); setVisitForm({}); } }
  });

  useEffect(() => {
    fetch(`${BASE}api/field-ops/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setFieldStats(d))
      .catch(() => {});
  }, []);

  const filtered = (sessions ?? []).filter(s => typeFilter === "all" || s.type === typeFilter);
  const selectedSessionData = (sessions ?? []).find(s => s.id === selectedSession);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">FIELD OPERATIONS</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-1 tracking-widest">FIELD OPERATIONS · {CAMPAIGN.areaLabel.toUpperCase()} · {WARDS.length} WARDS</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPlaybook(v => !v)}
            className={`flex items-center gap-2 border px-4 py-2 font-mono text-xs transition-colors ${showPlaybook ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <TrendingUp className="w-3 h-3" /> PLAYBOOK
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> NEW SESSION
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {fieldStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: "TOTAL SESSIONS", value: fieldStats.totalSessions, color: "text-foreground" },
            { label: "ACTIVE NOW", value: fieldStats.active, color: "text-green-400" },
            { label: "CONTACTS MADE", value: fieldStats.totalContacts.toLocaleString(), color: "text-foreground" },
            { label: "SUPPORTERS ID'd", value: fieldStats.supporters.toLocaleString(), color: "text-primary" },
            { label: "UNDECIDED", value: fieldStats.undecided.toLocaleString(), color: "text-yellow-400" },
            { label: "WARDS ACTIVE", value: `${fieldStats.wards}/4`, color: "text-foreground" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border p-3">
              <p className="font-mono text-[8px] text-muted-foreground tracking-widest">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Playbook */}
      {showPlaybook && (
        <div className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-primary" />
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono text-xs font-bold tracking-widest text-primary">GROUND GAME PLAYBOOK</span>
            <span className="font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5">8 PROVEN ELECTION-WINNING TACTICS</span>
          </div>
          <div className="grid grid-cols-4 divide-x divide-y divide-border">
            {PLAYBOOK.map(({ key, label, icon: Icon, color, tagline, why, tip }) => (
              <div key={key} className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center shrink-0"
                    style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                    <Icon className="w-3 h-3" style={{ color }} />
                  </div>
                  <div>
                    <p className="font-mono text-[9px] font-bold tracking-wide">{label}</p>
                    <p className="font-mono text-[8px] italic" style={{ color }}>{tagline}</p>
                  </div>
                </div>
                <p className="font-mono text-[9px] text-muted-foreground leading-relaxed">{why}</p>
                <div className="border-l-2 pl-2" style={{ borderColor: color }}>
                  <p className="font-mono text-[8px] text-muted-foreground/80 italic">TIP: {tip}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New session form */}
      {showAdd && (
        <div className="bg-card border border-primary/50 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-primary" />
          <h3 className="font-mono text-xs tracking-widest mb-4">DEPLOY NEW FIELD SESSION</h3>
          <form
            onSubmit={e => {
              e.preventDefault();
              const { type, ward, name, date, doorsTarget, assignedVolunteers, notes } = sessionForm;
              createSession.mutate({ data: { name, type, ward, date, doorsTarget: Number(doorsTarget ?? 0), assignedVolunteers: Number(assignedVolunteers ?? 0), notes } as CanvassSessionInput });
            }}
            className="grid grid-cols-3 gap-3"
          >
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">TACTIC TYPE *</label>
              <select value={sessionForm.type ?? "baraza"} onChange={e => setSessionForm(p => ({ ...p, type: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                {SESSION_TYPES.filter(t => t.key !== "all").map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">WARD *</label>
              <select required value={sessionForm.ward ?? ""} onChange={e => setSessionForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">DATE *</label>
              <input required type="date" value={sessionForm.date ?? ""} onChange={e => setSessionForm(p => ({ ...p, date: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">SESSION NAME *</label>
              <input required value={sessionForm.name ?? ""} onChange={e => setSessionForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Wote Market Friday Baraza" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">VOLUNTEERS</label>
              <input type="number" value={sessionForm.assignedVolunteers ?? ""} onChange={e => setSessionForm(p => ({ ...p, assignedVolunteers: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">CONTACTS TARGET</label>
              <input type="number" value={sessionForm.doorsTarget ?? ""} onChange={e => setSessionForm(p => ({ ...p, doorsTarget: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">FIELD NOTES</label>
              <input value={sessionForm.notes ?? ""} onChange={e => setSessionForm(p => ({ ...p, notes: e.target.value }))} placeholder="Objectives, location, intelligence notes…" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="flex gap-2 justify-end items-end">
              <button type="button" onClick={() => { setShowAdd(false); setSessionForm({ type: "baraza", ward: WARDS[0] }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
              <button type="submit" disabled={createSession.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"><Check className="w-3 h-3" /> DEPLOY</button>
            </div>
          </form>
        </div>
      )}

      {/* Type filter tabs */}
      <div className="flex gap-0 flex-wrap border-b border-border">
        {SESSION_TYPES.map(t => {
          const count = t.key === "all" ? (sessions ?? []).length : (sessions ?? []).filter(s => s.type === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key as SessionType)}
              className={`px-3 py-2 font-mono text-[9px] tracking-widest border-b-2 -mb-px transition-colors ${typeFilter === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
              {count > 0 && (
                <span className={`ml-1.5 text-[8px] px-1 py-0.5 ${typeFilter === t.key ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sessions grid + Visit log */}
      <div className={`grid gap-4 ${selectedSession ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
        {/* Sessions */}
        <div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-card border border-border h-28 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border flex items-center justify-center py-12">
              <p className="font-mono text-xs text-muted-foreground">[ NO_SESSIONS ]</p>
            </div>
          ) : (
            <div className={`grid gap-2 ${selectedSession ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
              {filtered.map(s => {
                const cfg = TYPE_CFG[s.type] ?? { color: "#6B7280", label: s.type.toUpperCase() };
                const progress = s.doorsTarget > 0 ? Math.min((s.doorsCompleted / s.doorsTarget) * 100, 100) : 0;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSession(s.id === selectedSession ? null : s.id)}
                    className={`bg-card border p-4 cursor-pointer transition-all relative overflow-hidden ${s.id === selectedSession ? "border-primary/60" : "border-border hover:border-border/60"}`}
                  >
                    <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: cfg.color }} />
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <TypeBadge type={s.type} />
                          <StatusBadge status={s.status} />
                        </div>
                        <h3 className="font-bold text-[11px] leading-tight">{s.name}</h3>
                        <p className="font-mono text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-2.5 h-2.5" />{s.ward} · {s.date}
                        </p>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${s.id === selectedSession ? "rotate-90 text-primary" : ""}`} />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      {s.assignedVolunteers > 0 && (
                        <span className="font-mono text-[9px] text-muted-foreground flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" />{s.assignedVolunteers} VOL
                        </span>
                      )}
                      {s.doorsTarget > 0 && (
                        <span className="font-mono text-[9px] text-muted-foreground flex items-center gap-1">
                          <Target className="w-2.5 h-2.5" />{s.doorsCompleted}/{s.doorsTarget}
                        </span>
                      )}
                    </div>
                    {s.doorsTarget > 0 && (
                      <div className="h-1 bg-secondary">
                        <div className="h-full transition-all" style={{ width: `${progress}%`, background: cfg.color }} />
                      </div>
                    )}
                    {s.notes && (
                      <p className="font-mono text-[8px] text-muted-foreground/70 mt-2 line-clamp-2 italic leading-relaxed">{s.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Visit log panel */}
        {selectedSession && selectedSessionData && (
          <div className="space-y-0">
            <div className="bg-card border border-primary/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-primary" />
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] text-primary tracking-widest font-bold">{selectedSessionData.name}</p>
                  <p className="font-mono text-[8px] text-muted-foreground mt-0.5">{selectedSessionData.ward} · {selectedSessionData.date}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowVisitForm(v => !v)}
                    className="flex items-center gap-1.5 border border-primary text-primary px-3 py-1.5 font-mono text-[9px] hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    <Plus className="w-2.5 h-2.5" /> LOG CONTACT
                  </button>
                  <button onClick={() => setSelectedSession(null)} className="text-muted-foreground hover:text-foreground p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {visits && visits.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-border border-b border-border">
                  {[
                    { label: "SUPPORT",  count: visits.filter(v => v.outcome === "support").length,   color: "text-green-400" },
                    { label: "UNDECIDED",count: visits.filter(v => v.outcome === "undecided").length, color: "text-yellow-400" },
                    { label: "OPPOSE",   count: visits.filter(v => v.outcome === "oppose").length,    color: "text-red-400" },
                    { label: "NOT HOME", count: visits.filter(v => v.outcome === "not_home").length,  color: "text-muted-foreground" },
                    { label: "REFUSED",  count: visits.filter(v => v.outcome === "refused").length,   color: "text-orange-400" },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="px-3 py-2 text-center">
                      <p className={`text-sm font-bold ${color}`}>{count}</p>
                      <p className="font-mono text-[7px] text-muted-foreground tracking-widest">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              {showVisitForm && (
                <div className="p-3 border-b border-border bg-secondary/30">
                  <form
                    onSubmit={e => { e.preventDefault(); logVisit.mutate({ data: { ...visitForm, sessionId: selectedSession } as CanvassVisitInput }); }}
                    className="grid grid-cols-2 gap-2"
                  >
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-muted-foreground">ADDRESS / HOUSEHOLD *</label>
                      <input required value={visitForm.address ?? ""} onChange={e => setVisitForm(p => ({ ...p, address: e.target.value }))} className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-muted-foreground">OUTCOME *</label>
                      <select required value={visitForm.outcome ?? ""} onChange={e => setVisitForm(p => ({ ...p, outcome: e.target.value as CanvassVisitInput["outcome"] }))} className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                        <option value="">— SELECT —</option>
                        {OUTCOMES.map(o => <option key={o} value={o}>{o.replace("_", " ").toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-mono text-muted-foreground">FIELD NOTES</label>
                      <input value={visitForm.notes ?? ""} onChange={e => setVisitForm(p => ({ ...p, notes: e.target.value }))} placeholder="Concerns raised, commitments made, follow-up needed…" className="w-full bg-card border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                    </div>
                    <div className="col-span-2 flex gap-2 justify-end">
                      <button type="button" onClick={() => { setShowVisitForm(false); setVisitForm({}); }} className="border border-border px-3 py-1.5 font-mono text-[9px] hover:bg-secondary">ABORT</button>
                      <button type="submit" disabled={logVisit.isPending} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[9px] hover:bg-primary/90 disabled:opacity-60">LOG</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
                {!visits || visits.length === 0 ? (
                  <div className="py-8 flex flex-col items-center gap-2">
                    <Activity className="w-5 h-5 text-muted-foreground/30" />
                    <p className="font-mono text-[10px] text-muted-foreground">[ NO_CONTACTS_LOGGED ]</p>
                    <button onClick={() => setShowVisitForm(true)} className="font-mono text-[9px] text-primary hover:underline">Log first contact →</button>
                  </div>
                ) : visits.map(v => {
                  const oc: Record<string, string> = {
                    support: "text-green-400", oppose: "text-red-400",
                    undecided: "text-yellow-400", not_home: "text-muted-foreground", refused: "text-orange-400"
                  };
                  return (
                    <div key={v.id} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{v.address}</p>
                        {v.notes && <p className="font-mono text-[9px] text-muted-foreground mt-0.5 italic">{v.notes}</p>}
                      </div>
                      <span className={`font-mono text-[9px] shrink-0 ${oc[v.outcome] ?? "text-muted-foreground"}`}>
                        {v.outcome.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ward Coverage */}
      {coverage && coverage.length > 0 && (
        <div className="bg-card border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <BarChart2 className="w-3 h-3 text-primary" />
            <span className="font-mono text-[10px] tracking-widest">WARD COVERAGE REPORT</span>
            <span className="font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5">RECORDED FIELD ACTIVITY · IEBC DENOMINATORS NOT LOADED</span>
          </div>
          <div className="p-4 space-y-3">
            {WARDS.map(ward => {
              const w = (coverage as any[]).find((c: any) => c.ward === ward);
              if (!w) return null;
              const contacts = Number(w.doorsKnocked ?? 0);
              return (
                <div key={ward} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{ward.toUpperCase()}</span>
                    <div className="flex items-center gap-4 font-mono text-[9px]">
                      <span className="text-green-400">{(w.supportCount || 0).toLocaleString()} SUP</span>
                      <span className="text-yellow-400">{(w.undecidedCount || 0).toLocaleString()} UND</span>
                      <span className="text-red-400">{(w.opposeCount || 0).toLocaleString()} OPP</span>
                      <span className="text-muted-foreground">{contacts.toLocaleString()} recorded contacts</span>
                    </div>
                  </div>
                  <div className="h-2 bg-secondary flex overflow-hidden">
                    <div className="h-full bg-green-400/70 transition-all" style={{ width: `${contacts > 0 ? Math.min((w.supportCount || 0) / contacts * 100, 100) : 0}%` }} />
                    <div className="h-full bg-yellow-400/70 transition-all" style={{ width: `${contacts > 0 ? Math.min((w.undecidedCount || 0) / contacts * 100, 100) : 0}%` }} />
                    <div className="h-full bg-red-400/50 transition-all" style={{ width: `${contacts > 0 ? Math.min((w.opposeCount || 0) / contacts * 100, 100) : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
