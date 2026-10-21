-- Makueni Command Centre: controlled operational-data reset
-- IMPORTANT: take a Supabase backup/export before running.
-- Run in Supabase SQL Editor during a quiet period.
-- This script intentionally preserves admin_users, admin_roles, audit_logs,
-- system_config, voter_registry, polling_stations, IEBC credentials/sync logs,
-- all schema objects, and the static Makueni geography in source control.
-- It removes operational/demo activity only. Review the preview query first.
--
-- STEP 1 (preview only): uncomment and run this block separately.
-- SELECT 'members' AS table_name, count(*) AS rows_to_clear FROM public.members
-- UNION ALL SELECT 'volunteers', count(*) FROM public.volunteers
-- UNION ALL SELECT 'volunteer_assignments', count(*) FROM public.volunteer_assignments
-- UNION ALL SELECT 'segments', count(*) FROM public.segments
-- UNION ALL SELECT 'message_campaigns', count(*) FROM public.message_campaigns
-- UNION ALL SELECT 'messages', count(*) FROM public.messages
-- UNION ALL SELECT 'campaign_events', count(*) FROM public.campaign_events
-- UNION ALL SELECT 'canvass_visits', count(*) FROM public.canvass_visits
-- UNION ALL SELECT 'canvass_sessions', count(*) FROM public.canvass_sessions
-- UNION ALL SELECT 'surveys', count(*) FROM public.surveys
-- UNION ALL SELECT 'survey_responses', count(*) FROM public.survey_responses
-- UNION ALL SELECT 'opinion_polls', count(*) FROM public.opinion_polls
-- UNION ALL SELECT 'poll_votes', count(*) FROM public.poll_votes
-- UNION ALL SELECT 'topical_issues', count(*) FROM public.topical_issues
-- UNION ALL SELECT 'narrative_mentions', count(*) FROM public.narrative_mentions
-- UNION ALL SELECT 'war_room_briefs', count(*) FROM public.war_room_briefs
-- UNION ALL SELECT 'social_mentions', count(*) FROM public.social_mentions
-- UNION ALL SELECT 'kol', count(*) FROM public.kol
-- UNION ALL SELECT 'campaign milestones', count(*) FROM public.milestones
-- UNION ALL SELECT 'candidate_readiness', count(*) FROM public.candidate_readiness
-- UNION ALL SELECT 'campaign_settings', count(*) FROM public.campaign_settings
-- UNION ALL SELECT 'fundraising_campaigns', count(*) FROM public.fundraising_campaigns
-- UNION ALL SELECT 'donations', count(*) FROM public.donations
-- UNION ALL SELECT 'donors', count(*) FROM public.donors
-- UNION ALL SELECT 'pledges', count(*) FROM public.pledges
-- UNION ALL SELECT 'mpesa_transactions', count(*) FROM public.mpesa_transactions
-- UNION ALL SELECT 'tally_results', count(*) FROM public.tally_results
-- UNION ALL SELECT 'election_events_log', count(*) FROM public.election_events_log
-- UNION ALL SELECT 'turnout_assumptions', count(*) FROM public.turnout_assumptions
-- UNION ALL SELECT 'volunteer_tasks', count(*) FROM public.volunteer_tasks
-- UNION ALL SELECT 'volunteer_progress_logs', count(*) FROM public.volunteer_progress_logs
-- UNION ALL SELECT 'volunteer_issues', count(*) FROM public.volunteer_issues
-- UNION ALL SELECT 'generated_documents', count(*) FROM public.generated_documents
-- UNION ALL SELECT 'di_questions', count(*) FROM public.di_questions
-- UNION ALL SELECT 'di_briefings', count(*) FROM public.di_briefings
-- UNION ALL SELECT 'di_snapshots', count(*) FROM public.di_snapshots
-- UNION ALL SELECT 'di_changes', count(*) FROM public.di_changes
-- UNION ALL SELECT 'di_dataset_rows', count(*) FROM public.di_dataset_rows
-- UNION ALL SELECT 'strategist_messages', count(*) FROM public.strategist_messages
-- UNION ALL SELECT 'strategist_conversations', count(*) FROM public.strategist_conversations
-- UNION ALL SELECT 'research_sessions', count(*) FROM public.research_sessions
-- UNION ALL SELECT 'legislative_records', count(*) FROM public.legislative_records
-- UNION ALL SELECT 'achievements', count(*) FROM public.achievements;
--
-- STEP 2: after reviewing preview counts and confirming the backup, run the
-- transaction below. Missing optional tables are skipped; FK violations abort
-- the transaction rather than cascading into preserved tables.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $reset$
DECLARE
  t text;
  tables_to_clear text[] := ARRAY[
    -- Child/dependent activity first
    'volunteer_progress_logs',
    'volunteer_issues',
    'volunteer_assignments',
    'canvass_visits',
    'survey_responses',
    'poll_votes',
    'donations',
    'pledges',
    'mpesa_transactions',
    'tally_results',
    'election_events_log',
    'di_changes',
    'di_dataset_rows',
    'strategist_messages',
    'insight_responses',
    'insight_answers',
    'insight_share_events',
    'insight_ai_summaries',
    -- Operational records
    'messages',
    'message_campaigns',
    'canvass_sessions',
    'volunteer_tasks',
    'volunteers',
    'members',
    'segments',
    'campaign_events',
    'surveys',
    'opinion_polls',
    'topical_issues',
    'narrative_mentions',
    'narrative_responses',
    'narrative_scans',
    'platform_integrations',
    'competitors',
    'war_room_briefs',
    'social_mentions',
    'kol',
    'milestones',
    'candidate_readiness',
    'fundraising_campaigns',
    'donors',
    'insight_polls',
    'insight_questions',
    'di_questions',
    'di_briefings',
    'di_snapshots',
    'di_datasets',
    'turnout_assumptions',
    'generated_documents',
    'strategist_conversations',
    'research_sessions',
    'legislative_records',
    'achievements'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_clear LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I', t);
      RAISE NOTICE 'Cleared public.%', t;
    END IF;
  END LOOP;
END
$reset$;

-- Check these are still present before COMMIT. If any check fails, ROLLBACK.
DO $preserve$
BEGIN
  IF to_regclass('public.admin_users') IS NULL
     OR to_regclass('public.admin_roles') IS NULL
     OR to_regclass('public.system_config') IS NULL THEN
    RAISE EXCEPTION 'Required access/config tables are missing; abort reset';
  END IF;
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Audit log table is missing; abort reset';
  END IF;
END
$preserve$;

-- IMPORTANT: verify the NOTICE output and row counts, then COMMIT manually.
-- In Supabase SQL Editor, if you want to inspect before finalizing, replace
-- COMMIT with ROLLBACK on the first run. Run COMMIT only after verification.
ROLLBACK;
