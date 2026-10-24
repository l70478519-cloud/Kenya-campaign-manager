import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapPin, ChevronDown, ChevronRight, Users, Vote, PieChart, Sparkles } from "lucide-react";
import { api } from "@/lib/records";
import { useTenancy } from "@/lib/tenancy";

type AreaWard = { ward: string; county: string; constituency: string; officialWard: string; via: string; centres: { code: string; name: string }[] };
type Area = {
  campaign: { name: string; candidate: string | null; seat: string | null } | null;
  scope: "national" | "county" | "constituency" | "ward" | "custom"; label: string; county: string | null; constituencies: string[];
  wards: AreaWard[]; counties: { county: string; code: string; constituencies: number; wards: number; centres: number }[];
  unmatched: string[]; ambiguous: { ward: string; constituencies: string[] }[];
  totals: { wards: number; centres: number }; source: { note: string };
};

const SEAT_LABEL: Record<string, string> = {
  President: "President", Governor: "County Governor", Senator: "Senator", "Woman Rep": "County Woman Representative",
  MP: "Member of the National Assembly (MP)", MCA: "Member of County Assembly (MCA)",
};

/** The active campaign's candidate, seat, wards and IEBC polling centres — nothing outside its area. */
export default function MyArea() {
  const tenancy = useTenancy();
  const active = tenancy.data?.campaigns.find(c => c.id === tenancy.data?.activeCampaignId);
  const area = useQuery<Area>({ queryKey: ["my-area", tenancy.data?.activeCampaignId], queryFn: () => api<Area>("geography/my-area") });
  const [open, setOpen] = useState<string | null>(null);
  const a = area.data;
  const stat = (label: string, value: string | number) => <div className="kaiti-glass rounded-xl p-3"><p className="text-xs text-muted-foreground uppercase">{label}</p><p className="text-xl font-bold text-primary">{value}</p></div>;

  return <div className="space-y-6 min-w-0">
    <header className="space-y-1">
      <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="text-primary" size={24} /> {a?.label ?? "My area"}</h1>
      <p className="text-sm text-muted-foreground">
        {active?.candidateName ?? a?.campaign?.candidate ?? "Candidate not set"}
        {active?.seat ? ` · ${SEAT_LABEL[active.seat] ?? active.seat}` : ""}
        {active?.party ? ` · ${active.party}` : ""}
        {active?.electionDate ? ` · election ${active.electionDate}` : ""}
      </p>
    </header>

    {active?.profileSummary && <section className="kaiti-glass rounded-2xl p-4 space-y-2">
      <h2 className="font-semibold">Candidate profile</h2>
      <p className="text-sm whitespace-pre-line">{active.profileSummary}</p>
      <p className="text-xs text-muted-foreground">The AI assistant, speeches and briefs use this profile. Edit it in Settings → Campaigns.</p>
    </section>}

    {area.isPending && <p role="status" className="text-sm text-muted-foreground">Loading your area…</p>}
    {area.error && <p role="alert" className="border border-red-500/40 rounded-xl p-3 text-sm">Could not load your area: {(area.error as Error).message}</p>}

    {a && <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat(a.scope === "national" ? "Counties" : "County", a.scope === "national" ? a.counties.length : a.county ?? "—")}
        {stat("Constituencies", a.scope === "national" ? 290 : a.constituencies.length)}
        {stat("Wards", a.totals.wards)}
        {stat("Polling centres", a.totals.centres.toLocaleString())}
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/members" className="kaiti-glass rounded-xl px-3 py-2 flex gap-2 items-center"><Users size={16} /> Add supporters by ward</Link>
        <Link href="/segments" className="kaiti-glass rounded-xl px-3 py-2 flex gap-2 items-center"><PieChart size={16} /> Segments</Link>
        <Link href="/election-day" className="kaiti-glass rounded-xl px-3 py-2 flex gap-2 items-center"><Vote size={16} /> Polling stations &amp; agents</Link>
        <Link href="/strategist" className="kaiti-glass rounded-xl px-3 py-2 flex gap-2 items-center"><Sparkles size={16} /> AI strategist</Link>
      </nav>

      {(a.unmatched.length > 0 || a.ambiguous.length > 0) && <div role="alert" className="border border-amber-500/50 rounded-xl p-3 text-sm space-y-1">
        {a.unmatched.length > 0 && <p>Not in the IEBC ward list: {a.unmatched.join(", ")}. Check the campaign's seat and area.</p>}
        {a.ambiguous.map(x => <p key={x.ward}>Two wards are called {x.ward}: {x.constituencies.join(" and ")}. Both are shown.</p>)}
      </div>}

      {a.scope === "national" ? <section className="kaiti-glass rounded-2xl p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Counties</h2>
        <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1">County</th><th>Constituencies</th><th>Wards</th><th>Polling centres</th></tr></thead>
          <tbody>{a.counties.map(c => <tr key={c.code} className="border-t border-border/60"><td className="py-1">{c.code} · {c.county}</td><td>{c.constituencies}</td><td>{c.wards}</td><td>{c.centres.toLocaleString()}</td></tr>)}</tbody></table>
      </section> : <section className="kaiti-glass rounded-2xl p-4 space-y-4">
        <h2 className="font-semibold">Wards and polling centres</h2>
        {a.constituencies.map(k => <div key={k} className="space-y-1">
          {a.constituencies.length > 1 && <h3 className="text-sm font-semibold text-primary">{k} Constituency</h3>}
          <ul className="divide-y divide-border/60">{a.wards.filter(w => w.constituency === k).map(w => {
            const id = `${w.constituency}|${w.officialWard}`;
            return <li key={id} className="py-2">
              <button type="button" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} className="w-full flex justify-between items-center text-left text-sm">
                <span className="flex items-center gap-1">{open === id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{w.officialWard} Ward
                  {w.via === "legacy-name" && <span className="text-xs text-muted-foreground ml-2">(saved as {w.ward})</span>}</span>
                <span className="text-muted-foreground">{w.centres.length} centres</span>
              </button>
              {open === id && <ul className="mt-2 ml-6 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">{w.centres.map(c => <li key={c.code}>{c.name}</li>)}</ul>}
            </li>;
          })}</ul>
        </div>)}
      </section>}
      <p className="text-xs text-muted-foreground">{a.source.note} Load them as stations in Election Day → Stations.</p>
    </>}
  </div>;
}
