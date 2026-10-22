import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Trophy, RefreshCw, AlertTriangle, Users, MapPin } from "lucide-react";
import { api } from "@/lib/records";

type Cand = { name: string; party: string | null; isOurs: boolean; lastShare: number | null; pollShare: number | null; lastVotes: number; pollVotes: number };
type Ward = {
  ward: string; registered: number | null; registeredSource: string | null; stations: number;
  lastElection: { year: number; turnoutPct: number | null; winner: string; winnerShare: number; ourShare: number | null } | null;
  poll: { responses: number; ourShare: number; leader: string; leaderShare: number; undecidedShare: number } | null;
  canvass: { contacts: number; supportShare: number; undecidedShare: number; opposedShare: number } | null;
  volunteers: number; events90d: number; expectedTurnoutPct: number | null; projectedVotes: number | null;
  targetShare: number; estimatedShare: number | null; estimateSource: string | null; votesToGain: number | null;
  contactsPer1000: number | null; status: "stronghold" | "lean" | "battleground" | "behind" | "no-data"; actions: string[];
};
export type WinData = {
  generatedAt: string;
  campaign: { candidate: string; seat: string; constituency: string };
  summary: { registered: number | null; projectedVotes: number | null; estimatedVotes: number | null; estimatedShare: number | null; wardsWithData: number; wards: number; lastElectionYear: number | null; topPriorities: string[] };
  candidates: Cand[]; wards: Ward[]; dataGaps: string[]; sources: string[];
};

const STATUS: Record<Ward["status"], { label: string; cls: string }> = {
  stronghold: { label: "Stronghold", cls: "border-green-400/50 text-green-300 bg-green-500/10" },
  lean: { label: "Within reach", cls: "border-emerald-400/50 text-emerald-200 bg-emerald-500/10" },
  battleground: { label: "Battleground", cls: "border-amber-400/50 text-amber-200 bg-amber-500/10" },
  behind: { label: "Behind", cls: "border-red-400/50 text-red-300 bg-red-500/10" },
  "no-data": { label: "No data yet", cls: "border-border text-muted-foreground" },
};
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-KE"));

