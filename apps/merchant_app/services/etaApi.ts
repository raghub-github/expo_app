/**
 * Merchant-side ETA client.
 *
 * Same payload as the customer-side service. Merchant UI uses it to surface:
 *   - prep deadline (promise time minus the delivery leg)
 *   - dispatch pressure ("rider expected in 4 mins")
 *
 * Public endpoint — no auth payload needed because order IDs are opaque.
 */
import { getConfig } from "@/config/env";

const base = () => getConfig().apiBaseUrl;

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
    const res = await fetch(`${base()}/v1/eta/orders/${encodeURIComponent(orderIdText)}`);
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
 * Prep deadline = promisedDeliveryAt − storeToCustomer − rider buffer (approx).
 * We approximate by subtracting (route + assignment) minutes from the promise
 * time. The merchant should hand the bag to the rider by this time.
 *
 * The ETA breakdown lives on the live snapshot's `metadata` in raw form, but
 * for the merchant chip we just show "Ready by HH:MM" — close enough.
 */
export function prepDeadlineIso(eta: OrderEtaResponse | null): string | null {
  if (!eta) return null;
  const promiseIso = eta.firstEtaAt || eta.promise.promisedDeliveryAt;
  if (!promiseIso) return null;
  const promiseT = new Date(promiseIso).getTime();
  if (!Number.isFinite(promiseT)) return null;
  // Use route distance to back out the rider leg. Falls back to 15 min when
  // the snapshot is missing details.
  const routeKm = eta.promise.routeKm ?? 4;
  const riderLegMin = Math.max(8, Math.round((routeKm / 18) * 60) + 5);
  return new Date(promiseT - riderLegMin * 60_000).toISOString();
}
