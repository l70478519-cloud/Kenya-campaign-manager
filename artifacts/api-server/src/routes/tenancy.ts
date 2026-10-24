import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { campaignsForUser, invalidateTenancyCache, isSuperAdmin, PRIMARY_CAMPAIGN_ID } from "../lib/tenancy";
import { tenantEnforcementActive, runAsSystem } from "@workspace/db";
import { isolationStatus } from "../lib/tenant-isolation";
import { deleteCampaignsTx, removeEmptyPartiesTx } from "../lib/campaign-delete";
import { demoAspirantsStatus, endDemoAspirants, restartDemoAspirants } from "../lib/demo-aspirants";
import { KENYA_COUNTIES, KENYA_SEATS, KENYA_TOTALS, SEAT_KEYS, unitsForSeat } from "../data/kenya-electoral-units";

/**
 * /tenancy/context and /tenancy/switch: any signed-in user.
 * Everything else: admin (enforced by the access-control middleware).
 */
const router = Router();
const actor = (req: { currentUser?: { email: string } }) => req.currentUser?.email ?? "unknown";

async function log(actorEmail: string, action: string, details: string) {
  try {
    await db.execute(sql`INSERT INTO audit_logs (user_email, user_name, action, module, details, severity)
      VALUES (${actorEmail}, ${actorEmail}, ${action}, 'tenancy', ${details}, 'info')`);
  } catch { /* non-critical */ }
}

router.get("/context", async (req, res) => {
  const campaigns = await runAsSystem(() => campaignsForUser(req.currentUser!));
  res.json({ activeCampaignId: req.campaignId ?? null, primaryCampaignId: PRIMARY_CAMPAIGN_ID, campaigns,
    allModulesIsolated: tenantEnforcementActive() });
});

router.post("/switch", async (req, res) => {
  const id = Number(req.body?.campaignId);
  // Membership is checked on the shared tables with owner access: inside a campaign the
  // restricted role can be hidden from them (e.g. Supabase row-level security), which
  // wrongly refused even super-admins.
  const campaigns = await runAsSystem(() => campaignsForUser(req.currentUser!));
  if (!campaigns.some(c => c.id === id)) { res.status(403).json({ error: "You aren’t a member of that campaign." }); return; }
  req.session.activeCampaignId = id;
  res.json({ activeCampaignId: id });
});

// ── Administration ───────────────────────────────────────────────────────────
// These endpoints manage organisation-wide records; accessControl has already
// checked admin permissions. Do not restrict their queries to the active campaign.
router.use((_req, _res, next) => runAsSystem(() => next()));

router.get("/isolation", (_req, res) => { res.json(isolationStatus()); });

/** Kenya's six elective seats and the full county → constituency → ward tree. */
router.get("/geography", (_req, res) => {
  res.json({ seats: KENYA_SEATS, totals: KENYA_TOTALS, counties: KENYA_COUNTIES });
});

// ── Demo aspirants (DEMO_ASPIRANTS_PASSWORD) ─────────────────────────────────
router.get("/demo", async (_req, res) => { res.json(await demoAspirantsStatus()); });

/** Ends the demo: deletes demo campaigns, their data and the demo sign-ins; a restart won't recreate them. */
router.post("/demo/end", async (req, res) => {
  try {
    const r = await endDemoAspirants(actor(req));
    invalidateTenancyCache();
    await log(actor(req), "Ended demo aspirants", `${r.campaigns} campaigns, ${r.accounts} sign-ins, ${r.records} records deleted`);
    res.json({ ok: true, ...r });
  } catch (err) {
    req.log?.error({ err }, "Ending the demo failed");
    res.status(409).json({ error: `The demo could not be ended, and nothing was removed: ${(err as Error).message}` });
  }
});

/** Creates the demo again now. Needs DEMO_ASPIRANTS_PASSWORD (16+ characters) on the server. */
router.post("/demo/start", async (req, res) => {
  if ((process.env.DEMO_ASPIRANTS_PASSWORD ?? "").length < 16) {
    res.status(400).json({ error: "Set DEMO_ASPIRANTS_PASSWORD (16+ characters) in the hosting environment and restart before starting the demo." }); return;
  }
  const status = await restartDemoAspirants(actor(req));
  invalidateTenancyCache();
  await log(actor(req), "Started demo aspirants", status.accounts.join(", "));
  res.json(status);
});

