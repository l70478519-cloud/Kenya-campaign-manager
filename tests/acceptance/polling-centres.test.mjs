import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-resolve.mjs';

const units = await import('../../artifacts/api-server/src/data/kenya-electoral-units.ts');
const { POLLING_CENTRES, POLLING_CENTRE_SOURCE } = await import('../../artifacts/api-server/src/data/kenya-polling-centres.ts');
const { campaignArea, referenceStationRows, referenceCode, centresFor, REFERENCE_CODE_PREFIX } = await import('../../artifacts/api-server/src/lib/polling-centres.ts');
const evidence = await import('../../artifacts/api-server/src/lib/kenya-evidence.ts');
const { KENYA_COUNTIES, LEGACY_WARD_NAMES, resolveWards, unitsForSeat, findCounty, findConstituency, nameKey } = units;
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** A campaign as tenancy stores it after choosing a seat and area. */
function campaignFor(seat, area) {
  const u = unitsForSeat(seat, area);
  assert.equal(u.ok, true, `${seat} ${JSON.stringify(area)}`);
  return { seat, county: u.county, constituency: u.areaName, wards: u.units,
    area: [u.constituency, u.county ? `${u.county} County` : null].filter(Boolean).join(', ') || 'Kenya' };
}

test('IEBC register corrections keep 47 / 290 / 1,450 and every old name resolves to a real ward', () => {
  const ks = KENYA_COUNTIES.flatMap(c => c.constituencies);
  assert.equal(ks.length, 290);
  assert.equal(ks.flatMap(k => k.wards).length, 1450);
  for (const [county, entries] of Object.entries(LEGACY_WARD_NAMES)) {
    const c = findCounty(county);
    assert.ok(c, county);
    for (const [old, constituency, current] of entries) {
      assert.ok(findConstituency(c, constituency).wards.includes(current), `${county}/${constituency}/${current}`);
      assert.deepEqual(resolveWards(old, { county, constituency }).map(r => r.ward), [current], old);
    }
  }
  assert.equal(findConstituency(findCounty('Homa Bay'), 'Mbita').name, 'Suba North');
  assert.equal(findConstituency(findCounty('Homa Bay'), 'Suba').name, 'Suba South');
  assert.equal(findCounty('Nairobi City').name, 'Nairobi');
  assert.deepEqual(unitsForSeat('MCA', { county: 'Wajir', constituency: 'Wajir West', ward: 'Wagalla' }).units, ['Ganyure/Wagalla']);
  // Makueni keeps its CIDP spellings (the primary campaign depends on them).
  assert.deepEqual(findConstituency(findCounty('Makueni'), 'Kaiti').wards, ['Ukia', 'Kee', 'Kilungu', 'Ilima']);
});

test('polling-centre data covers exactly the canonical tree, every ward, with no duplicates', () => {
  let total = 0;
  assert.deepEqual(Object.keys(POLLING_CENTRES).sort(), KENYA_COUNTIES.map(c => c.name).sort());
  for (const c of KENYA_COUNTIES) {
    assert.deepEqual(Object.keys(POLLING_CENTRES[c.name]).sort(), c.constituencies.map(k => k.name).sort(), c.name);
    for (const k of c.constituencies) {
      assert.deepEqual(Object.keys(POLLING_CENTRES[c.name][k.name]).sort(), [...k.wards].sort(), `${c.name}/${k.name}`);
      for (const w of k.wards) {
        const list = POLLING_CENTRES[c.name][k.name][w];
        assert.ok(list.length > 0, `${c.name}/${k.name}/${w} has no centres`);
        assert.equal(new Set(list.map(nameKey)).size, list.length, `${w} has duplicate centres`);
        total += list.length;
      }
    }
  }
  assert.equal(total, POLLING_CENTRE_SOURCE.centres);
  assert.equal(total, 24593);
  assert.equal(POLLING_CENTRE_SOURCE.commit, '183a54d19befae26a027291f8e2438d1c28e2ed7');
});

test('reference codes are stable, unique nationwide and never look like IEBC codes', () => {
  const codes = new Set();
  for (const c of KENYA_COUNTIES) for (const k of c.constituencies) for (const w of k.wards)
    for (const centre of centresFor({ county: c.name, countyCode: c.code, constituency: k.name, ward: w })) {
      assert.ok(centre.code.startsWith(`${REFERENCE_CODE_PREFIX}${c.code}-`));
      codes.add(centre.code);
    }
  assert.equal(codes.size, 24593);
  const ref = { county: 'Makueni', countyCode: '017', constituency: 'Kaiti', ward: 'Ukia' };
  assert.equal(referenceCode(ref, 'Mukuyuni Primary School'), referenceCode(ref, '  mukuyuni primary school '));
});

