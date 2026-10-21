import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useState, useEffect } from "react";
import {
  useListSegments, useCreateSegment, useDeleteSegment,
  getListSegmentsQueryKey
} from "@workspace/api-client-react";
import type { SegmentInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Lock, Unlock, X, Check, Users, Target,
  MessageSquare, Mail, Smartphone, ChevronRight,
  UserCheck, Church, GraduationCap, Briefcase, Baby,
  Venus, HelpCircle, TrendingUp, Globe, Layers,
  Zap, Filter, Bike, Heart, Building2, Plane, Star,
  ShoppingBag, Truck, Shield
} from "lucide-react";


const CATEGORIES = ["ALL", "GEOGRAPHIC", "DEMOGRAPHIC", "BEHAVIORAL", "STRATEGIC"] as const;
type Category = typeof CATEGORIES[number];

const DEMOGRAPHIC_TYPES = [
  { key: "youth",            label: "YOUTH",              icon: "Baby",         description: "18–35 age group",                    color: "#3B82F6" },
  { key: "first_time_voters",label: "FIRST-TIME VOTERS",  icon: "Star",         description: "18–22, first election",               color: "#06B6D4" },
  { key: "women",            label: "WOMEN",              icon: "Venus",        description: "Female registered voters",            color: "#EC4899" },
  { key: "chama_women",      label: "CHAMA WOMEN",        icon: "Heart",        description: "Table-banking & SACCO members",       color: "#F43F5E" },
  { key: "men",              label: "MEN",                icon: "Shield",       description: "Male registered voters",              color: "#6366F1" },
  { key: "religious_leaders",label: "RELIGIOUS LEADERS",  icon: "Church",       description: "Pastors, Imams, elders",              color: "#F59E0B" },
  { key: "civil_society",    label: "CIVIL SOCIETY",      icon: "Briefcase",    description: "NGOs, CBOs, welfare groups",          color: "#10B981" },
  { key: "teachers",         label: "TEACHERS",           icon: "GraduationCap",description: "Public & private school teachers",    color: "#8B5CF6" },
  { key: "organized_groups", label: "ORGANIZED GROUPS",   icon: "Layers",       description: "SACCOs, chamas, market associations", color: "#F97316" },
  { key: "swing_voters",     label: "SWING VOTERS",       icon: "TrendingUp",   description: "Persuadable — low partisan loyalty",  color: "#EAB308" },
  { key: "undecided",        label: "UNDECIDED VOTERS",   icon: "HelpCircle",   description: "No declared candidate preference",    color: "#6B7280" },
  { key: "bodaboda",         label: "BODABODA OPERATORS", icon: "Bike",         description: "Motorbike taxi operators",            color: "#84CC16" },
  { key: "diaspora",         label: "DIASPORA VOTERS",    icon: "Plane",        description: "Nairobi-based, return to vote",       color: "#22D3EE" },
  { key: "opinion_leaders",  label: "OPINION LEADERS",    icon: "Star",         description: "Chiefs, headteachers, pastors",       color: "#A78BFA" },
  { key: "wiper_loyalists",  label: "WIPER LOYALISTS",    icon: "Shield",       description: "Wiper party card holders",            color: "#DB143C" },
  { key: "market_traders",   label: "MARKET TRADERS",     icon: "ShoppingBag",  description: "Wote, Makindu and county markets",      color: "#FB923C" },
] as const;

const ICON_MAP: Record<string, React.ElementType> = {
  Baby, Venus, Church, Briefcase, GraduationCap, Layers,
  TrendingUp, HelpCircle, Globe, UserCheck, Target, Zap,
  Bike, Heart, Building2, Plane, Star, ShoppingBag, Truck, Shield
};

