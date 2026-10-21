import { WARDS } from "@/lib/wards";
import { useState } from "react";
import {
  useListMembers, useCreateMember, useUpdateMember, useDeleteMember, useGetMemberStats,
  getListMembersQueryKey, getGetMemberStatsQueryKey
} from "@workspace/api-client-react";
import type { Member, MemberInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Edit2, X, Check } from "lucide-react";

const SUPPORT_LEVELS = ["strong_supporter", "supporter", "undecided", "soft_opponent", "opponent"];
const STATUSES = ["active", "inactive", "deceased"];

function SupportBadge({ level }: { level?: string | null }) {
  const map: Record<string, string> = {
    strong_supporter: "text-green-400 border-green-400/30",
    supporter: "text-emerald-400 border-emerald-400/30",
    undecided: "text-yellow-400 border-yellow-400/30",
    soft_opponent: "text-orange-400 border-orange-400/30",
    opponent: "text-red-400 border-red-400/30",
  };
  if (!level) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  return (
    <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${map[level] ?? "text-muted-foreground border-border"}`}>
      {level.toUpperCase().replace("_", " ")}
    </span>
  );
}

function ConsentDots({ sms, wa, email }: { sms: boolean; wa: boolean; email: boolean }) {
  return (
    <div className="flex gap-2 font-mono text-[9px]">
      <span className={sms ? "text-green-400" : "text-muted-foreground"}>SMS</span>
      <span className={wa ? "text-green-400" : "text-muted-foreground"}>WA</span>
      <span className={email ? "text-green-400" : "text-muted-foreground"}>EMAIL</span>
    </div>
  );
}

export default function Members() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [wardFilter, setWardFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<MemberInput>>({ smsConsent: false, whatsappConsent: false, emailConsent: false });

  const params = { search: search || undefined, ward: wardFilter || undefined, status: statusFilter || undefined, page, limit: 100 };
  const { data: membersData, isLoading } = useListMembers(params);
  const { data: stats } = useGetMemberStats();
  const createMember = useCreateMember({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMembersQueryKey() }); qc.invalidateQueries({ queryKey: getGetMemberStatsQueryKey() }); setShowAdd(false); setForm({ smsConsent: false, whatsappConsent: false, emailConsent: false }); } } });
  const updateMember = useUpdateMember({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMembersQueryKey() }); setEditingId(null); } } });
  const deleteMember = useDeleteMember({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMembersQueryKey() }); qc.invalidateQueries({ queryKey: getGetMemberStatsQueryKey() }); } } });

  const members = membersData?.data ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      updateMember.mutate({ id: editingId, data: form });
    } else {
      createMember.mutate({ data: form as MemberInput });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">IDENTITY GRAPH</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-1">TOTAL: {stats?.total ?? "—"} CONTACTS</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs tracking-wider hover:bg-primary/90">
          <Plus className="w-3 h-3" /> ADD OPERATIVE
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border p-3">
            <p className="font-mono text-[10px] text-muted-foreground">SMS CONSENTED</p>
            <p className="text-2xl font-bold text-green-400">{stats.consentedSms}</p>
          </div>
          <div className="bg-card border border-border p-3">
            <p className="font-mono text-[10px] text-muted-foreground">WHATSAPP CONSENTED</p>
            <p className="text-2xl font-bold text-green-400">{stats.consentedWhatsapp}</p>
          </div>
          <div className="bg-card border border-border p-3">
            <p className="font-mono text-[10px] text-muted-foreground">EMAIL CONSENTED</p>
            <p className="text-2xl font-bold text-green-400">{stats.consentedEmail}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="SEARCH CONTACTS..." className="w-full bg-card border border-border pl-8 pr-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
        </div>
        <select value={wardFilter} onChange={e => { setWardFilter(e.target.value); setPage(1); }} className="bg-card border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
          <option value="">ALL WARDS</option>
          {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-card border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
          <option value="">ALL STATUS</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
        </select>
      </div>

      {(showAdd || editingId !== null) && (
        <div className="bg-card border border-primary/50 p-4">
          <h3 className="font-mono text-xs tracking-widest mb-4">{editingId ? "UPDATE OPERATIVE" : "NEW OPERATIVE"}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">FIRST NAME *</label>
              <input required value={form.firstName ?? ""} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">LAST NAME *</label>
              <input required value={form.lastName ?? ""} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">EMAIL</label>
              <input type="email" value={form.email ?? ""} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">PHONE</label>
              <input value={form.phone ?? ""} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">WARD</label>
              <select value={form.ward ?? ""} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                <option value="">— SELECT —</option>
                {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">SUPPORT LEVEL</label>
              <select value={form.supportLevel ?? ""} onChange={e => setForm(p => ({ ...p, supportLevel: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                <option value="">— SELECT —</option>
                {SUPPORT_LEVELS.map(s => <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex gap-6">
              {(["smsConsent", "whatsappConsent", "emailConsent"] as const).map(key => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} className="accent-primary" />
                  <span className="font-mono text-[10px] text-muted-foreground">{key.replace("Consent", "").toUpperCase()} CONSENT</span>
                </label>
              ))}
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowAdd(false); setEditingId(null); setForm({ smsConsent: false, whatsappConsent: false, emailConsent: false }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary">
                <X className="w-3 h-3" /> ABORT
              </button>
              <button type="submit" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
                <Check className="w-3 h-3" /> {editingId ? "UPDATE" : "REGISTER"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {["NAME", "WARD", "PHONE", "SUPPORT", "CONSENT", "STATUS", "ACTIONS"].map(h => (
                <th key={h} className="px-4 py-2 text-left font-mono text-[10px] text-muted-foreground tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ LOADING IDENTITY GRAPH... ]</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">[ NO_CONTACTS_FOUND ]</td></tr>
            ) : members.map(m => (
              <tr key={m.id} className="hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-2 font-medium">{m.firstName} {m.lastName}</td>
                <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{m.ward ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-[10px]">{m.phone ?? "—"}</td>
                <td className="px-4 py-2"><SupportBadge level={m.supportLevel} /></td>
                <td className="px-4 py-2"><ConsentDots sms={m.smsConsent} wa={m.whatsappConsent} email={m.emailConsent} /></td>
                <td className="px-4 py-2 font-mono text-[10px]">{m.status.toUpperCase()}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(m.id); setForm({ firstName: m.firstName, lastName: m.lastName, email: m.email ?? "", phone: m.phone ?? "", ward: m.ward ?? "", supportLevel: m.supportLevel ?? "", smsConsent: m.smsConsent, whatsappConsent: m.whatsappConsent, emailConsent: m.emailConsent, notes: m.notes ?? "" }); }} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => { if (confirm("Delete this contact?")) deleteMember.mutate({ id: m.id }); }} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-muted-foreground">
        <span>Showing {members.length} contacts on page {page} · {membersData?.total ?? 0} matching contacts · phone numbers first</span>
        <div className="flex items-center gap-2">
          <button className="border border-border px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>PREVIOUS</button>
          <button className="border border-border px-3 py-2 disabled:opacity-40" disabled={page * 100 >= (membersData?.total ?? 0)} onClick={() => setPage(p => p + 1)}>NEXT</button>
        </div>
      </div>
    </div>
  );
}