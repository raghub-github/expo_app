/**
 * Unified store activity feed logger.
 * All surfaces (merchant_app, partnersite, dashboard) call this to record
 * bank account, offer, menu, combo, addon, and other changes.
 */
import { getSql } from "../db/client.js";

export type ActivitySection =
  | "bank_account"
  | "offer"
  | "menu_item"
  | "combo"
  | "addon"
  | "customization"
  | "category"
  | "store_settings"
  | "variant"
  | "combo_component";

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "enable"
  | "disable"
  | "set_default"
  | "link"
  | "unlink";

export type ActivitySource = "merchant_app" | "partnersite" | "dashboard";
export type ActorType = "merchant" | "agent" | "system";

export interface LogStoreActivityParams {
  storeId: number;
  section: ActivitySection | string;
  action: ActivityAction | string;
  entityId?: number | null;
  entityName?: string | null;
  summary: string;
  diff?: Record<string, unknown> | null;
  actorType: ActorType;
  actorName?: string | null;
  actorEmail?: string | null;
  actorId?: number | null;
  source: ActivitySource;
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
        ${params.storeId},
        ${params.section},
        ${params.action},
        ${params.entityId ?? null},
        ${params.entityName ?? null},
        ${params.summary},
        ${params.diff ? JSON.stringify(params.diff) : null},
        ${params.actorType},
        ${params.actorName ?? null},
        ${params.actorEmail ?? null},
        ${params.actorId ?? null},
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
  options?: { limit?: number; section?: string }
): Promise<ActivityFeedRow[]> {
  const sql = getSql();
  const limit = options?.limit ?? 50;
  const section = options?.section;

  const rows = section
    ? await sql`
        SELECT * FROM store_activity_feed
        WHERE store_id = ${storeId} AND section = ${section}
        ORDER BY created_at DESC LIMIT ${limit}
      `
    : await sql`
        SELECT * FROM store_activity_feed
        WHERE store_id = ${storeId}
        ORDER BY created_at DESC LIMIT ${limit}
      `;

  return (Array.isArray(rows) ? rows : [rows]).map((r: any) => ({
    id: r.id,
    store_id: r.store_id,
    section: r.section,
    action: r.action,
    entity_id: r.entity_id,
    entity_name: r.entity_name,
    summary: r.summary,
    diff: r.diff,
    actor_type: r.actor_type,
    actor_name: r.actor_name,
    actor_email: r.actor_email,
    actor_id: r.actor_id,
    source: r.source,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}
