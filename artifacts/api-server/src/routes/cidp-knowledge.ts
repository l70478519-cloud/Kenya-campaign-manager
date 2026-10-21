/**
 * Source-grounded knowledge digest of the user-provided Makueni County
 * Integrated Development Plan (CIDP) 2023-2027, published February 2023.
 *
 * This is a searchable, compact digest of the source for Smart Assist,
 * Intelligence and speech generation. It is NOT a claim that targets were
 * achieved, nor a replacement for checking the original plan and current
 * Annual Development Plans, budgets, audits and project records.
 */
export const CIDP_SOURCE = {
  title: "Makueni County Integrated Development Plan 2023-2027",
  publicationDate: "February 2023",
  theme: "A resilient economy for sustainable development",
  vision: "A prosperous value based county with a high quality of life",
  mission: "To transform livelihoods of each household through accountable leadership that creates an enabling environment for inclusive, effective and efficient service delivery.",
  scope: "Makueni County: six constituencies, 30 electoral wards and 60 sub-wards/villages (CIDP pp. 2, 16).",
  estimatedPlanCost: "KSh 92.3 billion over 2023-2027 (Executive Summary p. 11; implementation framework pp. 191-192). This is a plan-period estimate, not proof of funds released or spent.",
  sectors: [
    {
      name: "Water, Sanitation, Environment and Natural Resources",
      priorities: "Increase domestic, livestock, irrigation, industrial and urban water access through water harvesting, storage, treatment and distribution; improve water governance; protect catchments and water towers; restore forests and landscapes; improve sanitation and waste management; mobilise resources for water infrastructure.",
      evidenceAndMeasures: "The plan's M&E table lists improved-water-source household access baseline 44.2% (2021), mid-term target 57%, end-term target 70%; average distance to a water source baseline 5 km (2021), mid-term target 3 km and end-term target 2 km (pp. 80-88, 200-201). These are stated baseline/targets, not current measurements."
    },
    {
      name: "Agriculture and Rural Development",
      priorities: "Increase agricultural production, productivity and commercialisation; invest in value chains; support irrigation; revitalise value-chain-based agricultural extension; strengthen cooperatives; improve livestock, fisheries, food security and climate resilience; reduce post-harvest losses and improve access to markets.",
      evidenceAndMeasures: "The M&E framework lists 2021 baselines and 2025/2027 targets for pulses, cereals and fruit production (pp. 89-100, 200-202). Check the exact indicator/table and latest annual report before quoting a number."
    },
    {
      name: "Transport, Infrastructure, Public Works, Energy and ICT",
      priorities: "Extend, upgrade, rehabilitate and maintain county roads; improve connectivity between rural and urban areas; improve road safety and drainage/run-off harvesting; improve rural and urban electrification and renewable energy; maintain public works; increase ICT infrastructure, ICT literacy and automation of county services; strengthen feasibility studies, contract management and monitoring.",
      evidenceAndMeasures: "Priorities and strategies are set out in Chapter 4, section 4.1.3 and Table 19 (pp. 101-110). A stated priority is not proof a specific road, building or connection was delivered."
    },
    {
      name: "Health Services",
      priorities: "Improve equitable access to quality and affordable healthcare; equip facilities with medicines, equipment and personnel; establish model health facilities in each ward; strengthen community health workers; improve preventive, promotive and rehabilitative care; strengthen referral systems and medical supply procurement; improve accessibility for persons with disabilities.",
      evidenceAndMeasures: "Chapter 4, section 4.1.4 and Table 21 (pp. 111-120). Verify staffing, stock-outs, facility status, opening hours and referral performance against current dated health records before describing a failure."
    },
    {
      name: "Social Protection, Education, Culture and Recreation",
      priorities: "Support ECDE, vocational training linked to local labour-market needs, talent development, recreation and social protection; include youth, women, persons with disabilities, older people, vulnerable children and other special-interest groups; support economic empowerment and inclusive participation.",
      evidenceAndMeasures: "Chapter 4, section 4.1.5 (pp. 121-131). Verify bursary criteria, fund allocations, beneficiary counts and facility status against current official records."
    },
    {
      name: "General Economic and Commercial Affairs",
      priorities: "Strengthen wholesale, retail, informal/Jua Kali businesses, tourism, industrialisation, MSMEs and links between rural production and urban markets; support enterprise growth and employment creation.",
      evidenceAndMeasures: "Chapter 4, section 4.1.6 (pp. 132-138). Do not claim job numbers or business outcomes without current supporting data."
    },
    {
      name: "Lands and Urban Development",
      priorities: "Improve security of land tenure; support access to credit through tenure security; plan urban centres; provide utilities and amenities; manage land use and urban growth.",
      evidenceAndMeasures: "Chapter 4, section 4.1.7 (pp. 139-146). Verify any specific titling, planning or urban-infrastructure claim against dated records."
    },
    {
      name: "Devolution",
      priorities: "Strengthen accountable and accessible county administration, public participation, citizen feedback, institutional capacity, resource mobilisation, planning, performance management and transparent reporting.",
      evidenceAndMeasures: "Chapter 4, section 4.1.8 (pp. 147-156); implementation framework Chapter 5 (pp. 189-197); monitoring, evaluation and learning Chapter 6 (pp. 198-208)."
    }
  ],
  performanceReview: {
    scope: "Chapter 2 reviews the 2018-2022 CIDP period (pp. 25-64). It records revenue/expenditure, sector performance, challenges, lessons and recommendations.",
    caution: "The chapter's historical challenges are not automatically proof of failures by the current administration in October 2026. For public criticism, state the period and source, then compare with current Annual Development Plans, approved budgets, expenditure reports, audit findings and project-level evidence.",
    approach: "Separate allocation, release, expenditure, physical progress, completed output and working service outcome. A budget allocation or planned target alone does not prove implementation."
  },
  accountability: {
    planMonitoring: "Chapter 6 describes continuous collection, analysis and reporting of implementation and outcome indicators; quarterly implementation reports; annual County Annual Progress Reports; Public Expenditure Reports and public-participation reports (pp. 198-208).",
    citizenFeedback: "The plan describes citizen feedback through public engagement forums, suggestion boxes, bulk SMS and digital platforms, and project management committees (pp. 207-208).",
    evaluation: "The evaluation plan includes annual progress reviews, a mid-term CIDP review planned for 2025 and an end-term review planned for 2027 (p. 208). These are planned review points in the document; verify whether each review was actually published."
  },
  countyContext: {
    area: "8,176.7 km² (p. 13)",
    climate: "The plan describes Makueni as largely arid and semi-arid, with frequent drought risk and unreliable/erratic rainfall (p. 14).",
    population: "The plan reports 2019 census population 987,653 and gives a 2027 projection of 1,087,776 (pp. 17-18). The 2027 figure is a projection, not a new census.",
    economy: "Agriculture and small-scale trade are described as major economic activities (p. 13). The plan identifies different agro-ecological zones and different crop/livestock opportunities (p. 14)."
  }
} as const;

