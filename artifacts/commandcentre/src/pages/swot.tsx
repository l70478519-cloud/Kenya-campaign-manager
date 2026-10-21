import { PathToWin } from "@/components/path-to-win";
import { CAMPAIGN } from "@/lib/wards";
import { useState } from "react";
import {
  TrendingUp, TrendingDown, Target, AlertTriangle,
  RefreshCw, Bot, Download, Clock, ChevronDown, ChevronUp,
  Zap, Shield, Eye, Crosshair
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

type Impact = "high" | "medium" | "low";
type Quadrant = "strengths" | "weaknesses" | "opportunities" | "threats";

interface SwotItem {
  title: string;
  detail: string;
  impact: Impact;
  category: string;
  action: string;
  source?: string;
}

interface SwotData {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  generatedAt: string;
  mode?: string;
  note?: string;
}

function impactColor(impact: Impact) {
  return impact === "high"
    ? "text-red-400 border-red-400/40 bg-red-500/5"
    : impact === "medium"
    ? "text-yellow-400 border-yellow-400/40 bg-yellow-400/5"
    : "text-blue-400 border-blue-400/30 bg-blue-400/5";
}

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    Political: "text-purple-400",
    Financial: "text-yellow-400",
    Grassroots: "text-green-400",
    Narrative: "text-sky-400",
    Demographic: "text-orange-400",
    Infrastructure: "text-cyan-400",
    Legal: "text-pink-400",
    External: "text-rose-400",
  };
  return map[cat] ?? "text-muted-foreground";
}

const QUADRANT_META: Record<Quadrant, {
  label: string;
  short: string;
  icon: React.ReactNode;
  accent: string;
  border: string;
  bg: string;
  headerBg: string;
}> = {
  strengths: {
    label: "STRENGTHS",
    short: "S",
    icon: <TrendingUp className="w-4 h-4" />,
    accent: "text-green-400",
    border: "border-green-500/30",
    bg: "bg-green-500/3",
    headerBg: "bg-green-500/10",
  },
  weaknesses: {
    label: "WEAKNESSES",
    short: "W",
    icon: <TrendingDown className="w-4 h-4" />,
    accent: "text-red-400",
    border: "border-red-500/30",
    bg: "bg-red-500/3",
    headerBg: "bg-red-500/10",
  },
  opportunities: {
    label: "OPPORTUNITIES",
    short: "O",
    icon: <Target className="w-4 h-4" />,
    accent: "text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/3",
    headerBg: "bg-blue-500/10",
  },
  threats: {
    label: "THREATS",
    short: "T",
    icon: <AlertTriangle className="w-4 h-4" />,
    accent: "text-orange-400",
    border: "border-orange-500/30",
    bg: "bg-orange-500/3",
    headerBg: "bg-orange-500/10",
  },
};

