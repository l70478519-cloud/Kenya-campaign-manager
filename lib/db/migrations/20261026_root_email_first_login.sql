-- Root email sign-in with a temporary password that must be changed at first sign-in.
-- Idempotent. The API applies the same change at startup (seed.ts ensureAuthColumns).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
