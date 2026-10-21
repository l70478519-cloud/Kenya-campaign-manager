import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, UserPlus, X, ShieldOff } from "lucide-react";
import { api, humanize } from "@/lib/records";

type Org = { id: number; name: string; campaignCount: number };
type Camp = { id: number; organisationId: number; organisationName: string; name: string; seat: string | null; area: string | null; electionDate: string | null; status: string; memberCount: number;
  wards: string[]; constituency: string | null; county: string | null; candidateName: string | null; party: string | null; profileSummary: string | null };
type Profile = { constituency: string; county: string; wards: string; candidateName: string; party: string; profileSummary: string };
const toProfile = (c?: Partial<Camp>): Profile => ({ constituency: c?.constituency ?? "", county: c?.county ?? "", wards: (c?.wards ?? []).join(", "),
  candidateName: c?.candidateName ?? "", party: c?.party ?? "", profileSummary: c?.profileSummary ?? "" });
const parseWards = (s: string) => s.split(/[,\n]/).map(w => w.trim()).filter(Boolean);

type Geo = { seats: { key: string; label: string; level: string; seats: number }[]; totals: { counties: number; constituencies: number; wards: number };
  counties: { code: string; name: string; constituencies: { name: string; wards: string[] }[] }[] };

/** Seat → county → constituency → ward, from Kenya's 47 / 290 / 1,450 electoral units. */
function SeatPicker({ geo, v, set, optional }: { geo: Geo | undefined; v: { seat: string; county: string; constituency: string; ward: string }; set: (x: { seat: string; county: string; constituency: string; ward: string }) => void; optional?: boolean }) {
  const seat = geo?.seats.find(s => s.key === v.seat);
  const county = geo?.counties.find(c => c.name === v.county);
  const constituency = county?.constituencies.find(c => c.name === v.constituency);
  const needsCounty = !!seat && seat.level !== "national";
  const needsConstituency = !!seat && (seat.level === "constituency" || seat.level === "ward");
  const needsWard = seat?.level === "ward";
  const units = !seat ? 0 : seat.level === "national" ? geo?.totals.counties ?? 47
    : seat.level === "county" ? county?.constituencies.reduce((n, c) => n + c.wards.length, 0) ?? 0
    : seat.level === "constituency" ? constituency?.wards.length ?? 0 : v.ward ? 1 : 0;
  return <div className="grid sm:grid-cols-2 gap-2">
    <label className="text-sm sm:col-span-2">Seat
      <select required={!optional} value={v.seat} onChange={e => set({ seat: e.target.value, county: v.county, constituency: "", ward: "" })} className={inputCls}>
        <option value="">{optional ? "Keep current seat and wards" : "Choose the elective seat…"}</option>
        {geo?.seats.map(s => <option key={s.key} value={s.key}>{s.label} — {s.seats.toLocaleString()} {s.seats === 1 ? "seat" : "seats"}</option>)}
      </select></label>
    {needsCounty && <label className="text-sm">County
      <select required value={v.county} onChange={e => set({ ...v, county: e.target.value, constituency: "", ward: "" })} className={inputCls}>
        <option value="">Choose county…</option>{geo?.counties.map(c => <option key={c.code} value={c.name}>{c.code} · {c.name}</option>)}
      </select></label>}
    {needsConstituency && county && <label className="text-sm">Constituency
      <select required value={v.constituency} onChange={e => set({ ...v, constituency: e.target.value, ward: "" })} className={inputCls}>
        <option value="">Choose constituency…</option>{county.constituencies.map(c => <option key={c.name}>{c.name}</option>)}
      </select></label>}
    {needsWard && constituency && <label className="text-sm">Ward
      <select required value={v.ward} onChange={e => set({ ...v, ward: e.target.value })} className={inputCls}>
        <option value="">Choose ward…</option>{constituency.wards.map(w => <option key={w}>{w}</option>)}
      </select></label>}
    {seat && <p className="text-xs text-muted-foreground sm:col-span-2">
      {seat.level === "national" ? `Targeting units: all ${units} counties.` : units ? `Targeting units: ${units} ${seat.level === "ward" ? "ward" : "wards"}${seat.level === "county" && county ? ` across ${county.constituencies.length} constituencies` : ""}.` : "Choose the area to see its wards."}
    </p>}
  </div>;
}

