import express, { Router, type ErrorRequestHandler } from "express";
import { createHash } from "node:crypto";
import { db, messagingProvidersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "../lib/auth";
import {
  seal,
  unseal,
  detectionScores,
  validMedia,
} from "../lib/connected-features";
import { listFeature, saveFeature, archiveFeature } from "../lib/feature-store";
const router = Router();
const running = new Set<number>();
async function credentials() {
  const [saved] = await db
    .select()
    .from(messagingProvidersTable)
    .where(
      and(
        eq(messagingProvidersTable.channel, "deepfake"),
        eq(messagingProvidersTable.provider, "sightengine"),
        eq(messagingProvidersTable.isActive, true),
      ),
    );
  if (saved?.apiKey && saved.apiSecret)
    return { user: unseal(saved.apiKey), secret: unseal(saved.apiSecret) };
  return process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET
    ? {
        user: process.env.SIGHTENGINE_API_USER,
        secret: process.env.SIGHTENGINE_API_SECRET,
      }
    : null;
}
router.get("/status", async (_req, res) => {
  try {
    res.json({ configured: !!(await credentials()), provider: "Sightengine" });
  } catch {
    res.json({
      configured: false,
      provider: "Sightengine",
      error: "Saved credentials need to be entered again",
    });
  }
});
router.put(
  "/settings",
  requirePermission("admin", "write"),
  async (req, res) => {
    const p = z
      .object({
        apiUser: z.string().trim().min(1).max(200),
        apiSecret: z.string().trim().min(1).max(500),
      })
      .strict()
      .safeParse(req.body);
    if (!p.success) {
      res
        .status(400)
        .json({
          error: "Both Sightengine API user and API secret are required",
        });
      return;
    }
    const values = {
      channel: "deepfake",
      provider: "sightengine",
      apiKey: seal(p.data.apiUser),
      apiSecret: seal(p.data.apiSecret),
      isActive: true,
      updatedAt: new Date(),
    };
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`deepfake-settings-${req.campaignId}`}))`,
      );
      const [old] = await tx
        .select()
        .from(messagingProvidersTable)
        .where(eq(messagingProvidersTable.channel, "deepfake"));
      if (old)
        await tx
          .update(messagingProvidersTable)
          .set(values)
          .where(eq(messagingProvidersTable.id, old.id));
      else await tx.insert(messagingProvidersTable).values(values);
    });
    res.json({ configured: true });
  },
);
router.get("/history", async (req, res) =>
  res.json(await listFeature(req.campaignId!, "deepfake-scans")),
);
router.delete("/history/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid scan" });
    return;
  }
  const ok = await archiveFeature(
    req.campaignId!,
    "deepfake-scans",
    id,
    req.currentUser!.email,
  );
  res
    .status(ok ? 200 : 404)
    .json(ok ? { ok: true } : { error: "Scan not found" });
});
router.post(
  "/analyse",
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"],
    limit: "20mb",
  }),
  async (req, res) => {
    const mime = req.get("content-type")?.split(";")[0] ?? "";
    if (
      !Buffer.isBuffer(req.body) ||
      !req.body.length ||
      !validMedia(req.body, mime)
    ) {
      res
        .status(400)
        .json({ error: "Upload a valid JPEG, PNG, WebP, MP4 or WebM file" });
      return;
    }
    if (running.has(req.campaignId!)) {
      res
        .status(429)
        .json({
          error:
            "A scan is already running for this campaign. Try again when it finishes.",
        });
      return;
    }
    const keys = await credentials();
    if (!keys) {
      res
        .status(409)
        .json({
          error:
            "Connect Sightengine in this module’s settings before scanning.",
        });
      return;
    }
    let filename = "media";
    try {
      filename = decodeURIComponent(req.get("x-file-name") || "media")
        .replace(/[\x00-\x1f]/g, "")
        .slice(0, 200);
    } catch {
      res.status(400).json({ error: "Invalid file name" });
      return;
    }
    const video = mime.startsWith("video/");
    if (running.has(req.campaignId!)) {
      res
        .status(429)
        .json({ error: "A scan is already running for this campaign." });
      return;
    }
    running.add(req.campaignId!);
    try {
      const form = new FormData();
      form.set("api_user", keys.user);
      form.set("api_secret", keys.secret);
      form.set("models", "deepfake,genai");
      form.set(
        "media",
        new Blob([new Uint8Array(req.body)], { type: mime }),
        filename,
      );
      const response = await fetch(
        `https://api.sightengine.com/1.0/${video ? "video/check-sync" : "check"}.json`,
        { method: "POST", body: form, signal: AbortSignal.timeout(90000) },
      );
      const payload = (await response.json()) as {
        status?: string;
        request?: { id?: string };
        error?: { code?: number; message?: string };
      };
      if (!response.ok || payload.status !== "success") {
        res
          .status(502)
          .json({
            error:
              "Detection provider rejected the scan. Check credentials, account credits, media format and the 60-second video limit.",
            providerCode: payload.error?.code,
          });
        return;
      }
      const scores = detectionScores(payload);
      const row = await saveFeature(
        req.campaignId!,
        "deepfake-scans",
        req.currentUser!.email,
        filename,
        "completed",
        {
          filename,
          mime,
          sha256: createHash("sha256").update(req.body).digest("hex"),
          bytes: req.body.length,
          provider: "Sightengine",
          requestId: payload.request?.id ?? null,
          ...scores,
        },
      );
      res.status(201).json(row);
    } catch {
      res
        .status(502)
        .json({
          error:
            "The scan could not be completed. Check provider connectivity and account settings, then try again.",
        });
    } finally {
      running.delete(req.campaignId!);
    }
  },
);
const uploadError: ErrorRequestHandler = (err, _req, res, next) => {
  if (err.type === "entity.too.large") {
    res.status(413).json({ error: "Maximum upload size is 20 MB" });
    return;
  }
  next(err);
};
router.use(uploadError);
export default router;
