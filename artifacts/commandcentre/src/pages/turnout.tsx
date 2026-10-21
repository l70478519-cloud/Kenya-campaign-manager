import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Users, Vote, Megaphone, Save, RotateCcw, Target } from "lucide-react";

const BASE = import.meta.env.BASE_URL;
const API = `${BASE}api/turnout`;

async function fetchJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw new Error(`Request failed: ${r.status}`);
  return r.json();
}

interface WardPrediction {
  ward: string;
  stations: number;
  registered: number;
  expectedTurnoutRate: number;
  supportShare: number;
  turnoutRate: number;
  effectiveSupportShare: number;
  predictedVotes: number;
  predictedCandidateVotes: number;
  gotvUpside: number;
  gotvRank: number;
  actualVotesCast: number;
  actualCandidateVotes: number;
  actualTurnoutRate: number;
  reportingStations: number;
}

interface Prediction {
  principal: string;
  scenario: { turnoutDelta: number; supportDelta: number };
  defaults: { turnout: number; support: number };
  wards: WardPrediction[];
  totals: {
    registered: number;
    predictedVotes: number;
    predictedTurnoutRate: number;
    predictedCandidateVotes: number;
    predictedCandidateShare: number;
    topGotvWard: string | null;
    topGotvUpside: number;
  };
}

