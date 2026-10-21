import { db, runAsSystem, setTenantEnforcement, TENANT_ROLE } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { unitsForSeat } from "../data/kenya-electoral-units";

/**
 * Turns on database-enforced campaign isolation (Batch 4).
 *
 * Every table in the public schema is campaign-owned EXCEPT the shared ones
 * listed below. For each campaign-owned table this makes sure there is a
 * owner_campaign_id column (existing rows → primary campaign 1; named so it never clashes with the fundraising/message campaign_id columns), an index, row-level
 * security, and a policy limiting the `kaiti_app` role to the current
 * campaign. Requests switch to that role (see lib/db/src/tenant.ts), so every
 * module is isolated, including tables added later, which are scoped on the
 * next restart.
 *
 * Safe to run on every boot. If any step fails, isolation stays OFF and the
 * API keeps hiding older modules outside the primary campaign, exactly as in
 * Batch 3, so a failure can never expose one campaign's data to another.
 */

const SHARED_TABLES = new Set([
  "admin_users", "admin_roles", "audit_logs", "system_config", "social_source_health", "user_sessions",
  "kaiti_organisations", "kaiti_campaigns", "kaiti_campaign_members", "kaiti_user_mfa",
  "kaiti_api_failures", "kaiti_export_log", "kaiti_demo_requests",
]);

/** Unique keys that must become unique per campaign: [table, column, old constraint, new constraint]. */
const PER_CAMPAIGN_UNIQUES: [string, string, string, string][] = [
  ["campaign_settings", "key", "campaign_settings_key_unique", "campaign_settings_campaign_key_unique"],
  ["polling_stations", "code", "polling_stations_code_unique", "polling_stations_campaign_code_unique"],
  ["turnout_assumptions", "ward", "turnout_assumptions_ward_unique", "turnout_assumptions_campaign_ward_unique"],
  ["platform_integrations", "platform", "platform_integrations_platform_unique", "platform_integrations_campaign_platform_unique"],
  ["poll_participant_registrations", "phone", "poll_participant_registrations_phone_key", "poll_participant_registrations_campaign_phone_unique"],
];

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const DEFAULT_EXPR = `COALESCE(NULLIF(current_setting('app.campaign_id', true), ''), '1')::bigint`;
const POLICY_EXPR = `owner_campaign_id = NULLIF(current_setting('app.campaign_id', true), '')::bigint`;


/** Campaign geography + AI profile columns (Batches 4–5). Must succeed even if isolation can't start. */
export async function ensureCampaignColumns(): Promise<void> {
  await runAsSystem(async () => {
      // Per-campaign wards (Batch 4).
    await db.execute(sql.raw(`ALTER TABLE public.kaiti_campaigns ADD COLUMN IF NOT EXISTS wards text[] NOT NULL DEFAULT '{}'`));
    await db.execute(sql.raw(`ALTER TABLE public.kaiti_campaigns ADD COLUMN IF NOT EXISTS constituency text`));
    // Batch 5: campaign profile used by every AI feature.
    for (const col of ["candidate_name", "county", "party", "profile_summary"]) {
      await db.execute(sql.raw(`ALTER TABLE public.kaiti_campaigns ADD COLUMN IF NOT EXISTS ${col} text`));
    }
    // First-run setup from Render variables, e.g. PRIMARY_SEAT=MP PRIMARY_COUNTY=Makueni PRIMARY_CONSTITUENCY=Kaiti.
    const seat = process.env.PRIMARY_SEAT?.trim();
    if (seat) {
      const u = unitsForSeat(seat, { county: process.env.PRIMARY_COUNTY, constituency: process.env.PRIMARY_CONSTITUENCY, ward: process.env.PRIMARY_WARD });
      if (u.ok) {
        await db.execute(sql`UPDATE public.kaiti_campaigns SET seat=${seat}, wards=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(u.units)}::jsonb)),
          constituency=${u.areaName}, county=${u.county}, candidate_name=COALESCE(candidate_name, ${process.env.PRIMARY_CANDIDATE?.trim() || null})
          WHERE id = 1 AND cardinality(wards) = 0`);
      } else logger.warn({ seat, error: u.error }, "PRIMARY_SEAT settings are incomplete; set up the campaign in Organisations & campaigns");
    }

  });
}

