import type { Request, Response, NextFunction } from "express";
import { getSessionUser, isEmergencySession, permissionsForRole, type PermLevel } from "../lib/auth";
import { MODULE_BY_KEY } from "../lib/record-modules";
import { runWithCampaign, tenantEnforcementActive } from "@workspace/db";
import { resolveCampaign, LEGACY_PREFIXES, PRIMARY_CAMPAIGN_ID } from "../lib/tenancy";

/**
 * Central, deny-by-default access control for everything mounted under /api.
 *
 * Before this middleware, most routers (members, voter-registry, messaging,
 * fundraising, election-day, ...) had no authentication at all, so anyone who
 * knew the URL could read or change supporter and voter data. Now:
 *
 *   1. A small explicit allowlist stays public (login, health, public poll /
 *      volunteer forms, provider webhooks that verify their own signatures).
 *   2. Every other request needs an active session.
 *   3. The URL prefix maps to an RBAC module; GET/HEAD/OPTIONS need "read",
 *      anything else needs "write" — using the role permissions that were
 *      already seeded but never enforced.
 *
 * Unknown prefixes are denied to everyone except super-admins, so a new router
 * cannot accidentally ship public: it must be added to MODULE_BY_PREFIX.
 */

type PublicRule = { method: string; pattern: RegExp };

const PUBLIC_RULES: PublicRule[] = [
  { method: "GET", pattern: /^\/healthz$/ },
  { method: "*", pattern: /^\/auth\/(login|logout|me)$/ },
  // Second sign-in step: the session holds a pending (password-verified) user only.
  { method: "POST", pattern: /^\/auth\/mfa\/verify$/ },
  // Marketing website: demo requests and the public seat list.
  { method: "POST", pattern: /^\/public\/demo-request$/ },
  { method: "GET", pattern: /^\/public\/seats$/ },
  { method: "GET", pattern: /^\/public\/campaign$/ },
  // Public volunteer + participant registration forms
  { method: "POST", pattern: /^\/volunteers\/register$/ },
  { method: "POST", pattern: /^\/surveys\/public\/participant-registration$/ },
  { method: "GET", pattern: /^\/surveys\/public\/polls\/[^/]+$/ },
  { method: "POST", pattern: /^\/surveys\/polls\/[^/]+\/vote$/ },
  // Public shared insight polls
  { method: "GET", pattern: /^\/insights\/p\/[^/]+$/ },
  { method: "POST", pattern: /^\/insights\/p\/[^/]+\/(event|submit)$/ },
  { method: "GET", pattern: /^\/insights\/share\/[^/]+$/ },
  // Provider callbacks — each handler verifies its own signature/credentials
  { method: "POST", pattern: /^\/messages\/webhooks\/(twilio|africastalking)$/ },
  // M-Pesa Daraja callback. Daraja does not sign callbacks: restrict by
  // Safaricom IP ranges at the edge, and the handler must reconcile against
  // a pending CheckoutRequestID (it already does).
  { method: "POST", pattern: /^\/fundraising\/mpesa\/callback$/ },
];

// URL prefix (first path segment, or two for nested routers) -> RBAC module.
const MODULE_BY_PREFIX: Array<[string, string]> = [
  ["/fundraising/mpesa", "finance"],
  ["/operations", "events"],
  ["/dashboard", "dashboard"],
  ["/members", "voters"],
  ["/segments", "segmentation"],
  ["/messages", "messaging"],
  ["/field-ops", "field-ops"],
  ["/volunteers", "volunteers"],
  ["/surveys", "intelligence"],
  ["/events", "events"],
  ["/intelligence", "narrative"],
  ["/campaign-plan", "campaign-plan"],
  ["/kol", "kol"],
  ["/fundraising", "finance"],
  ["/election-day", "election-day"],
  ["/turnout", "election-day"],
  ["/voter-registry", "constituents"],
  ["/credentials", "credentials"],
  ["/admin", "admin"],
  ["/analytics", "dashboard"],
  ["/insights", "intelligence"],
  ["/ai", "intelligence"],
  ["/speeches", "messaging"],
  ["/social", "intelligence"],
  ["/di", "intelligence"],
  ["/strategist", "dashboard"],
  ["/command-centre", "dashboard"],
  ["/system", "admin"],
  ["/tenancy", "admin"],
  ["/analysis", "intelligence"],
];

