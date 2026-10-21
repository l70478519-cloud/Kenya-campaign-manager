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
