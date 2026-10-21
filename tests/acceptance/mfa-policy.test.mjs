import test from 'node:test';
import assert from 'node:assert/strict';
import { roleRequiresMfa } from '../../artifacts/api-server/src/lib/mfa-policy.ts';

test('password-only sign-in is allowed by default and with an empty policy', () => {
  const original = process.env.MFA_REQUIRED_ROLES;
  try {
    delete process.env.MFA_REQUIRED_ROLES;
    assert.equal(roleRequiresMfa('super-admin'), false);
    process.env.MFA_REQUIRED_ROLES = '';
    assert.equal(roleRequiresMfa('super-admin'), false);
  } finally {
    if (original === undefined) delete process.env.MFA_REQUIRED_ROLES;
    else process.env.MFA_REQUIRED_ROLES = original;
  }
});

test('explicit role policies can still enforce two-factor enrolment', () => {
  const original = process.env.MFA_REQUIRED_ROLES;
  try {
    process.env.MFA_REQUIRED_ROLES = 'super-admin, Finance Officer';
    assert.equal(roleRequiresMfa('SUPER_ADMIN'), true);
    assert.equal(roleRequiresMfa('finance-officer'), true);
    assert.equal(roleRequiresMfa('viewer'), false);
    process.env.MFA_REQUIRED_ROLES = 'all';
    assert.equal(roleRequiresMfa('viewer'), true);
  } finally {
    if (original === undefined) delete process.env.MFA_REQUIRED_ROLES;
    else process.env.MFA_REQUIRED_ROLES = original;
  }
});