function isPublic(method: string, path: string): boolean {
  return PUBLIC_RULES.some(r => (r.method === "*" || r.method === method) && r.pattern.test(path));
}

function moduleFor(path: string): string | null {
  // /records/<module>/... -> that registry module's RBAC key.
  const rec = /^\/records\/([^/]+)/.exec(path);
  if (rec) return MODULE_BY_KEY.get(rec[1])?.rbac ?? null;
  for (const [prefix, mod] of MODULE_BY_PREFIX) {
    if (path === prefix || path.startsWith(prefix + "/")) return mod;
  }
  return null;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function accessControl(req: Request, res: Response, rawNext: NextFunction): Promise<void> {
  // Once a campaign is resolved, the rest of the request runs inside it, so
  // every database query is limited to that campaign by row-level security.
  const next: NextFunction = (err?: unknown) => {
    if (err || !req.campaignId) { rawNext(err as Error | undefined); return; }
    runWithCampaign(req.campaignId, { wards: req.campaignWards ?? [], constituency: req.campaignConstituency ?? null, profile: req.campaignProfile }, () => rawNext());
  };
  // req.path is relative to the /api mount point.
  const path = req.path.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();

  if (method === "OPTIONS" || isPublic(method, path)) {
    next();
    return;
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (user.status === "suspended" || user.status === "inactive") {
      res.status(403).json({ error: "Account disabled" });
      return;
    }
    req.currentUser = user;

    // Roles that require 2FA can do nothing but enrol until they have it.
    if (req.session.mfaEnrollRequired && !path.startsWith("/auth/")) {
      res.status(403).json({ error: "Set up two-factor sign-in to continue.", mfaEnrollmentRequired: true });
      return;
    }
    // Any signed-in user may manage their own 2FA.
    if (path.startsWith("/auth/mfa/")) { next(); return; }

    const campaignId = await resolveCampaign(req);
    if (campaignId === null && !isEmergencySession(req)) {
      res.status(403).json({ error: "You aren’t assigned to an active campaign. Ask an administrator to add you." });
      return;
    }
    if (method === "GET" && path === "/tenancy/context") { next(); return; }
    if (method === "POST" && path === "/tenancy/switch") { next(); return; }

    // Older modules hold primary-campaign data only; never show it inside another campaign.
    if (!tenantEnforcementActive() && campaignId !== PRIMARY_CAMPAIGN_ID && campaignId !== null
        && LEGACY_PREFIXES.some(p => path === p || path.startsWith(p + "/"))) {
      res.status(409).json({ error: "This module isn’t available for this campaign yet. Switch to the primary campaign to use it.", legacyModule: true });
      return;
    }

    if (isEmergencySession(req)) {
      next();
      return;
    }

    if (method === "GET" && path === "/records/_modules") { next(); return; }

    // Social listening: every signed-in user may view, search and scan.
    // Deleting saved mentions falls through to the normal Intelligence check.
    if ((path === "/social" || path.startsWith("/social/")) && method !== "DELETE") { next(); return; }

    const needed: PermLevel = READ_METHODS.has(method) ? "read" : "write";
    const mod = moduleFor(path);

    if (!mod) {
      // Unmapped route: only super-admins until someone maps it deliberately.
      if (user.role.toLowerCase().replace(/[_-]/g, "") === "superadmin") { next(); return; }
      req.log?.warn({ path, method }, "access-control: unmapped API path denied");
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    const perms = await permissionsForRole(user.role);
    const have = perms[mod] ?? "none";
    const ok = needed === "read" ? have === "read" || have === "write" : have === "write";
    if (!ok) {
      res.status(403).json({ error: "Insufficient permissions", module: mod, required: needed });
      return;
    }
    next();
  } catch (err) {
    req.log?.error({ err }, "access-control failure");
    res.status(500).json({ error: "Authorisation check failed" });
  }
}

export const __test = { isPublic, moduleFor };