router.get("/organisations", async (_req, res) => {
  const r = await db.execute(sql`SELECT o.id::int, o.name, o.created_at AS "createdAt",
    (SELECT count(*)::int FROM public.kaiti_campaigns c WHERE c.organisation_id = o.id) AS "campaignCount"
    FROM public.kaiti_organisations o ORDER BY o.id`);
  res.json(r.rows);
});

router.post("/organisations", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (name.length < 2 || name.length > 160) { res.status(400).json({ error: "Organisation name must be 2–160 characters." }); return; }
  const r = await db.execute(sql`INSERT INTO public.kaiti_organisations (name) VALUES (${name}) RETURNING id::int, name`);
  await log(actor(req), "Created organisation", name);
  res.status(201).json(r.rows[0]);
});

const campaignSchema = z.object({
  organisationId: z.number().int().positive(),
  name: z.string().trim().min(2).max(160),
  seat: z.enum(SEAT_KEYS as [string, ...string[]]).nullable().optional(),
  // Electoral area for the seat; the server derives the wards and labels from it.
  areaCounty: z.string().trim().max(80).nullable().optional(),
  areaConstituency: z.string().trim().max(120).nullable().optional(),
  areaWard: z.string().trim().max(120).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  electionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  constituency: z.string().trim().min(2).max(80).nullable().optional(),
  county: z.string().trim().max(80).nullable().optional(),
  candidateName: z.string().trim().max(160).nullable().optional(),
  party: z.string().trim().max(120).nullable().optional(),
  profileSummary: z.string().trim().max(4000).nullable().optional(),
  wards: z.array(z.string().trim().min(2).max(60)).min(1).max(60)
    .refine(w => new Set(w.map(x => x.toLowerCase())).size === w.length, "Ward names must be unique").optional(),
}).strict();

router.get("/campaigns", async (_req, res) => {
  const r = await db.execute(sql`SELECT c.id::int, c.organisation_id::int AS "organisationId", o.name AS "organisationName", c.name, c.seat, c.area,
    c.election_date::text AS "electionDate", c.status, c.wards, c.constituency, c.county,
    c.candidate_name AS "candidateName", c.party, c.profile_summary AS "profileSummary",
    (SELECT count(*)::int FROM public.kaiti_campaign_members m WHERE m.campaign_id = c.id) AS "memberCount"
    FROM public.kaiti_campaigns c JOIN public.kaiti_organisations o ON o.id = c.organisation_id ORDER BY c.id`);
  res.json(r.rows);
});

router.post("/campaigns", async (req, res) => {
  const p = campaignSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.issues[0]?.message ?? "Invalid campaign" }); return; }
  const v = { ...p.data };
  // Seat-driven setup: President, Governor, Senator, Woman Rep, MP or MCA plus its area.
  if (v.seat && !v.wards?.length) {
    const u = unitsForSeat(v.seat, { county: v.areaCounty, constituency: v.areaConstituency, ward: v.areaWard });
    if (!u.ok) { res.status(400).json({ error: u.error }); return; }
    v.wards = u.units; v.constituency = v.constituency ?? u.areaName; v.county = v.county ?? u.county;
    v.area = v.area ?? ([u.constituency, u.county ? `${u.county} County` : null].filter(Boolean).join(", ") || "Kenya");
  }
  if (!v.wards?.length) { res.status(400).json({ error: "Choose the seat and its electoral area, or list the campaign’s wards." }); return; }
  const r = await db.execute(sql`INSERT INTO public.kaiti_campaigns (organisation_id, name, seat, area, election_date, status, county, candidate_name, party, profile_summary, constituency, wards)
    VALUES (${v.organisationId}, ${v.name}, ${v.seat ?? null}, ${v.area ?? null}, ${v.electionDate ?? null}, ${v.status ?? "active"},
      ${v.county ?? null}, ${v.candidateName ?? null}, ${v.party ?? null}, ${v.profileSummary ?? null},
      ${v.constituency ?? null}, ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(v.wards)}::jsonb)))
    RETURNING id::int, name`);
  invalidateTenancyCache();
  await log(actor(req), "Created campaign", v.name);
  res.status(201).json(r.rows[0]);
});

