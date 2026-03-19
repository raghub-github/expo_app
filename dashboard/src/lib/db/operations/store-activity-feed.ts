/**
 * Unified store activity feed – used by dashboard (agent actions).
 * Writes to the same store_activity_feed table that the backend writes to for merchant_app.
 */
import { getSql } from "../client";

export interface LogStoreActivityParams {
  storeId: number;
  section: string;
  action: string;
  entityId?: number | null;
  entityName?: string | null;
  summary: string;
  diff?: Record<string, unknown> | null;
  actorType: "agent" | "merchant" | "system";
  actorName?: string | null;
  actorEmail?: string | null;
  actorId?: number | null;
  source: "dashboard" | "partnersite" | "merchant_app";
}

export async function logStoreActivity(params: LogStoreActivityParams): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO store_activity_feed (
        store_id, section, action, entity_id, entity_name,
        summary, diff,
        actor_type, actor_name, actor_email, actor_id,
        source
      ) VALUES (
        ${params.storeId}, ${params.section}, ${params.action},
        ${params.entityId ?? null}, ${params.entityName ?? null},
        ${params.summary}, ${params.diff ? JSON.stringify(params.diff) : null},
        ${params.actorType}, ${params.actorName ?? null}, ${params.actorEmail ?? null}, ${params.actorId ?? null},
        ${params.source}
      )
    `;
  } catch (e) {
    console.error("[store-activity-feed] log failed:", e);
  }
}

export interface ActivityFeedRow {
  id: number;
  store_id: number;
  section: string;
  action: string;
  entity_id: number | null;
  entity_name: string | null;
  summary: string;
  diff: Record<string, unknown> | null;
  actor_type: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_id: number | null;
  source: string;
  created_at: string;
}

export async function getStoreActivityFeed(
  storeId: number,
  options?: { limit?: number; section?: string; source?: string; actorType?: string; action?: string }
): Promise<ActivityFeedRow[]> {
  const sql = getSql();
  const limit = options?.limit ?? 50;
  const section = options?.section ?? null;
  const source = options?.source ?? null;
  const actorType = options?.actorType ?? null;
  const action = options?.action ?? null;
  const rows = await sql`
    SELECT * FROM store_activity_feed
    WHERE store_id = ${storeId}
      AND (${section}::text IS NULL OR section = ${section})
      AND (${source}::text IS NULL OR source = ${source})
      AND (${actorType}::text IS NULL OR actor_type = ${actorType})
      AND (${action}::text IS NULL OR action = ${action})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return (Array.isArray(rows) ? rows : [rows]) as ActivityFeedRow[];
}
