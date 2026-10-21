-- Voluntary contact registration, stored separately from political poll ballots.
-- No poll ID, option ID or vote reference is stored here.
CREATE TABLE IF NOT EXISTS public.poll_participant_registrations (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(16) NOT NULL UNIQUE,
  ward VARCHAR(120) NOT NULL,
  thank_you_sms_consent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poll_participant_registrations_created_idx ON public.poll_participant_registrations(created_at DESC);
