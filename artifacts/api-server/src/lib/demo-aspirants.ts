import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { unitsForSeat } from "../data/kenya-electoral-units";
import { campaignArea, referenceStationRows } from "./polling-centres";
import { hashPassword } from "./auth";
import { logger } from "./logger";
import { deleteCampaignsTx, removeEmptyPartiesTx } from "./campaign-delete";

/**
 * Demo aspirants: one sign-in per seat level, each a member of its own
 * campaign only, with the read-only "candidate" role. Signing in as one shows
 * only that aspirant's county / constituency / ward and its polling centres.
 *
 * Off unless DEMO_ASPIRANTS_PASSWORD (16+ characters) is set in the hosting
 * environment. No password is ever shipped in code. Safe to run on every start:
 * existing campaigns, accounts and centres are reused. Remove the variable to
 * stop seeding. "End demo" (endDemoAspirants) deletes the demo campaigns, their
 * data and the demo sign-ins, and records that the demo has ended so a restart
 * does not bring it back; "Start demo again" (restartDemoAspirants) undoes that.
 */
export const DEMO_ORGANISATION = "Demo aspirants";
const DEMO_NOTE = "Demo aspirant account (DEMO_ASPIRANTS_PASSWORD)";
/** system_config key: "true" once an administrator has ended the demo. */
export const DEMO_ENDED_KEY = "demo.aspirants.ended";

async function demoEnded(): Promise<boolean> {
  const r = (await db.execute(sql`SELECT value FROM system_config WHERE key = ${DEMO_ENDED_KEY} LIMIT 1`)).rows[0] as { value: string } | undefined;
  return r?.value === "true";
}
async function setDemoEnded(ended: boolean, by: string): Promise<void> {
  await db.execute(sql`INSERT INTO system_config (key, value, category, description, updated_by, updated_at)
    VALUES (${DEMO_ENDED_KEY}, ${String(ended)}, 'demo', 'Demo aspirants ended by an administrator; not re-created at restart', ${by}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`);
}

export type DemoStatus = { configured: boolean; ended: boolean; accounts: string[]; campaigns: { id: number; name: string }[] };
export async function demoAspirantsStatus(): Promise<DemoStatus> {
  const accounts = ((await db.execute(sql`SELECT username FROM admin_users WHERE notes = ${DEMO_NOTE} ORDER BY username`)).rows as { username: string }[]).map(r => r.username);
  const campaigns = (await db.execute(sql`SELECT c.id::int, c.name FROM public.kaiti_campaigns c JOIN public.kaiti_organisations o ON o.id = c.organisation_id
    WHERE o.name = ${DEMO_ORGANISATION} ORDER BY c.id`)).rows as { id: number; name: string }[];
  return { configured: (process.env.DEMO_ASPIRANTS_PASSWORD ?? "").length >= 16, ended: await demoEnded(), accounts, campaigns };
}

/**
 * Ends the demo: deletes the demo campaigns and everything recorded in them, the
 * demo sign-ins (with their 2FA records and open sessions) and the demo group,
 * all in one transaction, then records that the demo has ended.
 */
export async function endDemoAspirants(by: string): Promise<{ campaigns: number; accounts: number; records: number }> {
  const status = await demoAspirantsStatus();
  const ids = status.campaigns.map(c => c.id);
  let records = 0, accounts = 0;
  await db.transaction(async tx => {
    records = await deleteCampaignsTx(tx, ids);
    const users = (await tx.execute(sql`SELECT id FROM admin_users WHERE notes = ${DEMO_NOTE}`)).rows as { id: number }[];
    for (const u of users) {
      await tx.execute(sql`DELETE FROM public.kaiti_campaign_members WHERE user_id = ${u.id}`);
      await tx.execute(sql`DELETE FROM public.kaiti_user_mfa WHERE user_id = ${u.id}`);
      await tx.execute(sql`DELETE FROM user_sessions WHERE sess->>'userId' = ${String(u.id)}`);
    }
    accounts = (await tx.execute(sql`DELETE FROM admin_users WHERE notes = ${DEMO_NOTE}`)).rowCount ?? 0;
    await tx.execute(sql`DELETE FROM public.kaiti_organisations WHERE name = ${DEMO_ORGANISATION} AND id <> 1`);
    await removeEmptyPartiesTx(tx);
  });
  await setDemoEnded(true, by);
  return { campaigns: ids.length, accounts, records };
}

/** Clears the "ended" mark and creates the demo again now (needs DEMO_ASPIRANTS_PASSWORD). */
export async function restartDemoAspirants(by: string): Promise<DemoStatus> {
  await setDemoEnded(false, by);
  await ensureDemoAspirants();
  return demoAspirantsStatus();
}

