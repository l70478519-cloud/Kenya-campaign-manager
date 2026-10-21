import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
export class FeatureConflict extends Error {}
export type FeatureRow = {
  id: number;
  title: string;
  status: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
export async function listFeature(campaign: number, module: string) {
  return (
    await db.execute(
      sql`SELECT id,title,status,data,created_at AS "createdAt",updated_at::text AS "updatedAt" FROM kaiti_records WHERE owner_campaign_id=${campaign} AND module=${module} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`,
    )
  ).rows as FeatureRow[];
}
export async function findFeature(
  campaign: number,
  module: string,
  id: number,
) {
  return (
    await db.execute(
      sql`SELECT id,title,status,data,created_at AS "createdAt",updated_at::text AS "updatedAt" FROM kaiti_records WHERE owner_campaign_id=${campaign} AND module=${module} AND id=${id} AND deleted_at IS NULL`,
    )
  ).rows[0] as FeatureRow | undefined;
}
export async function saveFeature(
  campaign: number,
  module: string,
  actor: string,
  title: string,
  status: string,
  data: Record<string, unknown>,
  id?: number,
  expectedUpdatedAt?: string,
) {
  return db.transaction(async (tx) => {
    if (module === "wa-templates") {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`wa-template-${campaign}-${data.name}-${data.language}`}))`,
      );
      const duplicate = await tx.execute(
        sql`SELECT id FROM kaiti_records WHERE owner_campaign_id=${campaign} AND module=${module} AND deleted_at IS NULL AND data->>'name'=${String(data.name)} AND data->>'language'=${String(data.language)} AND (${id ?? null}::bigint IS NULL OR id<>${id ?? null}) LIMIT 1`,
      );
      if (duplicate.rows.length)
        throw new FeatureConflict(
          "A template with this name and language already exists.",
        );
    }
    const changed = id
      ? await tx.execute(
          sql`UPDATE kaiti_records SET title=${title},status=${status},data=${JSON.stringify(data)}::jsonb,updated_by=${actor},updated_at=clock_timestamp() WHERE id=${id} AND owner_campaign_id=${campaign} AND module=${module} AND deleted_at IS NULL AND (${expectedUpdatedAt ?? null}::timestamptz IS NULL OR updated_at=${expectedUpdatedAt ?? null}::timestamptz) RETURNING id,title,status,data,created_at AS "createdAt",updated_at::text AS "updatedAt"`,
        )
      : await tx.execute(
          sql`INSERT INTO kaiti_records(owner_campaign_id,module,title,status,data,created_by,updated_by) VALUES(${campaign},${module},${title},${status},${JSON.stringify(data)}::jsonb,${actor},${actor}) RETURNING id,title,status,data,created_at AS "createdAt",updated_at::text AS "updatedAt"`,
        );
    const row = changed.rows[0] as FeatureRow | undefined;
    if (!row)
      throw new FeatureConflict(
        "This record changed or was archived. Refresh and try again.",
      );
    await tx.execute(
      sql`INSERT INTO kaiti_record_history(record_id,module,action,to_status,changes,actor) VALUES(${row.id},${module},${id ? "updated" : "created"},${status},'{}'::jsonb,${actor})`,
    );
    return row;
  });
}
export async function archiveFeature(
  campaign: number,
  module: string,
  id: number,
  actor: string,
) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(
      sql`UPDATE kaiti_records SET deleted_at=now(),updated_by=${actor},updated_at=now() WHERE owner_campaign_id=${campaign} AND module=${module} AND id=${id} AND deleted_at IS NULL RETURNING id`,
    );
    if (!r.rows.length) return false;
    await tx.execute(
      sql`INSERT INTO kaiti_record_history(record_id,module,action,changes,actor) VALUES(${id},${module},'archived','{}'::jsonb,${actor})`,
    );
    return true;
  });
}
