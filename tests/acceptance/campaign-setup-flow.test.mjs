import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('a campaign is set up from the candidate name and affiliated party only', () => {
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.doesNotMatch(page, /createOrg|New organisation, e\.g\.|Campaign organisation|label className="text-sm">Organisation|>Campaign name</);
  assert.match(page, /<CandidateFields v=\{np\} set=\{setNp\} parties=\{parties\} required \/>/);
  assert.match(page, />Candidate name<input required=\{required\} minLength=\{2\}/);
  assert.match(page, />Affiliated party<input value=\{v\.party\}/, 'party is typed freely');
  assert.match(page, /const partyName = np\.party\.trim\(\) \|\| "Independent";/, 'empty party means Independent');
  // The party groups campaigns behind the scenes: reused with its own spelling, or created on first use.
  assert.match(page, /api<Org>\("tenancy\/organisations", \{ method: "POST", body: JSON\.stringify\(\{ name: partyName \}\) \}\)/);
  assert.match(page, /\.\.\.profilePayload\(\{ \.\.\.np, party: party\.name \}, true\)/);
  // Campaign name is generated: "Emmanuel Okatch — MP, Homa Bay Town".
  assert.match(page, /organisationId: party\.id, name: campaignName,/);
  assert.match(page, /area\.seat === "MP" \? area\.constituency/);
});

