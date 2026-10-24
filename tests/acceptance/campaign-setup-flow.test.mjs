import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('campaign setup has no separate add-organisation form; the campaign form still creates one when needed', () => {
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.doesNotMatch(page, /createOrg|New organisation, e\.g\./);
  assert.match(page, /api<Org>\("tenancy\/organisations", \{ method: "POST"/, 'typed organisation is created on save');
  assert.match(page, /new Map\(\(orgs\.data \?\? \[\]\)\.map\(o => \[o\.name\.trim\(\)\.toLowerCase\(\), o\]\)\)/, 'suggestions list each name once');
});

test('creating a campaign opens it on its My Area page', () => {
  const page = src('artifacts/commandcentre/src/pages/tenancy-admin.tsx');
  assert.match(page, /switchCampaign\(campaign\.id, "my-area"\)/);
  assert.match(src('artifacts/commandcentre/src/lib/tenancy.ts'), /export async function switchCampaign\(campaignId: number, page = "dashboard"\)/);
});

test('My Area is a dashboard-level page backed by the campaign-scoped area API', () => {
  assert.match(src('artifacts/commandcentre/src/App.tsx'), /<Route path="\/my-area">\{\(\) => <Guarded module="dashboard" component=\{MyArea\} \/>\}<\/Route>/);
  const layout = src('artifacts/commandcentre/src/components/layout.tsx');
  assert.match(layout, /\{ href: "\/my-area", label: "My Area", icon: MapPin \}/);
  assert.match(layout, /"\/my-area": "dashboard"/);
  const page = src('artifacts/commandcentre/src/pages/my-area.tsx');
  assert.match(page, /api<Area>\("geography\/my-area"\)/);
  assert.match(page, /profileSummary/);
});
