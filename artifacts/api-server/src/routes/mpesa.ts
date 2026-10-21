import { Router } from "express";
import { z } from "zod/v4";
import { db, mpesaTransactionsTable, donationsTable, fundraisingCampaignsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router = Router();

// ── Daraja configuration ────────────────────────────────────────────────────

function darajaConfig() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const env = process.env.MPESA_ENV === "production" ? "production" : "sandbox";
  if (!consumerKey || !consumerSecret || !shortcode || !passkey) return null;
  return {
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    env,
    baseUrl: env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke",
  };
}

function callbackUrl(): string {
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() || process.env.REPLIT_DEV_DOMAIN || "";
  return `https://${domain}/api/fundraising/mpesa/callback`;
}

// OAuth token cache (Daraja tokens last ~1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(cfg: NonNullable<ReturnType<typeof darajaConfig>>): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const res = await fetch(`${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daraja auth failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: string };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000,
  };
  return data.access_token;
}

function darajaTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  // Daraja expects Nairobi time (UTC+3)
  const nairobi = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return `${nairobi.getUTCFullYear()}${p(nairobi.getUTCMonth() + 1)}${p(nairobi.getUTCDate())}${p(nairobi.getUTCHours())}${p(nairobi.getUTCMinutes())}${p(nairobi.getUTCSeconds())}`;
}

function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

// Normalize Kenyan phone numbers to 2547XXXXXXXX / 2541XXXXXXXX format.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  let msisdn = digits;
  if (msisdn.startsWith("0")) msisdn = `254${msisdn.slice(1)}`;
  if (msisdn.length === 9 && (msisdn.startsWith("7") || msisdn.startsWith("1"))) msisdn = `254${msisdn}`;
  if (!/^254(7|1)\d{8}$/.test(msisdn)) return null;
  return msisdn;
}

// Rate limit STK pushes: public endpoint hitting a real payment rail.
const STK_COOLDOWN_MS = 10_000;
const lastStkByIp = new Map<string, number>();

// ── Routes ──────────────────────────────────────────────────────────────────

router.get("/config-status", (_req, res) => {
  const cfg = darajaConfig();
  res.json({
    configured: cfg !== null,
    environment: cfg?.env ?? null,
    shortcode: cfg?.shortcode ?? null,
    callbackUrl: cfg ? callbackUrl() : null,
  });
});

const stkPushSchema = z.object({
  phone: z.string().min(9).max(15),
  amount: z.coerce.number().int().min(1).max(500_000),
  donorName: z.string().max(120).optional().default(""),
  campaignId: z.coerce.number().int().positive().optional().nullable(),
  ward: z.string().max(60).optional().default(""),
});

