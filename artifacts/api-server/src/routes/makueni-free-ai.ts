import { evidenceBundle, evidenceContext, isKenyanNews } from "../lib/kenya-evidence";
import { campaignWards, currentCampaignProfile } from "@workspace/db";
/**
 * No-token fallback for Kaiti Constituency public-information workflows.
 *
 * This deliberately uses deterministic templates and supplied database context.
 * It does not pretend to be a general-purpose LLM or fabricate current county
 * statistics. Live/current claims must be backed by official source records.
 */
export function buildFreeMakueniAnswer(input: {
  message: string;
  module?: string;
  operationalDigest?: string;
  context?: Record<string, unknown>;
  liveSources?: Array<{ title: string; url: string; checkedAt: string; excerpt: string; status: string }>;
}): string {
  const scope = currentCampaignProfile() ?? {};
  const bundle = evidenceBundle(scope, input.message);
  const web = Array.isArray(input.context?.publicWebResults) ? (input.context.publicWebResults as FreeWebResult[]).filter(item => isKenyanNews(item, scope)).slice(0, 5) : [];
  return [
    "Kenya evidence brief — reviewed summaries, not a live AI investigation.",
    ...(input.operationalDigest && /record|member|volunteer|task|donation|activity|dashboard|count|milestone|event/i.test(input.message) ? ["Server-generated operational record summary (not representative population data):", input.operationalDigest] : []),
    evidenceContext(scope, input.message),
    ...(web.length ? ["Unverified Kenya web-discovery leads (verify originals before using claims):", ...web.map(w => `${w.title} — ${w.url}`)] : []),
    "Next steps: check the source page and period, obtain current local measurements, identify the responsible institution, and label proposals separately from established outcomes.",
    ...bundle.limitations,
  ].join("\n\n");
}

type SpeechInput = {
  area?: string;
  occasion?: string;
  topic?: string;
  currentGaps?: string;
  language?: string;
  minutes?: number;
  audience?: string;
  tone?: string;
  keyPoints?: string;
};

/** Policy paragraphs for the topics residents raise most. Proposals, never claims of delivery. */
function policyParagraphs(topic: string, place: string): string[] {
  const t = topic.toLowerCase();
  const out: string[] = [];
  if (/water|borehole|dam|irrigat|pipe|dry tap/.test(t)) out.push(
    "First, water must last beyond the rainy season. If elected, I will put the repair and maintenance of existing water sources first, protect dams and sand dams from siltation, strengthen storage and bring distribution closer to homes, schools and health facilities.",
    "Water for homes must also support farms and livelihoods. I will pursue practical links between storage, farm ponds and small-scale irrigation, and publish progress so residents can see what has been repaired, what remains and who is responsible.",
  );
  if (/market|price|farmer|agricultur|livelihood|livestock|drought|crop|mango/.test(t)) out.push(
    "Farmers deserve a fairer return for their work. That means better aggregation, grading and weighing, storage so farmers are not forced to sell at harvest, and reliable market-price information.",
    "Support must arrive before the season is lost: timely farm inputs, reachable extension officers, livestock and veterinary services, and water for production.",
  );
  if (/health|hospital|clinic|dispensary|medicine|ambulance|maternity/.test(t)) out.push(
    "Healthcare must work when a resident arrives. I will push for public reporting on staffing, essential medicines, diagnostics, maternity capacity, and water and power at every facility.",
    "An ambulance is only useful when the receiving facility can provide care. I will press for reliable dispatch, clear referral procedures and regular reporting on gaps that remain.",
  );
  if (/road|bridge|murram|transport|culvert|access/.test(t)) out.push(
    "Roads connect our children to school, our sick to care and our produce to market. I will prioritise the sections that cut off schools, health facilities and markets, insist on drainage that lasts, and publish which roads are scheduled, by whom and by when.",
  );
  if (/school|education|bursary|ecde|classroom|teacher/.test(t)) out.push(
    "Every child in " + place + " deserves a safe classroom and a fair chance. I will push for transparent bursary criteria published in advance, safe classrooms with water and sanitation, and a clear record of where education funds go.",
  );
  if (/youth|employment|jobs|business|trade|enterprise|women/.test(t)) out.push(
    "Young people and women need practical routes into work and enterprise. I will connect skills training with real local demand in construction, technology, services and value addition, and make opportunities and their criteria public.",
  );
  if (/security|crime|insecurity|theft/.test(t)) out.push(
    "Safety is the foundation of everything else. I will work with community policing structures, chiefs and residents so that reports are followed up and results are shared with the community.",
  );
  if (!out.length) out.push(
    "My priorities are development where people live, fair markets and opportunity, water that lasts, agriculture that pays, and healthcare that works.",
    "I will move decisions closer to communities through village and ward priorities, stronger follow-up and clear responsibility for every project, so residents can ask what was promised, what was funded and what was delivered.",
  );
  return out;
}

