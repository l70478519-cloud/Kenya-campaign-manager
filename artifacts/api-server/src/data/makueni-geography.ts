/**
 * Administrative / electoral geography for Kaiti Constituency, Makueni County.
 *
 * Geography structure: Kaiti Constituency and its four county assembly wards.
 * Primary electoral reference: IEBC, Registered Voters per Polling Station
 * (2022 register snapshot), which includes county, constituency, ward, centre,
 * polling-station codes/names and registered voters:
 * https://www.iebc.or.ke/docs/rov_per_polling_station.pdf
 *
 * Cross-check: Makueni County Statistical Abstract / KNBS, Table 4.1.2,
 * "Number of Polling Stations by Constituency and Ward in 2013, 2017 and 2022":
 * https://www.knbs.or.ke/wp-content/uploads/2026/02/2025-Statistical-Abstract-Makueni-County.pdf
 *
 * This file is the stable ward dropdown reference, not the full polling-station
 * register. Do not infer polling-station totals from ward counts or present
 * legacy dashboard figures as current. Import station-level records from IEBC
 * with the register year and source URL retained on each record.
 */
export const MAKUENI_GEOGRAPHY = [
  { constituency: "Kaiti", wards: ["Kee", "Kilungu", "Ilima", "Ukia"] },
] as const;

export const MAKUENI_CONSTITUENCIES = MAKUENI_GEOGRAPHY.map(
  ({ constituency }) => constituency,
);

export const MAKUENI_WARDS = MAKUENI_GEOGRAPHY.flatMap(
  ({ constituency, wards }) => wards.map((ward) => ({ constituency, ward })),
);