/** Return relevant source passages with page pointers for a query. */
export function getCidpContext(query: string, maxSectors = 4): string {
  const q = query.toLowerCase();
  const sectorKeywords: Record<string, string[]> = {
    "Water, Sanitation, Environment and Natural Resources": ["water", "borehole", "dam", "sand dam", "irrigation", "pipeline", "sanitation", "forest", "environment", "drought"],
    "Agriculture and Rural Development": ["agriculture", "farmer", "farm", "crop", "mango", "fruit", "livestock", "irrigation", "market", "cooperative", "extension", "drought", "food"],
    "Transport, Infrastructure, Public Works, Energy and ICT": ["road", "bridge", "electricity", "energy", "ict", "internet", "drainage", "public works", "infrastructure"],
    "Health Services": ["health", "hospital", "clinic", "dispensary", "medicine", "ambulance", "referral", "nurse", "doctor", "maternal"],
    "Social Protection, Education, Culture and Recreation": ["education", "school", "ecde", "bursary", "youth", "women", "disability", "pwd", "training", "talent", "recreation", "elderly"],
    "General Economic and Commercial Affairs": ["business", "jobs", "employment", "market", "tourism", "jua kali", "enterprise", "msme", "trade", "industry"],
    "Lands and Urban Development": ["land", "title", "titling", "urban", "town planning", "housing"],
    "Devolution": ["governance", "accountability", "budget", "participation", "audit", "revenue", "reporting", "transparency", "project", "performance", "intelligence", "cidp", "plan", "manifesto"]
  };
  const matched = CIDP_SOURCE.sectors
    .map((sector) => ({ sector, score: (sectorKeywords[sector.name] ?? []).filter((keyword) => q.includes(keyword)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSectors);
  const selected = matched.length ? matched.map(({ sector }) => sector) : CIDP_SOURCE.sectors;
  return [
    `SOURCE: ${CIDP_SOURCE.title} (published February 2023). Treat as a plan for 2023-2027, not as a current status report.`,
    `Theme: ${CIDP_SOURCE.theme}. Vision: ${CIDP_SOURCE.vision}. Mission: ${CIDP_SOURCE.mission}`,
    `County context: ${CIDP_SOURCE.countyContext.area}; ${CIDP_SOURCE.countyContext.climate}; ${CIDP_SOURCE.countyContext.economy}. Population figure: ${CIDP_SOURCE.countyContext.population}.`,
    ...selected.map((sector) => `SECTOR — ${sector.name}: ${sector.priorities} Source: CIDP 2023-2027 ${sector.evidenceAndMeasures}`),
    `PERFORMANCE REVIEW: ${CIDP_SOURCE.performanceReview.scope} Caution: ${CIDP_SOURCE.performanceReview.caution} Method: ${CIDP_SOURCE.performanceReview.approach}`,
    `ACCOUNTABILITY / M&E: ${CIDP_SOURCE.accountability.planMonitoring} ${CIDP_SOURCE.accountability.citizenFeedback} ${CIDP_SOURCE.accountability.evaluation}`,
    `Source discipline: label all figures with source and year; never describe a plan target as achieved; compare historical commitments with current dated records before stating failure.`
  ].join("\n\n");
}