function categoryOf(criteria: Record<string, any>): Category {
  if (criteria.demographic && !criteria.supportLevel && !criteria.strategic) return "DEMOGRAPHIC";
  if (criteria.ward && !criteria.supportLevel && !criteria.demographic && !criteria.strategic) return "GEOGRAPHIC";
  if (criteria.supportLevel || criteria.isGOTV || criteria.strategic || criteria.transportNeeded) return "STRATEGIC";
  if (criteria.smsConsent || criteria.whatsappConsent || criteria.emailConsent) return "BEHAVIORAL";
  if (criteria.demographic) return "DEMOGRAPHIC";
  return "GEOGRAPHIC";
}

function iconForSegment(criteria: Record<string, any>): React.ElementType {
  const demo = DEMOGRAPHIC_TYPES.find(d => d.key === criteria.demographic);
  if (demo) return ICON_MAP[demo.icon] ?? Users;
  if (criteria.ward) return Globe;
  if (criteria.supportLevel === "strong_supporter" || criteria.supportLevel === "supporter") return UserCheck;
  if (criteria.supportLevel === "undecided") return HelpCircle;
  if (criteria.isGOTV) return Zap;
  return Target;
}

function colorForSegment(criteria: Record<string, any>): string {
  const demo = DEMOGRAPHIC_TYPES.find(d => d.key === criteria.demographic);
  if (demo) return demo.color;
  if (criteria.ward) return "#DB143C";
  if (criteria.supportLevel === "strong_supporter") return "#10B981";
  if (criteria.supportLevel === "undecided") return "#EAB308";
  return "#DB143C";
}

function channelBadges(criteria: Record<string, any>) {
  const badges = [];
  if (criteria.smsConsent) badges.push({ icon: Smartphone, label: "SMS" });
  if (criteria.whatsappConsent) badges.push({ icon: MessageSquare, label: "WA" });
  if (criteria.emailConsent) badges.push({ icon: Mail, label: "EMAIL" });
  return badges;
}

