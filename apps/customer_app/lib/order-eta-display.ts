import type { OrderEtaResponse } from "@/services/eta.service";
import { minutesUntil } from "@/services/eta.service";

/** Resolve live ETA minutes from server snapshot for tracking UI. */
export function resolveLiveEtaMinutes(eta: OrderEtaResponse | null | undefined): number | null {
  if (!eta) return null;
  if (eta.live?.promisedDeliveryAt) {
    const m = minutesUntil(eta.live.promisedDeliveryAt);
    if (m != null && m > 0) return m;
  }
  if (eta.promise?.promisedDeliveryAt) {
    const m = minutesUntil(eta.promise.promisedDeliveryAt);
    if (m != null && m > 0) return m;
  }
  return eta.live?.maxMinutes ?? eta.promise?.maxMinutes ?? null;
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
      ? ` Updated arrival ~${etaMinutes} mins.`
      : "";
  return `${store} needs ${additionalMinutes} more min to prepare your order.${etaPart}`;
}
