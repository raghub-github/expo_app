import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLicenseExpiryFlagUpdates,
  evaluateMerchantLicenseCompliance,
  LICENSE_CLOSE_REASON,
  LICENSE_RESTRICTION_TYPE,
  LICENSE_UNAVAILABLE_REASON,
  type MerchantLicenseEvaluation,
} from '@/lib/merchantLicenseExpiry';
import { istTodayKey } from '@/lib/merchant-wallet-resolve';

async function closeStoreForLicense(db: SupabaseClient, storeInternalId: number): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .from('merchant_stores')
    .update({
      operational_status: 'CLOSED',
      is_active: false,
      is_available: false,
      is_accepting_orders: false,
      last_activity_at: nowIso,
    })
    .eq('id', storeInternalId);

  await db
    .from('merchant_store_availability')
    .update({
      is_available: false,
      is_accepting_orders: false,
      unavailable_reason: LICENSE_UNAVAILABLE_REASON,
      close_reason: LICENSE_CLOSE_REASON,
      restriction_type: LICENSE_RESTRICTION_TYPE,
      is_manual_override: false,
      manual_override_at: null,
      manual_close_until: null,
      schedule_end_prompted_at: null,
      schedule_end_prompt_expires_at: null,
      block_auto_open: true,
      last_auto_action_at: nowIso,
      auto_unavailable_at: nowIso,
      auto_available_at: null,
      auto_off_reason: LICENSE_UNAVAILABLE_REASON,
      last_toggle_type: 'LICENSE_EXPIRED',
      last_toggled_at: nowIso,
    })
    .eq('store_id', storeInternalId);
}

export type SyncLicenseComplianceResult = {
  evaluation: MerchantLicenseEvaluation;
  forcedClose: boolean;
  flagsUpdated: boolean;
};

/**
 * Refresh `*_is_expired` flags and force-close the store when any licence is expired or
 * a renewal is awaiting Gatimitra verification.
 */
export async function syncMerchantLicenseCompliance(
  db: SupabaseClient,
  storeInternalId: number,
  options?: {
    trace?: (step: string, payload: Record<string, unknown>) => void;
  }
): Promise<SyncLicenseComplianceResult> {
  const trace = options?.trace ?? (() => {});
  const todayKey = istTodayKey();

  const { data: docRow } = await db
    .from('merchant_store_documents')
    .select('*')
    .eq('store_id', storeInternalId)
    .maybeSingle();

  const row = (docRow ?? {}) as Record<string, unknown>;
  const flagPatch = buildLicenseExpiryFlagUpdates(row, todayKey);
  let flagsUpdated = false;

  if (Object.keys(flagPatch).length > 0) {
    const mergedRow = { ...row, ...flagPatch };
    const { error: flagErr } = await db
      .from('merchant_store_documents')
      .update({ ...flagPatch, updated_at: new Date().toISOString() } as Record<string, unknown>)
      .eq('store_id', storeInternalId);
    if (!flagErr) {
      flagsUpdated = true;
      Object.assign(row, flagPatch);
    } else {
      trace('license_flag_update_error', { message: flagErr.message });
    }
    Object.assign(row, mergedRow);
  }

  const evaluation = evaluateMerchantLicenseCompliance(row, todayKey);
  let forcedClose = false;

  if (evaluation.blocked) {
    const { data: storeLive } = await db
      .from('merchant_stores')
      .select('operational_status, is_active, is_accepting_orders, is_available')
      .eq('id', storeInternalId)
      .single();

    const storeOpen =
      String(storeLive?.operational_status || '').toUpperCase() === 'OPEN' ||
      storeLive?.is_active === true ||
      storeLive?.is_accepting_orders === true ||
      storeLive?.is_available === true;

    const { data: avail } = await db
      .from('merchant_store_availability')
      .select('unavailable_reason, restriction_type, is_available, is_accepting_orders')
      .eq('store_id', storeInternalId)
      .maybeSingle();

    const alreadyLicenseHeld =
      String(avail?.unavailable_reason || '').toLowerCase() === LICENSE_UNAVAILABLE_REASON ||
      String(avail?.restriction_type || '').toLowerCase() === LICENSE_RESTRICTION_TYPE;

    if (storeOpen || !alreadyLicenseHeld) {
      await closeStoreForLicense(db, storeInternalId);
      forcedClose = true;
      trace('license_force_close', {
        expired: evaluation.expired.map((d) => d.prefix),
        pending: evaluation.pending_verification.map((d) => d.prefix),
      });
    } else {
      trace('license_already_held_closed', {
        expired: evaluation.expired.map((d) => d.prefix),
        pending: evaluation.pending_verification.map((d) => d.prefix),
      });
    }
  } else {
    const { data: avail } = await db
      .from('merchant_store_availability')
      .select('unavailable_reason, restriction_type, block_auto_open')
      .eq('store_id', storeInternalId)
      .maybeSingle();

    if (
      String(avail?.unavailable_reason || '').toLowerCase() === LICENSE_UNAVAILABLE_REASON ||
      String(avail?.restriction_type || '').toLowerCase() === LICENSE_RESTRICTION_TYPE
    ) {
      await db
        .from('merchant_store_availability')
        .update({
          unavailable_reason: null,
          close_reason: null,
          restriction_type: null,
          block_auto_open: false,
          auto_off_reason: null,
        })
        .eq('store_id', storeInternalId);
      trace('license_hold_cleared', {});
    }
  }

  return { evaluation, forcedClose, flagsUpdated };
}

export async function loadMerchantLicenseEvaluation(
  db: SupabaseClient,
  storeInternalId: number
): Promise<MerchantLicenseEvaluation> {
  const { data: docRow } = await db
    .from('merchant_store_documents')
    .select('*')
    .eq('store_id', storeInternalId)
    .maybeSingle();
  return evaluateMerchantLicenseCompliance((docRow ?? {}) as Record<string, unknown>);
}
