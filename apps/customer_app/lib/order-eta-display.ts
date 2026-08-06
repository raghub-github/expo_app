import type { OrderEtaResponse } from "@/services/eta.service";
import { minutesUntil } from "@/services/eta.service";
import {
  decayServerSnapshotMinutes,
  effectiveNowMs,
} from "@/lib/server-time-offset";

/**
 * Live countdown minutes — derived only from server timestamps (or aged
 * server snapshot minutes when a timestamp is not yet available for that leg).
 * Never invents ETA from GPS / local heuristics.
 */
export function resolveDisplayEtaMinutes(
  eta: OrderEtaResponse | null | undefined,
  nowMs: number = effectiveNowMs()
): number | null {
  if (!eta) return null;
  if (eta.customer?.contextMessage === "DELIVERED") return 0;

  const stage = eta.stageAware;
  if (stage?.currentStage === "ARRIVING") return null;
  if (stage?.currentStage === "DELIVERED") return 0;

  const now = new Date(nowMs);

  const deliveryStage =
    stage?.currentStage === "CUSTOMER_DELIVERY" ||
    eta.customer?.contextMessage === "ON_THE_WAY" ||
    eta.customer?.contextMessage === "ALMOST_THERE";

  const riderToMerchantStage =
    stage?.currentStage === "RIDER_TO_MERCHANT" ||
    eta.customer?.contextMessage === "RIDER_TO_MERCHANT";

  const prepStage =
    !deliveryStage &&
    !riderToMerchantStage &&
    (stage?.currentStage === "MERCHANT_ACCEPTED" ||
      stage?.currentStage === "MERCHANT_PREP" ||
      stage?.currentStage === "READY_AWAITING_RIDER" ||
      stage?.currentStage === "AT_STORE" ||
      eta.customer?.contextMessage === "PREPARING" ||
      eta.customer?.contextMessage === "MERCHANT_DELAYED" ||
      eta.customer?.contextMessage === "READY_FOR_PICKUP" ||
      eta.customer?.contextMessage === "RIDER_PICKING_UP" ||
      Boolean(eta.prep?.readyByAt));

  // Kitchen ready clock — remaining = readyByAt - now (never negative)
  if (prepStage) {
    const readyBy = eta.prep?.readyByAt?.trim() || null;
    if (readyBy) {
      const m = minutesUntil(readyBy, now);
      if (m != null) return Math.max(0, Math.round(m));
    }
    return null;
  }

  // Rider heading to store — age server snapshot; do not invent from GPS
  if (riderToMerchantStage) {
    return decayServerSnapshotMinutes(
      stage?.riderToMerchantEta,
      stage?.lastUpdatedAt,
      nowMs
    );
  }

  // Delivery clock after pickup — only from promised timestamps
  if (deliveryStage) {
    const liveAt =
      eta.live?.promisedDeliveryAt?.trim() ||
      stage?.promisedAt?.trim() ||
      null;
    if (liveAt) {
      const m = minutesUntil(liveAt, now);
      if (m != null) return Math.max(0, Math.round(m));
    }
    return null;
  }

  // Prefer kitchen timestamp if present even without stage classification
  const readyBy = eta.prep?.readyByAt?.trim() || null;
  if (readyBy) {
    const m = minutesUntil(readyBy, now);
    if (m != null) return Math.max(0, Math.round(m));
  }

  return null;
}

/** Resolve the single dynamic ETA minute value for customer tracking UI. */
export function resolveLiveEtaMinutes(eta: OrderEtaResponse | null | undefined): number | null {
  return resolveDisplayEtaMinutes(eta, effectiveNowMs());
}

export function resolveCustomerEtaContextLabel(eta: OrderEtaResponse | null | undefined): string | null {
  return eta?.customer?.contextLabel?.trim() || null;
}

export function isMerchantEtaDelayed(eta: OrderEtaResponse | null | undefined): boolean {
  return eta?.customer?.merchantDelayed === true;
}

export function isEtaUpdatedFromPromise(eta: OrderEtaResponse | null | undefined): boolean {
  return eta?.customer?.etaUpdated === true;
}

/** Build customer-facing prep-delay marquee copy. */
export function buildPrepDelayMessage(
  additionalMinutes: number,
  etaMinutes?: number | null,
  storeName?: string | null
): string {
  const store = (storeName ?? "Restaurant").trim() || "Restaurant";
  const etaPart =
    etaMinutes != null && Number.isFinite(etaMinutes) && etaMinutes > 0
      ? ` Updated arrival in ${etaMinutes} min.`
      : "";
  return `${store} needs ${additionalMinutes} more min to prepare your order.${etaPart}`;
}

/** Single ETA display — e.g. "23 min" (never a range). */
export function formatSingleEtaMinutes(etaMinutes: number | null | undefined): string {
  if (etaMinutes != null && etaMinutes > 0) {
    return `${Math.round(etaMinutes)} min`;
  }
  return "Updating…";
}