router.post("/stkpush", async (req, res) => {
  const cfg = darajaConfig();
  if (!cfg) {
    res.status(503).json({ error: "M-Pesa is not configured. Add Daraja API credentials first." });
    return;
  }
  const parsed = stkPushSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    res.status(400).json({ error: "Invalid Kenyan phone number. Use format 07XXXXXXXX or 2547XXXXXXXX." });
    return;
  }
  const ip = req.ip ?? "unknown";
  const last = lastStkByIp.get(ip) ?? 0;
  if (Date.now() - last < STK_COOLDOWN_MS) {
    const wait = Math.ceil((STK_COOLDOWN_MS - (Date.now() - last)) / 1000);
    res.setHeader("Retry-After", String(wait));
    res.status(429).json({ error: `Please wait ${wait}s before sending another payment request.` });
    return;
  }
  lastStkByIp.set(ip, Date.now());
  if (lastStkByIp.size > 500) {
    const now = Date.now();
    for (const [k, t] of lastStkByIp) if (now - t > STK_COOLDOWN_MS) lastStkByIp.delete(k);
  }

  const { amount, donorName, campaignId, ward } = parsed.data;
  const accountReference = "MULE2027";
  const timestamp = darajaTimestamp();

  try {
    const token = await getAccessToken(cfg);
    const stkRes = await fetch(`${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: cfg.shortcode,
        Password: stkPassword(cfg.shortcode, cfg.passkey, timestamp),
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: cfg.shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl(),
        AccountReference: accountReference,
        TransactionDesc: "Campaign contribution",
      }),
    });
    const stkData = (await stkRes.json()) as Record<string, unknown>;

    if (!stkRes.ok || stkData.ResponseCode !== "0") {
      const msg =
        (stkData.errorMessage as string) ||
        (stkData.ResponseDescription as string) ||
        `Daraja STK push failed (${stkRes.status})`;
      req.log.error({ stkData, status: stkRes.status }, "mpesa stk push rejected");
      res.status(502).json({ error: msg });
      return;
    }

    const [tx] = await db
      .insert(mpesaTransactionsTable)
      .values({
        checkoutRequestId: String(stkData.CheckoutRequestID),
        merchantRequestId: String(stkData.MerchantRequestID ?? ""),
        phone,
        amount,
        accountReference,
        donorName: donorName || null,
        campaignId: campaignId ?? null,
        ward: ward || null,
        status: "pending",
      })
      .returning();

    res.json({
      checkoutRequestId: tx.checkoutRequestId,
      message: "Payment prompt sent. Ask the donor to enter their M-Pesa PIN on their phone.",
    });
  } catch (err) {
    req.log.error({ err }, "mpesa stk push failed");
    res.status(502).json({ error: err instanceof Error ? err.message : "M-Pesa request failed" });
  }
});

function maskPhone(phone: string): string {
  return `${phone.slice(0, 6)}***${phone.slice(-2)}`;
}

// Records a successful transaction as a donation exactly once. The callback
// and the status-query fallback can both land at the same time (and prod runs
// multiple autoscale instances), so we take a row lock inside a transaction:
// only the claimant that sees donation_id IS NULL inserts the donation.
async function recordDonation(txId: number): Promise<void> {
  await db.transaction(async (trx) => {
    const [tx] = await trx
      .select()
      .from(mpesaTransactionsTable)
      .where(eq(mpesaTransactionsTable.id, txId))
      .for("update");
    if (!tx || tx.status !== "success" || tx.donationId) return;
    const [donation] = await trx
      .insert(donationsTable)
      .values({
        donorName: tx.donorName || `M-Pesa ${maskPhone(tx.phone)}`,
        amount: tx.amount,
        channel: "mpesa",
        reference: tx.mpesaReceipt,
        ward: tx.ward,
        campaignId: tx.campaignId,
        notes: "Auto-recorded via M-Pesa STK push gateway",
        reconciled: 1,
      })
      .returning();
    await trx
      .update(mpesaTransactionsTable)
      .set({ donationId: donation.id, updatedAt: new Date() })
      .where(eq(mpesaTransactionsTable.id, txId));
    if (tx.campaignId) {
      await trx
        .update(fundraisingCampaignsTable)
        .set({ raisedAmount: sql`${fundraisingCampaignsTable.raisedAmount} + ${tx.amount}` })
        .where(eq(fundraisingCampaignsTable.id, tx.campaignId));
    }
  });
}

// Daraja calls this URL with the payment result. It must always return 200
// with a ResultCode so Safaricom stops retrying.
router.post("/callback", async (req, res) => {
  try {
    const stk = req.body?.Body?.stkCallback;
    if (!stk?.CheckoutRequestID) {
      res.json({ ResultCode: 0, ResultDesc: "Accepted" });
      return;
    }
    const checkoutRequestId = String(stk.CheckoutRequestID);
    const resultCode = Number(stk.ResultCode);
    const items: Array<{ Name: string; Value?: unknown }> = stk.CallbackMetadata?.Item ?? [];
    const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value;

    const [tx] = await db
      .update(mpesaTransactionsTable)
      .set({
        status: resultCode === 0 ? "success" : "failed",
        resultCode,
        resultDesc: String(stk.ResultDesc ?? ""),
        mpesaReceipt: receipt ? String(receipt) : null,
        updatedAt: new Date(),
      })
      .where(eq(mpesaTransactionsTable.checkoutRequestId, checkoutRequestId))
      .returning();

    if (tx && resultCode === 0) await recordDonation(tx.id);
    req.log.info({ checkoutRequestId, resultCode }, "mpesa callback processed");
  } catch (err) {
    req.log.error({ err }, "mpesa callback error");
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// Frontend polls this; if the callback hasn't landed after a grace period we
// query Daraja directly so a lost callback doesn't strand the transaction.
router.get("/status/:checkoutRequestId", async (req, res) => {
  const checkoutRequestId = req.params.checkoutRequestId;
  const [tx] = await db
    .select()
    .from(mpesaTransactionsTable)
    .where(eq(mpesaTransactionsTable.checkoutRequestId, checkoutRequestId));
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (tx.status === "pending" && Date.now() - tx.createdAt.getTime() > 20_000) {
    const cfg = darajaConfig();
    if (cfg) {
      try {
        const token = await getAccessToken(cfg);
        const timestamp = darajaTimestamp();
        const qRes = await fetch(`${cfg.baseUrl}/mpesa/stkpushquery/v1/query`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            BusinessShortCode: cfg.shortcode,
            Password: stkPassword(cfg.shortcode, cfg.passkey, timestamp),
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestId,
          }),
        });
        const qData = (await qRes.json()) as Record<string, unknown>;
        if (qData.ResultCode !== undefined) {
          const rc = Number(qData.ResultCode);
          const [updated] = await db
            .update(mpesaTransactionsTable)
            .set({
              status: rc === 0 ? "success" : "failed",
              resultCode: rc,
              resultDesc: String(qData.ResultDesc ?? ""),
              updatedAt: new Date(),
            })
            .where(eq(mpesaTransactionsTable.checkoutRequestId, checkoutRequestId))
            .returning();
          if (updated && rc === 0) await recordDonation(updated.id);
          res.json(updated ? { ...updated, phone: maskPhone(updated.phone) } : updated);
          return;
        }
      } catch (err) {
        req.log.warn({ err }, "mpesa status query failed; returning stored status");
      }
    }
  }

  res.json({ ...tx, phone: maskPhone(tx.phone) });
});

router.get("/transactions", async (_req, res) => {
  const rows = await db
    .select()
    .from(mpesaTransactionsTable)
    .orderBy(desc(mpesaTransactionsTable.createdAt))
    .limit(50);
  // Redact phone numbers: these routes are publicly reachable.
  res.json(rows.map((r) => ({ ...r, phone: maskPhone(r.phone) })));
});

export default router;
