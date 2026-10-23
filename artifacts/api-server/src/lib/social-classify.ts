/**
 * Classification for social listening mentions (docs/SOCIAL_LISTENING_PLAN.md, SL-3).
 *
 * The AI only labels text it is given; it never adds mentions or numbers.
 * Without an AI provider, a transparent word-list classifier is used and
 * labelled as such. Every label carries a confidence, and uncertain or urgent
 * items go to human review before they count in totals.
 *
 * Pure functions with no imports, so they can be unit-tested directly.
 */

export type Sentiment = "positive" | "negative" | "neutral";
export type Language = "en" | "sw" | "sheng" | "mixed" | "unknown";
export type Urgency = "high" | "normal" | "low";
export type Classification = {
  sentiment: Sentiment;
  topic: string | null;
  language: Language;
  urgency: Urgency;
  /** 0–100. */
  confidence: number;
  classifiedBy: "ai" | "rules";
};

const words = (list: string) => list.trim().split(/\s*\|\s*/);

const POSITIVE = words(`
  praise | praised | praises | welcome | welcomed | welcomes | launch | launched | launches | commission | commissioned |
  completed | completes | success | successful | boost | boosts | improve | improved | improves | upgrade | upgraded |
  donate | donated | donates | support | supported | empower | empowered | celebrate | celebrated | award | awarded | wins | won |
  maendeleo | pongezi | amepongeza | wamepongeza | ameshinda | amezindua | wamezindua | kuzindua | msaada | mafanikio | kuboresha`);
const NEGATIVE = words(`
  corruption | corrupt | scandal | fraud | stalled | abandoned | protest | protests | protesters | attack | attacked | violence |
  killed | death | dead | arrest | arrested | fake | failed | failure | complain | complaints | shortage | crisis | strike |
  unpaid | condemn | condemned | criticised | criticized | accuse | accused | flood | floods | drought | accident | theft | stolen |
  ufisadi | maandamano | ghasia | wizi | mauaji | uhaba | ukame | mafuriko | kukamatwa | kashfa | malalamiko | njaa | lalamika | walalamika`);
const URGENT = words(`
  violence | attack | attacked | killed | shot | riot | riots | chaos | threat | threatens | threatened | deepfake | fake news |
  misinformation | disinformation | hate speech | incitement | inciting | assault | assaulted | kidnap | kidnapped | petrol bomb |
  ghasia | mauaji | uchochezi | vurugu | tishio`);
const SWAHILI = words(`
  na | ya | wa | kwa | katika | ni | la | za | cha | kwamba | hii | hiyo | huo | wakati | baada | kutoka | mbunge | kaunti |
  wananchi | serikali | wakazi | eneo | bunge | gavana | rais | hapo | sasa | lakini | pia | kama | ili | hadi | wiki | mwaka`);
const ENGLISH = words(`
  the | and | of | to | in | for | is | on | with | that | by | from | at | as | has | have | was | were | will | this | are | after`);
const SHENG = words(`
  msee | manze | maze | buda | mathe | fiti | noma | mbogi | ndai | doh | mtaa | kanjo | poa sana | si unajua | form ni | maze`);

const TOPICS: [string, string[]][] = [
  ["Water", words("water | borehole | boreholes | dam | dams | pipeline | maji | kisima")],
  ["Roads", words("road | roads | tarmac | bridge | murram | barabara | daraja")],
  ["Health", words("hospital | health | clinic | dispensary | medical | doctors | nurses | afya | hospitali | zahanati")],
  ["Education", words("school | schools | ecde | bursary | bursaries | education | students | university | tvet | elimu | shule | wanafunzi")],
  ["Agriculture", words("farmers | farming | agriculture | livestock | fertiliser | fertilizer | crops | harvest | kilimo | wakulima | mbolea | mifugo")],
  ["Security", words("police | security | crime | insecurity | bandits | usalama | polisi | uhalifu")],
  ["Jobs & economy", words("jobs | youth | employment | unemployment | business | traders | market | tax | loans | ajira | vijana | biashara | soko | ushuru")],
  ["Governance", words("budget | audit | auditor | county assembly | procurement | tender | public participation | corruption | bajeti | ukaguzi")],
  ["Elections & politics", words("campaign | election | elections | rally | aspirant | aspirants | party | iebc | vote | voters | uchaguzi | kampeni | wapiga kura")],
  ["Disaster & relief", words("flood | floods | drought | famine | relief | landslide | mafuriko | ukame | njaa | msaada wa chakula")],
];

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whole-word patterns, compiled once per word.
const patterns = new Map<string, RegExp>();
const wordPattern = (w: string) => {
  let re = patterns.get(w);
  if (!re) { re = new RegExp(`(^|[^\\p{L}])${escapeRe(w)}(?=$|[^\\p{L}])`, "iu"); patterns.set(w, re); }
  return re;
};
const countMatches = (text: string, list: string[]) => list.reduce((n, w) => n + (wordPattern(w).test(text) ? 1 : 0), 0);

