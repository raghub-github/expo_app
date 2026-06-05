import type { NormalizedOrderItem } from "../modules/orders/orderNormalizer.js";

export type FoodOrderLineItem = {
  item_id: number;
  item_name: string;
  quantity: number;
  price: number;
  variant: string | null;
  customization: string | null;
  addons: string[];
  addon_prices: number[];
  veg_non_veg: string | null;
  item_instructions: string | null;
  packaging_charges: number;
  subtotal: number;
  final_amount: number;
};

function readSnapshotField(
  snap: Record<string, unknown> | null,
  ...keys: string[]
): unknown {
  if (!snap) return null;
  for (const k of keys) {
    if (snap[k] != null && snap[k] !== "") return snap[k];
  }
  return null;
}

function asNonNeg(n: unknown): number {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Build canonical JSON array persisted on orders_core.items and orders_food.items. */
export function buildFoodOrderItemsPayload(items: NormalizedOrderItem[]): FoodOrderLineItem[] {
  return items.map((i) => {
    const snap = i.itemSnapshot;
    const addonPerUnit = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity, 0);
    const lineSubtotal = i.basePrice * i.quantity;
    const lineAddonTotal = addonPerUnit * i.quantity;
    const finalAmount = lineSubtotal + lineAddonTotal;
    const packaging = asNonNeg(
      readSnapshotField(snap, "packaging_charges", "packagingCharges", "packaging_charge")
    );
    const vegRaw =
      readSnapshotField(snap, "veg_non_veg", "vegNonveg", "food_type", "veg_nonveg") ??
      readSnapshotField(snap, "vegNonVeg");
    const customization =
      readSnapshotField(snap, "customization", "customizations", "special_instructions") ??
      null;
    const instructions =
      readSnapshotField(snap, "item_instructions", "instructions", "note") ?? null;

    return {
      item_id: i.menuItemId,
      item_name: i.itemName,
      quantity: i.quantity,
      price: i.basePrice,
      variant: i.variantName,
      customization: customization != null ? String(customization) : null,
      addons: i.addons.map((a) => a.addonName).filter(Boolean),
      addon_prices: i.addons.map((a) => a.addonPrice),
      veg_non_veg: vegRaw != null ? String(vegRaw) : null,
      item_instructions: instructions != null ? String(instructions) : null,
      packaging_charges: packaging,
      subtotal: Math.round((lineSubtotal + packaging) * 100) / 100,
      final_amount: Math.round((finalAmount + packaging) * 100) / 100,
    };
  });
}

export function sumFoodItemQuantities(items: NormalizedOrderItem[]): number {
  return items.reduce((s, i) => s + i.quantity, 0);
}

export type VegNonVegAggregate = "veg" | "non_veg" | "mixed" | "na";

/** Derive order-level veg flag from line items (snapshot or line veg field). */
export function aggregateVegNonVeg(items: FoodOrderLineItem[]): VegNonVegAggregate | null {
  const types = new Set<string>();
  for (const line of items) {
    const t = (line.veg_non_veg ?? "").toLowerCase().trim();
    if (!t) continue;
    if (t.includes("non") && t.includes("veg")) types.add("non_veg");
    else if (t.includes("egg")) types.add("na");
    else if (t.includes("veg")) types.add("veg");
    else if (t === "mixed" || t === "na") types.add(t);
  }
  if (types.size === 0) return null;
  if (types.size === 1) return [...types][0] as VegNonVegAggregate;
  return "mixed";
}

export function deliveryInstructionsFromCheckout(
  checkoutMetadata: Record<string, unknown> | null | undefined
): string | null {
  if (!checkoutMetadata || typeof checkoutMetadata !== "object") return null;
  const parts: string[] = [];
  const delivery = checkoutMetadata.deliveryInstructions;
  if (typeof delivery === "string" && delivery.trim()) parts.push(delivery.trim());
  const restaurant = checkoutMetadata.restaurantNote;
  if (typeof restaurant === "string" && restaurant.trim()) {
    parts.push(`Restaurant: ${restaurant.trim()}`);
  }
  const flags: string[] = [];
  if (checkoutMetadata.leaveAtDoor) flags.push("Leave at door");
  if (checkoutMetadata.leaveWithGuard) flags.push("Leave with guard");
  if (checkoutMetadata.avoidCalling) flags.push("Avoid calling");
  if (checkoutMetadata.dontRingBell) flags.push("Do not ring bell");
  if (checkoutMetadata.petAtHome) flags.push("Pet at home");
  if (checkoutMetadata.skipCutlery) flags.push("No cutlery");
  if (flags.length) parts.push(flags.join("; "));
  const scheduled = checkoutMetadata.scheduledDeliverySummary;
  if (typeof scheduled === "string" && scheduled.trim()) {
    parts.push(`Scheduled: ${scheduled.trim()}`);
  }
  const joined = parts.join(" | ").trim();
  return joined || null;
}