const SW = {
  protocol: "Itifaki imezingatiwa. Wazee wetu, viongozi wa jamii, akina mama, vijana, watu wanaoishi na ulemavu na wageni wetu wote, hamjambo!",
  thanks: (p: string) => `Nashukuru kuwa nanyi hapa ${p}. Nimekuja kusikiliza, kueleza mwelekeo ninaoamini tunapaswa kuchukua, na kusikia kile kinachohitaji kubadilika.`,
  close: (p: string) => `Asanteni sana. Mungu awabariki watu wa ${p}.`,
  promise: "Ahadi yangu ni rahisi: maendeleo lazima yamfikie mwananchi pale anapoishi, na huduma ya umma ipimwe kwa matokeo ambayo wananchi wanaweza kuona na kuthibitisha.",
};

/**
 * No-token speech writer. Builds a complete, structured speech from the
 * active campaign's profile and the user's inputs (occasion, audience, ward,
 * key points, tone, language, length). Commitments are always prospective.
 */
export function buildFreeMakueniSpeech(input: SpeechInput): { title: string; speech: string; notes: string[] } {
  const profile = currentCampaignProfile();
  const candidate = (profile?.candidateName ?? (profile && !profile.isPrimary ? "the candidate" : "the candidate"));
  const place = profile?.constituency ?? "your area";
  const seat = profile?.seat ?? "MP";
  const year = profile?.electionDate?.slice(0, 4) ?? "2027";
  const constituencyLabel = /president/i.test(seat) ? "Kenya" : /governor|senator|woman/i.test(seat) ? `${profile?.county ?? place} County` : /mca/i.test(seat) ? `${campaignWards()[0] ?? place} Ward` : `${place} Constituency`;
  const rawArea = (input.area ?? "").trim();
  const isWard = !!rawArea && !/constituency|county/i.test(rawArea);
  const areaLabel = isWard ? `${rawArea} Ward` : constituencyLabel;
  const occasion = (input.occasion ?? "public participation meeting").trim() || "public participation meeting";
  const topic = (input.topic ?? "service delivery and local development").trim() || "service delivery and local development";
  const audience = (input.audience ?? "").trim();
  const tone = (input.tone ?? "Inspirational").toLowerCase();
  const language = (input.language ?? "English").trim() || "English";
  const swahili = /swahili|kiswahili/i.test(language);
  const mixed = swahili && /mix|english|sheng/i.test(language);
  const minutes = Math.max(1, Math.min(15, Number(input.minutes) || 3));
  const currentGaps = (input.currentGaps ?? "").trim().slice(0, 1600);
  const points = (input.keyPoints ?? "").split(/\n|;|•|(?:^|\s)-\s/).map(p => p.trim().replace(/^[\d.)\s]+/, "")).filter(p => p.length > 3).slice(0, 6);

  const toneLine = /urgent|fiery|bold/.test(tone)
    ? "We cannot keep waiting. The time for half-finished projects and unanswered questions is over."
    : /humble|calm|conversational|listening/.test(tone)
    ? "I have not come with all the answers. I have come to listen first and to work with you on what matters most."
    : /statesman|formal/.test(tone)
    ? "Leadership is a trust held on behalf of the people, and it must be exercised with care, honesty and respect for the law."
    : "Together, we can build a constituency where every family sees the difference that honest, focused leadership makes.";

  const policy = policyParagraphs(`${topic} ${points.join(" ")}`, place);
  const short = minutes <= 1, long = minutes >= 5;

  const commitments = points.length ? [
    swahili && !mixed ? "Haya ndiyo mambo ninayoahidi kufanyia kazi nikichaguliwa:" : "If elected, these are the commitments I will work on:",
    ...points.map((p, i) => `${i + 1}. ${p.charAt(0).toUpperCase()}${p.slice(1)}${/[.!?]$/.test(p) ? "" : "."}`),
    "Each of these will have a named office responsible, a budget line, a timeline and a public progress report.",
  ] : [];

  const body: string[] = [
    swahili ? SW.protocol : "Protocol observed. Elders, community leaders, residents, women, young people, persons with disabilities and all our guests, good morning.",
    "",
    swahili ? SW.thanks(areaLabel) : `I am grateful to join you here in ${areaLabel}${audience ? `, and especially to ${audience}` : ""}. I have come to listen, to explain the direction I believe ${constituencyLabel} should take, and to hear what must change in our communities.`,
    ...(mixed ? ["", `Let me also say it in English: thank you for welcoming me to ${areaLabel} for this ${occasion}.`] : []),
    "",
    swahili && !mixed ? SW.promise : "My guiding promise is simple: development must reach people where they live, and public service must be judged by results residents can see and verify.",
    "",
    toneLine,
    "",
    ...(short ? policy.slice(0, 1) : long ? policy : policy.slice(0, 2)),
    ...(commitments.length ? ["", ...commitments] : []),
    "",
    ...(short ? [] : [
      "The foundation for this plan is open and accountable government: real public participation, published priorities, transparent budgets and project information, and regular progress updates.",
      "",
      `For ${areaLabel}, I want this conversation to produce practical next steps. Let us name the three most urgent issues, the exact places affected, the office responsible, the evidence we need and a date for reporting back.`,
      "",
    ]),
    ...(currentGaps ? [
      "On the current state of services, these concerns have been raised for public scrutiny:",
      currentGaps,
      "",
    ] : []),
    ...(long ? [
      "I will not pretend that every problem can be solved overnight. The work must be prioritised, costed through the proper budget process, implemented lawfully and monitored with the people it serves.",
      "",
    ] : []),
    `My commitment is to keep listening, to report progress honestly and to make accountability part of delivery. Hold this plan to a high standard, and hold me to it.`,
    "",
    swahili ? SW.close(constituencyLabel) : `Thank you. May God bless ${constituencyLabel}.`,
  ];

  const speech = [
    `${constituencyLabel.toUpperCase()} — ${occasion.toUpperCase()}`,
    candidate.toUpperCase(),
    `${place} ${seat} Candidate — ${year}`,
    "",
    `Occasion: ${occasion}`,
    `Area: ${isWard ? `${areaLabel}, ${constituencyLabel}` : constituencyLabel}`,
    ...(audience ? [`Audience: ${audience}`] : []),
    `Language: ${language} · Tone: ${input.tone ?? "Inspirational"} · About ${minutes} minute${minutes === 1 ? "" : "s"}`,
    "",
    ...body,
  ].join("\n");

  return {
    title: `${candidate} — ${occasion} — ${isWard ? rawArea : place}`,
    speech,
    notes: [
      evidenceContext(profile ?? {}, topic),
      `Written for about ${minutes} minute(s). Read it aloud and adjust to the occasion.`,
      "Commitments are written as plans if elected, not as funded or delivered projects.",
      "Verify local project names, figures, costs and current status before delivery.",
      currentGaps ? "Concerns about current services were supplied by you; confirm the source, date and location before stating them as fact." : "No specific service failures were supplied; the speech calls for transparency rather than making claims.",
      ...(swahili ? ["Kiswahili passages are template text; have a fluent speaker review them before delivery."] : []),
    ],
  };
}

