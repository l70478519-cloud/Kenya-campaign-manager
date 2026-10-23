import { CAMPAIGN, WARDS } from "@/lib/wards";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Check, Star, TrendingUp, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

// Key opinion leaders with measured, explainable influence (docs/SOCIAL_LISTENING_PLAN.md, KOL-1).

const TIERS = ["micro", "mid", "macro", "mega"] as const;
const STANCES = ["supporter", "neutral", "opponent"] as const;
const PLATFORMS = ["Facebook", "X", "TikTok", "YouTube", "Instagram", "WhatsApp Channel", "Radio programme", "Website/blog", "Other"];
const OFFLINE_ROLES = ["Chief / assistant chief", "Clergy", "Chama leader", "Boda-boda leader", "Market leader", "MCA", "Teacher / head teacher", "Elder", "Youth leader", "Women's group leader", "Business leader", "Other"];

type Component = { key: string; label: string; weight: number; value: number | null; detail: string };
type Score = { score: number; method: "measured" | "override"; components: Component[]; missing: string[]; measured: number; overrideReason?: string; mentions90d: number; mentionsTotal: number };
type Handle = { id: number; platform: string; handle: string; url: string | null; followers: number | null; engagementRate: number | null; figuresAsOf: string | null };
type Kol = {
  id: number; name: string; kind: string | null; role: string | null; platform: string; handle: string | null; tier: string;
  influenceScore: number; followerCount: number; reachEstimate: number | null; alignment: string; ward: string | null; notes: string | null;
  scoreOverride: number | null; overrideReason: string | null; handles: Handle[]; score?: Score;
};
type Detail = Kol & {
  history: { id: number; stance: string; previousStance: string | null; source: string; note: string | null; recordedBy: string | null; recordedAt: string }[];
  mentions: { id: number; summary: string; source: string | null; url: string | null; sentiment: string; role: string; matchedOn: string; scannedAt: string }[];
  authoredSentiment: Record<string, number>;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/kol${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

const input = "w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary";
const label = "text-[10px] font-mono text-muted-foreground";

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    micro: "text-blue-400 border-blue-400/30", mid: "text-yellow-400 border-yellow-400/30",
    macro: "text-orange-400 border-orange-400/30", mega: "text-primary border-primary/30",
  };
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${map[tier] ?? "text-muted-foreground border-border"}`}>[ {tier.toUpperCase()} ]</span>;
}

function StanceBadge({ stance }: { stance: string }) {
  const map: Record<string, string> = { supporter: "text-green-400 border-green-400/30", neutral: "text-yellow-400 border-yellow-400/30", opponent: "text-red-400 border-red-400/30" };
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${map[stance] ?? "text-muted-foreground border-border"}`}>{stance.toUpperCase()}</span>;
}

const reachText = (k: Kol) => {
  if (k.kind === "offline") return k.reachEstimate ? `~${k.reachEstimate.toLocaleString()} people` : "—";
  const max = Math.max(k.followerCount, ...k.handles.map(h => h.followers ?? 0));
  return max ? `${max.toLocaleString()} followers` : "—";
};

function useRefresh() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["kol"] }); };
}