export const DEMO_ASPIRANTS = [
  { username: "demo.mca", name: "Demo MCA Aspirant", seat: "MCA", county: "Makueni", constituency: "Kaiti", ward: "Ukia" },
  { username: "demo.mp", name: "Demo MP Aspirant", seat: "MP", county: "Mombasa", constituency: "Changamwe", ward: null },
  { username: "demo.governor", name: "Demo Governor Aspirant", seat: "Governor", county: "Kisumu", constituency: null, ward: null },
] as const;

export async function ensureDemoAspirants(): Promise<void> {
  const password = process.env.DEMO_ASPIRANTS_PASSWORD ?? "";
  if (!password) return;
  if (password.length < 16) { logger.warn("DEMO_ASPIRANTS_PASSWORD must be at least 16 characters; demo aspirants not created"); return; }
  try {
    if (await demoEnded()) { logger.info("Demo aspirants were ended by an administrator; not re-created"); return; }
    const org = (await db.execute(sql`SELECT id::int FROM public.kaiti_organisations WHERE name = ${DEMO_ORGANISATION} ORDER BY id LIMIT 1`)).rows[0] as { id: number } | undefined
      ?? (await db.execute(sql`INSERT INTO public.kaiti_organisations (name) VALUES (${DEMO_ORGANISATION}) RETURNING id::int`)).rows[0] as { id: number };
    const passwordHash = await hashPassword(password);

    for (const d of DEMO_ASPIRANTS) {
      const u = unitsForSeat(d.seat, { county: d.county, constituency: d.constituency, ward: d.ward });
      if (!u.ok) { logger.warn({ demo: d.username, error: u.error }, "Demo aspirant area is invalid; skipped"); continue; }
      const campaignName = `${d.name} — ${u.areaName}`;
      const area = [u.constituency, u.county ? `${u.county} County` : null].filter(Boolean).join(", ") || "Kenya";

      const campaign = (await db.execute(sql`SELECT id::int FROM public.kaiti_campaigns WHERE organisation_id = ${org.id} AND name = ${campaignName} LIMIT 1`)).rows[0] as { id: number } | undefined
        ?? (await db.execute(sql`INSERT INTO public.kaiti_campaigns (organisation_id, name, seat, area, status, county, constituency, candidate_name, wards)
          VALUES (${org.id}, ${campaignName}, ${d.seat}, ${area}, 'active', ${u.county}, ${u.areaName}, ${d.name},
            ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(u.units)}::jsonb))) RETURNING id::int`)).rows[0] as { id: number };

      const email = `${d.username.replace(/\./g, "-")}@demo.invalid`;
      const existing = (await db.execute(sql`SELECT id, notes FROM admin_users WHERE username = ${d.username} OR email = ${email} LIMIT 1`)).rows[0] as { id: number; notes: string | null } | undefined;
      let userId: number;
      if (!existing) {
        userId = ((await db.execute(sql`INSERT INTO admin_users (name, email, username, password_hash, role, status, invited_by, notes)
          VALUES (${d.name}, ${email}, ${d.username}, ${passwordHash}, 'candidate', 'active', 'system', ${DEMO_NOTE}) RETURNING id`)).rows[0] as { id: number }).id;
      } else if (existing.notes === DEMO_NOTE) {
        // Our own demo account: keep its password in step with the variable.
        await db.execute(sql`UPDATE admin_users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${existing.id}`);
        userId = existing.id;
      } else {
        logger.warn({ username: d.username }, "A non-demo account already uses this demo username; demo aspirant skipped");
        continue;
      }
      await db.execute(sql`INSERT INTO public.kaiti_campaign_members (campaign_id, user_id, added_by) VALUES (${campaign.id}, ${userId}, 'system')
        ON CONFLICT (campaign_id, user_id) DO NOTHING`);

      const rows = referenceStationRows(campaignArea({ seat: d.seat, county: u.county, constituency: u.areaName, area, wards: u.units }))
        .map(r => ({ code: r.code, name: r.name, ward: r.ward, notes: `IEBC register reference centre (${r.constituency}). Import the official IEBC list for the station code, registered voters and streams.` }));
      await db.execute(sql`INSERT INTO polling_stations (owner_campaign_id, code, name, ward, registered_voters, stream_count, status, notes)
        SELECT ${campaign.id}, r.code, r.name, r.ward, 0, 1, 'pending', r.notes
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(code text, name text, ward text, notes text)
        WHERE NOT EXISTS (SELECT 1 FROM polling_stations p WHERE p.owner_campaign_id = ${campaign.id} AND p.code = r.code)`);
      logger.info({ username: d.username, campaign: campaignName, centres: rows.length }, "Demo aspirant ready");
    }
  } catch (err) {
    // A demo must never stop the platform starting.
    logger.error({ err }, "Demo aspirant setup failed");
  }
}
