import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Copy, Download, KeyRound, Smartphone } from "lucide-react";
import { api } from "@/lib/records";
import { useAuth } from "@/lib/auth";
import { AccountSettings } from "@/components/account-settings";

type Status = { enabled: boolean; required: boolean; recoveryCodesLeft: number };

const input = "block w-full bg-background border border-border rounded-lg p-3 font-mono tracking-[0.3em] text-lg";
const primary = "bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm disabled:opacity-50";
const secondary = "border border-border rounded-xl px-3 py-2 text-sm flex items-center gap-2";

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Command Centre recovery codes (each works once)\n${codes.join("\n")}\n`;
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = "kaitios-recovery-codes.txt"; a.click(); URL.revokeObjectURL(a.href); };
  return <section className="kaiti-glass rounded-2xl p-5 space-y-3 border border-amber-500/40">
    <h2 className="font-semibold flex items-center gap-2"><KeyRound size={18} /> Save your recovery codes</h2>
    <p className="text-sm text-muted-foreground">If you lose your phone, each of these codes signs you in once. They won’t be shown again. Store them somewhere safe and offline.</p>
    <ol className="grid grid-cols-2 gap-2 font-mono text-sm">{codes.map(c => <li key={c} className="bg-background/60 rounded p-2 text-center">{c}</li>)}</ol>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={secondary} onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); }}><Copy size={14} /> {copied ? "Copied" : "Copy"}</button>
      <button type="button" className={secondary} onClick={download}><Download size={14} /> Download</button>
      <button type="button" className={primary} onClick={onDone}>I’ve saved them</button>
    </div>
  </section>;
}

export default function Security() {
  const { refresh, mfaEnrollmentRequired } = useAuth();
  const status = useQuery<Status>({ queryKey: ["mfa-status"], queryFn: () => api<Status>("auth/mfa/status") });
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const usedRecovery = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("recovery") === "used";

  useEffect(() => { setErr(""); }, [code]);

  async function start() {
    setBusy(true); setErr("");
    try { setSetup(await api("auth/mfa/setup", { method: "POST" })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function enable(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api<{ recoveryCodes: string[] }>("auth/mfa/enable", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      setCodes(r.recoveryCodes); setSetup(null); setCode("");
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  async function regenerate(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { const r = await api<{ recoveryCodes: string[] }>("auth/mfa/recovery-codes", { method: "POST", body: JSON.stringify({ code: code.trim() }) }); setCodes(r.recoveryCodes); setCode(""); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  async function disable() {
    if (!window.confirm("Turn off two-factor sign-in? Your account will be protected by your password only.")) return;
    setBusy(true);
    try { await api("auth/mfa/disable", { method: "POST", body: JSON.stringify({ code: code.trim() }) }); setCode(""); setMsg("Two-factor sign-in is off."); await status.refetch(); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  async function finish() { setCodes(null); await status.refetch(); await refresh(); setMsg("Two-factor sign-in is on."); }

  const s = status.data;
  const grouped = setup?.secret.match(/.{1,4}/g)?.join(" ") ?? "";

  return <div className="space-y-5 max-w-2xl min-w-0">
    <header>
      <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="text-primary" size={24} /> Account security</h1>
      <p className="text-sm text-muted-foreground">Your sign-in email and password, and optional two-factor sign-in: a code from your phone after your password, so a stolen password alone can’t open your account.</p>
    </header>
    {mfaEnrollmentRequired && !codes && <p role="alert" className="border border-amber-500/50 bg-amber-950/30 rounded-xl p-3 text-sm text-amber-100">Your role requires two-factor sign-in. Set it up below to continue to Command Centre.</p>}
    {usedRecovery && <p role="alert" className="border border-amber-500/50 rounded-xl p-3 text-sm">You signed in with a recovery code. If you no longer have your authenticator app, ask an administrator to reset two-factor sign-in, then set it up again.</p>}
    {msg && <p role="status" className="border border-green-500/40 rounded-xl p-3 text-sm text-green-200">{msg}</p>}
    {codes && <RecoveryCodes codes={codes} onDone={() => void finish()} />}

    {!codes && s && !s.enabled && <section className="kaiti-glass rounded-2xl p-5 space-y-4">
      {!setup ? <>
        <h2 className="font-semibold flex items-center gap-2"><Smartphone size={18} /> Set up two-factor sign-in</h2>
        <p className="text-sm">You’ll need an authenticator app such as Google Authenticator, Microsoft Authenticator or Authy on your phone.</p>
        <button type="button" disabled={busy} onClick={() => void start()} className={primary}>{busy ? "Starting…" : "Start setup"}</button>
      </> : <form onSubmit={e => void enable(e)} className="space-y-4">
        <ol className="space-y-4 text-sm list-decimal pl-5">
          <li>In your authenticator app, add an account. On this phone you can <a href={setup.otpauthUri} className="underline text-primary">open it in your authenticator app</a>; on a computer, choose “enter a setup key” and type:
            <div className="mt-2 flex items-center gap-2"><code className="bg-background/70 rounded px-3 py-2 font-mono tracking-wider text-base select-all break-all">{grouped}</code>
              <button type="button" aria-label="Copy setup key" className="p-2 border border-border rounded-lg" onClick={() => void navigator.clipboard.writeText(setup.secret)}><Copy size={14} /></button></div>
            <span className="block text-xs text-muted-foreground mt-1">Account: Command Centre · type: time-based</span></li>
          <li><label htmlFor="enrol-code">Enter the 6-digit code the app shows</label>
            <input id="enrol-code" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} value={code} onChange={e => setCode(e.target.value)} className={`${input} mt-2 max-w-[12rem]`} /></li>
        </ol>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
        <button type="submit" disabled={busy} className={primary}>{busy ? "Checking…" : "Turn on two-factor sign-in"}</button>
      </form>}
    </section>}

    {!codes && s?.enabled && <section className="kaiti-glass rounded-2xl p-5 space-y-4">
      <p className="text-sm"><strong className="text-green-300">Two-factor sign-in is on.</strong> {s.recoveryCodesLeft} recovery code{s.recoveryCodesLeft === 1 ? "" : "s"} left.{s.recoveryCodesLeft < 3 && " Generate new ones soon."}</p>
      <form onSubmit={e => void regenerate(e)} className="space-y-3">
        <label htmlFor="manage-code" className="text-sm block">Current code from your authenticator app
          <input id="manage-code" required autoComplete="one-time-code" inputMode="numeric" maxLength={7} value={code} onChange={e => setCode(e.target.value)} className={`${input} mt-1 max-w-[12rem]`} /></label>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primary}>Generate new recovery codes</button>
          {!s.required && <button type="button" disabled={busy || !code} onClick={() => void disable()} className={secondary}>Turn off two-factor sign-in</button>}
        </div>
        {s.required && <p className="text-xs text-muted-foreground">Your role requires two-factor sign-in, so it can’t be turned off.</p>}
      </form>
    </section>}
    {status.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
    {!mfaEnrollmentRequired && <AccountSettings />}
  </div>;
}
