import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useState, useEffect, useRef } from "react";
import {
  useGetFundraisingSummary,
  useListFundraisingCampaigns,
  useCreateFundraisingCampaign,
  useUpdateFundraisingCampaign,
  useDeleteFundraisingCampaign,
  useListDonations,
  useCreateDonation,
  useDeleteDonation,
  useReconcileDonation,
  useListDonors,
  useCreateDonor,
  useDeleteDonor,
  useListPledges,
  useCreatePledge,
  useUpdatePledge,
  useDeletePledge,
  useGetFundraisingPipeline,
  useGetFundraisingReconciliation,
  useGetFundraisingInsights,
  getGetFundraisingSummaryQueryKey,
  getListFundraisingCampaignsQueryKey,
  getListDonationsQueryKey,
  getListDonorsQueryKey,
  getListPledgesQueryKey,
  getGetFundraisingPipelineQueryKey,
  getGetFundraisingReconciliationQueryKey,
  getGetFundraisingInsightsQueryKey,
} from "@workspace/api-client-react";
import type {
  FundraisingCampaign,
  FundraisingCampaignInput,
  Donation,
  DonationInput,
  Donor,
  DonorInput,
  Pledge,
  PledgeInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Trash2, Banknote, Target, Users, TrendingUp,
  Search, Building, Globe, ChevronRight, CheckCircle, Clock,
  AlertTriangle, BarChart2, Lightbulb, Settings, RefreshCw, Smartphone,
} from "lucide-react";

type Tab = "donors" | "donations" | "campaigns" | "pledges" | "pipeline" | "insights" | "reconciliation" | "gateway" | "setup";

const BASE = import.meta.env.BASE_URL;

const CHANNELS = ["cash", "mpesa", "bank", "cheque", "online"] as const;

function fmt(n: number | null | undefined) { return `KES ${(n ?? 0).toLocaleString()}`; }
function pct(a: number, b: number) { if (!b) return 0; return Math.min(100, Math.round((a / b) * 100)); }

const channelColor: Record<string, string> = {
  mpesa: "text-green-400", cash: "text-yellow-400",
  bank: "text-blue-400", cheque: "text-purple-400", online: "text-cyan-400",
};

const tierColor: Record<string, string> = {
  major: "text-yellow-400 border-yellow-400/30",
  regular: "text-blue-400 border-blue-400/30",
  grassroots: "text-green-400 border-green-400/30",
};

const pledgeStatusColor: Record<string, string> = {
  pending: "text-yellow-400 border-yellow-400/30",
  fulfilled: "text-green-400 border-green-400/30",
  defaulted: "text-red-400 border-red-400/30",
  partial: "text-blue-400 border-blue-400/30",
};

