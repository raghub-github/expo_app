/**
 * Customer-side ETA client.
 *
 * Reads the frozen promise + live dynamic ETA from GET /v1/eta/orders/:orderIdText.
 * The customer UI shows a single `customer.etaMinutes` value — never a range.
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

export type CustomerEtaContextMessage =
  | "PREPARING"
  | "MERCHANT_DELAYED"
  | "READY_FOR_PICKUP"
  | "RIDER_PICKING_UP"
  | "ON_THE_WAY"
  | "ALMOST_THERE"
  | "DELIVERED"
  | "UPDATING";

export type CustomerEtaView = {
  etaMinutes: number | null;
  contextMessage: CustomerEtaContextMessage;
  contextLabel: string;
  merchantDelayed: boolean;
  etaUpdated: boolean;
  promisedEtaMinutes: number | null;
};

export type OrderEtaResponse = {
  ok: true;
  orderIdText: string;
  /** Immutable First ETA (first_eta_at → promised_delivery_at). */
  firstEtaAt?: string | null;
  promise: EtaPromise;
  live: EtaLive | null;
  prep?: OrderEtaPrep;
  customer: CustomerEtaView;
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
 * Minutes-to-promise countdown. Prefer `customer.etaMinutes` from the API for
 * display — this helper is kept for internal timing / overdue detection.
 */
export function minutesUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((t - now.getTime()) / 60_000);
}

/** @deprecated Use single `customer.etaMinutes` — ranges are no longer shown. */
export function formatEtaRange(min: number | null | undefined, max: number | null | undefined): string {
  const single = min != null && max != null ? max : min ?? max;
  if (single != null && Number.isFinite(single) && single > 0) {
    return `${Math.round(single)} min`;
  }
  return "Updating estimate…";
}
