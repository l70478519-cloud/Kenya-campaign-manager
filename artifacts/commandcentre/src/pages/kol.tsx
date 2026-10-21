import { CAMPAIGN } from "@/lib/wards";
import { useState } from "react";
import {
  useListKOLs, useCreateKOL, useUpdateKOL, useGetKOLLeaderboard,
  getListKOLsQueryKey, getGetKOLLeaderboardQueryKey
} from "@workspace/api-client-react";
import type { KOLInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X, Check, Star, TrendingUp } from "lucide-react";

const TIERS = ["micro", "mid", "macro", "mega"] as const;
const ALIGNMENTS = ["supporter", "neutral", "opponent"] as const;
const PLATFORMS = ["Twitter/X", "Facebook", "Instagram", "TikTok", "YouTube", "LinkedIn", "WhatsApp"];

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    micro: "text-blue-400 border-blue-400/30",
    mid: "text-yellow-400 border-yellow-400/30",
    macro: "text-orange-400 border-orange-400/30",
    mega: "text-primary border-primary/30",
  };
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${map[tier] ?? "text-muted-foreground border-border"}`}>[ {tier.toUpperCase()} ]</span>;
}

function AlignmentBadge({ alignment }: { alignment: string }) {
  const map: Record<string, string> = {
    supporter: "text-green-400 border-green-400/30",
    neutral: "text-yellow-400 border-yellow-400/30",
    opponent: "text-red-400 border-red-400/30",
  };
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${map[alignment] ?? "text-muted-foreground border-border"}`}>{alignment.toUpperCase()}</span>;
}

export default function KOL() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [viewLeaderboard, setViewLeaderboard] = useState(false);
  const [form, setForm] = useState<Partial<KOLInput>>({ tier: "micro", alignment: "neutral" });

  const { data: kols, isLoading } = useListKOLs();
  const { data: leaderboard } = useGetKOLLeaderboard();
  const createKOL = useCreateKOL({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListKOLsQueryKey() }); qc.invalidateQueries({ queryKey: getGetKOLLeaderboardQueryKey() }); setShowAdd(false); setForm({ tier: "micro", alignment: "neutral" }); } } });
  const updateKOL = useUpdateKOL({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListKOLsQueryKey() }); qc.invalidateQueries({ queryKey: getGetKOLLeaderboardQueryKey() }); } } });

  const displayList = viewLeaderboard ? leaderboard : kols;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">KOL INFLUENCE NETWORK</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-1">PUBLIC OPINION LEADER & COMMUNITY INFLUENCE NETWORK · {CAMPAIGN.areaLabel.toUpperCase()}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewLeaderboard(!viewLeaderboard)} className={`flex items-center gap-2 border px-4 py-2 font-mono text-xs transition-colors ${viewLeaderboard ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            <TrendingUp className="w-3 h-3" /> LEADERBOARD
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
            <Plus className="w-3 h-3" /> ADD KOL
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {TIERS.map(tier => {
          const count = kols?.filter(k => k.tier === tier).length ?? 0;
          return (
            <div key={tier} className="bg-card border border-border p-3">
              <TierBadge tier={tier} />
              <p className="text-2xl font-bold mt-2">{count}</p>
              <p className="text-[10px] font-mono text-muted-foreground">KOLs</p>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="bg-card border border-primary/50 p-4">
          <h3 className="font-mono text-xs tracking-widest mb-4">REGISTER KOL</h3>
          <form onSubmit={e => { e.preventDefault(); createKOL.mutate({ data: form as KOLInput }); }} className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">NAME *</label>
              <input required value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">PLATFORM *</label>
              <select required value={form.platform ?? ""} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                <option value="">— SELECT —</option>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">HANDLE</label>
              <input value={form.handle ?? ""} onChange={e => setForm(p => ({ ...p, handle: e.target.value }))} placeholder="@handle" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">TIER *</label>
              <select required value={form.tier ?? "micro"} onChange={e => setForm(p => ({ ...p, tier: e.target.value as any }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                {TIERS.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">ALIGNMENT *</label>
              <select required value={form.alignment ?? "neutral"} onChange={e => setForm(p => ({ ...p, alignment: e.target.value as any }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                {ALIGNMENTS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">FOLLOWERS *</label>
              <input required type="number" value={form.followerCount ?? ""} onChange={e => setForm(p => ({ ...p, followerCount: Number(e.target.value) }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">INFLUENCE SCORE (0-100)</label>
              <input type="number" min="0" max="100" value={form.influenceScore ?? ""} onChange={e => setForm(p => ({ ...p, influenceScore: Number(e.target.value) }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">WARD</label>
              <input value={form.ward ?? ""} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">NOTES</label>
              <input value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-3 flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowAdd(false); setForm({ tier: "micro", alignment: "neutral" }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
              <button type="submit" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Check className="w-3 h-3" /> REGISTER</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card border border-border overflow-hidden">
        {viewLeaderboard && <div className="px-4 py-2 border-b border-border bg-secondary/30"><span className="font-mono text-[10px] text-primary tracking-widest">INFLUENCE LEADERBOARD — RANKED BY SCORE</span></div>}
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {viewLeaderboard && <th className="px-4 py-2 text-left font-mono text-[10px] text-muted-foreground">#</th>}
              {["NAME", "PLATFORM", "HANDLE", "TIER", "FOLLOWERS", "SCORE", "ALIGNMENT", "WARD"].map(h => (
                <th key={h} className="px-4 py-2 text-left font-mono text-[10px] text-muted-foreground tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ LOADING KOL NETWORK... ]</td></tr>
            ) : !displayList || displayList.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_KOLS_REGISTERED ]</td></tr>
            ) : displayList.map((k, idx) => (
              <tr key={k.id} className="hover:bg-secondary/30 transition-colors">
                {viewLeaderboard && <td className="px-4 py-2 font-mono text-muted-foreground">{idx + 1}</td>}
                <td className="px-4 py-2 font-medium">{k.name}</td>
                <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{k.platform}</td>
                <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{k.handle ? `@${k.handle}` : "—"}</td>
                <td className="px-4 py-2"><TierBadge tier={k.tier} /></td>
                <td className="px-4 py-2 font-mono text-muted-foreground">{k.followerCount.toLocaleString()}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3 h-3 text-primary fill-primary" />
                    <span className="font-bold">{k.influenceScore}</span>
                  </div>
                </td>
                <td className="px-4 py-2"><AlignmentBadge alignment={k.alignment} /></td>
                <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{k.ward ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}