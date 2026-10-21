import OpenAI from "openai";

const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY;

const baseURL =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
  "https://api.openai.com/v1";

export const aiEnabled = Boolean(
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
);

if (!aiEnabled) {
  console.warn("OpenAI integration is disabled.");
}

export const openai = new OpenAI({
  apiKey: apiKey || "openai-disabled",
  baseURL,
});


/**
 * Generate an image and return its bytes for server-side consumers.
 * Supports the OpenAI image API response formats (base64 or URL).
 */
export async function generateImageBuffer(
  prompt: string,
  options: { model?: string; size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto" } = {},
): Promise<Buffer> {
  const response = await openai.images.generate({
    model: options.model ?? "gpt-image-1",
    prompt,
    size: options.size ?? "1024x1024",
  });
  const image = response.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const downloaded = await fetch(image.url);
    if (!downloaded.ok) throw new Error(`Image download failed: ${downloaded.status}`);
    return Buffer.from(await downloaded.arrayBuffer());
  }
  throw new Error("Image generation returned no image data");
}

/**
 * Edit an image using the OpenAI image API. Accepts a Node Buffer or File.
 */
export async function editImages(
  imageInput: Buffer | Uint8Array | File,
  prompt: string,
  options: { model?: string; size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto" } = {},
): Promise<Buffer> {
  const { toFile } = await import("openai/uploads");
  const imageFile = imageInput instanceof File
    ? imageInput
    : await toFile(Buffer.from(imageInput), "image.png", { type: "image/png" });
  const response = await openai.images.edit({
    model: options.model ?? "gpt-image-1",
    image: imageFile,
    prompt,
    size: options.size ?? "1024x1024",
  });
  const image = response.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const downloaded = await fetch(image.url);
    if (!downloaded.ok) throw new Error(`Edited image download failed: ${downloaded.status}`);
    return Buffer.from(await downloaded.arrayBuffer());
  }
  throw new Error("Image editing returned no image data");
}
