import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, MessageSquare, Map, Activity, Star, Zap,
  Users, RefreshCw, Download, ChevronUp, ChevronDown, Minus,
  BarChart2, Globe, ShieldCheck, Trophy, AlertTriangle, Clock, Check
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const COLORS = {
  primary: "#DB143C",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#f97316",
  cyan: "#06b6d4",
  pink: "#ec4899",
  teal: "#14b8a6",
  indigo: "#6366f1",
};
const PIE_PALETTE = [COLORS.primary, COLORS.blue, COLORS.green, COLORS.yellow, COLORS.purple, COLORS.orange, COLORS.cyan, COLORS.pink, COLORS.teal, COLORS.indigo];
const WARD_COLORS: Record<string, string> = {
  "Tala": COLORS.primary, "Makueni North": COLORS.blue,
  "Makueni West": COLORS.green, "Makueni East": COLORS.yellow, "Kyeleni": COLORS.purple,
};

type Tab = "growth" | "messaging" | "field" | "sentiment" | "kols" | "insights";

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}api/analytics${path}`, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pct(num: number, den: number) {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

function Stat({ label, value, sub, color = "text-foreground", trend }: { label: string; value: string | number; sub?: string; color?: string; trend?: "up" | "down" | "flat" }) {
  return (
    <div className="min-w-0 bg-card border border-border p-3 sm:p-4">
      <p className="font-mono text-[9px] text-muted-foreground mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {trend === "up" && <ChevronUp className="w-4 h-4 text-green-400 mb-1" />}
        {trend === "down" && <ChevronDown className="w-4 h-4 text-red-400 mb-1" />}
        {trend === "flat" && <Minus className="w-4 h-4 text-muted-foreground mb-1" />}
      </div>
      {sub && <p className="font-mono text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 max-w-full bg-card border border-border ${className ?? ""}`}>
      <div className="px-4 py-3 border-b border-border/60">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center h-32 gap-2">
      <BarChart2 className="w-6 h-6 text-muted-foreground/40" />
      <p className="font-mono text-[10px] text-muted-foreground">[ NO DATA YET ]</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border px-3 py-2 shadow-lg">
      {label && <p className="font-mono text-[9px] text-muted-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-mono text-[10px]" style={{ color: p.color ?? p.fill ?? "#fff" }}>
          {p.name}: {typeof p.value === "number" && p.value >= 1000 ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [tab, setTab] = useState<Tab>("growth");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<Tab, any>>({ growth: null, messaging: null, field: null, sentiment: null, kols: null, insights: null });

  const load = useCallback(async (t: Tab) => {
    if (data[t]) return;
    setLoading(true);
    try {
      const result = await apiFetch(`/${t}`);
      setData(prev => ({ ...prev, [t]: result }));
    } catch { } finally { setLoading(false); }
  }, [data]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch(`/${tab}`);
      setData(prev => ({ ...prev, [tab]: result }));
    } catch { } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(tab); }, [tab, load]);

  const d = data[tab];

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "growth", label: "GROWTH", icon: <TrendingUp className="w-3 h-3" /> },
    { id: "messaging", label: "MESSAGING", icon: <MessageSquare className="w-3 h-3" /> },
    { id: "field", label: "FIELD", icon: <Map className="w-3 h-3" /> },
    { id: "sentiment", label: "SENTIMENT", icon: <Activity className="w-3 h-3" /> },
    { id: "kols", label: "KOLs", icon: <Star className="w-3 h-3" /> },
    { id: "insights", label: "INSIGHTS", icon: <Zap className="w-3 h-3" /> },
  ];

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-widest">ANALYTICS HUB</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">GROWTH · MESSAGING · FIELD · SENTIMENT · KOLS · INSIGHTS</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} disabled={loading} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary disabled:opacity-60">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> REFRESH
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 font-mono text-[10px] border px-4 py-2 transition-colors ${tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading && !d && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-24" />)}
        </div>
      )}

      {/* ─── GROWTH ─── */}
      {tab === "growth" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <Stat label="TOTAL MEMBERS" value={fmt(d.totals.total)} color="text-foreground" />
            <Stat label="ACTIVE" value={fmt(d.totals.active)} sub={`${pct(d.totals.active, d.totals.total)}% of total`} color="text-green-400" />
            <Stat label="SMS CONSENT" value={fmt(d.totals.smsConsent)} sub={`${pct(d.totals.smsConsent, d.totals.total)}% opt-in`} color="text-blue-400" />
            <Stat label="WHATSAPP" value={fmt(d.totals.whatsappConsent)} sub={`${pct(d.totals.whatsappConsent, d.totals.total)}% opt-in`} color="text-green-400" />
            <Stat label="EMAIL" value={fmt(d.totals.emailConsent)} sub={`${pct(d.totals.emailConsent, d.totals.total)}% opt-in`} color="text-cyan-400" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="MEMBER GROWTH OVER TIME">
              {d.monthly.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={d.monthly}>
                    <defs>
                      <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2229" />
                    <XAxis dataKey="month" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <YAxis tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" name="Members" stroke={COLORS.primary} fill="url(#growthGrad)" strokeWidth={2} dot={{ fill: COLORS.primary, r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="MEMBERS BY WARD">
              {d.byWard.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.byWard} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2229" horizontal={false} />
                    <XAxis type="number" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <YAxis dataKey="ward" type="category" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} width={110} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Total" radius={0}>
                      {d.byWard.map((r: any, i: number) => <Cell key={i} fill={WARD_COLORS[r.ward] ?? PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                    </Bar>
                    <Bar dataKey="active" name="Active" fill={COLORS.green} opacity={0.6} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="SUPPORT LEVEL BREAKDOWN">
              {d.bySupportLevel.length === 0 ? <EmptyChart /> : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={d.bySupportLevel} dataKey="count" nameKey="level" cx="50%" cy="50%" innerRadius={50} outerRadius={80} strokeWidth={0}>
                        {d.bySupportLevel.map((_: any, i: number) => <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {d.bySupportLevel.map((r: any, i: number) => (
                      <div key={r.level} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 shrink-0" style={{ backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                          <span className="font-mono text-[10px]">{(r.level ?? "Unknown").toUpperCase()}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-[10px] text-foreground">{r.count}</span>
                          <span className="font-mono text-[9px] text-muted-foreground ml-1">({pct(r.count, d.totals.total)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="CONSENT CHANNELS REACH">
              {d.totals.total === 0 ? <EmptyChart /> : (
                <div className="space-y-4 pt-2">
                  {[
                    { label: "SMS CONSENT", value: d.totals.smsConsent, color: COLORS.blue },
                    { label: "WHATSAPP CONSENT", value: d.totals.whatsappConsent, color: COLORS.green },
                    { label: "EMAIL CONSENT", value: d.totals.emailConsent, color: COLORS.cyan },
                  ].map(({ label, value, color }) => {
                    const p = pct(value, d.totals.total);
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px]">{label}</span>
                          <span className="font-mono text-[10px]" style={{ color }}>{value} ({p}%)</span>
                        </div>
                        <div className="h-4 bg-secondary">
                          <div className="h-4 transition-all" style={{ width: `${p}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* ─── MESSAGING ─── */}
      {tab === "messaging" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <Stat label="CAMPAIGNS" value={d.totals.campaigns} />
            <Stat label="SENT" value={d.totals.sent} sub={`${pct(d.totals.sent, d.totals.campaigns)}% of total`} color="text-blue-400" />
            <Stat label="RECIPIENTS" value={fmt(d.totals.recipients)} color="text-foreground" />
            <Stat label="DELIVERED" value={fmt(d.totals.delivered)} sub={`${d.totals.deliveryRate}% rate`} color="text-green-400" />
            <Stat label="OPENED" value={fmt(d.totals.opened)} sub={`${d.totals.openRate}% open rate`} color="text-yellow-400" />
            <Stat label="CLICKED" value={fmt(d.totals.clicked)} sub={`${pct(d.totals.clicked, d.totals.delivered)}% CTR`} color="text-orange-400" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="CAMPAIGNS OVER TIME — RECIPIENTS">
              {d.monthly.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2229" />
                    <XAxis dataKey="month" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <YAxis tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="campaigns" name="Campaigns" fill={COLORS.primary} radius={0} />
                    <Bar dataKey="recipients" name="Recipients" fill={COLORS.blue} opacity={0.7} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="PERFORMANCE BY CHANNEL">
              {d.byChannel.length === 0 ? <EmptyChart /> : (
                <div className="space-y-3">
                  {d.byChannel.map((ch: any, i: number) => (
                    <div key={ch.channel} className="border border-border/50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2" style={{ backgroundColor: PIE_PALETTE[i] }} />
                          <span className="font-mono text-[10px] font-bold">{ch.channel.toUpperCase()}</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="font-mono text-[9px] text-blue-400">{ch.count} campaigns</span>
                          <span className="font-mono text-[9px]">{fmt(ch.recipients)} recipients</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between mb-0.5"><span className="font-mono text-[9px] text-muted-foreground">DELIVERY</span><span className="font-mono text-[9px] text-green-400">{ch.deliveryRate}%</span></div>
                          <div className="h-2 bg-secondary"><div className="h-2" style={{ width: `${ch.deliveryRate}%`, backgroundColor: COLORS.green }} /></div>
                        </div>
                        <div>
                          <div className="flex justify-between mb-0.5"><span className="font-mono text-[9px] text-muted-foreground">OPEN RATE</span><span className="font-mono text-[9px] text-yellow-400">{ch.recipients > 0 ? pct(ch.opened, ch.delivered) : 0}%</span></div>
                          <div className="h-2 bg-secondary"><div className="h-2" style={{ width: `${ch.recipients > 0 ? pct(ch.opened, ch.delivered) : 0}%`, backgroundColor: COLORS.yellow }} /></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="CAMPAIGN STATUS DISTRIBUTION">
              {d.byStatus.length === 0 ? <EmptyChart /> : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={d.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={45} outerRadius={75} strokeWidth={0}>
                        {d.byStatus.map((_: any, i: number) => <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {d.byStatus.map((r: any, i: number) => (
                      <div key={r.status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2" style={{ backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                          <span className="font-mono text-[10px]">{r.status.toUpperCase()}</span>
                        </div>
                        <span className="font-mono text-[10px]">{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="RECENT CAMPAIGNS">
              {d.recent.length === 0 ? <EmptyChart /> : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {d.recent.map((c: any) => {
                    const rate = c.recipientCount > 0 ? pct(c.deliveredCount, c.recipientCount) : 0;
                    return (
                      <div key={c.id} className="flex items-center gap-3 py-1.5 border-b border-border/30">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[10px] truncate">{c.name}</p>
                          <p className="font-mono text-[9px] text-muted-foreground">{c.channel.toUpperCase()} · {c.status.toUpperCase()}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-[10px]">{fmt(c.recipientCount)} sent</p>
                          <p className="font-mono text-[9px]" style={{ color: rate > 80 ? COLORS.green : rate > 50 ? COLORS.yellow : COLORS.primary }}>{rate}% delivered</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* ─── FIELD ─── */}
      {tab === "field" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="CANVASS SESSIONS" value={d.sessions.total} sub={`${d.sessions.completed} completed`} />
            <Stat label="DOORS COVERAGE" value={`${d.sessions.coveragePct}%`} sub={`${fmt(d.sessions.doorsCompleted)} / ${fmt(d.sessions.doorsTarget)} doors`} color={d.sessions.coveragePct > 70 ? "text-green-400" : d.sessions.coveragePct > 40 ? "text-yellow-400" : "text-red-400"} />
            <Stat label="VOLUNTEERS" value={d.volunteers.total} sub={`${d.volunteers.active} active · ${fmt(d.volunteers.totalHours)} hours`} color="text-blue-400" />
            <Stat label="DOORS KNOCKED" value={fmt(d.volunteers.totalDoors)} sub="Total by volunteers" color="text-orange-400" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="CANVASS COVERAGE BY WARD">
              {d.byWard.length === 0 ? <EmptyChart /> : (
                <div className="space-y-3">
                  {d.byWard.map((w: any) => (
                    <div key={w.ward}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px]">{w.ward ?? "UNKNOWN"}</span>
                        <div className="flex gap-3 font-mono text-[9px]">
                          <span className="text-muted-foreground">{w.doorsCompleted}/{w.doorsTarget} doors</span>
                          <span style={{ color: w.coveragePct > 70 ? COLORS.green : w.coveragePct > 40 ? COLORS.yellow : COLORS.primary }}>{w.coveragePct}%</span>
                        </div>
                      </div>
                      <div className="h-4 bg-secondary">
                        <div className="h-4 transition-all" style={{ width: `${w.coveragePct}%`, backgroundColor: WARD_COLORS[w.ward] ?? COLORS.primary }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="DOOR KNOCK OUTCOMES">
              {d.visits.total === 0 ? <EmptyChart /> : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie cx="50%" cy="50%" innerRadius={45} outerRadius={75} strokeWidth={0}
                        data={[
                          { name: "Supportive", value: d.visits.supporters },
                          { name: "Neutral", value: d.visits.neutral },
                          { name: "Opposed", value: d.visits.opposed },
                          { name: "No Answer", value: d.visits.noAnswer },
                        ].filter(x => x.value > 0)}
                        dataKey="value" nameKey="name">
                        <Cell fill={COLORS.green} />
                        <Cell fill={COLORS.yellow} />
                        <Cell fill={COLORS.primary} />
                        <Cell fill="#374151" />
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {[
                      { label: "SUPPORTIVE", value: d.visits.supporters, color: COLORS.green },
                      { label: "NEUTRAL", value: d.visits.neutral, color: COLORS.yellow },
                      { label: "OPPOSED", value: d.visits.opposed, color: COLORS.primary },
                      { label: "NO ANSWER", value: d.visits.noAnswer, color: "#374151" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex justify-between">
                        <div className="flex items-center gap-2"><div className="w-2 h-2" style={{ backgroundColor: color }} /><span className="font-mono text-[10px]">{label}</span></div>
                        <span className="font-mono text-[10px]">{value} <span className="text-muted-foreground">({pct(value, d.visits.total)}%)</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="VOLUNTEERS BY WARD">
              {d.volByWard.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.volByWard} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2229" horizontal={false} />
                    <XAxis type="number" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <YAxis dataKey="ward" type="category" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} width={110} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Volunteers" radius={0}>
                      {d.volByWard.map((r: any, i: number) => <Cell key={i} fill={WARD_COLORS[r.ward] ?? PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="VOLUNTEERS BY ROLE">
              {d.volByRole.length === 0 ? <EmptyChart /> : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={d.volByRole} dataKey="count" nameKey="role" cx="50%" cy="50%" innerRadius={45} outerRadius={75} strokeWidth={0}>
                        {d.volByRole.map((_: any, i: number) => <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {d.volByRole.map((r: any, i: number) => (
                      <div key={r.role} className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><div className="w-2 h-2" style={{ backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} /><span className="font-mono text-[10px]">{(r.role ?? "Unknown").toUpperCase()}</span></div>
                        <span className="font-mono text-[10px]">{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* Field issues bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <Stat label="FIELD ISSUES REPORTED" value={d.issues.total} />
            <Stat label="OPEN ISSUES" value={d.issues.open} color={d.issues.open > 0 ? "text-yellow-400" : "text-green-400"} />
            <Stat label="CRITICAL ISSUES" value={d.issues.critical} color={d.issues.critical > 0 ? "text-red-400" : "text-green-400"} />
          </div>
        </div>
      )}

      {/* ─── SENTIMENT ─── */}
      {tab === "sentiment" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <Stat label="OPINION POLLS" value={d.polls.total} sub={`${d.polls.active} active`} />
            <Stat label="TOTAL VOTES" value={fmt(d.polls.votes)} color="text-primary" />
            <Stat label="ISSUES TRACKED" value={d.issues.total} sub={`${d.issues.open} open`} />
            <Stat label="CRITICAL ISSUES" value={d.issues.critical} color={d.issues.critical > 0 ? "text-red-400" : "text-green-400"} />
            <Stat label="HIGH PRIORITY" value={d.issues.high} color={d.issues.high > 0 ? "text-orange-400" : "text-green-400"} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="POLL PARTICIPATION BY WARD">
              {d.votesByWard.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.votesByWard}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2229" />
                    <XAxis dataKey="ward" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <YAxis tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Votes" radius={0}>
                      {d.votesByWard.map((r: any, i: number) => <Cell key={i} fill={WARD_COLORS[r.ward] ?? PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="VOTER DEMOGRAPHICS">
              {d.votesByGender.length === 0 && d.votesByAge.length === 0 ? <EmptyChart /> : (
                <div className="space-y-4">
                  {d.votesByGender.length > 0 && (
                    <div>
                      <p className="font-mono text-[9px] text-muted-foreground mb-2">BY GENDER</p>
                      <div className="flex gap-3">
                        {d.votesByGender.map((r: any, i: number) => {
                          const total = d.votesByGender.reduce((a: number, x: any) => a + x.count, 0);
                          return (
                            <div key={r.gender} className="flex-1 border border-border p-2 text-center">
                              <div className="w-full h-1 mb-2" style={{ backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                              <p className="font-mono text-xs font-bold" style={{ color: PIE_PALETTE[i % PIE_PALETTE.length] }}>{pct(r.count, total)}%</p>
                              <p className="font-mono text-[9px] text-muted-foreground">{(r.gender ?? "Unknown").toUpperCase()}</p>
                              <p className="font-mono text-[9px]">{r.count}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {d.votesByAge.length > 0 && (
                    <div>
                      <p className="font-mono text-[9px] text-muted-foreground mb-2">BY AGE GROUP</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={d.votesByAge}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e2229" />
                          <XAxis dataKey="age" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                          <YAxis tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" name="Votes" fill={COLORS.purple} radius={0} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </Panel>

            <Panel title="TOPICAL ISSUES BY SECTOR">
              {d.issuesByCategory.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.issuesByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2229" horizontal={false} />
                    <XAxis type="number" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <YAxis dataKey="category" type="category" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} width={90} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Total" fill={COLORS.orange} radius={0} />
                    <Bar dataKey="open" name="Open" fill={COLORS.primary} opacity={0.8} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="ISSUES BY WARD — PRESSURE MAP">
              {d.issuesByWard.length === 0 ? <EmptyChart /> : (
                <div className="space-y-2.5">
                  {d.issuesByWard.map((w: any) => {
                    const maxCount = d.issuesByWard[0]?.count ?? 1;
                    return (
                      <div key={w.ward}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-mono text-[10px]">{(w.ward ?? "ALL").toUpperCase()}</span>
                          <div className="flex gap-2 font-mono text-[9px]">
                            {w.critical > 0 && <span className="text-red-400">{w.critical} CRITICAL</span>}
                            <span className="text-muted-foreground">{w.count} total</span>
                          </div>
                        </div>
                        <div className="h-3 bg-secondary">
                          <div className="h-3 transition-all" style={{ width: `${pct(w.count, maxCount)}%`, backgroundColor: w.critical > 0 ? COLORS.primary : COLORS.orange }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* Top polls */}
          {d.topPolls.length > 0 && (
            <Panel title="TOP OPINION POLLS BY PARTICIPATION">
              <div className="space-y-2">
                {d.topPolls.slice(0, 5).map((poll: any) => (
                  <div key={poll.id} className="flex items-center gap-3 border border-border/40 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[10px] truncate">{poll.title}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">{poll.category.toUpperCase()} · {poll.ward !== "all" ? poll.ward : "All Wards"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold text-primary">{poll.totalVotes}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">votes</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ─── KOLs ─── */}
      {tab === "kols" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <Stat label="TOTAL KOLs" value={d.totals.total} />
            <Stat label="TOTAL REACH" value={fmt(d.totals.followers)} sub="Combined followers" color="text-blue-400" />
            <Stat label="AVG INFLUENCE" value={d.totals.avgInfluence} sub="Out of 100" color="text-yellow-400" />
            <Stat label="ALIGNED" value={d.totals.aligned} sub={`${pct(d.totals.aligned, d.totals.total)}% supportive`} color="text-green-400" />
            <Stat label="OPPOSED" value={d.totals.opposed} sub={`${pct(d.totals.opposed, d.totals.total)}% opposed`} color={d.totals.opposed > 0 ? "text-red-400" : "text-muted-foreground"} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="REACH BY TIER">
              {d.byTier.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.byTier}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2229" />
                    <XAxis dataKey="tier" tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <YAxis tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b7280" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="KOLs" fill={COLORS.primary} radius={0} />
                    <Bar dataKey="avgScore" name="Avg Score" fill={COLORS.yellow} opacity={0.8} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="KOL ALIGNMENT BREAKDOWN">
              {d.byAlignment.length === 0 ? <EmptyChart /> : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={d.byAlignment} dataKey="count" nameKey="alignment" cx="50%" cy="50%" innerRadius={45} outerRadius={75} strokeWidth={0}>
                        {d.byAlignment.map((r: any) => (
                          <Cell key={r.alignment} fill={r.alignment === "aligned" ? COLORS.green : r.alignment === "opposed" ? COLORS.primary : COLORS.yellow} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3">
                    {d.byAlignment.map((r: any) => {
                      const color = r.alignment === "aligned" ? COLORS.green : r.alignment === "opposed" ? COLORS.primary : COLORS.yellow;
                      return (
                        <div key={r.alignment}>
                          <div className="flex justify-between mb-1">
                            <span className="font-mono text-[10px]" style={{ color }}>{r.alignment.toUpperCase()}</span>
                            <span className="font-mono text-[10px]">{r.count} · {fmt(r.followers)}</span>
                          </div>
                          <div className="h-2 bg-secondary"><div className="h-2" style={{ width: `${pct(r.count, d.totals.total)}%`, backgroundColor: color }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="PLATFORM DISTRIBUTION — REACH">
              {d.byPlatform.length === 0 ? <EmptyChart /> : (
                <div className="space-y-2">
                  {d.byPlatform.map((p: any, i: number) => (
                    <div key={p.platform} className="flex items-center gap-3 border border-border/40 px-3 py-2">
                      <div className="w-2 h-2 shrink-0" style={{ backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                      <span className="font-mono text-[10px] w-24 shrink-0">{p.platform.toUpperCase()}</span>
                      <div className="flex-1">
                        <div className="h-3 bg-secondary">
                          <div className="h-3" style={{ width: `${pct(p.followers, d.totals.followers)}%`, backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-[10px]">{fmt(p.followers)}</span>
                        <span className="font-mono text-[9px] text-muted-foreground ml-1">({p.count} KOLs)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="TOP 10 KOLs BY INFLUENCE SCORE">
              {d.topKOLs.length === 0 ? <EmptyChart /> : (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {d.topKOLs.map((k: any, i: number) => (
                    <div key={k.id} className="flex items-center gap-3 py-1.5 border-b border-border/30">
                      <span className="font-mono text-[9px] text-muted-foreground w-4 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[10px] truncate">{k.name}</p>
                        <p className="font-mono text-[9px] text-muted-foreground">{k.platform.toUpperCase()} {k.handle ? `· @${k.handle}` : ""} · {k.tier.toUpperCase()}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-bold text-yellow-400">{k.influenceScore}</p>
                        <p className="font-mono text-[9px] text-muted-foreground">{fmt(k.followerCount)}</p>
                      </div>
                      <div className="w-2 h-2 shrink-0" style={{ backgroundColor: k.alignment === "aligned" ? COLORS.green : k.alignment === "opposed" ? COLORS.primary : COLORS.yellow }} title={k.alignment} />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* ─── INSIGHTS ─── */}
      {tab === "insights" && d && (
        <div className="space-y-4">
          <div className="bg-card border border-primary/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] tracking-widest text-primary">CAMPAIGN COMMAND SUMMARY</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">{new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "MEMBER BASE", value: fmt(d.members.total), sub: `${d.members.active} active`, color: "text-foreground", icon: <Users className="w-4 h-4 text-primary" /> },
                { label: "FIELD COVERAGE", value: `${d.field.coveragePct}%`, sub: `${fmt(d.field.doorsCompleted)} doors done`, color: d.field.coveragePct > 60 ? "text-green-400" : d.field.coveragePct > 30 ? "text-yellow-400" : "text-red-400", icon: <Map className="w-4 h-4 text-blue-400" /> },
                { label: "MSG DELIVERY", value: `${d.messaging.deliveryRate}%`, sub: `${fmt(d.messaging.delivered)} delivered`, color: d.messaging.deliveryRate > 80 ? "text-green-400" : d.messaging.deliveryRate > 50 ? "text-yellow-400" : "text-red-400", icon: <MessageSquare className="w-4 h-4 text-cyan-400" /> },
                { label: "KOL ALIGNMENT", value: `${d.kols.alignedPct}%`, sub: `${fmt(d.kols.followers)} total reach`, color: d.kols.alignedPct > 60 ? "text-green-400" : d.kols.alignedPct > 30 ? "text-yellow-400" : "text-red-400", icon: <Star className="w-4 h-4 text-yellow-400" /> },
              ].map(({ label, value, sub, color, icon }) => (
                <div key={label} className="border border-border p-3 flex items-start gap-3">
                  <div className="p-2 bg-secondary">{icon}</div>
                  <div>
                    <p className="font-mono text-[9px] text-muted-foreground">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="font-mono text-[9px] text-muted-foreground">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full module scorecard */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="MODULE PERFORMANCE SCORECARD">
              <div className="space-y-3">
                {[
                  { module: "MEMBER DATABASE", score: Math.min(100, d.members.total), max: d.members.total || 1, label: `${d.members.total} members · ${d.members.active} active`, color: COLORS.primary },
                  { module: "FIELD OPERATIONS", score: d.field.coveragePct, max: 100, label: `${d.field.coveragePct}% door coverage`, color: COLORS.blue },
                  { module: "MESSAGING", score: d.messaging.deliveryRate, max: 100, label: `${d.messaging.deliveryRate}% delivery rate`, color: COLORS.cyan },
                  { module: "VOLUNTEERS", score: Math.min(100, d.volunteers.total), max: d.volunteers.total || 1, label: `${d.volunteers.active} active volunteers`, color: COLORS.green },
                  { module: "KOL NETWORK", score: d.kols.alignedPct, max: 100, label: `${d.kols.alignedPct}% aligned`, color: COLORS.yellow },
                  { module: "POLL SENTIMENT", score: Math.min(100, d.sentiment.votes), max: d.sentiment.votes || 1, label: `${d.sentiment.votes} votes cast`, color: COLORS.purple },
                  { module: "CREDENTIALS", score: d.credentials.records > 0 ? pct(d.credentials.passed, d.credentials.records) : 0, max: 100, label: `${d.credentials.passed}/${d.credentials.records} records passed`, color: COLORS.orange },
                  { module: "FINANCE", score: Math.min(100, Math.round(d.finance.totalRaised / 1000)), max: Math.max(1, Math.round(d.finance.totalRaised / 1000)), label: `KSh ${fmt(d.finance.totalRaised)} raised`, color: COLORS.teal },
                ].map(({ module, score, max, label, color }) => {
                  const p = max > 0 ? Math.round((score / max) * 100) : 0;
                  return (
                    <div key={module}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-mono text-[9px]">{module}</span>
                        <span className="font-mono text-[9px] text-muted-foreground">{label}</span>
                      </div>
                      <div className="h-3 bg-secondary">
                        <div className="h-3 transition-all" style={{ width: `${Math.min(100, p)}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="AI STRATEGIC RECOMMENDATIONS">
              <div className="space-y-3">
                {[
                  {
                    priority: "CRITICAL" as const,
                    show: d.sentiment.openIssues > 5,
                    text: `${d.sentiment.openIssues} open constituent issues require resolution. High unresolved issue count signals service delivery gaps — address before they go viral.`,
                    action: "Go to Intelligence Gathering → Topical Issues",
                  },
                  {
                    priority: "HIGH" as const,
                    show: d.field.coveragePct < 50 && d.field.sessions.total > 0,
                    text: `Door coverage at ${d.field.coveragePct}% — below the 50% threshold for effective ground presence. Deploy more canvass sessions in underperforming wards.`,
                    action: "Go to Field Operations → Canvass Sessions",
                  },
                  {
                    priority: "HIGH" as const,
                    show: d.messaging.deliveryRate < 60 && d.messaging.campaigns > 0,
                    text: `Messaging delivery rate is ${d.messaging.deliveryRate}% — below target. Check list hygiene, opt-in compliance, and channel quality.`,
                    action: "Go to Messaging → Campaigns",
                  },
                  {
                    priority: "MEDIUM" as const,
                    show: d.kols.alignedPct < 50 && d.kols.total > 0,
                    text: `Only ${d.kols.alignedPct}% of KOLs are aligned. Invest in engagement with neutral KOLs — they represent the easiest persuasion wins.`,
                    action: "Go to KOL Influence",
                  },
                  {
                    priority: "MEDIUM" as const,
                    show: d.volunteers.active < 10,
                    text: `Volunteer force is thin at ${d.volunteers.active} active. Ground game requires at least 50–100 active volunteers for effective constituency coverage.`,
                    action: "Go to Volunteer Command",
                  },
                  {
                    priority: "LOW" as const,
                    show: d.credentials.records < 5,
                    text: `Legislative credentials hub has ${d.credentials.records} records. Build your credentials profile before the campaign intensifies.`,
                    action: "Go to Credentials Hub",
                  },
                  {
                    priority: "LOW" as const,
                    show: d.members.total > 0,
                    text: `Member base at ${d.members.total} contacts. Target 10,000+ registered supporters for credible constituency coverage across all 5 wards.`,
                    action: "Go to Voters → Import",
                  },
                ].filter(r => r.show).slice(0, 5).map((rec, i) => {
                  const colors: Record<string, string> = { CRITICAL: "border-red-400/40 bg-red-400/5", HIGH: "border-orange-400/30 bg-orange-400/5", MEDIUM: "border-yellow-400/20", LOW: "border-border" };
                  const badgeColors: Record<string, string> = { CRITICAL: "text-red-400 border-red-400/40", HIGH: "text-orange-400 border-orange-400/40", MEDIUM: "text-yellow-400 border-yellow-400/30", LOW: "text-muted-foreground border-border" };
                  return (
                    <div key={i} className={`border p-3 ${colors[rec.priority]}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: rec.priority === "CRITICAL" ? "#f87171" : rec.priority === "HIGH" ? "#fb923c" : rec.priority === "MEDIUM" ? "#eab308" : "#6b7280" }} />
                        <span className={`font-mono text-[9px] border px-1 py-0.5 ${badgeColors[rec.priority]}`}>{rec.priority}</span>
                      </div>
                      <p className="text-[10px] leading-relaxed mb-1">{rec.text}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">→ {rec.action}</p>
                    </div>
                  );
                })}
                {[d.sentiment.openIssues > 5, d.field.coveragePct < 50, d.messaging.deliveryRate < 60, d.kols.alignedPct < 50, d.volunteers.active < 10].every(v => !v) && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <ShieldCheck className="w-6 h-6 text-green-400" />
                    <p className="font-mono text-[10px] text-green-400">[ ALL SYSTEMS NOMINAL ]</p>
                    <p className="font-mono text-[9px] text-muted-foreground text-center">No critical issues detected. Continue building across all modules.</p>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          {/* Finance summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="DONATIONS RECEIVED" value={fmt(d.finance.totalRaised)} sub={`${d.finance.donations} transactions`} color="text-teal-400" />
            <Stat label="POLL PARTICIPATION" value={fmt(d.sentiment.votes)} sub={`${d.sentiment.polls} polls active`} color="text-purple-400" />
            <Stat label="LEGISLATIVE RECORDS" value={d.credentials.records} sub={`${d.credentials.passed} passed`} color="text-orange-400" />
            <Stat label="ACHIEVEMENTS LOGGED" value={d.credentials.achievements} sub={`${d.credentials.completed} completed`} color="text-indigo-400" />
          </div>
        </div>
      )}
    </div>
  );
}