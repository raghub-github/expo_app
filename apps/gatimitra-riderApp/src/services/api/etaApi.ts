/**
 * Rider-side ETA client — prefer server `stageAware` / `eta.updated.v1`.
 * Do not invent pickup/delivery minutes locally when stageAware is present.
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

export type CustomerEtaView = {
  etaMinutes: number | null;
  contextMessage: string;
  contextLabel: string;
  merchantDelayed: boolean;
  etaUpdated: boolean;
  promisedEtaMinutes: number | null;
};

export type StageAwareEta = {
  currentStage: string;
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
  firstEtaAt?: string | null;
  promise: EtaPromise;
  live: EtaLive | null;
  customer?: CustomerEtaView;
  stageAware?: StageAwareEta;
};

export const RIDER_ORDER_ETA_QUERY_KEY = (orderIdText: string) =>
  ["riderOrderEta", orderIdText] as const;

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

export function shouldAcceptEtaVersion(
  incoming: number | null | undefined,
  lastAccepted: number | null | undefined
): boolean {
  const next = Number(incoming);
  if (!Number.isFinite(next) || next <= 0) return false;
  const prev = Number(lastAccepted);
  if (!Number.isFinite(prev) || prev <= 0) return true;
  return next > prev;
}

export function mergeEtaUpdatedEvent(
  prev: OrderEtaResponse | null,
  event: {
    orderIdText?: string;
    orderId?: string;
    etaVersion?: number;
    reason?: string;
    customer?: CustomerEtaView;
    stageAware?: StageAwareEta;
    livePromisedDeliveryAt?: string | null;
    currentEtaMinutes?: number;
    at?: string;
  }
): OrderEtaResponse | null {
  if (!event.stageAware || !event.customer) return prev;
  const version = Number(event.etaVersion);
  if (!Number.isFinite(version) || version <= 0) return prev;
  if (!shouldAcceptEtaVersion(version, prev?.stageAware?.etaVersion)) return prev;

  const orderIdText =
    String(event.orderIdText ?? event.orderId ?? prev?.orderIdText ?? "").trim() ||
    prev?.orderIdText ||
    "";
  const at = event.at ?? event.stageAware.lastUpdatedAt ?? new Date().toISOString();
  const liveMinutes =
    event.currentEtaMinutes ?? event.stageAware.totalEta ?? event.customer.etaMinutes ?? 0;

  return {
    ok: true,
    orderIdText,
    firstEtaAt: prev?.firstEtaAt ?? null,
    promise: prev?.promise ?? {
      minMinutes: null,
      maxMinutes: null,
      promisedDeliveryAt: null,
      generatedAt: null,
      bufferMinutes: null,
      routeKm: null,
      confidenceScore: null,
    },
    live: {
      minMinutes: liveMinutes,
      maxMinutes: liveMinutes,
      promisedDeliveryAt: event.livePromisedDeliveryAt ?? prev?.live?.promisedDeliveryAt ?? at,
      reason: event.reason ?? event.stageAware.etaSource ?? "STATUS_CHANGE",
      createdAt: at,
    },
    customer: event.customer,
    stageAware: { ...event.stageAware, etaVersion: version },
  };
}

/** Prefer server pickup/rider-to-merchant ETA over local route approximation. */
export function pickupDeadlineIso(eta: OrderEtaResponse | null): string | null {
  if (!eta) return null;
  const leg =
    eta.stageAware?.pickupEta ??
    eta.stageAware?.riderToMerchantEta ??
    eta.stageAware?.displayEta;
  if (leg != null && Number.isFinite(leg) && leg >= 0) {
    return new Date(Date.now() + leg * 60_000).toISOString();
  }
  const promiseIso = eta.firstEtaAt || eta.promise.promisedDeliveryAt;
  if (!promiseIso) return null;
  const t = new Date(promiseIso).getTime();
  if (!Number.isFinite(t)) return null;
  const km = eta.promise.routeKm ?? 4;
  const deliveryLegMin = Math.max(8, Math.round((km / 18) * 60));
  return new Date(t - deliveryLegMin * 60_000).toISOString();
}
