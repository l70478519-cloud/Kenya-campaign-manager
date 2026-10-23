/** Reviewed public-source summaries, not a live statistical feed. No voter microdata. */
export const REVIEWED_ON = "2026-10-22";
export type EvidenceSource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  county: string | null;
  period: string;
  kind: "official" | "official-hosted" | "secondary" | "discovery";
  status: "reviewed" | "unavailable" | "discovery-only";
  note?: string;
};
export type EvidenceFact = {
  id: string;
  sourceId: string;
  text: string;
  locator: string;
  county: string | null;
  period: string;
  nature: "framework" | "historical-baseline" | "planning-priority";
  topics: string[];
};
export const KENYA_SOURCES: EvidenceSource[] = [
  {
    id: "economic-survey-2026",
    title: "Economic Survey Report 2026 official launch summary",
    url: "https://planning.go.ke/node/272",
    publisher:
      "State Department for Economic Planning, reporting KNBS findings",
    county: null,
    period: "2026 release reporting 2025 and 2024",
    kind: "official",
    status: "reviewed",
    note: "Reviewed official summary; the full KNBS report download was unavailable. National growth is not a county growth estimate.",
  },
  {
    id: "makueni-cidp-2023-summary",
    title: "Makueni CIDP 2023-2027: official summary",
    url: "https://makueni.go.ke/sandbox/site/files/2023/12/CIDP-One-pager-1.pdf",
    publisher: "Government of Makueni County",
    county: "Makueni",
    period: "2023-2027 planning cycle",
    kind: "official",
    status: "reviewed",
    note: "Three-page official summary, not the full CIDP or an implementation audit.",
  },

  {
    id: "devolution",
    title: "County Information",
    url: "https://www.devolution.go.ke/county-information",
    publisher: "State Department for Devolution",
    county: null,
    period: "Constitutional framework, 2010",
    kind: "official",
    status: "reviewed",
  },
  {
    id: "functions",
    title: "Constitution of Kenya: Fourth Schedule",
    url: "https://igrtc.go.ke/sites/default/files/2024-10/COK%20Fourth%20Schedule.pdf",
    publisher: "Intergovernmental Relations Technical Committee",
    county: null,
    period: "Constitution of Kenya, 2010",
    kind: "official",
    status: "reviewed",
    note: "Check current legislation and lawful transfers before assigning delivery responsibility.",
  },
  {
    id: "iebc-reports",
    title: "IEBC publications and reports",
    url: "https://www.iebc.or.ke/resources/?Publications_/_Reports",
    publisher: "IEBC",
    county: null,
    period: "Multiple reporting years",
    kind: "official",
    status: "unavailable",
    note: "Page timed out during review. No figures were imported from this link.",
  },
  {
    id: "iebc-2022",
    title: "IEBC voter statistics 2022",
    url: "https://www.iebc.or.ke/registration/?Statistics_of_Voter_2022",
    publisher: "IEBC",
    county: null,
    period: "2022 election register",
    kind: "official",
    status: "unavailable",
    note: "Page timed out during review. Historical register totals require a verified table, year and geographic unit.",
  },
  {
    id: "iebc-stats",
    title: "IEBC registration statistics",
    url: "https://www.iebc.or.ke/registration/?stats",
    publisher: "IEBC",
    county: null,
    period: "Verify release date",
    kind: "official",
    status: "unavailable",
    note: "Page timed out during review; not treated as a live register.",
  },
  {
    id: "iebc-evaluation",
    title: "Post Election Evaluation Report: 9 August 2022",
    url: "https://www.iebc.or.ke/uploads/resources/pabjKTV6Xa.pdf",
    publisher: "IEBC",
    county: null,
    period: "2022 general election",
    kind: "official",
    status: "unavailable",
    note: "Discovered in official search results; full document retrieval timed out. No numeric claims imported.",
  },
  {
    id: "knbs-census",
    title: "2019 Kenya Population and Housing Census Results",
    url: "https://www.knbs.or.ke/2019-kenya-population-and-housing-census-results/",
    publisher: "Kenya National Bureau of Statistics",
    county: null,
    period: "2019 census",
    kind: "official",
    status: "unavailable",
    note: "Official index located; original result page could not be retrieved. Census population must not be substituted for registered voters.",
  },
  {
    id: "makueni-cidp-2013",
    title: "Makueni CIDP 2013-2017",
    url: "https://maarifa.cog.go.ke/sites/default/files/2022-08/CIDP%20Makueni%20-%202013-2017.pdf",
    publisher: "Government of Makueni County, hosted by Council of Governors",
    county: "Makueni",
    period: "2013-2017",
    kind: "official-hosted",
    status: "reviewed",
  },
  {
    id: "makueni-cidp-2018",
    title: "Makueni CIDP 2018-2022",
    url: "https://www.devolution.go.ke/sites/default/files/2024-03/Makueni-CIDP-2018-2022.pdf",
    publisher:
      "Government of Makueni County, hosted by State Department for Devolution",
    county: "Makueni",
    period: "2018-2022",
    kind: "official-hosted",
    status: "reviewed",
  },
  {
    id: "makueni-sanitation",
    title: "Makueni Countywide Inclusive Sanitation Strategy",
    url: "https://documents1.worldbank.org/curated/en/403001588139210739/pdf/Makueni-Countywide-Inclusive-Sanitation-Strategy.pdf",
    publisher: "Government of Makueni County, hosted by World Bank",
    county: "Makueni",
    period: "November 2019",
    kind: "official-hosted",
    status: "reviewed",
  },
  {
    id: "debunk-kibwana",
    title: "Will Kivutha Kibwana's Midas Touch Suffice?",
    url: "https://debunk.media/presidential_series/kivutha_kibwana.php",
    publisher: "Debunk Media",
    county: "Makueni",
    period: "Historical profile; publication date not confirmed",
    kind: "secondary",
    status: "discovery-only",
    note: "Authored profile, not an official performance audit, present officeholder record or candidate endorsement.",
  },
  {
    id: "github-geography",
    title: "GitHub kenya-counties topic",
    url: "https://github.com/topics/kenya-counties",
    publisher: "Community repositories on GitHub",
    county: null,
    period: "Changing community index",
    kind: "discovery",
    status: "discovery-only",
    note: "Discovery aid only. The one repository dataset used, polling-centre names from the IEBC register compiled at github.com/stevehoober254/kenya-county-data (MIT), is pinned to a commit and checksum (see kenya-polling-centres.ts). Its centre names are not IEBC codes or voter counts.",
  },
];
export const KENYA_FACTS: EvidenceFact[] = [
  {
    id: "kenya-growth-2025",
    sourceId: "economic-survey-2026",
    text: "The official 2026 Economic Survey launch summary reports Kenya's GDP growth at 4.6% in 2025, compared with 4.7% in 2024. These are national annual growth rates, not county rates or a 2026 forecast.",
    locator: "Official launch article, KNBS findings paragraph",
    county: null,
    period: "2025 and 2024; reported in 2026",
    nature: "historical-baseline",
    topics: ["economy", "economic", "gdp", "growth", "livelihood"],
  },
  {
    id: "makueni-plan-2023",
    sourceId: "makueni-cidp-2023-summary",
    text: "Makueni's 2023-2027 CIDP summary identifies water, agricultural commercialisation, environment, urban planning, social development, roads and energy as planning themes. Its flagship descriptions are intended programmes, not proof of delivery.",
    locator: "Official summary, PDF pp. 1-3",
    county: "Makueni",
    period: "2023-2027 planning cycle",
    nature: "planning-priority",
    topics: [
      "water",
      "agriculture",
      "environment",
      "health",
      "road",
      "manifesto",
      "planning",
    ],
  },

  {
    id: "counties",
    sourceId: "devolution",
    text: "Kenya has 47 counties under the constitutional devolved-government framework.",
    locator: "General information, Article 6 discussion",
    county: null,
    period: "2010 framework",
    nature: "framework",
    topics: ["county", "counties", "geography", "devolution"],
  },
  {
    id: "national-mandates",
    sourceId: "functions",
    text: "The Fourth Schedule assigns national responsibilities including education policy, primary and secondary education, national trunk roads, national referral health facilities and health policy.",
    locator: "Part 1, items 15-16, 18, 23 and 28; PDF pp. 1-2",
    county: null,
    period: "Constitution of Kenya, 2010",
    nature: "framework",
    topics: ["education", "school", "road", "health", "mandate", "manifesto"],
  },
  {
    id: "county-mandates",
    sourceId: "functions",
    text: "County functions include agriculture, county health services, county roads, local markets, pre-primary education, vocational centres, and water and sanitation services. Delivery promises must identify the responsible institution.",
    locator: "Part 2, items 1-2, 5, 7, 9 and 11; PDF pp. 3-4",
    county: null,
    period: "Constitution of Kenya, 2010",
    nature: "framework",
    topics: [
      "water",
      "sanitation",
      "agriculture",
      "health",
      "road",
      "education",
      "manifesto",
      "mandate",
    ],
  },
  {
    id: "participation",
    sourceId: "functions",
    text: "County governments have a constitutional role in coordinating community participation in governance. Public consultation and documented follow-up are relevant to development planning.",
    locator: "Part 2, item 14; PDF p. 4",
    county: null,
    period: "Constitution of Kenya, 2010",
    nature: "framework",
    topics: [
      "participation",
      "governance",
      "planning",
      "accountability",
      "strategy",
    ],
  },
  {
    id: "makueni-plan-2013",
    sourceId: "makueni-cidp-2013",
    text: "The first Makueni county integrated development plan covers 2013-2017. Its proposed programmes and historical baselines do not establish present project completion or present service coverage.",
    locator: "Cover, executive summary and sector programme tables",
    county: "Makueni",
    period: "2013-2017",
    nature: "planning-priority",
    topics: ["history", "planning", "development", "manifesto"],
  },
  {
    id: "makueni-water-baseline",
    sourceId: "makueni-cidp-2018",
    text: "The plan reports county-wide potable-water access rising from 21% in 2013 to 35.6% in 2017, and average water-source distance falling from 8 km to 5 km. These are historical county-level figures, not current ward measurements.",
    locator: "Water Resource Management, printed p. 17; PDF p. 17",
    county: "Makueni",
    period: "2013 and 2017, reported in 2018-2022 plan",
    nature: "historical-baseline",
    topics: ["water", "distance", "history", "baseline"],
  },
  {
    id: "makueni-water-plan",
    sourceId: "makueni-cidp-2018",
    text: "The 2018-2022 plan prioritises water harvesting, storage, treatment, distribution, catchment protection and improved water governance. Listed projects are planning commitments, not evidence that construction occurred.",
    locator: "Sections 2.2.1-2.2.2, printed pp. 18-19; PDF pp. 18-19",
    county: "Makueni",
    period: "2018-2022",
    nature: "planning-priority",
    topics: ["water", "environment", "infrastructure", "manifesto"],
  },
  {
    id: "makueni-sanitation-baseline",
    sourceId: "makueni-sanitation",
    text: "The November 2019 sanitation strategy reports 46% using unimproved sanitation and 2.4% practising open defecation in Makueni County. These are dated county-wide baselines; their underlying survey dates must be checked before comparisons.",
    locator: "Foreword, PDF p. 2",
    county: "Makueni",
    period: "Reported November 2019",
    nature: "historical-baseline",
    topics: ["sanitation", "health", "water", "baseline"],
  },
  {
    id: "makueni-sanitation-framework",
    sourceId: "makueni-sanitation",
    text: "The strategy links sanitation planning with water supply, drainage and solid-waste management across rural and urban areas. An integrated service plan requires current local evidence and an identified implementing authority.",
    locator: "Foreword and strategy overview, PDF pp. 2-3",
    county: "Makueni",
    period: "November 2019 strategy",
    nature: "planning-priority",
    topics: ["sanitation", "planning", "waste", "drainage", "manifesto"],
  },
];
export const KENYA_COUNTY_NAMES: readonly string[] = [
  "Mombasa",
  "Kwale",
  "Kilifi",
  "Tana River",
  "Lamu",
  "Taita Taveta",
  "Garissa",
  "Wajir",
  "Mandera",
  "Marsabit",
  "Isiolo",
  "Meru",
  "Tharaka Nithi",
  "Embu",
  "Kitui",
  "Machakos",
  "Makueni",
  "Nyandarua",
  "Nyeri",
  "Kirinyaga",
  "Murang'a",
  "Kiambu",
  "Turkana",
  "West Pokot",
  "Samburu",
  "Trans Nzoia",
  "Uasin Gishu",
  "Elgeyo Marakwet",
  "Nandi",
  "Baringo",
  "Laikipia",
  "Nakuru",
  "Narok",
  "Kajiado",
  "Kericho",
  "Bomet",
  "Kakamega",
  "Vihiga",
  "Bungoma",
  "Busia",
  "Siaya",
  "Kisumu",
  "Homa Bay",
  "Migori",
  "Kisii",
  "Nyamira",
  "Nairobi",
];
export type KenyaScope = {
  county?: string | null;
  constituency?: string | null;
  name?: string;
  seat?: string | null;
};
const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bcounty\b/g, "")
    .trim();
