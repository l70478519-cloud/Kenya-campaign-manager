import { logger } from "./logger";

/**
 * Sends a notification email through Brevo's HTTPS API (no SMTP, so it works
 * on hosts that block outbound mail ports). Does nothing unless BREVO_API_KEY
 * is set. Never throws: a failed email must not lose the saved record.
 */
export const SYSTEM_EMAIL = process.env.SYSTEM_EMAIL || "info@aclss.co.ke";

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function sendNotificationEmail(opts: {
  subject: string;
  rows: Array<[string, string | null | undefined]>;
  replyTo?: string;
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) { logger.warn({ subject: opts.subject }, "BREVO_API_KEY not set: demo request saved but NOT emailed"); return; }
  const to = process.env.DEMO_NOTIFY_EMAIL || SYSTEM_EMAIL;
  const from = process.env.MAIL_FROM || SYSTEM_EMAIL;
  const filled = opts.rows.filter(([, v]) => v);
  const html = `<table cellpadding="6" style="font-family:sans-serif;font-size:14px">${filled
    .map(([k, v]) => `<tr><td style="color:#666;vertical-align:top"><b>${esc(k)}</b></td><td style="white-space:pre-wrap">${esc(String(v))}</td></tr>`)
    .join("")}</table>`;
  const text = filled.map(([k, v]) => `${k}: ${v}`).join("\n");
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: process.env.MAIL_FROM_NAME || "Command Centre" },
        to: [{ email: to }],
        ...(opts.replyTo ? { replyTo: { email: opts.replyTo } } : {}),
        subject: opts.subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) logger.info({ to, subject: opts.subject }, "Notification email sent");
    else logger.warn({ status: r.status, body: await r.text().catch(() => "") }, "Notification email failed");
  } catch (err) {
    logger.warn({ err }, "Notification email failed");
  }
}
