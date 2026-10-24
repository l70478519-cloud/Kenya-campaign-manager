import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('campaign setup asks for the political party, not an organisation', () => {
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.doesNotMatch(page, /createOrg|New organisation, e\.g\.|Campaign organisation|label className="text-sm">Organisation/);
  assert.match(page, />Political party<input/);
  assert.match(page, /const partyName = np\.party\.trim\(\) \|\| "Independent";/, 'an empty party means Independent');
  // The party groups campaigns behind the scenes; it is created on first use and reused after.
  assert.match(page, /api<Org>\("tenancy\/organisations", \{ method: "POST", body: JSON\.stringify\(\{ name: partyName \}\) \}\)/);
  assert.match(page, /o\.id !== PRIMARY_ORG_ID && o\.name\.trim\(\)\.toLowerCase\(\) === partyName\.toLowerCase\(\)/);
  assert.match(page, /\.\.\.profilePayload\(\{ \.\.\.np, party: party\.name \}, true\)/, 'typed \"uda\" saves as the existing \"UDA\"');
});

test('after creating, the new campaign is shown filled in with Add members and an Open button', () => {
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.match(page, /setOpen\(campaign\.id\); setJustCreated\(campaign\.id\);/);
  assert.match(page, /scrollIntoView/);
  assert.match(page, /Add members below so they can sign in and open it\./);
  assert.match(page, /<h3 className="font-semibold text-sm pt-2">Add members<\/h3>/);
  assert.match(page, /switchCampaign\(c\.id, "my-area"\)/);
  for (const field of ['Candidate', 'Political party', 'Seat', 'Area', 'Election date', 'Wards']) assert.ok(page.includes(`["${field}",`), field);
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