router.patch("/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);
  const p = campaignSchema.partial().safeParse(req.body);
  if (!p.success || !Number.isInteger(id)) { res.status(400).json({ error: "Invalid campaign" }); return; }
  const v = { ...p.data };
  // Changing the seat or its area re-derives the wards unless wards are given explicitly.
  if ((v.areaCounty || v.areaConstituency || v.areaWard || v.seat === "President") && v.seat && !v.wards?.length) {
    const u = unitsForSeat(v.seat, { county: v.areaCounty, constituency: v.areaConstituency, ward: v.areaWard });
    if (!u.ok) { res.status(400).json({ error: u.error }); return; }
    v.wards = u.units; v.constituency = u.areaName; v.county = u.county;
  }
  if (id === PRIMARY_CAMPAIGN_ID && v.status === "archived") { res.status(400).json({ error: "The primary campaign can’t be archived." }); return; }
  const r = await db.execute(sql`UPDATE public.kaiti_campaigns SET
      name = COALESCE(${v.name ?? null}, name), seat = COALESCE(${v.seat ?? null}, seat), area = COALESCE(${v.area ?? null}, area),
      election_date = COALESCE(${v.electionDate ?? null}::date, election_date), status = COALESCE(${v.status ?? null}, status),
      constituency = COALESCE(${v.constituency ?? null}, constituency), county = COALESCE(${v.county ?? null}, county),
      candidate_name = COALESCE(${v.candidateName ?? null}, candidate_name), party = COALESCE(${v.party ?? null}, party),
      profile_summary = COALESCE(${v.profileSummary ?? null}, profile_summary), wards = CASE WHEN ${v.wards ? JSON.stringify(v.wards) : null}::jsonb IS NULL THEN wards
        ELSE ARRAY(SELECT jsonb_array_elements_text(${v.wards ? JSON.stringify(v.wards) : null}::jsonb)) END
    WHERE id = ${id} RETURNING id::int`);
  if (!r.rows.length) { res.status(404).json({ error: "Campaign not found" }); return; }
  invalidateTenancyCache();
  await log(actor(req), "Updated campaign", `#${id} ${JSON.stringify(v)}`);
  res.json({ ok: true });
});

/**
 * Permanently deletes a campaign and every record it owns (any table with
 * owner_campaign_id), children before parents, in one transaction: all or
 * nothing. The primary campaign can't be deleted. Parties left with no
 * campaigns are removed too. The caller must send the campaign's exact name.
 */
router.delete("/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id === PRIMARY_CAMPAIGN_ID) { res.status(400).json({ error: "The primary campaign can’t be deleted." }); return; }
  const c = (await db.execute(sql`SELECT id::int, name FROM public.kaiti_campaigns WHERE id = ${id}`)).rows[0] as { id: number; name: string } | undefined;
  if (!c) { res.status(404).json({ error: "Campaign not found." }); return; }
  if (typeof req.body?.confirmName !== "string" || req.body.confirmName.trim() !== c.name.trim()) {
    res.status(400).json({ error: `Type the campaign name exactly (“${c.name}”) to delete it.` }); return;
  }
  let removed = 0;
  try {
    await db.transaction(async tx => {
      removed = await deleteCampaignsTx(tx, [id]);
      await removeEmptyPartiesTx(tx);
    });
  } catch (err) {
    req.log?.error({ err, campaign: id }, "Campaign delete failed");
    res.status(409).json({ error: `“${c.name}” could not be deleted, and nothing was removed: ${(err as Error).message}` }); return;
  }
  invalidateTenancyCache();
  await log(actor(req), "Deleted campaign", `#${id} ${c.name} (${removed} records)`);
  res.json({ ok: true, removed });
});

router.get("/campaigns/:id/members", async (req, res) => {
  const r = await db.execute(sql`SELECT u.id::int, u.name, u.email, u.role, m.added_by AS "addedBy", m.added_at AS "addedAt"
    FROM public.kaiti_campaign_members m JOIN admin_users u ON u.id = m.user_id WHERE m.campaign_id = ${Number(req.params.id)} ORDER BY u.name`);
  res.json(r.rows);
});

