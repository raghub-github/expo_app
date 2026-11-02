/**
 * Per-INSTALLATION order alert preferences (SecureStore — never account-synced).
 *
 * Guarantee A: turning buzzer OFF on Phone A must not change Phone B/C.
 * Keyed by merchant device installation id + store id so two phones on the
 * same account keep independent mute / volume / slot settings.
 *
 * Also mirrors enabled/slot/file into native SharedPreferences when JS is alive.
 * Killed FCM does not need this write — native defaults to buzzer ON + bundled raw.
 *
 * This store is NEVER used as a global order-stop signal.
 */
import * as SecureStore from "expo-secure-store";
import { persistNativeAlertSound } from "@gatimitra/expo-push-kit";
import { getCachedMerchantAlertSoundUri } from "@/lib/merchantAlertSoundCache";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";

const STORAGE_VER = "v2";
const STORAGE_PREFIX = `merchant_device_order_alerts_${STORAGE_VER}:`;
/** Legacy v1 key (store-only) — migrated once into the device-scoped key. */
const LEGACY_PREFIX = "merchant_device_order_alerts_v1:";

export type DeviceOrderAlerts = {
  orderAlertsEnabled: boolean;
  soundAlertsEnabled: boolean;
  alertSoundSlot: number;
  volumeStep: number;
  ringInSilent: boolean;
};

const DEFAULTS: DeviceOrderAlerts = {
  orderAlertsEnabled: true,
  soundAlertsEnabled: true,
  alertSoundSlot: 0,
  volumeStep: 5,
  ringInSilent: true,
};

function legacyKey(storeId: number): string {
  return `${LEGACY_PREFIX}${storeId}`;
}

async function storageKey(storeId: number): Promise<string> {
  const deviceId = await getOrCreateMerchantDeviceId();
  return `${STORAGE_PREFIX}${deviceId}:${storeId}`;
}

export function readDeviceOrderAlerts(storeId: number | null | undefined): DeviceOrderAlerts {
  if (storeId == null || !Number.isFinite(storeId)) return { ...DEFAULTS };
  return { ...DEFAULTS };
}

function parseAlerts(raw: string | null): DeviceOrderAlerts | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const slot = typeof j.alertSoundSlot === "number" ? j.alertSoundSlot : Number(j.alertSoundSlot);
    const vol = typeof j.volumeStep === "number" ? j.volumeStep : Number(j.volumeStep);
    return {
      orderAlertsEnabled: j.orderAlertsEnabled !== false,
      soundAlertsEnabled: j.soundAlertsEnabled !== false,
      alertSoundSlot: Number.isFinite(slot) ? Math.max(0, Math.min(2, Math.floor(slot))) : DEFAULTS.alertSoundSlot,
      volumeStep: Number.isFinite(vol) ? Math.max(0, Math.min(10, Math.floor(vol))) : DEFAULTS.volumeStep,
      ringInSilent: j.ringInSilent !== false,
    };
  } catch {
    return null;
  }
}

export async function readDeviceOrderAlertsAsync(
  storeId: number | null | undefined
): Promise<DeviceOrderAlerts> {
  if (storeId == null || !Number.isFinite(storeId)) return { ...DEFAULTS };
  try {
    const key = await storageKey(storeId);
    const parsed = parseAlerts(await SecureStore.getItemAsync(key));
    if (parsed) return parsed;
    // One-time migrate from store-only v1 key on this install.
    const legacy = parseAlerts(await SecureStore.getItemAsync(legacyKey(storeId)));
    if (legacy) {
      await SecureStore.setItemAsync(key, JSON.stringify(legacy));
      return legacy;
    }
    return { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeDeviceOrderAlerts(
  storeId: number,
  patch: Partial<DeviceOrderAlerts>
): Promise<DeviceOrderAlerts> {
  const prev = await readDeviceOrderAlertsAsync(storeId);
  const next = { ...prev, ...patch };
  const key = await storageKey(storeId);
  await SecureStore.setItemAsync(key, JSON.stringify(next));
  try {
    const cached = await getCachedMerchantAlertSoundUri();
    await persistNativeAlertSound({
      enabled: next.orderAlertsEnabled !== false && next.soundAlertsEnabled !== false,
      fileUri: cached,
      slot: next.alertSoundSlot,
      ringInSilent: next.ringInSilent !== false,
      volume01: volumeStepTo01(next.volumeStep),
    });
  } catch {
    /* native persist is best-effort */
  }
  return next;
}

export function volumeStepTo01(step: number): number {
  return Math.min(1, Math.max(0, step / 10));
}

export function resolveStrictAlertUrlFromSlot(
  slots: [string | null, string | null, string | null],
  slot: number
): string | null {
  const c = Math.max(0, Math.min(2, Math.floor(slot)));
  const picked = slots[c];
  return picked?.trim() ? picked.trim() : null;
}

/** Resolve playback URL for chosen slot, falling back to first non-empty slot (partnersite parity). */
export function resolveAlertUrlFromSlots(
  slots: [string | null, string | null, string | null],
  slot: number
): string | null {
  const strict = resolveStrictAlertUrlFromSlot(slots, slot);
  if (strict) return strict;
  for (let i = 0; i < 3; i++) {
    if (slots[i]?.trim()) return slots[i]!.trim();
  }
  return null;
}
