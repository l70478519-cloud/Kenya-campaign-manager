import { useState, useEffect, useCallback } from "react";
import {
  Users, Shield, ScrollText, Settings2, Plus, X, Trash2,
  Edit2, Save, RefreshCw, Copy, Check, AlertTriangle, Eye,
  EyeOff, UserCheck, UserX, Mail, Phone, Key, Lock, Unlock,
  ChevronDown, ChevronUp, Search, Filter, Download, Clock,
  Activity, ShieldCheck, ShieldOff, Database, Globe, Zap,
  Info, CheckCircle, XCircle, ToggleLeft, ToggleRight, Crown
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const MODULES = [
  "dashboard", "voters", "constituents", "segmentation", "messaging",
  "field-ops", "volunteers", "intelligence", "events", "narrative",
  "campaign-plan", "kol", "finance", "election-day", "credentials", "admin",
];
const MODULE_LABELS: Record<string, string> = {
  "dashboard": "COMMAND OVERVIEW", "voters": "VOTERS", "constituents": "CONSTITUENT DB",
  "segmentation": "SEGMENTATION", "messaging": "MESSAGING", "field-ops": "FIELD OPERATIONS",
  "volunteers": "VOLUNTEER CMD", "intelligence": "INTEL GATHERING", "events": "EVENT LOGISTICS",
  "narrative": "NARRATIVE CMD", "campaign-plan": "CAMPAIGN COUNTDOWN", "kol": "KOL INFLUENCE",
  "finance": "FINANCE OPS", "election-day": "ELECTION DAY OPS", "credentials": "CREDENTIALS HUB",
  "admin": "SYSTEM ADMIN",
};
const PERMISSION_LEVELS = ["none", "read", "write"] as const;
type PermLevel = typeof PERMISSION_LEVELS[number];

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400 border-green-400/30",
  inactive: "text-muted-foreground border-border",
  suspended: "text-red-400 border-red-400/30",
  invited: "text-yellow-400 border-yellow-400/30",
};
const SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-400 border-blue-400/30",
  warning: "text-yellow-400 border-yellow-400/30",
  error: "text-red-400 border-red-400/30",
  critical: "text-red-500 border-red-500/40 bg-red-500/5",
};
const CONFIG_CATEGORIES = ["general", "campaign", "security", "notifications", "integrations"] as const;