/**
 * Opens a campaign for the signed-in administrator: makes it their active
 * campaign, so every module shows that candidate's seat and area. Super-admins
 * can already open every campaign. Other administrators are added as members
 * first; if this is their first membership they are also added to the primary
 * campaign, because people with no memberships work there by default.
 */
router.post("/campaigns/:id/open", async (req, res) => {
  const id = Number(req.params.id);
  const user = req.currentUser!;
  const c = (await db.execute(sql`SELECT id::int, name, status FROM public.kaiti_campaigns WHERE id = ${id}`)).rows[0] as { id: number; name: string; status: string } | undefined;
  if (!Number.isInteger(id) || !c) { res.status(404).json({ error: "Campaign not found." }); return; }
  if (c.status === "archived") { res.status(400).json({ error: `“${c.name}” is archived. Set it to Active to open it.` }); return; }
  if (!isSuperAdmin(user) && user.id > 0) {
    const hadAny = (await db.execute(sql`SELECT 1 FROM public.kaiti_campaign_members WHERE user_id = ${user.id} LIMIT 1`)).rows.length > 0;
    if (!hadAny && id !== PRIMARY_CAMPAIGN_ID) {
      await db.execute(sql`INSERT INTO public.kaiti_campaign_members (campaign_id, user_id, added_by) VALUES (${PRIMARY_CAMPAIGN_ID}, ${user.id}, ${actor(req)}) ON CONFLICT DO NOTHING`);
    }
    await db.execute(sql`INSERT INTO public.kaiti_campaign_members (campaign_id, user_id, added_by) VALUES (${id}, ${user.id}, ${actor(req)}) ON CONFLICT DO NOTHING`);
    await log(actor(req), "Opened campaign (added self as member)", `campaign #${id}`);
  }
  invalidateTenancyCache(user.id);
  req.session.activeCampaignId = id;
  res.json({ activeCampaignId: id });
});

router.post("/campaigns/:id/members", async (req, res) => {
  const campaignId = Number(req.params.id), userId = Number(req.body?.userId);
  if (!Number.isInteger(campaignId) || !Number.isInteger(userId)) { res.status(400).json({ error: "Invalid member" }); return; }
  await db.execute(sql`INSERT INTO public.kaiti_campaign_members (campaign_id, user_id, added_by) VALUES (${campaignId}, ${userId}, ${actor(req)})
    ON CONFLICT DO NOTHING`);
  invalidateTenancyCache(userId);
  await log(actor(req), "Added campaign member", `user #${userId} → campaign #${campaignId}`);
  res.status(201).json({ ok: true });
});

router.delete("/campaigns/:id/members/:userId", async (req, res) => {
  const campaignId = Number(req.params.id), userId = Number(req.params.userId);
  await db.execute(sql`DELETE FROM public.kaiti_campaign_members WHERE campaign_id=${campaignId} AND user_id=${userId}`);
  invalidateTenancyCache(userId);
  await log(actor(req), "Removed campaign member", `user #${userId} ✕ campaign #${campaignId}`);
  res.json({ ok: true });
});

// 2FA reset for a user who lost their phone (admin only, audited).
router.post("/users/:userId/reset-2fa", async (req, res) => {
  const userId = Number(req.params.userId);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 10) { res.status(400).json({ error: "Give a reason (at least 10 characters), e.g. how identity was confirmed." }); return; }
  await db.execute(sql`DELETE FROM public.kaiti_user_mfa WHERE user_id = ${userId}`);
  await db.execute(sql`INSERT INTO audit_logs (user_email, user_name, action, module, details, severity)
    VALUES (${actor(req)}, ${actor(req)}, 'Reset two-factor sign-in', 'admin', ${`user #${userId}: ${reason.slice(0, 400)}`}, 'warning')`);
  res.json({ ok: true });
});

router.get("/users", async (_req, res) => {
  const r = await db.execute(sql`SELECT u.id::int, u.name, u.email, u.role, u.status, COALESCE(f.enabled, false) AS "mfaEnabled",
    COALESCE((SELECT json_agg(m.campaign_id) FROM public.kaiti_campaign_members m WHERE m.user_id = u.id), '[]'::json) AS "campaignIds"
    FROM admin_users u LEFT JOIN public.kaiti_user_mfa f ON f.user_id = u.id ORDER BY u.name`);
  res.json(r.rows);
});

export default router;
