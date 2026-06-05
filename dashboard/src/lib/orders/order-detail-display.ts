/**
 * Display helpers for dashboard order detail sidebar / customer card.
 */

export function isSelfPickupDelivery(deliveryType: string | null | undefined): boolean {
  const dt = String(deliveryType ?? "").toLowerCase().replace(/-/g, "_");
  return (
    dt === "self_pickup" ||
    dt === "pickup" ||
    dt === "self" ||
    dt.includes("self_pickup") ||
    dt.includes("pick_up")
  );
}

/** Customer-facing label: Self vs Delivery */
export function formatOrderDeliveryTypeLabel(
  deliveryType: string | null | undefined
): string {
  const raw = String(deliveryType ?? "").trim();
  if (!raw || raw === "—" || raw === "-") return "—";
  if (isSelfPickupDelivery(raw)) return "Self";
  const dt = raw.toLowerCase().replace(/-/g, "_");
  if (dt === "delivery" || dt.includes("delivery")) return "Delivery";
  if (dt === "self_pickup" || dt === "pickup") return "Self";
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
}

export function formatOrderInitiatedByLabel(
  orderSource: string | null | undefined,
  deliveryInitiator: string | null | undefined
): string {
  const src = String(orderSource ?? "").toLowerCase();
  if (src === "internal") return "GatiMitra";
  if (src === "swiggy") return "Swiggy";
  if (src === "zomato") return "Zomato";
  if (src === "rapido") return "Rapido";
  if (src === "ondc") return "ONDC";
  if (src === "shiprocket") return "Shiprocket";
  if (src && src !== "other") {
    return src.charAt(0).toUpperCase() + src.slice(1);
  }

  const init = String(deliveryInitiator ?? "").toLowerCase();
  if (init === "merchant") return "Merchant";
  if (init === "customer") return "Customer";
  if (init === "system") return "GatiMitra";
  return "GatiMitra";
}

export function formatDeliveredByLabel(
  deliveredBy: string | null | undefined,
  riderId: number | null | undefined
): string {
  if (deliveredBy?.trim()) {
    const u = deliveredBy.toLowerCase().replace(/-/g, "_");
    if (
      u === "galimitra" ||
      u === "gali_mitra" ||
      u === "galimitra_direct" ||
      u === "gatimitra" ||
      u === "gatimitra_direct" ||
      u === "rider"
    ) {
      return "GaliMitra";
    }
    if (u === "merchant" || u === "self_delivery") return "Merchant";
    if (u === "third_party" || u === "3pl") return "Third party";
    if (u === "self" || u === "customer") return "Customer";
    return deliveredBy;
  }
  if (riderId != null && riderId > 0) return "GaliMitra";
  return "—";
}

export type LocalityDisplay = {
  label: string;
  isSafe: boolean;
};

export function resolveLocalityDisplay(
  billingSnapshot: unknown,
  checkoutMetadata: unknown
): LocalityDisplay | null {
  const billing =
    billingSnapshot && typeof billingSnapshot === "object"
      ? (billingSnapshot as Record<string, unknown>)
      : null;
  const checkout =
    checkoutMetadata && typeof checkoutMetadata === "object"
      ? (checkoutMetadata as Record<string, unknown>)
      : null;

  if (billing?.serviceable === true) {
    return { label: "GREEN", isSafe: true };
  }
  if (billing?.serviceable === false) {
    return { label: "RED", isSafe: false };
  }

  for (const src of [billing, checkout]) {
    if (!src) continue;
    for (const key of ["localityType", "locality_type", "locality", "dropLocalityTier"]) {
      const raw = src[key];
      if (typeof raw !== "string" || !raw.trim()) continue;
      const u = raw.trim().toUpperCase();
      if (u === "GREEN" || u === "SAFE") return { label: "GREEN", isSafe: true };
      if (u === "RED" || u === "UNSAFE" || u === "NOT_SAFE") {
        return { label: "RED", isSafe: false };
      }
      if (u === "YELLOW") return { label: "YELLOW", isSafe: false };
    }
  }

  return null;
}

export function formatKptMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return "—";
  return `${Math.round(mins)} mins`;
}

/** Cumulative minutes added via merchant "Need more time". */
export function formatMerchantExtraPrepMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return "—";
  return `+${Math.round(mins)} mins`;
}

/** Show merchant KPT only when it differs from the system default (merchant actually changed it). */
export function shouldShowMerchantUpdatedKpt(
  systemKptMinutes: number | null | undefined,
  merchantUpdatedKptMinutes: number | null | undefined
): boolean {
  const m = merchantUpdatedKptMinutes;
  if (m == null || !Number.isFinite(m) || m <= 0) return false;
  const s = systemKptMinutes;
  if (s == null || !Number.isFinite(s)) return true;
  return Math.round(m) !== Math.round(s);
}