export function scopedSources(scope: KenyaScope) {
  const county = normal(scope.county ?? "");
  return KENYA_SOURCES.filter(
    (s) => s.county === null || (!!county && normal(s.county) === county),
  );
}
export function selectEvidence(scope: KenyaScope, query = "", limit = 8) {
  const allowed = new Set(
    scopedSources(scope)
      .filter((s) => s.status === "reviewed")
      .map((s) => s.id),
  );
  const text = query
    .toLowerCase()
    .replace(/\bmaji\b/g, "water")
    .replace(/\bafya\b/g, "health")
    .replace(/\bbarabara\b/g, "road")
    .replace(/\bkilimo\b/g, "agriculture");
  return KENYA_FACTS.filter((f) => allowed.has(f.sourceId))
    .map((f) => ({
      fact: f,
      score: f.topics.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score || Number(!!b.fact.county) - Number(!!a.fact.county),
    )
    .slice(0, Math.max(1, Math.min(20, limit)))
    .map((x) => x.fact);
}
export function evidenceBundle(scope: KenyaScope, query = "") {
  const county =
    KENYA_COUNTY_NAMES.find((c) => normal(c) === normal(scope.county ?? "")) ??
    null;
  const sources = scopedSources(scope),
    facts = selectEvidence(scope, query);
  return {
    country: "Kenya",
    county,
    reviewedOn: REVIEWED_ON,
    mode: "reviewed-source-summaries",
    sources,
    facts,
    nationalFramework: {
      note: "Orientation summaries of Kenya Vision 2030, MTP IV (2023-2027) and county-planning law; not page-reviewed. Verify in the official documents.",
      items: selectFramework(query).map((i) => ({ ...i, sourceDetail: NATIONAL_FRAMEWORK_SOURCES[i.source] })),
      countyPlan: countyPlanStatus(county),
    },
    limitations: [
      "Review date is not a fresh measurement or a live crawl.",
      "Only national sources and reviewed sources for the configured county are selected. County figures are not ward figures.",
      "Historical registers and census counts cannot establish current turnout, candidate support or election predictions.",
      "Planning targets and candidate proposals are not verified achievements.",
      ...(scope.county && !county
        ? [
            "Configured county is not in the Kenya county directory; only national evidence is supplied.",
          ]
        : []),
      ...(county && !facts.some((f) => f.county)
        ? [
            "No reviewed county-specific development evidence is loaded for this county; add its dated official documents before making local claims.",
          ]
        : []),
    ],
  };
}
/**
 * National development framework: Kenya Vision 2030 and its Medium Term Plans,
 * and the legal link to county plans (CIDPs).
 *
 * These are orientation summaries of long-standing, widely published
 * structure (aims, pillars, plan periods, BETA pillars). They were compiled
 * without page-by-page review because the official sites could not be reached
 * when this was written, so they are kept apart from KENYA_FACTS and always
 * labelled "verify in the official document". They contain no progress figures
 * and no project status. Add page-reviewed facts to KENYA_FACTS instead.
 */
export type FrameworkItem = { id: string; source: "vision2030" | "mtp4" | "county-planning-law"; text: string; topics: string[]; core?: boolean };
export const NATIONAL_FRAMEWORK_SOURCES = {
  vision2030: { title: "Kenya Vision 2030", publisher: "Government of Kenya (Vision 2030 Delivery Secretariat)", url: "https://vision2030.go.ke/", period: "2008-2030 long-term blueprint" },
  mtp4: { title: "Fourth Medium Term Plan 2023-2027 (Bottom-Up Economic Transformation Agenda)", publisher: "State Department for Economic Planning", url: "https://planning.go.ke/", period: "2023-2027" },
  "county-planning-law": { title: "County Governments Act, 2012 and Public Finance Management Act, 2012", publisher: "Kenya Law", url: "https://kenyalaw.org/", period: "In force; check for amendments" },
} as const;
export const NATIONAL_FRAMEWORK: FrameworkItem[] = [
  { id: "v2030-aim", source: "vision2030", core: true, topics: ["vision", "2030", "development", "blueprint", "agenda", "manifesto", "plan"],
    text: "Kenya Vision 2030, launched in 2008, is the national long-term development blueprint. It aims to make Kenya a newly industrialising, middle-income country providing a high quality of life to all its citizens in a clean and secure environment by 2030." },
  { id: "v2030-pillars", source: "vision2030", core: true, topics: ["pillar", "economic", "social", "political", "vision", "manifesto"],
    text: "Vision 2030 rests on three pillars: economic (prosperity through sustained growth), social (a just and cohesive society with equitable social development in a clean and secure environment) and political (an issue-based, people-centred, result-oriented and accountable democratic political system)." },
  { id: "v2030-economic", source: "vision2030", topics: ["economy", "economic", "growth", "jobs", "employment", "agriculture", "tourism", "trade", "manufacturing", "industry", "finance", "outsourcing", "livelihood"],
    text: "The economic pillar targeted average GDP growth of 10% a year (a target, not an achievement). Its original priority sectors were tourism, agriculture, wholesale and retail trade, manufacturing, business process outsourcing / IT-enabled services and financial services." },
  { id: "v2030-social", source: "vision2030", topics: ["education", "school", "health", "water", "sanitation", "environment", "housing", "urban", "youth", "women", "gender", "disability", "sports", "social"],
    text: "The social pillar covers education and training, health, water and sanitation, environment, housing and urbanisation, gender, youth and vulnerable groups, and sports." },
  { id: "v2030-political", source: "vision2030", topics: ["governance", "accountability", "corruption", "transparency", "rule of law", "security", "democracy", "participation", "political"],
    text: "The political pillar covers governance and the rule of law, electoral and political processes, democracy and public participation, transparency and accountability, and security, peace-building and conflict management." },
  { id: "v2030-enablers", source: "vision2030", topics: ["infrastructure", "road", "energy", "electricity", "ict", "digital", "technology", "innovation", "land", "skills", "security", "reform"],
    text: "Vision 2030 names enablers (foundations) for all three pillars, including infrastructure, energy, ICT, science, technology and innovation, land reform, human resource development, security and public-sector reform." },
  { id: "v2030-flagships", source: "vision2030", topics: ["flagship", "project", "lapsset", "konza", "railway", "sgr", "infrastructure", "port"],
    text: "Vision 2030 is delivered partly through flagship projects, for example the LAPSSET corridor, Konza Technopolis and the Standard Gauge Railway. Most flagships are national-government projects; a project being listed is not evidence of its current status in any county." },
  { id: "mtp-cycle", source: "vision2030", core: true, topics: ["mtp", "medium term", "plan", "2023", "2027", "development"],
    text: "Vision 2030 is implemented through five-year Medium Term Plans: MTP I (2008-2012), MTP II (2013-2017), MTP III (2018-2022) and MTP IV (2023-2027)." },
  { id: "mtp4-beta", source: "mtp4", core: true, topics: ["beta", "bottom-up", "mtp", "agriculture", "msme", "business", "hustler", "housing", "settlement", "health", "healthcare", "digital", "creative", "economy", "jobs", "manifesto"],
    text: "MTP IV (2023-2027) is anchored on the Bottom-Up Economic Transformation Agenda (BETA), with five core pillars: agricultural transformation; the micro, small and medium enterprise (MSME) economy; housing and settlement; healthcare; and the digital superhighway and creative economy." },
  { id: "cidp-law", source: "county-planning-law", core: true, topics: ["cidp", "county", "plan", "budget", "development", "ward", "manifesto", "governor", "mca"],
    text: "The County Governments Act, 2012 requires every county to prepare a five-year County Integrated Development Plan (CIDP), and the Public Finance Management Act, 2012 links county budgets to it through annual development plans. CIDPs are expected to align with national plans; the current cycle, the third, covers 2023-2027." },
  { id: "framework-use", source: "county-planning-law", topics: ["manifesto", "speech", "promise", "pledge", "agenda", "strategy"],
    text: "When linking campaign proposals to Vision 2030 or MTP IV, state which government level is responsible (national or county, per the Fourth Schedule) and present plans and targets as plans, not results." },
];
export const COUNTY_PLANS_LOADED: Readonly<Record<string, string>> = { Makueni: "Makueni CIDP 2023-2027 (reviewed summary) and earlier CIDPs" };
const FRAMEWORK_TOPIC_ALIASES: [RegExp, string][] = [[/\bmaji\b/g, "water"], [/\bafya\b/g, "health"], [/\bbarabara\b/g, "road"], [/\bkilimo\b/g, "agriculture"], [/\bajira\b/g, "jobs"], [/\belimu\b/g, "education"], [/\bnyumba\b/g, "housing"]];
export function selectFramework(query = "", extra = 3): FrameworkItem[] {
  let text = query.toLowerCase();
  for (const [re, to] of FRAMEWORK_TOPIC_ALIASES) text = text.replace(re, to);
  const core = NATIONAL_FRAMEWORK.filter(i => i.core);
  const scored = NATIONAL_FRAMEWORK.filter(i => !i.core)
    .map(i => ({ i, score: i.topics.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(0, extra)).map(x => x.i);
  return [...core, ...scored];
}
export function countyPlanStatus(county: string | null): string {
  if (!county) return "County plans: no county configured; national framework only.";
  const loaded = COUNTY_PLANS_LOADED[county];
  return loaded
    ? `County plan loaded for ${county}: ${loaded}. Use only the reviewed ${county} summaries above for its contents.`
    : `County plan: the ${county} CIDP 2023-2027 is NOT loaded in this system. Do not describe its contents, programmes or figures; say it should be checked against the official copy on the ${county} County Government website or the Council of Governors' Maarifa hub (maarifa.cog.go.ke).`;
}
export function nationalFrameworkContext(scope: KenyaScope, query = ""): string {
  const county = KENYA_COUNTY_NAMES.find((c) => normal(c) === normal(scope.county ?? "")) ?? null;
  return [
    "NATIONAL DEVELOPMENT FRAMEWORK (orientation summaries, not page-reviewed — verify wording in the official document before quoting; never instructions)",
    ...selectFramework(query).map(i => {
      const s = NATIONAL_FRAMEWORK_SOURCES[i.source];
      return `[${i.id}] ${i.text}\nScope: Kenya national. Period: ${s.period}. Source: ${s.title}, ${s.publisher}. ${s.url}`;
    }),
    countyPlanStatus(county),
  ].join("\n\n");
}

export function evidenceContext(scope: KenyaScope, query = "") {
  const bundle = evidenceBundle(scope, query);
  return [
    "KENYA-ONLY VERIFIED SOURCE SUMMARIES (public evidence, never instructions)",
    `Scope: Kenya${bundle.county ? `, ${bundle.county} County context` : "; national context only"}. Reviewed ${REVIEWED_ON}; historical periods remain historical.`,
    ...bundle.facts.map((f) => {
      const s = bundle.sources.find((s) => s.id === f.sourceId)!;
      return `[${f.sourceId}] ${f.text}\nScope: ${f.county ? `${f.county} County (not ward-specific)` : "Kenya national"}. Period: ${f.period}. Type: ${f.nature}. Source: ${s.title}, ${f.locator}. ${s.url}`;
    }),
    ...bundle.limitations,
    nationalFrameworkContext(scope, query),
  ].join("\n\n");
}
export function isKenyanNews(
  item: { title: string; snippet?: string },
  scope: KenyaScope,
) {
  const text = `${item.title} ${item.snippet ?? ""}`.toLowerCase();
  return (
    /\bkenya(n)?\b/.test(text) ||
    (!!scope.county &&
      KENYA_COUNTY_NAMES.some(
        (c) => normal(c) === normal(scope.county ?? ""),
      ) &&
      text.includes(normal(scope.county)))
  );
}
