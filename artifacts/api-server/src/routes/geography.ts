import { Router } from "express";
import { campaignWards, currentCampaignProfile } from "@workspace/db";
import { campaignArea } from "../lib/polling-centres";

/**
 * The signed-in user's campaign area only: county, constituencies, wards and
 * IEBC polling centres for the active campaign. Never the national tree (that
 * stays on the admin-only /tenancy/geography).
 */
const router = Router();

router.get("/my-area", (req, res) => {
  const p = currentCampaignProfile();
  const area = campaignArea({ seat: p?.seat, county: p?.county, constituency: p?.constituency, area: p?.area, wards: campaignWards() });
  // ?centres=0 returns the ward list and totals without centre names.
  const withCentres = req.query.centres !== "0";
  res.json({
    campaign: p ? { name: p.name, candidate: p.candidateName, seat: p.seat } : null,
    ...area,
    wards: withCentres ? area.wards : area.wards.map(w => ({ ...w, centres: [], centreCount: w.centres.length })),
  });
});

export default router;
