CREATE TABLE IF NOT EXISTS message_deliveries (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES message_campaigns(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS message_deliveries_provider_message_id_unique
  ON message_deliveries(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_deliveries_campaign_status_idx
  ON message_deliveries(campaign_id, status);
