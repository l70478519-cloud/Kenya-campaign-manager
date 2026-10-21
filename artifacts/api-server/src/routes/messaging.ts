import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, runAsSystem, campaignWards, messageCampaignsTable, messageDeliveriesTable, membersTable, segmentsTable, messagingProvidersTable } from "@workspace/db";
import { eq, sql, and, inArray, isNotNull } from "drizzle-orm";

const router = Router();

// Ensure older production databases have the columns required for campaign-specific CSV lists.
let csvSchemaReady: Promise<void> | null = null;
async function ensureCsvRecipientSchema() {
  if (!csvSchemaReady) {
    csvSchemaReady = (async () => {
      await runAsSystem(() => db.execute(sql`ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS recipient_list text`));
    })().catch((error) => {
      csvSchemaReady = null;
      throw error;
    });
  }
  return csvSchemaReady;
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

async function updateCampaignDeliveryCounts(campaignId: number) {
  const [counts] = await db.select({
    total: sql<number>`count(*)`,
    delivered: sql<number>`sum(case when ${messageDeliveriesTable.status} = 'delivered' then 1 else 0 end)`,
  }).from(messageDeliveriesTable).where(eq(messageDeliveriesTable.campaignId, campaignId));
  await db.update(messageCampaignsTable).set({
    recipientCount: Number(counts?.total ?? 0),
    deliveredCount: Number(counts?.delivered ?? 0),
  }).where(eq(messageCampaignsTable.id, campaignId));
}

router.get("/stats", async (_req, res) => {
  const [totals] = await db.select({
    totalSent: sql<number>`sum(${messageCampaignsTable.recipientCount})`,
    totalDelivered: sql<number>`sum(${messageCampaignsTable.deliveredCount})`,
    totalOpened: sql<number>`sum(${messageCampaignsTable.openedCount})`,
  }).from(messageCampaignsTable).where(isNotNull(messageCampaignsTable.sentAt));
  const byChannelRaw = await db.select({
    channel: messageCampaignsTable.channel,
    sent: sql<number>`sum(${messageCampaignsTable.recipientCount})`,
    delivered: sql<number>`sum(${messageCampaignsTable.deliveredCount})`,
    opened: sql<number>`sum(${messageCampaignsTable.openedCount})`,
  }).from(messageCampaignsTable).where(isNotNull(messageCampaignsTable.sentAt)).groupBy(messageCampaignsTable.channel);
  const totalSent = Number(totals?.totalSent ?? 0);
  const totalDelivered = Number(totals?.totalDelivered ?? 0);
  const totalOpened = Number(totals?.totalOpened ?? 0);
  res.json({
    totalSent, totalDelivered, totalOpened,
    deliveryRate: totalSent > 0 ? totalDelivered / totalSent : 0,
    openRate: totalDelivered > 0 ? totalOpened / totalDelivered : 0,
    byChannel: byChannelRaw.map(r => ({
      channel: r.channel, sent: Number(r.sent), delivered: Number(r.delivered),
      openRate: Number(r.delivered) > 0 ? Number(r.opened) / Number(r.delivered) : 0,
    })),
  });
});

// Provider config — MUST be before /:id routes. Never return secrets to the browser.
router.get("/providers", async (_req, res) => {
  const providers = await db.select().from(messagingProvidersTable);
  res.json(providers.map(({ apiKey, apiSecret, username, smtpPassword, webhookSecret, ...safe }) => ({
    ...safe,
    hasApiKey: Boolean(apiKey), hasApiSecret: Boolean(apiSecret),
    hasUsername: Boolean(username), hasSmtpPassword: Boolean(smtpPassword),
    hasWebhookSecret: Boolean(webhookSecret),
  })));
});

router.post("/providers", async (req, res) => {
  const {
    channel, provider, apiKey, apiSecret, username, senderId,
    phoneNumber, phoneNumberId, businessAccountId, webhookSecret,
    smtpHost, smtpPort, smtpUser, smtpPassword, fromEmail, fromName, isActive,
  } = req.body;
  if (!channel || !provider) { res.status(400).json({ error: "channel and provider required" }); return; }
  const existingRows = await db.select().from(messagingProvidersTable).where(eq(messagingProvidersTable.channel, channel));
  const existing = existingRows[0];
  const values = {
    channel, provider,
    apiKey: apiKey || existing?.apiKey || null,
    apiSecret: apiSecret || existing?.apiSecret || null,
    username: username || existing?.username || null,
    senderId: senderId || null, phoneNumber: phoneNumber || null,
    phoneNumberId: phoneNumberId || null, businessAccountId: businessAccountId || null,
    webhookSecret: webhookSecret || existing?.webhookSecret || null,
    smtpHost: smtpHost || null, smtpPort: smtpPort || null, smtpUser: smtpUser || null,
    smtpPassword: smtpPassword || existing?.smtpPassword || null,
    fromEmail: fromEmail || null, fromName: fromName || null,
    isActive: isActive !== false, updatedAt: new Date(),
  };
  if (existing) {
    const [updated] = await db.update(messagingProvidersTable).set(values).where(eq(messagingProvidersTable.id, existing.id)).returning();
    res.json({ ...updated, apiKey: undefined, apiSecret: undefined, username: undefined, smtpPassword: undefined, webhookSecret: undefined });
  } else {
    const [created] = await db.insert(messagingProvidersTable).values(values).returning();
    res.status(201).json({ ...created, apiKey: undefined, apiSecret: undefined, username: undefined, smtpPassword: undefined, webhookSecret: undefined });
  }
});

// Read-only Onfon balance check. Never expose saved API credentials to clients.
router.get("/providers/onfon/health", async (_req, res) => {
  const [provider] = await db.select().from(messagingProvidersTable)
    .where(and(eq(messagingProvidersTable.channel, "sms"), eq(messagingProvidersTable.provider, "onfonmedia"), eq(messagingProvidersTable.isActive, true)));
  if (!provider) return res.status(404).json({ status: "unconfigured", error: "No active Onfon SMS provider found." });
  if (!provider.apiKey || !provider.username || !provider.apiSecret) {
    return res.status(409).json({ status: "incomplete", error: "Onfon API Key, Client ID or Access Key is missing." });
  }
  try {
    const url = new URL("https://api.onfonmedia.co.ke/v1/sms/Balance");
    url.searchParams.set("ApiKey", provider.apiKey);
    url.searchParams.set("ClientId", provider.username);
    const response = await fetch(url, {
      headers: { AccessKey: provider.apiSecret, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const payload = await response.json() as { ErrorCode?: number | string; ErrorDescription?: string; Data?: Array<{ PluginType?: string; Credits?: string }> };
    if (!response.ok || Number(payload.ErrorCode) !== 0) {
      return res.status(502).json({ status: "failed", error: payload.ErrorDescription || `Onfon returned HTTP ${response.status}`, providerCode: String(payload.ErrorCode ?? "") });
    }
    return res.json({ status: "connected", checkedAt: new Date().toISOString(), balances: (payload.Data ?? []).map(item => ({ type: item.PluginType, credits: item.Credits })) });
  } catch (err) {
    console.error("[messaging] Onfon balance check failed", err instanceof Error ? err.message : "Unknown error");
    return res.status(502).json({ status: "unavailable", error: "Could not reach the Onfon balance service. Check the Render API logs." });
  }
});

router.delete("/providers/:id", async (req, res) => {
  await db.delete(messagingProvidersTable).where(eq(messagingProvidersTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

router.get("/", async (req, res) => {
  const { channel, status } = req.query as Record<string, string>;
  const conditions = [];
  if (channel) conditions.push(eq(messageCampaignsTable.channel, channel));
  if (status) conditions.push(eq(messageCampaignsTable.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  const campaigns = await db.select().from(messageCampaignsTable).where(where).orderBy(messageCampaignsTable.createdAt);
  res.json(campaigns);
});

router.post("/", async (req, res) => {
  try {
  const { name, channel, messageBody, segmentId, scheduledAt, recipientList } = req.body;
  if (!name || !channel || !messageBody) { res.status(400).json({ error: "name, channel, messageBody required" }); return; }
  if (!["sms", "whatsapp"].includes(channel)) {
    res.status(400).json({ error: "Real sending is currently enabled for SMS and WhatsApp only." }); return;
  }
  if (recipientList !== undefined && (!Array.isArray(recipientList) || recipientList.length > 10000)) {
    res.status(400).json({ error: "CSV list must contain no more than 10,000 contacts." }); return;
  }
  if (Array.isArray(recipientList) && recipientList.some((r: any) => !r || typeof r.phone !== "string" || !r.phone.trim() || r.consent !== true || (r.ward && !campaignWards().includes(String(r.ward).trim())))) {
    res.status(400).json({ error: "Every CSV contact must have a phone number and explicit consent. If a ward is provided, it must be a Kaiti ward." }); return;
  }
  if (Array.isArray(recipientList)) await ensureCsvRecipientSchema();
  const [campaign] = await db.insert(messageCampaignsTable).values({
    name, channel, messageBody, segmentId, recipientList: Array.isArray(recipientList) ? JSON.stringify(recipientList) : null, status: "draft",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    recipientCount: 0, deliveredCount: 0, openedCount: 0, clickedCount: 0,
  }).returning();
  res.status(201).json(campaign);
  } catch (error) {
    console.error("[messaging] Failed to save campaign draft:", error);
    res.status(500).json({ error: "Could not save campaign draft. Check the database schema and server logs.", detail: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/:id", async (req, res) => {
  const [campaign] = await db.select().from(messageCampaignsTable).where(eq(messageCampaignsTable.id, parseInt(req.params.id)));
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
  res.json(campaign);
});

router.patch("/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }
  const [existing] = await db.select().from(messageCampaignsTable).where(eq(messageCampaignsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const updates: Record<string, unknown> = {};
  for (const f of ["name", "messageBody", "segmentId", "scheduledAt", "recipientList"]) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (updates.scheduledAt) updates.scheduledAt = new Date(String(updates.scheduledAt));
  if (updates.recipientList !== undefined) {
    const list = updates.recipientList;
    if (!Array.isArray(list) || list.length > 10000 || list.some((r: any) => !r || typeof r.phone !== "string" || !r.phone.trim() || r.consent !== true)) {
      res.status(400).json({ error: "CSV list must contain up to 10,000 contacts with phone numbers and explicit channel consent." }); return;
    }
    updates.recipientList = JSON.stringify(list);
  }
  if (req.body.status !== undefined) {
    if (req.body.status !== "confirmed" || !existing.scheduledAt || existing.status !== "draft") {
      res.status(400).json({ error: "Only a scheduled draft can be marked officially confirmed." }); return;
    }
    updates.status = "confirmed";
  }
  const [campaign] = await db.update(messageCampaignsTable).set(updates).where(eq(messageCampaignsTable.id, id)).returning();
  res.json(campaign);
});

router.delete("/:id", async (req, res) => {
  const campaignId = parseInt(req.params.id);
  const [record] = await db.select().from(messageCampaignsTable).where(eq(messageCampaignsTable.id, campaignId));
  if (!record) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (record.status !== "draft") { res.status(409).json({ error: "Sent or processed message history cannot be deleted." }); return; }
  await db.delete(messageCampaignsTable).where(eq(messageCampaignsTable.id, campaignId));
  res.status(204).send();
});

// Twilio callback: validates X-Twilio-Signature and updates delivery receipts.
router.post("/webhooks/twilio", async (req, res) => {
  const signature = String(req.header("x-twilio-signature") ?? "");
  const publicBase = String(process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const params = req.body as Record<string, string>;
  if (!publicBase || !signature) { res.status(401).json({ error: "Webhook validation is not configured" }); return; }
  const url = `${publicBase}/api/messages/webhooks/twilio`;
  const twilioProviders = await db.select().from(messagingProvidersTable)
    .where(and(eq(messagingProvidersTable.isActive, true), inArray(messagingProvidersTable.provider, ["twilio", "twilio_wa"])));
  const data = Object.keys(params).sort().map(key => key + String(params[key] ?? "")).join("");
  const validSignature = twilioProviders.some(provider => {
    if (!provider.apiKey) return false;
    const expected = createHmac("sha1", provider.apiKey).update(url + data).digest("base64");
    return safeEqual(signature, expected);
  });
  if (!validSignature) { res.status(403).json({ error: "Invalid webhook signature" }); return; }
  const sid = String(params.MessageSid ?? params.SmsSid ?? "");
  const providerStatus = String(params.MessageStatus ?? params.SmsStatus ?? "").toLowerCase();
  if (!sid || !providerStatus) { res.status(400).json({ error: "MessageSid and MessageStatus required" }); return; }
  const status = ["delivered", "read"].includes(providerStatus) ? "delivered"
    : ["failed", "undelivered"].includes(providerStatus) ? "failed"
    : ["queued", "accepted", "sending", "sent"].includes(providerStatus) ? "sent" : null;
  if (!status) { res.status(200).json({ ok: true, ignored: true }); return; }
  const [delivery] = await db.select().from(messageDeliveriesTable).where(eq(messageDeliveriesTable.providerMessageId, sid));
  if (!delivery) { res.status(200).json({ ok: true, unmatched: true }); return; }
  await db.update(messageDeliveriesTable).set({
    status, deliveredAt: status === "delivered" ? new Date() : delivery.deliveredAt,
    updatedAt: new Date(), errorMessage: params.ErrorMessage ? String(params.ErrorMessage).slice(0, 500) : delivery.errorMessage,
  }).where(eq(messageDeliveriesTable.id, delivery.id));
  await updateCampaignDeliveryCounts(delivery.campaignId);
  res.json({ ok: true });
});

// Africa's Talking delivery report callback. Configure the provider callback to send
// the shared webhook secret in X-Webhook-Secret; never accept unauthenticated receipts.
router.post("/webhooks/africastalking", async (req, res) => {
  const suppliedSecret = String(req.header("x-webhook-secret") ?? "");
  const [provider] = await db.select().from(messagingProvidersTable)
    .where(and(eq(messagingProvidersTable.provider, "africastalking"), eq(messagingProvidersTable.isActive, true)));
  if (!provider?.webhookSecret || !suppliedSecret || !safeEqual(suppliedSecret, provider.webhookSecret)) {
    res.status(403).json({ error: "Invalid delivery callback credentials" }); return;
  }
  const payload = req.body as Record<string, unknown>;
  const messageId = String(payload.id ?? payload.messageId ?? "");
  const providerStatus = String(payload.status ?? "").toLowerCase();
  if (!messageId || !providerStatus) { res.status(400).json({ error: "Message id and status required" }); return; }
  const status = ["success", "delivered"].includes(providerStatus) ? "delivered"
    : ["failed", "rejected", "undelivered"].includes(providerStatus) ? "failed"
    : ["sent", "submitted", "buffered", "pending"].includes(providerStatus) ? "sent" : null;
  if (!status) { res.status(200).json({ ok: true, ignored: true }); return; }
  const [delivery] = await db.select().from(messageDeliveriesTable)
    .where(eq(messageDeliveriesTable.providerMessageId, messageId));
  if (!delivery) { res.status(200).json({ ok: true, unmatched: true }); return; }
  await db.update(messageDeliveriesTable).set({
    status,
    deliveredAt: status === "delivered" ? new Date() : delivery.deliveredAt,
    errorMessage: status === "failed" ? String(payload.failureReason ?? providerStatus).slice(0, 500) : delivery.errorMessage,
    updatedAt: new Date(),
  }).where(eq(messageDeliveriesTable.id, delivery.id));
  await updateCampaignDeliveryCounts(delivery.campaignId);
  res.json({ ok: true });
});

function personalizeMessage(template: string, member: { firstName?: string | null; lastName?: string | null; ward?: string | null; phone?: string | null; supportLevel?: string | null }, campaignName: string) {
  const firstName = member.firstName?.trim() ?? "";
  const lastName = member.lastName?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "friend";
  const values: Record<string, string> = {
    name: fullName,
    fullname: fullName,
    firstname: firstName || fullName,
    lastname: lastName,
    ward: member.ward?.trim() ?? "",
    phone: member.phone?.trim() ?? "",
    supportlevel: member.supportLevel?.trim() ?? "",
    county: "Makueni", // Administrative county; Kaiti is the constituency
    campaignname: campaignName,
  };
  return template.replace(/##([A-Za-z]+)##/g, (token, key: string) => {
    const value = values[key.toLowerCase()];
    return value === undefined ? token : value;
  });
}

router.post("/:id/send", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }
  const [campaign] = await db.select().from(messageCampaignsTable).where(eq(messageCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
  if (!["sms", "whatsapp"].includes(campaign.channel)) { res.status(400).json({ error: "Unsupported channel for live sending" }); return; }
  if (!["draft", "failed", "confirmed"].includes(campaign.status)) { res.status(409).json({ error: "Campaign is already processing or sent" }); return; }
  if (campaign.scheduledAt) {
    if (campaign.status !== "confirmed") {
      res.status(409).json({ error: "Official confirmation is required before a scheduled campaign can be sent." }); return;
    }
    if (new Date(campaign.scheduledAt).getTime() > Date.now()) {
      res.status(409).json({ error: "The scheduled time has not arrived yet." }); return;
    }
  }
  const [provider] = await db.select().from(messagingProvidersTable)
    .where(and(eq(messagingProvidersTable.channel, campaign.channel), eq(messagingProvidersTable.isActive, true)));
  if (!provider) { res.status(409).json({ error: `No active ${campaign.channel} provider configured` }); return; }
  const supported = campaign.channel === "sms"
    ? ["africastalking", "twilio", "onfonmedia"].includes(provider.provider)
    : ["twilio_wa"].includes(provider.provider);
  if (!supported) { res.status(409).json({ error: "The configured provider is not supported for live sending yet" }); return; }
  if (provider.provider === "twilio" || provider.provider === "twilio_wa") {
    if (!provider.username || !provider.apiKey || !provider.senderId) { res.status(409).json({ error: "Twilio requires Account SID, Auth Token and sender phone number" }); return; }
  } else if (provider.provider === "onfonmedia") {
    if (!provider.apiKey || !provider.username || !provider.apiSecret || !provider.senderId) {
      res.status(409).json({ error: "Onfon Media requires API Key, Client ID, Access Key and approved Sender ID" }); return;
    }
  } else if (!provider.apiKey || !provider.username) {
    res.status(409).json({ error: "Africa's Talking requires API key and username" }); return;
  }

  let candidates = await db.select().from(membersTable)
    .where(and(inArray(membersTable.ward, campaignWards()), eq(membersTable.status, "active")));
  let uploadedRecipients: Array<{ id: number; firstName: string; lastName: string; phone: string; ward?: string; supportLevel?: string; consent: boolean; smsConsent: boolean; whatsappConsent: boolean }> = [];
  if (campaign.recipientList) {
    try {
      const parsed = JSON.parse(campaign.recipientList);
      if (!Array.isArray(parsed) || parsed.length > 10000 || parsed.some((r: any) => !r || typeof r.phone !== "string" || !r.phone.trim() || r.consent !== true)) {
        res.status(400).json({ error: "Saved CSV must contain valid phone numbers and explicit consent for every recipient." }); return;
      }
      uploadedRecipients = parsed.map((r: any, i: number) => ({ id: -(i + 1), firstName: String(r.firstName ?? ""), lastName: String(r.lastName ?? ""), phone: String(r.phone), ward: r.ward ? String(r.ward) : "", supportLevel: r.supportLevel ? String(r.supportLevel) : "", consent: true, smsConsent: true, whatsappConsent: true }));
    } catch {
      res.status(400).json({ error: "Saved CSV list could not be read. Re-upload the file." }); return;
    }
  }
  if (campaign.segmentId && uploadedRecipients.length) {
    res.status(400).json({ error: "Choose either a saved segment or an uploaded CSV list, not both." }); return;
  }
  if (campaign.segmentId) {
    const [segment] = await db.select().from(segmentsTable).where(eq(segmentsTable.id, campaign.segmentId));
    if (!segment) { res.status(400).json({ error: "Selected segment does not exist" }); return; }
    const criteria = (segment.criteria ?? {}) as Record<string, unknown>;
    if (typeof criteria.ward === "string" && criteria.ward !== "all" && criteria.ward !== "county-wide") {
      if (!campaignWards().includes(criteria.ward)) { res.status(400).json({ error: "Segment contains a ward outside this campaign" }); return; }
      candidates = candidates.filter(m => m.ward === criteria.ward);
    }
    if (typeof criteria.supportLevel === "string") candidates = candidates.filter(m => m.supportLevel === criteria.supportLevel);
  }
  const consentField = campaign.channel === "whatsapp" ? "whatsappConsent" : "smsConsent";
  const contactField = campaign.channel === "whatsapp" ? "phone" : "phone";
  const recipients = uploadedRecipients.length ? uploadedRecipients : candidates.filter(m => Boolean(m[consentField]) && Boolean(m[contactField]?.trim()));
  if (!recipients.length) { res.status(409).json({ error: "No active Kaiti recipients with valid contact details and explicit channel consent" }); return; }

  await db.update(messageCampaignsTable).set({ status: "sending", recipientCount: recipients.length, deliveredCount: 0, openedCount: 0, clickedCount: 0 }).where(eq(messageCampaignsTable.id, id));
  let accepted = 0;
  let failed = 0;
  for (const member of recipients) {
    const recipient = member.phone!.trim();
    const personalizedBody = personalizeMessage(campaign.messageBody, member, campaign.name);
    try {
      let providerMessageId = "";
      if (provider.provider === "twilio" || provider.provider === "twilio_wa") {
        const accountSid = provider.username!;
        const from = provider.provider === "twilio_wa" ? `whatsapp:${provider.senderId}` : provider.senderId!;
        const to = provider.provider === "twilio_wa" ? `whatsapp:${recipient}` : recipient;
        const form = new URLSearchParams({ To: to, From: from, Body: personalizedBody });
        const publicBase = String(process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
        if (publicBase) form.set("StatusCallback", `${publicBase}/api/messages/webhooks/twilio`);
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: "POST", headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${provider.apiKey}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          }, body: form,
        });
        const payload = await response.json() as { sid?: string; status?: string; message?: string; code?: number };
        if (!response.ok || !payload.sid) throw new Error(payload.message ?? `Twilio HTTP ${response.status}`);
        providerMessageId = payload.sid;
      } else if (provider.provider === "onfonmedia") {
        const digits = recipient.replace(/\D/g, "");
        const number = digits.startsWith("0") ? "254" + digits.slice(1) : digits.startsWith("254") ? digits : digits;
        const response = await fetch("https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS", {
          method: "POST",
          headers: { "Content-Type": "application/json", AccessKey: provider.apiSecret! },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            SenderId: provider.senderId,
            IsUnicode: /[^\x00-\x7F]/.test(personalizedBody),
            IsFlash: false,
            MessageParameters: [{ Number: number, Text: personalizedBody }],
            ApiKey: provider.apiKey,
            ClientId: provider.username,
          }),
        });
        const payload = await response.json() as { ErrorCode?: number | string; ErrorDescription?: string; Data?: Array<{ MessageId?: string; MobileNumber?: string }> };
        const errorCode = String(payload.ErrorCode ?? "");
        const result = payload.Data?.[0];
        if (!response.ok || !["0", "000"].includes(errorCode) || !result?.MessageId) {
          throw new Error(payload.ErrorDescription ?? "Onfon Media HTTP " + response.status);
        }
        providerMessageId = result.MessageId;
      } else {
        const form = new URLSearchParams({ username: provider.username!, to: recipient, message: personalizedBody });
        if (provider.senderId) form.set("from", provider.senderId);
        const response = await fetch("https://api.africastalking.com/version1/messaging", {
          method: "POST", headers: { apiKey: provider.apiKey!, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
        });
        const payload = await response.json() as { SMSMessageData?: { Recipients?: Array<{ messageId?: string; status?: string; statusCode?: number }> } };
        const result = payload.SMSMessageData?.Recipients?.[0];
        if (!response.ok || !result?.messageId || (result.statusCode !== undefined && result.statusCode >= 400)) {
          throw new Error(result?.status ?? `Africa's Talking HTTP ${response.status}`);
        }
        providerMessageId = result.messageId;
      }
      await db.insert(messageDeliveriesTable).values({
        campaignId: id, ...(member.id > 0 ? { memberId: member.id } : {}), channel: campaign.channel, recipient,
        provider: provider.provider, providerMessageId, status: "sent", sentAt: new Date(), updatedAt: new Date(),
      });
      accepted++;
    } catch (error) {
      await db.insert(messageDeliveriesTable).values({
        campaignId: id, memberId: member.id, channel: campaign.channel, recipient,
        provider: provider.provider, status: "failed",
        errorMessage: String(error instanceof Error ? error.message : error).slice(0, 500), updatedAt: new Date(),
      });
      failed++;
    }
  }
  await db.update(messageCampaignsTable).set({
    status: failed === recipients.length ? "failed" : "sent",
    sentAt: accepted > 0 ? new Date() : null,
    recipientCount: recipients.length,
  }).where(eq(messageCampaignsTable.id, id));
  await updateCampaignDeliveryCounts(id);
  const [updated] = await db.select().from(messageCampaignsTable).where(eq(messageCampaignsTable.id, id));
  res.status(accepted > 0 ? 200 : 502).json({ ...updated, accepted, failed, message: "Provider acceptance is not the same as confirmed handset delivery; delivery counts update from provider receipts." });
});

export default router;
