import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceProvider, REVIEW_TASKS } from '../../artifacts/api-server/src/lib/evidence-review.ts';
test('document providers use fixed official endpoints and explicit credentials', () => {
  assert.equal(evidenceProvider({}).provider, 'none');
  assert.equal(evidenceProvider({ KENYA_EVIDENCE_PROVIDER: 'openclaw' }).provider, 'none');
  const groq = evidenceProvider({ KENYA_EVIDENCE_PROVIDER: 'groq', GROQ_API_KEY: 'test-only' });
  assert.equal(groq.baseURL, 'https://api.groq.com/openai/v1');
  assert.equal(groq.model, 'openai/gpt-oss-120b');
  assert.equal(groq.key, 'test-only');
  const gemini = evidenceProvider({ KENYA_EVIDENCE_PROVIDER: 'gemini', GEMINI_MODEL: 'account-model' });
  assert.equal(gemini.key, undefined);
  assert.equal(gemini.model, 'account-model');
  assert.match(gemini.baseURL, /^https:\/\/generativelanguage.googleapis.com/);
  assert.deepEqual(Object.keys(REVIEW_TASKS), ['analyst', 'swot', 'response']);
});
