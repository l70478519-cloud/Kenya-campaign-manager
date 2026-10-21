/**
 * Historical source digest: Makueni County First CIDP 2013-2017.
 * This is a historical planning document, not a current performance report.
 * All numeric figures below retain their source-period labels.
 */
export const CIDP_2013_2017 = {
  title: "Makueni County First County Integrated Development Plan 2013-2017",
  published: "August 2013",
  vision: "A county where resources are sustainably harnessed and equitably shared for the benefit of every household.",
  mission: "Engaging all stakeholders in harnessing and governance of resources in a cost effective way for the transformation of the lives of the county's population.",
  countyStructure: {
    constituencies: ["Mbooni", "Makueni", "Kaiti", "Kibwezi East", "Kibwezi West", "Kilome"],
    wardCount: 30,
    sourcePages: "12, 19 (printed page numbers)"
  },
  historicalContext: [
    {
      issue: "Water access and scarcity",
      evidence: "The plan reported an average distance to a water point of 8 km and listed 12,671 households with piped water and 27,752 households with access to potable water.",
      period: "2013-era baseline described in the 2013-2017 CIDP",
      reference: "Chapter 2, printed page 40"
    },
    {
      issue: "Road conditions",
      evidence: "The plan described 555.2 km of gravel roads and 2,194.6 km of earth roads, together representing 86% of the county road network in the plan's baseline.",
      period: "2013-era baseline described in the 2013-2017 CIDP",
      reference: "Chapter 2, printed pages 40-41"
    },
    {
      issue: "Poverty",
      evidence: "The plan cited a 64.3% poverty figure from the Kenya Integrated Household Budget Survey (KIHBS) 2006.",
      period: "2006 survey figure quoted in the 2013-2017 CIDP",
      reference: "Chapter 2, printed page 39"
    },
    {
      issue: "Population",
      evidence: "The plan used a 2012 population projection of 922,183 and projected 989,048 for 2017. These are historical projections, not current population figures.",
      period: "2012 estimate and 2017 projection",
      reference: "Executive Summary, printed page 12; Chapter 1, printed pages 20-24"
    },
    {
      issue: "Climate, agriculture and natural resources",
      evidence: "The plan described Makueni as largely arid and semi-arid, with recurrent drought risk, variable rainfall, water scarcity and the importance of drought-tolerant crops, livestock, irrigation, soil conservation and agroforestry.",
      period: "County context described in the 2013-2017 CIDP",
      reference: "Chapter 1, printed pages 16-18; Chapter 2, printed pages 39-47"
    }
  ],
  sectorPriorities: [
    {
      sector: "Agriculture and rural development",
      priorities: "Improve agricultural extension; promote drought-resistant crops; strengthen value chains and post-harvest management; improve livestock and fisheries; expand irrigation and food security; strengthen farmer groups and cooperatives.",
      reference: "Chapter 2, printed pages 47-52; Chapter 7, printed pages 85-100"
    },
    {
      sector: "Energy, infrastructure and ICT",
      priorities: "Improve all-weather road access and maintenance; support energy access; improve rural connectivity and ICT capacity; align infrastructure with local economic activity and access to services.",
      reference: "Chapter 7, printed pages 101-125"
    },
    {
      sector: "General economic, commercial and labour affairs",
      priorities: "Support trade, markets, small businesses, enterprise development, employment and local economic opportunities.",
      reference: "Chapter 7, printed pages 126-132"
    },
    {
      sector: "Health",
      priorities: "Improve access to health facilities and services, preventive and maternal/child health, staffing and service delivery, and health outcomes.",
      reference: "Chapter 7, printed pages 133-138"
    },
    {
      sector: "Education",
      priorities: "Strengthen early childhood and school infrastructure, learning resources, access, retention and vocational/tertiary training opportunities.",
      reference: "Chapter 1, printed pages 36-37; Chapter 7, printed pages 139-144"
    },
    {
      sector: "Public administration and governance",
      priorities: "Clarify institutional responsibilities, strengthen public administration and financial management, coordinate stakeholders, and support transparent implementation.",
      reference: "Chapters 5-6, printed pages 72-83; Chapter 7, printed pages 144-152"
    },
    {
      sector: "Environment, water, housing and irrigation",
      priorities: "Improve water access and storage, protect natural resources, support irrigation, improve sanitation and housing, and strengthen environmental conservation.",
      reference: "Chapter 1, printed pages 16-18 and 35; Chapter 7, printed pages 153-162"
    }
  ],
  monitoringAndEvaluation: {
    approach: "Chapter 8 proposes a county monitoring and evaluation system aligned with the national monitoring system. It describes projects/programmes with estimated costs, timelines, monitoring indicators, monitoring tools, implementing agencies, funding sources and implementation status.",
    reference: "Chapter 8, printed pages 163 onward; Appendix II, printed pages 207 onward",
    caution: "A project marked planned or ongoing in a 2013-2017 document is not evidence of its present status or final completion."
  },
  useRules: [
    "Use this document only as historical context for the 2013-2017 planning period.",
    "Never present the 2006 poverty figure, 2012 population projection, water baseline, or road baseline as current statistics.",
    "Do not infer that a listed project was completed, failed, or remains incomplete without current dated evidence.",
    "For present-day assessment, compare historical plans with subsequent CIDPs, annual development plans, approved budgets, expenditure reports, audit findings and verified project records.",
    "Keep Makueni County scope; the six constituencies and 30 wards are stated in the source at printed pages 12 and 19."
  ]
} as const;

export function getCidp2013Context(query: string, maxSectors = 4): string {
  const q = query.toLowerCase();
  const terms: Record<string, string[]> = {
    "Agriculture and rural development": ["agriculture", "farmer", "crop", "livestock", "irrigation", "food", "drought", "cooperative", "market", "extension"],
    "Energy, infrastructure and ICT": ["road", "bridge", "electricity", "energy", "ict", "internet", "infrastructure", "transport"],
    "General economic, commercial and labour affairs": ["business", "job", "employment", "trade", "market", "enterprise", "income", "tourism"],
    "Health": ["health", "hospital", "clinic", "medicine", "nurse", "doctor", "maternal"],
    "Education": ["education", "school", "ecde", "training", "classroom", "bursary", "college"],
    "Public administration and governance": ["governance", "budget", "audit", "accountability", "revenue", "participation", "transparency", "project", "monitoring"],
    "Environment, water, housing and irrigation": ["water", "borehole", "dam", "sand dam", "environment", "housing", "sanitation", "forest", "irrigation", "drought"]
  };
  const ranked = CIDP_2013_2017.sectorPriorities
    .map((sector) => ({ sector, score: (terms[sector.sector] ?? []).filter((term) => q.includes(term)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSectors);
  const sectors = ranked.length ? ranked.map((x) => x.sector) : CIDP_2013_2017.sectorPriorities;
  return [
    "SOURCE: Makueni County First CIDP 2013-2017, published August 2013. Historical plan only; not a current status report.",
    "Vision: " + CIDP_2013_2017.vision,
    "Mission: " + CIDP_2013_2017.mission,
    ...CIDP_2013_2017.historicalContext.map((x) => x.issue + ": " + x.evidence + " Source: " + x.reference + "."),
    ...sectors.map((x) => x.sector + ": " + x.priorities + " Source: " + x.reference + "."),
    "Monitoring: " + CIDP_2013_2017.monitoringAndEvaluation.approach + " Source: " + CIDP_2013_2017.monitoringAndEvaluation.reference + ".",
    "Evidence rule: " + CIDP_2013_2017.useRules.join(" ")
  ].join("\n\n");
}
