# Kenya Campaign Manager

A working campaign operations application inspired by the public Campaigns Master feature catalogue, with an original responsive interface. Plain JavaScript, CSS and Python 3.12; no npm install, build step or third-party runtime packages.

## Run

```bash
export ADMIN_EMAIL='you@example.com'
export ADMIN_PASSWORD='replace-with-a-long-unique-password'
python3 server.py
```

Open http://localhost:8000 and sign in using those environment values. The admin account is created on the first run only. No default password, fake statistics or seeded real aspirants. Create campaigns from the dashboard. Data persists in `data/campaigns.db`; back it up with SQLite's backup API or while the server is stopped.

## Included

- Separate aspirant workspaces for President, Governor, Senator, Woman Representative, constituency MP and ward MCA. President/Governor running mates belong to their ticket, not separate ballot offices.
- All 47 counties. Required constituency/ward fields for the applicable seats; these names are manually entered, not a verified national boundary registry.
- Workspace selector, overview metrics calculated from saved records, budget overview and campaign search.
- Create, read, edit, delete and search tasks, events, volunteers, field reports, finance entries, message drafts, nomination checklists and document links.
- Kenyan mobile normalization; KES accounting; date-only activity planning; UTC audit timestamps clearly labelled.
- JSON exports of the selected module or workspace records.
- Password hashing, expiring HttpOnly sessions, campaign-scoped authorization and audit records.
- Responsive navigation, keyboard-accessible dialogs and forms, empty states and server validation.

This supports aspirants for every seat; it does **not** claim to contain a current national directory of real aspirants. Import or enter verified aspirant data separately.

## Team access

Use the offline administration command on your server; get campaign IDs from a campaigns JSON export:

```bash
python3 manage.py colleague@example.com --name 'Colleague' --role manager --campaign CAMPAIGN_ID
```

Roles: admin has organisation-wide access and creates campaigns; manager handles assigned campaigns including finance and drafts; officer can manage assigned operational records, excluding finance/messages; viewer is read-only. Only admin/manager can read audit records. Repeat `--campaign` for multiple assignments. Password is entered interactively. Team account creation is CLI-based in this version.

## Deployment

The included Render blueprint uses Docker and a paid persistent disk. Set the two admin variables when provisioning. `SECURE_COOKIES=1` requires HTTPS; terminate TLS at a reverse proxy. Mount persistent storage at `/data` for other Docker hosts. Never expose the development HTTP server directly to the internet: use a managed HTTPS reverse proxy, request throttling and a restricted origin. Run one application instance with this SQLite configuration. A cPanel host must support Python applications or Docker; this is not a Node Passenger app.

## Honest integration boundaries

SMS/email/WhatsApp remain drafts; no provider is connected and no delivery receipts are fabricated. Finance entries are bookkeeping, not M-Pesa charges or bank verification. Documents are external links, not file uploads. Nomination status is an internal checklist, not an IEBC eligibility decision. There is no live GIS, electoral results ingestion, social feed, opinion-poll platform, AI generation, automated targeting, offline sync, payment gateway or provider scheduling. These require separate verified data feeds/integrations. The reference's private dashboard was not accessible; this is not a pixel-identical recreation of private screens.

Before handling production personal data, configure hosting protections, backups, retention and access processes. The app does not infer ethnicity, political preference or vote choice. Volunteer records are operational team records.

## Validation

```bash
python3 -m unittest discover -s tests -v
node --check public/app.js
```

Tests cover sign-in, all six seat types, required geography, CRUD persistence, negative finance validation, forced draft status, campaign isolation, viewer permissions, audit generation and logout. CI repeats these on pushes and PRs.

## Sources

- https://campaignsmaster.com/features — public feature catalogue used for workflow inspiration.
- https://www.iebc.or.ke/uploads/resources/wNa7w1TbBm.pdf — elective positions and electoral scope.

© Kenya Campaign Manager. Powered by 1Dev.co.
