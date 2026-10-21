# Command Centre marketing website

Static, dependency-free website for Kenyan campaigns (Home, Features, Seats & Counties,
Pricing, About, Insights, Contact). Works on phones, tablets and desktops, in light and dark.

## Edit
- Brand, phone, WhatsApp, email, address and prices: `assets/site-config.js`
  (empty values are hidden; prices show "Get a quote" until you fill them in).
- Page text: the HTML files.
- Electoral data: `assets/kenya-units.json` — 47 counties, 290 constituencies, 1,450 wards.

## Hosting
- **With the Command Centre server (default):** served at `/site`. Set `SITE_AT_ROOT=true` in Render
  to show it at the root of your domain; the app stays at `/login`.
- **Anywhere else** (Netlify, Cloudflare Pages, cPanel): upload this folder, set `apiBase` in
  `assets/site-config.js` to your Command Centre URL, and add the website's address to the server's
  `CORS_ORIGINS` so the demo form can submit.

Demo requests appear in Command Centre → System Health & Audit → Demo requests.
