import { Router } from "express";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { db, adminUsersTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  findByIdentifier,
  verifyPassword,
  hashPassword,
  getSessionUser,
  permissionsForRole,
  sanitizeUser,
  emergencyUser,
  emergencyPermissions,
  isEmergencySession,
} from "../lib/auth";
import { ensureSeeded } from "../lib/seed";
import { newPasswordProblem } from "../lib/password-policy";
import { db as rawDb } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  checkCode, getMfa, roleRequiresMfa, newSecret, otpauthUri, encrypt, decrypt, verifyTotp,
  newRecoveryCodes, tooManyAttempts, clearAttempts,
} from "../lib/mfa";
import type { Request } from "express";

/** Prevents session fixation: issue a fresh session id at every privilege change. */
function regenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));
}
async function audit(email: string, name: string, action: string, severity = "info") {
  try { await db.insert(auditLogsTable).values({ userEmail: email, userName: name, action, module: "admin", severity }); } catch { /* non-critical */ }
}
const PENDING_MFA_TTL_MS = 5 * 60_000;

const router = Router();

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

function safeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function emergencyLoginAllowed(identifier: string, password: string): boolean {
  const enabled = process.env.EMERGENCY_LOGIN_ENABLED === "true";
  const expectedUsername = process.env.EMERGENCY_LOGIN_USERNAME ?? "";
  const expectedPassword = process.env.EMERGENCY_LOGIN_PASSWORD ?? "";

  const usernameMatches =
    expectedUsername.length > 0 &&
    identifier.trim().toLowerCase() === expectedUsername.trim().toLowerCase();

  const passwordMatches =
    expectedPassword.length > 0 &&
    safeEqual(password, expectedPassword);

  return enabled && usernameMatches && passwordMatches;
}

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Username/email and password are required",
    });
    return;
  }

  const { identifier, password } = parsed.data;

  if (tooManyAttempts(`login:${req.ip}:${identifier.trim().toLowerCase()}`, 10, 15 * 60_000)) {
    res.status(429).json({ error: "Too many sign-in attempts. Wait 15 minutes and try again." });
    return;
  }

  /*
   * Temporary emergency login.
   * This is checked before database seeding or database queries.
   */
  if (emergencyLoginAllowed(identifier, password)) {
    req.session.emergencyAuth = true;
    delete req.session.userId;

    const user = emergencyUser();

    res.json({
      user: sanitizeUser(user),
      permissions: emergencyPermissions,
    });
    return;
  }

  try {
    await ensureSeeded();

    const user = await findByIdentifier(identifier);

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (user.status === "suspended" || user.status === "inactive") {
      res.status(403).json({
        error: "This account has been disabled. Contact your administrator.",
      });
      return;
    }

    const ok = await verifyPassword(password, user.passwordHash);

    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    clearAttempts(`login:${req.ip}:${identifier.trim().toLowerCase()}`);

    const mfa = await getMfa(user.id);
    await regenerate(req);

    if (mfa?.enabled) {
      // Password is right; the session stays unauthenticated until the code is verified.
      req.session.pendingMfaUserId = user.id;
      req.session.pendingMfaAt = Date.now();
      res.json({ mfaRequired: true });
      return;
    }

    req.session.userId = user.id;
    req.session.emergencyAuth = false;
    req.session.mfaEnrollRequired = roleRequiresMfa(user.role);
    req.session.passwordChangeRequired = user.mustChangePassword === true;

    await db
      .update(adminUsersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminUsersTable.id, user.id));

    await audit(user.email, user.name,
      req.session.passwordChangeRequired ? "Signed in (temporary password; must choose a new one)"
        : req.session.mfaEnrollRequired ? "Signed in (2FA enrolment required)" : "Signed in");

    res.json({
      user: sanitizeUser(user),
      permissions: await permissionsForRole(user.role),
      mfaEnrollmentRequired: req.session.mfaEnrollRequired === true,
      passwordChangeRequired: req.session.passwordChangeRequired === true,
    });
  } catch (error) {
    console.error("Normal database login failed:", error);

    res.status(503).json({
      error:
        "The login service is temporarily unavailable. Please try again later or contact your system administrator.",
    });
  }
});

