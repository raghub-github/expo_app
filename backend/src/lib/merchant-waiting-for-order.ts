/**
 * Merchant store "waiting for order" inbox row — created/deleted by backend only.
 */
import { getSql } from "../db/client.js";

export const WAITING_FOR_ORDER_TITLE = "🟢 Your restaurant is online";
export const WAITING_FOR_ORDER_BODY = "Waiting for orders";
export const PARTNER_NOTIFICATIONS_CLEARED_AT_KEY = "partner_notifications_cleared_at";

function readMetaObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export function readPartnerNotificationsClearedAt(meta: unknown): string | null {
  const value = readMetaObject(meta)[PARTNER_NOTIFICATIONS_CLEARED_AT_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function getPartnerNotificationsClearedAt(storeId: number): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT settings_metadata
    FROM merchant_store_settings
    WHERE store_id = ${storeId}
    LIMIT 1
  `;
  return readPartnerNotificationsClearedAt(
    (rows[0] as { settings_metadata?: unknown } | undefined)?.settings_metadata
  );
}

/** Persist Clear all so dismissed inbox rows cannot reappear from retries or campaign merge. */
export async function markPartnerNotificationsCleared(storeId: number): Promise<string> {
  const sql = getSql();
  const now = new Date().toISOString();
  const rows = await sql`
    SELECT settings_metadata
    FROM merchant_store_settings
    WHERE store_id = ${storeId}
    LIMIT 1
  `;
  const prevMeta = readMetaObject((rows[0] as { settings_metadata?: unknown } | undefined)?.settings_metadata);
  const nextMeta = { ...prevMeta, [PARTNER_NOTIFICATIONS_CLEARED_AT_KEY]: now };
  const metaJson = JSON.stringify(nextMeta);
  if (rows[0]) {
    await sql`
      UPDATE merchant_store_settings
      SET settings_metadata = ${metaJson}::jsonb, updated_at = NOW()
      WHERE store_id = ${storeId}
    `;
  } else {
    await sql`
      INSERT INTO merchant_store_settings (store_id, settings_metadata)
      VALUES (${storeId}, ${metaJson}::jsonb)
    `;
  }
  return now;
}

export async function revokeMerchantInAppNotifications(parentMerchantId: string): Promise<void> {
  const userId = String(parentMerchantId ?? "").trim();
  if (!userId) return;
  const sql = getSql();
  try {
    await sql`
      UPDATE public.notification_dispatch_logs
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE recipient_user_id = ${userId}
        AND recipient_role = 'merchant'
        AND channel = 'in_app'
        AND revoked_at IS NULL
    `;
  } catch {
    await sql`
      UPDATE public.notification_dispatch_logs
      SET
        clicked_at = COALESCE(clicked_at, now()),
        status = 'clicked'
      WHERE recipient_user_id = ${userId}
        AND recipient_role = 'merchant'
        AND channel = 'in_app'
    `;
  }
}

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
  if (readPartnerNotificationsClearedAt(settingsMeta)) {
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
