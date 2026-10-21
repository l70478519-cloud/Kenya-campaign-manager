import { openai } from "@workspace/integrations-openai-ai-server";
import { currentCampaignProfile, campaignWards, type CampaignProfile } from "@workspace/db";
import { logger } from "./logger";

/**
 * Batch 5: campaign-aware AI.
 *
 * The AI features (Smart Assist, Strategist, speeches, SWOT, intelligence,
 * credentials) were written for Kaiti: their prompts name Hon. Job Tuta, Kaiti,
 * its four wards and the Makueni CIDPs. Rather than fork 15 prompts, every AI
 * call passes through here. In the primary campaign prompts are untouched. In
 * any other campaign the campaign's own profile is put first as the
 * authoritative context, Kaiti names are swapped for the campaign's, and the
 * model is told not to carry over Kaiti- or Makueni-specific facts.
 */

const KAITI_WARD_LIST = /Ukia,\s*Kee,\s*Kilungu,?\s*(and|or)\s*Ilima/gi;

export function campaignPreamble(p: CampaignProfile, wards: string[]): string {
  const lines = [
    `CAMPAIGN CONTEXT (authoritative; overrides anything below):`,
    `Campaign: ${p.name}.`,
    p.candidateName ? `Candidate: ${p.candidateName}${p.seat ? `, ${p.seat} aspirant` : ""}${p.party ? ` (${p.party})` : ""}.` : null,
    p.constituency ? `Constituency: ${p.constituency}${p.county ? `, ${p.county} County` : ""}, Kenya.` : null,
    wards.length ? `Wards: ${wards.join(", ")}.` : null,
    p.electionDate ? `Election date: ${p.electionDate}.` : null,
    p.profileSummary ? `Profile and priorities: ${p.profileSummary}` : null,
    `Facts below that are specific to Kaiti Constituency, its wards or Makueni County plans do not describe this campaign. Do not present them as facts about ${p.constituency ?? p.name}. Where you lack verified local facts, say so instead of inventing them.`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function localizeText(text: string, p: CampaignProfile, wards: string[]): string {
  let out = text;
  const place = p.constituency ?? p.name;
  const who = p.candidateName || "the candidate";
  out = out.replace(/Hon\.?\s+Job\s+Tuta/gi, who).replace(/\bJob Tuta\b/gi, who);
  if (wards.length) {
    out = out.replace(KAITI_WARD_LIST, wards.join(", "));
    out = out.replace(/\bfour (electoral |county assembly |assembly )?wards\b/gi, (_m, kind = "") => `${wards.length} ${kind}wards`);
  }
  out = out.replace(/Kaiti Constituency/gi, `${place}${/constituency/i.test(place) ? "" : " Constituency"}`).replace(/\bKAITI\b/g, place.toUpperCase()).replace(/\bKaiti\b/g, place);
  if (p.county && !/makueni/i.test(p.county)) out = out.replace(/Makueni County/gi, `${p.county} County`);
  return out;
}

type Msg = { role: string; content: unknown };
function localizeMessages(messages: Msg[], p: CampaignProfile, wards: string[]): Msg[] {
  const mapped = messages.map(m => ({ ...m, content: typeof m.content === "string" ? localizeText(m.content, p, wards) : m.content }));
  return [{ role: "system", content: campaignPreamble(p, wards) }, ...mapped];
}

let installed = false;
export function installCampaignAwareAi(): void {
  if (installed) return;
  installed = true;
  try {
    const chat = openai.chat.completions as unknown as { create: (body: Record<string, unknown>, opts?: unknown) => unknown };
    const origChat = chat.create.bind(chat);
    chat.create = (body, opts) => {
      const p = currentCampaignProfile();
      if (p && !p.isPrimary && Array.isArray(body.messages)) {
        body = { ...body, messages: localizeMessages(body.messages as Msg[], p, campaignWards()) };
      }
      return origChat(body, opts);
    };
    const responses = openai.responses as unknown as { create: (body: Record<string, unknown>, opts?: unknown) => unknown };
    const origResp = responses.create.bind(responses);
    responses.create = (body, opts) => {
      const p = currentCampaignProfile();
      if (p && !p.isPrimary) {
        const wards = campaignWards();
        const pre = campaignPreamble(p, wards);
        if (typeof body.input === "string") body = { ...body, input: localizeText(body.input, p, wards) };
        else if (Array.isArray(body.input)) body = { ...body, input: localizeMessages(body.input as Msg[], p, wards) };
        body = { ...body, instructions: typeof body.instructions === "string" ? `${pre}\n\n${localizeText(body.instructions, p, wards)}` : pre };
      }
      return origResp(body, opts);
    };
  } catch (err) {
    logger.error({ err }, "Could not install campaign-aware AI; AI features will use primary-campaign prompts");
  }
}

/** Localises every string in a template response for non-primary campaigns (free mode has no model to adapt it). */
export function localizeDeep<T>(value: T): T {
  const p = currentCampaignProfile();
  if (!p || p.isPrimary) return value;
  const wards = campaignWards();
  const walk = (v: unknown): unknown =>
    typeof v === "string" ? localizeText(v, p, wards)
      : Array.isArray(v) ? v.map(walk)
      : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]))
      : v;
  return walk(value) as T;
}