// ── Sentiment (no-token) ─────────────────────────────────────────────────────
const POSITIVE = ["launch", "launched", "completed", "commission", "commissioned", "improve", "improved", "success", "boost", "support", "welcome", "praise", "win", "wins", "growth", "progress", "benefit", "donat", "upgrade", "opens", "approved", "award", "celebrat", "relief", "hongera", "maendeleo", "pongezi", "fanikiwa"];
const NEGATIVE = ["stalled", "delay", "delayed", "corruption", "scandal", "protest", "crisis", "shortage", "drought", "fail", "failed", "failure", "collapse", "accident", "death", "killed", "attack", "insecurity", "theft", "fraud", "audit query", "misuse", "abandoned", "dry", "strike", "conflict", "arrest", "court", "petition", "complain", "ukame", "ufisadi", "maandamano", "njaa"];
/** Keyword-based sentiment for public headlines. Marked as automatic so reviewers can override. */
export function classifySentiment(text: string): "positive" | "negative" | "neutral" {
  const t = ` ${text.toLowerCase()} `;
  const count = (words: string[]) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  const pos = count(POSITIVE), neg = count(NEGATIVE);
  if (neg > pos) return "negative";
  if (pos > neg) return "positive";
  return "neutral";
}

type PublicSourceSnapshot = {
  title: string;
  url: string;
  checkedAt: string;
  excerpt: string;
  status: string;
};

