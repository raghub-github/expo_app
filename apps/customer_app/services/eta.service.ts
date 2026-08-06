/**
 * Customer-side ETA client.
 *
 * Reads the frozen promise + live dynamic ETA from GET /v1/eta/orders/:orderIdText.
 * Prefer `stageAware` for display — UI must not invent stages.
 */
import api from "./api";
import { noteServerNow } from "@/lib/server-time-offset";

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
  | "RIDER_TO_MERCHANT"
  | "RIDER_PICKING_UP"
  | "ON_THE_WAY"
  | "ALMOST_THERE"
  | "DELIVERED"
  | "UPDATING";

export type CustomerEtaView = {
  /** Stage-display ETA minutes (not always total delivery). */
  etaMinutes: number | null;
  contextMessage: CustomerEtaContextMessage;
  contextLabel: string;
  merchantDelayed: boolean;
  etaUpdated: boolean;
  promisedEtaMinutes: number | null;
};

export type EtaOperationalStage =
  | "MERCHANT_ACCEPTED"
  | "MERCHANT_PREP"
  | "READY_AWAITING_RIDER"
  | "RIDER_TO_MERCHANT"
  | "AT_STORE"
  | "CUSTOMER_DELIVERY"
  | "ARRIVING"
  | "DELIVERED";

export type StageAwareEta = {
  currentStage: EtaOperationalStage;
  merchantPrepEta: number | null;
  riderToMerchantEta: number | null;
  pickupEta: number | null;
  customerDeliveryEta: number | null;
  displayEta: number | null;
  totalEta: number;
  etaVersion: number;
  etaSource: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  promisedAt: string | null;
  lastUpdatedAt: string;
  freezeCountdown: boolean;
};

export type OrderEtaResponse = {
  ok: true;
  orderIdText: string;
  /** Immutable First ETA (first_eta_at → promised_delivery_at). */
  firstEtaAt?: string | null;
  /** Server wall clock at response generation — used for device clock offset. */
  serverNow?: string | null;
  promise: EtaPromise;
  live: EtaLive | null;
  prep?: OrderEtaPrep;
  customer: CustomerEtaView;
  /** Server-authoritative stage model — prefer over client guessing. */
  stageAware?: StageAwareEta;
};

export type EtaTimelineEntry = {
  id: number;
  etaVersion: number;
  at: string;
  reason: string;
  label: string;
  detail: string | null;
  stage: string | null;
  displayEta: number | null;
  totalEta: number | null;
  oldEtaMinutes: number | null;
  newEtaMinutes: number | null;
  deltaMinutes: number | null;
  confidence: string | null;
  freezeCountdown: boolean;
  contextLabel: string | null;
  merchantDelayed: boolean;
};

export type EtaTimelineResponse = {
  ok: true;
  orderIdText: string;
  entries: EtaTimelineEntry[];
};

export const etaService = {
  async getForOrder(orderIdText: string): Promise<OrderEtaResponse | null> {
    try {
      const { data } = await api.get<OrderEtaResponse>(
        `/v1/eta/orders/${encodeURIComponent(orderIdText)}`,
      );
      if (!data?.ok) return null;
      noteServerNow(data.serverNow);
      return data;
    } catch {
      return null;
    }
  },

  /** Immutable server ETA timeline — render only; never invent steps. */
  async getTimeline(orderIdText: string): Promise<EtaTimelineResponse | null> {
    try {
      const { data } = await api.get<EtaTimelineResponse>(
        `/v1/eta/orders/${encodeURIComponent(orderIdText)}/timeline`,
      );
      return data?.ok ? data : null;
    } catch {
      return null;
    }
  },
};

/**
 * Minutes-to-promise countdown. Prefer `stageAware.displayEta` / `customer.etaMinutes`
 * for display — this helper is kept for internal timing / overdue detection.
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
