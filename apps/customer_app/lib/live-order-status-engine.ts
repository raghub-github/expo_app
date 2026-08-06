/**
 * Live ETA & Customer Status Engine (client-side render only).
 *
 * Backend is the only authority for order + rider state. Client:
 *  - maps backend status / stageAware / rider assignment into exclusive UI stages
 *  - counts down from server timestamps
 * Never invents rider assignment or delivery ETA from GPS.
 */

import type { OrderEtaResponse, StageAwareEta } from "@/services/eta.service";
import { minutesUntil } from "@/services/eta.service";
import {
  isCustomerOrderOnTheWayStatus,
  isMerchantPreparingStatus,
  isRiderAtCustomerStatus,
  isRiderAtStoreStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";
import { decayServerSnapshotMinutes, effectiveNowMs } from "@/lib/server-time-offset";

/** Production stage keys (exclusive — one primary stage at a time). */
export type LiveOrderStage =
  | "ORDER_PLACED"
  | "MERCHANT_PREPARING"
  | "PREPARATION_DELAYED"
  /** Ready for pickup, no rider assigned yet. */
  | "WAITING_FOR_RIDER"
  /** Rider assigned, en route to merchant (not yet at store). */
  | "RIDER_TO_MERCHANT"
  /** Rider at merchant / waiting for handoff. */
  | "AT_STORE"
  | "PICKED_UP"
  | "NEARBY"
  | "DELIVERED"
  | "CANCELLED";

export type LiveStatusLayer = {
  key: string;
  emoji: string;
  title: string;
  subtitle: string | null;
};

export type LiveOrderStatusView = {
  stage: LiveOrderStage;
  headline: string;
  /** Optional line under headline — empty when pill carries the status. */
  reassurance: string;
  layers: LiveStatusLayer[];
  /** Pill copy (authoritative short status). */
  pillText: string;
  readyInMinutes: number | null;
  kitchenDelayed: boolean;
  deliveryWindowLabel: string | null;
  deliveryAwayMinutes: number | null;
  /** True when promised delivery time has passed while still en route. */
  deliveryLate: boolean;
  hidePrepCountdown: boolean;
};

function deliveryWindowFromPromise(
  promisedAt: string | null | undefined,
  bufferMinutes = 3
): string | null {
  if (!promisedAt?.trim()) return null;
  const mid = new Date(promisedAt);
  if (!Number.isFinite(mid.getTime())) return null;
  const start = new Date(mid.getTime() - bufferMinutes * 60_000);
  const end = new Date(mid.getTime() + bufferMinutes * 60_000);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${fmt(start)} – ${fmt(end)}`;
}

function isFoodReadyStatus(s: string, sa: string | undefined): boolean {
  return (
    sa === "READY_AWAITING_RIDER" ||
    s === "READY_FOR_PICKUP" ||
    s === "READY" ||
    s === "SEARCHING_RIDER"
  );
}

function resolveStage(args: {
  status: string;
  hasRider: boolean;
  riderReachedPickupAt?: string | null;
  stageAware?: StageAwareEta | null;
  kitchenDelayed: boolean;
}): LiveOrderStage {
  const s = normalizeCustomerOrderStatus(args.status);
  if (s === "DELIVERED") return "DELIVERED";
  if (s === "CANCELLED" || s === "PAYMENT_FAILED" || s === "FAILED") return "CANCELLED";

  const sa = args.stageAware?.currentStage;
  const atStore =
    Boolean(args.riderReachedPickupAt) ||
    sa === "AT_STORE" ||
    isRiderAtStoreStatus(s);
  const foodReady = isFoodReadyStatus(s, sa);

  // Prefer backend stageAware for post-pickup lifecycle.
  // Order status wins over a stale RIDER_TO_MERCHANT ETA stage after admin Dispatched.
  if (sa === "DELIVERED" || s === "DELIVERED") return "DELIVERED";
  if (sa === "ARRIVING" || isRiderAtCustomerStatus(s)) return "NEARBY";
  if (
    sa === "CUSTOMER_DELIVERY" ||
    isCustomerOrderOnTheWayStatus(s) ||
    s === "OUT_FOR_DELIVERY" ||
    s === "DISPATCHED" ||
    s === "IN_TRANSIT" ||
    s === "ON_THE_WAY"
  ) {
    return "PICKED_UP";
  }
  if (sa === "AT_STORE" || (args.hasRider && atStore && !isCustomerOrderOnTheWayStatus(s))) {
    return "AT_STORE";
  }

  if (s === "ORDER_PLACED" || s === "PLACED" || s === "CREATED") {
    return "ORDER_PLACED";
  }

  // Kitchen UI until food is ready — even if a rider was assigned early
  // (backend may emit RIDER_TO_MERCHANT pre-ready).
  const stillPreparing =
    !foodReady &&
    !atStore &&
    (sa === "MERCHANT_ACCEPTED" ||
      sa === "MERCHANT_PREP" ||
      isMerchantPreparingStatus(s) ||
      s === "PREPARING" ||
      s === "ACCEPTED" ||
      (sa === "RIDER_TO_MERCHANT" &&
        (isMerchantPreparingStatus(s) || s === "PREPARING" || s === "ACCEPTED")));

  if (stillPreparing) {
    if (args.kitchenDelayed) return "PREPARATION_DELAYED";
    return "MERCHANT_PREPARING";
  }

  // Ready, no rider — never show "rider arriving".
  if (sa === "READY_AWAITING_RIDER" || (foodReady && !args.hasRider)) {
    return "WAITING_FOR_RIDER";
  }

  // Rider assigned + food ready (or assigned status), not yet at store.
  if (
    args.hasRider &&
    !atStore &&
    (sa === "RIDER_TO_MERCHANT" ||
      foodReady ||
      s === "RIDER_ASSIGNED" ||
      s === "ASSIGNED")
  ) {
    return "RIDER_TO_MERCHANT";
  }

  // Stale RIDER_TO_MERCHANT / ready without assignment evidence → waiting.
  if ((sa === "RIDER_TO_MERCHANT" || foodReady) && !args.hasRider) {
    return "WAITING_FOR_RIDER";
  }

  if (args.hasRider) return "RIDER_TO_MERCHANT";

  return "ORDER_PLACED";
}

/** Overdue accept copy (ORDER_PLACED past 2 mins). */
export const ORDER_PLACED_OVERDUE_MESSAGE =
  "Confirmation is taking a little longer than usual.";

function minutesFromTimestamp(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso?.trim()) return null;
  const m = minutesUntil(iso, new Date(nowMs));
  if (m == null) return null;
  return Math.max(0, Math.round(m));
}

/**
 * Build the exclusive live status model for the tracking hero.
 */
export function buildLiveOrderStatusView(args: {
  status: string;
  hasRider: boolean;
  riderName?: string | null;
  riderReachedPickupAt?: string | null;
  prepReadyByAt?: string | null;
  eta: OrderEtaResponse | null | undefined;
  merchantDelayed?: boolean;
  nowMs?: number;
}): LiveOrderStatusView {
  const nowMs = args.nowMs ?? effectiveNowMs();
  const readyBy =
    args.eta?.prep?.readyByAt?.trim() ||
    args.prepReadyByAt?.trim() ||
    null;
  const readyUntilRaw = readyBy ? minutesUntil(readyBy, new Date(nowMs)) : null;
  const pastReady = readyUntilRaw != null && readyUntilRaw < 0;
  const statusNorm = normalizeCustomerOrderStatus(args.status);

  const kitchenDelayed =
    (Boolean(args.merchantDelayed) ||
      Boolean(args.eta?.customer?.merchantDelayed) ||
      pastReady) &&
    args.eta?.stageAware?.currentStage !== "READY_AWAITING_RIDER" &&
    statusNorm !== "READY_FOR_PICKUP" &&
    statusNorm !== "READY" &&
    statusNorm !== "SEARCHING_RIDER";

  const stage = resolveStage({
    status: args.status,
    hasRider: args.hasRider,
    riderReachedPickupAt: args.riderReachedPickupAt,
    stageAware: args.eta?.stageAware,
    kitchenDelayed:
      kitchenDelayed &&
      !isCustomerOrderOnTheWayStatus(args.status) &&
      !isRiderAtCustomerStatus(args.status) &&
      args.eta?.stageAware?.currentStage !== "RIDER_TO_MERCHANT" &&
      args.eta?.stageAware?.currentStage !== "AT_STORE" &&
      args.eta?.stageAware?.currentStage !== "CUSTOMER_DELIVERY" &&
      args.eta?.stageAware?.currentStage !== "ARRIVING" &&
      args.eta?.stageAware?.currentStage !== "READY_AWAITING_RIDER",
  });

  const readyInMinutes =
    (stage === "MERCHANT_PREPARING" || stage === "PREPARATION_DELAYED") &&
    readyUntilRaw != null &&
    readyUntilRaw > 0
      ? Math.round(readyUntilRaw)
      : null;

  const promisedAt =
    args.eta?.live?.promisedDeliveryAt?.trim() ||
    args.eta?.stageAware?.promisedAt?.trim() ||
    args.eta?.promise?.promisedDeliveryAt?.trim() ||
    null;

  const deliveryWindowLabel =
    stage === "PICKED_UP" || stage === "NEARBY"
      ? deliveryWindowFromPromise(promisedAt, args.eta?.promise?.bufferMinutes ?? 3)
      : null;

  const deliveryAwayMinutes =
    stage === "PICKED_UP" || stage === "NEARBY"
      ? minutesFromTimestamp(promisedAt, nowMs)
      : null;

  const deliveryLate =
    (stage === "PICKED_UP" || stage === "NEARBY") &&
    Boolean(promisedAt?.trim()) &&
    Number.isFinite(Date.parse(promisedAt!)) &&
    Date.parse(promisedAt!) < nowMs;

  const layers: LiveStatusLayer[] = [];
  let headline = "Order in progress";
  let reassurance = "";
  let pillText = "Live updates on";

  switch (stage) {
    case "ORDER_PLACED":
      headline = "Order placed successfully";
      reassurance = "Restaurant is reviewing your order.";
      pillText = "Usually responds within 2 mins";
      layers.push({
        key: "placed",
        emoji: "✅",
        title: "Order placed",
        subtitle: "Waiting for restaurant confirmation",
      });
      break;

    case "MERCHANT_PREPARING":
      headline = "Preparing your order";
      reassurance = "Your meal is being freshly prepared.";
      pillText =
        readyInMinutes != null
          ? `👨‍🍳 Ready in ${readyInMinutes} ${readyInMinutes === 1 ? "min" : "mins"}`
          : "👨‍🍳 Preparing your order";
      layers.push({
        key: "prep",
        emoji: "👨‍🍳",
        title: "Preparing your order",
        subtitle:
          readyInMinutes != null
            ? `Ready in ${readyInMinutes} ${readyInMinutes === 1 ? "min" : "mins"}`
            : "Your meal is being freshly prepared",
      });
      break;

    case "PREPARATION_DELAYED":
      headline = "Restaurant is taking longer than expected";
      reassurance = "";
      pillText = "We're following up with the restaurant.";
      layers.push({
        key: "delay",
        emoji: "👨‍🍳",
        title: "Taking a little longer than expected",
        subtitle:
          readyInMinutes != null
            ? `Updated ETA · Ready in ${readyInMinutes} ${readyInMinutes === 1 ? "min" : "mins"}`
            : "Thanks for your patience",
      });
      break;

    case "WAITING_FOR_RIDER":
      headline = "Order is ready for pickup";
      reassurance = "";
      pillText = "📦 Waiting for a delivery partner";
      // No inline status card — pill carries ready + waiting copy.
      break;

    case "RIDER_TO_MERCHANT":
      headline = "Order is ready for pickup";
      reassurance = "";
      pillText = "🚴 Rider arriving at the restaurant";
      // No inline status card — pill only.
      break;

    case "AT_STORE":
      headline = "Order is ready for pickup";
      reassurance = "";
      pillText = "📦 Handing off the order ASAP";
      // No inline status card — pill only.
      break;

    case "PICKED_UP": {
      headline = "Order is on the way";
      reassurance = "";
      // Prefer live countdown; when promised ETA is past, keep minutes + "Slight delay"
      // instead of collapsing to a vague "Arriving soon".
      const awayMins =
        deliveryAwayMinutes != null && deliveryAwayMinutes > 0
          ? deliveryAwayMinutes
          : null;
      if (awayMins != null) {
        const minLabel = awayMins === 1 ? "min" : "mins";
        pillText = deliveryLate
          ? `Arriving in ${awayMins} ${minLabel} • Slight delay`
          : `Arriving in ${awayMins} ${minLabel}`;
      } else if (deliveryLate) {
        pillText = "Slight delay · Arriving soon";
      } else {
        pillText = "Arriving soon";
      }
      break;
    }

    case "NEARBY":
      headline = "Rider is nearby";
      reassurance = "";
      pillText = "📍 Arriving soon";
      // No inline status card — pill only.
      break;

    case "DELIVERED":
      headline = "Delivered successfully";
      reassurance = "";
      pillText = "✅ Order delivered";
      layers.push({
        key: "done",
        emoji: "✅",
        title: "Order delivered",
        subtitle: null,
      });
      break;

    case "CANCELLED":
      headline = "Order cancelled";
      reassurance = "";
      pillText = "Order cancelled";
      layers.push({
        key: "cancel",
        emoji: "✕",
        title: "Order cancelled",
        subtitle: null,
      });
      break;
  }

  return {
    stage,
    headline,
    reassurance,
    layers,
    pillText,
    readyInMinutes,
    kitchenDelayed: stage === "PREPARATION_DELAYED",
    deliveryWindowLabel,
    deliveryAwayMinutes,
    deliveryLate,
    hidePrepCountdown:
      stage === "ORDER_PLACED" ||
      stage === "WAITING_FOR_RIDER" ||
      stage === "AT_STORE" ||
      stage === "NEARBY" ||
      stage === "PICKED_UP",
  };
}

/** Kitchen countdown from prep.readyByAt only (never invents). */
export function resolveKitchenReadyCountdownMinutes(
  eta: OrderEtaResponse | null | undefined,
  prepReadyByAt: string | null | undefined,
  nowMs: number = effectiveNowMs()
): number | null {
  const readyBy = eta?.prep?.readyByAt?.trim() || prepReadyByAt?.trim() || null;
  if (!readyBy) return null;
  const m = minutesUntil(readyBy, new Date(nowMs));
  if (m == null) return null;
  return Math.max(0, Math.round(m));
}