test('registering an aspirant opens their seat area straight away; any campaign opens on click', () => {
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.match(page, /<h2 className="font-semibold">Register an aspirant<\/h2>/);
  assert.doesNotMatch(page, /New campaign<\/h2>|"Create campaign"/);
  assert.match(page, /<SeatPicker geo=\{geo\.data\} v=\{area\} set=\{setArea\} label="Seat the aspirant is vying for" \/>/);
  assert.match(page, /try \{ await openCampaignApi\(campaign\.id\); \}/, 'opens My Area after registering');
  assert.match(page, /is registered, but the campaign couldn’t be opened: \$\{\(e as Error\)\.message\}/, 'real reason if it fails');
  assert.match(page, /<button type="button" onClick=\{\(\) => openCampaign\(c\)\} className="text-left min-w-0/, 'clicking a campaign opens it');
  assert.match(page, /Couldn’t open “\$\{c\.candidateName \|\| c\.name\}”: \$\{\(e as Error\)\.message\}/);
  assert.match(src('artifacts/commandcentre/src/lib/tenancy.ts'), /api\(`tenancy\/campaigns\/\$\{campaignId\}\/open`, \{ method: "POST"/);
  const server = src('artifacts/api-server/src/routes/tenancy.ts');
  assert.match(server, /router\.post\("\/campaigns\/:id\/open"/);
  assert.match(server, /if \(!hadAny && id !== PRIMARY_CAMPAIGN_ID\)/, 'first membership keeps primary access');
  for (const field of ['Candidate', 'Affiliated party', 'Seat', 'Area', 'Election date', 'Wards']) assert.ok(page.includes(`["${field}",`), field);
});

test('campaign switching works when Supabase has row-level security on shared tables', () => {
  const server = src('artifacts/api-server/src/routes/tenancy.ts');
  assert.match(server, /const campaigns = await runAsSystem\(\(\) => campaignsForUser\(req\.currentUser!\)\);/);
  const iso = src('artifacts/api-server/src/lib/tenant-isolation.ts');
  assert.match(iso, /CREATE POLICY kaiti_shared_access ON \$\{q\} FOR ALL TO \$\{TENANT_ROLE\} USING \(true\) WITH CHECK \(true\)/);
  assert.match(iso, /for \(const t of SHARED_TABLES\)/);
});

test('test campaigns can be deleted permanently, all or nothing, never the primary', () => {
  const server = src('artifacts/api-server/src/routes/tenancy.ts');
  assert.match(server, /router\.delete\("\/campaigns\/:id"/);
  assert.match(server, /id === PRIMARY_CAMPAIGN_ID\) \{ res\.status\(400\)/);
  assert.match(server, /req\.body\.confirmName\.trim\(\) !== c\.name\.trim\(\)/, 'exact name required');
  assert.match(server, /await db\.transaction\(async tx => \{\n      removed = await deleteCampaignsTx\(tx, \[id\]\);/);
  assert.match(src('artifacts/api-server/src/lib/campaign-delete.ts'), /WHERE owner_campaign_id IN \(\$\{list\}\)/);
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.match(page, /\{c\.id !== 1 && <button type="button" onClick=\{\(\) => deleteCampaign\(c\)\}/);
});

test('campaigns are shown by candidate, never by member count', () => {
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.doesNotMatch(page, /c\.memberCount\}/);
  assert.match(page, /\{c\.candidateName \|\| c\.name\}/);
  const layout = src('artifacts/commandcentre/src/components/layout.tsx');
  assert.match(layout, /c\.candidateName \? `\$\{c\.candidateName\} — \$\{c\.name\}` : c\.name/);
  assert.doesNotMatch(layout, /organisationName/);
  const dash = src('artifacts/commandcentre/src/pages/dashboard.tsx');
  assert.doesNotMatch(dash, /ACTIVE CAMPAIGNS/);
  assert.match(dash, /label: "POLLING CENTRES"/);
  assert.match(dash, /CANDIDATE<\/p>/);
});

test('My Area is a dashboard-level page backed by the campaign-scoped area API', () => {
  assert.match(src('artifacts/commandcentre/src/App.tsx'), /<Route path="\/my-area">\{\(\) => <Guarded module="dashboard" component=\{MyArea\} \/>\}<\/Route>/);
  const layout = src('artifacts/commandcentre/src/components/layout.tsx');
  assert.match(layout, /\{ href: "\/my-area", label: "My Area", icon: MapPin \}/);
  assert.match(layout, /"\/my-area": "dashboard"/);
  assert.match(src('artifacts/commandcentre/src/pages/my-area.tsx'), /api<Area>\("geography\/my-area"\)/);
  assert.match(src('artifacts/commandcentre/src/lib/tenancy.ts'), /export async function switchCampaign\(campaignId: number, page = "dashboard"\)/);
});

test('the demo can be ended: campaigns, data, sign-ins and sessions deleted, and it stays ended after restarts', () => {
  const demo = src('artifacts/api-server/src/lib/demo-aspirants.ts');
  assert.match(demo, /export async function endDemoAspirants/);
  assert.match(demo, /records = await deleteCampaignsTx\(tx, ids\);/);
  assert.match(demo, /DELETE FROM user_sessions WHERE sess->>'userId' = \$\{String\(u\.id\)\}/, 'signs demo users out');
  assert.match(demo, /DELETE FROM public\.kaiti_user_mfa WHERE user_id = \$\{u\.id\}/);
  assert.match(demo, /DELETE FROM admin_users WHERE notes = \$\{DEMO_NOTE\}/, 'only accounts the demo created');
  assert.match(demo, /if \(await demoEnded\(\)\) \{ logger\.info\("Demo aspirants were ended/, 'not re-created at restart');
  assert.match(demo, /await setDemoEnded\(false, by\);\n  await ensureDemoAspirants\(\);/, 'can be started again');
  const routes = src('artifacts/api-server/src/routes/tenancy.ts');
  for (const r of ['router.get("/demo"', 'router.post("/demo/end"', 'router.post("/demo/start"']) assert.ok(routes.includes(r), r);
  assert.match(src('artifacts/api-server/src/lib/campaign-delete.ts'), /const safe = ids\.filter\(id => Number\.isInteger\(id\) && id !== 1\);/, 'never the primary campaign');
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.match(page, /End demo and delete demo data/);
  assert.match(page, /typed\.trim\(\)\.toUpperCase\(\) !== "END DEMO"/);
  assert.match(page, /Start demo again/);
});
