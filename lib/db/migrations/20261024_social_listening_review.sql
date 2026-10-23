-- Social listening classification, review and field reports (docs/SOCIAL_LISTENING_PLAN.md, SL-3).
-- Idempotent. The API applies the same changes at startup (seed.ts ensureSocialListeningColumns).
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS urgency text;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS confidence integer;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS classified_by text;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS review_status text;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS reviewed_at timestamp;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS ward text;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS reported_by text;
