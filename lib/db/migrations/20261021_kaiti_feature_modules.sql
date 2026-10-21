-- KaitiOS Batch 2: feature modules, history, export log, API failure log.
-- The API server also creates these idempotently at boot (ensureRecordsTables),
-- so running this file manually in Supabase is optional but recommended.
CREATE TABLE IF NOT EXISTS public.kaiti_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  ward text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS kaiti_records_module_status_idx ON public.kaiti_records(module, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS kaiti_records_module_ward_idx ON public.kaiti_records(module, ward) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.kaiti_record_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id bigint NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kaiti_record_history_record_idx ON public.kaiti_record_history(record_id, at DESC);

CREATE TABLE IF NOT EXISTS public.kaiti_export_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  include_sensitive boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kaiti_api_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  method text NOT NULL,
  path text NOT NULL,
  status integer NOT NULL,
  error text,
  actor text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kaiti_api_failures_at_idx ON public.kaiti_api_failures(at DESC);

-- Keep these tables out of Supabase's public REST API (server role only).
REVOKE ALL ON public.kaiti_records, public.kaiti_record_history, public.kaiti_export_log, public.kaiti_api_failures FROM anon, authenticated;
