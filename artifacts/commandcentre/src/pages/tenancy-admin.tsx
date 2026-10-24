import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, UserPlus, X, ShieldOff, MapPin, Trash2 } from "lucide-react";
import { api, humanize } from "@/lib/records";
import { openCampaign as openCampaignApi } from "@/lib/tenancy";

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
function SeatPicker({ geo, v, set, optional, label = "Seat" }: { geo: Geo | undefined; v: { seat: string; county: string; constituency: string; ward: string }; set: (x: { seat: string; county: string; constituency: string; ward: string }) => void; optional?: boolean; label?: string }) {
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
    <label className="text-sm sm:col-span-2">{label}
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

/** Candidate name and affiliated party (typed freely; empty = Independent), with suggestions from parties already used. */
function CandidateFields({ v, set, parties, required }: { v: Profile; set: (p: Profile) => void; parties: string[]; required?: boolean }) {
  return <div className="grid sm:grid-cols-2 gap-2">
    <label className="text-sm">Candidate name<input required={required} minLength={2} maxLength={120} value={v.candidateName} onChange={e => set({ ...v, candidateName: e.target.value })} className={inputCls} placeholder="e.g. Emmanuel Okatch" /></label>
    <label className="text-sm">Affiliated party<input value={v.party} maxLength={160} list="party-suggestions" onChange={e => set({ ...v, party: e.target.value })} className={inputCls} placeholder="Type a party, or leave empty if Independent" />
      <datalist id="party-suggestions">{parties.map(p => <option key={p} value={p} />)}</datalist></label>
  </div>;
}

function ProfileFields({ v, set, derived, parties = [], identity = true }: { v: Profile; set: (p: Profile) => void; derived?: boolean; parties?: string[]; identity?: boolean }) {
  return <div className="space-y-2">
    {identity && <CandidateFields v={v} set={set} parties={parties} />}
    <div className="grid sm:grid-cols-2 gap-2">
    {!derived && <><label className="text-sm">Constituency / area<input required minLength={2} value={v.constituency} onChange={e => set({ ...v, constituency: e.target.value })} className={inputCls} placeholder="e.g. Mbooni" /></label>
    <label className="text-sm">County<input value={v.county} onChange={e => set({ ...v, county: e.target.value })} className={inputCls} placeholder="e.g. Makueni" /></label>
    <label className="text-sm sm:col-span-2">Wards <span className="text-xs text-muted-foreground">(comma-separated, as listed by IEBC)</span>
      <input required value={v.wards} onChange={e => set({ ...v, wards: e.target.value })} className={inputCls} placeholder="Tulimani, Mbooni, Kalawa, Kisau/Kiteta, Kako/Waia, Kithungo/Kitundu" /></label></>}
    <label className="text-sm sm:col-span-2">Profile & priorities for AI features
      <textarea rows={3} maxLength={4000} value={v.profileSummary} onChange={e => set({ ...v, profileSummary: e.target.value })} className={inputCls}
        placeholder="Who the candidate is, verified background, key local issues and pledges. The AI tools use this instead of generic text." /></label>
    </div>
  </div>;
}
const profilePayload = (v: Profile, derived = false) => ({ ...(derived ? {} : { constituency: v.constituency || null, county: v.county || null, wards: parseWards(v.wards) }),
  candidateName: v.candidateName || null, party: v.party || null, profileSummary: v.profileSummary || null });
type DemoStatus = { configured: boolean; ended: boolean; accounts: string[]; campaigns: { id: number; name: string }[] };
type U = { id: number; name: string; email: string; role: string; status: string; mfaEnabled: boolean; campaignIds: number[] };

const inputCls = "block w-full bg-background border border-border rounded-lg p-2.5 text-sm";
const primary = "bg-primary text-primary-foreground rounded-xl px-3 py-2 text-sm flex gap-2 items-center disabled:opacity-50";

export default function TenancyAdmin() {
  const qc = useQueryClient();
  const orgs = useQuery<Org[]>({ queryKey: ["t-orgs"], queryFn: () => api("tenancy/organisations") });
  const camps = useQuery<Camp[]>({ queryKey: ["t-camps"], queryFn: () => api("tenancy/campaigns") });
  const users = useQuery<U[]>({ queryKey: ["t-users"], queryFn: () => api("tenancy/users") });
  const demo = useQuery<DemoStatus>({ queryKey: ["t-demo"], queryFn: () => api("tenancy/demo") });
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [nc, setNc] = useState({ organisationId: "", name: "", seat: "", area: "", electionDate: "" });
  const [np, setNp] = useState<Profile>(toProfile());
  const geo = useQuery<Geo>({ queryKey: ["kenya-geo"], queryFn: () => api<Geo>("tenancy/geography"), staleTime: Infinity });
  const [area, setArea] = useState({ seat: "", county: "", constituency: "", ward: "" });
  const [editArea, setEditArea] = useState({ seat: "", county: "", constituency: "", ward: "" });
  const [edit, setEdit] = useState<Profile | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [addUser, setAddUser] = useState("");
  const [saving, setSaving] = useState(false);
  const [justCreated, setJustCreated] = useState<number | null>(null);
  const loadError = orgs.error || camps.error || users.error || geo.error;
  const reload = () => { void qc.invalidateQueries({ queryKey: ["t-orgs"] }); void qc.invalidateQueries({ queryKey: ["t-camps"] }); void qc.invalidateQueries({ queryKey: ["t-users"] }); void qc.invalidateQueries({ queryKey: ["tenancy-context"] }); void qc.invalidateQueries({ queryKey: ["t-demo"] }); };
  async function run(fn: () => Promise<unknown>, ok: string) {
    setErr(""); setMsg(""); setSaving(true);
    try { await fn(); setMsg(ok); reload(); } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  // Each political party (or "Independent") groups its campaigns; there is no separate organisation to manage.
  const PRIMARY_ORG_ID = 1;
  const parties = [...new Map((orgs.data ?? []).filter(o => o.id !== PRIMARY_ORG_ID).map(o => [o.name.trim().toLowerCase(), o.name.trim()])).values()];
  const partyName = np.party.trim() || "Independent";
  const SHORT_SEAT: Record<string, string> = { President: "President", Governor: "Governor", Senator: "Senator", "Woman Rep": "Woman Rep", MP: "MP", MCA: "MCA" };
  const areaTitle = area.seat === "President" ? "Kenya" : area.seat === "MCA" ? (area.ward ? `${area.ward} Ward` : "")
    : area.seat === "MP" ? area.constituency : area.county ? `${area.county} County` : "";
  const campaignName = [np.candidateName.trim(), [SHORT_SEAT[area.seat] ?? area.seat, areaTitle].filter(Boolean).join(", ")].filter(Boolean).join(" — ").slice(0, 160);
  const createCamp = (e: FormEvent) => {
    e.preventDefault();
    if (partyName.length < 2) { setErr("Enter the affiliated party (at least 2 characters), or leave it empty for an Independent candidate."); return; }
    const who = np.candidateName.trim();
    if (who.length < 2) { setErr("Enter the candidate’s name."); return; }
    void run(async () => {
      let party = orgs.data?.find(o => o.id !== PRIMARY_ORG_ID && o.name.trim().toLowerCase() === partyName.toLowerCase());
      if (!party) {
        const created = await api<Org>("tenancy/organisations", { method: "POST", body: JSON.stringify({ name: partyName }) });
        party = { ...created, campaignCount: 0 };
        const saved = party;
        qc.setQueryData<Org[]>(["t-orgs"], old => [...(old ?? []), saved]);
      }
      const campaign = await api<{ id: number; name: string }>("tenancy/campaigns", { method: "POST", body: JSON.stringify({
        organisationId: party.id, name: campaignName, electionDate: nc.electionDate || null,
        seat: area.seat, areaCounty: area.county || null, areaConstituency: area.constituency || null, areaWard: area.ward || null,
        ...profilePayload({ ...np, party: party.name }, true), // the party's existing spelling
      }) });
      setNc({ organisationId: "", name: "", seat: "", area: "", electionDate: "" });
      setNp(toProfile()); setArea({ seat: "", county: "", constituency: "", ward: "" });
      // Open the aspirant's campaign straight away: My Area shows the seat's county, constituency or ward.
      try { await openCampaignApi(campaign.id); }
      catch (e) {
        // Registered but not opened: show it filled in, with the reason.
        reload(); setEdit(null); setOpen(campaign.id); setJustCreated(campaign.id);
        window.setTimeout(() => document.getElementById(`campaign-${campaign.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
        throw new Error(`${who} is registered, but the campaign couldn’t be opened: ${(e as Error).message}`);
      }
    }, `${who} is registered. Opening their area…`);
  };
  // Opens the campaign on its seat's area. Shows the server's own reason if it can't.
  const openCampaign = (c: Camp) => { setErr(""); setMsg(`Opening ${c.candidateName || c.name}…`);
    void openCampaignApi(c.id).catch(e => { setMsg(""); setErr(`Couldn’t open “${c.candidateName || c.name}”: ${(e as Error).message}`); }); };
  const deleteCampaign = (c: Camp) => {
    const typed = window.prompt(`Permanently delete “${c.name}” and everything recorded in it (supporters, polling stations, results, messages…)? This can’t be undone.\n\nType the campaign name to confirm:`);
    if (typed === null) return;
    void run(() => api<{ removed: number }>(`tenancy/campaigns/${c.id}`, { method: "DELETE", body: JSON.stringify({ confirmName: typed }) })
      .then(() => { setOpen(null); setJustCreated(null); }), `“${c.name}” was deleted.`);
  };
  const endDemo = () => {
    const typed = window.prompt("End the demo? This permanently deletes the demo sign-ins (" + (demo.data?.accounts.join(", ") || "none") + "), their campaigns and everything recorded in them. They won't come back when the server restarts.\n\nType END DEMO to confirm:");
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== "END DEMO") { setErr("Type END DEMO exactly to end the demo."); return; }
    let summary = "";
    void run(async () => {
      const r = await api<{ campaigns: number; accounts: number; records: number }>("tenancy/demo/end", { method: "POST", body: "{}" });
      summary = `Demo ended: ${r.accounts} sign-ins, ${r.campaigns} campaigns and ${r.records} records deleted.`;
    }, "Demo ended.").then(() => { if (summary) setMsg(summary); });
  };
  const startDemo = () => void run(() => api("tenancy/demo/start", { method: "POST", body: "{}" }), "Demo started again: demo.mca, demo.mp and demo.governor can sign in.");
  const setStatus = (c: Camp, status: string) => run(() => api(`tenancy/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ status }) }), `${c.name} is now ${status}.`);
  const add = (c: Camp) => addUser && run(() => api(`tenancy/campaigns/${c.id}/members`, { method: "POST", body: JSON.stringify({ userId: Number(addUser) }) }).then(() => setAddUser("")), "Member added.");
  const remove = (c: Camp, u: U) => run(() => api(`tenancy/campaigns/${c.id}/members/${u.id}`, { method: "DELETE" }), `${u.name} removed from ${c.name}.`);
  const reset2fa = (u: U) => {
    const reason = window.prompt(`Reset two-factor sign-in for ${u.name}? They’ll set it up again at next sign-in.\n\nHow did you confirm it’s really them?`);
    if (reason) void run(() => api(`tenancy/users/${u.id}/reset-2fa`, { method: "POST", body: JSON.stringify({ reason }) }), `2FA reset for ${u.name}.`);
  };

  return <div className="space-y-6 min-w-0">
    <header><h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="text-primary" size={24} /> Campaigns</h1>
      <p className="text-sm text-muted-foreground max-w-3xl">One campaign per candidate. Click a campaign to open it: every module then shows that candidate’s seat and area. Each campaign keeps its own records, and people only see campaigns they’re members of.</p></header>
    {loadError && <div role="alert" className="border border-red-500/40 rounded-xl p-3 text-sm space-y-2">
      <p>Could not load campaign setup: {(loadError as Error).message}</p>
      <button type="button" onClick={() => { void orgs.refetch(); void camps.refetch(); void users.refetch(); void geo.refetch(); }} className={primary}>Retry loading</button>
    </div>}
    {err && <p role="alert" className="border border-red-500/40 bg-red-950/30 rounded-xl p-3 text-red-200 text-sm">{err}</p>}
    {msg && <p role="status" className="border border-green-500/40 rounded-xl p-3 text-green-200 text-sm">{msg}</p>}

    <div>
      <form onSubmit={createCamp} className="kaiti-glass rounded-2xl p-4 space-y-3">
        <h2 className="font-semibold">Register an aspirant</h2>
        <p className="text-xs text-muted-foreground">Choose the seat they are vying for and its area. Their campaign opens straight away, showing only that area’s wards and polling centres.</p>
        <CandidateFields v={np} set={setNp} parties={parties} required />
        <SeatPicker geo={geo.data} v={area} set={setArea} label="Seat the aspirant is vying for" />
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-sm">Election date<input type="date" value={nc.electionDate} onChange={e => setNc({ ...nc, electionDate: e.target.value })} className={inputCls} /></label>
        </div>
        <ProfileFields v={np} set={setNp} derived identity={false} />
        <button type="submit" disabled={saving || orgs.isPending || !!orgs.error} className={primary}><Plus size={16} /> {saving ? "Registering…" : "Register aspirant"}</button>
      </form>
    </div>

    {demo.data && (demo.data.accounts.length > 0 || demo.data.campaigns.length > 0 || demo.data.configured) && <section className="kaiti-glass rounded-2xl p-4 space-y-2 border border-amber-500/40">
      <h2 className="font-semibold">Demo aspirants</h2>
      {demo.data.accounts.length > 0 || demo.data.campaigns.length > 0 ? <>
        <p className="text-sm">Demo sign-ins: {demo.data.accounts.join(", ") || "none"} · campaigns: {demo.data.campaigns.map(c => c.name).join("; ") || "none"}</p>
        <p className="text-xs text-muted-foreground">When the demo is over, end it: the demo sign-ins, their campaigns and everything recorded in them are deleted and are not re-created when the server restarts.</p>
        <button type="button" disabled={saving} onClick={endDemo} className="text-sm border border-red-500/50 text-red-300 rounded-xl px-3 py-2 inline-flex gap-2 items-center"><Trash2 size={16} /> End demo and delete demo data</button>
      </> : <>
        <p className="text-sm">{demo.data.ended ? "The demo has ended; its sign-ins and data are deleted." : "No demo sign-ins exist."}</p>
        {demo.data.configured
          ? <><button type="button" disabled={saving} onClick={startDemo} className={primary}><Plus size={16} /> Start demo again</button>
            <p className="text-xs text-muted-foreground">DEMO_ASPIRANTS_PASSWORD is still set on the server. Remove it in Render when you no longer need demos.</p></>
          : <p className="text-xs text-muted-foreground">To run a demo again, set DEMO_ASPIRANTS_PASSWORD (16+ characters) in Render and restart.</p>}
      </>}
    </section>}

    <section className="kaiti-glass rounded-2xl p-4">
      <h2 className="font-semibold mb-3">Campaigns</h2>
      <ul className="divide-y divide-border/60">{camps.data?.map(c => { const members = users.data?.filter(u => u.campaignIds.includes(c.id)) ?? []; return <li key={c.id} id={`campaign-${c.id}`} className={`py-3 scroll-mt-24 ${justCreated === c.id ? "rounded-xl px-3 border border-primary/60 bg-primary/5" : ""}`}>
        <div className="flex flex-wrap justify-between gap-2 items-center">
          <button type="button" onClick={() => openCampaign(c)} className="text-left min-w-0 hover:text-primary" title="Open this campaign's area">
            <span className="font-medium block">{c.candidateName || c.name}{c.id === 1 && <span className="text-xs text-primary ml-2">primary</span>}{justCreated === c.id && <span className="text-xs text-primary ml-2">new</span>}</span>
            <span className="text-xs text-muted-foreground">{[c.candidateName ? c.name : null, c.party, c.seat, c.area, c.electionDate ? `election ${c.electionDate}` : null].filter(Boolean).join(" · ") || "Seat and area not set"}</span>
          </button>
          <div className="flex gap-2 items-center">
          <button type="button" onClick={() => { setOpen(open === c.id ? null : c.id); setEdit(null); }} aria-expanded={open === c.id} className="text-xs border border-border rounded-lg px-2 py-1.5">{open === c.id ? "Hide details" : "Details & members"}</button>
          <select aria-label={`Status of ${c.name}`} value={c.status} onChange={e => void setStatus(c, e.target.value)} className="bg-background border border-border rounded-lg p-1.5 text-sm">
            {["active", "paused", ...(c.id === 1 ? [] : ["archived"])].map(s => <option key={s} value={s}>{humanize(s)}</option>)}</select>
          </div>
        </div>
        {open === c.id && <div className="mt-3 pl-3 border-l-2 border-primary/50 space-y-2">
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {([["Candidate", c.candidateName], ["Affiliated party", c.party], ["Seat", c.seat], ["Area", c.area ?? c.constituency], ["Election date", c.electionDate],
              ["Wards", c.wards.length ? `${c.wards.length}: ${c.wards.join(", ")}` : null]] as [string, string | null][]).map(([k, v]) =>
              <div key={k} className={k === "Wards" ? "sm:col-span-2" : ""}><dt className="text-xs text-muted-foreground inline">{k}: </dt><dd className="inline">{v || <span className="text-muted-foreground">not set</span>}</dd></div>)}
            {c.profileSummary && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Profile</dt><dd className="whitespace-pre-line">{c.profileSummary}</dd></div>}
          </dl>
          {edit ? <form onSubmit={e => { e.preventDefault(); void run(() => api(`tenancy/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify(editArea.seat
              ? { seat: editArea.seat, areaCounty: editArea.county || null, areaConstituency: editArea.constituency || null, areaWard: editArea.ward || null, ...profilePayload(edit, true) }
              : profilePayload(edit)) }).then(() => setEdit(null)), "Campaign profile saved. People in this campaign see the change after reloading."); }} className="space-y-2">
            <p className="text-xs text-muted-foreground">Set the seat and area to load the wards automatically, or leave the seat empty and edit the wards by hand.</p>
            <SeatPicker geo={geo.data} v={editArea} set={setEditArea} optional />
            <ProfileFields v={edit} set={setEdit} derived={!!editArea.seat} parties={parties} />
            <div className="flex gap-2"><button type="submit" className={primary}>Save profile</button><button type="button" onClick={() => setEdit(null)} className="border border-border rounded-xl px-3 py-2 text-sm">Cancel</button></div>
          </form> : <button type="button" onClick={() => { setEdit(toProfile(c)); setEditArea({ seat: "", county: "", constituency: "", ward: "" }); }} className="text-xs border border-border rounded-lg px-2 py-1">{c.wards.length ? "Edit seat, wards & profile" : "Set seat & area"}</button>}
          <h3 className="font-semibold text-sm pt-2">Add members</h3>
          <p className="text-xs text-muted-foreground">People added here can sign in and open this campaign; they see only its area.{c.id === 1 ? " Users with no memberships also work here." : ""}</p>
          <ul className="text-sm space-y-1">{members.map(u => <li key={u.id} className="flex justify-between gap-2"><span>{u.name} <span className="text-xs text-muted-foreground">{u.role}</span></span>
            <button type="button" aria-label={`Remove ${u.name}`} onClick={() => void remove(c, u)} className="p-1"><X size={14} /></button></li>)}
            {members.length === 0 && <li className="text-xs text-muted-foreground">No members yet.</li>}</ul>
          <div className="flex gap-2"><select aria-label="Person to add" value={addUser} onChange={e => setAddUser(e.target.value)} className={inputCls}><option value="">Add a person…</option>
            {users.data?.filter(u => !u.campaignIds.includes(c.id)).map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select>
            <button type="button" disabled={!addUser} onClick={() => void add(c)} className={primary}><UserPlus size={16} /> Add</button></div>
          <button type="button" onClick={() => openCampaign(c)} className="text-sm border border-primary/60 text-primary rounded-xl px-3 py-2 inline-flex gap-2 items-center"><MapPin size={16} /> Open this campaign</button>
          {c.id !== 1 && <button type="button" onClick={() => deleteCampaign(c)} className="ml-2 text-sm border border-red-500/50 text-red-300 rounded-xl px-3 py-2 inline-flex gap-2 items-center"><Trash2 size={16} /> Delete permanently</button>}
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