function AddKol({ onDone }: { onDone: () => void }) {
  const refresh = useRefresh();
  const [f, setF] = useState({ kind: "online", name: "", platform: "", handle: "", followerCount: "", engagementRate: "", role: "", reachEstimate: "", ward: "", alignment: "neutral", notes: "", scoreOverride: "", overrideReason: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const save = useMutation({
    mutationFn: () => api<Kol>("", {
      method: "POST",
      body: JSON.stringify({
        name: f.name, kind: f.kind, alignment: f.alignment, ward: f.ward || null, notes: f.notes || null,
        ...(f.kind === "online"
          ? { platform: f.platform || "Other", handle: f.handle || undefined, followerCount: num(f.followerCount), engagementRate: num(f.engagementRate) ?? null }
          : { role: f.role || null, reachEstimate: num(f.reachEstimate) ?? null }),
        ...(f.scoreOverride ? { scoreOverride: Number(f.scoreOverride), overrideReason: f.overrideReason } : {}),
      }),
    }),
    onSuccess: () => { refresh(); onDone(); },
  });
  return (
    <div className="bg-card border border-primary/50 p-4">
      <h3 className="font-mono text-xs tracking-widest mb-3">REGISTER KOL</h3>
      <div className="flex gap-2 mb-3">
        {(["online", "offline"] as const).map(k => (
          <button key={k} type="button" onClick={() => setF(p => ({ ...p, kind: k }))}
            className={`px-3 py-1 border font-mono text-[10px] ${f.kind === k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            {k === "online" ? "ONLINE (SOCIAL ACCOUNTS)" : "OFFLINE (COMMUNITY LEADER)"}
          </button>
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1"><label className={label}>NAME *</label><input required minLength={2} value={f.name} onChange={set("name")} className={input} /></div>
        {f.kind === "online" ? (<>
          <div className="space-y-1"><label className={label}>MAIN PLATFORM</label>
            <select value={f.platform} onChange={set("platform")} className={input}><option value="">— SELECT —</option>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></div>
          <div className="space-y-1"><label className={label}>HANDLE / PAGE NAME</label><input value={f.handle} onChange={set("handle")} placeholder="@handle" className={input} /></div>
          <div className="space-y-1"><label className={label}>FOLLOWERS (AS OF TODAY)</label><input type="number" min="0" value={f.followerCount} onChange={set("followerCount")} className={input} /></div>
          <div className="space-y-1"><label className={label}>ENGAGEMENT RATE %</label><input type="number" min="0" max="100" step="0.1" value={f.engagementRate} onChange={set("engagementRate")} className={input} /></div>
        </>) : (<>
          <div className="space-y-1"><label className={label}>ROLE</label>
            <select value={f.role} onChange={set("role")} className={input}><option value="">— SELECT —</option>{OFFLINE_ROLES.map(r => <option key={r}>{r}</option>)}</select></div>
          <div className="space-y-1"><label className={label}>PEOPLE REACHED (FIELD ESTIMATE)</label><input type="number" min="0" value={f.reachEstimate} onChange={set("reachEstimate")} className={input} /></div>
        </>)}
        <div className="space-y-1"><label className={label}>WARD</label>
          <select value={f.ward} onChange={set("ward")} className={input}><option value="">Not recorded</option><option value="all">Whole area</option>{WARDS.map(w => <option key={w}>{w}</option>)}</select></div>
        <div className="space-y-1"><label className={label}>STANCE TOWARD {(CAMPAIGN.candidate || "CANDIDATE").toUpperCase()}</label>
          <select value={f.alignment} onChange={set("alignment")} className={input}>{STANCES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select></div>
        <div className="space-y-1 sm:col-span-2"><label className={label}>NOTES</label><input value={f.notes} onChange={set("notes")} className={input} /></div>
        <div className="space-y-1"><label className={label}>MANUAL SCORE (OPTIONAL, 0-100)</label><input type="number" min="0" max="100" value={f.scoreOverride} onChange={set("scoreOverride")} className={input} /></div>
        {f.scoreOverride && <div className="space-y-1 sm:col-span-2"><label className={label}>REASON FOR MANUAL SCORE *</label><input required minLength={5} value={f.overrideReason} onChange={set("overrideReason")} className={input} /></div>}
        <div className="sm:col-span-3 flex flex-wrap gap-2 justify-end items-center">
          {save.error && <span className="text-xs text-red-400 mr-auto">{(save.error as Error).message}</span>}
          <button type="button" onClick={onDone} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> CANCEL</button>
          <button type="submit" disabled={save.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Check className="w-3 h-3" /> REGISTER</button>
        </div>
      </form>
    </div>
  );
}

function ScoreBreakdown({ score }: { score: Score }) {
  return (
    <div className="space-y-1.5">
      {score.method === "override" && (
        <p className="text-[11px] text-amber-300">Manual score {score.score} (measured would be {score.measured}). Reason: {score.overrideReason}</p>
      )}
      {score.components.map(c => (
        <div key={c.key} className="text-xs">
          <div className="flex justify-between gap-2">
            <span>{c.label} <span className="text-muted-foreground">({c.weight}%)</span></span>
            <span className="font-mono">{c.value === null ? "not counted" : c.value}</span>
          </div>
          <div className="h-1 bg-secondary"><div className="h-1 bg-primary" style={{ width: `${c.value ?? 0}%` }} /></div>
          <p className="text-[10px] text-muted-foreground">{c.detail}</p>
        </div>
      ))}
      {score.missing.length > 0 && <p className="text-[10px] text-muted-foreground">Left out for lack of data: {score.missing.join(", ")}. The remaining weights are re-balanced.</p>}
    </div>
  );
}

function KolDetail({ id, canWrite }: { id: number; canWrite: boolean }) {
  const refresh = useRefresh();
  const { data, isLoading, error } = useQuery({ queryKey: ["kol", "detail", id], queryFn: () => api<Detail>(`/${id}`) });
  const [h, setH] = useState({ platform: "Facebook", handle: "", followers: "", engagementRate: "" });
  const [st, setSt] = useState({ stance: "neutral", source: "staff", note: "" });
  const addHandle = useMutation({
    mutationFn: () => api(`/${id}/handles`, { method: "POST", body: JSON.stringify({ platform: h.platform, handle: h.handle, followers: h.followers ? Number(h.followers) : null, engagementRate: h.engagementRate ? Number(h.engagementRate) : null }) }),
    onSuccess: () => { setH({ platform: "Facebook", handle: "", followers: "", engagementRate: "" }); refresh(); },
  });
  const removeHandle = useMutation({ mutationFn: (handleId: number) => api(`/${id}/handles/${handleId}`, { method: "DELETE" }), onSuccess: refresh });
  const stance = useMutation({ mutationFn: () => api(`/${id}/stance`, { method: "POST", body: JSON.stringify(st) }), onSuccess: () => { setSt(s => ({ ...s, note: "" })); refresh(); } });

  if (isLoading) return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="p-4 text-xs text-red-400">{(error as Error)?.message ?? "Not found"}</p>;
  const authored = Object.values(data.authoredSentiment).reduce((a, b) => a + b, 0);
  return (
    <div className="p-4 grid gap-4 lg:grid-cols-3 bg-secondary/20">
      <section>
        <h4 className="font-mono text-[10px] tracking-widest text-primary mb-2">HOW THE SCORE IS MADE</h4>
        {data.score && <ScoreBreakdown score={data.score} />}
      </section>
      <section className="space-y-3">
        <div>
          <h4 className="font-mono text-[10px] tracking-widest text-primary mb-2">ACCOUNTS & CHANNELS</h4>
          {!data.handles.length && <p className="text-xs text-muted-foreground">None recorded.</p>}
          <ul className="space-y-1">{data.handles.map(x => (
            <li key={x.id} className="text-xs flex items-start gap-2">
              <span className="flex-1">{x.platform} · {x.handle}{x.followers != null && ` · ${x.followers.toLocaleString()} followers`}{x.engagementRate != null && ` · ${x.engagementRate}% engagement`}
                {x.figuresAsOf && <span className="text-muted-foreground"> (figures as of {new Date(x.figuresAsOf).toLocaleDateString()})</span>}</span>
              {canWrite && <button onClick={() => removeHandle.mutate(x.id)} title="Remove" className="text-muted-foreground hover:text-red-400"><X className="w-3 h-3" /></button>}
            </li>
          ))}</ul>
          {canWrite && (
            <form className="mt-2 grid grid-cols-2 gap-1" onSubmit={e => { e.preventDefault(); addHandle.mutate(); }}>
              <select value={h.platform} onChange={e => setH(p => ({ ...p, platform: e.target.value }))} className={input}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select>
              <input required placeholder="handle" value={h.handle} onChange={e => setH(p => ({ ...p, handle: e.target.value }))} className={input} />
              <input type="number" min="0" placeholder="followers" value={h.followers} onChange={e => setH(p => ({ ...p, followers: e.target.value }))} className={input} />
              <input type="number" min="0" max="100" step="0.1" placeholder="engagement %" value={h.engagementRate} onChange={e => setH(p => ({ ...p, engagementRate: e.target.value }))} className={input} />
              <button type="submit" className="col-span-2 border border-primary text-primary font-mono text-[10px] py-1 hover:bg-primary/10">ADD ACCOUNT</button>
              {addHandle.error && <p className="col-span-2 text-[10px] text-red-400">{(addHandle.error as Error).message}</p>}
            </form>
          )}
        </div>
        <div>
          <h4 className="font-mono text-[10px] tracking-widest text-primary mb-2">LINKED MENTIONS ({data.score?.mentionsTotal ?? 0})</h4>
          {authored > 0 && (
            <p className="text-[10px] text-muted-foreground mb-1">Published by {data.name}: {data.authoredSentiment.positive ?? 0} positive · {data.authoredSentiment.neutral ?? 0} neutral · {data.authoredSentiment.negative ?? 0} negative toward the candidate. Evidence only; stance is set by staff.</p>
          )}
          {!data.mentions.length && <p className="text-xs text-muted-foreground">No mentions linked yet. Mentions are linked by handle or full name.</p>}
          <ul className="space-y-1">{data.mentions.map(m => (
            <li key={m.id} className="text-xs">
              <span className="font-mono text-[10px] text-muted-foreground">{m.role === "author" ? "BY THEM" : "ABOUT THEM"} · {m.sentiment}</span> {m.summary.slice(0, 140)}
              {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex text-primary"><ExternalLink className="w-3 h-3" /></a>}
            </li>
          ))}</ul>
        </div>
      </section>
      <section>
        <h4 className="font-mono text-[10px] tracking-widest text-primary mb-2">STANCE HISTORY</h4>
        {canWrite && (
          <form className="mb-3 grid grid-cols-2 gap-1" onSubmit={e => { e.preventDefault(); stance.mutate(); }}>
            <select value={st.stance} onChange={e => setSt(p => ({ ...p, stance: e.target.value }))} className={input}>{STANCES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select>
            <select value={st.source} onChange={e => setSt(p => ({ ...p, source: e.target.value }))} className={input}><option value="staff">Desk assessment</option><option value="field">Field assessment</option></select>
            <input required minLength={5} placeholder="Why? e.g. spoke at Kilungu baraza in support" value={st.note} onChange={e => setSt(p => ({ ...p, note: e.target.value }))} className={`${input} col-span-2`} />
            <button type="submit" className="col-span-2 border border-primary text-primary font-mono text-[10px] py-1 hover:bg-primary/10">RECORD STANCE</button>
            {stance.error && <p className="col-span-2 text-[10px] text-red-400">{(stance.error as Error).message}</p>}
          </form>
        )}
        <ul className="space-y-2">{data.history.map(x => (
          <li key={x.id} className="text-xs border-l-2 border-border pl-2">
            <div className="flex items-center gap-1">{x.previousStance && <><StanceBadge stance={x.previousStance} /> →</>} <StanceBadge stance={x.stance} /></div>
            <p className="text-[10px] text-muted-foreground">{new Date(x.recordedAt).toLocaleString()} · {x.source === "initial" ? "when added" : x.source === "field" ? "field assessment" : "desk assessment"}{x.recordedBy ? ` · ${x.recordedBy}` : ""}</p>
            {x.note && <p className="text-[11px]">{x.note}</p>}
          </li>
        ))}</ul>
      </section>
    </div>
  );
}

export default function KOL() {
  const { can } = useAuth();
  const canWrite = can("kol", "write");
  const [showAdd, setShowAdd] = useState(false);
  const [viewLeaderboard, setViewLeaderboard] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const { data: kols = [], isLoading, error } = useQuery({ queryKey: ["kol", "list"], queryFn: () => api<Kol[]>("") });
  const { data: weights } = useQuery({ queryKey: ["kol", "weights"], queryFn: () => api<Record<string, number>>("/weights") });
  const list = viewLeaderboard ? kols : [...kols].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-widest">KOL INFLUENCE NETWORK</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-1">PUBLIC OPINION LEADER & COMMUNITY INFLUENCE NETWORK · {CAMPAIGN.areaLabel.toUpperCase()}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewLeaderboard(!viewLeaderboard)} className={`flex items-center gap-2 border px-4 py-2 font-mono text-xs transition-colors ${viewLeaderboard ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            <TrendingUp className="w-3 h-3" /> LEADERBOARD
          </button>
          {canWrite && <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Plus className="w-3 h-3" /> ADD KOL</button>}
        </div>
      </div>

      {weights && (
        <p className="text-[11px] text-muted-foreground border border-border p-2">
          Influence score = {Object.entries(weights).map(([k, w]) => `${k[0].toUpperCase()}${k.slice(1)} ${w}%`).join(" · ")}. Stance is shown separately, so influential opponents rank high too.
          Figures are entered by staff and dated; open a KOL to see how its score is made.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TIERS.map(tier => (
          <div key={tier} className="bg-card border border-border p-3">
            <TierBadge tier={tier} />
            <p className="text-2xl font-bold mt-2">{kols.filter(k => k.tier === tier).length}</p>
            <p className="text-[10px] font-mono text-muted-foreground">KOLs</p>
          </div>
        ))}
      </div>

      {showAdd && <AddKol onDone={() => setShowAdd(false)} />}

      <div className="bg-card border border-border overflow-x-auto">
        {viewLeaderboard && <div className="px-4 py-2 border-b border-border bg-secondary/30"><span className="font-mono text-[10px] text-primary tracking-widest">INFLUENCE LEADERBOARD — RANKED BY SCORE</span></div>}
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="w-6" />
              {viewLeaderboard && <th className="px-4 py-2 text-left font-mono text-[10px] text-muted-foreground">#</th>}
              {["NAME", "CHANNEL", "TIER", "REACH", "SCORE", "STANCE", "WARD", "MENTIONS (90D)"].map(hd => (
                <th key={hd} className="px-4 py-2 text-left font-mono text-[10px] text-muted-foreground tracking-widest">{hd}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ LOADING KOL NETWORK... ]</td></tr>
            ) : error ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-red-400">{(error as Error).message}</td></tr>
            ) : !list.length ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_KOLS_REGISTERED ]</td></tr>
            ) : list.flatMap((k, idx) => [
              <tr key={k.id} onClick={() => setOpen(open === k.id ? null : k.id)} className="hover:bg-secondary/30 transition-colors cursor-pointer">
                <td className="pl-2">{open === k.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</td>
                {viewLeaderboard && <td className="px-4 py-2 font-mono text-muted-foreground">{idx + 1}</td>}
                <td className="px-4 py-2 font-medium">{k.name}{k.kind === "offline" && <span className="block text-[10px] text-muted-foreground">{k.role ?? "Community leader"} (offline)</span>}</td>
                <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{k.kind === "offline" ? "In person" : `${k.platform}${k.handle ? ` · ${k.handle}` : ""}${k.handles.length > 1 ? ` +${k.handles.length - 1}` : ""}`}</td>
                <td className="px-4 py-2"><TierBadge tier={k.tier} /></td>
                <td className="px-4 py-2 font-mono text-muted-foreground">{reachText(k)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3 h-3 text-primary fill-primary" />
                    <span className="font-bold">{k.influenceScore}</span>
                    {k.score?.method === "override" && <span className="font-mono text-[9px] text-amber-300" title={k.overrideReason ?? ""}>MANUAL</span>}
                  </div>
                </td>
                <td className="px-4 py-2"><StanceBadge stance={k.alignment} /></td>
                <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{k.ward === "all" ? "Whole area" : k.ward ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-muted-foreground">{k.score?.mentions90d ?? 0}</td>
              </tr>,
              open === k.id ? <tr key={`${k.id}-detail`}><td colSpan={10}><KolDetail id={k.id} canWrite={canWrite} /></td></tr> : null,
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
