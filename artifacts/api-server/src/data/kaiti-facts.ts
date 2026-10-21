/**
 * Kaiti Constituency facts extracted from the two county plans supplied by the
 * campaign (Makueni CIDP 2018-2022 and CIDP 2023-2027). Every entry carries its
 * document and page so AI answers and analysis can cite it. These are plan
 * statements and official baseline figures, NOT proof that a project was
 * delivered. Election RESULTS are not in these documents; import them from
 * IEBC Forms 34A/35A into Historical Election Results.
 */

export const CIDP_2023 = "Makueni CIDP 2023-2027";
export const CIDP_2018 = "Makueni CIDP 2018-2022";

/** IEBC registered voters per ward, 2022 (CIDP 2023-2027, Table 3, p.16). */
export const KAITI_REGISTERED_VOTERS_2022: Record<string, number> = {
  Ukia: 22_344,
  Kee: 12_212,
  Kilungu: 16_858,
  Ilima: 13_774,
};
export const KAITI_REGISTERED_TOTAL_2022 = 65_188;
export const KAITI_REGISTER_SOURCE = `${CIDP_2023}, Table 3 "County's Electoral Wards by Constituency and Registered voters" (p.16)`;

/**
 * Makueni County, 2022 presidential election (IEBC county totals as compiled in
 * the public dataset github.com/ndeke254/Elections_2022_Kenya, data/results.csv).
 * Turnout = (valid + rejected) / registered = 292,727 / 479,516 = 61.0%.
 */
export const MAKUENI_2022_PRESIDENTIAL = {
  registered: 479_516, valid: 290_819, rejected: 1_908, turnoutPct: 61.0,
  results: [
    { candidate: "Raila Odinga", votes: 229_213, share: 78.82 },
    { candidate: "William Ruto", votes: 59_195, share: 20.35 },
    { candidate: "George Wajackoya", votes: 1_836, share: 0.63 },
    { candidate: "David Waihiga", votes: 575, share: 0.2 },
  ],
  source: "IEBC 2022 presidential county totals for Makueni, via public dataset ndeke254/Elections_2022_Kenya (data/results.csv)",
};

export type KaitiFact = { topic: string; fact: string; source: string; wards?: string[] };

