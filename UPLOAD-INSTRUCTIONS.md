# Campaign Command Centre — Kenya: how to put it online

This is a complete, separate project (it is not an update to KaitiOS).

1. On GitHub create a **new, private** repository (e.g. `campaign-command-centre`).
2. Unzip, open `campaign-command-centre-kenya`, and upload everything inside it
   (GitHub web: Add file → Upload files → drag all folders and files; or use git).
3. In Render: New → Blueprint → choose the new repository. Set the variables listed in
   `DEPLOY_RENDER.md` (at minimum `DATABASE_URL`, `MFA_ENCRYPTION_KEY` and the three
   `BOOTSTRAP_ADMIN_*` values). Use a **new Supabase project/database**, not KaitiOS's.
4. Deploy. The website is at `/`, the app at `/login`.
5. Sign in, open **Organisations & campaigns → Set seat & area** (or set `PRIMARY_SEAT`
   and the area variables before deploying), and add more campaigns for other aspirants.
6. Edit the website's brand, phone, email and prices in `artifacts/website/assets/site-config.js`.