function Bar({ value, target }: { value: number | null; target: number }) {
  return (
    <div className="relative h-2.5 rounded-full bg-white/10 overflow-hidden" role="img" aria-label={value == null ? "No estimate" : `${value}% of ${target}% needed`}>
      {value != null && <div className={`h-full ${value >= target ? "bg-green-500" : value >= target - 10 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${Math.min(100, value)}%` }} />}
      <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${target}%` }} title={`${target}% needed`} />
    </div>
  );
}

export function PathToWin() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<WinData>({ queryKey: ["path-to-win"], queryFn: () => api<WinData>("analysis/win") });
  if (isLoading) return <section className="kaiti-glass rounded-2xl p-4 text-sm text-muted-foreground">Working out the path to victory…</section>;
  if (error || !data) return <section className="kaiti-glass rounded-2xl p-4 text-sm text-red-300">{(error as Error)?.message ?? "Could not load the analysis."}</section>;
  const s = data.summary;
  const leaderPoll = data.candidates.some(c => c.pollShare != null);

  return (
    <section className="space-y-4" aria-labelledby="ptw-title">
      <div className="kaiti-glass rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="ptw-title" className="font-bold text-lg flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> Path to victory · {data.campaign.constituency}</h2>
            <p className="text-xs text-muted-foreground">Which wards to improve, and by how much, for {data.campaign.candidate} to win. Built only from your data; gaps are shown, not guessed.</p>
          </div>
          <button type="button" onClick={() => void refetch()} disabled={isFetching} className="border border-border rounded-xl px-3 py-2 text-xs flex items-center gap-2"><RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh</button>
        </div>

        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["Registered voters", n(s.registered)],
            ["Expected votes cast", n(s.projectedVotes)],
            ["Our estimated share", s.estimatedShare == null ? "—" : `${s.estimatedShare}%`],
            ["Focus first", s.topPriorities.join(" · ") || "—"],
          ].map(([k, v]) => <div key={k} className="rounded-xl border border-border p-3 min-w-0"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="text-lg font-bold tabular-nums break-words">{v}</dd></div>)}
        </dl>

        {data.dataGaps.length > 0 && <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-xs space-y-1">
          <p className="font-semibold text-amber-200 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Add this data to sharpen the analysis</p>
          <ul className="list-disc pl-5 text-amber-100/90">{data.dataGaps.map(g => <li key={g}>{g}</li>)}</ul>
          <p className="text-muted-foreground pt-1">Import results in <Link href="/m/election-history" className="underline">Historical Election Results</Link>, stations in <Link href="/election-day" className="underline">Election Day → Stations</Link>, and run a candidate poll in <Link href="/surveys" className="underline">Surveys</Link>.</p>
        </div>}
      </div>

      <div className="kaiti-glass rounded-2xl p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Candidates</h3>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Candidate</th><th>Party</th>{leaderPoll && <th className="text-right">Our polls</th>}<th className="text-right">{s.lastElectionYear ?? "Last"} result</th></tr></thead>
          <tbody>{data.candidates.map(c => <tr key={c.name} className={`border-t border-border/50 ${c.isOurs ? "text-primary font-semibold" : ""}`}>
            <td className="py-2">{c.name}{c.isOurs && <span className="ml-1 text-[10px] rounded-full border border-primary/50 px-1.5">ours</span>}</td>
            <td>{c.party ?? "—"}</td>
            {leaderPoll && <td className="text-right tabular-nums">{c.pollShare == null ? "—" : `${c.pollShare}%`}</td>}
            <td className="text-right tabular-nums">{c.lastShare == null ? "—" : `${c.lastShare}% (${n(c.lastVotes)})`}</td>
          </tr>)}</tbody>
        </table></div>
        {data.candidates.length <= 1 && <p className="text-xs text-muted-foreground mt-2">No rivals recorded yet. They appear once past results are imported or a poll lists them.</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {data.wards.map((w, i) => {
          const st = STATUS[w.status];
          return <article key={w.ward} className="kaiti-glass rounded-2xl p-4 space-y-3 min-w-0">
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary shrink-0" /> {w.ward} <span className="text-xs text-muted-foreground font-normal">#{i + 1} priority</span></h3>
                <p className="text-xs text-muted-foreground">{n(w.registered)} registered · {w.stations ? `${w.stations} stations` : "stations not imported"} · {w.volunteers} volunteers</p>
              </div>
              <span className={`shrink-0 text-xs rounded-full border px-2 py-0.5 ${st.cls}`}>{st.label}</span>
            </header>
            <div className="space-y-1">
              <div className="flex justify-between text-xs"><span>Our support {w.estimatedShare == null ? "—" : `${w.estimatedShare}%`}</span><span className="text-muted-foreground">Need {w.targetShare}%</span></div>
              <Bar value={w.estimatedShare} target={w.targetShare} />
              {w.estimateSource && <p className="text-[11px] text-muted-foreground">From: {w.estimateSource}</p>}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-muted-foreground">Votes to gain</dt><dd className="font-semibold tabular-nums">{n(w.votesToGain)}</dd></div>
              <div><dt className="text-muted-foreground">Expected turnout</dt><dd className="font-semibold">{w.expectedTurnoutPct == null ? "Not available" : `${w.expectedTurnoutPct}%`}</dd></div>
              <div><dt className="text-muted-foreground">Contacts /1,000</dt><dd className="font-semibold">{w.contactsPer1000 ?? "—"}</dd></div>
            </dl>
            {(w.lastElection || w.poll) && <p className="text-xs text-muted-foreground">
              {w.lastElection && <>In {w.lastElection.year}: {w.lastElection.winner} won with {w.lastElection.winnerShare}%{w.lastElection.turnoutPct != null ? `, turnout ${w.lastElection.turnoutPct}%` : ""}. </>}
              {w.poll && <>Our poll: {w.poll.leader} leads at {w.poll.leaderShare}%, undecided {w.poll.undecidedShare}% ({w.poll.responses} responses).</>}
            </p>}
            <ul className="text-sm space-y-1.5">{w.actions.slice(0, 3).map(a => <li key={a} className="flex gap-2"><span className="text-primary">→</span><span>{a}</span></li>)}</ul>
          </article>;
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Sources: {data.sources.join(" · ")}. Targets assume first-past-the-post: beat the strongest rival by 3 points (between 40% and 55%).</p>
    </section>
  );
}
