/**
 * Customer-side ETA client.
 *
 * Reads the frozen promise + live recalculation snapshot from
 *   GET /v1/eta/orders/:orderIdText
 *
 * The promise is set ONCE on order placement and never changes — used for
 * disputes / accountability. The `live` field reflects the most recent
 * recalculation event (rider assigned, picked up, traffic update) and is what
 * the tracking countdown should follow.
 */
import api from "./api";

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

export type OrderEtaPrep = {
  minutes: number | null;
  readyByAt: string | null;
};

export type OrderEtaResponse = {
  ok: true;
  orderIdText: string;
  promise: EtaPromise;
  live: EtaLive | null;
  prep?: OrderEtaPrep;
};

export const etaService = {
  async getForOrder(orderIdText: string): Promise<OrderEtaResponse | null> {
    try {
      const { data } = await api.get<OrderEtaResponse>(
        `/v1/eta/orders/${encodeURIComponent(orderIdText)}`,
      );
      return data?.ok ? data : null;
    } catch {
      return null;
    }
  },
};

/**
 * Minutes-to-promise countdown that updates every 30s. Returns negative when
 * the order is overdue (used to flip the UI to "Running late" state).
 */
export function minutesUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((t - now.getTime()) / 60_000);
}

/**
 * Formats the customer-facing range. Falls back to a generic copy when the
 * server hasn't computed an ETA (legacy orders before migration 0232).
 */
export function formatEtaRange(min: number | null | undefined, max: number | null | undefined): string {
  if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max)) {
    if (max - min <= 1) return `${max} mins`;
    return `${min}–${max} mins`;
  }
  return "Delivery 45–55 mins";
}
