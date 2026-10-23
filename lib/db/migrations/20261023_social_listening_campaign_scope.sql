-- Social listening, campaign scope (docs/SOCIAL_LISTENING_PLAN.md, SL-1).
-- Idempotent. The API applies the same changes at startup (seed.ts, tenant-isolation.ts);
-- this file records them for databases maintained by hand.

-- Link-check result per mention.
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS link_status text;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS link_checked_at timestamp;

-- Source status per campaign instead of one shared row per source.
ALTER TABLE social_source_health ADD COLUMN IF NOT EXISTS owner_campaign_id bigint NOT NULL
  DEFAULT COALESCE(NULLIF(current_setting('app.campaign_id', true), ''), '1')::bigint;
ALTER TABLE social_source_health DROP CONSTRAINT IF EXISTS social_source_health_source_key_key;
DROP INDEX IF EXISTS social_source_health_source_key_unique;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_source_health_campaign_source_key_unique') THEN
    ALTER TABLE social_source_health ADD CONSTRAINT social_source_health_campaign_source_key_unique UNIQUE (owner_campaign_id, source_key);
  END IF;
END $$;