export const KAITI_FACTS: KaitiFact[] = [
  { topic: "Electorate", fact: "Kaiti had 65,188 registered voters in 2022: Ukia 22,344; Kilungu 16,858; Ilima 13,774; Kee 12,212. Ukia alone holds about 34% of the constituency's voters.", source: KAITI_REGISTER_SOURCE },
  { topic: "Electorate", fact: "Makueni County had 479,401 registered voters in 2022; Kaiti (65,188) is the second-smallest constituency electorate after Kilome (59,178).", source: `${CIDP_2023}, s.1.4.3 (p.16)` },
  { topic: "Electorate", fact: "In the 2022 presidential election Makueni County turnout was 61.0% (292,727 of 479,516 registered). Raila Odinga took 78.8% and William Ruto 20.4%. Constituency and ward turnout were not published in this dataset.", source: MAKUENI_2022_PRESIDENTIAL.source },
  { topic: "Administration", fact: "Kaiti is one of six county sub-counties/constituencies, with 4 wards and 8 villages (sub-wards).", source: `${CIDP_2023}, Table 2 (p.16)` },
  { topic: "Population", fact: "KNBS Kilungu sub-county (the national-government unit covering much of Kaiti) had 60,952 people in 2019 (29,019 male, 31,932 female), projected 63,609 in 2022 and 67,131 in 2027, on 154.3 km². Note KNBS sub-county boundaries do not exactly match the constituency.", source: `${CIDP_2023}, Tables 1, 4 and 7 (pp.15-19)` },
  { topic: "Population", fact: "Kilungu sub-county has the highest population density in Makueni: 395 people/km² (2019), projected 435/km² by 2027.", source: `${CIDP_2023}, Table 7 (p.19)` },
  { topic: "Geography", fact: "Kilungu and Iuani hills are Kaiti's main physical features; the Kaiti river is one of the county's tributaries feeding the Athi.", source: `${CIDP_2023}, s.1.3 (p.14); ${CIDP_2018}, s.1.2 (p.6)` },
  { topic: "Agriculture", fact: "Kaiti's uplands are in the Upper Middle agro-ecological zone: coffee, avocado, macadamia, maize, beans and dairy farming.", source: `${CIDP_2023}, s.1.3 (p.14)` },
  { topic: "Agriculture", fact: "Average land holding in the upper zone (Mbooni and Kaiti) is about one acre, against five acres in the middle zone — the smallest farms in the county.", source: `${CIDP_2023} (p.139)` },
  { topic: "Agriculture", fact: "The county spatial plan sees horticulture and dairy potential especially in the hilly parts of Kilungu, and proposes irrigated farming along the Kaiti river.", source: `${CIDP_2023} (p.69)` },
  { topic: "Agriculture", fact: "Kee sisal farmers were supported with sisal fibre brushing machines; dairy groups in Kaiti were supported into value addition (yoghurt and mala).", source: `${CIDP_2023}, review of previous plan (p.33)`, wards: ["Kee"] },
  { topic: "Agriculture", fact: "The 2018-22 plan promised pasture development in gullies and denuded areas including Kilungu, and irrigation along the Kaiti river.", source: `${CIDP_2018}, s.2.1.2 (pp.12-13)`, wards: ["Kilungu"] },
  { topic: "Water", fact: "WOWASCO constructed/rehabilitated the Kaiti 1 water sump (400 m³) during the previous plan period.", source: `${CIDP_2023}, review of previous plan (p.28)` },
  { topic: "Water", fact: "The Kaiti, Muooni and Kikuu rivers face declining water levels from sand harvesting and riparian farming; the plan proposes sand dams and enforcement of sand regulations.", source: `${CIDP_2023}, natural resources table (p.46)` },
  { topic: "Water", fact: "County-wide only 35.6% of people had potable water access in 2017, with an average 5 km to a water point.", source: `${CIDP_2018}, s.2.2 (p.17)` },
  { topic: "Roads", fact: "Emali–Ukia (45 km) and Ukia–Kikoko (20 km) were priority roads for tarmacking in the 2018-22 plan.", source: `${CIDP_2018}, flagship road programme (p.31, p.41)`, wards: ["Ukia"] },
  { topic: "Roads", fact: "The Emali–Kalamba–Ukia road has been only partially tarmacked by KeNHA and remains a prioritised link.", source: `${CIDP_2023}, spatial plan (p.75)`, wards: ["Ukia"] },
  { topic: "Industry", fact: "Planned but county-level: a ceramic industry in Kilungu and a granite processing and tile-making plant in Kaiti sub-county; kaolin deposits at Nunguni.", source: `${CIDP_2018}, s.2.1.2 (pp.14-15); ${CIDP_2023} (pp.47, 81)`, wards: ["Kilungu"] },
  { topic: "Environment", fact: "Kilungu forest is a conservation zone (steep slopes, watersheds, springs) and received enrichment planting under the previous plan.", source: `${CIDP_2023} (pp.29, 73)`, wards: ["Kilungu"] },
  { topic: "Urban", fact: "Nunguni is a planned urban centre (approved land-use plan; bus park built; piped water and sewerage proposals).", source: `${CIDP_2023} (p.42); ${CIDP_2018} (pp.18-19, 26)` },
];

/** Compact text block for AI prompts and no-token answers, optionally filtered by ward or topic words. */
export function kaitiFactsContext(query = "", max = 8): string {
  const q = query.toLowerCase();
  const scored = KAITI_FACTS.map(f => {
    let s = 0;
    for (const w of q.split(/\W+/).filter(x => x.length > 3)) if ((f.topic + " " + f.fact).toLowerCase().includes(w)) s += 2;
    if (f.wards?.some(w => q.includes(w.toLowerCase()))) s += 3;
    if (f.topic === "Electorate") s += 1;
    return { f, s };
  }).sort((a, b) => b.s - a.s).slice(0, max);
  return scored.map(({ f }) => `- [${f.topic}] ${f.fact} (Source: ${f.source})`).join("\n");
}