test('an aspirant sees only their own area, for every seat type', () => {
  const kaitiAll = new Set(['Ukia', 'Kee', 'Kilungu', 'Ilima']);

  const mca = campaignArea(campaignFor('MCA', { county: 'Makueni', constituency: 'Kaiti', ward: 'Ukia' }));
  assert.equal(mca.scope, 'ward');
  assert.deepEqual(mca.wards.map(w => w.ward), ['Ukia']);
  assert.deepEqual(mca.wards[0].centres.map(c => c.name), POLLING_CENTRES.Makueni.Kaiti.Ukia);
  assert.equal(mca.counties.length, 0);

  const mp = campaignArea(campaignFor('MP', { county: 'Makueni', constituency: 'Kaiti' }));
  assert.equal(mp.scope, 'constituency');
  assert.deepEqual(new Set(mp.wards.map(w => w.ward)), kaitiAll);
  assert.ok(mp.wards.every(w => w.county === 'Makueni' && w.constituency === 'Kaiti'));

  const gov = campaignArea(campaignFor('Governor', { county: 'Kisumu' }));
  assert.equal(gov.scope, 'county');
  assert.equal(gov.wards.length, 35);
  assert.ok(referenceStationRows(gov).every(r => r.code.startsWith('KCM-042-')), 'only Kisumu centres');
  assert.deepEqual(gov.unmatched, []);

  // Same-named wards: resolved by the campaign's constituency, flagged when the whole county is in scope.
  const thika = campaignArea(campaignFor('MCA', { county: 'Kiambu', constituency: 'Thika Town', ward: 'Township' }));
  assert.deepEqual(thika.wards.map(w => w.constituency), ['Thika Town']);
  assert.equal(thika.ambiguous.length, 0);
  const nakuru = campaignArea(campaignFor('Governor', { county: 'Nakuru' }));
  assert.deepEqual(nakuru.ambiguous.map(a => a.ward), ['Biashara']);

  // President: national per-county totals, never 24,000 centre rows.
  const pres = campaignArea(campaignFor('President', {}));
  assert.equal(pres.scope, 'national');
  assert.equal(pres.counties.length, 47);
  assert.equal(pres.wards.length, 0);
  assert.equal(pres.totals.centres, 24593);

  // Ward names that match nothing are reported, not guessed.
  const custom = campaignArea({ seat: 'MP', county: 'Makueni', constituency: 'Kaiti', wards: ['Ukia', 'Makueni North'] });
  assert.deepEqual(custom.unmatched, ['Makueni North']);
});

test('a campaign created with an old ward name still loads that ward\'s centres', () => {
  const old = campaignArea({ seat: 'MCA', county: 'Wajir', constituency: 'Sannan Ward', area: 'Tarbaj, Wajir County', wards: ['Sannan'] });
  assert.equal(old.wards.length, 1);
  assert.equal(old.wards[0].ward, 'Sannan', 'rows keep the campaign\'s stored name');
  assert.equal(old.wards[0].officialWard, 'Sarman');
  assert.equal(old.wards[0].via, 'legacy-name');
  assert.ok(old.wards[0].centres.length > 0);
});

test('API: my-area is scoped and readable by candidates; loading centres is election-day write and per-campaign', () => {
  assert.match(src('artifacts/api-server/src/middlewares/access-control.ts'), /\["\/geography", "dashboard"\]/);
  assert.match(src('artifacts/api-server/src/routes/index.ts'), /router\.use\("\/geography", geographyRouter\)/);
  const geo = src('artifacts/api-server/src/routes/geography.ts');
  assert.match(geo, /campaignArea\(\{[^)]*wards: campaignWards\(\)/);
  assert.doesNotMatch(geo, /KENYA_COUNTIES/);
  const ed = src('artifacts/api-server/src/routes/election-day.ts');
  assert.match(ed, /router\.post\("\/stations\/load-reference"/);
  assert.match(ed, /scope === "national"[\s\S]{0,80}status\(400\)/);
  assert.match(ed, /like\(pollingStationsTable\.code, `\$\{REFERENCE_CODE_PREFIX\}%`\)/);
  // Read-only roles may ask the assistant; only that one POST is relaxed.
  const ac = src('artifacts/api-server/src/middlewares/access-control.ts');
  assert.match(ac, /const readOnlyPost = method === "POST" && path === "\/ai\/assist";/);
  assert.equal((ac.match(/readOnlyPost/g) ?? []).length, 2);
});

test('demo aspirants are opt-in, never ship a password and get the read-only candidate role', () => {
  const demo = src('artifacts/api-server/src/lib/demo-aspirants.ts');
  assert.match(demo, /DEMO_ASPIRANTS_PASSWORD/);
  assert.match(demo, /password\.length < 16/);
  assert.match(demo, /'candidate'/);
  assert.match(demo, /@demo\.invalid/);
  assert.match(src('artifacts/api-server/src/lib/seed.ts'), /await ensureDemoAspirants\(\)/);
});

test('national development framework reaches the AI, labelled as unreviewed and without progress claims', () => {
  const ctx = evidence.evidenceContext({ county: 'Kisumu' }, 'jobs for youth and kilimo');
  assert.match(ctx, /NATIONAL DEVELOPMENT FRAMEWORK \(orientation summaries, not page-reviewed/);
  assert.match(ctx, /Bottom-Up Economic Transformation Agenda/);
  assert.match(ctx, /\[v2030-economic\]/, 'kilimo/jobs select the economic pillar');
  assert.match(ctx, /Kisumu CIDP 2023-2027 is NOT loaded/);
  assert.match(evidence.evidenceContext({ county: 'Makueni' }), /County plan loaded for Makueni/);
  for (const item of evidence.NATIONAL_FRAMEWORK) {
    assert.ok(!evidence.KENYA_FACTS.some(f => f.id === item.id), 'framework items are never reviewed facts');
    if (/\d+%/.test(item.text)) assert.match(item.text, /target, not an achievement/);
  }
  assert.ok(evidence.evidenceBundle({ county: 'Turkana' }).nationalFramework.items.length >= 5);
});
