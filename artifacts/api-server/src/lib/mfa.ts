import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Two-factor authentication with time-based one-time codes (RFC 6238, SHA-1,
 * 6 digits, 30 s), compatible with Google Authenticator, Microsoft
 * Authenticator, Authy and 1Password. Implemented on Node's crypto module so
 * no new package (and no lockfile change) is needed.
 *
 * Secrets are encrypted at rest with AES-256-GCM. Set MFA_ENCRYPTION_KEY in
 * Render; if it is missing the key falls back to SESSION_SECRET, so rotating
 * SESSION_SECRET would then invalidate every enrolment. Recovery codes are
 * stored only as SHA-256 hashes and each works once.
 */

const ISSUER = process.env.MFA_ISSUER || "Kenya Campaign Manager";
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32");
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
export const currentStep = (now = Date.now()) => Math.floor(now / 30_000);

/** Returns the matched time-step (±1 step of drift), or null. */
export function verifyTotp(secretB32: string, code: string, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    const expected = totpAt(secretB32, s);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return s;
  }
  return null;
}

// ── Encryption at rest ───────────────────────────────────────────────────────
let warnedNoMfaKey = false;
function key(): Buffer {
  if (!process.env.MFA_ENCRYPTION_KEY && process.env.NODE_ENV === "production" && !warnedNoMfaKey) {
    warnedNoMfaKey = true;
    console.warn("MFA_ENCRYPTION_KEY is not set; 2FA secrets are encrypted with a fallback key. Set it in Render > Environment.");
  }
  const material = process.env.MFA_ENCRYPTION_KEY || process.env.SESSION_SECRET || "insecure-dev-mfa-key";
  return createHash("sha256").update("kaitios-mfa:" + material).digest();
}
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Unknown MFA secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export const newSecret = () => base32Encode(randomBytes(20));
export const otpauthUri = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;

const hashCode = (c: string) => createHash("sha256").update("kaitios-recovery:" + c.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
export function newRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: 10 }, () => {
    const raw = base32Encode(randomBytes(6)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashes: plain.map(hashCode) };
}

// ── Policy ───────────────────────────────────────────────────────────────────
export { roleRequiresMfa } from "./mfa-policy";

// ── Storage ──────────────────────────────────────────────────────────────────
export type MfaRow = { userId: number; secretEnc: string | null; pendingSecretEnc: string | null; enabled: boolean; recoveryHashes: string[]; lastStep: number | null };

export async function getMfa(userId: number): Promise<MfaRow | null> {
  const r = await db.execute(sql`SELECT user_id AS "userId", secret_enc AS "secretEnc", pending_secret_enc AS "pendingSecretEnc",
    enabled, recovery_hashes AS "recoveryHashes", last_step AS "lastStep" FROM public.kaiti_user_mfa WHERE user_id=${userId}`);
  const row = r.rows[0] as (MfaRow & { lastStep: string | number | null }) | undefined;
  return row ? { ...row, lastStep: row.lastStep === null ? null : Number(row.lastStep) } : null;
}

/** Checks a TOTP or recovery code for an enrolled user; consumes recovery codes and blocks code replay. */
export async function checkCode(userId: number, code: string): Promise<"totp" | "recovery" | null> {
  const row = await getMfa(userId);
  if (!row?.enabled || !row.secretEnc) return null;
  const step = verifyTotp(decrypt(row.secretEnc), code);
  if (step !== null) {
    if (row.lastStep !== null && step <= row.lastStep) return null; // replayed code
    await db.execute(sql`UPDATE public.kaiti_user_mfa SET last_step=${step}, last_used_at=now() WHERE user_id=${userId}`);
    return "totp";
  }
  const h = hashCode(code);
  if (row.recoveryHashes.includes(h)) {
    await db.execute(sql`UPDATE public.kaiti_user_mfa SET recovery_hashes = recovery_hashes - ${h}, last_used_at=now() WHERE user_id=${userId}`);
    return "recovery";
  }
  return null;
}

// ── Attempt limiting (in-memory, per server instance) ────────────────────────
const attempts = new Map<string, { n: number; until: number }>();
export function tooManyAttempts(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) { attempts.set(key, { n: 1, until: now + windowMs }); return false; }
  a.n += 1;
  if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  return a.n > max;
}
export function clearAttempts(key: string) { attempts.delete(key); }
