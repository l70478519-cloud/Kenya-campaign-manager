/**
 * Search wording for social listening, derived from the campaign's seat and
 * area so every seat type (President, Governor, Senator, Woman Rep, MP, MCA)
 * searches the right place. Mirrors the app's area label
 * (artifacts/commandcentre/src/lib/wards.ts, applyCampaignGeography).
 *
 * Pure functions with no imports, so they can be unit-tested directly.
 */

export type SearchProfile = {
  seat: string | null;
  candidateName: string | null;
  county: string | null;
  constituency: string | null;
  /** Operational units: counties (President), county wards (Governor/Senator/Woman Rep), constituency wards (MP), one ward (MCA). */
  wards: string[];
};

export type SearchScope = {
  candidate: string;
  shortName: string;
  /** Office label used in queries, e.g. "governor"; empty when unknown. */
  office: string;
  /** Area as shown to users: "Kenya", "Makueni County", "Kaiti Constituency", "Ukia Ward". */
  areaLabel: string;
  /** Bare area name used in queries: "Kenya", "Makueni", "Kaiti", "Ukia". */
  areaName: string;
  county: string;
  wards: string[];
  national: boolean;
  /** Place names a result must mention (whole word) to count as local. */
  placeTerms: string[];
};

const OFFICES: Record<string, string> = {
  president: "presidential",
  governor: "governor",
  senator: "senator",
  "woman rep": "Woman Representative",
  mp: "MP",
  mca: "MCA",
};

const stripSuffix = (value: string, suffix: RegExp) => value.trim().replace(suffix, "").trim();

export function searchScope(p: SearchProfile | null): SearchScope {
  const seat = (p?.seat ?? "").trim().toLowerCase();
  const candidate = p?.candidateName?.trim() || "the candidate";
  const shortName = candidate.replace(/^((hon|dr|mr|mrs|ms|eng|prof|h\.?e)\.?\s+)+/i, "").trim() || candidate;
  const county = stripSuffix(p?.county ?? "", /\s+county$/i);
  const constituency = stripSuffix(p?.constituency ?? "", /\s+constituency$/i);
  const wards = (p?.wards ?? []).map(w => w.trim()).filter(Boolean);
  const office = OFFICES[seat] ?? "";

  let areaName: string;
  let areaLabel: string;
  if (seat === "president") {
    areaName = "Kenya"; areaLabel = "Kenya";
  } else if (seat === "governor" || seat === "senator" || seat === "woman rep") {
    areaName = county; areaLabel = county ? `${county} County` : "";
  } else if (seat === "mca") {
    const ward = stripSuffix(wards[0] ?? "", /\s+ward$/i);
    areaName = ward; areaLabel = ward ? `${ward} Ward` : "";
  } else {
    areaName = constituency; areaLabel = constituency ? `${constituency} Constituency` : "";
  }

  const national = seat === "president";
  const placeTerms = [...new Set([areaName, national ? "" : county, constituency, ...wards])]
    .filter(t => t.length >= 3);
  return { candidate, shortName, office, areaLabel, areaName, county, wards, national, placeTerms };
}

export type CategoryKey = "candidate" | "issues" | "opponent" | "competitor";

/** News-search queries for one category. Empty when the category has nothing to search. */
export function categoryQueries(key: CategoryKey, s: SearchScope, competitors: string[] = []): string[] {
  const area = s.areaName;
  if (key === "candidate") {
    return [
      area ? `"${s.shortName}" ${area}` : "",
      s.office ? `"${s.shortName}" ${s.office}` : "",
      `"${s.shortName}"`,
    ].filter(Boolean);
  }
  if (key === "issues") {
    if (s.national) return ["Kenya cost of living jobs health education", "Kenya county service delivery water roads"];
    if (!area) return [];
    return [
      `${area} water roads health education agriculture`,
      s.wards.length > 1 ? `${area} ${s.wards.slice(0, 3).join(" OR ")} ward project` : "",
      `${area} borehole hospital market ECDE bursary`,
    ].filter(Boolean);
  }
  if (key === "opponent") {
    // Labelled "Public records" in the app: budgets, audits, public participation.
    if (s.national) return ["Kenya national budget audit report", "Kenya public participation service delivery"];
    return [
      area ? `${area} budget audit project` : "",
      s.county ? `${s.county} County public participation service delivery` : "",
    ].filter(Boolean);
  }
  // Opponents listed by the campaign (competitors table).
  return competitors.slice(0, 5).map(name => (area && !s.national ? `"${name}" ${area}` : `"${name}"`));
}

/** One-line description of what a category looks for, used in AI web-search prompts. */
export function categoryPrompt(key: CategoryKey, s: SearchScope, competitors: string[] = []): string | null {
  const where = s.national ? "Kenya" : `${s.areaLabel || "the campaign area"}${s.county && !/county$/i.test(s.areaLabel) ? `, ${s.county} County` : ""}, Kenya`;
  if (key === "candidate") {
    const role = s.office ? ` (${s.office} candidate)` : "";
    return `public mentions, interviews, official notices, community forums and news about ${s.candidate}${role}, also known as ${s.shortName}, in ${where}`;
  }
  if (key === "issues") {
    const units = s.wards.length > 1 && !s.national ? ` (${s.wards.slice(0, 8).join(", ")})` : "";
    return `publicly reported service-delivery issues and projects in ${where}${units}, including water, roads, health facilities, ECDE and schools, agriculture, markets, bursaries and budgets`;
  }
  if (key === "opponent") {
    return `public news, official notices, public participation, audit and budget documents and project delivery updates for ${where}`;
  }
  if (!competitors.length) return null;
  return `public mentions, interviews and news about these candidates competing in ${where}: ${competitors.slice(0, 5).join(", ")}`;
}
