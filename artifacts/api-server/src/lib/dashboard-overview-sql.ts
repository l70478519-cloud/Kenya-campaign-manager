/** All operational tables are scoped by the request's campaign RLS context.
 * Stored timestamps are UTC; reporting periods follow Africa/Nairobi (UTC+3).
 */
export const DASHBOARD_OVERVIEW_SQL = `
WITH bounds AS (
  SELECT date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi') - interval '3 hours' AS month_start,
         date_trunc('week', now() AT TIME ZONE 'Africa/Nairobi') - interval '3 hours' AS week_start
), weeks AS (
  SELECT generate_series(week_start - interval '11 weeks', week_start, interval '1 week') AS start FROM bounds
)
SELECT
  (SELECT count(*)::int FROM members) AS "totalMembers",
  (SELECT count(*)::int FROM members, bounds WHERE created_at >= month_start) AS "newThisMonth",
  (SELECT count(*)::int FROM members, bounds WHERE created_at >= month_start - interval '1 month' AND created_at < month_start) AS "previousMonth",
  (SELECT count(*)::int FROM volunteers WHERE status = 'active') AS "activeVolunteers",
  ((SELECT count(*) FROM volunteer_tasks WHERE status NOT IN ('completed', 'cancelled')) +
   (SELECT count(*) FROM kaiti_operations WHERE kind = 'task' AND status NOT IN ('resolved', 'closed')))::int AS "openTasks",
  (SELECT coalesce(sum(recipient_count), 0)::int FROM message_campaigns, bounds WHERE sent_at >= month_start) AS "messagesThisMonth",
  (SELECT coalesce(json_agg(w ORDER BY w.date), '[]'::json) FROM (
    SELECT to_char(weeks.start + interval '3 hours', 'YYYY-MM-DD') AS date,
      (SELECT count(*)::int FROM members WHERE created_at >= weeks.start AND created_at < weeks.start + interval '1 week') AS members
    FROM weeks
  ) w) AS acquisition
`;