function SwotCard({ item, quadrant, index }: { item: SwotItem; quadrant: Quadrant; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const meta = QUADRANT_META[quadrant];

  return (
    <div className={`border ${meta.border} bg-card transition-all`}>
      <button
        className="w-full text-left p-3 flex items-start gap-3"
        onClick={() => setExpanded(v => !v)}
      >
        <span className={`font-mono text-[10px] border ${meta.border} ${meta.accent} px-1.5 py-0.5 shrink-0 mt-0.5`}>
          {meta.short}{String(index + 1).padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-foreground">{item.title}</span>
            <span className={`font-mono text-[9px] border px-1.5 py-0.5 ${impactColor(item.impact)}`}>
              {item.impact.toUpperCase()}
            </span>
            <span className={`font-mono text-[9px] ${categoryColor(item.category)}`}>
              [{item.category.toUpperCase()}]{item.source === "campaign data" && <span className="ml-1 rounded-full border border-primary/50 px-1.5 text-primary">YOUR DATA</span>}
            </span>
          </div>
          {!expanded && (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{item.detail}</p>
          )}
        </div>
        <span className="text-muted-foreground shrink-0 mt-0.5">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/40 pt-2">
          <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
          <div className="flex items-start gap-2">
            <Zap className={`w-3 h-3 mt-0.5 shrink-0 ${meta.accent}`} />
            <p className="text-[11px] font-mono text-foreground/80 leading-relaxed">{item.action}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function QuadrantPanel({ quadrant, items }: { quadrant: Quadrant; items: SwotItem[] }) {
  const meta = QUADRANT_META[quadrant];
  const highCount = items.filter(i => i.impact === "high").length;

  return (
    <div className={`border ${meta.border} flex flex-col`}>
      <div className={`${meta.headerBg} border-b ${meta.border} px-4 py-3 flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-2">
          <span className={meta.accent}>{meta.icon}</span>
          <span className={`font-mono text-xs font-bold tracking-widest ${meta.accent}`}>
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {highCount > 0 && (
            <span className="font-mono text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5">
              {highCount} HIGH
            </span>
          )}
          <span className="font-mono text-[9px] text-muted-foreground">{items.length} ITEMS</span>
        </div>
      </div>
      <div className="flex-1 space-y-1 p-2">
        {items.map((item, i) => (
          <SwotCard key={i} item={item} quadrant={quadrant} index={i} />
        ))}
        {items.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="font-mono text-[10px] text-muted-foreground">NO DATA</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryBar({ data }: { data: SwotData }) {
  const all = [...data.strengths, ...data.weaknesses, ...data.opportunities, ...data.threats];
  const high = all.filter(i => i.impact === "high").length;
  const med = all.filter(i => i.impact === "medium").length;
  const low = all.filter(i => i.impact === "low").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-2">
      {[
        { label: "STRENGTHS", value: data.strengths.length, color: "text-green-400" },
        { label: "WEAKNESSES", value: data.weaknesses.length, color: "text-red-400" },
        { label: "OPPORTUNITIES", value: data.opportunities.length, color: "text-blue-400" },
        { label: "THREATS", value: data.threats.length, color: "text-orange-400" },
        { label: "HIGH IMPACT", value: high, color: high > 0 ? "text-red-400" : "text-muted-foreground" },
        { label: "MED IMPACT", value: med, color: "text-yellow-400" },
        { label: "LOW IMPACT", value: low, color: "text-muted-foreground" },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-card border border-border p-3">
          <p className="font-mono text-[9px] text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

export default function Swot() {
  const [data, setData] = useState<SwotData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}api/ai/generate-swot`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Unknown error");
      setData(json);
    } catch (e: any) {
      setError(e.message ?? "AI analysis failed. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  function exportMarkdown() {
    if (!data) return;
    const sections = (["strengths", "weaknesses", "opportunities", "threats"] as Quadrant[]);
    let md = `# SWOT Analysis — ${CAMPAIGN.candidate}\n`;
    md += `**Generated:** ${new Date(data.generatedAt).toLocaleString("en-KE")}\n\n`;
    for (const q of sections) {
      md += `## ${QUADRANT_META[q].label}\n\n`;
      data[q].forEach((item, i) => {
        md += `### ${i + 1}. ${item.title} [${item.impact.toUpperCase()}] [${item.category}]\n`;
        md += `${item.detail}\n\n`;
        md += `**Action:** ${item.action}\n\n`;
      });
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swot-${CAMPAIGN.constituency.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 min-w-0">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-widest flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-primary" />
            STRATEGIC SWOT ANALYSIS
          </h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {`Evidence-based strategic assessment · ${CAMPAIGN.candidate} · ${CAMPAIGN.areaLabel}`.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <button
              onClick={exportMarkdown}
              className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"
            >
              <Download className="w-3 h-3" /> EXPORT MD
            </button>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? (
              <><RefreshCw className="w-3 h-3 animate-spin" /> ANALYSING…</>
            ) : data ? (
              <><RefreshCw className="w-3 h-3" /> REGENERATE</>
            ) : (
              <><Bot className="w-3 h-3" /> RUN AI ANALYSIS</>
            )}
          </button>
        </div>
      </div>

      <PathToWin />

      {/* Loading */}
      {loading && (
        <div className="bg-card border border-primary/40 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-primary animate-pulse" />
            <span className="font-mono text-xs text-primary tracking-widest">AI ANALYSIS IN PROGRESS</span>
          </div>
          <div className="space-y-2">
            {[
              "Profiling candidate background and track record…",
              "Scanning constituency demographics and voter sentiment…",
              "Assessing opposition landscape and threat vectors…",
              "Identifying strategic opportunities for 2027 election…",
              "Compiling SWOT matrix with actionable recommendations…",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-primary/50 animate-pulse" style={{ animationDelay: `${i * 300}ms` }} />
                <span className="font-mono text-[10px] text-muted-foreground">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/40 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="font-mono text-xs text-red-400">{error}</span>
          <button onClick={generate} className="ml-auto font-mono text-[10px] border border-red-500/40 px-3 py-1 text-red-400 hover:bg-red-500/10">
            RETRY
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div className="bg-card border border-border flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 border border-border flex items-center justify-center">
            <Crosshair className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-mono text-sm font-bold tracking-widest">AWAITING ANALYSIS DIRECTIVE</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              AI will assess 20 strategic factors across Strengths · Weaknesses · Opportunities · Threats
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 max-w-md w-full">
            {[
              { icon: <TrendingUp className="w-3 h-3 text-green-400" />, label: "5 STRENGTHS", desc: "Political assets & advantages" },
              { icon: <TrendingDown className="w-3 h-3 text-red-400" />, label: "5 WEAKNESSES", desc: "Vulnerabilities to address" },
              { icon: <Target className="w-3 h-3 text-blue-400" />, label: "5 OPPORTUNITIES", desc: "Strategic leverage points" },
              { icon: <AlertTriangle className="w-3 h-3 text-orange-400" />, label: "5 THREATS", desc: "Risks to neutralise" },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="bg-secondary border border-border p-3 flex items-start gap-2">
                {icon}
                <div>
                  <p className="font-mono text-[10px] font-bold">{label}</p>
                  <p className="font-mono text-[9px] text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={generate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 font-mono text-xs hover:bg-primary/90"
          >
            <Bot className="w-3.5 h-3.5" /> INITIATE AI ANALYSIS
          </button>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Timestamp + view toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span className="font-mono text-[10px]">
                LAST ANALYSED: {new Date(data.generatedAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}
              </span>
              <span className="font-mono text-[9px] border border-green-500/30 text-green-400 px-1.5 py-0.5">{data.mode?.includes("template") ? "[ DOCUMENT REVIEW ]" : data.mode === "document-evidence-review" ? "[ CIDP EVIDENCE REVIEW ]" : "[ AI ANALYSIS ]"}</span>
            </div>
            <div className="flex gap-1">
              {(["grid", "list"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setActiveTab(v)}
                  className={`font-mono text-[10px] border px-3 py-1.5 transition-colors ${activeTab === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {v.toUpperCase()} VIEW
                </button>
              ))}
            </div>
          </div>

          {/* Summary bar */}
          <SummaryBar data={data} />

          {/* Grid view: 2×2 */}
          {activeTab === "grid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <QuadrantPanel quadrant="strengths" items={data.strengths} />
              <QuadrantPanel quadrant="weaknesses" items={data.weaknesses} />
              <QuadrantPanel quadrant="opportunities" items={data.opportunities} />
              <QuadrantPanel quadrant="threats" items={data.threats} />
            </div>
          )}

          {/* List view: all 4 stacked */}
          {activeTab === "list" && (
            <div className="space-y-3">
              {(["strengths", "weaknesses", "opportunities", "threats"] as Quadrant[]).map(q => (
                <div key={q} className={`border ${QUADRANT_META[q].border}`}>
                  <div className={`${QUADRANT_META[q].headerBg} border-b ${QUADRANT_META[q].border} px-4 py-2 flex items-center gap-2`}>
                    <span className={QUADRANT_META[q].accent}>{QUADRANT_META[q].icon}</span>
                    <span className={`font-mono text-xs font-bold tracking-widest ${QUADRANT_META[q].accent}`}>
                      {QUADRANT_META[q].label}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground ml-auto">{data[q].length} ITEMS</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {data[q].map((item, i) => (
                      <div key={i} className="p-4 flex gap-4">
                        <div className="shrink-0 text-center">
                          <span className={`font-mono text-[10px] border ${QUADRANT_META[q].border} ${QUADRANT_META[q].accent} px-1.5 py-0.5`}>
                            {QUADRANT_META[q].short}{String(i + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold">{item.title}</span>
                            <span className={`font-mono text-[9px] border px-1.5 py-0.5 ${impactColor(item.impact)}`}>
                              {item.impact.toUpperCase()}
                            </span>
                            <span className={`font-mono text-[9px] ${categoryColor(item.category)}`}>
                              [{item.category.toUpperCase()}]{item.source === "campaign data" && <span className="ml-1 rounded-full border border-primary/50 px-1.5 text-primary">YOUR DATA</span>}{item.source === "campaign data" && <span className="ml-1 rounded-full border border-primary/50 px-1.5 text-primary">YOUR DATA</span>}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
                          <div className="flex items-start gap-2">
                            <Zap className={`w-3 h-3 mt-0.5 shrink-0 ${QUADRANT_META[q].accent}`} />
                            <p className="font-mono text-[10px] text-foreground/80">{item.action}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Priorities — high-impact items across all quadrants */}
          <div className="border border-primary/30 bg-primary/5">
            <div className="border-b border-primary/30 px-4 py-2 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-xs font-bold tracking-widest text-primary">COMMAND PRIORITIES — HIGH IMPACT ITEMS</span>
            </div>
            <div className="divide-y divide-border/30">
              {(["strengths", "weaknesses", "opportunities", "threats"] as Quadrant[])
                .flatMap(q => data[q].filter(i => i.impact === "high").map(i => ({ ...i, quadrant: q })))
                .map((item, i) => {
                  const meta = QUADRANT_META[item.quadrant as Quadrant];
                  return (
                    <div key={i} className="px-4 py-3 flex items-start gap-3">
                      <span className={`font-mono text-[9px] border ${meta.border} ${meta.accent} px-1.5 py-0.5 shrink-0`}>
                        {meta.short} {item.impact.toUpperCase()}
                      </span>
                      <div className="flex-1">
                        <p className="font-mono text-xs font-semibold">{item.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Eye className="w-3 h-3 text-primary shrink-0" />
                          <p className="font-mono text-[10px] text-muted-foreground">{item.action}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {(["strengths", "weaknesses", "opportunities", "threats"] as Quadrant[])
                .flatMap(q => data[q].filter(i => i.impact === "high")).length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-[10px] text-muted-foreground">
                  NO HIGH-IMPACT ITEMS IDENTIFIED
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
