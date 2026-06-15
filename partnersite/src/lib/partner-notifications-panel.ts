import type { SupabaseClient } from '@supabase/supabase-js';

/** Stored in merchant_store_settings.settings_metadata when partner clears the panel. */
export const PARTNER_NOTIFICATIONS_CLEARED_AT_KEY = 'partner_notifications_cleared_at';

export const PARTNER_NOTIFICATIONS_CLEARED_EVENT = 'partner-notifications-cleared';

export function dispatchPartnerNotificationsCleared(storeId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PARTNER_NOTIFICATIONS_CLEARED_EVENT, { detail: { storeId } }));
}

function readMetaObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export function isPartnerNotificationsPanelCleared(meta: unknown): boolean {
  const obj = readMetaObject(meta);
  return typeof obj[PARTNER_NOTIFICATIONS_CLEARED_AT_KEY] === 'string';
}

export async function markPartnerNotificationsPanelCleared(
  db: SupabaseClient,
  storeIdNum: number
): Promise<void> {
  const now = new Date().toISOString();
  const { data: row } = await db
    .from('merchant_store_settings')
    .select('settings_metadata')
    .eq('store_id', storeIdNum)
    .maybeSingle();

  const prevMeta = readMetaObject(row?.settings_metadata);
  const nextMeta = { ...prevMeta, [PARTNER_NOTIFICATIONS_CLEARED_AT_KEY]: now };

  if (row) {
    const { error } = await db
      .from('merchant_store_settings')
      .update({ settings_metadata: nextMeta, updated_at: now })
      .eq('store_id', storeIdNum);
    if (error) console.error('[markPartnerNotificationsPanelCleared] update', error);
    return;
  }

  const { error } = await db
    .from('merchant_store_settings')
    .insert({ store_id: storeIdNum, settings_metadata: nextMeta });
  if (error) console.error('[markPartnerNotificationsPanelCleared] insert', error);
}

export async function resetPartnerNotificationsPanelCleared(
  db: SupabaseClient,
  storeIdNum: number
): Promise<void> {
  const { data: row } = await db
    .from('merchant_store_settings')
    .select('settings_metadata')
    .eq('store_id', storeIdNum)
    .maybeSingle();

  if (!row) return;

  const prevMeta = readMetaObject(row?.settings_metadata);
  if (!(PARTNER_NOTIFICATIONS_CLEARED_AT_KEY in prevMeta)) return;

  const { [PARTNER_NOTIFICATIONS_CLEARED_AT_KEY]: _removed, ...rest } = prevMeta;
  const now = new Date().toISOString();
  const { error } = await db
    .from('merchant_store_settings')
    .update({ settings_metadata: rest, updated_at: now })
    .eq('store_id', storeIdNum);
  if (error) console.error('[resetPartnerNotificationsPanelCleared]', error);
}

export async function isPartnerNotificationsPanelClearedForStore(
  db: SupabaseClient,
  storeIdNum: number
): Promise<boolean> {
  const { data: row, error } = await db
    .from('merchant_store_settings')
    .select('settings_metadata')
    .eq('store_id', storeIdNum)
    .maybeSingle();
  if (error) {
    console.error('[isPartnerNotificationsPanelClearedForStore]', error);
    return false;
  }
  return isPartnerNotificationsPanelCleared(row?.settings_metadata);
}
