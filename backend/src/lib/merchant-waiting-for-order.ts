/**
 * Merchant store "waiting for order" inbox row — created/deleted by backend only.
 */
import { getSql } from "../db/client.js";

export const WAITING_FOR_ORDER_TITLE = "🟢 Your restaurant is online";
export const WAITING_FOR_ORDER_BODY = "Waiting for orders";

export async function ensureWaitingForOrderInbox(storeId: number): Promise<{
  id: string | null;
  created: boolean;
  suppressed?: boolean;
}> {
  const sql = getSql();
  const settingsRows = await sql`
    SELECT settings_metadata
    FROM merchant_store_settings
    WHERE store_id = ${storeId}
    LIMIT 1
  `;
  const settingsMeta = (settingsRows[0] as { settings_metadata?: unknown } | undefined)?.settings_metadata;
  if (
    settingsMeta &&
    typeof settingsMeta === "object" &&
    typeof (settingsMeta as Record<string, unknown>).partner_notifications_cleared_at === "string"
  ) {
    return { id: null, created: false, suppressed: true };
  }

  const existing = await sql`
    SELECT id FROM merchant_store_notifications
    WHERE store_id = ${storeId} AND title = ${WAITING_FOR_ORDER_TITLE}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const ex = existing[0] as { id?: unknown } | undefined;
  if (ex?.id != null) {
    return { id: String(ex.id), created: false };
  }

  const ins = await sql`
    INSERT INTO merchant_store_notifications (store_id, type, title, body, read, action_url)
    SELECT
      ${storeId},
      'system',
      ${WAITING_FOR_ORDER_TITLE},
      ${WAITING_FOR_ORDER_BODY},
      FALSE,
      '/(tabs)/'
    WHERE NOT EXISTS (
      SELECT 1 FROM merchant_store_notifications
      WHERE store_id = ${storeId} AND title = ${WAITING_FOR_ORDER_TITLE}
    )
    RETURNING id
  `;
  const row = ins[0] as { id?: unknown } | undefined;
  if (!row?.id) {
    const again = await sql`
      SELECT id FROM merchant_store_notifications
      WHERE store_id = ${storeId} AND title = ${WAITING_FOR_ORDER_TITLE}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const againId = (again[0] as { id?: unknown } | undefined)?.id;
    return { id: againId != null ? String(againId) : null, created: false };
  }
  return { id: String(row.id), created: true };
}

export async function deleteWaitingForOrderInbox(storeId: number): Promise<number> {
  const sql = getSql();
  const del = await sql`
    DELETE FROM merchant_store_notifications
    WHERE store_id = ${storeId} AND title = ${WAITING_FOR_ORDER_TITLE}
    RETURNING id
  `;
  return del.length;
}