export function detectLanguage(text: string): Language {
  const t = ` ${text.toLowerCase()} `;
  const sw = countMatches(t, SWAHILI);
  const en = countMatches(t, ENGLISH);
  if (sw + en === 0) return "unknown";
  // Headlines are short: one common word is enough when only one language appears.
  if (en === 0) return countMatches(t, SHENG) >= 2 ? "sheng" : "sw";
  if (sw === 0) return "en";
  if (sw >= 2 && countMatches(t, SHENG) >= 2) return "sheng";
  if (sw >= 2 && en >= 2 && Math.min(sw, en) / Math.max(sw, en) >= 0.5) return "mixed";
  return sw > en ? "sw" : "en";
}

export function detectTopic(text: string): string | null {
  let best: [string, number] | null = null;
  for (const [topic, list] of TOPICS) {
    const n = countMatches(text, list);
    if (n > 0 && (!best || n > best[1])) best = [topic, n];
  }
  return best?.[0] ?? null;
}

/**
 * Word-list classifier. Confidence is deliberately modest (at most 70):
 * no cues → neutral 50; one cue → 55; two or more agreeing cues → 65–70;
 * conflicting cues → 35.
 */
export function classifyByRules(text: string): Classification {
  const pos = countMatches(text, POSITIVE);
  const neg = countMatches(text, NEGATIVE);
  let sentiment: Sentiment = "neutral";
  let confidence = 50;
  if (pos && neg) {
    sentiment = pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
    confidence = 35;
  } else if (pos || neg) {
    sentiment = pos ? "positive" : "negative";
    const cues = pos || neg;
    confidence = cues === 1 ? 55 : Math.min(70, 60 + cues * 3);
  }
  const urgent = countMatches(text, URGENT) > 0;
  return {
    sentiment,
    topic: detectTopic(text),
    language: detectLanguage(text),
    urgency: urgent ? "high" : sentiment === "negative" ? "normal" : "low",
    confidence,
    classifiedBy: "rules",
  };
}

/** Urgent items, and opinions held with little confidence, wait for a person. */
export function needsReview(c: Pick<Classification, "sentiment" | "urgency" | "confidence">): boolean {
  return c.urgency === "high" || c.confidence < 40 || (c.sentiment !== "neutral" && c.confidence < 60);
}

const SENTIMENTS = new Set(["positive", "negative", "neutral"]);
const LANGUAGES = new Set(["en", "sw", "sheng", "mixed", "unknown"]);
const URGENCIES = new Set(["high", "normal", "low"]);

/** Prompt asking the AI to label (not summarise or add) the given items. */
export function classificationPrompt(items: { id: number; text: string }[], context: string): string {
  return `You label public news and social-media items for a Kenyan election campaign (${context}).
For EACH item below, judge only its own text. Do not add facts, items or numbers.

Return ONLY a JSON array, one object per item, with exactly these keys:
- "id": the item's id
- "sentiment": "positive", "negative" or "neutral" toward the campaign's candidate (neutral when the item isn't about the candidate's standing)
- "topic": 1-3 words (e.g. "Water", "Roads", "Health", "Jobs & economy", "Elections & politics")
- "language": "en", "sw" (Swahili), "sheng", "mixed" or "unknown"
- "urgency": "high" (violence, threats, misinformation or deepfakes about the candidate, incitement, a fast-spreading attack), "normal" or "low"
- "confidence": a number from 0 to 1 for how sure you are of the sentiment

Items:
${items.map(i => `[${i.id}] ${i.text.replace(/\s+/g, " ").slice(0, 400)}`).join("\n")}`;
}

/** Validates the AI's answer; anything malformed is ignored (the item falls back to rules). */
export function parseAiClassifications(output: string, ids: number[]): Map<number, Classification> {
  const result = new Map<number, Classification>();
  const match = output.match(/\[[\s\S]*\]/);
  if (!match) return result;
  let data: unknown;
  try { data = JSON.parse(match[0]); } catch { return result; }
  if (!Array.isArray(data)) return result;
  const allowed = new Set(ids);
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = Number(r.id);
    const conf = Number(r.confidence);
    if (!allowed.has(id) || result.has(id)) continue;
    if (!SENTIMENTS.has(String(r.sentiment)) || !URGENCIES.has(String(r.urgency)) || !Number.isFinite(conf)) continue;
    const topic = typeof r.topic === "string" ? r.topic.trim().slice(0, 40) : "";
    result.set(id, {
      sentiment: r.sentiment as Sentiment,
      topic: topic || null,
      language: LANGUAGES.has(String(r.language)) ? (r.language as Language) : "unknown",
      urgency: r.urgency as Urgency,
      // Never fully certain: cap at 95.
      confidence: Math.round(Math.min(0.95, Math.max(0, conf <= 1 ? conf : conf / 100)) * 100),
      classifiedBy: "ai",
    });
  }
  return result;
}

/** SQL condition for mentions that count in totals: auto-accepted or confirmed (older rows have no review status). */
export const COUNTED_MENTIONS_SQL = "(review_status IS NULL OR review_status IN ('auto', 'confirmed'))";