function ProfileFields({ v, set, derived }: { v: Profile; set: (p: Profile) => void; derived?: boolean }) {
  return <div className="grid sm:grid-cols-2 gap-2">
    <label className="text-sm">Candidate name<input value={v.candidateName} onChange={e => set({ ...v, candidateName: e.target.value })} className={inputCls} /></label>
    <label className="text-sm">Party<input value={v.party} onChange={e => set({ ...v, party: e.target.value })} className={inputCls} /></label>
    {!derived && <><label className="text-sm">Constituency / area<input required minLength={2} value={v.constituency} onChange={e => set({ ...v, constituency: e.target.value })} className={inputCls} placeholder="e.g. Mbooni" /></label>
    <label className="text-sm">County<input value={v.county} onChange={e => set({ ...v, county: e.target.value })} className={inputCls} placeholder="e.g. Makueni" /></label>
    <label className="text-sm sm:col-span-2">Wards <span className="text-xs text-muted-foreground">(comma-separated, as listed by IEBC)</span>
      <input required value={v.wards} onChange={e => set({ ...v, wards: e.target.value })} className={inputCls} placeholder="Tulimani, Mbooni, Kalawa, Kisau/Kiteta, Kako/Waia, Kithungo/Kitundu" /></label></>}
    <label className="text-sm sm:col-span-2">Profile & priorities for AI features
      <textarea rows={3} maxLength={4000} value={v.profileSummary} onChange={e => set({ ...v, profileSummary: e.target.value })} className={inputCls}
        placeholder="Who the candidate is, verified background, key local issues and pledges. The AI tools use this instead of generic text." /></label>
  </div>;
}
const profilePayload = (v: Profile, derived = false) => ({ ...(derived ? {} : { constituency: v.constituency || null, county: v.county || null, wards: parseWards(v.wards) }),
  candidateName: v.candidateName || null, party: v.party || null, profileSummary: v.profileSummary || null });
type U = { id: number; name: string; email: string; role: string; status: string; mfaEnabled: boolean; campaignIds: number[] };

const inputCls = "block w-full bg-background border border-border rounded-lg p-2.5 text-sm";
const primary = "bg-primary text-primary-foreground rounded-xl px-3 py-2 text-sm flex gap-2 items-center disabled:opacity-50";

