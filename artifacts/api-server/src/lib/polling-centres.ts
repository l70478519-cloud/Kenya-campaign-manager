import { createHash } from "node:crypto";
import { POLLING_CENTRES, POLLING_CENTRE_SOURCE } from "../data/kenya-polling-centres";
import { KENYA_COUNTIES, findCounty, findConstituency, nameKey, resolveWards, type WardRef } from "../data/kenya-electoral-units";

/**
 * A campaign's own electoral area: its wards and their IEBC polling centres,
 * and nothing outside it. Everything here is derived from the campaign's seat,
 * county, area and stored ward list, so an aspirant signed in to their
 * campaign never receives another area's geography.
 */

/**
 * Codes for centres loaded from the reference register. The register has no
 * IEBC codes, so these are stable hashes, prefixed so they can never be
 * mistaken for official codes. Importing the official IEBC list replaces them.
 */
export const REFERENCE_CODE_PREFIX = "KCM-";
export function referenceCode(ref: Pick<WardRef, "county" | "countyCode" | "constituency" | "ward">, centre: string): string {
  const digest = createHash("sha1").update(`${ref.county}|${ref.constituency}|${ref.ward}|${nameKey(centre)}`).digest("hex");
  return `${REFERENCE_CODE_PREFIX}${ref.countyCode}-${digest.slice(0, 10).toUpperCase()}`;
}
export const isReferenceCode = (code: string) => code.startsWith(REFERENCE_CODE_PREFIX);

export type CampaignAreaInput = {
  seat?: string | null; county?: string | null; constituency?: string | null; area?: string | null; wards: readonly string[];
};
export type AreaCentre = { code: string; name: string };
export type AreaWard = {
  /** The ward name as stored on the campaign (what every module filters by). */
  ward: string;
  county: string; constituency: string;
  /** Name in the current IEBC-aligned directory (differs only for old names). */
  officialWard: string;
  via: WardRef["via"];
  centres: AreaCentre[];
};
export type CountySummary = { county: string; code: string; constituencies: number; wards: number; centres: number };
export type CampaignArea = {
  scope: "national" | "county" | "constituency" | "ward" | "custom";
  label: string;
  county: string | null;
  constituencies: string[];
  wards: AreaWard[];
  /** National campaigns get per-county totals instead of 24,000+ centres. */
  counties: CountySummary[];
  unmatched: string[];
  ambiguous: { ward: string; constituencies: string[] }[];
  totals: { wards: number; centres: number };
  source: typeof POLLING_CENTRE_SOURCE & { note: string };
};

const SOURCE_NOTE = "Centre names from the IEBC polling-station register (compiled copy). No IEBC codes, registered voters or streams: import the official IEBC list for those.";

export function centresFor(ref: Pick<WardRef, "county" | "countyCode" | "constituency" | "ward">): AreaCentre[] {
  return (POLLING_CENTRES[ref.county]?.[ref.constituency]?.[ref.ward] ?? []).map(name => ({ code: referenceCode(ref, name), name }));
}

function countySummary(name: string): CountySummary | null {
  const c = findCounty(name);
  if (!c) return null;
  const ks = POLLING_CENTRES[c.name] ?? {};
  return {
    county: c.name, code: c.code, constituencies: c.constituencies.length,
    wards: c.constituencies.reduce((n, k) => n + k.wards.length, 0),
    centres: Object.values(ks).flatMap(Object.values).reduce((n, l) => n + l.length, 0),
  };
}

export function campaignArea(input: CampaignAreaInput): CampaignArea {
  const seat = (input.seat ?? "").trim().toLowerCase();
  const source = { ...POLLING_CENTRE_SOURCE, note: SOURCE_NOTE };
  const empty = { constituencies: [], wards: [], counties: [], unmatched: [], ambiguous: [] };

  // President: the operating units are counties.
  const allCounties = input.wards.length > 0 && input.wards.every(w => !!findCounty(w));
  if (seat === "president" || (!input.county && allCounties)) {
    const counties = (input.wards.length ? input.wards : KENYA_COUNTIES.map(c => c.name))
      .map(countySummary).filter((c): c is CountySummary => !!c);
    return { ...empty, scope: "national", label: "Kenya", county: null, counties,
      totals: { wards: counties.reduce((n, c) => n + c.wards, 0), centres: counties.reduce((n, c) => n + c.centres, 0) }, source };
  }

  const county = input.county ? findCounty(input.county) ?? null : null;
  // MP campaigns store the constituency; MCA campaigns store it first in "area" ("Kaiti, Makueni County").
  const hint = [input.constituency, input.area?.split(",")[0]]
    .map(h => (h ?? "").trim()).find(h => !!h && !!county && !!findConstituency(county, h));
  const constituency = hint && county ? findConstituency(county, hint)!.name : null;

  const wards: AreaWard[] = [], unmatched: string[] = [], ambiguous: CampaignArea["ambiguous"] = [];
  const seen = new Set<string>();
  for (const stored of input.wards) {
    if (seen.has(nameKey(stored))) continue;
    seen.add(nameKey(stored));
    let refs = resolveWards(stored, { county: county?.name, constituency });
    if (!refs.length && constituency) refs = resolveWards(stored, { county: county?.name });
    if (!refs.length) { unmatched.push(stored); continue; }
    if (refs.length > 1) ambiguous.push({ ward: stored, constituencies: refs.map(r => `${r.constituency} (${r.county})`) });
    for (const r of refs) wards.push({ ward: stored, county: r.county, constituency: r.constituency, officialWard: r.ward, via: r.via, centres: centresFor(r) });
  }

  const scope: CampaignArea["scope"] = /governor|senator|woman/.test(seat) ? "county" : seat === "mp" ? "constituency" : seat === "mca" ? "ward" : "custom";
  const label = scope === "county" && county ? `${county.name} County`
    : scope === "constituency" && constituency ? `${constituency} Constituency`
    : scope === "ward" && wards[0] ? `${wards[0].officialWard} Ward, ${wards[0].constituency}`
    : county ? `${county.name} County (selected wards)` : "Selected wards";
  return {
    scope, label, county: county?.name ?? (wards[0]?.county ?? null),
    constituencies: [...new Set(wards.map(w => w.constituency))],
    wards, counties: [], unmatched, ambiguous,
    totals: { wards: wards.length, centres: wards.reduce((n, w) => n + w.centres.length, 0) },
    source,
  };
}

/** Rows for the campaign's polling_stations table, keyed to the campaign's stored ward names. */
export function referenceStationRows(area: CampaignArea): { code: string; name: string; ward: string; constituency: string }[] {
  return area.wards.flatMap(w => w.centres.map(c => ({ code: c.code, name: c.name, ward: w.ward, constituency: w.constituency })));
}
