/**
 * Customer-facing ETA context — single dynamic minute value + status copy.
 * Never exposes internal breakdown; used by GET /v1/eta and order APIs.
 */

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
  /** Stage-display ETA in minutes — stage-appropriate, not always total delivery. */
  etaMinutes: number | null;
  contextMessage: CustomerEtaContextMessage;
  contextLabel: string;
  merchantDelayed: boolean;
  /** True when live ETA differs from original promise by >= 3 min. */
  etaUpdated: boolean;
  promisedEtaMinutes: number | null;
};

const MIN_ACTIVE_ETA = 3;

const CONTEXT_LABELS: Record<CustomerEtaContextMessage, string> = {
  PREPARING: "Preparing your order",
  MERCHANT_DELAYED: "Restaurant is taking longer than expected",
  READY_FOR_PICKUP: "Order is ready for pickup",
  RIDER_TO_MERCHANT: "Rider arriving at the restaurant",
  RIDER_PICKING_UP: "Handing off the order ASAP",
  ON_THE_WAY: "On the way",
  ALMOST_THERE: "Arriving now",
  DELIVERED: "Delivered",
  UPDATING: "Updating delivery estimate",
};

export function formatCustomerEtaMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const m = Math.round(minutes);
  if (m <= 0) return null;
  return `${m} min`;
}

export function resolveCustomerEtaContext(args: {
  orderStatus: string;
  currentEtaMinutes: number | null;
  promisedEtaMinutes: number | null;
  merchantDelayed: boolean;
  hasRider: boolean;
  riderAtStore: boolean;
  isReady: boolean;
  isPickedUp: boolean;
}): CustomerEtaView {
  const status = args.orderStatus.trim().toUpperCase();
  const promised = args.promisedEtaMinutes;
  let eta = args.currentEtaMinutes;

  if (status === "DELIVERED") {
    return {
      etaMinutes: 0,
      contextMessage: "DELIVERED",
      contextLabel: CONTEXT_LABELS.DELIVERED,
      merchantDelayed: args.merchantDelayed,
      etaUpdated: false,
      promisedEtaMinutes: promised,
    };
  }

  if (eta != null && eta > 0 && eta < MIN_ACTIVE_ETA) {
    eta = MIN_ACTIVE_ETA;
  }

  let contextMessage: CustomerEtaContextMessage = "PREPARING";

  if (args.merchantDelayed && !args.isReady && !args.isPickedUp) {
    contextMessage = "MERCHANT_DELAYED";
  } else if (args.isPickedUp || status === "OUT_FOR_DELIVERY" || status === "IN_TRANSIT" || status === "PICKED_UP") {
    if (eta != null && eta <= 2) {
      contextMessage = "ALMOST_THERE";
    } else {
      contextMessage = "ON_THE_WAY";
    }
  } else if (args.riderAtStore) {
    contextMessage = "RIDER_PICKING_UP";
  } else if (args.isReady || status === "READY_FOR_PICKUP" || status === "READY") {
    if (args.hasRider) {
      // Stage 3: ready + rider en route to merchant — NOT customer delivery ETA copy.
      contextMessage = "RIDER_TO_MERCHANT";
    } else {
      contextMessage = "READY_FOR_PICKUP";
    }
  } else if (args.hasRider && (status === "RIDER_ASSIGNED" || status === "ASSIGNED" || status === "PREPARING")) {
    contextMessage = "RIDER_TO_MERCHANT";
  } else if (
    status === "PREPARING" ||
    status === "ACCEPTED" ||
    status === "ORDER_PLACED" ||
    status === "PLACED"
  ) {
    contextMessage = args.merchantDelayed ? "MERCHANT_DELAYED" : "PREPARING";
  } else if (eta == null) {
    contextMessage = "UPDATING";
  }

  const etaUpdated =
    promised != null &&
    eta != null &&
    Math.abs(eta - promised) >= 3;

  return {
    etaMinutes: eta,
    contextMessage,
    contextLabel: CONTEXT_LABELS[contextMessage],
    merchantDelayed: args.merchantDelayed,
    etaUpdated,
    promisedEtaMinutes: promised,
  };
}

export { CONTEXT_LABELS as CUSTOMER_ETA_CONTEXT_LABELS, MIN_ACTIVE_ETA };
