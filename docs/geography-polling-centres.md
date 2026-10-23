# Electoral geography, polling centres, demo aspirants and the national development framework

## Boundaries

`artifacts/api-server/src/data/kenya-electoral-units.ts` holds 47 counties, 290 constituencies and 1,450 wards.
In October 2026 every constituency was checked ward-for-ward against the IEBC polling-station register. 46 differed. The register's names were adopted, with two exceptions:

- Makueni keeps its CIDP 2023-2027 spellings.
- Bukira Central/Ikerege keeps its name, because the register has a typo there.

Mbita and Suba are now Suba North and Suba South.

Old names are listed in `LEGACY_WARD_NAMES` / `LEGACY_CONSTITUENCY_NAMES` and still resolve. Campaigns created earlier keep their stored ward names and keep working.

Three counties each have two different wards with the same name:

| County | Wards sharing a name |
|---|---|
| Kiambu | Township (Thika Town and Kiambu) |
| Nakuru | Biashara (Naivasha and Nakuru Town East) |
| Nyeri | Iriaini (Mathira) and Iria-ini (Othaya) |

County-wide campaigns see these flagged as ambiguous. MCA campaigns are resolved using the campaign's constituency.

## Polling centres

`kenya-polling-centres.ts` is generated. Do not edit it by hand. It holds 24,593 polling centres from the IEBC register compiled at `github.com/stevehoober254/kenya-county-data` (MIT). The source is pinned to commit `183a54d` and checked by SHA-256.

Rebuild or verify it with:

```sh
node scripts/geo/build-polling-centres.mjs          # rebuild (downloads the pinned source)
node scripts/geo/build-polling-centres.mjs --check  # verify the committed file is current
```

The build fails without writing anything if any centre can't be placed or any ward ends up empty.

The source has centre names only, with no IEBC station codes, registered voters or streams. Centres loaded from it get stable `KCM-<county code>-…` reference codes, which can never be mistaken for IEBC codes.

## What an aspirant sees

Each campaign is limited to its seat's area (row-level security plus the campaign's ward list).

- `GET /api/geography/my-area` returns only the active campaign's county, constituencies, wards and polling centres. Add `?centres=0` for totals only. It needs Dashboard read, which the read-only `candidate` role has. Presidential campaigns get per-county totals.
- `POST /api/election-day/stations/load-reference` loads the campaign's own centres into Election Day → Stations. There is also a **Load IEBC polling centres** button on that tab. It needs Election Day write and is safe to repeat. Presidential campaigns are refused: import the official list per county instead.
- Importing the official IEBC CSV afterwards upgrades matching reference rows (same ward, same centre name) in place. It adds the IEBC code, registered voters and streams, and keeps agents and status.
- The national tree (`/api/tenancy/geography`) remains admin-only.

## Demo aspirants

Set `DEMO_ASPIRANTS_PASSWORD` (16+ characters) in the environment and restart. The API then creates three sign-ins in a "Demo aspirants" organisation. Each is a member of its own campaign only, with the read-only `candidate` role, and has its polling centres pre-loaded.

| Username | Seat | Area | Centres |
|---|---|---|---|
| `demo.mca` | MCA | Ukia Ward, Kaiti, Makueni | 36 |
| `demo.mp` | MP | Changamwe, Mombasa | 24 |
| `demo.governor` | Governor | Kisumu County | 528 |

No password is stored in code. Leave the variable empty in production, and delete the accounts in Admin to retire them. To change the demo areas, edit `DEMO_ASPIRANTS` in `artifacts/api-server/src/lib/demo-aspirants.ts`.

Read-only roles can use the AI assistant (`POST /api/ai/assist`), because asking it changes no data. AI routes that save documents still need write access.

## National development framework in the AI assistant

`kenya-evidence.ts` → `NATIONAL_FRAMEWORK` covers the structure of:

- Kenya Vision 2030: its aim, three pillars, sectors, enablers and flagships;
- the Medium Term Plans, including MTP IV 2023-2027 and the five pillars of the Bottom-Up Economic Transformation Agenda (BETA);
- the county-planning law: the County Governments Act and Public Finance Management Act, both 2012.

Every assistant answer, speech and evidence brief receives it through `evidenceContext()`.

These are orientation summaries written without page-by-page review, because the official sites could not be reached when this was built. They are therefore:

- kept out of `KENYA_FACTS`;
- labelled "not page-reviewed — verify";
- free of progress figures or project status.

To add verified content, review the official document and add dated facts with page locators to `KENYA_FACTS`.

County plans: only Makueni's CIDP is loaded. For any other county, the assistant is told that county's CIDP 2023-2027 is not loaded and must not describe its contents. To add a county, add its reviewed source and facts to `KENYA_SOURCES` / `KENYA_FACTS`, then list it in `COUNTY_PLANS_LOADED`.
