import { db, adminUsersTable, adminRolesTable, systemConfigTable, runAsSystem } from "@workspace/db";
import { ensureTenantIsolation, ensureCampaignColumns } from "./tenant-isolation";
import { ensureDemoRequestsTable } from "../routes/public-site";
import { eq, and, sql } from "drizzle-orm";
import { hashPassword } from "./auth";
import { TENANCY_MFA_SQL } from "./tenancy-sql";
import { KOL_MIGRATION_SQL } from "./kol-sql";
import { ensureDemoAspirants } from "./demo-aspirants";

let seeded = false;

// connect-pg-simple's `createTableIfMissing` reads its bundled `table.sql`
// relative to __dirname, which does not exist after esbuild bundles the server
// into dist/. So we create the session table ourselves with explicit DDL.
// The auth columns are added to admin_users via Drizzle in dev, but production
// uses autoscale without migration files. This idempotent DDL guarantees the
// columns exist at boot so login/seeding never crash on a not-yet-migrated prod DB.
export async function ensureAuthColumns(): Promise<void> {
  await db.execute(sql`ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "username" text`);
  await db.execute(sql`ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "password_hash" text`);
  await db.execute(sql`ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_username_unique" ON "admin_users" ("username")`);
}

// Social listening mention columns: link checks (SL-1.5), classification, review and field reports (SL-3).
export async function ensureSocialListeningColumns(): Promise<void> {
  await db.execute(sql`ALTER TABLE "social_mentions" ADD COLUMN IF NOT EXISTS "link_status" text`);
  await db.execute(sql`ALTER TABLE "social_mentions" ADD COLUMN IF NOT EXISTS "link_checked_at" timestamp`);
  // Classification, review and field reports (SL-3).
  for (const col of ["language", "urgency", "classified_by", "review_status", "reviewed_by", "channel", "ward", "reported_by"]) {
    await db.execute(sql.raw(`ALTER TABLE "social_mentions" ADD COLUMN IF NOT EXISTS "${col}" text`));
  }
  await db.execute(sql`ALTER TABLE "social_mentions" ADD COLUMN IF NOT EXISTS "confidence" integer`);
  await db.execute(sql`ALTER TABLE "social_mentions" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp`);
}

// Measured KOL scores (KOL-1). Runs the statements of migrations/20261025_kol_measured_scores.sql
// (copied into lib/kol-sql.ts; a test checks the two are identical).
export async function ensureKolTables(): Promise<void> {
  for (const statement of splitSqlStatements(KOL_MIGRATION_SQL)) await db.execute(sql.raw(statement));
}

/** Splits a migration file into statements (these files have no semicolons inside strings or comments). */
export function splitSqlStatements(file: string): string[] {
  return file.split(/;\s*(?:\r?\n|$)/).map(s => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
}

// Idempotent DDL for the turnout-prediction assumptions table. Production is
// autoscale with no Drizzle migration files, so we self-heal at boot (same
// pattern as the auth columns) to keep dev push and prod in sync.
export async function ensureTurnoutTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "turnout_assumptions" (
      "id" serial PRIMARY KEY,
      "ward" text NOT NULL UNIQUE,
      "expected_turnout_rate" integer NOT NULL DEFAULT 65,
      "mule_support_share" integer NOT NULL DEFAULT 50,
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
}

export async function ensureMpesaTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "mpesa_transactions" (
      "id" serial PRIMARY KEY,
      "checkout_request_id" text NOT NULL UNIQUE,
      "merchant_request_id" text,
      "phone" text NOT NULL,
      "amount" integer NOT NULL,
      "account_reference" text,
      "donor_name" text,
      "campaign_id" integer REFERENCES "fundraising_campaigns"("id") ON DELETE SET NULL,
      "ward" text,
      "status" text NOT NULL DEFAULT 'pending',
      "result_code" integer,
      "result_desc" text,
      "mpesa_receipt" text,
      "donation_id" integer REFERENCES "donations"("id") ON DELETE SET NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
}

export async function ensureGeneratedDocsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "generated_documents" (
      "id" serial PRIMARY KEY,
      "doc_type" text NOT NULL,
      "title" text NOT NULL,
      "occasion" text,
      "audience" text,
      "ward" text,
      "language" text NOT NULL DEFAULT 'English',
      "tone" text,
      "body" text NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);
}

