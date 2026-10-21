CREATE TABLE IF NOT EXISTS social_source_health (
  id SERIAL PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'web_search',
  status TEXT NOT NULL DEFAULT 'unknown',
  last_attempt_at TIMESTAMP,
  last_success_at TIMESTAMP,
  last_item_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
