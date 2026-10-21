import test from 'node:test';
import assert from 'node:assert/strict';
import { KENYA_COUNTIES, unitsForSeat } from '../../artifacts/api-server/src/data/kenya-electoral-units.ts';

test('national directory has 47 counties, 290 constituencies and 1450 wards', () => {
  const constituencies = KENYA_COUNTIES.flatMap(c => c.constituencies);
  assert.equal(KENYA_COUNTIES.length, 47);
  assert.equal(constituencies.length, 290);
  assert.equal(constituencies.flatMap(c => c.wards).length, 1450);
  assert.equal(new Set(KENYA_COUNTIES.map(c => c.code)).size, 47);
});

test('six seat types resolve to the appropriate operational areas', () => {
  const area = { county: 'Makueni', constituency: 'Kaiti', ward: 'Ukia' };
  for (const [seat, count] of [['President',47],['Governor',30],['Senator',30],['Woman Rep',30],['MP',4],['MCA',1]]) {
    const result = unitsForSeat(seat, area);
    assert.equal(result.ok, true, seat);
    assert.equal(result.units.length, count, seat);
  }
});

test('invalid county or a ward outside the constituency is rejected', () => {
  assert.equal(unitsForSeat('Governor', { county: 'Invalid county' }).ok, false);
  assert.equal(unitsForSeat('MCA', { county: 'Makueni', constituency: 'Kaiti', ward: 'Wote' }).ok, false);
});
