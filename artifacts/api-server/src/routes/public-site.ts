import { Router } from "express";
import { z } from "zod";
import { db, runAsSystem } from "@workspace/db";
import { sql } from "drizzle-orm";
import { tooManyAttempts } from "../lib/mfa";
import { KENYA_SEATS, KENYA_COUNTIES } from "../data/kenya-electoral-units";

/**
 * Public endpoints for the marketing website (demo requests). Stored in a
 * shared table outside campaign isolation; read by admins in System Health.
 */
const router = Router();

export async function ensureDemoRequestsTable() {
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS public.kaiti_demo_requests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL, organisation text, role text, seat text, county text,
    phone text, email text, message text, source_page text,
    status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now())`));
  try { await db.execute(sql.raw(`REVOKE ALL ON public.kaiti_demo_requests FROM anon, authenticated`)); } catch { /* not Supabase */ }
}

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  organisation: z.string().trim().max(160).optional().default(""),
  role: z.string().trim().max(80).optional().default(""),
  seat: z.string().trim().max(40).optional().default(""),
  county: z.string().trim().max(60).optional().default(""),
  phone: z.string().trim().max(20).regex(/^[+0-9 ()-]*$/, "Phone number can only contain digits, spaces and +").optional().default(""),
  email: z.string().trim().max(160).email("Enter a valid email address").or(z.literal("")).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  sourcePage: z.string().trim().max(120).optional().default(""),
  website: z.string().optional(), // honeypot: real people leave it empty
}).refine(v => v.phone || v.email, { message: "Give a phone number or an email so we can reach you." });

router.post("/demo-request", async (req, res) => {
  if (tooManyAttempts(`demo:${req.ip}`, 5, 60 * 60_000)) { res.status(429).json({ error: "Too many requests. Please try again later or call us." }); return; }
  const p = schema.safeParse(req.body ?? {});
  if (!p.success) { res.status(400).json({ error: p.error.issues[0]?.message ?? "Please check the form." }); return; }
  const v = p.data;
  if (v.website) { res.status(201).json({ ok: true }); return; } // bot
  if (v.seat && !KENYA_SEATS.some(s => s.key === v.seat)) { res.status(400).json({ error: "Choose a valid seat." }); return; }
  if (v.county && !KENYA_COUNTIES.some(c => c.name === v.county)) { res.status(400).json({ error: "Choose a valid county." }); return; }
  await runAsSystem(() => db.execute(sql`INSERT INTO public.kaiti_demo_requests (name, organisation, role, seat, county, phone, email, message, source_page)
    VALUES (${v.name}, ${v.organisation || null}, ${v.role || null}, ${v.seat || null}, ${v.county || null}, ${v.phone || null}, ${v.email || null}, ${v.message || null}, ${v.sourcePage || null})`));
  res.status(201).json({ ok: true });
});

/** The campaign that owns public forms (campaign #1): its display name and wards only. */
router.get("/campaign", async (_req, res) => {
  const r = await runAsSystem(() => db.execute(sql`SELECT name, candidate_name AS "candidate", constituency, wards FROM public.kaiti_campaigns WHERE id = 1`));
  const c = r.rows[0] as { name: string; candidate: string | null; constituency: string | null; wards: string[] } | undefined;
  const area = c?.constituency ?? "";
  res.json({
    name: c?.name ?? "", candidate: c?.candidate ?? "", wards: c?.wards ?? [],
    areaLabel: !area ? "" : /\b(county|ward|kenya|constituency)$/i.test(area) ? area : `${area} Constituency`,
  });
});

/** Seats and counties for the website's forms and seat pages. */
router.get("/seats", (_req, res) => {
  res.json({
    seats: KENYA_SEATS,
    counties: KENYA_COUNTIES.map(c => ({ code: c.code, name: c.name, constituencies: c.constituencies.length, wards: c.constituencies.reduce((n, x) => n + x.wards.length, 0) })),
  });
});

export default router;
