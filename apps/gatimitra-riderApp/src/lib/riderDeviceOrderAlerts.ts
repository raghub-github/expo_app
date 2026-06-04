import { useNotificationSettingsStore } from "@/src/stores/notificationSettingsStore";

export type RiderDeviceOrderAlerts = {
  orderAlertsEnabled: boolean;
  soundAlertsEnabled: boolean;
  alertSoundSlot: number;
  volumeStep: number;
  ringInSilent: boolean;
};

const DEFAULTS: RiderDeviceOrderAlerts = {
  orderAlertsEnabled: true,
  soundAlertsEnabled: true,
  alertSoundSlot: 0,
  volumeStep: 5,
  ringInSilent: true,
};

export function readRiderDeviceOrderAlerts(): RiderDeviceOrderAlerts {
  const prefs = useNotificationSettingsStore.getState().prefs;
  return {
    ...DEFAULTS,
    orderAlertsEnabled: prefs.pushEnabled && prefs.newOrders,
    soundAlertsEnabled: prefs.pushEnabled && prefs.newOrders,
  };
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

export function resolveAlertUrlFromSlots(
  slots: [string | null, string | null, string | null],
  slot: number
): string | null {
  const strict = resolveStrictAlertUrlFromSlot(slots, slot);
  if (strict) return strict;
  for (let i = 0; i < 3; i++) {
    const u = slots[i];
    if (u?.trim()) return u.trim();
  }
  return null;
}