export default function Segments() {
  const qc = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<Category>("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [showWardDirectory, setShowWardDirectory] = useState(true);
  const [wardSearch, setWardSearch] = useState("");
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [wardCounts, setWardCounts] = useState<Record<string, number> | null>(null);
  const [segmentType, setSegmentType] = useState<"geographic" | "demographic" | "behavioral" | "strategic">("geographic");
  const [form, setForm] = useState<Partial<SegmentInput> & Record<string, any>>({ criteria: {}, isLocked: false });

  const { data: segments, isLoading } = useListSegments();
  useEffect(() => {
    let mounted = true;
    // The constituent CSV imports live in voter_registry, not members.
    fetch(`${import.meta.env.BASE_URL}api/voter-registry/stats`, { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Constituent counts unavailable"); return r.json(); })
      .then(data => {
        if (!mounted) return;
        setContactCount(typeof data.total === "number" ? data.total : null);
        const rows = Array.isArray(data.wardBreakdown) ? data.wardBreakdown : [];
        setWardCounts(Object.fromEntries(rows.filter((row: { ward: string }) => WARDS.includes(row.ward)).map((row: { ward: string; count: number }) => [row.ward, Number(row.count)])));
      })
      .catch(() => { if (mounted) { setContactCount(null); setWardCounts(null); } });
    return () => { mounted = false; };
  }, []);
  const createSegment = useCreateSegment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSegmentsQueryKey() });
        setShowAdd(false);
        setForm({ criteria: {}, isLocked: false });
      }
    }
  });
  const deleteSegment = useDeleteSegment({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListSegmentsQueryKey() }) }
  });

  const filtered = (segments ?? []).filter(s => {
    if (activeCategory === "ALL") return true;
    return categoryOf(s.criteria as Record<string, any>) === activeCategory;
  });

  const counts: Record<Category, number> = {
    ALL: (segments ?? []).length,
    GEOGRAPHIC: (segments ?? []).filter(s => categoryOf(s.criteria as Record<string, any>) === "GEOGRAPHIC").length,
    DEMOGRAPHIC: (segments ?? []).filter(s => categoryOf(s.criteria as Record<string, any>) === "DEMOGRAPHIC").length,
    BEHAVIORAL: (segments ?? []).filter(s => categoryOf(s.criteria as Record<string, any>) === "BEHAVIORAL").length,
    STRATEGIC: (segments ?? []).filter(s => categoryOf(s.criteria as Record<string, any>) === "STRATEGIC").length,
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const criteria: Record<string, any> = {};
    if (segmentType === "geographic") {
      if (form._ward) criteria.ward = form._ward;
    } else if (segmentType === "demographic") {
      if (form._demographic) {
        criteria.demographic = form._demographic;
        const demo = DEMOGRAPHIC_TYPES.find(d => d.key === form._demographic);
        if (form._manualSize) criteria.manualSize = parseInt(form._manualSize);
        else if (demo) {
          const defaultSizes: Record<string, number> = {
            youth: 21840, first_time_voters: 5460,
            women: 39800, chama_women: 8400,
            men: 38200, bodaboda: 2100,
            religious_leaders: 847, civil_society: 1240,
            teachers: 1380, organized_groups: 8540,
            swing_voters: 12400, undecided: 15600,
            diaspora: 3200, opinion_leaders: 1170,
            wiper_loyalists: 14040, market_traders: 4500,
          };
          criteria.manualSize = defaultSizes[demo.key] ?? 5000;
        }
      }
    } else if (segmentType === "behavioral") {
      if (form._smsConsent) criteria.smsConsent = true;
      if (form._whatsappConsent) criteria.whatsappConsent = true;
      if (form._emailConsent) criteria.emailConsent = true;
      if (form._supportLevel) criteria.supportLevel = form._supportLevel;
      if (form._ward) criteria.ward = form._ward;
    } else if (segmentType === "strategic") {
      if (form._supportLevel) criteria.supportLevel = form._supportLevel;
      if (form._ward) criteria.ward = form._ward;
      if (form._isGOTV) criteria.isGOTV = true;
      if (form._strategic) criteria.strategic = true;
    }
    createSegment.mutate({ data: { name: form.name, description: form.description, criteria, isLocked: form.isLocked } as SegmentInput });
  }

  const totalReach = (segments ?? []).reduce((acc, s) => acc + (s.memberCount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-bold tracking-widest">AUDIENCE SEGMENTATION</h1>
          <p className="text-[9px] font-mono text-muted-foreground mt-1 tracking-widest">SEGMENT MANAGEMENT · {CAMPAIGN.areaLabel.toUpperCase()}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs tracking-wider hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" /> NEW SEGMENT
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "TOTAL SEGMENTS", value: segments?.length ?? 0, icon: Layers },
          { label: "TOTAL REACH", value: (totalReach).toLocaleString(), icon: Users },
          { label: "CONSTITUENT REGISTRY RECORDS", value: contactCount === null ? "—" : contactCount.toLocaleString(), icon: Target },
          { label: "SEGMENTS LOCKED", value: (segments ?? []).filter(s => s.isLocked).length, icon: Lock },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border border-border p-3 flex items-center gap-3">
            <Icon className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-[8px] font-mono text-muted-foreground tracking-widest">{label}</p>
              <p className="text-sm font-bold tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Ward directory is distinct from saved segments: never imply a ward has zero residents because no segment exists. */}
      <section className="border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-mono text-xs font-bold tracking-wider">{CAMPAIGN.areaLabel.toUpperCase()} · ALL {WARDS.length} WARDS</h2>
            <p className="text-[10px] text-muted-foreground mt-1">Ward counts from the Constituent Database. Saved segments are managed separately below.</p>
          </div>
          <button type="button" onClick={() => setShowWardDirectory(v => !v)} className="border border-border px-3 py-2 font-mono text-[10px] hover:bg-secondary">{showWardDirectory ? "HIDE WARDS" : "SHOW WARDS"}</button>
        </div>
        {showWardDirectory && <>
          <input aria-label="Search wards" value={wardSearch} onChange={e => setWardSearch(e.target.value)} placeholder="Search all 4 wards…" className="w-full sm:max-w-sm bg-secondary border border-border px-3 py-2 text-xs outline-none focus:border-primary" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
            {WARDS.filter(w => w.toLowerCase().includes(wardSearch.trim().toLowerCase())).map(ward => {
              const saved = (segments ?? []).filter(s => (s.criteria as Record<string, any> | null)?.ward === ward);
              return <div key={ward} className="min-w-0 border border-border p-3 bg-secondary/20">
                <p className="font-mono text-[11px] font-semibold break-words">{ward}</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-1">{wardCounts === null ? "Contacts unavailable" : `${wardCounts[ward] ?? 0} contact records`}</p>
                <p className="font-mono text-[9px] text-muted-foreground mt-1">{saved.length} saved {saved.length === 1 ? "segment" : "segments"}</p>
              </div>;
            })}
          </div>
          {WARDS.filter(w => w.toLowerCase().includes(wardSearch.trim().toLowerCase())).length === 0 && <p className="text-xs text-muted-foreground">No matching ward.</p>}
        </>}
      </section>

      <div className="border-b border-border pb-2 pt-2">
        <h2 className="font-mono text-xs font-bold tracking-wider">SAVED SEGMENTS · {(segments ?? []).length}</h2>
        <p className="text-[10px] text-muted-foreground mt-1">These are user-created segment definitions, not the complete list of wards.</p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 font-mono text-[9px] tracking-widest transition-colors border-b-2 -mb-px ${
              activeCategory === cat
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
            <span className={`ml-1.5 text-[9px] px-1 py-0.5 ${activeCategory === cat ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
              {counts[cat]}
            </span>
          </button>
        ))}
      </div>

      {/* New segment form */}
      {showAdd && (
        <div className="bg-card border border-primary/40 p-5 relative">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-primary" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <h3 className="font-mono text-xs tracking-widest">DEFINE NEW SEGMENT</h3>
            </div>
            <button onClick={() => { setShowAdd(false); setForm({ criteria: {}, isLocked: false }); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Segment type selector */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {(["geographic", "demographic", "behavioral", "strategic"] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setSegmentType(type)}
                className={`px-3 py-2 font-mono text-[10px] tracking-widest border transition-colors ${
                  segmentType === type ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">SEGMENT NAME *</label>
                <input required value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</label>
                <input value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
              </div>
            </div>

            {segmentType === "geographic" && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">WARD</label>
                <select value={form._ward ?? ""} onChange={e => setForm(p => ({ ...p, _ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                  <option value="">ALL WARDS</option>
                  {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            )}

            {segmentType === "demographic" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">DEMOGRAPHIC TYPE</label>
                  <select value={form._demographic ?? ""} onChange={e => setForm(p => ({ ...p, _demographic: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">SELECT TYPE</option>
                    {DEMOGRAPHIC_TYPES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">ESTIMATED REACH (OVERRIDE)</label>
                  <input type="number" value={form._manualSize ?? ""} onChange={e => setForm(p => ({ ...p, _manualSize: e.target.value }))} placeholder="Auto-calculated if blank" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
              </div>
            )}

            {(segmentType === "behavioral" || segmentType === "strategic") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">SUPPORT LEVEL</label>
                  <select value={form._supportLevel ?? ""} onChange={e => setForm(p => ({ ...p, _supportLevel: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">ALL LEVELS</option>
                    <option value="strong_supporter">STRONG SUPPORTER</option>
                    <option value="supporter">SUPPORTER</option>
                    <option value="undecided">UNDECIDED</option>
                    <option value="soft_opponent">SOFT OPPONENT</option>
                    <option value="opponent">OPPONENT</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">WARD FILTER</label>
                  <select value={form._ward ?? ""} onChange={e => setForm(p => ({ ...p, _ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="">ALL WARDS</option>
                    {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                {segmentType === "behavioral" && (
                  <div className="col-span-2 flex gap-6">
                    {[["_smsConsent","SMS CONSENTED"],["_whatsappConsent","WHATSAPP CONSENTED"],["_emailConsent","EMAIL CONSENTED"]].map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} className="accent-primary" />
                        <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.isLocked} onChange={e => setForm(p => ({ ...p, isLocked: e.target.checked }))} className="accent-primary" />
                <span className="font-mono text-[10px] text-muted-foreground">LOCK AS SNAPSHOT</span>
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowAdd(false); setForm({ criteria: {}, isLocked: false }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary">
                  <X className="w-3 h-3" /> ABORT
                </button>
                <button type="submit" disabled={createSegment.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-50">
                  <Check className="w-3 h-3" /> LOCK IN TARGET
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Segment grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-card border border-border p-4 h-32 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border flex items-center justify-center py-16">
          <p className="font-mono text-xs text-muted-foreground">[ NO_SEGMENTS_IN_CATEGORY ]</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(seg => {
            const criteria = (seg.criteria ?? {}) as Record<string, any>;
            const cat = categoryOf(criteria);
            const Icon = iconForSegment(criteria);
            const color = colorForSegment(criteria);
            const channels = channelBadges(criteria);
            const demo = DEMOGRAPHIC_TYPES.find(d => d.key === criteria.demographic);
            const reach = seg.memberCount ?? 0;
            const pct = reach > 0 ? Math.min(100, Math.round((reach / 78000) * 100)) : 0;

            return (
              <div key={seg.id} className="bg-card border border-border p-4 group relative overflow-hidden">
                <div className="absolute top-0 left-0 h-0.5 w-full" style={{ background: color }} />

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 flex items-center justify-center shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[11px] tracking-wide leading-tight">{seg.name}</h3>
                      <span className="font-mono text-[8px] tracking-widest" style={{ color }}>{cat}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {seg.isLocked ? <Lock className="w-3 h-3 text-yellow-400" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}
                    <button
                      onClick={() => { if (confirm("Delete segment?")) deleteSegment.mutate({ id: seg.id }); }}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {seg.description && (
                  <p className="text-[9px] text-muted-foreground mb-2 leading-relaxed line-clamp-2">{seg.description}</p>
                )}

                <div className="flex items-end justify-between mb-2">
                  <div>
                    <span className="text-lg font-bold tabular-nums">{reach.toLocaleString()}</span>
                    <span className="font-mono text-[8px] text-muted-foreground ml-1.5">CONTACTS</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[9px] text-muted-foreground">{pct}% of constituency</span>
                  </div>
                </div>

                {/* Reach bar */}
                <div className="h-1 bg-secondary mb-3">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5 flex-wrap">
                    {demo && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 border" style={{ borderColor: `${color}40`, color, background: `${color}10` }}>
                        {demo.description}
                      </span>
                    )}
                    {criteria.ward && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 border border-border bg-secondary text-muted-foreground">
                        {criteria.ward.toUpperCase()}
                      </span>
                    )}
                    {criteria.supportLevel && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 border border-border bg-secondary text-muted-foreground">
                        {(criteria.supportLevel as string).replace("_", " ").toUpperCase()}
                      </span>
                    )}
                    {channels.map(({ icon: CIcon, label }) => (
                      <span key={label} className="font-mono text-[9px] px-1.5 py-0.5 border border-border bg-secondary text-muted-foreground flex items-center gap-1">
                        <CIcon className="w-2.5 h-2.5" />{label}
                      </span>
                    ))}
                    {seg.isLocked && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 border border-yellow-400/30 text-yellow-400 bg-yellow-400/5">LOCKED</span>
                    )}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
