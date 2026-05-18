/**
 * Per-device order alert preferences (AsyncStorage via SecureStore).
 */
import * as SecureStore from "expo-secure-store";

const STORAGE_VER = "v1";
const STORAGE_PREFIX = `merchant_device_order_alerts_${STORAGE_VER}:`;

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

function storageKey(storeId: number): string {
  return `${STORAGE_PREFIX}${storeId}`;
}

export function readDeviceOrderAlerts(storeId: number | null | undefined): DeviceOrderAlerts {
  if (storeId == null || !Number.isFinite(storeId)) return { ...DEFAULTS };
  return { ...DEFAULTS };
}

export async function readDeviceOrderAlertsAsync(
  storeId: number | null | undefined
): Promise<DeviceOrderAlerts> {
  if (storeId == null || !Number.isFinite(storeId)) return { ...DEFAULTS };
  try {
    const raw = await SecureStore.getItemAsync(storageKey(storeId));
    if (!raw) return { ...DEFAULTS };
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
    return { ...DEFAULTS };
  }
}

export async function writeDeviceOrderAlerts(
  storeId: number,
  patch: Partial<DeviceOrderAlerts>
): Promise<DeviceOrderAlerts> {
  const prev = await readDeviceOrderAlertsAsync(storeId);
  const next = { ...prev, ...patch };
  await SecureStore.setItemAsync(storageKey(storeId), JSON.stringify(next));
  return next;
}

export function volumeStepTo01(step: number): number {
  return Math.min(1, Math.max(0, step / 10));
}

export function resolveAlertUrlFromSlots(
  slots: [string | null, string | null, string | null],
  slot: number
): string | null {
  const c = Math.max(0, Math.min(2, Math.floor(slot)));
  if (slots[c]?.trim()) return slots[c]!.trim();
  for (let i = 0; i < 3; i++) {
    if (slots[i]?.trim()) return slots[i]!.trim();
  }
  return null;
}
