import { Router } from "express";
import { z } from "zod";
import { db, adminUsersTable, adminRolesTable, auditLogsTable, systemConfigTable } from "@workspace/db";
import type { AdminUser } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  requireAuth,
  requirePermission,
  generateUsername,
  generatePassword,
  hashPassword,
  sanitizeUser,
} from "../lib/auth";
import { ensureSeeded } from "../lib/seed";

const router = Router();

// All admin endpoints require an authenticated user with admin access.
router.use(requireAuth, requirePermission("admin", "read"));

// ── Audit helper ──────────────────────────────────────────────────────────────

function parsePositiveId(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function actor(req: { currentUser?: AdminUser }): { email: string; name: string } {
  return { email: req.currentUser?.email ?? "admin@system", name: req.currentUser?.name ?? "System Admin" };
}

async function logAudit(userEmail: string, userName: string, action: string, module: string, details?: string, severity: string = "info") {
  try {
    await db.insert(auditLogsTable).values({ userEmail, userName, action, module, details, severity });
  } catch { /* non-critical */ }
}

// ── Users ─────────────────────────────────────────────────────────────────────

router.get("/users", async (_req, res) => {
  await ensureSeeded();
  const users = await db.select().from(adminUsersTable).orderBy(desc(adminUsersTable.createdAt));
  res.json(users.map(sanitizeUser));
});

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(254).transform((email) => email.toLowerCase()),
  role: z.string().trim().min(1).max(80).default("viewer"),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  role: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();

const permissionLevelSchema = z.enum(["none", "read", "write"]);
const roleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6b7280"),
  permissions: z.record(z.string().max(80), permissionLevelSchema).default({}),
}).strict();

// Admin creates a user; the system generates a username + password to share.
router.post("/users", requirePermission("admin", "write"), async (req, res) => {
  await ensureSeeded();
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { name, email, role, phone, notes } = parsed.data;

  const existing = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(sql`lower(${adminUsersTable.email}) = ${email.toLowerCase()}`).limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "A user with this email already exists" }); return; }

  const username = await generateUsername(name, email);
  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  const [user] = await db.insert(adminUsersTable).values({
    name, email, username, passwordHash, phone, notes, role,
    status: "active", invitedBy: actor(req).email,
  }).returning();

  await logAudit(actor(req).email, actor(req).name, `Created user: ${email} (${role})`, "admin", `Username: ${username}`, "info");

  res.status(201).json({ user: sanitizeUser(user), username, password });
});

// Regenerate a user's password and return the new one once.
router.post("/users/:id/reset-password", requirePermission("admin", "write"), async (req, res) => {
  const targetId = parsePositiveId(req.params.id);
  if (targetId === null) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const [user] = await db.update(adminUsersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(adminUsersTable.id, targetId))
    .returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit(actor(req).email, actor(req).name, `Reset password for: ${user.email}`, "admin", undefined, "warning");
  res.json({ user: sanitizeUser(user), username: user.username, password });
});

router.patch("/users/:id", requirePermission("admin", "write"), async (req, res) => {
  const targetId = parsePositiveId(req.params.id);
  if (targetId === null) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid user update" });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  Object.entries(parsed.data).forEach(([key, value]) => { if (value !== undefined) updates[key] = value; });
  if (typeof updates.email === "string") {
    const duplicate = await db.select({ id: adminUsersTable.id }).from(adminUsersTable)
      .where(sql`lower(${adminUsersTable.email}) = ${updates.email}`).limit(1);
    if (duplicate.some((entry) => entry.id !== targetId)) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }
  }

  // Never allow the last active super-admin to be suspended, deactivated, or demoted.
  const demoting = updates.role !== undefined && updates.role !== "super-admin";
  const disabling = updates.status !== undefined && updates.status !== "active";
  if (demoting || disabling) {
    const [target] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, targetId)).limit(1);
    if (target && target.role === "super-admin" && target.status === "active") {
      const others = await db
        .select({ id: adminUsersTable.id })
        .from(adminUsersTable)
        .where(and(eq(adminUsersTable.role, "super-admin"), eq(adminUsersTable.status, "active")))
        .limit(2);
      if (others.filter(u => u.id !== targetId).length === 0) {
        res.status(400).json({ error: "Cannot suspend or demote the last active super-admin — the system would be locked out. Promote another super-admin first." });
        return;
      }
    }
  }

  const [user] = await db.update(adminUsersTable).set(updates).where(eq(adminUsersTable.id, targetId)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit(actor(req).email, actor(req).name, `Updated user: ${user.email}`, "admin", `Fields: ${Object.keys(updates).filter(k => k !== "updatedAt").join(", ")}`);
  res.json(sanitizeUser(user));
});