/**
 * Merchant-committed prep at accept lives on orders_food; orders_core.merchant_updated_kpt_minutes
 * is optional legacy. Prefer food row when merchant explicitly chose prep time.
 */
export function resolveMerchantUpdatedKptMinutes(input: {
  systemKptMinutes: number | null | undefined;
  coreMerchantUpdatedKptMinutes?: number | null | undefined;
  foodPrepMinutes?: number | null | undefined;
  prepTimeSource?: string | null | undefined;
}): number | null {
  const fromCore = input.coreMerchantUpdatedKptMinutes;
  if (fromCore != null && Number.isFinite(fromCore) && fromCore > 0) {
    return shouldShowMerchantUpdatedKpt(input.systemKptMinutes, fromCore)
      ? fromCore
      : null;
  }

  const foodPrep = input.foodPrepMinutes;
  if (foodPrep == null || !Number.isFinite(foodPrep) || foodPrep <= 0) return null;

  const source = input.prepTimeSource?.trim().toLowerCase() ?? null;
  if (source === "merchant") {
    return shouldShowMerchantUpdatedKpt(input.systemKptMinutes, foodPrep)
      ? foodPrep
      : null;
  }

  return shouldShowMerchantUpdatedKpt(input.systemKptMinutes, foodPrep) ? foodPrep : null;
}

export function parseInstructionList(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        return parseInstructionList(JSON.parse(t) as unknown);
      } catch {
        return [t];
      }
    }
    return [t];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t);
    } else if (item != null && typeof item === "object") {
      const label =
        (item as { label?: string }).label ??
        (item as { text?: string }).text ??
        (item as { value?: string }).value;
      if (typeof label === "string" && label.trim()) out.push(label.trim());
    }
  }
  return out;
}

/** Rider instructions from checkout when DB jsonb list is empty (pre-migration rows). */
export function buildRiderInstructionsFromCheckout(
  checkout: Record<string, unknown> | null | undefined
): string[] {
  if (!checkout || typeof checkout !== "object") return [];
  const out: string[] = [];
  const freeText = checkout.deliveryInstructions;
  if (typeof freeText === "string" && freeText.trim()) out.push(freeText.trim());
  if (checkout.leaveAtDoor === true) out.push("Leave at door");
  if (checkout.leaveWithGuard === true) out.push("Leave with guard");
  if (checkout.avoidCalling === true) out.push("Avoid calling");
  if (checkout.dontRingBell === true) out.push("Do not ring bell");
  if (checkout.petAtHome === true) out.push("Pet at home");
  return [...new Set(out)];
}

/** Merchant instructions from checkout when `merchant_instructions_list` is empty. */
export function buildMerchantInstructionsFromCheckout(
  checkout: Record<string, unknown> | null | undefined
): string[] {
  if (!checkout || typeof checkout !== "object") return [];
  const out: string[] = [];
  const note =
    checkout.restaurantNote ??
    checkout.merchantInstructions ??
    checkout.merchant_instructions;
  if (typeof note === "string" && note.trim()) out.push(note.trim());
  if (checkout.skipCutlery === true) out.push("Don't send cutlery");
  return [...new Set(out)];
}

export function resolveFirstEtaAtIso(input: {
  firstEtaAt?: Date | string | null;
  firstEtaLegacy?: Date | string | null;
  estimatedDeliveryTime?: Date | string | null;
  etaSeconds?: number | null;
  placedAt?: Date | string | null;
  createdAt?: Date | string | null;
  billingSnapshot?: Record<string, unknown> | null;
  timelineExpectedByAt?: Date | string | null;
}): string | null {
  for (const c of [
    input.firstEtaAt,
    input.firstEtaLegacy,
    input.estimatedDeliveryTime,
    input.timelineExpectedByAt,
  ]) {
    if (c == null) continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const anchorRaw = input.placedAt ?? input.createdAt;
  if (anchorRaw != null) {
    const anchor = new Date(anchorRaw);
    if (!Number.isNaN(anchor.getTime())) {
      const sec = input.etaSeconds;
      if (sec != null && Number.isFinite(sec) && sec > 0) {
        const d = new Date(anchor.getTime() + sec * 1000);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
      const billing = input.billingSnapshot;
      const durationMin = Number(
        billing?.durationMin ?? billing?.duration_min ?? billing?.etaMinutes
      );
      if (Number.isFinite(durationMin) && durationMin > 0) {
        const d = new Date(anchor.getTime() + durationMin * 60 * 1000);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
    }
  }

  return null;
}

export function formatFirstEtaAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatScheduledOrderLabel(isScheduled: boolean): string {
  return isScheduled ? "True" : "False";
}
