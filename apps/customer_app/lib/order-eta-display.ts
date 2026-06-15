import type { OrderEtaResponse } from "@/services/eta.service";
import { minutesUntil } from "@/services/eta.service";

const MIN_ACTIVE_ETA = 3;

/** Resolve the single dynamic ETA minute value for customer tracking UI. */
export function resolveLiveEtaMinutes(eta: OrderEtaResponse | null | undefined): number | null {
  if (!eta) return null;

  const fromCustomer = eta.customer?.etaMinutes;
  if (fromCustomer != null && Number.isFinite(fromCustomer)) {
    if (eta.customer?.contextMessage === "DELIVERED") return 0;
    if (fromCustomer > 0) return Math.round(fromCustomer);
    if (fromCustomer === 0) return null;
  }

  if (eta.live?.maxMinutes != null && eta.live.maxMinutes >= MIN_ACTIVE_ETA) {
    return Math.round(eta.live.maxMinutes);
  }

  if (eta.live?.promisedDeliveryAt) {
    const m = minutesUntil(eta.live.promisedDeliveryAt);
    if (m != null && m >= MIN_ACTIVE_ETA) return m;
  }

  if (eta.promise?.promisedDeliveryAt) {
    const m = minutesUntil(eta.promise.promisedDeliveryAt);
    if (m != null && m >= MIN_ACTIVE_ETA) return m;
  }

  const fallback = eta.promise?.maxMinutes ?? eta.live?.maxMinutes ?? null;
  if (fallback != null && fallback >= MIN_ACTIVE_ETA) return Math.round(fallback);

  return null;
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
