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

test('every campaign opens on its seat area; the server adds admins as members when needed', () => {
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.match(page, /<button type="button" onClick=\{\(\) => openCampaign\(c\)\} className="text-left min-w-0/, 'clicking a campaign opens it');
  assert.match(page, /Details & members/);
  assert.match(page, /Couldn’t open “\$\{c\.candidateName \|\| c\.name\}”: \$\{\(e as Error\)\.message\}/, 'the real reason is shown');
  assert.match(page, /setOpen\(campaign\.id\); setJustCreated\(campaign\.id\);/);
  assert.match(page, /<h3 className="font-semibold text-sm pt-2">Add members<\/h3>/);
  assert.match(src('artifacts/commandcentre/src/lib/tenancy.ts'), /api\(`tenancy\/campaigns\/\$\{campaignId\}\/open`, \{ method: "POST"/);
  const server = src('artifacts/api-server/src/routes/tenancy.ts');
  assert.match(server, /router\.post\("\/campaigns\/:id\/open"/);
  assert.match(server, /if \(!hadAny && id !== PRIMARY_CAMPAIGN_ID\)/, 'first membership keeps primary access');
  assert.match(server, /req\.session\.activeCampaignId = id;/);
  for (const field of ['Candidate', 'Affiliated party', 'Seat', 'Area', 'Election date', 'Wards']) assert.ok(page.includes(`["${field}",`), field);
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
