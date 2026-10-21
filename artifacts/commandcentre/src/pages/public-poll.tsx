import { useEffect, useState } from "react";
import { usePublicCampaign } from "@/lib/public-campaign";
import { useRoute } from "wouter";

const BASE = import.meta.env.BASE_URL;
type Poll = { id: number; title: string; description?: string; status: string; deadline?: string; options: { label: string }[] };

function VoluntaryRegistration() {
  const { wards: WARDS, areaLabel, name: campaignName } = usePublicCampaign();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [ward, setWard] = useState("");
  const [consent, setConsent] = useState(false);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function register(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch(`${BASE}api/surveys/public/participant-registration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: name, phone, ward, thankYouSmsConsent: consent }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Registration failed");
      setComplete(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Registration failed"); }
    finally { setBusy(false); }
  }
  return <div className="border-t border-border pt-5 space-y-3">
    <h2 className="text-lg font-bold">Optional contact registration</h2>
    <p className="text-xs text-muted-foreground">Register separately to receive an optional one-time participation thank-you message. Your contact details are not connected to how you voted. Registration is not required to vote.</p>
    {complete ? <p role="status" className="text-green-400">Thank you. Your contact registration is saved.</p> : <form onSubmit={register} className="space-y-3">
      <label className="block text-sm">Full name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full bg-background border border-border p-3" /></label>
      <label className="block text-sm">Phone number<input required type="tel" inputMode="tel" placeholder="0712 345 678" value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full bg-background border border-border p-3" /></label>
      <label className="block text-sm">Ward<select required value={ward} onChange={e=>setWard(e.target.value)} className="mt-1 w-full bg-background border border-border p-3"><option value="">Select ward</option>{WARDS.map(w=><option key={w} value={w}>{w}</option>)}</select></label>
      <label className="flex gap-2 text-xs items-start"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />I agree to receive a one-time thank-you SMS. This is optional and not consent to campaign marketing.</label>
      <button disabled={busy} type="submit" className="w-full border border-primary text-primary p-3 disabled:opacity-50">{busy ? "Saving…" : "Register contact details"}</button>
      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
    </form>}
  </div>;
}

export default function PublicPoll() {
  const [, params] = useRoute("/poll/:id");
  const id = Number(params?.id);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!Number.isSafeInteger(id) || id < 1) { setError("Invalid poll link"); setLoading(false); return; }
    fetch(`${BASE}api/surveys/public/polls/${id}`, { credentials: "include" })
      .then(async r => { if (!r.ok) throw new Error("Poll unavailable"); return r.json(); })
      .then(setPoll).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [id]);
  async function submit() {
    if (choice === null || sending) return;
    setSending(true); setError("");
    try {
      const r = await fetch(`${BASE}api/surveys/polls/${id}/vote`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionIndex: choice }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not record response");
      setSubmitted(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Submission failed"); }
    finally { setSending(false); }
  }
  return <main className="min-h-dvh bg-background text-foreground px-4 py-10 flex justify-center">
    <section className="w-full max-w-xl h-fit bg-card border border-border p-5 sm:p-8 space-y-5">
      <div className="font-mono text-xs tracking-widest text-primary">PUBLIC OPINION POLL</div>
      {loading ? <p>Loading poll…</p> : submitted ? <div className="py-12 text-center space-y-3"><h1 className="text-2xl font-bold">Thank you for voting</h1><p className="text-sm text-muted-foreground">Your anonymous response was recorded.</p></div> : poll ? <>
        <h1 className="text-xl sm:text-2xl font-bold">{poll.title}</h1>
        {poll.description && <p className="text-sm text-muted-foreground">{poll.description}</p>}
        <p className="text-xs text-muted-foreground">Your selection is anonymous. We do not request your name or phone number, and do not link an individual to a candidate choice.</p>
        {poll.status !== "active" || (poll.deadline && poll.deadline < new Date().toISOString().slice(0,10)) ? <p className="text-sm text-primary">This poll is closed.</p> : <>
          <div className="space-y-2" role="radiogroup" aria-label="Poll choices">
            {poll.options.map((option, index) => <label key={index} className="flex gap-3 items-center border border-border p-3 cursor-pointer hover:bg-secondary"><input type="radio" name="poll-option" checked={choice === index} onChange={() => setChoice(index)} /><span>{option.label}</span></label>)}
          </div>
          <button type="button" disabled={choice === null || sending} onClick={submit} className="w-full bg-primary text-primary-foreground font-bold p-3 disabled:opacity-50">{sending ? "Submitting…" : "Submit vote"}</button>
        </>}
      </> : null}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {submitted && <VoluntaryRegistration />}
      <p className="text-xs text-muted-foreground">This is an informal, voluntary online poll and is not an official election or representative scientific survey. Duplicate checks are limited to the current browser session.</p>
    </section>
  </main>;
}
