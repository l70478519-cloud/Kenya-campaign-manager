/**
 * The active campaign's geography, shared by every page.
 *
 * These arrays are filled from /api/tenancy/context before any signed-in page
 * renders (see App.tsx), and switching campaign reloads the app, so pages can
 * import them as plain constants. Public pages (public poll, volunteer sign-up)
 * have no campaign context and keep the primary campaign's values.
 */
export const WARDS: string[] = [];
export const CONSTITUENCIES: string[] = [];
export const CAMPAIGN = {
  id: 1,
  name: "",
  constituency: "",
  county: "",
  seat: "MP" as string | null,
  candidate: "",
  isPrimary: true,
  /** "Kaiti Constituency", "Makueni County", "Ukia Ward" or "Kenya": ready to display. */
  areaLabel: "Your campaign area",
};

const labelFor = (area: string) => /\b(county|ward|kenya|constituency)$/i.test(area.trim()) ? area.trim() : `${area.trim()} Constituency`;

export function applyCampaignGeography(c: { id: number; name: string; wards: string[]; constituency: string | null; seat: string | null; area: string | null; candidateName?: string | null; county?: string | null }, primaryId: number) {
  if (c.wards?.length) WARDS.splice(0, WARDS.length, ...c.wards);
  CONSTITUENCIES.splice(0, CONSTITUENCIES.length, ...(c.constituency || c.name ? [c.constituency || c.name] : []));
  Object.assign(CAMPAIGN, {
    id: c.id, name: c.name, constituency: c.constituency || c.name, seat: c.seat,
    county: c.county || (c.area?.split(",").pop()?.trim() ?? ""),
    candidate: c.candidateName || "",
    isPrimary: c.id === primaryId,
  });
  CAMPAIGN.areaLabel = CAMPAIGN.constituency ? labelFor(CAMPAIGN.constituency) : "Your campaign area";
}