type Tab = "users" | "roles" | "audit" | "config";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}api/admin${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) {
    let msg = await res.text();
    try { msg = JSON.parse(msg).error ?? msg; } catch { /* keep raw */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function Badge({ label, className }: { label: string; className?: string }) {
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 shrink-0 ${className ?? "text-muted-foreground border-border"}`}>[{label}]</span>;
}

function PermToggle({ level, onChange }: { level: PermLevel; onChange: (l: PermLevel) => void }) {
  const next: Record<PermLevel, PermLevel> = { none: "read", read: "write", write: "none" };
  const colors: Record<PermLevel, string> = {
    none: "bg-secondary text-muted-foreground",
    read: "bg-blue-500/20 text-blue-400 border-blue-400/40",
    write: "bg-green-500/20 text-green-400 border-green-400/40",
  };
  return (
    <button onClick={() => onChange(next[level])} className={`font-mono text-[9px] border px-2 py-0.5 w-12 text-center transition-all ${colors[level]}`}>
      {level.toUpperCase()}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 font-mono text-[9px] border border-border px-2 py-0.5 hover:border-primary hover:text-primary transition-colors">
      {copied ? <><Check className="w-2.5 h-2.5 text-green-400" /> COPIED</> : <><Copy className="w-2.5 h-2.5" /> COPY</>}
    </button>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>("users");

  // ── Users ──
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState<Record<string, string>>({ role: "viewer" });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [inviteError, setInviteError] = useState("");
  const [resetCreds, setResetCreds] = useState<any>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editUserForm, setEditUserForm] = useState<Record<string, string>>({});
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [roles, setRoles] = useState<any[]>([]);

  // ── Roles ──
  const [rolesLoading, setRolesLoading] = useState(false);
  const [showNewRole, setShowNewRole] = useState(false);
  const [roleForm, setRoleForm] = useState<Record<string, any>>({ permissions: {}, color: "#DB143C" });
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [editRolePerms, setEditRolePerms] = useState<Record<string, PermLevel>>({});
  const [editRoleMeta, setEditRoleMeta] = useState<Record<string, string>>({});

  // ── Audit ──
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditModule, setAuditModule] = useState("all");
  const [auditSeverity, setAuditSeverity] = useState("all");

  // ── Config ──
  const [configs, setConfigs] = useState<any[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [editConfigValue, setEditConfigValue] = useState("");
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});
  const [activeConfigCat, setActiveConfigCat] = useState<string>("all");

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try { setUsers(await apiFetch("/users")); } catch { } finally { setUsersLoading(false); }
  }, []);
  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try { setRoles(await apiFetch("/roles")); } catch { } finally { setRolesLoading(false); }
  }, []);
  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try { setAuditLogs(await apiFetch("/audit")); } catch { } finally { setAuditLoading(false); }
  }, []);
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try { setConfigs(await apiFetch("/config")); } catch { } finally { setConfigLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "users") { loadUsers(); loadRoles(); }
    if (tab === "roles") { loadRoles(); }
    if (tab === "audit") loadAudit();
    if (tab === "config") loadConfig();
  }, [tab, loadUsers, loadRoles, loadAudit, loadConfig]);

  async function createUser() {
    if (!inviteForm.name || !inviteForm.email) return;
    setInviting(true);
    setInviteError("");
    try {
      const result = await apiFetch("/users", { method: "POST", body: JSON.stringify(inviteForm) });
      setInviteResult(result);
      await loadUsers();
    } catch (e: any) {
      setInviteError(e?.message || "Failed to create user");
    } finally { setInviting(false); }
  }

  async function resetPassword(id: number) {
    try {
      const result = await apiFetch(`/users/${id}/reset-password`, { method: "POST" });
      setResetCreds(result);
    } catch { }
  }

  async function saveUser(id: number) {
    await apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(editUserForm) });
    await loadUsers();
    setEditingUserId(null);
  }

  async function setUserStatus(id: number, status: string) {
    await apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadUsers();
  }

  async function deleteUser(id: number) {
    await apiFetch(`/users/${id}`, { method: "DELETE" });
    await loadUsers();
  }

  async function createRole() {
    if (!roleForm.name) return;
    const perms: Record<string, PermLevel> = {};
    MODULES.forEach(m => { perms[m] = (roleForm.permissions?.[m] as PermLevel) ?? "none"; });
    await apiFetch("/roles", { method: "POST", body: JSON.stringify({ ...roleForm, permissions: perms }) });
    await loadRoles();
    setShowNewRole(false);
    setRoleForm({ permissions: {}, color: "#DB143C" });
  }

  async function saveRole(id: number) {
    await apiFetch(`/roles/${id}`, { method: "PATCH", body: JSON.stringify({ ...editRoleMeta, permissions: editRolePerms }) });
    await loadRoles();
    setEditingRoleId(null);
  }

  async function deleteRole(id: number) {
    await apiFetch(`/roles/${id}`, { method: "DELETE" });
    await loadRoles();
  }

  async function saveConfig(id: number) {
    await apiFetch(`/config/${id}`, { method: "PATCH", body: JSON.stringify({ value: editConfigValue }) });
    await loadConfig();
    setEditingConfigId(null);
  }

  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
  });
  const filteredAudit = auditLogs.filter(l => {
    if (auditModule !== "all" && l.module !== auditModule) return false;
    if (auditSeverity !== "all" && l.severity !== auditSeverity) return false;
    return true;
  });
  const filteredConfigs = configs.filter(c => activeConfigCat === "all" || c.category === activeConfigCat);

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "users", label: "USERS", icon: <Users className="w-3 h-3" /> },
    { id: "roles", label: "ROLES & PERMISSIONS", icon: <Shield className="w-3 h-3" /> },
    { id: "audit", label: "AUDIT LOG", icon: <ScrollText className="w-3 h-3" /> },
    { id: "config", label: "SYSTEM CONFIG", icon: <Settings2 className="w-3 h-3" /> },
  ];

  const roleByName = Object.fromEntries(roles.map(r => [r.name, r]));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">SYSTEM ADMINISTRATOR</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">USERS · ROLES · PERMISSIONS · AUDIT · CONFIG</p>
        </div>
        <div className="flex gap-2">
          {tab === "users" && (
            <button onClick={() => { setShowInvite(v => !v); setInviteResult(null); setInviteError(""); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
              <Plus className="w-3 h-3" /> ADD USER
            </button>
          )}
          {tab === "roles" && (
            <button onClick={() => setShowNewRole(v => !v)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
              <Plus className="w-3 h-3" /> NEW ROLE
            </button>
          )}
          {tab === "audit" && (
            <button onClick={() => {
              const csv = ["Time,User,Action,Module,Severity,Details",
                ...filteredAudit.map(l => `"${l.createdAt}","${l.userName}","${l.action}","${l.module}","${l.severity}","${l.details ?? ""}"`),
              ].join("\n");
              const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
            }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary">
              <Download className="w-3 h-3" /> EXPORT CSV
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: "TOTAL USERS", value: users.length, color: "text-foreground" },
          { label: "ACTIVE", value: users.filter(u => u.status === "active").length, color: "text-green-400" },
          { label: "INVITED", value: users.filter(u => u.status === "invited").length, color: "text-yellow-400" },
          { label: "SUSPENDED", value: users.filter(u => u.status === "suspended").length, color: "text-red-400" },
          { label: "ROLES DEFINED", value: roles.length, color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border p-3">
            <p className="font-mono text-[9px] text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 font-mono text-[10px] border px-4 py-2 transition-colors ${tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ─── USERS ─── */}
      {tab === "users" && (
        <div className="space-y-3">
          {/* Invite form */}
          {showInvite && (
            <div className="bg-card border border-primary/50 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-3 h-3 text-primary" />
                <span className="font-mono text-[10px] tracking-widest">CREATE NEW USER</span>
              </div>
              {inviteResult ? (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/30 px-4 py-3">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="font-mono text-[10px] text-green-400">USER CREATED — {inviteResult.user?.name?.toUpperCase()} · {inviteResult.user?.role?.toUpperCase()}</span>
                    </div>
                    <p className="font-mono text-[9px] text-muted-foreground mb-2 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5 text-yellow-400" /> The password is shown ONCE and cannot be retrieved later. Copy and share it securely.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-secondary border border-border px-3 py-2">
                        <p className="font-mono text-[9px] text-muted-foreground mb-1">USERNAME</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm text-foreground truncate">{inviteResult.username}</span>
                          <CopyButton text={inviteResult.username} />
                        </div>
                      </div>
                      <div className="bg-secondary border border-primary/40 px-3 py-2">
                        <p className="font-mono text-[9px] text-muted-foreground mb-1">TEMPORARY PASSWORD</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm text-primary truncate">{inviteResult.password}</span>
                          <CopyButton text={inviteResult.password} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <CopyButton text={`Username: ${inviteResult.username}\nPassword: ${inviteResult.password}`} />
                      <span className="font-mono text-[9px] text-muted-foreground flex items-center gap-1"><Info className="w-2.5 h-2.5" /> Copies both credentials. No email is sent — share via SMS/WhatsApp.</span>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setInviteResult(null); setInviteForm({ role: "viewer" }); }} className="border border-border px-3 py-1.5 font-mono text-xs hover:bg-secondary">ADD ANOTHER</button>
                    <button onClick={() => { setShowInvite(false); setInviteResult(null); }} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-xs">DONE</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-mono text-muted-foreground">FULL NAME *</label>
                    <input value={inviteForm.name ?? ""} onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. John Mutua Kioko" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">EMAIL ADDRESS *</label>
                    <input type="email" value={inviteForm.email ?? ""} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} placeholder="e.g. officer@example.org" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">PHONE</label>
                    <input value={inviteForm.phone ?? ""} onChange={e => setInviteForm(p => ({ ...p, phone: e.target.value }))} placeholder="+254 7XX XXX XXX" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">ROLE *</label>
                    <select value={inviteForm.role ?? "viewer"} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                      {roles.map(r => <option key={r.name} value={r.name}>{r.name.toUpperCase()}</option>)}
                      {roles.length === 0 && ["super-admin", "campaign-manager", "field-officer", "communications-officer", "finance-officer", "viewer"].map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground">NOTES / DEPARTMENT</label>
                    <input value={inviteForm.notes ?? ""} onChange={e => setInviteForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Ward Field Coordinator" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-4 bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" />
                    <p className="font-mono text-[9px] text-yellow-400">Apply least-privilege principle — assign the most restrictive role that allows the user to perform their duties. Admin roles carry full system access.</p>
                  </div>
                  {inviteError && (
                    <div className="col-span-4 flex items-center gap-2 border border-red-400/40 bg-red-500/5 px-3 py-2">
                      <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                      <p className="font-mono text-[9px] text-red-400">{inviteError}</p>
                    </div>
                  )}
                  <div className="col-span-4 flex gap-2 justify-end">
                    <button onClick={() => { setShowInvite(false); setInviteForm({ role: "viewer" }); setInviteError(""); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                    <button onClick={createUser} disabled={inviting || !inviteForm.name || !inviteForm.email} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs disabled:opacity-60">
                      {inviting ? <><RefreshCw className="w-3 h-3 animate-spin" /> CREATING…</> : <><Plus className="w-3 h-3" /> CREATE USER</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reset password result */}
          {resetCreds && (
            <div className="bg-green-500/10 border border-green-500/30 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-green-400 flex items-center gap-2"><Key className="w-3 h-3" /> NEW PASSWORD FOR {resetCreds.username?.toUpperCase() ?? "USER"}</span>
                <button onClick={() => setResetCreds(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-secondary border border-border px-3 py-2">
                  <p className="font-mono text-[9px] text-muted-foreground mb-1">USERNAME</p>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm truncate">{resetCreds.username}</span><CopyButton text={resetCreds.username ?? ""} /></div>
                </div>
                <div className="bg-secondary border border-primary/40 px-3 py-2">
                  <p className="font-mono text-[9px] text-muted-foreground mb-1">NEW PASSWORD</p>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm text-primary truncate">{resetCreds.password}</span><CopyButton text={resetCreds.password ?? ""} /></div>
                </div>
              </div>
              <p className="font-mono text-[9px] text-muted-foreground flex items-center gap-1"><Info className="w-2.5 h-2.5" /> Shown once. Share securely with the user.</p>
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-secondary border border-border px-3 py-2 flex-1">
              <Search className="w-3 h-3 text-muted-foreground" />
              <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users by name, email or role…" className="bg-transparent font-mono text-xs focus:outline-none flex-1" />
            </div>
            <button onClick={loadUsers} className="border border-border px-3 py-2 hover:bg-secondary"><RefreshCw className={`w-3 h-3 ${usersLoading ? "animate-spin" : ""}`} /></button>
          </div>

          {/* User list */}
          {usersLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-16" />)}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Users className="w-6 h-6 text-muted-foreground" />
              <p className="font-mono text-xs text-muted-foreground">[ NO_USERS — INVITE YOUR FIRST USER ]</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredUsers.map(u => {
                const isExpanded = expandedUserId === u.id;
                const isEditing = editingUserId === u.id;
                const roleObj = roleByName[u.role];
                return (
                  <div key={u.id} className={`bg-card border ${u.status === "suspended" ? "border-red-400/20" : u.status === "invited" ? "border-yellow-400/15" : "border-border"}`}>
                    {isEditing ? (
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-4 gap-2">
                          <input value={editUserForm.name ?? ""} onChange={e => setEditUserForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" className="col-span-2 bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                          <input value={editUserForm.phone ?? ""} onChange={e => setEditUserForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                          <select value={editUserForm.role ?? ""} onChange={e => setEditUserForm(p => ({ ...p, role: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                            {roles.map(r => <option key={r.name} value={r.name}>{r.name.toUpperCase()}</option>)}
                          </select>
                          <select value={editUserForm.status ?? ""} onChange={e => setEditUserForm(p => ({ ...p, status: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary">
                            {["active", "inactive", "suspended", "invited"].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                          </select>
                          <input value={editUserForm.notes ?? ""} onChange={e => setEditUserForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes / department…" className="col-span-3 bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingUserId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                          <button onClick={() => saveUser(u.id)} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px]"><Save className="w-3 h-3 inline mr-1" />SAVE</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="w-8 h-8 bg-secondary border border-border flex items-center justify-center shrink-0">
                            <span className="font-bold text-sm text-primary">{(u.name ?? "?")[0].toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{u.name}</span>
                              <Badge label={u.role.toUpperCase()} className={u.role.includes("admin") || u.role.includes("super") ? "text-primary border-primary/40" : "text-muted-foreground border-border"} />
                              <Badge label={u.status.toUpperCase()} className={STATUS_COLORS[u.status]} />
                            </div>
                            <div className="flex items-center gap-4 font-mono text-[9px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1"><Mail className="w-2.5 h-2.5" />{u.email}</span>
                              {u.phone && <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{u.phone}</span>}
                              {u.notes && <span>{u.notes}</span>}
                              {u.lastLoginAt && <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />Last: {new Date(u.lastLoginAt).toLocaleDateString("en-KE")}</span>}
                              {!u.lastLoginAt && u.status === "invited" && <span className="text-yellow-400">Awaiting first login</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {u.status === "active" ? (
                              <button onClick={() => setUserStatus(u.id, "suspended")} title="Suspend" className="text-muted-foreground hover:text-red-400 transition-colors"><UserX className="w-3.5 h-3.5" /></button>
                            ) : u.status === "suspended" ? (
                              <button onClick={() => setUserStatus(u.id, "active")} title="Reactivate" className="text-muted-foreground hover:text-green-400 transition-colors"><UserCheck className="w-3.5 h-3.5" /></button>
                            ) : null}
                            <button onClick={() => setExpandedUserId(isExpanded ? null : u.id)} className="text-muted-foreground hover:text-foreground">{isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
                            <button onClick={() => resetPassword(u.id)} title="Reset password" className="text-muted-foreground hover:text-primary transition-colors"><Key className="w-3.5 h-3.5" /></button>
                            <button onClick={() => { setEditingUserId(u.id); setEditUserForm({ name: u.name, phone: u.phone ?? "", role: u.role, status: u.status, notes: u.notes ?? "" }); }} className="text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteUser(u.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-border/50 px-4 py-3 bg-secondary/30 space-y-3">
                            {/* Module access for this user's role */}
                            {roleObj && (
                              <div>
                                <p className="font-mono text-[9px] text-muted-foreground mb-2">ACCESS MATRIX FOR ROLE: {roleObj.name.toUpperCase()}</p>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {MODULES.map(m => {
                                    const perms = roleObj.permissions ?? {};
                                    const level: PermLevel = perms[m] ?? "none";
                                    return (
                                      <div key={m} className={`flex items-center justify-between px-2 py-1 border ${level === "none" ? "border-border/30 opacity-40" : level === "read" ? "border-blue-400/20" : "border-green-400/20"}`}>
                                        <span className="font-mono text-[8px] truncate">{MODULE_LABELS[m]}</span>
                                        <span className={`font-mono text-[8px] ml-1 shrink-0 ${level === "none" ? "text-muted-foreground" : level === "read" ? "text-blue-400" : "text-green-400"}`}>{level}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {u.status === "invited" && u.inviteToken && (
                              <div>
                                <p className="font-mono text-[9px] text-muted-foreground mb-1">PENDING INVITE LINK</p>
                                <div className="flex items-center gap-2 bg-card px-3 py-2 border border-border">
                                  <Key className="w-3 h-3 text-yellow-400 shrink-0" />
                                  <span className="font-mono text-[9px] text-yellow-400 truncate flex-1">…/accept-invite?token={u.inviteToken}</span>
                                  <CopyButton text={`${window.location.origin}/accept-invite?token=${u.inviteToken}`} />
                                </div>
                              </div>
                            )}
                            <p className="font-mono text-[9px] text-muted-foreground">JOINED: {new Date(u.createdAt).toLocaleDateString("en-KE")} · INVITED BY: {u.invitedBy ?? "—"}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── ROLES & PERMISSIONS ─── */}
      {tab === "roles" && (
        <div className="space-y-3">
          {showNewRole && (
            <div className="bg-card border border-primary/50 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3 h-3 text-primary" />
                <span className="font-mono text-[10px] tracking-widest">DEFINE NEW ROLE</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">ROLE NAME *</label>
                  <input value={roleForm.name ?? ""} onChange={e => setRoleForm((p: any) => ({ ...p, name: e.target.value }))} placeholder="e.g. ward-coordinator" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</label>
                  <input value={roleForm.description ?? ""} onChange={e => setRoleForm((p: any) => ({ ...p, description: e.target.value }))} placeholder="Who this role is for…" className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground">BADGE COLOR</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={roleForm.color ?? "#DB143C"} onChange={e => setRoleForm((p: any) => ({ ...p, color: e.target.value }))} className="w-10 h-9 bg-secondary border border-border cursor-pointer" />
                    <span className="font-mono text-[10px]">{roleForm.color ?? "#DB143C"}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-[9px] text-muted-foreground">MODULE PERMISSIONS — click to cycle: NONE → READ → WRITE</p>
                  <div className="flex gap-2">
                    <button onClick={() => setRoleForm((p: any) => ({ ...p, permissions: Object.fromEntries(MODULES.map(m => [m, "read"])) }))} className="font-mono text-[9px] border border-border px-2 py-0.5 hover:bg-secondary">ALL READ</button>
                    <button onClick={() => setRoleForm((p: any) => ({ ...p, permissions: Object.fromEntries(MODULES.map(m => [m, "write"])) }))} className="font-mono text-[9px] border border-border px-2 py-0.5 hover:bg-secondary">ALL WRITE</button>
                    <button onClick={() => setRoleForm((p: any) => ({ ...p, permissions: Object.fromEntries(MODULES.map(m => [m, "none"])) }))} className="font-mono text-[9px] border border-border px-2 py-0.5 hover:bg-secondary">ALL NONE</button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {MODULES.map(m => (
                    <div key={m} className="flex items-center justify-between border border-border/50 px-2 py-1.5">
                      <span className="font-mono text-[9px]">{MODULE_LABELS[m]}</span>
                      <PermToggle
                        level={(roleForm.permissions?.[m] ?? "none") as PermLevel}
                        onChange={l => setRoleForm((p: any) => ({ ...p, permissions: { ...p.permissions, [m]: l } }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowNewRole(false); setRoleForm({ permissions: {}, color: "#DB143C" }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
                <button onClick={createRole} disabled={!roleForm.name} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs disabled:opacity-60"><Shield className="w-3 h-3" /> CREATE ROLE</button>
              </div>
            </div>
          )}

          {rolesLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-24" />)}</div>
          ) : roles.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Shield className="w-6 h-6 text-muted-foreground" />
              <p className="font-mono text-xs text-muted-foreground">[ NO_ROLES_DEFINED ]</p>
            </div>
          ) : (
            <div className="space-y-2">
              {roles.map(r => {
                const isEditing = editingRoleId === r.id;
                const perms: Record<string, PermLevel> = r.permissions ?? {};
                const writeCount = Object.values(perms).filter(v => v === "write").length;
                const readCount = Object.values(perms).filter(v => v === "read").length;
                return (
                  <div key={r.id} className="bg-card border border-border">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                      <div className="w-3 h-3 shrink-0" style={{ backgroundColor: r.color }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{r.name.toUpperCase()}</span>
                          {r.isSystem && <Badge label="SYSTEM" className="text-primary border-primary/40" />}
                          <span className="font-mono text-[9px] text-muted-foreground">{r.description}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[9px] text-muted-foreground mt-0.5">
                          <span className="text-green-400">{writeCount} WRITE</span>
                          <span className="text-blue-400">{readCount} READ</span>
                          <span>{MODULES.length - writeCount - readCount} NO ACCESS</span>
                          <span>· {users.filter(u => u.role === r.name).length} USERS</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!r.isSystem && (
                          <>
                            <button onClick={() => { setEditingRoleId(r.id); setEditRolePerms({ ...perms }); setEditRoleMeta({ name: r.name, description: r.description, color: r.color }); }} className="text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteRole(r.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <input value={editRoleMeta.name ?? ""} onChange={e => setEditRoleMeta(p => ({ ...p, name: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                          <input value={editRoleMeta.description ?? ""} onChange={e => setEditRoleMeta(p => ({ ...p, description: e.target.value }))} className="bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                          <div className="flex gap-2 items-center">
                            <input type="color" value={editRoleMeta.color ?? "#DB143C"} onChange={e => setEditRoleMeta(p => ({ ...p, color: e.target.value }))} className="w-10 h-8 bg-secondary border border-border cursor-pointer" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-mono text-[9px] text-muted-foreground">MODULE PERMISSIONS</p>
                          <div className="flex gap-2">
                            <button onClick={() => setEditRolePerms(Object.fromEntries(MODULES.map(m => [m, "read"])))} className="font-mono text-[9px] border border-border px-2 py-0.5 hover:bg-secondary">ALL READ</button>
                            <button onClick={() => setEditRolePerms(Object.fromEntries(MODULES.map(m => [m, "write"])))} className="font-mono text-[9px] border border-border px-2 py-0.5 hover:bg-secondary">ALL WRITE</button>
                            <button onClick={() => setEditRolePerms(Object.fromEntries(MODULES.map(m => [m, "none"])))} className="font-mono text-[9px] border border-border px-2 py-0.5 hover:bg-secondary">ALL NONE</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {MODULES.map(m => (
                            <div key={m} className="flex items-center justify-between border border-border/50 px-2 py-1.5">
                              <span className="font-mono text-[9px]">{MODULE_LABELS[m]}</span>
                              <PermToggle level={editRolePerms[m] ?? "none"} onChange={l => setEditRolePerms(p => ({ ...p, [m]: l }))} />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingRoleId(null)} className="border border-border px-3 py-1.5 font-mono text-[10px] hover:bg-secondary">CANCEL</button>
                          <button onClick={() => saveRole(r.id)} className="bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[10px]"><Save className="w-3 h-3 inline mr-1" />SAVE</button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3">
                        <div className="grid grid-cols-4 gap-1">
                          {MODULES.map(m => {
                            const level: PermLevel = perms[m] ?? "none";
                            return (
                              <div key={m} className={`flex items-center justify-between px-2 py-1 border text-[8px] font-mono ${level === "none" ? "border-border/20 opacity-40 text-muted-foreground" : level === "read" ? "border-blue-400/25 text-blue-400" : "border-green-400/25 text-green-400"}`}>
                                <span className="truncate">{MODULE_LABELS[m]}</span>
                                <span className="shrink-0 ml-1">{level === "none" ? "—" : level === "read" ? "R" : "RW"}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── AUDIT LOG ─── */}
      {tab === "audit" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[10px] text-muted-foreground">MODULE:</span>
            <select value={auditModule} onChange={e => setAuditModule(e.target.value)} className="bg-secondary border border-border px-2 py-1.5 font-mono text-[10px] focus:outline-none focus:border-primary">
              <option value="all">ALL MODULES</option>
              {MODULES.map(m => <option key={m} value={m}>{MODULE_LABELS[m]}</option>)}
              <option value="admin">ADMIN</option>
            </select>
            <span className="font-mono text-[10px] text-muted-foreground ml-2">SEVERITY:</span>
            {["all", "info", "warning", "error", "critical"].map(s => (
              <button key={s} onClick={() => setAuditSeverity(s)} className={`font-mono text-[10px] px-2 py-1 border transition-colors ${auditSeverity === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{s.toUpperCase()}</button>
            ))}
            <button onClick={loadAudit} className="ml-auto border border-border px-3 py-1.5 hover:bg-secondary"><RefreshCw className={`w-3 h-3 ${auditLoading ? "animate-spin" : ""}`} /></button>
          </div>

          {auditLoading ? (
            <div className="space-y-1">{[...Array(6)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-10" />)}</div>
          ) : filteredAudit.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <ScrollText className="w-6 h-6 text-muted-foreground" />
              <p className="font-mono text-xs text-muted-foreground">[ NO_AUDIT_EVENTS_YET ]</p>
              <p className="font-mono text-[10px] text-muted-foreground/60">Events are logged automatically as users interact with the system</p>
            </div>
          ) : (
            <div className="bg-card border border-border">
              <div className="grid grid-cols-[140px_1fr_120px_80px_80px] gap-0 border-b border-border bg-secondary/50 px-4 py-2">
                {["TIME", "DETAILS", "USER", "MODULE", "SEVERITY"].map(h => <span key={h} className="font-mono text-[9px] text-muted-foreground">{h}</span>)}
              </div>
              <div className="divide-y divide-border/30 max-h-[520px] overflow-y-auto">
                {filteredAudit.map(l => (
                  <div key={l.id} className={`grid grid-cols-[140px_1fr_120px_80px_80px] gap-0 px-4 py-2.5 hover:bg-secondary/20 ${l.severity === "critical" ? "bg-red-500/5" : ""}`}>
                    <span className="font-mono text-[9px] text-muted-foreground">{new Date(l.createdAt).toLocaleString("en-KE", { hour12: false })}</span>
                    <div>
                      <p className="font-mono text-[10px]">{l.action}</p>
                      {l.details && <p className="font-mono text-[9px] text-muted-foreground">{l.details}</p>}
                    </div>
                    <span className="font-mono text-[9px] truncate">{l.userName}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">{(MODULE_LABELS[l.module] ?? l.module).split(" ")[0]}</span>
                    <Badge label={l.severity.toUpperCase()} className={SEVERITY_COLORS[l.severity] ?? "text-muted-foreground border-border"} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SYSTEM CONFIG ─── */}
      {tab === "config" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
            <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
            <p className="font-mono text-[9px] text-yellow-400">System configuration changes take effect immediately. Changes are logged to the audit trail.</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {["all", ...CONFIG_CATEGORIES].map(c => (
              <button key={c} onClick={() => setActiveConfigCat(c)} className={`font-mono text-[10px] border px-3 py-1.5 transition-colors ${activeConfigCat === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {c.toUpperCase()}
              </button>
            ))}
            <button onClick={loadConfig} className="ml-auto border border-border px-3 py-1.5 hover:bg-secondary"><RefreshCw className={`w-3 h-3 ${configLoading ? "animate-spin" : ""}`} /></button>
          </div>

          {configLoading ? (
            <div className="space-y-1.5">{[...Array(5)].map((_, i) => <div key={i} className="animate-pulse bg-card border border-border h-16" />)}</div>
          ) : filteredConfigs.length === 0 ? (
            <div className="bg-card border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Settings2 className="w-6 h-6 text-muted-foreground" />
              <p className="font-mono text-xs text-muted-foreground">[ NO_CONFIG_KEYS ]</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredConfigs.map(c => {
                const isEditing = editingConfigId === c.id;
                const isVisible = showSecret[c.id];
                const displayValue = c.isSecret && !isVisible ? "••••••••••••••" : c.value;
                return (
                  <div key={c.id} className="bg-card border border-border">
                    <div className="flex items-start gap-4 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[10px] text-primary">{c.key}</span>
                          <Badge label={c.category.toUpperCase()} className="text-muted-foreground border-border" />
                          {c.isSecret && <Badge label="SECRET" className="text-orange-400 border-orange-400/30" />}
                        </div>
                        <p className="font-mono text-[9px] text-muted-foreground mb-1">{c.description}</p>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input value={editConfigValue} onChange={e => setEditConfigValue(e.target.value)} className="flex-1 bg-secondary border border-border px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-primary" />
                            <button onClick={() => setEditingConfigId(null)} className="border border-border px-2 py-1.5 font-mono text-[9px] hover:bg-secondary">CANCEL</button>
                            <button onClick={() => saveConfig(c.id)} className="bg-primary text-primary-foreground px-2 py-1.5 font-mono text-[9px]">SAVE</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{displayValue || <span className="text-muted-foreground italic text-[10px]">(empty)</span>}</span>
                            {c.isSecret && (
                              <button onClick={() => setShowSecret(p => ({ ...p, [c.id]: !isVisible }))} className="text-muted-foreground hover:text-foreground">
                                {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <button onClick={() => { setEditingConfigId(c.id); setEditConfigValue(c.value); }} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"><Edit2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    {c.updatedBy && (
                      <div className="border-t border-border/30 px-4 py-1.5 bg-secondary/20 font-mono text-[9px] text-muted-foreground flex gap-4">
                        <span>LAST UPDATED BY: {c.updatedBy}</span>
                        <span>{new Date(c.updatedAt).toLocaleString("en-KE")}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
