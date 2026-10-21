import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Shield, AlertTriangle, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth";


export default function Login() {
  const [, setLocation] = useLocation();
  const { user, loading, login, verifyMfa } = useAuth();
  const [step, setStep] = useState<"password" | "code">("password");
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) setLocation("/dashboard");
  }, [loading, user, setLocation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await login(identifier.trim(), password);
      if (result === "mfa") { setStep("code"); setPassword(""); return; }
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err?.message?.toUpperCase() || "ACCESS DENIED — INVALID CREDENTIALS.");
    } finally {
      setSubmitting(false);
    }
  };



  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const r = await verifyMfa(code.trim());
      setLocation(r.usedRecoveryCode ? "/security?recovery=used" : "/dashboard");
    } catch (err: any) {
      if (err?.status === 401 && /expired/i.test(err.message)) { setStep("password"); setCode(""); }
      setError(err?.message || "That code didn’t match.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="kaiti-shell min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[1fr_1fr]">
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden border-r border-emerald-900/60 px-5 py-10">
        <div className="pointer-events-none absolute inset-0 opacity-[0.035] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
        <div className="relative z-10 w-full max-w-lg">
          <div className="mb-8 flex flex-col items-center text-center">
            <div aria-label="Command Centre emblem" role="img" className="mb-5 flex h-20 w-20 items-center justify-center rounded-full kenya-emblem text-2xl font-black tracking-tight">C</div>
            <h1 className="text-3xl font-bold tracking-tight">Command<span className="text-primary">Centre</span></h1>
            <p className="mt-3 font-mono text-xs tracking-[0.18em] text-muted-foreground">SECURE CONSTITUENCY OPERATIONS</p>
          </div>

          <div className="kaiti-glass relative rounded-2xl border border-emerald-800/70 bg-card/90 p-7 shadow-2xl shadow-black/30 sm:p-9">
            <div className="absolute left-0 top-0 h-1 w-full rounded-t-xl kenya-flag-band" />
            {step === "code" ? (
              <form onSubmit={handleCode} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="mfa-code" className="text-sm font-medium">Authentication code</label>
                  <p className="text-xs text-muted-foreground">Open your authenticator app and enter the 6-digit code for Command Centre. Lost your phone? Enter one of your recovery codes instead.</p>
                  <input
                    id="mfa-code"
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode="text"
                    maxLength={11}
                    value={code}
                    onChange={e => { setCode(e.target.value); setError(""); }}
                    className="w-full border border-border bg-background px-3 py-3 text-lg tracking-[0.3em] font-mono text-foreground outline-none transition-colors focus:border-primary"
                    placeholder="123456"
                  />
                </div>
                {error && (
                  <div role="alert" className="flex items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
                    <p className="text-xs font-mono text-primary">{error}</p>
                  </div>
                )}
                <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500 bg-emerald-700 p-3 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
                  <Shield className="h-4 w-4" />
                  {submitting ? "Verifying…" : "Verify and sign in"}
                </button>
                <button type="button" onClick={() => { setStep("password"); setCode(""); setError(""); }} className="w-full text-xs text-muted-foreground underline">Use a different account</button>
              </form>
            ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="operative-id" className="text-sm font-medium">Operative ID (username or email)</label>
                <input
                  id="operative-id"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); setError(""); }}
                  className="w-full border border-border bg-background px-3 py-3 text-sm font-mono text-foreground outline-none transition-colors focus:border-primary"
                  placeholder="username or name@example.com"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="passcode" className="text-sm font-medium">Passcode</label>
                <input
                  id="passcode"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  className="w-full border border-border bg-background px-3 py-3 text-sm font-mono text-foreground outline-none transition-colors focus:border-primary"
                  placeholder="Enter your assigned passcode"
                />
              </div>

              {error && (
                <div role="alert" className="flex items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs font-mono text-primary">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500 bg-emerald-700 p-3 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Shield className="h-4 w-4" />
                {submitting ? "AUTHENTICATING…" : "INITIALIZE UPLINK"}
              </button>
            </form>
            )}

            <div className="mt-7 border-t border-border pt-4 text-center">
              <p className="text-[10px] font-mono tracking-widest text-muted-foreground">UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED</p>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-3 px-2 text-sm text-muted-foreground">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Use the credentials assigned to you. Need an account or password reset? Contact your system administrator.</p>
          </div>
        </div>
      </section>

      <aside className="relative hidden min-h-screen overflow-hidden kenya-login-aside lg:flex lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="relative z-10 text-center">
          <div className="select-none text-[clamp(7rem,18vw,15rem)] font-black leading-none tracking-tighter text-emerald-400/[0.12]">C</div>
          <div className="-mt-5 font-mono text-sm tracking-[0.3em] text-foreground/80">CONSTITUENCY OPERATIONS SYSTEM</div>
          <div className="mt-3 space-y-2 font-mono text-xs tracking-widest text-muted-foreground/70">
            <p>[ SECURE_ACCESS ]</p>
            <p>[ ROLE_BASED_PERMISSIONS ]</p>
            <p>[ AUDITABLE_OPERATIONS ]</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
