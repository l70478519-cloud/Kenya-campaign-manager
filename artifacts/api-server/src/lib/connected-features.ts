import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

function secretKey() {
  const key = process.env.INTEGRATION_SECRET || process.env.SESSION_SECRET;
  if (!key)
    throw new Error("Set SESSION_SECRET before saving provider credentials");
  return createHash("sha256").update(key).digest();
}
export function seal(value: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", secretKey(), nonce);
  return [
    "v1",
    nonce.toString("base64"),
    Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString(
      "base64",
    ),
    cipher.getAuthTag().toString("base64"),
  ]
    .filter(Boolean)
    .join(":");
}
export function unseal(value: string) {
  const [version, nonce, data, tag] = value.split(":");
  if (version !== "v1" || !nonce || !data || !tag)
    throw new Error(
      "Provider credentials cannot be decrypted; save them again",
    );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey(),
    Buffer.from(nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
export const templateInput = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]{0,511}$/,
        "Use lowercase letters, numbers and underscores for the template name",
      ),
    language: z
      .string()
      .regex(
        /^[a-z]{2,3}(?:_[A-Z]{2})?$/,
        "Use a language code such as en_US or sw",
      ),
    category: z.enum(["UTILITY", "MARKETING"]),
    body: z.string().trim().min(1).max(1024),
    header: z.string().trim().max(60).default(""),
    footer: z.string().trim().max(60).default(""),
    examples: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    const slots = [
      ...new Set(
        [...v.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])),
      ),
    ].sort((a, b) => a - b);
    if (slots.some((n, i) => n !== i + 1) || slots.length !== v.examples.length)
      ctx.addIssue({
        code: "custom",
        message:
          "Body placeholders must run from {{1}} upwards, with one sample value for each",
      });
    if (
      /\{\{|\}\}/.test(v.body.replace(/\{\{\d+\}\}/g, "")) ||
      /\{\{|\}\}/.test(v.header + v.footer)
    )
      ctx.addIssue({
        code: "custom",
        message: "Only numbered body placeholders are supported",
      });
  });
export type TemplateInput = z.infer<typeof templateInput>;
export function templateComponents(t: TemplateInput) {
  const result: Record<string, unknown>[] = [];
  if (t.header) result.push({ type: "HEADER", format: "TEXT", text: t.header });
  result.push({
    type: "BODY",
    text: t.body,
    ...(t.examples.length ? { example: { body_text: [t.examples] } } : {}),
  });
  if (t.footer) result.push({ type: "FOOTER", text: t.footer });
  return result;
}
export function detectionScores(payload: unknown) {
  const data = payload as {
    type?: Record<string, unknown>;
    data?: {
      frames?: {
        type?: Record<string, unknown>;
        info?: { position?: number };
      }[];
    };
  };
  const score = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
  const frames = data?.data?.frames;
  if (Array.isArray(frames)) {
    const values = frames.map((f) => ({
      position: typeof f.info?.position === "number" ? f.info.position : null,
      deepfake: score(f.type?.deepfake),
      aiGenerated: score(f.type?.ai_generated),
    }));
    const max = (key: "deepfake" | "aiGenerated") => {
      const nums = values
        .map((v) => v[key])
        .filter((v): v is number => v !== null);
      return nums.length ? Math.max(...nums) : null;
    };
    if (!values.length || max("deepfake") === null)
      throw new Error(
        "The detector returned no usable face-manipulation scores",
      );
    return {
      deepfake: max("deepfake"),
      aiGenerated: max("aiGenerated"),
      frames: values,
    };
  }
  const deepfake = score(data?.type?.deepfake),
    aiGenerated = score(data?.type?.ai_generated);
  if (deepfake === null)
    throw new Error("The detector returned no usable face-manipulation score");
  return { deepfake, aiGenerated, frames: [] };
}
export function validMedia(data: Buffer, mime: string) {
  if (mime === "image/jpeg")
    return data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (mime === "image/png")
    return data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp")
    return (
      data.toString("ascii", 0, 4) === "RIFF" &&
      data.toString("ascii", 8, 12) === "WEBP"
    );
  if (mime === "video/mp4") return data.toString("ascii", 4, 8) === "ftyp";
  if (mime === "video/webm")
    return data.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  return false;
}
