-- Apply once in Supabase SQL Editor before enabling /api/operations.
-- No personal voter data is copied into these tables.
CREATE TABLE IF NOT EXISTS public.kaiti_operations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('approval','task','incident','resource')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 180),
  description text NOT NULL DEFAULT '',
  ward text CHECK (ward IS NULL OR ward IN ('Ukia','Kee','Kilungu','Ilima')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','pending','approved','rejected','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  assigned_to text,
  due_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  resource_key text,
  created_by text NOT NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_interval_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS kaiti_operations_kind_status_idx ON public.kaiti_operations(kind,status);
CREATE INDEX IF NOT EXISTS kaiti_operations_due_idx ON public.kaiti_operations(due_at);
CREATE INDEX IF NOT EXISTS kaiti_operations_resource_idx ON public.kaiti_operations(resource_key,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS public.kaiti_operation_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id bigint NOT NULL REFERENCES public.kaiti_operations(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  previous_status text,
  next_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kaiti_operation_history_record_idx ON public.kaiti_operation_history(operation_id,created_at);
-- DB access is through the authenticated backend; revoke direct browser roles.
REVOKE ALL ON public.kaiti_operations, public.kaiti_operation_history FROM anon, authenticated;
