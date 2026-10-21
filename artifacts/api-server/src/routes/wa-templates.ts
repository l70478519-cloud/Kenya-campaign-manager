import { Router, type ErrorRequestHandler } from "express";
import { db, messagingProvidersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  templateInput,
  templateComponents,
  type TemplateInput,
} from "../lib/connected-features";
import {
  listFeature,
  findFeature,
  saveFeature,
  archiveFeature,
  type FeatureRow,
  FeatureConflict,
} from "../lib/feature-store";
const router = Router();
// Fixed host and path construction keep provider paging URLs out of server requests.
const graphVersion = /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION ?? "")
  ? process.env.META_GRAPH_VERSION!
  : "v23.0";
async function metaProvider() {
  const [p] = await db
    .select()
    .from(messagingProvidersTable)
    .where(
      and(
        eq(messagingProvidersTable.channel, "whatsapp"),
        eq(messagingProvidersTable.provider, "meta"),
        eq(messagingProvidersTable.isActive, true),
      ),
    );
  return p?.apiKey && p.businessAccountId && /^\d+$/.test(p.businessAccountId)
    ? p
    : null;
}
async function graph(
  provider: NonNullable<Awaited<ReturnType<typeof metaProvider>>>,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  const data = (await response.json()) as Record<string, any>;
  if (!response.ok || data.error)
    throw new Error(
      `Meta rejected the request${data.error?.code ? ` (code ${data.error.code})` : ""}. Check account permissions, template content and WhatsApp provider settings.`,
    );
  return data;
}
const rowInput = (r: FeatureRow) =>
  templateInput.parse(
    Object.fromEntries(
      [
        "name",
        "language",
        "category",
        "body",
        "header",
        "footer",
        "examples",
      ].map((k) => [k, r.data[k]]),
    ),
  );
