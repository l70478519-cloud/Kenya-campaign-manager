# Import templates

Fill these from official IEBC records only, then import them in Command Centre.

| File | Where to import | Official source |
|---|---|---|
| `polling-stations-template.csv` | Election Day → Stations → Choose CSV file | IEBC "Registered Voters per Polling Station" |
| `historical-results-template.csv` | Historical Election Results → Import CSV | IEBC result forms for your seat (e.g. 34A President, 35A MP) |

Ward names must match the wards of your campaign (set from the seat and area you chose).
Once both are imported, Strategic SWOT → Path to victory shows turnout, past winners and votes needed per ward.

No official list yet? Election Day → Stations → **Load IEBC polling centres** fills your area's centres from the
IEBC register (names only, `KCM-` reference codes). Importing the official CSV later upgrades those same rows with
the IEBC code, registered voters and streams.
