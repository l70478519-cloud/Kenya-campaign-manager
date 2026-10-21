import { bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Campaign owning the row. Filled in by the database from the request's
 * campaign (app.campaign_id); rows written outside a campaign context belong
 * to the primary campaign (1). Row-level security uses this column to keep
 * campaigns apart, so application code never sets or filters it by hand.
 */
export const CAMPAIGN_ID_DEFAULT = sql`COALESCE(NULLIF(current_setting('app.campaign_id', true), ''), '1')::bigint`;
export const campaignIdColumn = () => bigint("owner_campaign_id", { mode: "number" }).notNull().default(CAMPAIGN_ID_DEFAULT);