const fmt = (n: number) => n.toLocaleString();

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-card border border-border p-4">
      <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">{label}</div>
      <div className={`text-2xl font-bold ${accent ?? ""}`}>{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function Turnout() {
  const qc = useQueryClient();
  const [turnoutDelta, setTurnoutDelta] = useState(0);
  const [edits, setEdits] = useState<Record<string, { turnout: number; support: number }>>({});

  const { data, isLoading, error } = useQuery<Prediction>({
    queryKey: ["turnout-prediction", turnoutDelta],
    queryFn: () => fetchJson(`/prediction?turnoutDelta=${turnoutDelta}`),
  });

  // Seed the editable assumptions from the server's baseline (unaffected by the
  // scenario slider, which only shifts the projection view).
  useEffect(() => {
    if (!data) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const w of data.wards) {
        if (!next[w.ward]) next[w.ward] = { turnout: w.expectedTurnoutRate, support: w.supportShare };
      }
      return next;
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson("/assumptions", {
        method: "PUT",
        body: JSON.stringify({
          assumptions: Object.entries(edits).map(([ward, v]) => ({
            ward,
            expectedTurnoutRate: v.turnout,
            candidateSupportShare: v.support,
          })),
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["turnout-prediction"] }),
  });

  const setEdit = (ward: string, key: "turnout" | "support", raw: string) => {
    const n = Math.max(0, Math.min(100, parseInt(raw) || 0));
    setEdits((prev) => ({ ...prev, [ward]: { ...prev[ward]!, [key]: n } }));
  };

  const hasTally = (data?.wards ?? []).some((w) => w.reportingStations > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-wider flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> VOTER TURNOUT FORECAST
          </h1>
          <p className="font-mono text-[11px] text-muted-foreground mt-1">
            Makueni County ward-level turnout estimates · based on registered-voter records
          </p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || Object.keys(edits).length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs tracking-wider disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "SAVING..." : "SAVE ASSUMPTIONS"}
        </button>
      </div>

      {isLoading && <div className="p-8 font-mono text-xs text-muted-foreground">LOADING FORECAST...</div>}
      {error && <div className="p-8 font-mono text-xs text-red-400">FAILED TO LOAD FORECAST.</div>}

      {data && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="PROJECTED TURNOUT"
              value={`${data.totals.predictedTurnoutRate}%`}
              sub={`${fmt(data.totals.predictedVotes)} OF ${fmt(data.totals.registered)} VOTERS`}
            />
            <StatCard
              label="PROJECTED CANDIDATE VOTES"
              value={fmt(data.totals.predictedCandidateVotes)}
              sub={`${data.totals.predictedCandidateShare}% PROJECTED VOTE SHARE`}
              accent="text-green-400"
            />
            <StatCard
              label="REGISTERED VOTERS"
              value={fmt(data.totals.registered)}
              sub={`${data.wards.length} WARDS · MAKUENI COUNTY`}
            />
            <StatCard
              label="TOP GOTV PRIORITY"
              value={data.totals.topGotvWard ?? "—"}
              sub={`+${fmt(data.totals.topGotvUpside)} POTENTIAL VOTES`}
              accent="text-yellow-400"
            />
          </div>

          {/* Scenario slider */}
          <div className="bg-card border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[10px] text-muted-foreground tracking-widest flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> SCENARIO · TURNOUT SHIFT
              </div>
              <button
                onClick={() => setTurnoutDelta(0)}
                className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3 h-3" /> RESET
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-[10px] text-muted-foreground w-10">-20pp</span>
              <input
                type="range"
                min={-20}
                max={20}
                step={1}
                value={turnoutDelta}
                onChange={(e) => setTurnoutDelta(parseInt(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="font-mono text-[10px] text-muted-foreground w-10 text-right">+20pp</span>
              <span
                className={`font-mono text-sm font-bold w-16 text-right ${
                  turnoutDelta > 0 ? "text-green-400" : turnoutDelta < 0 ? "text-red-400" : "text-foreground"
                }`}
              >
                {turnoutDelta > 0 ? "+" : ""}
                {turnoutDelta}pp
              </span>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground mt-2">
              Model a constituency-wide turnout change on top of your saved ward assumptions. Does not overwrite saved values.
            </p>
          </div>

          {/* Ward table */}
          <div className="bg-card border border-border">
            <div className="font-mono text-[10px] text-muted-foreground p-4 pb-3 tracking-widest border-b border-border">
              WARD-BY-WARD FORECAST · EDIT EXPECTED TURNOUT &amp; SUPPORT
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="font-mono text-[10px] text-muted-foreground tracking-wider border-b border-border">
                    <th className="text-left p-3">WARD</th>
                    <th className="text-right p-3">REGISTERED</th>
                    <th className="text-center p-3">TURNOUT %</th>
                    <th className="text-center p-3">SUPPORT %</th>
                    <th className="text-right p-3">PROJ. VOTES</th>
                    <th className="text-right p-3">PROJ. CANDIDATE</th>
                    <th className="text-right p-3">GOTV UPSIDE</th>
                    {hasTally && <th className="text-right p-3">ACTUAL T/O</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.wards.map((w) => {
                    const e = edits[w.ward] ?? { turnout: w.expectedTurnoutRate, support: w.supportShare };
                    const isTopPriority = w.gotvRank <= 2;
                    return (
                      <tr key={w.ward} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="p-3 font-medium">
                          <div className="flex items-center gap-2">
                            {w.ward}
                            {isTopPriority && (
                              <span className="flex items-center gap-1 font-mono text-[9px] text-yellow-400 border border-yellow-400/30 px-1 py-0.5">
                                <Megaphone className="w-2.5 h-2.5" /> GOTV #{w.gotvRank}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">{w.stations} STATIONS</div>
                        </td>
                        <td className="p-3 text-right font-mono">{fmt(w.registered)}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={e.turnout}
                            onChange={(ev) => setEdit(w.ward, "turnout", ev.target.value)}
                            className="w-16 bg-secondary border border-border text-center font-mono text-xs py-1"
                          />
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={e.support}
                            onChange={(ev) => setEdit(w.ward, "support", ev.target.value)}
                            className="w-16 bg-secondary border border-border text-center font-mono text-xs py-1"
                          />
                        </td>
                        <td className="p-3 text-right font-mono">{fmt(w.predictedVotes)}</td>
                        <td className="p-3 text-right font-mono text-green-400">{fmt(w.predictedCandidateVotes)}</td>
                        <td className="p-3 text-right font-mono text-yellow-400">+{fmt(w.gotvUpside)}</td>
                        {hasTally && (
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {w.reportingStations > 0 ? `${w.actualTurnoutRate}%` : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-mono text-xs border-t border-border bg-secondary/20">
                    <td className="p-3 font-bold tracking-wider">TOTAL</td>
                    <td className="p-3 text-right font-bold">{fmt(data.totals.registered)}</td>
                    <td className="p-3 text-center font-bold">{data.totals.predictedTurnoutRate}%</td>
                    <td className="p-3 text-center font-bold">{data.totals.predictedCandidateShare}%</td>
                    <td className="p-3 text-right font-bold">{fmt(data.totals.predictedVotes)}</td>
                    <td className="p-3 text-right font-bold text-green-400">{fmt(data.totals.predictedCandidateVotes)}</td>
                    <td className="p-3 text-right font-bold text-yellow-400">
                      +{fmt(data.wards.reduce((s, w) => s + w.gotvUpside, 0))}
                    </td>
                    {hasTally && <td className="p-3" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border p-4 flex items-start gap-3">
              <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="font-mono text-[10px] text-muted-foreground tracking-widest mb-1">REGISTERED BASE</div>
                <p className="text-xs text-muted-foreground">Denominators come from live polling-station registration counts.</p>
              </div>
            </div>
            <div className="bg-card border border-border p-4 flex items-start gap-3">
              <Vote className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-mono text-[10px] text-muted-foreground tracking-widest mb-1">SUPPORT SHARE</div>
                <p className="text-xs text-muted-foreground">Set the ward-level candidate share assumption; defaults to {data.defaults.support}%.</p>
              </div>
            </div>
            <div className="bg-card border border-border p-4 flex items-start gap-3">
              <Megaphone className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-mono text-[10px] text-muted-foreground tracking-widest mb-1">GOTV UPSIDE</div>
                <p className="text-xs text-muted-foreground">Supporters not projected to vote — the mobilization opportunity per ward.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
