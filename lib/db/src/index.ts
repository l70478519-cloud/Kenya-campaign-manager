import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { TenantPool } from "./tenant";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new TenantPool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export { runWithCampaign, runAsSystem, campaignWards, campaignConstituencies, currentCampaignProfile, PRIMARY_WARDS, setTenantEnforcement, tenantEnforcementActive, TENANT_ROLE } from "./tenant";
export type { CampaignProfile } from "./tenant";
