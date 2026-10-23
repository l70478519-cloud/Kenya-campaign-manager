import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newPasswordProblem, MIN_PASSWORD_LENGTH } from '../../artifacts/api-server/src/lib/password-policy.ts';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('a chosen password must be long enough, new, and not the email or username', () => {
  const ids = ['client@example.com', 'root'];
  assert.match(newPasswordProblem('short', 'TempPass-1234', ids), /at least 12/);
  assert.equal(MIN_PASSWORD_LENGTH, 12);
  assert.match(newPasswordProblem('TempPass-1234', 'TempPass-1234', ids), /different/);
  assert.match(newPasswordProblem('Client@Example.com', 'TempPass-1234', ids), /email or username/);
  assert.match(newPasswordProblem('x'.repeat(201), 'TempPass-1234', ids), /at most/);
  assert.equal(newPasswordProblem('green mangoes at dawn', 'TempPass-1234', ids), null);
  assert.equal(newPasswordProblem('green mangoes at dawn', 'TempPass-1234', [null, undefined]), null);
});

test('two-factor sign-in stays off by default in deployment', () => {
  assert.match(read('render.yaml'), /key: MFA_REQUIRED_ROLES\s+value: ""/);
  assert.match(read('.env.example'), /^MFA_REQUIRED_ROLES=$/m);
});

test('the root email and admin-issued passwords are temporary', () => {
  const schema = read('lib/db/src/schema/admin.ts');
  assert.match(schema, /mustChangePassword: boolean\("must_change_password"\)\.notNull\(\)\.default\(false\)/);
  const seed = read('artifacts/api-server/src/lib/seed.ts');
  assert.match(seed, /ADD COLUMN IF NOT EXISTS "must_change_password"/);
  assert.match(seed, /notes: "Bootstrap super administrator",[\s\S]{0,200}mustChangePassword: true/);
  const admin = read('artifacts/api-server/src/routes/admin.ts');
  assert.equal((admin.match(/mustChangePassword: true/g) ?? []).length, 2, 'create user and reset password');
});

test('the server blocks everything but /auth until the temporary password is replaced', () => {
  const gate = read('artifacts/api-server/src/middlewares/access-control.ts');
  const pw = gate.indexOf('req.session.passwordChangeRequired && !path.startsWith("/auth/")');
  assert.ok(pw > 0, 'password-change gate exists');
  assert.ok(pw < gate.indexOf('resolveCampaign(req)'), 'gate runs before any campaign data');
  assert.match(gate, /path\.startsWith\("\/auth\/account\/"\)/);

  const auth = read('artifacts/api-server/src/routes/auth.ts');
  // Login, 2FA verify and /me all set the flag from the database.
  assert.equal((auth.match(/req\.session\.passwordChangeRequired = user\.mustChangePassword === true/g) ?? []).length, 3);
  assert.match(auth, /router\.post\("\/account\/password"[\s\S]*?verifyPassword\(currentPassword[\s\S]*?mustChangePassword: false/);
  assert.match(auth, /router\.post\("\/account\/email"[\s\S]*?verifyPassword\(currentPassword[\s\S]*?status\(409\)/);
});
