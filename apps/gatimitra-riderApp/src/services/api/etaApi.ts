/**
 * Rider-side ETA client.
 *
 * Reads the platform's frozen promise + most recent recalc snapshot for an
 * order. Used on the active-order screen to show the rider:
 *   - "Pickup by HH:MM" — when they must reach the store
 *   - "Deliver by HH:MM" — the customer-promised delivery time
 *
 * Failures are silent: the rider screen falls back to "—" rather than crashing.
 */
import { getRiderAppConfig } from "@/src/config/env";

export type EtaPromise = {
  minMinutes: number | null;
  maxMinutes: number | null;
  promisedDeliveryAt: string | null;
  generatedAt: string | null;
  bufferMinutes: number | null;
  routeKm: number | null;
  confidenceScore: number | null;
};

export type EtaLive = {
  minMinutes: number;
  maxMinutes: number;
  promisedDeliveryAt: string;
  reason: string;
  createdAt: string;
};

export type OrderEtaResponse = {
  ok: true;
  orderIdText: string;
  /** Immutable First ETA (first_eta_at → promised_delivery_at). */
  firstEtaAt?: string | null;
  promise: EtaPromise;
  live: EtaLive | null;
};

export async function fetchOrderEta(orderIdText: string): Promise<OrderEtaResponse | null> {
  try {
    const cfg = getRiderAppConfig();
    const res = await fetch(`${cfg.apiBaseUrl}/v1/eta/orders/${encodeURIComponent(orderIdText)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as OrderEtaResponse;
    return json?.ok ? json : null;
  } catch {
    return null;
  }
}

export function minutesUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((t - now.getTime()) / 60_000);
}

/**
 * Rider's pickup deadline = promise time − rider→customer leg − safety margin.
 * Approximated from the recorded route distance because the snapshot stores
 * the aggregate breakdown but not individual leg geometry. Falls back to 12
 * minutes when distance is missing.
 */
export function pickupDeadlineIso(eta: OrderEtaResponse | null): string | null {
  if (!eta) return null;
  const promiseIso = eta.firstEtaAt || eta.promise.promisedDeliveryAt;
  if (!promiseIso) return null;
  const t = new Date(promiseIso).getTime();
  if (!Number.isFinite(t)) return null;
  const km = eta.promise.routeKm ?? 4;
  const deliveryLegMin = Math.max(8, Math.round((km / 18) * 60));
  return new Date(t - deliveryLegMin * 60_000).toISOString();
}