// Idempotent DDL for the ACL AI DI OS decision-intelligence tables. Production
// is autoscale with no Drizzle migration files, so we self-heal at boot (same
// pattern as the turnout/mpesa tables) to keep dev push and prod in sync.
export async function ensureDiTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "di_questions" (
      "id" serial PRIMARY KEY,
      "question" text NOT NULL,
      "status" text NOT NULL DEFAULT 'answered',
      "intent" text,
      "intent_label" text,
      "chart_type" text,
      "chart_data" jsonb NOT NULL DEFAULT '[]',
      "chart_meta" jsonb NOT NULL DEFAULT '{}',
      "explanation" text,
      "message" text,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "di_briefings" (
      "id" serial PRIMARY KEY,
      "title" text NOT NULL,
      "sections" jsonb NOT NULL DEFAULT '[]',
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "di_snapshots" (
      "id" serial PRIMARY KEY,
      "metrics" jsonb NOT NULL DEFAULT '{}',
      "no_new_data" boolean NOT NULL DEFAULT false,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "di_changes" (
      "id" serial PRIMARY KEY,
      "snapshot_id" integer NOT NULL,
      "metric" text NOT NULL,
      "label" text NOT NULL,
      "previous" integer NOT NULL DEFAULT 0,
      "current" integer NOT NULL DEFAULT 0,
      "delta" integer NOT NULL DEFAULT 0,
      "severity" text NOT NULL DEFAULT 'low',
      "explanation" text NOT NULL DEFAULT '',
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "di_datasets" (
      "id" serial PRIMARY KEY,
      "name" text NOT NULL,
      "sector" text NOT NULL DEFAULT 'General',
      "description" text,
      "source_type" text NOT NULL DEFAULT 'upload',
      "columns" jsonb NOT NULL DEFAULT '[]',
      "row_count" integer NOT NULL DEFAULT 0,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "di_dataset_rows" (
      "id" serial PRIMARY KEY,
      "dataset_id" integer NOT NULL,
      "row" jsonb NOT NULL DEFAULT '{}'
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_di_dataset_rows_dataset" ON "di_dataset_rows" ("dataset_id")`);
  await db.execute(sql`ALTER TABLE "di_questions" ADD COLUMN IF NOT EXISTS "dataset_id" integer`);
  await db.execute(sql`ALTER TABLE "di_briefings" ADD COLUMN IF NOT EXISTS "dataset_id" integer`);
  await db.execute(sql`ALTER TABLE "di_snapshots" ADD COLUMN IF NOT EXISTS "dataset_id" integer`);
  await db.execute(sql`ALTER TABLE "di_changes" ADD COLUMN IF NOT EXISTS "dataset_id" integer`);
  const builtin = await db.execute(sql`SELECT id FROM "di_datasets" WHERE "source_type" = 'builtin' LIMIT 1`);
  let builtinId: number;
  if (builtin.rows.length === 0) {
    const inserted = await db.execute(sql`
      INSERT INTO "di_datasets" ("name", "sector", "description", "source_type")
      VALUES ('Campaign data', 'Politics & Campaigns', 'Built-in live campaign telemetry: voters, polls, canvassing, fundraising, volunteers and social listening for this campaign.', 'builtin')
      RETURNING id
    `);
    builtinId = (inserted.rows[0] as { id: number }).id;
  } else {
    builtinId = (builtin.rows[0] as { id: number }).id;
  }
  await db.execute(sql`UPDATE "di_questions" SET "dataset_id" = ${builtinId} WHERE "dataset_id" IS NULL`);
  await db.execute(sql`UPDATE "di_briefings" SET "dataset_id" = ${builtinId} WHERE "dataset_id" IS NULL`);
  await db.execute(sql`UPDATE "di_snapshots" SET "dataset_id" = ${builtinId} WHERE "dataset_id" IS NULL`);
  await db.execute(sql`UPDATE "di_changes" SET "dataset_id" = ${builtinId} WHERE "dataset_id" IS NULL`);
}

export async function ensureStrategistTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "strategist_conversations" (
      "id" serial PRIMARY KEY,
      "title" text NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "strategist_messages" (
      "id" serial PRIMARY KEY,
      "conversation_id" integer NOT NULL,
      "role" text NOT NULL,
      "content" text NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_strategist_messages_conversation" ON "strategist_messages" ("conversation_id")`);
}

export async function ensureSessionTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire")`);
}

const MODULES = [
  "dashboard", "voters", "constituents", "segmentation", "messaging", "field-ops",
  "volunteers", "intelligence", "events", "narrative", "campaign-plan", "kol",
  "finance", "election-day", "credentials", "admin",
];

export async function seedDefaultRoles(): Promise<void> {
  // Seed missing system roles on existing databases without overwriting
  // administrator-customized permissions or role metadata.
  const defaultRoles = [
    {
      name: "super-admin", description: "Full system access — reserved for campaign director", color: "#DB143C", isSystem: true,
      permissions: Object.fromEntries(MODULES.map(m => [m, "write"])),
    },
    {
      name: "campaign-manager", description: "Full operational access, no system config", color: "#f97316", isSystem: true,
      permissions: Object.fromEntries(MODULES.filter(m => m !== "admin").map(m => [m, "write"]).concat([["admin", "none"]])),
    },
    {
      name: "manager", description: "Operational coordination across campaign modules; no user administration", color: "#f97316", isSystem: true,
      permissions: Object.fromEntries(MODULES.filter(m => m !== "admin").map(m => [m, "write"]).concat([["admin", "none"]])),
    },
    {
      name: "coordinator", description: "Coordinate assigned field, event, volunteer and reporting operations", color: "#0ea5e9", isSystem: true,
      permissions: { dashboard: "read", voters: "read", constituents: "read", segmentation: "read", messaging: "none", "field-ops": "write", volunteers: "write", intelligence: "read", events: "write", narrative: "none", "campaign-plan": "read", kol: "none", finance: "none", "election-day": "write", credentials: "none", admin: "none" },
    },
    {
      name: "analyst", description: "Read-only reporting and operational analysis", color: "#8b5cf6", isSystem: true,
      permissions: Object.fromEntries(MODULES.filter(m => m !== "admin").map(m => [m, "read"]).concat([["admin", "none"]])),
    },
    {
      name: "candidate", description: "Read-only overview and approved reports", color: "#DB143C", isSystem: true,
      permissions: { dashboard: "read", voters: "none", constituents: "read", segmentation: "none", messaging: "none", "field-ops": "read", volunteers: "read", intelligence: "read", events: "read", narrative: "read", "campaign-plan": "read", kol: "read", finance: "read", "election-day": "read", credentials: "none", admin: "none" },
    },
    {
      name: "officer", description: "Field and election-day reporting", color: "#22c55e", isSystem: true,
      permissions: { dashboard: "read", voters: "read", constituents: "read", segmentation: "none", messaging: "none", "field-ops": "write", volunteers: "write", intelligence: "read", events: "read", narrative: "none", "campaign-plan": "read", kol: "none", finance: "none", "election-day": "write", credentials: "none", admin: "none" },
    },
    {
      name: "field-officer", description: "Field operations, volunteers, surveys", color: "#22c55e", isSystem: true,
      permissions: { dashboard: "read", voters: "read", constituents: "read", segmentation: "none", messaging: "none", "field-ops": "write", volunteers: "write", intelligence: "write", events: "write", narrative: "none", "campaign-plan": "read", kol: "none", finance: "none", "election-day": "write", credentials: "read", admin: "none" },
    },
    {
      name: "communications-officer", description: "Messaging, narrative, KOL, and media", color: "#a855f7", isSystem: true,
      permissions: { dashboard: "read", voters: "read", constituents: "read", segmentation: "read", messaging: "write", "field-ops": "none", volunteers: "none", intelligence: "read", events: "read", narrative: "write", "campaign-plan": "read", kol: "write", finance: "none", "election-day": "none", credentials: "write", admin: "none" },
    },
    {
      name: "finance-officer", description: "Finance ops and fundraising only", color: "#eab308", isSystem: true,
      permissions: { dashboard: "read", voters: "none", constituents: "none", segmentation: "none", messaging: "none", "field-ops": "none", volunteers: "none", intelligence: "none", events: "none", narrative: "none", "campaign-plan": "read", kol: "none", finance: "write", "election-day": "none", credentials: "none", admin: "none" },
    },
    {
      name: "viewer", description: "Read-only access across all modules", color: "#6b7280", isSystem: false,
      permissions: Object.fromEntries(MODULES.filter(m => m !== "admin").map(m => [m, "read"]).concat([["admin", "none"]])),
    },
  ];

  for (const role of defaultRoles) {
    await db.insert(adminRolesTable).values(role).onConflictDoNothing();
  }
}

export async function seedDefaultConfig(): Promise<void> {
  // Campaign identity is set per campaign in Organisations & campaigns (no built-in defaults).


  const existing = await db.select().from(systemConfigTable).limit(1);
  if (existing.length > 0) return;

  const defaults = [
    { key: "candidate.name", value: "", category: "campaign", description: "Candidate's full name displayed across the system" },
    { key: "candidate.title", value: "", category: "campaign", description: "Candidate's title and county label" },
    { key: "candidate.party", value: "", category: "campaign", description: "Political party affiliation" },
    { key: "campaign.election_date", value: "2027-08-10", category: "campaign", description: "Target election date (YYYY-MM-DD)" },
    { key: "campaign.slogan", value: "", category: "campaign", description: "Campaign slogan displayed on reports and exports" },
    { key: "campaign.headquarters", value: "", category: "campaign", description: "Campaign HQ address" },
    { key: "campaign.contact_email", value: "", category: "campaign", description: "Primary campaign contact email" },
    { key: "campaign.contact_phone", value: "", category: "campaign", description: "Primary campaign contact phone" },
    { key: "security.session_timeout_hours", value: "24", category: "security", description: "How long a session remains active (hours)" },
    { key: "security.require_2fa", value: "false", category: "security", description: "Require two-factor authentication for all users" },
    { key: "security.allow_invite_only", value: "true", category: "security", description: "Restrict sign-up to invited users only" },
    { key: "security.audit_retention_days", value: "365", category: "security", description: "How many days to retain audit log entries" },
    { key: "notifications.sms_enabled", value: "false", category: "notifications", description: "Enable SMS notifications for field alerts" },
    { key: "notifications.email_enabled", value: "false", category: "notifications", description: "Enable email notifications" },
    { key: "notifications.alert_threshold_days", value: "7", category: "notifications", description: "Days before deadline to trigger alerts" },
    { key: "general.timezone", value: "Africa/Nairobi", category: "general", description: "System timezone for dates and reports" },
    { key: "general.date_format", value: "DD/MM/YYYY", category: "general", description: "Date display format across the system" },
    { key: "general.currency", value: "KES", category: "general", description: "Default currency for financial figures" },
    { key: "general.language", value: "en-KE", category: "general", description: "System language locale" },
    { key: "integrations.openai_enabled", value: "false", category: "integrations", description: "OpenAI AI features enabled (requires OPENAI_API_KEY env var)", isSecret: false },
    { key: "integrations.sms_gateway_url", value: "", category: "integrations", description: "SMS gateway webhook URL", isSecret: false },
    { key: "integrations.sms_api_key", value: "", category: "integrations", description: "SMS gateway API key", isSecret: true },
  ];

  for (const item of defaults) {
    await db.insert(systemConfigTable).values({ ...item, isSecret: item.isSecret ?? false }).onConflictDoNothing();
  }
}

// Bootstrap the initial super-admin so the system is never locked out.
// Bootstrap credentials must be explicitly configured in the hosting environment.
// Never ship a public, hard-coded administrator password.
const BOOTSTRAP_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
const BOOTSTRAP_USERNAME = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim() ?? "";
const BOOTSTRAP_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";

export async function ensureBootstrapAdmin(): Promise<void> {
  if (!BOOTSTRAP_EMAIL || !BOOTSTRAP_USERNAME || BOOTSTRAP_PASSWORD.length < 16) {
    // Existing administrator accounts continue to work; don't create or reset a
    // predictable bootstrap account when secure credentials aren't configured.
    return;
  }

  const [existing] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, BOOTSTRAP_EMAIL))
    .limit(1);

  const passwordHash = await hashPassword(BOOTSTRAP_PASSWORD);

  if (!existing) {
    await db.insert(adminUsersTable).values({
      name: "Campaign Director",
      email: BOOTSTRAP_EMAIL,
      username: BOOTSTRAP_USERNAME,
      passwordHash,
      role: "super-admin",
      status: "active",
      invitedBy: "system",
      notes: "Bootstrap super administrator",
      // The root email's setup password is temporary: the client chooses their own at first sign-in.
      mustChangePassword: true,
    }).onConflictDoNothing();
    return;
  }

  // Backfill credentials for a pre-existing demo record that predates auth.
  if (!existing.passwordHash || !existing.username) {
    await db.update(adminUsersTable).set({
      username: existing.username ?? BOOTSTRAP_USERNAME,
      passwordHash: existing.passwordHash ?? passwordHash,
      ...(existing.passwordHash ? {} : { mustChangePassword: true }),
      role: "super-admin",
      status: "active",
      updatedAt: new Date(),
    }).where(eq(adminUsersTable.id, existing.id));
  }

  // Do not silently reactivate disabled administrator accounts. Recovery must
  // be performed deliberately by an authorized administrator or operator.
}


// Batch 2 feature modules (see lib/db/migrations/20261021_kaiti_feature_modules.sql).
export async function ensureRecordsTables(): Promise<void> {
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS public.kaiti_records (
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
)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS kaiti_records_module_status_idx ON public.kaiti_records(module, status) WHERE deleted_at IS NULL`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS kaiti_records_module_ward_idx ON public.kaiti_records(module, ward) WHERE deleted_at IS NULL`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS public.kaiti_record_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id bigint NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS kaiti_record_history_record_idx ON public.kaiti_record_history(record_id, at DESC)`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS public.kaiti_export_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  include_sensitive boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now()
)`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS public.kaiti_api_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  method text NOT NULL,
  path text NOT NULL,
  status integer NOT NULL,
  error text,
  actor text,
  at timestamptz NOT NULL DEFAULT now()
)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS kaiti_api_failures_at_idx ON public.kaiti_api_failures(at DESC)`));
  try {
    await db.execute(sql.raw(`REVOKE ALL ON public.kaiti_records, public.kaiti_record_history, public.kaiti_export_log, public.kaiti_api_failures FROM anon, authenticated`));
  } catch { /* roles only exist on Supabase */ }
}


// Batch 3: tenancy + 2FA (see lib/db/migrations/20261021_kaiti_tenancy_mfa.sql).
export async function ensureTenancyAndMfaTables(): Promise<void> {
  const file = TENANCY_MFA_SQL;
  for (const stmt of file) await db.execute(sql.raw(stmt));
  const org = process.env.PRIMARY_ORGANISATION_NAME?.trim();
  const camp = process.env.PRIMARY_CAMPAIGN_NAME?.trim();
  if (org) await db.execute(sql`UPDATE public.kaiti_organisations SET name=${org} WHERE id=1 AND name='Primary organisation'`);
  if (camp) await db.execute(sql`UPDATE public.kaiti_campaigns SET name=${camp} WHERE id=1 AND name='Our campaign'`);
  try {
    await db.execute(sql.raw(`REVOKE ALL ON public.kaiti_organisations, public.kaiti_campaigns, public.kaiti_campaign_members, public.kaiti_user_mfa FROM anon, authenticated`));
  } catch { /* roles only exist on Supabase */ }
}

export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  // Schema work needs owner privileges even when triggered inside a request.
  return runAsSystem(ensureSeededAsOwner);
}

async function ensureSeededAsOwner(): Promise<void> {
  if (seeded) return;
  await ensureAuthColumns();
  await ensureSessionTable();
  await ensureTurnoutTable();
  await ensureGeneratedDocsTable();
  await ensureMpesaTable();
  await ensureDiTables();
  await ensureStrategistTables();
  await ensureRecordsTables();
  await ensureTenancyAndMfaTables();
  await ensureCampaignColumns();
  await ensureDemoRequestsTable();
  await ensureSocialListeningColumns();
  await ensureKolTables();
  await seedDefaultRoles();
  await seedDefaultConfig();
  await ensureBootstrapAdmin();
  await ensureTenantIsolation();
  await ensureDemoAspirants();
  seeded = true;
}