const insightTypeStyle: Record<string, string> = {
  success: "border-green-500/30 bg-green-500/5 text-green-400",
  info: "border-blue-500/30 bg-blue-500/5 text-blue-400",
  warning: "border-yellow-500/30 bg-yellow-500/5 text-yellow-400",
  danger: "border-red-500/30 bg-red-500/5 text-red-400",
};

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${style}`}>
      [ {label} ]
    </span>
  );
}

function ProgressBar({ value, color = "bg-primary" }: { value: number; color?: string }) {
  return (
    <div className="w-full h-1.5 bg-secondary border border-border">
      <div className={`h-full ${color} transition-all`} style={{ width: `${value}%` }} />
    </div>
  );
}

function Input({ label, required, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-mono text-muted-foreground tracking-widest">{label}{required && " *"}</label>
      <input required={required} {...props} className={`w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary ${props.className ?? ""}`} />
    </div>
  );
}

function Select({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-mono text-muted-foreground tracking-widest">{label}</label>
      <select {...props} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
        {children}
      </select>
    </div>
  );
}

// ── DONORS TAB ──────────────────────────────────────────────────────────────
function DonorsTab({ campaigns }: { campaigns: FundraisingCampaign[] }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Partial<DonorInput>>({ type: "individual", tier: "regular" });
  const [selected, setSelected] = useState<Donor | null>(null);

  const { data: donors, isLoading } = useListDonors({ search: search || undefined, tier: tierFilter || undefined });
  const { data: donorDonations } = useListDonations({ donorId: selected?.id });

  const createDonor = useCreateDonor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListDonorsQueryKey({}) });
        qc.invalidateQueries({ queryKey: getGetFundraisingSummaryQueryKey() });
        setShowAdd(false);
        setForm({ type: "individual", tier: "regular" });
      },
    },
  });

  const deleteDonor = useDeleteDonor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListDonorsQueryKey({}) });
        qc.invalidateQueries({ queryKey: getGetFundraisingSummaryQueryKey() });
        setSelected(null);
      },
    },
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <div className="col-span-2 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search donors…"
              className="w-full bg-secondary border border-border pl-8 pr-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={() => setShowAdd(p => !p)}
            className="flex items-center gap-1.5 bg-primary text-white font-mono text-[10px] tracking-widest px-3 py-2 hover:bg-primary/90 whitespace-nowrap"
          >
            <Plus className="w-3 h-3" /> ADD DONOR
          </button>
        </div>

        <div className="flex gap-2">
          {["", "major", "regular", "grassroots"].map(t => (
            <button key={t} onClick={() => setTierFilter(t)} className={`font-mono text-[10px] px-2 py-1 border ${tierFilter === t && t ? "border-primary text-primary" : !t && !tierFilter ? "border-primary text-primary" : `${tierColor[t] ?? "border-border text-muted-foreground"}`}`}>
              {t ? t.toUpperCase() : "ALL"}
            </button>
          ))}
        </div>

        {showAdd && (
          <form onSubmit={e => { e.preventDefault(); createDonor.mutate({ data: form as DonorInput }); }} className="bg-card border border-primary/40 p-4 space-y-3">
            <div className="font-mono text-[10px] text-muted-foreground tracking-widest mb-1">NEW DONOR</div>
            <Input label="FULL NAME" required placeholder="Hon. James Mutua" value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="PHONE" placeholder="0712 345 678" value={form.phone ?? ""} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              <Input label="EMAIL" type="email" placeholder="donor@email.com" value={form.email ?? ""} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select label="WARD" value={form.ward ?? ""} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))}>
                <option value="">— Ward —</option>
                {WARDS.map(w => <option key={w}>{w}</option>)}
              </Select>
              <Select label="TYPE" value={form.type ?? "individual"} onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))}>
                <option value="individual">Individual</option>
                <option value="business">Business</option>
                <option value="diaspora">Diaspora</option>
                <option value="organization">Organization</option>
              </Select>
              <Select label="TIER" value={form.tier ?? "regular"} onChange={e => setForm(p => ({ ...p, tier: e.target.value as any }))}>
                <option value="major">Major</option>
                <option value="regular">Regular</option>
                <option value="grassroots">Grassroots</option>
              </Select>
            </div>
            <Input label="NOTES" placeholder="Key relationship notes" value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            <Input label="TAGS" placeholder="elder, businessman, diaspora-nairobi" value={form.tags ?? ""} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} />
            <div className="flex gap-2">
              <button type="submit" disabled={createDonor.isPending} className="bg-primary text-white font-mono text-[10px] tracking-widest px-4 py-2 hover:bg-primary/90 disabled:opacity-50">SAVE</button>
              <button type="button" onClick={() => setShowAdd(false)} className="border border-border font-mono text-[10px] px-4 py-2 text-muted-foreground hover:text-foreground">CANCEL</button>
            </div>
          </form>
        )}

        {isLoading && <div className="font-mono text-xs text-muted-foreground animate-pulse p-4 bg-card border border-border">LOADING...</div>}
        <div className="space-y-1">
          {(donors ?? []).map(d => (
            <div key={d.id} onClick={() => setSelected(selected?.id === d.id ? null : d)} className={`bg-card border p-3 cursor-pointer transition-colors ${selected?.id === d.id ? "border-primary" : "border-border hover:border-primary/50"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-xs">{d.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{d.ward ?? "—"} · {d.phone ?? "—"}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge label={d.tier.toUpperCase()} style={tierColor[d.tier] ?? "border-border text-muted-foreground"} />
                  <span className="font-mono text-[10px] text-primary font-bold">{fmt(d.totalGiven)}</span>
                </div>
              </div>
              {d.tags && <div className="font-mono text-[10px] text-muted-foreground mt-1 truncate">{d.tags}</div>}
            </div>
          ))}
          {!isLoading && (donors ?? []).length === 0 && (
            <div className="p-6 text-center font-mono text-xs text-muted-foreground bg-card border border-border">NO DONORS FOUND</div>
          )}
        </div>
      </div>

      <div className="col-span-3">
        {selected ? (
          <div className="space-y-4">
            <div className="bg-card border border-primary/30 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-base font-bold">{selected.name}</h2>
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{selected.type.toUpperCase()} · {selected.ward ?? "No ward"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge label={selected.tier.toUpperCase()} style={tierColor[selected.tier] ?? "border-border text-muted-foreground"} />
                  <button onClick={() => { if (confirm("Delete this donor?")) deleteDonor.mutate({ id: selected.id }); }} className="text-muted-foreground hover:text-primary ml-2">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary border border-border p-3">
                  <div className="font-mono text-[10px] text-muted-foreground">TOTAL GIVEN</div>
                  <div className="text-xl font-bold text-primary">{fmt(selected.totalGiven)}</div>
                </div>
                {selected.phone && <div className="bg-secondary border border-border p-3"><div className="font-mono text-[10px] text-muted-foreground">PHONE</div><div className="font-mono text-sm">{selected.phone}</div></div>}
                {selected.email && <div className="bg-secondary border border-border p-3"><div className="font-mono text-[10px] text-muted-foreground">EMAIL</div><div className="font-mono text-xs">{selected.email}</div></div>}
              </div>
              {selected.notes && <div className="mt-3 font-mono text-xs text-muted-foreground border-t border-border pt-3">{selected.notes}</div>}
            </div>

            <div>
              <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">DONATION HISTORY</div>
              <div className="border border-border bg-card divide-y divide-border max-h-80 overflow-y-auto">
                {(donorDonations ?? []).length === 0 && <div className="p-4 text-center font-mono text-xs text-muted-foreground">NO DONATIONS RECORDED</div>}
                {(donorDonations ?? []).map(d => (
                  <div key={d.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className={`font-mono text-[10px] font-bold ${channelColor[d.channel] ?? ""}`}>{d.channel.toUpperCase()}</div>
                      {d.reference && <div className="font-mono text-[9px] text-muted-foreground">{d.reference}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-bold font-mono text-primary">{fmt(d.amount)}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{new Date(d.receivedAt).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-border bg-card p-8 text-center font-mono text-xs text-muted-foreground">
            SELECT A DONOR TO VIEW PROFILE &amp; HISTORY
          </div>
        )}
      </div>
    </div>
  );
}

// ── DONATIONS TAB ───────────────────────────────────────────────────────────
function DonationsTab({ campaigns, donors }: { campaigns: FundraisingCampaign[]; donors: Donor[] }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Partial<DonationInput>>({ channel: "mpesa" });
  const [channelFilter, setChannelFilter] = useState("");
  const [donorSearch, setDonorSearch] = useState("");

  const { data: donations, isLoading } = useListDonations({});

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListDonationsQueryKey({}) });
    qc.invalidateQueries({ queryKey: getGetFundraisingSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListFundraisingCampaignsQueryKey() });
    qc.invalidateQueries({ queryKey: getListDonorsQueryKey({}) });
  };

  const createDonation = useCreateDonation({
    mutation: {
      onSuccess: () => { invalidateAll(); setShowAdd(false); setForm({ channel: "mpesa" }); },
    },
  });

  const deleteDonation = useDeleteDonation({ mutation: { onSuccess: invalidateAll } });

  const filtered = (donations ?? []).filter(d =>
    (!channelFilter || d.channel === channelFilter) &&
    (!donorSearch || d.donorName.toLowerCase().includes(donorSearch.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={donorSearch} onChange={e => setDonorSearch(e.target.value)} placeholder="Search donor…" className="bg-secondary border border-border pl-8 pr-3 py-1.5 font-mono text-xs focus:outline-none focus:border-primary w-48" />
          </div>
          <div className="flex gap-1">
            {["", ...CHANNELS].map(ch => (
              <button key={ch} onClick={() => setChannelFilter(ch)} className={`font-mono text-[10px] px-2 py-1 border ${channelFilter === ch && ch ? `${channelColor[ch] ?? ""} border-current` : !ch && !channelFilter ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                {ch ? ch.toUpperCase() : "ALL"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowAdd(p => !p)} className="flex items-center gap-1.5 bg-primary text-white font-mono text-[10px] tracking-widest px-3 py-2 hover:bg-primary/90">
          <Plus className="w-3 h-3" /> RECORD DONATION
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border border-primary/40 p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="font-mono text-[10px] text-muted-foreground tracking-widest">RECORD DONATION</div>
            <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <form onSubmit={e => { e.preventDefault(); createDonation.mutate({ data: form as DonationInput }); }} className="grid grid-cols-3 gap-3">
            <Input label="DONOR NAME" required placeholder="Hon. James Mutua" value={form.donorName ?? ""} onChange={e => setForm(p => ({ ...p, donorName: e.target.value }))} />
            <Input label="AMOUNT (KES)" required type="number" min={1} placeholder="50000" value={form.amount ?? ""} onChange={e => setForm(p => ({ ...p, amount: parseInt(e.target.value) }))} />
            <Select label="CHANNEL" value={form.channel ?? "mpesa"} onChange={e => setForm(p => ({ ...p, channel: e.target.value as any }))}>
              {CHANNELS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </Select>
            <Select label="CAMPAIGN" value={form.campaignId ?? ""} onChange={e => setForm(p => ({ ...p, campaignId: e.target.value ? parseInt(e.target.value) : undefined }))}>
              <option value="">— General Fund —</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="DONOR PROFILE" value={form.donorId ?? ""} onChange={e => setForm(p => ({ ...p, donorId: e.target.value ? parseInt(e.target.value) : undefined }))}>
              <option value="">— Unlinked —</option>
              {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Select label="WARD" value={form.ward ?? ""} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))}>
              <option value="">— Ward —</option>
              {WARDS.map(w => <option key={w}>{w}</option>)}
            </Select>
            <Input label="REFERENCE / M-PESA CODE" placeholder="QGT7X3KP0N" value={form.reference ?? ""} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} />
            <div className="col-span-2">
              <Input label="NOTES" placeholder="Diaspora fundraiser dinner pledge" value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="font-mono text-xs border border-border px-4 py-2 text-muted-foreground hover:text-foreground">CANCEL</button>
              <button type="submit" disabled={createDonation.isPending} className="bg-primary text-white font-mono text-xs px-4 py-2 hover:bg-primary/90 disabled:opacity-50">
                {createDonation.isPending ? "RECORDING..." : "RECORD DONATION"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card border border-border">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border bg-secondary/50 font-mono text-[10px] text-muted-foreground">
          <div className="col-span-3">DONOR</div>
          <div className="col-span-2">AMOUNT</div>
          <div className="col-span-2">CHANNEL</div>
          <div className="col-span-2">WARD</div>
          <div className="col-span-2">DATE</div>
          <div className="col-span-1" />
        </div>
        {isLoading && <div className="px-4 py-8 text-center font-mono text-[10px] text-muted-foreground animate-pulse">LOADING...</div>}
        {!isLoading && filtered.length === 0 && <div className="px-4 py-8 text-center font-mono text-[10px] text-muted-foreground">NO DONATIONS</div>}
        <div className="divide-y divide-border max-h-[460px] overflow-y-auto">
          {filtered.map(d => (
            <div key={d.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 hover:bg-secondary/30 group items-center">
              <div className="col-span-3">
                <div className="font-mono text-xs truncate">{d.donorName}</div>
                {d.reference && <div className="font-mono text-[9px] text-muted-foreground">{d.reference}</div>}
              </div>
              <div className="col-span-2 font-mono text-xs text-primary font-bold">{fmt(d.amount)}</div>
              <div className="col-span-2 font-mono text-[10px] font-bold uppercase">
                <span className={channelColor[d.channel] ?? "text-foreground"}>{d.channel}</span>
              </div>
              <div className="col-span-2 font-mono text-[10px] text-muted-foreground">{d.ward ?? "—"}</div>
              <div className="col-span-2 font-mono text-[10px] text-muted-foreground">
                {new Date(d.receivedAt).toLocaleDateString("en-KE", { day: "2-digit", month: "short" })}
              </div>
              <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100">
                <button onClick={() => { if (confirm("Remove?")) deleteDonation.mutate({ id: d.id }); }} className="text-muted-foreground hover:text-primary">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="font-mono text-[10px] text-muted-foreground">{filtered.length} of {(donations ?? []).length} donations</div>
    </div>
  );
}

// ── CAMPAIGNS TAB ───────────────────────────────────────────────────────────
function CampaignsTab({ campaigns, isLoading }: { campaigns: FundraisingCampaign[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Partial<FundraisingCampaignInput>>({});

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getGetFundraisingSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListFundraisingCampaignsQueryKey() });
  };

  const createCampaign = useCreateFundraisingCampaign({ mutation: { onSuccess: () => { invalidateAll(); setShowAdd(false); setForm({}); } } });
  const updateCampaign = useUpdateFundraisingCampaign({ mutation: { onSuccess: invalidateAll } });
  const deleteCampaign = useDeleteFundraisingCampaign({ mutation: { onSuccess: invalidateAll } });

  const statusColor: Record<string, string> = {
    active: "text-green-400 border-green-400/30",
    completed: "text-blue-400 border-blue-400/30",
    paused: "text-yellow-400 border-yellow-400/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="font-mono text-[10px] text-muted-foreground">{campaigns.length} CAMPAIGNS TOTAL</div>
        <button onClick={() => setShowAdd(p => !p)} className="flex items-center gap-1.5 bg-primary text-white font-mono text-[10px] tracking-widest px-3 py-2 hover:bg-primary/90">
          <Plus className="w-3 h-3" /> NEW CAMPAIGN
        </button>
      </div>

      {showAdd && (
        <form onSubmit={e => { e.preventDefault(); createCampaign.mutate({ data: form as FundraisingCampaignInput }); }} className="bg-card border border-primary/40 p-4 space-y-3">
          <div className="font-mono text-[10px] text-muted-foreground tracking-widest">CREATE CAMPAIGN</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="CAMPAIGN NAME" required placeholder="Nairobi Diaspora Fundraiser" value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <Input label="TARGET (KES)" type="number" min={0} placeholder="500000" value={form.goalAmount ?? ""} onChange={e => setForm(p => ({ ...p, goalAmount: parseInt(e.target.value) }))} />
            <Input label="DESCRIPTION" placeholder="Brief objective" value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <Input label="START DATE" type="date" value={form.startDate ?? ""} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            <Input label="END DATE" type="date" value={form.endDate ?? ""} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createCampaign.isPending} className="bg-primary text-white font-mono text-[10px] tracking-widest px-4 py-2 hover:bg-primary/90 disabled:opacity-50">CREATE</button>
            <button type="button" onClick={() => setShowAdd(false)} className="border border-border font-mono text-[10px] px-4 py-2 text-muted-foreground hover:text-foreground">CANCEL</button>
          </div>
        </form>
      )}

      {isLoading && <div className="font-mono text-xs text-muted-foreground animate-pulse">LOADING...</div>}

      <div className="grid grid-cols-2 gap-3">
        {campaigns.map(c => {
          const progress = pct(c.raisedAmount, c.goalAmount);
          const progressColor = progress >= 80 ? "bg-green-500" : progress >= 40 ? "bg-primary" : "bg-yellow-500";
          return (
            <div key={c.id} className="bg-card border border-border p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="font-bold text-sm truncate">{c.name}</div>
                  {c.description && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{c.description}</div>}
                </div>
                <Badge label={c.status.toUpperCase()} style={statusColor[c.status] ?? "border-border text-muted-foreground"} />
              </div>
              <div>
                <ProgressBar value={progress} color={progressColor} />
                <div className="flex justify-between mt-1.5">
                  <span className="font-mono text-[10px] text-primary font-bold">{fmt(c.raisedAmount)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{progress}% of {fmt(c.goalAmount)}</span>
                </div>
              </div>
              {(c.startDate || c.endDate) && (
                <div className="font-mono text-[10px] text-muted-foreground">{c.startDate ?? "—"} → {c.endDate ?? "ongoing"}</div>
              )}
              <div className="flex gap-2 border-t border-border pt-2">
                {c.status === "active" && <>
                  <button onClick={() => updateCampaign.mutate({ id: c.id, data: { status: "completed" } })} className="font-mono text-[10px] border border-border px-2 py-1 hover:border-green-400 hover:text-green-400">COMPLETE</button>
                  <button onClick={() => updateCampaign.mutate({ id: c.id, data: { status: "paused" } })} className="font-mono text-[10px] border border-border px-2 py-1 hover:border-yellow-400 hover:text-yellow-400">PAUSE</button>
                </>}
                {c.status === "paused" && <button onClick={() => updateCampaign.mutate({ id: c.id, data: { status: "active" } })} className="font-mono text-[10px] border border-border px-2 py-1 hover:border-green-400 hover:text-green-400">RESUME</button>}
                <button onClick={() => { if (confirm("Delete?")) deleteCampaign.mutate({ id: c.id }); }} className="ml-auto text-muted-foreground hover:text-primary"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PLEDGES TAB ─────────────────────────────────────────────────────────────
function PledgesTab({ campaigns }: { campaigns: FundraisingCampaign[] }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<Partial<PledgeInput>>({});

  const { data: pledges, isLoading } = useListPledges({ status: statusFilter || undefined });
  const { data: donors } = useListDonors({});

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListPledgesQueryKey({}) });
    qc.invalidateQueries({ queryKey: getGetFundraisingSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFundraisingPipelineQueryKey() });
  };

  const createPledge = useCreatePledge({ mutation: { onSuccess: () => { invalidateAll(); setShowAdd(false); setForm({}); } } });
  const updatePledge = useUpdatePledge({ mutation: { onSuccess: invalidateAll } });
  const deletePledge = useDeletePledge({ mutation: { onSuccess: invalidateAll } });

  const totals = {
    pending: (pledges ?? []).filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0),
    fulfilled: (pledges ?? []).filter(p => p.status === "fulfilled").reduce((s, p) => s + p.amount, 0),
    defaulted: (pledges ?? []).filter(p => p.status === "defaulted").reduce((s, p) => s + p.amount, 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "PENDING", amount: totals.pending, status: "pending", color: "border-yellow-500/30 text-yellow-400" },
          { label: "FULFILLED", amount: totals.fulfilled, status: "fulfilled", color: "border-green-500/30 text-green-400" },
          { label: "DEFAULTED", amount: totals.defaulted, status: "defaulted", color: "border-red-500/30 text-red-400" },
        ].map(t => (
          <div key={t.status} onClick={() => setStatusFilter(statusFilter === t.status ? "" : t.status)} className={`bg-card border p-4 cursor-pointer transition-colors ${statusFilter === t.status ? "border-primary" : "border-border hover:border-primary/40"}`}>
            <div className={`font-mono text-[10px] mb-1 tracking-widest ${t.color.split(" ")[1]}`}>{t.label}</div>
            <div className="text-xl font-bold">{fmt(t.amount)}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{(pledges ?? []).filter(p => p.status === t.status).length} pledges</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <div className="font-mono text-[10px] text-muted-foreground">{(pledges ?? []).length} pledges{statusFilter ? ` · ${statusFilter.toUpperCase()}` : ""}</div>
        <button onClick={() => setShowAdd(p => !p)} className="flex items-center gap-1.5 bg-primary text-white font-mono text-[10px] tracking-widest px-3 py-2 hover:bg-primary/90">
          <Plus className="w-3 h-3" /> RECORD PLEDGE
        </button>
      </div>

      {showAdd && (
        <form onSubmit={e => { e.preventDefault(); createPledge.mutate({ data: form as PledgeInput }); }} className="bg-card border border-primary/40 p-4 space-y-3">
          <div className="font-mono text-[10px] text-muted-foreground tracking-widest">NEW PLEDGE</div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="DONOR NAME" required placeholder="Hon. James Mutua" value={form.donorName ?? ""} onChange={e => setForm(p => ({ ...p, donorName: e.target.value }))} />
            <Input label="AMOUNT (KES)" required type="number" min={1} placeholder="100000" value={form.amount ?? ""} onChange={e => setForm(p => ({ ...p, amount: parseInt(e.target.value) }))} />
            <Input label="PROMISED DATE" type="date" value={form.promisedDate ?? ""} onChange={e => setForm(p => ({ ...p, promisedDate: e.target.value }))} />
            <Select label="CAMPAIGN" value={form.campaignId ?? ""} onChange={e => setForm(p => ({ ...p, campaignId: e.target.value ? parseInt(e.target.value) : undefined }))}>
              <option value="">— General —</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="CHANNEL" value={form.channel ?? ""} onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}>
              <option value="">— Channel —</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </Select>
            <Input label="NOTES" placeholder="Commitment details" value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createPledge.isPending} className="bg-primary text-white font-mono text-[10px] tracking-widest px-4 py-2 hover:bg-primary/90 disabled:opacity-50">SAVE PLEDGE</button>
            <button type="button" onClick={() => setShowAdd(false)} className="border border-border font-mono text-[10px] px-4 py-2 text-muted-foreground">CANCEL</button>
          </div>
        </form>
      )}

      {isLoading && <div className="font-mono text-xs text-muted-foreground animate-pulse">LOADING...</div>}

      <div className="border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-card border-b border-border">
            <tr className="font-mono text-[10px] text-muted-foreground">
              <th className="text-left px-4 py-2">DONOR</th>
              <th className="text-right px-4 py-2">AMOUNT</th>
              <th className="text-left px-4 py-2">CAMPAIGN</th>
              <th className="text-left px-4 py-2">PROMISED</th>
              <th className="text-left px-4 py-2">STATUS</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(pledges ?? []).map(p => {
              const camp = campaigns.find(c => c.id === p.campaignId);
              return (
                <tr key={p.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-2.5 font-semibold">{p.donorName}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-primary">{fmt(p.amount)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[150px]">{camp?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{p.promisedDate ?? "—"}</td>
                  <td className="px-4 py-2.5"><Badge label={p.status.toUpperCase()} style={pledgeStatusColor[p.status] ?? "border-border text-muted-foreground"} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {p.status === "pending" && (
                        <button onClick={() => updatePledge.mutate({ id: p.id, data: { status: "fulfilled", fulfilledDate: new Date().toISOString().split("T")[0] } })} className="font-mono text-[9px] text-green-400 border border-green-400/30 px-1.5 py-0.5 hover:bg-green-400/10">FULFILL</button>
                      )}
                      {p.status === "pending" && (
                        <button onClick={() => updatePledge.mutate({ id: p.id, data: { status: "defaulted" } })} className="font-mono text-[9px] text-red-400 border border-red-400/30 px-1.5 py-0.5 hover:bg-red-400/10">DEFAULT</button>
                      )}
                      <button onClick={() => { if (confirm("Delete pledge?")) deletePledge.mutate({ id: p.id }); }} className="text-muted-foreground hover:text-primary ml-1"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && (pledges ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">NO PLEDGES RECORDED</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── PIPELINE TAB ────────────────────────────────────────────────────────────
function PipelineTab() {
  const { data: pipeline, isLoading } = useGetFundraisingPipeline();

  if (isLoading) return <div className="font-mono text-xs text-muted-foreground animate-pulse p-4">LOADING PIPELINE...</div>;
  if (!pipeline) return null;

  const db = pipeline.donorBreakdown;
  const totalDonors = Number(db.major) + Number(db.regular) + Number(db.grassroots);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "MAJOR DONORS", count: Number(db.major), desc: "KES 50k+ contributors", color: "text-yellow-400", bar: "bg-yellow-400" },
          { label: "REGULAR", count: Number(db.regular), desc: "KES 5k–50k contributors", color: "text-blue-400", bar: "bg-blue-400" },
          { label: "GRASSROOTS", count: Number(db.grassroots), desc: "Under KES 5k", color: "text-green-400", bar: "bg-green-400" },
        ].map(t => (
          <div key={t.label} className="bg-card border border-border p-4">
            <div className={`font-mono text-[10px] tracking-widest mb-1 ${t.color}`}>{t.label}</div>
            <div className="text-2xl font-bold">{t.count}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{t.desc}</div>
            <div className="w-full h-1 bg-secondary mt-3">
              <div className={`h-full ${t.bar}`} style={{ width: `${totalDonors > 0 ? pct(t.count, totalDonors) : 0}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border p-4">
          <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">TOP DONORS</div>
          <div className="space-y-2">
            {pipeline.topDonors.slice(0, 8).map((d, i) => (
              <div key={d.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground w-4">{i + 1}.</span>
                  <div>
                    <div className="text-xs font-semibold">{d.name}</div>
                    <div className="font-mono text-[9px] text-muted-foreground">{d.ward ?? "—"} · {d.type}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-primary font-bold">{fmt(d.totalGiven)}</div>
                  <Badge label={d.tier.toUpperCase()} style={tierColor[d.tier] ?? "border-border text-muted-foreground"} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border p-4">
            <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">GIVING BY WARD</div>
            {pipeline.wardBreakdown.map(w => (
              <div key={w.ward} className="space-y-1 mb-2">
                <div className="flex justify-between text-xs">
                  <span>{w.ward}</span>
                  <span className="font-mono text-primary font-bold">{fmt(Number(w.total))}</span>
                </div>
                <div className="w-full h-1 bg-secondary">
                  <div className="h-full bg-primary" style={{ width: `${pct(Number(w.total), pipeline.wardBreakdown.reduce((s, x) => s + Number(x.total), 0))}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border p-4">
            <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">MONTHLY TREND</div>
            <div className="space-y-1.5">
              {pipeline.monthlyTrend.slice(-6).map(m => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground w-14">{m.month}</span>
                  <div className="flex-1 h-1.5 bg-secondary">
                    <div className="h-full bg-primary" style={{ width: `${pct(Number(m.total), Math.max(...pipeline.monthlyTrend.map(x => Number(x.total))))}%` }} />
                  </div>
                  <span className="font-mono text-[10px] w-20 text-right">{fmt(Number(m.total))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {pipeline.pendingPledges.length > 0 && (
        <div className="bg-card border border-yellow-500/20 p-4">
          <div className="font-mono text-[10px] text-yellow-400 mb-3 tracking-widest">◆ PENDING PLEDGES — CONVERSION PRIORITY</div>
          <div className="space-y-2">
            {pipeline.pendingPledges.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs border-b border-border/50 pb-1">
                <span className="font-semibold">{p.donorName}</span>
                <div className="flex items-center gap-4">
                  {p.promisedDate && <span className="font-mono text-[10px] text-muted-foreground">Due: {p.promisedDate}</span>}
                  <span className="font-mono font-bold text-primary">{fmt(p.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI INSIGHTS TAB ─────────────────────────────────────────────────────────
function InsightsTab() {
  const { data: insights, isLoading, refetch, isFetching } = useGetFundraisingInsights();

  if (isLoading) return <div className="font-mono text-xs text-muted-foreground animate-pulse p-4">LOADING INSIGHTS...</div>;
  if (!insights) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="font-mono text-[10px] text-muted-foreground tracking-widest">◆ AI FINANCE INTELLIGENCE — COMPUTED FROM LIVE DATA</div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 font-mono text-[10px] border border-border px-3 py-1.5 hover:border-primary hover:text-primary">
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> REFRESH
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "TOTAL RAISED", value: fmt(insights.raised) },
          { label: "ACTIVE TARGET", value: fmt(insights.goal) },
          { label: "GOAL PROGRESS", value: `${insights.pct}%` },
          { label: "PENDING PLEDGES", value: fmt(insights.pledgePending) },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border p-4">
            <div className="font-mono text-[10px] text-muted-foreground mb-1 tracking-widest">{m.label}</div>
            <div className="text-xl font-bold">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {insights.insights.map((ins, i) => (
          <div key={i} className={`border p-4 ${insightTypeStyle[ins.type] ?? "border-border"}`}>
            <div className="flex items-start gap-3">
              <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-bold text-sm">{ins.title}</div>
                <div className="text-xs mt-1 text-foreground/80">{ins.body}</div>
                <div className="font-mono text-[10px] mt-2 opacity-80">◆ ACTION: {ins.action}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border p-4">
        <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">CAMPAIGN HEALTH OVERVIEW</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Fundraising Gap</span>
            <span className="font-mono font-bold text-red-400">{fmt(insights.gap)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Registered Donors</span>
            <span className="font-mono font-bold">{insights.donorCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Pledge Conversion Rate</span>
            <span className="font-mono font-bold">{insights.pledgePending > 0 ? Math.round((insights.raised / (insights.raised + insights.pledgePending)) * 100) : 100}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RECONCILIATION TAB ──────────────────────────────────────────────────────
function ReconciliationTab() {
  const qc = useQueryClient();
  const { data: recon, isLoading } = useGetFundraisingReconciliation();
  const reconcile = useReconcileDonation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFundraisingReconciliationQueryKey() });
        qc.invalidateQueries({ queryKey: getListDonationsQueryKey({}) });
      },
    },
  });

  if (isLoading) return <div className="font-mono text-xs text-muted-foreground animate-pulse p-4">LOADING...</div>;
  if (!recon) return null;

  const reconPct = pct(recon.reconciledAmount, recon.totalAmount);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border p-4">
          <div className="font-mono text-[10px] text-muted-foreground mb-1 tracking-widest">TOTAL TRANSACTIONS</div>
          <div className="text-2xl font-bold">{recon.total}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{fmt(recon.totalAmount)} total</div>
        </div>
        <div className="bg-card border border-green-500/30 p-4">
          <div className="font-mono text-[10px] text-green-400 mb-1 tracking-widest">RECONCILED</div>
          <div className="text-2xl font-bold text-green-400">{recon.reconciled}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{fmt(recon.reconciledAmount)}</div>
        </div>
        <div className="bg-card border border-yellow-500/30 p-4">
          <div className="font-mono text-[10px] text-yellow-400 mb-1 tracking-widest">UNRECONCILED</div>
          <div className="text-2xl font-bold text-yellow-400">{recon.unreconciled}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{fmt(recon.unreconciledAmount)}</div>
        </div>
      </div>

      <div className="bg-card border border-border p-4">
        <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">RECONCILIATION PROGRESS</div>
        <ProgressBar value={reconPct} color={reconPct >= 80 ? "bg-green-500" : "bg-primary"} />
        <div className="font-mono text-[10px] text-muted-foreground mt-1">{reconPct}% of total value reconciled</div>
      </div>

      <div className="bg-card border border-border p-4">
        <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">BY CHANNEL</div>
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr className="font-mono text-[10px] text-muted-foreground">
              <th className="text-left pb-2">CHANNEL</th>
              <th className="text-right pb-2">TOTAL</th>
              <th className="text-right pb-2">RECONCILED</th>
              <th className="text-right pb-2">UNRECONCILED</th>
              <th className="text-right pb-2">TXN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recon.byChannel.map(ch => (
              <tr key={ch.channel} className="hover:bg-secondary/30">
                <td className={`py-2 font-mono font-bold uppercase ${channelColor[ch.channel] ?? ""}`}>{ch.channel}</td>
                <td className="py-2 text-right font-mono">{fmt(Number(ch.total))}</td>
                <td className="py-2 text-right font-mono text-green-400">{fmt(Number(ch.reconciled))}</td>
                <td className="py-2 text-right font-mono text-yellow-400">{fmt(Number(ch.unreconciled))}</td>
                <td className="py-2 text-right font-mono text-muted-foreground">{Number(ch.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recon.unreconciledDonations.length > 0 && (
        <div>
          <div className="font-mono text-[10px] text-yellow-400 mb-2 tracking-widest">◆ PENDING RECONCILIATION ({recon.unreconciled} ITEMS)</div>
          <div className="border border-border bg-card divide-y divide-border max-h-72 overflow-y-auto">
            {recon.unreconciledDonations.map(d => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30">
                <div>
                  <div className="font-semibold text-xs">{d.donorName}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{d.reference ?? "—"} · {new Date(d.receivedAt).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-[10px] font-bold uppercase ${channelColor[d.channel] ?? ""}`}>{d.channel}</span>
                  <span className="font-mono font-bold text-primary">{fmt(d.amount)}</span>
                  <button onClick={() => reconcile.mutate({ id: d.id, data: {} })} className="font-mono text-[10px] text-green-400 border border-green-400/30 px-2 py-0.5 hover:bg-green-400/10">
                    ✓ RECONCILE
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {recon.unreconciled === 0 && (
        <div className="border border-green-500/30 bg-green-500/5 p-4 text-center font-mono text-xs text-green-400">✓ ALL DONATIONS RECONCILED</div>
      )}
    </div>
  );
}

// ── PAYMENT SETUP TAB ────────────────────────────────────────────────────────
function PaymentSetupTab() {
  const [mpesa, setMpesa] = useState({ paybill: "", account: "", shortcode: "", tillNumber: "" });
  const [bank, setBank] = useState({ bank: "", branch: "", account: "", swift: "" });
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="font-mono text-[10px] text-muted-foreground tracking-widest">PAYMENT CHANNELS CONFIGURATION · NO VERIFIED DETAILS CONFIGURED</div>

      {saved && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-xs p-3">
          This form is not connected to persistent settings. No payment configuration has been saved.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-green-400 rounded-full" />
            <div className="font-mono text-[10px] text-green-400 tracking-widest font-bold">M-PESA CONFIGURATION</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="PAYBILL NUMBER" value={mpesa.paybill} onChange={e => setMpesa(p => ({ ...p, paybill: e.target.value }))} placeholder="Not configured" />
            <Input label="ACCOUNT NUMBER" value={mpesa.account} onChange={e => setMpesa(p => ({ ...p, account: e.target.value }))} placeholder="Enter verified account reference" />
            <Input label="SHORTCODE (TILL)" value={mpesa.shortcode} onChange={e => setMpesa(p => ({ ...p, shortcode: e.target.value }))} placeholder="Not configured" />
            <Input label="TILL NUMBER (OPTIONAL)" value={mpesa.tillNumber} onChange={e => setMpesa(p => ({ ...p, tillNumber: e.target.value }))} placeholder="—" />
          </div>
          <div className="bg-secondary border border-border p-3 font-mono text-[10px] text-muted-foreground">
            PAYMENT INSTRUCTIONS: <span className="text-foreground">M-Pesa → Paybill {mpesa.paybill} → Account {mpesa.account}</span>
          </div>
        </div>

        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Building className="w-3 h-3 text-blue-400" />
            <div className="font-mono text-[10px] text-blue-400 tracking-widest font-bold">BANK TRANSFER CONFIGURATION</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="BANK NAME" value={bank.bank} onChange={e => setBank(p => ({ ...p, bank: e.target.value }))} placeholder="Enter verified bank name" />
            <Input label="BRANCH" value={bank.branch} onChange={e => setBank(p => ({ ...p, branch: e.target.value }))} placeholder="Enter bank branch, if applicable" />
            <Input label="ACCOUNT NUMBER" value={bank.account} onChange={e => setBank(p => ({ ...p, account: e.target.value }))} placeholder="Enter verified account number" />
            <Input label="SWIFT CODE" value={bank.swift} onChange={e => setBank(p => ({ ...p, swift: e.target.value }))} placeholder="Enter verified SWIFT code" />
          </div>
        </div>

        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-3 h-3 text-cyan-400" />
            <div className="font-mono text-[10px] text-cyan-400 tracking-widest font-bold">DIASPORA / ONLINE GIVING</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="PAYPAL EMAIL" placeholder="Enter verified payment email" />
            <Input label="WESTERN UNION REFERENCE" placeholder="Enter verified reference" />
          </div>
          <div className="bg-secondary border border-border p-3 font-mono text-[10px] text-muted-foreground">
            For international wire transfers: SWIFT {bank.swift} · {bank.bank} · Acc {bank.account}
          </div>
        </div>

        <button type="submit" className="w-full bg-primary text-white font-mono text-xs tracking-widest py-3 hover:bg-primary/90">
          ▶ SAVE PAYMENT CONFIGURATION
        </button>
      </form>
    </div>
  );
}

// ── M-PESA GATEWAY TAB ──────────────────────────────────────────────────────
type MpesaConfigStatus = { configured: boolean; environment: string | null; shortcode: string | null; callbackUrl: string | null };
type MpesaTx = {
  id: number; checkoutRequestId: string; phone: string; amount: number;
  donorName: string | null; ward: string | null; status: string;
  resultDesc: string | null; mpesaReceipt: string | null; createdAt: string;
};

const mpesaStatusColor: Record<string, string> = {
  pending: "text-yellow-400", success: "text-green-400", failed: "text-red-400",
};

function MpesaGatewayTab({ campaigns }: { campaigns: FundraisingCampaign[] }) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<MpesaConfigStatus | null>(null);
  const [txs, setTxs] = useState<MpesaTx[]>([]);
  const [form, setForm] = useState({ phone: "", amount: "", donorName: "", campaignId: "", ward: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; status: string; receipt?: string; desc?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadConfig() {
    try {
      const r = await fetch(`${BASE}api/fundraising/mpesa/config-status`);
      if (r.ok) setConfig(await r.json());
    } catch { /* ignore */ }
  }
  async function loadTxs() {
    try {
      const r = await fetch(`${BASE}api/fundraising/mpesa/transactions`);
      if (r.ok) setTxs(await r.json());
    } catch { /* ignore */ }
  }
  useEffect(() => { loadConfig(); loadTxs(); }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function startPolling(checkoutRequestId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 120_000) {
        if (pollRef.current) clearInterval(pollRef.current);
        setActive(p => p && p.status === "pending" ? { ...p, status: "timeout", desc: "No confirmation received. Check the transactions list later." } : p);
        return;
      }
      try {
        const r = await fetch(`${BASE}api/fundraising/mpesa/status/${encodeURIComponent(checkoutRequestId)}`);
        if (!r.ok) return;
        const tx: MpesaTx = await r.json();
        if (tx.status !== "pending") {
          if (pollRef.current) clearInterval(pollRef.current);
          setActive({ id: checkoutRequestId, status: tx.status, receipt: tx.mpesaReceipt ?? undefined, desc: tx.resultDesc ?? undefined });
          loadTxs();
          if (tx.status === "success") {
            queryClient.invalidateQueries({ queryKey: getGetFundraisingSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListDonationsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListFundraisingCampaignsQueryKey() });
          }
        }
      } catch { /* keep polling */ }
    }, 3000);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setActive(null);
    setSending(true);
    try {
      const r = await fetch(`${BASE}api/fundraising/mpesa/stkpush`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.phone,
          amount: Number(form.amount),
          donorName: form.donorName || undefined,
          campaignId: form.campaignId ? Number(form.campaignId) : undefined,
          ward: form.ward || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Request failed"); return; }
      setActive({ id: data.checkoutRequestId, status: "pending" });
      loadTxs();
      startPolling(data.checkoutRequestId);
    } catch {
      setError("Network error — could not reach the API server.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {config && !config.configured && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 font-mono text-xs text-yellow-400 space-y-1">
          <div className="font-bold tracking-widest flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> GATEWAY NOT CONFIGURED</div>
          <div className="text-muted-foreground">Safaricom Daraja API credentials (consumer key, consumer secret, shortcode, passkey) have not been added yet. STK push requests will fail until they are configured in the environment secrets.</div>
        </div>
      )}
      {config?.configured && (
        <div className="bg-green-500/10 border border-green-500/30 p-3 font-mono text-[10px] tracking-widest text-green-400 flex flex-wrap gap-x-6 gap-y-1">
          <span>● GATEWAY LIVE</span>
          <span className="text-muted-foreground">ENV: <span className="text-foreground uppercase">{config.environment}</span></span>
          <span className="text-muted-foreground">SHORTCODE: <span className="text-foreground">{config.shortcode}</span></span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-green-400" />
            <div className="font-mono text-[10px] text-green-400 tracking-widest font-bold">SEND STK PUSH — COLLECT DONATION</div>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">Sends an M-Pesa payment prompt directly to the donor's phone. They confirm with their PIN and the donation is recorded automatically.</p>
          <form onSubmit={handleSend} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="PHONE NUMBER" required placeholder="07XXXXXXXX" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              <Input label="AMOUNT (KES)" required type="number" min={1} placeholder="1000" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
              <Input label="DONOR NAME (OPTIONAL)" placeholder="Jane Mwikali" value={form.donorName} onChange={e => setForm(p => ({ ...p, donorName: e.target.value }))} />
              <Select label="WARD (OPTIONAL)" value={form.ward} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))}>
                <option value="">—</option>
                {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
              </Select>
              <div className="col-span-2">
                <Select label="CAMPAIGN (OPTIONAL)" value={form.campaignId} onChange={e => setForm(p => ({ ...p, campaignId: e.target.value }))}>
                  <option value="">— GENERAL FUND —</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs p-2">{error}</div>}
            <button type="submit" disabled={sending || !form.phone || !form.amount} className="w-full bg-green-500/20 border border-green-500/40 text-green-400 font-mono text-xs tracking-widest py-2 hover:bg-green-500/30 disabled:opacity-40 disabled:cursor-not-allowed">
              {sending ? "SENDING PROMPT..." : "▶ SEND M-PESA PROMPT"}
            </button>
          </form>

          {active && (
            <div className={`border p-3 font-mono text-xs space-y-1 ${
              active.status === "success" ? "bg-green-500/10 border-green-500/30 text-green-400"
              : active.status === "pending" ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              {active.status === "pending" && <div className="flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> WAITING FOR DONOR TO ENTER PIN...</div>}
              {active.status === "success" && <div>✓ PAYMENT RECEIVED{active.receipt ? ` — RECEIPT ${active.receipt}` : ""}. Donation recorded.</div>}
              {active.status === "failed" && <div>✗ PAYMENT FAILED{active.desc ? ` — ${active.desc}` : ""}</div>}
              {active.status === "timeout" && <div>⏱ {active.desc}</div>}
            </div>
          )}
        </div>

        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] text-muted-foreground tracking-widest font-bold">RECENT GATEWAY TRANSACTIONS</div>
            <button onClick={loadTxs} className="text-muted-foreground hover:text-foreground"><RefreshCw className="w-3 h-3" /></button>
          </div>
          {txs.length === 0 ? (
            <div className="font-mono text-xs text-muted-foreground py-6 text-center">NO GATEWAY TRANSACTIONS YET</div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {txs.map(tx => (
                <div key={tx.id} className="border border-border bg-secondary/50 p-2 font-mono text-[10px] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-foreground truncate">{tx.donorName || tx.phone}</div>
                    <div className="text-muted-foreground">{tx.phone} · {new Date(tx.createdAt).toLocaleString()}</div>
                    {tx.mpesaReceipt && <div className="text-green-400">{tx.mpesaReceipt}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-foreground">{fmt(tx.amount)}</div>
                    <div className={`uppercase tracking-widest ${mpesaStatusColor[tx.status] ?? "text-muted-foreground"}`}>{tx.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "donors", label: "DONORS", icon: Users },
  { id: "donations", label: "DONATIONS", icon: Banknote },
  { id: "campaigns", label: "CAMPAIGNS", icon: Target },
  { id: "pledges", label: "PLEDGES", icon: Clock },
  { id: "pipeline", label: "PIPELINE", icon: TrendingUp },
  { id: "insights", label: "AI INSIGHTS", icon: Lightbulb },
  { id: "reconciliation", label: "RECONCILIATION", icon: CheckCircle },
  { id: "gateway", label: "M-PESA GATEWAY", icon: Smartphone },
  { id: "setup", label: "PAYMENT SETUP", icon: Settings },
];

export default function Fundraising() {
  const [tab, setTab] = useState<Tab>("donors");
  const { data: summary } = useGetFundraisingSummary();
  const { data: campaigns = [], isLoading: loadingCampaigns } = useListFundraisingCampaigns();
  const { data: donors = [] } = useListDonors({});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest flex items-center gap-3">
            <Banknote className="w-5 h-5 text-primary" />
            PLEDGES & FUNDRAISING
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">{CAMPAIGN.areaLabel.toUpperCase()} · PLEDGES, DONATIONS & FUNDRAISING</p>
        </div>
        
        {summary && (
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: "RAISED", value: fmt(summary.totalRaised) },
              { label: "DONORS", value: summary.totalDonors },
              { label: "PLEDGED", value: fmt(summary.totalPledged) },
              { label: "CAMPAIGNS", value: summary.activeCampaigns },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border px-3 py-2">
                <div className="font-mono text-[10px] text-muted-foreground">{s.label}</div>
                <div className="font-bold text-sm">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 font-mono text-[10px] tracking-widest border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "donors" && <DonorsTab campaigns={campaigns} />}
        {tab === "donations" && <DonationsTab campaigns={campaigns} donors={donors} />}
        {tab === "campaigns" && <CampaignsTab campaigns={campaigns} isLoading={loadingCampaigns} />}
        {tab === "pledges" && <PledgesTab campaigns={campaigns} />}
        {tab === "pipeline" && <PipelineTab />}
        {tab === "insights" && <InsightsTab />}
        {tab === "reconciliation" && <ReconciliationTab />}
        {tab === "gateway" && <MpesaGatewayTab campaigns={campaigns} />}
        {tab === "setup" && <PaymentSetupTab />}
      </div>
    </div>
  );
}