router.get("/me", async (req, res) => {
  const user = await getSessionUser(req);

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!isEmergencySession(req) && (user.status === "suspended" || user.status === "inactive")) {
    req.session.destroy(() => {});
    res.clearCookie("connect.sid");
    res.status(403).json({ error: "Account disabled" });
    return;
  }

  if (isEmergencySession(req)) {
    res.json({
      user: sanitizeUser(user),
      permissions: emergencyPermissions,
    });
    return;
  }

  const mfa = await getMfa(user.id).catch(() => null);
  // Refresh policy after configuration changes, including existing sessions.
  req.session.mfaEnrollRequired = roleRequiresMfa(user.role) && mfa?.enabled !== true;
  // Refresh from the database so an administrator's password reset applies to open sessions too.
  req.session.passwordChangeRequired = user.mustChangePassword === true;
  res.json({
    user: sanitizeUser(user),
    permissions: await permissionsForRole(user.role),
    mfaEnabled: mfa?.enabled === true,
    mfaEnrollmentRequired: req.session.mfaEnrollRequired === true && mfa?.enabled !== true,
    passwordChangeRequired: req.session.passwordChangeRequired === true,
  });
});

// ── Second step of sign-in ───────────────────────────────────────────────────
router.post("/mfa/verify", async (req, res) => {
  const pendingId = req.session.pendingMfaUserId;
  if (!pendingId || !req.session.pendingMfaAt || Date.now() - req.session.pendingMfaAt > PENDING_MFA_TTL_MS) {
    delete req.session.pendingMfaUserId; delete req.session.pendingMfaAt;
    res.status(401).json({ error: "Your sign-in expired. Enter your password again." });
    return;
  }
  if (tooManyAttempts(`mfa:${pendingId}`, 5, 5 * 60_000)) {
    res.status(429).json({ error: "Too many incorrect codes. Wait 5 minutes and sign in again." });
    return;
  }
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  const result = await checkCode(pendingId, code);
  const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, pendingId)).limit(1);
  if (!user || user.status === "suspended" || user.status === "inactive") {
    res.status(403).json({ error: "Account disabled" }); return;
  }
  if (!result) {
    await audit(user.email, user.name, "Failed two-factor code", "warning");
    res.status(401).json({ error: "That code didn’t match. Use the current 6-digit code from your authenticator app, or a recovery code." });
    return;
  }
  clearAttempts(`mfa:${pendingId}`);
  await regenerate(req);
  req.session.userId = user.id;
  req.session.emergencyAuth = false;
  req.session.passwordChangeRequired = user.mustChangePassword === true;
  await db.update(adminUsersTable).set({ lastLoginAt: new Date() }).where(eq(adminUsersTable.id, user.id));
  await audit(user.email, user.name, result === "recovery" ? "Signed in with a recovery code" : "Signed in (2FA)", result === "recovery" ? "warning" : "info");
  res.json({ user: sanitizeUser(user), permissions: await permissionsForRole(user.role), usedRecoveryCode: result === "recovery", passwordChangeRequired: req.session.passwordChangeRequired === true });
});

// ── Enrolment (signed-in user) ───────────────────────────────────────────────
router.get("/mfa/status", async (req, res) => {
  const user = req.currentUser!;
  const mfa = await getMfa(user.id);
  res.json({ enabled: mfa?.enabled === true, required: roleRequiresMfa(user.role), recoveryCodesLeft: mfa?.recoveryHashes?.length ?? 0 });
});

router.post("/mfa/setup", async (req, res) => {
  const user = req.currentUser!;
  if (user.id < 0) { res.status(400).json({ error: "Emergency accounts can’t enrol in 2FA." }); return; }
  const existing = await getMfa(user.id);
  if (existing?.enabled) { res.status(409).json({ error: "Two-factor sign-in is already on. Turn it off first to re-enrol." }); return; }
  const secret = newSecret();
  await rawDb.execute(sql`INSERT INTO public.kaiti_user_mfa (user_id, pending_secret_enc) VALUES (${user.id}, ${encrypt(secret)})
    ON CONFLICT (user_id) DO UPDATE SET pending_secret_enc = EXCLUDED.pending_secret_enc`);
  res.json({ secret, otpauthUri: otpauthUri(secret, user.email) });
});

router.post("/mfa/enable", async (req, res) => {
  const user = req.currentUser!;
  const row = await getMfa(user.id);
  if (!row?.pendingSecretEnc) { res.status(400).json({ error: "Start setup first." }); return; }
  if (tooManyAttempts(`mfa-enrol:${user.id}`, 10, 10 * 60_000)) { res.status(429).json({ error: "Too many attempts. Wait 10 minutes." }); return; }
  const secret = decrypt(row.pendingSecretEnc);
  const step = verifyTotp(secret, String(req.body?.code ?? ""));
  if (step === null) { res.status(400).json({ error: "That code didn’t match. Check your phone’s clock is set automatically, then try the newest code." }); return; }
  const codes = newRecoveryCodes();
  await rawDb.execute(sql`UPDATE public.kaiti_user_mfa SET secret_enc=${row.pendingSecretEnc}, pending_secret_enc=NULL, enabled=true,
    recovery_hashes=${JSON.stringify(codes.hashes)}::jsonb, last_step=${step}, enabled_at=now() WHERE user_id=${user.id}`);
  req.session.mfaEnrollRequired = false;
  await audit(user.email, user.name, "Turned on two-factor sign-in");
  res.json({ enabled: true, recoveryCodes: codes.plain });
});

