import type { Request } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { runAsSystem, type CampaignProfile } from "@workspace/db";
import type { AdminUser } from "@workspace/db";

/**
 * Multi-campaign tenancy.
 *
 * Organisation → campaigns → members. Every signed-in request gets
 * req.campaignId, the campaign the user is working in. Batch 2 modules
 * (kaiti_records) and the command centre are scoped by it, so one campaign
 * never sees another's records.
 *
 * Campaign 1 is the primary (Kaiti) campaign and owns all data created before
 * tenancy existed. Older modules (members, messaging, field ops, …) still hold
 * only primary-campaign data until they are migrated, so the API hides them
 * outside the primary campaign rather than leak them (see LEGACY_PREFIXES).
 *
 * Membership rules:
 *  - super-admins can open every campaign;
 *  - users with memberships can open only those campaigns;
 *  - users with no memberships at all belong to the primary campaign
 *    (keeps every existing account working after upgrade).
 */

export const PRIMARY_CAMPAIGN_ID = 1;

/** Older routes. Hidden outside the primary campaign only if database isolation failed to start. */
export const LEGACY_PREFIXES = [
  "/dashboard", "/members", "/segments", "/messages", "/field-ops", "/volunteers", "/surveys", "/events",
  "/intelligence", "/campaign-plan", "/kol", "/fundraising", "/election-day", "/turnout", "/voter-registry",
  "/credentials", "/analytics", "/insights", "/ai", "/speeches", "/social", "/di", "/strategist", "/operations",
];

export const isSuperAdmin = (u: Pick<AdminUser, "role">) => u.role.toLowerCase().replace(/[^a-z0-9]/g, "") === "superadmin";

export type CampaignRow = { id: number; organisationId: number; organisationName: string; name: string; seat: string | null; area: string | null; electionDate: string | null; status: string; wards: string[]; constituency: string | null;
  candidateName: string | null; county: string | null; party: string | null; profileSummary: string | null };

export async function campaignsForUser(user: AdminUser): Promise<CampaignRow[]> {
  const base = sql`SELECT c.id::int, c.organisation_id::int AS "organisationId", o.name AS "organisationName", c.name, c.seat, c.area,
    c.election_date::text AS "electionDate", c.status, c.wards, c.constituency,
    c.candidate_name AS "candidateName", c.county, c.party, c.profile_summary AS "profileSummary" FROM public.kaiti_campaigns c JOIN public.kaiti_organisations o ON o.id = c.organisation_id`;
  if (isSuperAdmin(user) || user.id < 0) {
    return (await db.execute(sql`${base} WHERE c.status <> 'archived' ORDER BY c.id`)).rows as CampaignRow[];
  }
  const mine = (await db.execute(sql`${base} JOIN public.kaiti_campaign_members m ON m.campaign_id = c.id
    WHERE m.user_id = ${user.id} AND c.status <> 'archived' ORDER BY c.id`)).rows as CampaignRow[];
  if (mine.length) return mine;
  const anyMembership = await db.execute(sql`SELECT 1 FROM public.kaiti_campaign_members WHERE user_id = ${user.id} LIMIT 1`);
  if (anyMembership.rows.length) return []; // memberships only in archived campaigns
  return (await db.execute(sql`${base} WHERE c.id = ${PRIMARY_CAMPAIGN_ID}`)).rows as CampaignRow[];
}

/** Sets req.campaignId from the session, falling back to the first allowed campaign. */
const cache = new Map<number, { at: number; list: CampaignRow[] }>();
export function invalidateTenancyCache(userId?: number) { if (userId === undefined) cache.clear(); else cache.delete(userId); }

export async function resolveCampaign(req: Request): Promise<number | null> {
  const user = req.currentUser;
  if (!user) return null;
  let entry = cache.get(user.id);
  if (!entry || Date.now() - entry.at > 30_000) {
    entry = { at: Date.now(), list: await runAsSystem(() => campaignsForUser(user)) };
    cache.set(user.id, entry);
  }
  const allowed = entry.list;
  if (!allowed.length) return null;
  const wanted = req.session?.activeCampaignId;
  const chosen = allowed.find(c => c.id === wanted) ?? allowed[0];
  if (req.session && req.session.activeCampaignId !== chosen.id) req.session.activeCampaignId = chosen.id;
  req.campaignId = chosen.id;
  req.campaignWards = chosen.wards ?? [];
  req.campaignConstituency = chosen.constituency ?? null;
  req.campaignProfile = {
    name: chosen.name, candidateName: chosen.candidateName, seat: chosen.seat, constituency: chosen.constituency,
    county: chosen.county, party: chosen.party, electionDate: chosen.electionDate, profileSummary: chosen.profileSummary,
    // "isPrimary" = the built-in Kaiti content applies (only for a Kaiti campaign in this edition).
    isPrimary: (chosen.constituency ?? "").trim().toLowerCase() === "kaiti",
  };
  return chosen.id;
}

export type { CampaignProfile };