router.delete("/users/:id", requirePermission("admin", "write"), async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id));
  if (user && user.id === req.currentUser?.id) { res.status(400).json({ error: "You cannot delete your own account" }); return; }
  if (user && user.role === "super-admin" && user.status === "active") {
    const others = await db
      .select({ id: adminUsersTable.id })
      .from(adminUsersTable)
      .where(and(eq(adminUsersTable.role, "super-admin"), eq(adminUsersTable.status, "active")))
      .limit(2);
    if (others.filter(u => u.id !== user.id).length === 0) {
      res.status(400).json({ error: "Cannot delete the last active super-admin — the system would be locked out. Promote another super-admin first." });
      return;
    }
  }
  if (user) await logAudit(actor(req).email, actor(req).name, `Deleted user: ${user.email}`, "admin", undefined, "warning");
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
  res.status(204).send();
});

// ── Roles ─────────────────────────────────────────────────────────────────────

router.get("/roles", async (_req, res) => {
  await ensureSeeded();
  const roles = await db.select().from(adminRolesTable).orderBy(adminRolesTable.name);
  res.json(roles);
});

router.post("/roles", requirePermission("admin", "write"), async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid role" });
    return;
  }
  const { name, description, color, permissions } = parsed.data;
  const duplicate = await db.select({ id: adminRolesTable.id }).from(adminRolesTable)
    .where(sql`lower(${adminRolesTable.name}) = ${name.toLowerCase()}`).limit(1);
  if (duplicate.length) { res.status(409).json({ error: "A role with this name already exists" }); return; }
  const [role] = await db.insert(adminRolesTable).values({ name, description, color, permissions }).returning();
  await logAudit(actor(req).email, actor(req).name, `Created role: ${name}`, "admin");
  res.status(201).json(role);
});

router.patch("/roles/:id", requirePermission("admin", "write"), async (req, res) => {
  const roleId = parsePositiveId(req.params.id);
  if (roleId === null) { res.status(400).json({ error: "Invalid role ID" }); return; }
  const parsed = roleSchema.partial().strict().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({ error: parsed.success ? "At least one valid field is required" : parsed.error.issues[0]?.message ?? "Invalid role update" });
    return;
  }
  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (typeof updates.name === "string") {
    const duplicate = await db.select({ id: adminRolesTable.id }).from(adminRolesTable)
      .where(sql`lower(${adminRolesTable.name}) = ${updates.name.toLowerCase()}`).limit(1);
    if (duplicate.some((entry) => entry.id !== roleId)) {
      res.status(409).json({ error: "A role with this name already exists" });
      return;
    }
  }
  const [role] = await db.update(adminRolesTable).set(updates).where(eq(adminRolesTable.id, roleId)).returning();
  if (!role) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit(actor(req).email, actor(req).name, `Updated role: ${role.name}`, "admin");
  res.json(role);
});

router.delete("/roles/:id", requirePermission("admin", "write"), async (req, res) => {
  const roleId = parsePositiveId(req.params.id);
  if (roleId === null) { res.status(400).json({ error: "Invalid role ID" }); return; }
  const [role] = await db.select().from(adminRolesTable).where(eq(adminRolesTable.id, roleId));
  if (role?.isSystem) { res.status(403).json({ error: "Cannot delete system roles" }); return; }
  if (role) await logAudit(actor(req).email, actor(req).name, `Deleted role: ${role.name}`, "admin", undefined, "warning");
  if (!role) { res.status(404).json({ error: "Not found" }); return; }
  const assignedUsers = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.role, role.name)).limit(1);
  if (assignedUsers.length > 0) { res.status(409).json({ error: "Cannot delete a role assigned to users. Reassign those users first." }); return; }
  await db.delete(adminRolesTable).where(eq(adminRolesTable.id, roleId));
  res.status(204).send();
});

// ── Audit Log ─────────────────────────────────────────────────────────────────

router.get("/audit", async (req, res) => {
  const { module, severity } = req.query as Record<string, string>;
  const conditions = [];
  if (module && module !== "all") conditions.push(eq(auditLogsTable.module, module));
  if (severity && severity !== "all") conditions.push(eq(auditLogsTable.severity, severity));
  const where = conditions.length ? and(...conditions) : undefined;
  const logs = await db.select().from(auditLogsTable).where(where).orderBy(desc(auditLogsTable.createdAt)).limit(200);
  res.json(logs);
});

// ── System Config ─────────────────────────────────────────────────────────────

router.get("/config", async (_req, res) => {
  await ensureSeeded();
  const configs = await db.select().from(systemConfigTable).orderBy(systemConfigTable.category, systemConfigTable.key);
  res.json(configs);
});

router.patch("/config/:id", requirePermission("admin", "write"), async (req, res) => {
  const configId = parsePositiveId(req.params.id);
  if (configId === null) { res.status(400).json({ error: "Invalid config ID" }); return; }
  const { value } = req.body;
  if (value === undefined) { res.status(400).json({ error: "value required" }); return; }
  const [cfg] = await db.update(systemConfigTable).set({ value, updatedBy: actor(req).email, updatedAt: new Date() }).where(eq(systemConfigTable.id, configId)).returning();
  if (!cfg) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit(actor(req).email, actor(req).name, `Config updated: ${cfg.key}`, "admin", cfg.isSecret ? "(value hidden)" : `New value: ${value}`);
  res.json(cfg);
});

export default router;