export default function TenancyAdmin() {
  const qc = useQueryClient();
  const orgs = useQuery<Org[]>({ queryKey: ["t-orgs"], queryFn: () => api("tenancy/organisations") });
  const camps = useQuery<Camp[]>({ queryKey: ["t-camps"], queryFn: () => api("tenancy/campaigns") });
  const users = useQuery<U[]>({ queryKey: ["t-users"], queryFn: () => api("tenancy/users") });
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [orgName, setOrgName] = useState("");
  const [nc, setNc] = useState({ organisationId: "", name: "", seat: "", area: "", electionDate: "" });
  const [np, setNp] = useState<Profile>(toProfile());
  const geo = useQuery<Geo>({ queryKey: ["kenya-geo"], queryFn: () => api<Geo>("tenancy/geography"), staleTime: Infinity });
  const [area, setArea] = useState({ seat: "", county: "", constituency: "", ward: "" });
  const [editArea, setEditArea] = useState({ seat: "", county: "", constituency: "", ward: "" });
  const [edit, setEdit] = useState<Profile | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [addUser, setAddUser] = useState("");
  const [saving, setSaving] = useState(false);
  const loadError = orgs.error || camps.error || users.error || geo.error;
  useEffect(() => {
    if (orgs.data?.length === 1) {
      setNc(v => v.organisationId ? v : { ...v, organisationId: String(orgs.data![0].id) });
    }
  }, [orgs.data]);

  const reload = () => { void qc.invalidateQueries({ queryKey: ["t-orgs"] }); void qc.invalidateQueries({ queryKey: ["t-camps"] }); void qc.invalidateQueries({ queryKey: ["t-users"] }); void qc.invalidateQueries({ queryKey: ["tenancy-context"] }); };
  async function run(fn: () => Promise<unknown>, ok: string) {
    setErr(""); setMsg(""); setSaving(true);
    try { await fn(); setMsg(ok); reload(); } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const createOrg = (e: FormEvent) => { e.preventDefault(); void run(() => api<Org>("tenancy/organisations", { method: "POST", body: JSON.stringify({ name: orgName }) }).then(created => {
    qc.setQueryData<Org[]>(["t-orgs"], old => [...(old ?? []), { ...created, campaignCount: 0 }]);
    setNc(v => ({ ...v, organisationId: String(created.id) }));
    setOrgName("");
  }), "Organisation created."); };
  const createCamp = (e: FormEvent) => {
    e.preventDefault();
    if (!orgs.data?.some(o => String(o.id) === nc.organisationId)) { setErr("Choose an organisation, or add one in the Organisations panel first."); return; }
    void run(() => api("tenancy/campaigns", { method: "POST", body: JSON.stringify({
      organisationId: Number(nc.organisationId), name: nc.name, electionDate: nc.electionDate || null,
      seat: area.seat, areaCounty: area.county || null, areaConstituency: area.constituency || null, areaWard: area.ward || null,
      ...profilePayload(np, true),
    }) }).then(() => { setNc({ organisationId: "", name: "", seat: "", area: "", electionDate: "" }); setNp(toProfile()); setArea({ seat: "", county: "", constituency: "", ward: "" }); }), "Campaign created with its wards. Add members so people can open it.");
  };
  const setStatus = (c: Camp, status: string) => run(() => api(`tenancy/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ status }) }), `${c.name} is now ${status}.`);
  const add = (c: Camp) => addUser && run(() => api(`tenancy/campaigns/${c.id}/members`, { method: "POST", body: JSON.stringify({ userId: Number(addUser) }) }).then(() => setAddUser("")), "Member added.");
  const remove = (c: Camp, u: U) => run(() => api(`tenancy/campaigns/${c.id}/members/${u.id}`, { method: "DELETE" }), `${u.name} removed from ${c.name}.`);
  const reset2fa = (u: U) => {
    const reason = window.prompt(`Reset two-factor sign-in for ${u.name}? They’ll set it up again at next sign-in.\n\nHow did you confirm it’s really them?`);
    if (reason) void run(() => api(`tenancy/users/${u.id}/reset-2fa`, { method: "POST", body: JSON.stringify({ reason }) }), `2FA reset for ${u.name}.`);
  };

  return <div className="space-y-6 min-w-0">
    <header><h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="text-primary" size={24} /> Organisations & campaigns</h1>
      <p className="text-sm text-muted-foreground max-w-3xl">Each campaign keeps its own records. People only see campaigns they’re members of; anyone with no memberships works in the primary campaign. Super-admins can open every campaign.</p></header>
    {loadError && <div role="alert" className="border border-red-500/40 rounded-xl p-3 text-sm space-y-2">
      <p>Could not load campaign setup: {(loadError as Error).message}</p>
      <button type="button" onClick={() => { void orgs.refetch(); void camps.refetch(); void users.refetch(); void geo.refetch(); }} className={primary}>Retry loading</button>
    </div>}
    {err && <p role="alert" className="border border-red-500/40 bg-red-950/30 rounded-xl p-3 text-red-200 text-sm">{err}</p>}
    {msg && <p role="status" className="border border-green-500/40 rounded-xl p-3 text-green-200 text-sm">{msg}</p>}

    <div className="grid lg:grid-cols-2 gap-4">
      <form onSubmit={createOrg} className="kaiti-glass rounded-2xl p-4 space-y-3">
        <h2 className="font-semibold">Organisations</h2>
        {orgs.isPending && <p role="status" className="text-sm text-muted-foreground">Loading organisations…</p>}
        {!orgs.isPending && !orgs.error && !orgs.data?.length && <p className="text-sm text-muted-foreground">No organisations yet. Enter a name below and click Add.</p>}
        <ul className="text-sm space-y-1">{orgs.data?.map(o => <li key={o.id} className="flex justify-between"><span>{o.name}</span><span className="text-muted-foreground">{o.campaignCount} campaign{o.campaignCount === 1 ? "" : "s"}</span></li>)}</ul>
        <div className="flex gap-2"><input required minLength={2} value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="New organisation, e.g. a party or agency" aria-label="Organisation name" className={inputCls} />
          <button type="submit" disabled={saving} className={primary}><Plus size={16} /> Add</button></div>
      </form>
      <form onSubmit={createCamp} className="kaiti-glass rounded-2xl p-4 space-y-3">
        <h2 className="font-semibold">New campaign</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-sm">Organisation<select required aria-label="Campaign organisation" disabled={orgs.isPending || !!orgs.error || !orgs.data?.length} value={nc.organisationId} onChange={e => setNc({ ...nc, organisationId: e.target.value })} className={inputCls}><option value="">{orgs.isPending ? "Loading organisations…" : orgs.error ? "Organisations unavailable — retry above" : orgs.data?.length ? "Choose organisation…" : "Add an organisation first"}</option>{orgs.data?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="text-sm">Campaign name<input required minLength={2} value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} className={inputCls} /></label>
          <label className="text-sm">Election date<input type="date" value={nc.electionDate} onChange={e => setNc({ ...nc, electionDate: e.target.value })} className={inputCls} /></label>
        </div>
        <SeatPicker geo={geo.data} v={area} set={setArea} />
        <ProfileFields v={np} set={setNp} derived />
        <button type="submit" disabled={saving || orgs.isPending || !!orgs.error || !nc.organisationId} className={primary}><Plus size={16} /> {saving ? "Saving…" : "Create campaign"}</button>
      </form>
    </div>

    <section className="kaiti-glass rounded-2xl p-4">
      <h2 className="font-semibold mb-3">Campaigns</h2>
      <ul className="divide-y divide-border/60">{camps.data?.map(c => { const members = users.data?.filter(u => u.campaignIds.includes(c.id)) ?? []; return <li key={c.id} className="py-3">
        <div className="flex flex-wrap justify-between gap-2 items-center">
          <button type="button" onClick={() => { setOpen(open === c.id ? null : c.id); setEdit(null); }} className="text-left min-w-0" aria-expanded={open === c.id}>
            <span className="font-medium block">{c.name}{c.id === 1 && <span className="text-xs text-primary ml-2">primary</span>}</span>
            <span className="text-xs text-muted-foreground">{c.organisationName}{c.seat ? ` · ${c.seat}` : ""}{c.area ? ` · ${c.area}` : ""}{c.electionDate ? ` · election ${c.electionDate}` : ""} · {c.memberCount} member{c.memberCount === 1 ? "" : "s"}</span>
          </button>
          <select aria-label={`Status of ${c.name}`} value={c.status} onChange={e => void setStatus(c, e.target.value)} className="bg-background border border-border rounded-lg p-1.5 text-sm">
            {["active", "paused", ...(c.id === 1 ? [] : ["archived"])].map(s => <option key={s} value={s}>{humanize(s)}</option>)}</select>
        </div>
        {open === c.id && <div className="mt-3 pl-3 border-l-2 border-primary/50 space-y-2">
          <p className="text-xs text-muted-foreground">{c.constituency ?? "No constituency set"} · {c.wards.length} wards{c.wards.length ? `: ${c.wards.join(", ")}` : ""}{c.candidateName ? ` · ${c.candidateName}` : ""}</p>
          {edit ? <form onSubmit={e => { e.preventDefault(); void run(() => api(`tenancy/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify(editArea.seat
              ? { seat: editArea.seat, areaCounty: editArea.county || null, areaConstituency: editArea.constituency || null, areaWard: editArea.ward || null, ...profilePayload(edit, true) }
              : profilePayload(edit)) }).then(() => setEdit(null)), "Campaign profile saved. People in this campaign see the change after reloading."); }} className="space-y-2">
            <p className="text-xs text-muted-foreground">Set the seat and area to load the wards automatically, or leave the seat empty and edit the wards by hand.</p>
            <SeatPicker geo={geo.data} v={editArea} set={setEditArea} optional />
            <ProfileFields v={edit} set={setEdit} derived={!!editArea.seat} />
            <div className="flex gap-2"><button type="submit" className={primary}>Save profile</button><button type="button" onClick={() => setEdit(null)} className="border border-border rounded-xl px-3 py-2 text-sm">Cancel</button></div>
          </form> : <button type="button" onClick={() => { setEdit(toProfile(c)); setEditArea({ seat: "", county: "", constituency: "", ward: "" }); }} className="text-xs border border-border rounded-lg px-2 py-1">{c.wards.length ? "Edit seat, wards & profile" : "Set seat & area"}</button>}
          {c.id === 1 && <p className="text-xs text-muted-foreground">Users with no memberships also work here.</p>}
          <ul className="text-sm space-y-1">{members.map(u => <li key={u.id} className="flex justify-between gap-2"><span>{u.name} <span className="text-xs text-muted-foreground">{u.role}</span></span>
            <button type="button" aria-label={`Remove ${u.name}`} onClick={() => void remove(c, u)} className="p-1"><X size={14} /></button></li>)}
            {members.length === 0 && <li className="text-xs text-muted-foreground">No members yet.</li>}</ul>
          <div className="flex gap-2"><select aria-label="Person to add" value={addUser} onChange={e => setAddUser(e.target.value)} className={inputCls}><option value="">Add a person…</option>
            {users.data?.filter(u => !u.campaignIds.includes(c.id)).map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select>
            <button type="button" disabled={!addUser} onClick={() => void add(c)} className={primary}><UserPlus size={16} /> Add</button></div>
        </div>}
      </li>; })}</ul>
    </section>

    <section className="kaiti-glass rounded-2xl p-4 overflow-x-auto">
      <h2 className="font-semibold mb-3">People</h2>
      <table className="w-full text-sm min-w-[560px]"><thead className="text-xs text-muted-foreground text-left"><tr><th className="py-1">Name</th><th>Role</th><th>Campaigns</th><th>Two-factor</th><th /></tr></thead>
        <tbody>{users.data?.map(u => <tr key={u.id} className="border-t border-border/50">
          <td className="py-1.5">{u.name}<span className="block text-xs text-muted-foreground">{u.email}</span></td><td>{u.role}</td>
          <td className="text-xs">{u.campaignIds.length ? u.campaignIds.map(id => camps.data?.find(c => c.id === id)?.name ?? `#${id}`).join(", ") : "Primary (default)"}</td>
          <td>{u.mfaEnabled ? <span className="text-green-300">On</span> : <span className="text-muted-foreground">Off</span>}</td>
          <td className="text-right">{u.mfaEnabled && <button type="button" onClick={() => reset2fa(u)} className="text-xs border border-border rounded-lg px-2 py-1 inline-flex gap-1 items-center"><ShieldOff size={12} /> Reset 2FA</button>}</td>
        </tr>)}</tbody></table>
    </section>
  </div>;
}