export type FreeWebResult = { title: string; url: string; source: string; publishedAt: string | null; snippet: string; query: string };

const searchCache = new Map<string, { expiresAt: number; results: FreeWebResult[] }>();

/**
 * Free public-web discovery using Google News RSS. This is search-result discovery,
 * not an official API and not guaranteed comprehensive. Only requests the fixed
 * news.google.com host; never accepts arbitrary URLs.
 */
export async function searchFreeMakueniWeb(query: string, opts: { strict?: boolean } = {}): Promise<FreeWebResult[]> {
  const cleaned = query.trim().slice(0, 180);
  if (!cleaned) return [];
  const cacheKey = `${currentCampaignProfile()?.county ?? ""}|${cleaned.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.results;
  const county = currentCampaignProfile()?.county ?? "";
  // Quoted names and site: filters are already precise; broad queries get the county for local relevance.
  const suffix = county && !cleaned.toLowerCase().includes(county.toLowerCase()) ? ` ${county} Kenya` : " Kenya";
  const rssUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent(cleaned + suffix) + "&hl=en-KE&gl=KE&ceid=KE:en";
  try {
    const response = await fetch(rssUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; KenyaEvidenceReader/1.0)" }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      if (opts.strict) throw new Error(`News search returned HTTP ${response.status}`);
      return [];
    }
    const xml = (await response.text()).slice(0, 500_000);
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
    const decode = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const results: FreeWebResult[] = blocks.slice(0, 8).map((block) => {
      const get = (tag: string) => decode(block.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">", "i"))?.[1] ?? "");
      const title = get("title");
      const link = get("link");
      const pubDate = get("pubDate");
      const source = decode(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "Google News");
      const description = get("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400);
      return { title, url: link, source, publishedAt: pubDate || null, snippet: description, query: cleaned };
    }).filter((item) => item.title && /^https?:\/\//i.test(item.url) && isKenyanNews(item, currentCampaignProfile() ?? {}));
    searchCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, results });
    return results;
  } catch (err) {
    // Callers that report source health need to know the search itself failed.
    if (opts.strict) throw err;
    return [];
  }
}

/** Reviewed fixed source registry. This does not imply a fresh fetch or current project status. */
export async function fetchMakueniOfficialSources(): Promise<PublicSourceSnapshot[]> {
  const scope = currentCampaignProfile() ?? {};
  const bundle = evidenceBundle(scope);
  return bundle.sources.map(source => ({ title: source.title, url: source.url, checkedAt: bundle.reviewedOn, status: source.status === "reviewed" ? "reviewed-snapshot" : source.status, excerpt: `${source.period}. ${source.note ?? "Reviewed source metadata; see the original document for the complete text."}` }));
}