router.post("/mfa/recovery-codes", async (req, res) => {
  const user = req.currentUser!;
  if (!(await checkCode(user.id, String(req.body?.code ?? "")))) { res.status(401).json({ error: "Enter a current code from your authenticator app." }); return; }
  const codes = newRecoveryCodes();
  await rawDb.execute(sql`UPDATE public.kaiti_user_mfa SET recovery_hashes=${JSON.stringify(codes.hashes)}::jsonb WHERE user_id=${user.id}`);
  await audit(user.email, user.name, "Generated new 2FA recovery codes");
  res.json({ recoveryCodes: codes.plain });
});

router.post("/mfa/disable", async (req, res) => {
  const user = req.currentUser!;
  if (roleRequiresMfa(user.role)) { res.status(403).json({ error: "Your role requires two-factor sign-in, so it can’t be turned off." }); return; }
  if (!(await checkCode(user.id, String(req.body?.code ?? "")))) { res.status(401).json({ error: "Enter a current code from your authenticator app." }); return; }
  await rawDb.execute(sql`DELETE FROM public.kaiti_user_mfa WHERE user_id=${user.id}`);
  await audit(user.email, user.name, "Turned off two-factor sign-in", "warning");
  res.json({ enabled: false });
});

// ── Own account: password and sign-in email ──────────────────────────────────
// Clients start with the root email and a temporary password; they choose
// their own password at first sign-in and can change either later.

router.post("/account/password", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (isEmergencySession(req) || !user.passwordHash) { res.status(400).json({ error: "This account's password can't be changed here." }); return; }
  const body = z.object({ currentPassword: z.string().min(1, "Enter your current password."), newPassword: z.string().min(1, "Enter a new password.").max(1000) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.issues[0]?.message ?? "Check the passwords" }); return; }
  if (tooManyAttempts(`account:${user.id}`, 10, 15 * 60_000)) { res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." }); return; }
  const { currentPassword, newPassword } = body.data;
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    await audit(user.email, user.name, "Failed password change (wrong current password)", "warning");
    res.status(401).json({ error: "Your current password is incorrect." }); return;
  }
  const problem = newPasswordProblem(newPassword, currentPassword, [user.email, user.username]);
  if (problem) { res.status(400).json({ error: problem }); return; }
  clearAttempts(`account:${user.id}`);
  await db.update(adminUsersTable).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date() }).where(eq(adminUsersTable.id, user.id));
  // Sign out this account's other sessions; the current one stays signed in.
  try {
    await rawDb.execute(sql`DELETE FROM user_sessions WHERE sess->>'userId' = ${String(user.id)} AND sid <> ${req.sessionID}`);
  } catch { /* best effort */ }
  req.session.passwordChangeRequired = false;
  await audit(user.email, user.name, "Changed own password");
  res.json({ ok: true });
});

router.post("/account/email", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (isEmergencySession(req) || !user.passwordHash) { res.status(400).json({ error: "This account's email can't be changed here." }); return; }
  if (req.session.passwordChangeRequired) { res.status(403).json({ error: "Choose your own password first.", passwordChangeRequired: true }); return; }
  const body = z.object({ currentPassword: z.string().min(1, "Enter your current password."), newEmail: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.issues[0]?.message ?? "Check the email address" }); return; }
  if (tooManyAttempts(`account:${user.id}`, 10, 15 * 60_000)) { res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." }); return; }
  const { currentPassword, newEmail } = body.data;
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    await audit(user.email, user.name, "Failed email change (wrong current password)", "warning");
    res.status(401).json({ error: "Your current password is incorrect." }); return;
  }
  if (newEmail === user.email.toLowerCase()) { res.status(400).json({ error: "That's already your sign-in email." }); return; }
  const [taken] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(sql`lower(${adminUsersTable.email}) = ${newEmail}`).limit(1);
  if (taken) { res.status(409).json({ error: "Another account already uses that email." }); return; }
  clearAttempts(`account:${user.id}`);
  const [updated] = await db.update(adminUsersTable).set({ email: newEmail, updatedAt: new Date() }).where(eq(adminUsersTable.id, user.id)).returning();
  await audit(newEmail, user.name, `Changed sign-in email from ${user.email} to ${newEmail}`);
  res.json({ user: sanitizeUser(updated) });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

export default router;
