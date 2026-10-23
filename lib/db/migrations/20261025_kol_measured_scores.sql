-- Measured KOL scores, handles, stance history and mention links (docs/SOCIAL_LISTENING_PLAN.md, KOL-1).
-- Idempotent. The API runs the same statements at startup (seed.ts ensureKolTables).
-- Campaign isolation (owner_campaign_id, row-level security) is applied to these tables at startup too.

ALTER TABLE kol ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE kol ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE kol ADD COLUMN IF NOT EXISTS reach_estimate integer;
ALTER TABLE kol ADD COLUMN IF NOT EXISTS score_override integer;
ALTER TABLE kol ADD COLUMN IF NOT EXISTS override_reason text;
ALTER TABLE kol ADD COLUMN IF NOT EXISTS stance_updated_at timestamp;

CREATE TABLE IF NOT EXISTS kol_handles (
  id serial PRIMARY KEY,
  owner_campaign_id bigint NOT NULL DEFAULT COALESCE(NULLIF(current_setting('app.campaign_id', true), ''), '1')::bigint,
  kol_id integer NOT NULL,
  platform text NOT NULL,
  handle text NOT NULL,
  url text,
  followers integer,
  engagement_rate real,
  figures_as_of timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT kol_handles_kol_id_kol_id_fk FOREIGN KEY (kol_id) REFERENCES kol(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kol_stance_history (
  id serial PRIMARY KEY,
  owner_campaign_id bigint NOT NULL DEFAULT COALESCE(NULLIF(current_setting('app.campaign_id', true), ''), '1')::bigint,
  kol_id integer NOT NULL,
  stance text NOT NULL,
  previous_stance text,
  source text NOT NULL,
  note text,
  recorded_by text,
  recorded_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT kol_stance_history_kol_id_kol_id_fk FOREIGN KEY (kol_id) REFERENCES kol(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kol_mention_links (
  id serial PRIMARY KEY,
  owner_campaign_id bigint NOT NULL DEFAULT COALESCE(NULLIF(current_setting('app.campaign_id', true), ''), '1')::bigint,
  kol_id integer NOT NULL,
  mention_id integer NOT NULL,
  matched_on text NOT NULL,
  role text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT kol_mention_links_kol_id_kol_id_fk FOREIGN KEY (kol_id) REFERENCES kol(id) ON DELETE CASCADE,
  CONSTRAINT kol_mention_links_mention_id_social_mentions_id_fk FOREIGN KEY (mention_id) REFERENCES social_mentions(id) ON DELETE CASCADE,
  CONSTRAINT kol_mention_links_kol_mention_unique UNIQUE (kol_id, mention_id)
);