router.get("/status", async (_req, res) => {
  const p = await metaProvider();
  res.json({ configured: !!p, phoneConfigured: !!p?.phoneNumberId });
});
router.get("/", async (req, res) =>
  res.json(await listFeature(req.campaignId!, "wa-templates")),
);
router.post("/", async (req, res) => {
  const p = templateInput.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.issues[0].message });
    return;
  }
  const existing = await listFeature(req.campaignId!, "wa-templates");
  if (
    existing.some(
      (r) => r.data.name === p.data.name && r.data.language === p.data.language,
    )
  ) {
    res
      .status(409)
      .json({
        error:
          "A template with this name and language already exists. Edit it instead.",
      });
    return;
  }
  res
    .status(201)
    .json(
      await saveFeature(
        req.campaignId!,
        "wa-templates",
        req.currentUser!.email,
        p.data.name,
        "draft",
        p.data,
      ),
    );
});
router.patch("/:id", async (req, res) => {
  const p = templateInput.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.issues[0].message });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid template" });
    return;
  }
  const old = await findFeature(req.campaignId!, "wa-templates", id);
  if (!old) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (
    old.data.metaId &&
    (old.data.name !== p.data.name || old.data.language !== p.data.language)
  ) {
    res
      .status(409)
      .json({
        error:
          "Create a new draft to change the name or language of a submitted template.",
      });
    return;
  }
  res.json(
    await saveFeature(
      req.campaignId!,
      "wa-templates",
      req.currentUser!.email,
      p.data.name,
      "draft",
      { ...old.data, ...p.data },
      id,
      old.updatedAt,
    ),
  );
});
router.post("/:id/submit", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid template" });
    return;
  }
  const old = await findFeature(req.campaignId!, "wa-templates", id);
  if (!old) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  const provider = await metaProvider();
  if (!provider) {
    res
      .status(409)
      .json({
        error:
          "Connect an active Meta Cloud API provider with access token and WhatsApp Business Account ID in Messaging settings.",
      });
    return;
  }
  const input = rowInput(old);
  const metaId =
    typeof old.data.metaId === "string" && /^\d+$/.test(old.data.metaId)
      ? old.data.metaId
      : null;
  // An already submitted, unchanged template is refreshed rather than submitted twice.
  if (old.status !== "draft") {
    res
      .status(409)
      .json({
        error:
          "This template is already submitted. Sync its status or save your edits before submitting again.",
      });
    return;
  }
  try {
    const payload = await graph(
      provider,
      metaId ?? `${provider.businessAccountId}/message_templates`,
      {
        method: "POST",
        body: JSON.stringify(
          metaId
            ? {
                category: input.category,
                components: templateComponents(input),
              }
            : {
                name: input.name,
                language: input.language,
                category: input.category,
                components: templateComponents(input),
              },
        ),
      },
    );
    const remoteId = String(payload.id ?? metaId ?? "");
    if (!/^\d+$/.test(remoteId))
      throw new Error("Meta returned no template ID");
    res.json(
      await saveFeature(
        req.campaignId!,
        "wa-templates",
        req.currentUser!.email,
        old.title,
        "pending",
        {
          ...old.data,
          metaId: remoteId,
          metaStatus: payload.status ?? "PENDING",
          submittedAt: new Date().toISOString(),
        },
        id,
        old.updatedAt,
      ),
    );
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
router.post("/sync", async (req, res) => {
  const provider = await metaProvider();
  if (!provider) {
    res
      .status(409)
      .json({
        error:
          "Connect your Meta WhatsApp provider in Messaging settings before syncing.",
      });
    return;
  }
  try {
    const local = await listFeature(req.campaignId!, "wa-templates");
    let after = "",
      synced = 0,
      pages = 0;
    do {
      const payload = await graph(
        provider,
        `${provider.businessAccountId}/message_templates?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      );
      if (!Array.isArray(payload.data))
        throw new Error("Meta returned no template list");
      for (const t of payload.data) {
        const old = local.find(
          (r) =>
            r.data.metaId === String(t.id) ||
            (r.data.name === t.name && r.data.language === t.language),
        );
        if (!old) continue; // Remote account templates are not silently imported into a campaign.
        // Preserve local edits until they have been submitted to Meta.
        if (old.status === "draft") continue;
        const status = String(t.status ?? "UNKNOWN").toLowerCase();
        await saveFeature(
          req.campaignId!,
          "wa-templates",
          req.currentUser!.email,
          old.title,
          ["approved", "rejected", "paused", "disabled", "pending"].includes(
            status,
          )
            ? status
            : "pending",
          {
            ...old.data,
            metaId: String(t.id),
            metaStatus: t.status,
            reason: t.rejected_reason ?? null,
            syncedAt: new Date().toISOString(),
          },
          old.id,
          old.updatedAt,
        );
        synced++;
      }
      after =
        payload.paging?.next && payload.paging?.cursors?.after
          ? String(payload.paging.cursors.after)
          : "";
      pages++;
    } while (after && pages < 10);
    res.json({ synced, truncated: !!after });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
router.post("/:id/test", async (req, res) => {
  const p = z
    .object({
      phone: z
        .string()
        .regex(/^254\d{9}$/, "Enter a Kenyan number starting with 254"),
      values: z.array(z.string().min(1).max(200)).max(20),
      confirm: z.literal(true),
    })
    .strict()
    .safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.issues[0].message });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid template" });
    return;
  }
  const row = await findFeature(req.campaignId!, "wa-templates", id);
  if (!row) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (row.status !== "approved") {
    res
      .status(409)
      .json({ error: "Sync an approved template before sending a test." });
    return;
  }
  const input = rowInput(row);
  if (input.examples.length !== p.data.values.length) {
    res.status(400).json({ error: "Provide a value for every placeholder" });
    return;
  }
  const provider = await metaProvider();
  if (!provider?.phoneNumberId || !/^\d+$/.test(provider.phoneNumberId)) {
    res
      .status(409)
      .json({
        error: "Configure Meta WhatsApp Phone Number ID in Messaging settings.",
      });
    return;
  }
  try {
    const response = await graph(
      provider,
      `${provider.phoneNumberId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: p.data.phone,
          type: "template",
          template: {
            name: input.name,
            language: { code: input.language },
            ...(p.data.values.length
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: p.data.values.map((text) => ({
                        type: "text",
                        text,
                      })),
                    },
                  ],
                }
              : {}),
          },
        }),
      },
    );
    if (!response.messages?.[0]?.id)
      throw new Error("Meta returned no message receipt");
    res.json({ accepted: true, providerMessageId: response.messages[0].id });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid template" });
    return;
  }
  const ok = await archiveFeature(
    req.campaignId!,
    "wa-templates",
    id,
    req.currentUser!.email,
  );
  res
    .status(ok ? 200 : 404)
    .json(ok ? { ok: true } : { error: "Template not found" });
});
const conflict: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof FeatureConflict) {
    res.status(409).json({ error: err.message });
    return;
  }
  next(err);
};
router.use(conflict);
export default router;
