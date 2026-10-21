import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

/**
 * Database-enforced campaign isolation.
 *
 * Every request that has an active campaign runs inside
 * runWithCampaign(id, …). Before any query on a pooled connection, the
 * connection is switched to the low-privilege role `kaiti_app` with
 * app.campaign_id set. Row-level-security policies on every campaign table
 * then only return and accept rows for that campaign, so each existing
 * module is isolated without changing its queries.
 *
 * Outside a campaign context (startup, migrations, public forms, provider
 * webhooks) connections run as the owner role. Public forms therefore write to
 * the primary campaign (the column default), and webhooks can match their
 * rows in any campaign.
 *
 * Enforcement switches on only after ensureTenantIsolation() succeeds at boot.
 */

export type CampaignProfile = {
  name: string; candidateName: string | null; seat: string | null; constituency: string | null; county: string | null;
  party: string | null; electionDate: string | null; profileSummary: string | null; isPrimary: boolean;
};
type Ctx = { campaignId: number; wards: string[]; constituency: string | null; profile: CampaignProfile | null };

/** Wards used when no campaign context exists (public forms, startup). */
export const PRIMARY_WARDS: readonly string[] = [];
const als = new AsyncLocalStorage<Ctx>();
let enforcement = false;

export const TENANT_ROLE = "kaiti_app";
export function setTenantEnforcement(on: boolean) { enforcement = on; }
export function tenantEnforcementActive() { return enforcement; }

export function runWithCampaign<T>(
  campaignId: number,
  extras: { wards: string[]; constituency: string | null; profile?: CampaignProfile | null },
  fn: () => T,
): T {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) throw new Error("Invalid campaign id");
  return als.run({ campaignId, wards: extras.wards.length ? extras.wards : [...PRIMARY_WARDS], constituency: extras.constituency, profile: extras.profile ?? null }, fn);
}

/** Profile of the campaign handling the current request (null outside a request). */
export function currentCampaignProfile(): CampaignProfile | null {
  return als.getStore()?.profile ?? null;
}

/** Constituencies (sub-counties) valid for the current campaign. */
export function campaignConstituencies(): string[] {
  const c = als.getStore()?.constituency;
  return c ? [c] : [];
}

/** Wards of the campaign handling the current request. */
export function campaignWards(): string[] {
  return als.getStore()?.wards ?? [...PRIMARY_WARDS];
}
/** Runs fn with owner privileges (DDL, seeding, cross-campaign maintenance). */
export function runAsSystem<T>(fn: () => T): T { return als.exit(fn); }

const state = new WeakMap<pg.PoolClient, string>();

async function applyState(client: pg.PoolClient): Promise<void> {
  const ctx = als.getStore();
  const want = enforcement && ctx ? `c${ctx.campaignId}` : "system";
  const have = state.get(client) ?? "system";
  if (have === want) return;
  if (want === "system") {
    await client.query("RESET ROLE; SELECT set_config('app.campaign_id', '', false)");
  } else {
    // campaignId is a validated positive integer, so inlining it is safe.
    await client.query(`SELECT set_config('app.campaign_id', '${ctx!.campaignId}', false); SET ROLE ${TENANT_ROLE}`);
  }
  state.set(client, want);
}

type Callback = (err: Error | null, res?: unknown) => void;

export class TenantPool extends pg.Pool {
  // Promise form only is used by drizzle and connect-pg-simple; the callback
  // form is supported for completeness.
  override connect(): Promise<pg.PoolClient>;
  override connect(cb: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): void;
  override connect(cb?: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): Promise<pg.PoolClient> | void {
    if (cb) {
      super.connect().then(
        async client => {
          try { await applyState(client); } catch (e) { client.release(e as Error); cb(e as Error, undefined, () => {}); return; }
          cb(undefined, client, (r?: unknown) => client.release(r as Error | boolean | undefined));
        },
        err => cb(err as Error, undefined, () => {}),
      );
      return;
    }
    return super.connect().then(async client => {
      try { await applyState(client); }
      catch (e) { state.delete(client); client.release(e as Error); throw e; }
      return client;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override query(...args: any[]): any {
    const cb: Callback | undefined = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
    const run = async () => {
      const client = await this.connect();
      let failed: Error | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (client.query as any)(...args);
      } catch (e) {
        failed = e as Error;
        throw e;
      } finally {
        // A connection-level error destroys the client; ordinary SQL errors don't.
        const fatal = failed && !(failed as { code?: string }).code;
        if (fatal) state.delete(client);
        client.release(fatal ? failed : undefined);
      }
    };
    const p = run();
    if (cb) { p.then(r => cb(null, r), e => cb(e)); return undefined; }
    return p;
  }
}