export function requiresUtensilsFromCheckout(
  checkoutMetadata: Record<string, unknown> | null | undefined
): boolean {
  if (!checkoutMetadata || typeof checkoutMetadata !== "object") return true;
  return checkoutMetadata.skipCutlery !== true;
}

/** Rider-facing instruction tags (leave at door, don't ring bell, etc.). */
export function buildDeliveryInstructionsArray(
  checkoutMetadata: Record<string, unknown> | null | undefined
): string[] {
  if (!checkoutMetadata || typeof checkoutMetadata !== "object") return [];
  const out: string[] = [];
  const freeText = checkoutMetadata.deliveryInstructions;
  if (typeof freeText === "string" && freeText.trim()) {
    out.push(freeText.trim());
  }
  if (checkoutMetadata.leaveAtDoor === true) out.push("Leave at door");
  if (checkoutMetadata.leaveWithGuard === true) out.push("Leave with guard");
  if (checkoutMetadata.avoidCalling === true) out.push("Avoid calling");
  if (checkoutMetadata.dontRingBell === true) out.push("Do not ring bell");
  if (checkoutMetadata.petAtHome === true) out.push("Pet at home");
  return [...new Set(out)];
}

/** Kitchen / merchant-facing notes (no cutlery, custom text). */
export function buildMerchantInstructionsArray(
  checkoutMetadata: Record<string, unknown> | null | undefined
): string[] {
  if (!checkoutMetadata || typeof checkoutMetadata !== "object") return [];
  const out: string[] = [];
  const note = checkoutMetadata.restaurantNote;
  if (typeof note === "string" && note.trim()) {
    out.push(note.trim());
  }
  if (checkoutMetadata.skipCutlery === true) {
    out.push("Don't send cutlery");
  }
  return [...new Set(out)];
}

export function isScheduledOrderFromCheckout(
  checkoutMetadata: Record<string, unknown> | null | undefined
): boolean {
  if (!checkoutMetadata || typeof checkoutMetadata !== "object") return false;
  const summary = checkoutMetadata.scheduledDeliverySummary;
  return typeof summary === "string" && summary.trim().length > 0;
}

export function etaSecondsFromBillingSnapshot(
  billingSnapshot: Record<string, unknown> | null | undefined
): number | null {
  if (!billingSnapshot || typeof billingSnapshot !== "object") return null;
  const durationMin =
    billingSnapshot.durationMin ??
    billingSnapshot.duration_min ??
    billingSnapshot.etaMinutes;
  const n = Number(durationMin);
  if (Number.isFinite(n) && n > 0) return Math.round(n * 60);
  const maxMin = billingSnapshot.eta_max_minutes ?? billingSnapshot.etaMaxMinutes;
  const m = Number(maxMin);
  if (Number.isFinite(m) && m > 0) return Math.round(m * 60);
  return null;
}

/** Contactless / leave-at-door from checkout metadata. */
export function contactlessFromCheckout(
  checkoutMetadata: Record<string, unknown> | null | undefined
): boolean | null {
  if (!checkoutMetadata || typeof checkoutMetadata !== "object") return null;
  if (
    checkoutMetadata.leaveAtDoor === true ||
    checkoutMetadata.contactless === true ||
    checkoutMetadata.contactLessDelivery === true
  ) {
    return true;
  }
  if (checkoutMetadata.leaveAtDoor === false) return false;
  return null;
}

/**
 * Ensure billing_snapshot has fields the dashboard order-detail sidebar reads
 * (locality, KPT, delivery type) even when billing rules are off or partial.
 */
export function enrichBillingSnapshotForPersistence(
  billingSnapshot: Record<string, unknown> | null | undefined,
  opts: {
    deliveryType: string;
    distanceKm: number;
    durationMin?: number | null;
    serviceable?: boolean | null;
    storeKptMinutes?: number | null;
  }
): Record<string, unknown> {
  const base =
    billingSnapshot && typeof billingSnapshot === "object"
      ? { ...billingSnapshot }
      : {};
  const deliveryType = opts.deliveryType || "delivery";
  if (base.deliveryType == null) base.deliveryType = deliveryType;
  if (base.distanceKm == null && Number.isFinite(opts.distanceKm)) {
    base.distanceKm = opts.distanceKm;
  }
  if (base.durationMin == null && opts.durationMin != null) {
    base.durationMin = opts.durationMin;
  }
  if (base.duration_min == null && opts.durationMin != null) {
    base.duration_min = opts.durationMin;
  }
  const kpt = opts.storeKptMinutes;
  if (kpt != null && Number.isFinite(kpt) && kpt > 0) {
    if (base.default_system_kpt_minutes == null) base.default_system_kpt_minutes = kpt;
    if (base.system_kpt_minutes == null) base.system_kpt_minutes = kpt;
  }
  if (opts.serviceable === true || opts.serviceable === false) {
    base.serviceable = opts.serviceable;
  } else if (base.serviceable == null) {
    base.serviceable = true;
  }
  if (base.computedAt == null) {
    base.computedAt = new Date().toISOString();
  }
  return base;
}
