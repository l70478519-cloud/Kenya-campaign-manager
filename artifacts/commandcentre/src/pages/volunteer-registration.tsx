import { useState } from "react";
import { usePublicCampaign } from "@/lib/public-campaign";
import { CheckCircle2, UserPlus, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL;
const API = `${BASE}api/volunteers/register`;

export default function VolunteerRegistration() {
  const { wards: WARDS, areaLabel, name: campaignName } = usePublicCampaign();
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", ward: "", interests: "", availability: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = result?.details?.fieldErrors;
        const detailText = details ? Object.values(details).flat().filter(Boolean).join(" ") : "";
        throw new Error(detailText || result?.message || result?.error || "Registration could not be submitted. Please try again.");
      }
      setSuccess("Thank you. Your volunteer registration has been received and is awaiting review.");
      setForm({ firstName: "", lastName: "", phone: "", email: "", ward: "", interests: "", availability: "", message: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit registration. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-primary";
  const labelClass = "block text-[11px] font-mono tracking-wider text-muted-foreground mb-1.5";

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="bg-card border border-border p-6 md:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="border border-primary/40 p-3"><UserPlus className="w-6 h-6 text-primary" /></div>
            <div>
              <h1 className="text-xl font-bold tracking-wide">VOLUNTEER REGISTRATION</h1>
              <p className="text-xs text-muted-foreground mt-1">{campaignName ? `${campaignName} · ` : ""}{areaLabel ? `${areaLabel} volunteer registration` : "Volunteer registration"}{WARDS.length ? ` · ${WARDS.join(", ")}` : ""}</p>
            </div>
          </div>

          {success && <div role="status" className="mb-4 flex gap-2 border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />{success}</div>}
          {error && <div role="alert" className="mb-4 flex gap-2 border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelClass}>FIRST NAME *</label><input className={inputClass} required maxLength={100} value={form.firstName} onChange={e => update("firstName", e.target.value)} autoComplete="given-name" /></div>
              <div><label className={labelClass}>LAST NAME *</label><input className={inputClass} required maxLength={100} value={form.lastName} onChange={e => update("lastName", e.target.value)} autoComplete="family-name" /></div>
              <div><label className={labelClass}>PHONE *</label><input className={inputClass} required type="tel" maxLength={40} value={form.phone} onChange={e => update("phone", e.target.value)} autoComplete="tel" /></div>
              <div><label className={labelClass}>EMAIL (OPTIONAL)</label><input className={inputClass} type="email" maxLength={200} value={form.email} onChange={e => update("email", e.target.value)} autoComplete="email" /></div>
              <div className="md:col-span-2"><label className={labelClass}>WARD *</label><select className={inputClass} required value={form.ward} onChange={e => update("ward", e.target.value)}><option value="">Select your ward</option>{WARDS.map(ward => <option key={ward} value={ward}>{ward}</option>)}</select></div>
              <div><label className={labelClass}>AREA OF INTEREST</label><select className={inputClass} value={form.interests} onChange={e => update("interests", e.target.value)}><option value="">Select an area of interest</option><option value="Mobilization and community engagement">1. Mobilization and community engagement</option><option value="Communication and information sharing">2. Communication and information sharing</option><option value="Events and logistics">3. Events and logistics</option><option value="Administration and data management">4. Administration and data management</option><option value="Digital media and technology">5. Digital media and technology</option><option value="Community feedback and research">6. Community feedback and research</option><option value="Fundraising and resource support">7. Fundraising and resource support</option><option value="Election-day assistance">8. Election-day assistance</option></select></div>
              <div><label className={labelClass}>AVAILABILITY</label><input className={inputClass} maxLength={200} placeholder="Weekends, evenings…" value={form.availability} onChange={e => update("availability", e.target.value)} /></div>
              <div className="md:col-span-2"><label className={labelClass}>ADDITIONAL MESSAGE (OPTIONAL)</label><textarea className={inputClass} rows={4} maxLength={2000} value={form.message} onChange={e => update("message", e.target.value)} /></div>
            </div>
            <button disabled={busy} className="w-full bg-primary text-primary-foreground font-mono text-xs tracking-widest py-3 disabled:opacity-60">{busy ? "SUBMITTING…" : "SUBMIT REGISTRATION"}</button>
            <p className="text-[10px] leading-relaxed text-muted-foreground">Your details will be used to review this volunteer registration. Please provide accurate contact details; do not submit someone else's information without their permission.</p>
          </form>
        </div>
      </div>
    </main>
  );
}
