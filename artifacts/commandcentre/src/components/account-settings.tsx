import { useState, type FormEvent } from "react";
import { KeyRound, Mail } from "lucide-react";
import { api } from "@/lib/records";
import { useAuth } from "@/lib/auth";

const field = "block w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mt-1";
const primary = "bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm disabled:opacity-50";

/**
 * Change the signed-in user's own password. With `forced`, it is the first
 * sign-in screen for a temporary password (root email or admin-issued).
 */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const { refresh } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    if (next !== confirm) { setErr("The new passwords don’t match."); return; }
    setBusy(true);
    try {
      await api("auth/account/password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      setCurrent(""); setNext(""); setConfirm("");
      setMsg("Password changed. Other devices signed in to this account have been signed out.");
      await refresh();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return <form onSubmit={e => void submit(e)} className="space-y-3">
    <label className="text-sm block">{forced ? "Temporary password (the one you just signed in with)" : "Current password"}
      <input type="password" required autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className={field} /></label>
    <label className="text-sm block">New password
      <input type="password" required minLength={12} autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} className={field} />
      <span className="block text-xs text-muted-foreground mt-1">At least 12 characters. A short phrase you can remember works well.</span></label>
    <label className="text-sm block">Confirm new password
      <input type="password" required minLength={12} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={field} /></label>
    {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
    {msg && <p role="status" className="text-sm text-green-200">{msg}</p>}
    <button type="submit" disabled={busy} className={primary}>{busy ? "Saving…" : forced ? "Set my password and continue" : "Change password"}</button>
  </form>;
}

function ChangeEmailForm() {
  const { user, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setMsg(""); setBusy(true);
    try {
      await api("auth/account/email", { method: "POST", body: JSON.stringify({ currentPassword: current, newEmail: email }) });
      setEmail(""); setCurrent("");
      setMsg("Sign-in email changed. Use the new email next time you sign in.");
      await refresh();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return <form onSubmit={e => void submit(e)} className="space-y-3">
    <p className="text-sm">You sign in with <strong className="break-all">{user?.email}</strong>{user?.username ? <> or the username <strong>{user.username}</strong></> : null}.</p>
    <label className="text-sm block">New email
      <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={field} /></label>
    <label className="text-sm block">Current password
      <input type="password" required autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className={field} /></label>
    {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
    {msg && <p role="status" className="text-sm text-green-200">{msg}</p>}
    <button type="submit" disabled={busy} className={primary}>{busy ? "Saving…" : "Change email"}</button>
  </form>;
}

/** Sign-in details on the Account security page. */
export function AccountSettings() {
  return <>
    <section className="kaiti-glass rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Mail size={18} /> Sign-in email</h2>
      <ChangeEmailForm />
    </section>
    <section className="kaiti-glass rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><KeyRound size={18} /> Password</h2>
      <ChangePasswordForm />
    </section>
  </>;
}
