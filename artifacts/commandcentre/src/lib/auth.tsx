import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

const BASE = import.meta.env.BASE_URL;

export type PermLevel = "none" | "read" | "write";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  username: string | null;
  role: string;
  status: string;
}

interface AuthState {
  user: AuthUser | null;
  permissions: Record<string, PermLevel>;
  loading: boolean;
  /** Role requires 2FA and the user hasn't set it up yet. */
  mfaEnrollmentRequired: boolean;
  mfaEnabled: boolean;
  /** Signed in with a temporary password; must choose their own before anything else. */
  passwordChangeRequired: boolean;
  /** Resolves "mfa" when a second-factor code is needed next. */
  login: (identifier: string, password: string) => Promise<"ok" | "mfa">;
  verifyMfa: (code: string) => Promise<{ usedRecoveryCode: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (module: string, level?: PermLevel) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Record<string, PermLevel>>({});
  const [loading, setLoading] = useState(true);
  const [mfaEnrollmentRequired, setMfaEnrollmentRequired] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setUser(d.user);
        setPermissions(d.permissions ?? {});
        setMfaEnrollmentRequired(d.mfaEnrollmentRequired === true);
        setMfaEnabled(d.mfaEnabled === true);
        setPasswordChangeRequired(d.passwordChangeRequired === true);
      } else {
        setUser(null);
        setPermissions({});
      }
    } catch {
      setUser(null);
      setPermissions({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await fetch(`${BASE}api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error ?? "Login failed");
    }
    const d = await res.json();
    if (d.mfaRequired) return "mfa" as const;
    setUser(d.user);
    setPermissions(d.permissions ?? {});
    setMfaEnrollmentRequired(d.mfaEnrollmentRequired === true);
    setPasswordChangeRequired(d.passwordChangeRequired === true);
    return "ok" as const;
  }, []);

  const verifyMfa = useCallback(async (code: string) => {
    const res = await fetch(`${BASE}api/auth/mfa/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(d.error ?? "Verification failed"), { status: res.status });
    setUser(d.user);
    setPermissions(d.permissions ?? {});
    setMfaEnabled(true);
    setMfaEnrollmentRequired(false);
    setPasswordChangeRequired(d.passwordChangeRequired === true);
    return { usedRecoveryCode: d.usedRecoveryCode === true };
  }, []);

  const logout = useCallback(async () => {
    try { await fetch(`${BASE}api/auth/logout`, { method: "POST", credentials: "include" }); } catch { /* ignore */ }
    setUser(null);
    setPermissions({});
    setMfaEnrollmentRequired(false);
    setMfaEnabled(false);
    setPasswordChangeRequired(false);
  }, []);

  const can = useCallback((module: string, level: PermLevel = "read") => {
    // Older database rows may store the system role as SUPER_ADMIN,
    // super_admin, or super-admin. Normalize those variants in the UI too.
    const normalizedRole = (user?.role ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedRole === "superadmin") return true;
    const have = permissions[module] ?? "none";
    return level === "read" ? have === "read" || have === "write" : have === "write";
  }, [permissions, user?.role]);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, mfaEnrollmentRequired, mfaEnabled, passwordChangeRequired, login, verifyMfa, logout, refresh, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
