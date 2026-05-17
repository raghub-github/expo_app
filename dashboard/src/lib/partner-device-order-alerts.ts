/**
 * Per-browser / per-device order alert preferences for the partner site.
 * Stored in localStorage keyed by store — changing alerts on device A does not affect device B.
 */

export const PARTNER_DEVICE_ORDER_ALERTS_EVENT = 'partner-device-order-alerts-changed';

const STORAGE_VER = 'v1';
const STORAGE_PREFIX = `partner_device_order_alerts_${STORAGE_VER}:`;

export type PartnerDeviceOrderAlerts = {
  /** Master: incoming-order modal + alert pipeline for this browser */
  orderAlertsEnabled: boolean;
  /** Play chime / sounds when orderAlertsEnabled is on */
  soundAlertsEnabled: boolean;
  /** Pick from platform sound slots (0–2), device-local (not synced to server). */
  alertSoundSlot: number;
  /** 0–10 stepper → maps to audio volume 0–1 */
  volumeStep: number;
  /** Best-effort: Web audio cannot bypass hardware silent switch on many phones. */
  ringInSilent: boolean;
};

const DEFAULTS: PartnerDeviceOrderAlerts = {
  orderAlertsEnabled: true,
  soundAlertsEnabled: true,
  alertSoundSlot: 0,
  volumeStep: 5,
  ringInSilent: true,
};

function storageKey(storeId: string): string {
  return `${STORAGE_PREFIX}${storeId.trim()}`;
}

export function hasStoredDeviceOrderAlerts(storeId: string | null | undefined): boolean {
  if (!storeId || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(storageKey(storeId)) != null;
  } catch {
    return false;
  }
}

export function readPartnerDeviceOrderAlerts(storeId: string | null | undefined): PartnerDeviceOrderAlerts {
  if (!storeId || typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(storageKey(storeId));
    if (!raw) return { ...DEFAULTS };
    const j = JSON.parse(raw) as Record<string, unknown>;
    const slot = typeof j.alertSoundSlot === 'number' ? j.alertSoundSlot : Number(j.alertSoundSlot);
    const vol = typeof j.volumeStep === 'number' ? j.volumeStep : Number(j.volumeStep);
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

/** One-time migration from server-backed `communication_settings.order_notifications` (older UX). */
export function migrateDeviceOrderAlertsFromServer(
  storeId: string | null | undefined,
  server: { enabled?: boolean; ring_volume?: number; ring_in_silent?: boolean } | null | undefined
): void {
  if (!storeId || typeof window === 'undefined') return;
  if (hasStoredDeviceOrderAlerts(storeId)) return;
  try {
    const enabled = server?.enabled !== false;
    const ringInSilent = server?.ring_in_silent !== false;
    let volumeStep = DEFAULTS.volumeStep;
    if (typeof server?.ring_volume === 'number' && Number.isFinite(server.ring_volume)) {
      volumeStep = Math.max(0, Math.min(10, Math.round(server.ring_volume * 10)));
    }
    const next: PartnerDeviceOrderAlerts = {
      ...DEFAULTS,
      orderAlertsEnabled: enabled,
      soundAlertsEnabled: enabled,
      volumeStep,
      ringInSilent,
    };
    localStorage.setItem(storageKey(storeId), JSON.stringify(next));
    dispatchChanged(storeId);
  } catch {
    /* ignore */
  }
}

export function writePartnerDeviceOrderAlerts(
  storeId: string | null | undefined,
  partial: Partial<PartnerDeviceOrderAlerts>
): PartnerDeviceOrderAlerts {
  if (!storeId || typeof window === 'undefined') return { ...DEFAULTS };
  const prev = readPartnerDeviceOrderAlerts(storeId);
  const next: PartnerDeviceOrderAlerts = { ...prev, ...partial };
  try {
    localStorage.setItem(storageKey(storeId), JSON.stringify(next));
    dispatchChanged(storeId);
  } catch {
    /* ignore */
  }
  return next;
}

function dispatchChanged(storeId: string) {
  try {
    window.dispatchEvent(new CustomEvent(PARTNER_DEVICE_ORDER_ALERTS_EVENT, { detail: { storeId } }));
  } catch {
    /* ignore */
  }
}

/** Sync legacy Food Orders toolbar bell (`food-orders-ui`) with sound alerts on this device. */
export function syncFoodOrdersUiNotifyFromDevice(storeId: string | null | undefined, soundAlertsEnabled: boolean): void {
  if (!storeId || typeof window === 'undefined') return;
  try {
    const ORDERS_STORAGE_KEY = 'food-orders-ui';
    const s = localStorage.getItem(ORDERS_STORAGE_KEY);
    const prev = s ? JSON.parse(s) : {};
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify({ ...prev, notifyEnabled: soundAlertsEnabled }));
  } catch {
    /* ignore */
  }
}

export function resolveAlertUrlFromSlots(
  slots: [string | null, string | null, string | null],
  choice: number
): string | null {
  const c = Math.max(0, Math.min(2, Math.floor(choice)));
  const picked = slots[c];
  if (picked && String(picked).trim()) return String(picked).trim();
  for (let i = 0; i < 3; i++) {
    const u = slots[i];
    if (u && String(u).trim()) return String(u).trim();
  }
  return null;
}

export function volumeStepTo01(step: number): number {
  const s = Math.max(0, Math.min(10, Math.floor(step)));
  return s / 10;
}