export type IsolationStatus = { active: boolean; scopedTables: string[]; error: string | null; checkedAt: string };
let status: IsolationStatus = { active: false, scopedTables: [], error: "Not started", checkedAt: new Date().toISOString() };
export const isolationStatus = () => status;

export async function ensureTenantIsolation(): Promise<IsolationStatus> {
  return runAsSystem(async () => {
    try {
      if (process.env.TENANT_ISOLATION === "off") throw new Error("Disabled by TENANT_ISOLATION=off");

      // 1. Low-privilege role that can never bypass row-level security.
      await db.execute(sql.raw(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TENANT_ROLE}') THEN
          CREATE ROLE ${TENANT_ROLE} NOLOGIN NOBYPASSRLS NOINHERIT;
        END IF;
      END $$`));
      await db.execute(sql.raw(`DO $$ BEGIN EXECUTE format('GRANT ${TENANT_ROLE} TO %I', current_user); END $$`));

      // 2. Find campaign-owned tables.
      const tables = (await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows
        .map(r => (r as { tablename: string }).tablename)
        .filter(t => !SHARED_TABLES.has(t) && !t.startsWith("_") && !t.startsWith("drizzle"));

      // 3. Column, index, RLS and policy per table.
      for (const t of tables) {
        const q = `public.${ident(t)}`;
        await db.execute(sql.raw(`ALTER TABLE ${q} ADD COLUMN IF NOT EXISTS owner_campaign_id bigint NOT NULL DEFAULT 1`));
        await db.execute(sql.raw(`ALTER TABLE ${q} ALTER COLUMN owner_campaign_id SET DEFAULT ${DEFAULT_EXPR}`));
        await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS ${ident(`${t}_owner_campaign_idx`.slice(0, 63))} ON ${q} (owner_campaign_id)`));
        await db.execute(sql.raw(`ALTER TABLE ${q} ENABLE ROW LEVEL SECURITY`));
        await db.execute(sql.raw(`DROP POLICY IF EXISTS kaiti_campaign_isolation ON ${q}`));
        await db.execute(sql.raw(`CREATE POLICY kaiti_campaign_isolation ON ${q} FOR ALL TO ${TENANT_ROLE} USING (${POLICY_EXPR}) WITH CHECK (${POLICY_EXPR})`));
      }

      // 4. Keys that are unique within a campaign, not across the platform.
      for (const [table, col, oldName, newName] of PER_CAMPAIGN_UNIQUES) {
        if (!tables.includes(table)) continue;
        await db.execute(sql.raw(`ALTER TABLE public.${ident(table)} DROP CONSTRAINT IF EXISTS ${ident(oldName)}`));
        await db.execute(sql.raw(`DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${newName}') THEN
            ALTER TABLE public.${ident(table)} ADD CONSTRAINT ${ident(newName)} UNIQUE (owner_campaign_id, ${ident(col)});
          END IF;
        END $$`));
      }

      // 5. Privileges for the request role (data only, no DDL).
      await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${TENANT_ROLE}`));
      await db.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${TENANT_ROLE}`));
      await db.execute(sql.raw(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${TENANT_ROLE}`));
      await db.execute(sql.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${TENANT_ROLE}`));
      await db.execute(sql.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${TENANT_ROLE}`));

      // 6. Prove it works before switching it on: as the request role with no
      //    campaign set, a scoped table must return nothing.
      const probe = tables.includes("members") ? "members" : tables[0];
      if (probe) {
        const r = await db.transaction(async tx => {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${TENANT_ROLE}`));
          await tx.execute(sql.raw(`SELECT set_config('app.campaign_id', '', true)`));
          return tx.execute(sql.raw(`SELECT count(*)::int AS n FROM public.${ident(probe)}`));
        });
        const n = (r.rows[0] as { n: number }).n;
        if (n !== 0) throw new Error(`Isolation self-test failed: ${n} rows visible without a campaign in ${probe}`);
      }

      setTenantEnforcement(true);
      status = { active: true, scopedTables: tables, error: null, checkedAt: new Date().toISOString() };
      logger.info({ tables: tables.length }, "Campaign isolation active");
    } catch (err) {
      setTenantEnforcement(false);
      status = { active: false, scopedTables: [], error: err instanceof Error ? err.message : String(err), checkedAt: new Date().toISOString() };
      logger.error({ err }, "Campaign isolation could not be enabled; older modules stay limited to the primary campaign");
    }
    return status;
  });
}
