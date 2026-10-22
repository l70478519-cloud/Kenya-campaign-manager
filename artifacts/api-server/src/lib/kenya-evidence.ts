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
    note: "Discovery aid only. Electoral boundaries require an IEBC source and version; no repository data imported automatically.",
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
