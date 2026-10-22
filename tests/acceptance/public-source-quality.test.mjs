import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSourceUrl, PUBLIC_LISTENING_COVERAGE } from '../../artifacts/api-server/src/lib/public-source-quality.ts';
test('source links reject scripts, credentials, local hosts, malformed and overlong URLs', () => {
  for (const value of ['javascript:alert(1)', 'https://user:password@example.com', 'http://127.0.0.1', 'http://192.168.1.1', 'http://localhost', 'http://[::1]', 'not a url', null, 'https://example.com/' + 'x'.repeat(601)]) assert.equal(publicSourceUrl(value), null);
  assert.equal(publicSourceUrl('https://www.iebc.or.ke/resources/?stats#fragment'), 'https://www.iebc.or.ke/resources/?stats');
});
test('coverage explicitly separates news discovery from platform access and polling', () => {
  assert.match(PUBLIC_LISTENING_COVERAGE.coverage, /not comprehensive/);
  assert.match(PUBLIC_LISTENING_COVERAGE.sentimentMethod, /not representative/);
});
