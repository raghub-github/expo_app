/**
 * Enterprise stage-aware ETA model (Food • Grocery • Parcel • Ride-ready).
 * Server is authoritative — clients render this; they must not invent stages.
 */

import { MIN_ACTIVE_ETA } from "./eta.customer-view.js";

export type EtaOperationalStage =
  | "MERCHANT_ACCEPTED"
  | "MERCHANT_PREP"
  | "READY_AWAITING_RIDER"
  | "RIDER_TO_MERCHANT"
  | "AT_STORE"
  | "CUSTOMER_DELIVERY"
  | "ARRIVING"
  | "DELIVERED";

export type EtaConfidence = "HIGH" | "MEDIUM" | "LOW";

export type EtaSource =
  | "INITIAL_ESTIMATE"
  | "MERCHANT_DELAY"
  | "TRAFFIC"
  | "RIDER_MOVEMENT"
  | "SERVER_OVERRIDE"
  | "MANUAL_OVERRIDE"
  | "WEATHER"
  | "GPS_RECOVERED"
  | "GPS_LOST"
  | "REROUTE"
  | "STATUS_CHANGE"
  | "LIVE_TICK";

/** Legs used by the live engine (minutes). */
export type LiveEtaLegs = {
  remainingPrep: number;
  pickupLeg: number;
  travelLeg: number;
  total: number;
};

export type StageAwareEta = {
  currentStage: EtaOperationalStage;
  merchantPrepEta: number | null;
  riderToMerchantEta: number | null;
  pickupEta: number | null;
  customerDeliveryEta: number | null;
  /** Minutes the customer should see for the *current* stage (not always total). */
  displayEta: number | null;
  totalEta: number;
  etaVersion: number;
  etaSource: EtaSource;
  confidence: EtaConfidence;
  promisedAt: string | null;
  lastUpdatedAt: string;
  freezeCountdown: boolean;
};

export function resolveOperationalStage(args: {
  delivered: boolean;
  pickedUp: boolean;
  ready: boolean;
  hasRider: boolean;
  riderAtStore: boolean;
  arrivingSoon?: boolean;
}): EtaOperationalStage {
  if (args.delivered) return "DELIVERED";
  if (args.pickedUp) {
    return args.arrivingSoon ? "ARRIVING" : "CUSTOMER_DELIVERY";
  }
  if (args.riderAtStore) return "AT_STORE";
  if (args.ready && args.hasRider) return "RIDER_TO_MERCHANT";
  if (args.ready) return "READY_AWAITING_RIDER";
  if (args.hasRider) return "RIDER_TO_MERCHANT";
  return "MERCHANT_PREP";
}

export function resolveStageAwareEta(args: {
  stage: EtaOperationalStage;
  legs: LiveEtaLegs;
  merchantDelayed: boolean;
  confidenceScore?: number | null;
  etaSource?: EtaSource;
  promisedAt?: string | null;
  lastUpdatedAt?: string;
  /** Monotonic version — bump on persist; GET may use history id. */
  etaVersion?: number;
}): StageAwareEta {
  const { stage, legs } = args;
  const merchantPrepEta =
    stage === "MERCHANT_PREP" || stage === "MERCHANT_ACCEPTED"
      ? Math.max(0, legs.remainingPrep)
      : null;

  const riderToMerchantEta =
    stage === "RIDER_TO_MERCHANT"
      ? Math.max(MIN_ACTIVE_ETA, legs.pickupLeg || MIN_ACTIVE_ETA)
      : null;

  const pickupEta =
    stage === "AT_STORE" ? Math.max(1, legs.pickupLeg || 2) : null;

  const customerDeliveryEta =
    stage === "CUSTOMER_DELIVERY" || stage === "ARRIVING"
      ? Math.max(stage === "ARRIVING" ? 1 : MIN_ACTIVE_ETA, legs.travelLeg || legs.total)
      : stage === "RIDER_TO_MERCHANT" || stage === "AT_STORE" || stage === "READY_AWAITING_RIDER"
        ? Math.max(MIN_ACTIVE_ETA, legs.travelLeg)
        : stage === "MERCHANT_PREP" || stage === "MERCHANT_ACCEPTED"
          ? Math.max(MIN_ACTIVE_ETA, legs.travelLeg)
          : null;

  let displayEta: number | null = null;
  switch (stage) {
    case "DELIVERED":
      displayEta = 0;
      break;
    case "ARRIVING":
      displayEta = null; // UI shows "Arriving now"
      break;
    case "MERCHANT_PREP":
    case "MERCHANT_ACCEPTED":
      displayEta = merchantPrepEta ?? legs.total;
      break;
    case "READY_AWAITING_RIDER":
      displayEta = legs.total;
      break;
    case "RIDER_TO_MERCHANT":
      displayEta = riderToMerchantEta;
      break;
    case "AT_STORE":
      displayEta = pickupEta;
      break;
    case "CUSTOMER_DELIVERY":
      displayEta = customerDeliveryEta;
      break;
    default:
      displayEta = legs.total;
  }

  const freezeCountdown =
    stage === "AT_STORE" ||
    (args.merchantDelayed &&
      (stage === "MERCHANT_PREP" || stage === "MERCHANT_ACCEPTED"));

  const score = args.confidenceScore;
  let confidence: EtaConfidence = "MEDIUM";
  if (score != null && Number.isFinite(score)) {
    if (score >= 0.75) confidence = "HIGH";
    else if (score < 0.45) confidence = "LOW";
  }
  if (args.merchantDelayed) {
    confidence = confidence === "HIGH" ? "MEDIUM" : confidence;
  }

  return {
    currentStage: stage,
    merchantPrepEta,
    riderToMerchantEta,
    pickupEta,
    customerDeliveryEta,
    displayEta,
    totalEta: legs.total,
    etaVersion: args.etaVersion ?? 1,
    etaSource: args.etaSource ?? "STATUS_CHANGE",
    confidence,
    promisedAt: args.promisedAt ?? null,
    lastUpdatedAt: args.lastUpdatedAt ?? new Date().toISOString(),
    freezeCountdown,
  };
}
