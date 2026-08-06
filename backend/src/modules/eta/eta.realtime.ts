/**
 * Real-time ETA fan-out — Redis → ws-gateway → order:{id} (+ rider:{id}).
 * Only publish when a meaningful ETA field actually changes (dedupe).
 */
import { publishOrderEvent, publishRiderEvent } from "../realtime/publish.js";
import type { CustomerEtaView } from "./eta.customer-view.js";
import type { StageAwareEta } from "./eta.stage-aware.js";

export const ETA_UPDATED_EVENT = "eta.updated.v1" as const;

/** Display ETA must jump by at least this many minutes to create an audit row. */
export const ETA_AUDIT_MIN_DISPLAY_DELTA = 5;

export type EtaUpdatedPayload = {
  type: typeof ETA_UPDATED_EVENT;
  orderIdText: string;
  orderId: string;
  etaVersion: number;
  reason: string;
  customer: CustomerEtaView;
  stageAware: StageAwareEta;
  livePromisedDeliveryAt: string | null;
  /** Merchant prep target clock — client countdowns from this. */
  prepReadyByAt: string | null;
  prepMinutes: number | null;
  currentEtaMinutes: number;
  /** Server wall clock for client clock-skew correction. */
  serverNow: string;
  at: string;
};

/**
 * Fingerprint of fields that justify a client push / audit row.
 * Excludes wall-clock promisedAt, countdown minutes, and noisy order-status labels.
 */
export function etaMeaningfulFingerprint(
  stageAware: StageAwareEta,
  customer?: Pick<CustomerEtaView, "etaMinutes" | "contextMessage" | "merchantDelayed"> | null,
  extras?: { orderStatus?: string | null; merchantDelayMinutes?: number | null }
): string {
  const source =
    stageAware.etaSource === "LIVE_TICK" || stageAware.etaSource === "STATUS_CHANGE"
      ? "STATUS"
      : stageAware.etaSource;
  return [
    stageAware.currentStage,
    stageAware.confidence,
    stageAware.freezeCountdown ? "1" : "0",
    source,
    customer?.merchantDelayed ? "1" : "0",
    // Boolean only — growing delay minutes would spam audits every tick.
    extras?.merchantDelayMinutes != null && extras.merchantDelayMinutes > 0 ? "1" : "0",
    customer?.contextMessage ?? "",
  ].join("|");
}

/**
 * Audit gate: store major lifecycle / significant ETA revisions only.
 * LIVE_TICK never writes history (countdown is not an audit event).
 */
export function shouldAppendEtaHistory(args: {
  reason: string;
  prevFingerprint: string | null | undefined;
  nextFingerprint: string;
  prevStage: string | null | undefined;
  nextStage: string;
  prevDisplayEta: number | null | undefined;
  nextDisplayEta: number | null;
  hasPriorHistory: boolean;
}): boolean {
  const reason = String(args.reason ?? "").toUpperCase();
  const alwaysAudit = new Set([
    "ORDER_PLACED",
    "RIDER_ASSIGNED",
    "RIDER_PICKED_UP",
    "TRAFFIC_UPDATE",
    "WEATHER_UPDATE",
    "BATCHING_CHANGE",
    "MANUAL_OVERRIDE",
  ]);

  if (!args.hasPriorHistory) return true;
  if (alwaysAudit.has(reason)) return true;

  const stageChanged = (args.prevStage ?? null) !== args.nextStage;
  if (stageChanged) return true;

  // Periodic tick: never insert — clocks refresh on orders_core only.
  if (reason === "LIVE_TICK") return false;

  // Structural fingerprint (stage/delay/confidence/freeze/context).
  if (hasMeaningfulEtaChange(args.prevFingerprint, args.nextFingerprint)) {
    return true;
  }

  // Same stage / same structure: only keep a meaningful display jump.
  const prev = args.prevDisplayEta;
  const next = args.nextDisplayEta;
  if (prev == null || next == null) return false;
  return Math.abs(next - prev) >= ETA_AUDIT_MIN_DISPLAY_DELTA;
}

export function hasMeaningfulEtaChange(
  prev: string | null | undefined,
  next: string
): boolean {
  if (!prev) return true;
  return prev !== next;
}

export function parseStageAwareFromHistoryMetadata(
  metadata: unknown
): StageAwareEta | null {
  if (!metadata || typeof metadata !== "object") return null;
  const sa = (metadata as Record<string, unknown>).stageAware;
  if (!sa || typeof sa !== "object") return null;
  const o = sa as Record<string, unknown>;
  if (typeof o.currentStage !== "string" || typeof o.totalEta !== "number") return null;
  return sa as StageAwareEta;
}

export async function publishEtaUpdated(args: {
  orderIdText: string;
  riderId?: number | null;
  payload: Omit<EtaUpdatedPayload, "type" | "orderIdText" | "orderId" | "serverNow" | "at"> & {
    orderIdText?: string;
    serverNow?: string;
    at?: string;
  };
}): Promise<void> {
  const orderIdText = args.orderIdText;
  const nowIso = new Date().toISOString();
  const body: EtaUpdatedPayload = {
    type: ETA_UPDATED_EVENT,
    orderIdText,
    orderId: orderIdText,
    serverNow: args.payload.serverNow ?? nowIso,
    at: args.payload.at ?? nowIso,
    etaVersion: args.payload.etaVersion,
    reason: args.payload.reason,
    customer: args.payload.customer,
    stageAware: args.payload.stageAware,
    livePromisedDeliveryAt: args.payload.livePromisedDeliveryAt,
    prepReadyByAt: args.payload.prepReadyByAt,
    prepMinutes: args.payload.prepMinutes,
    currentEtaMinutes: args.payload.currentEtaMinutes,
  };
  await publishOrderEvent(orderIdText, body);
  if (args.riderId != null && args.riderId > 0) {
    await publishRiderEvent(args.riderId, body);
  }
}
