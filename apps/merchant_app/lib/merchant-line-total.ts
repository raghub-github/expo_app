import type { ApiFoodOrderItem } from "@/services/ordersApi";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addonTotal(item: ApiFoodOrderItem): number {
  const fromField = Number(item.customizations_total) || 0;
  if (fromField > 0.005) return fromField;
  const captured = Number(item.captured_addon_amount) || 0;
  if (captured > 0.005) return round2(captured);
  const lines = item.customization_lines ?? [];
  return round2(
    lines.filter((l) => l.kind === "addon").reduce((s, l) => s + (Number(l.amount) || 0), 0)
  );
}

function baseTotal(item: ApiFoodOrderItem): number {
  const fromBreakdown = Number(item.base_amount) || 0;
  if (fromBreakdown > 0.005) return round2(fromBreakdown);

  const captured = Number(item.captured_base_amount) || 0;
  if (captured > 0.005) return round2(captured);

  const lines = item.customization_lines ?? [];
  const variantAmt = lines
    .filter((l) => l.kind === "variant")
    .reduce((s, l) => s + (Number(l.amount) || 0), 0);
  if (variantAmt > 0.005) return round2(variantAmt);

  const stored = Number(item.price) || 0;
  const cust = addonTotal(item);
  if (stored > cust + 0.005) return round2(stored - cust);
  return stored > 0.005 ? round2(stored) : 0;
}

/** Line total from API (merchant-partner); fallback base + add-ons when price missing. */
export function merchantLineTotalForFoodItem(item: ApiFoodOrderItem): number {
  const fromApi = round2(Number(item.price) || 0);
  if (fromApi > 0.005) return fromApi;

  const base = baseTotal(item);
  const cust = addonTotal(item);
  if (base > 0.005 || cust > 0.005) return round2(base + cust);
  return 0;
}

export function merchantItemLineParts(item: ApiFoodOrderItem) {
  const total = merchantLineTotalForFoodItem(item);
  const base = baseTotal(item);
  const customizations = addonTotal(item);
  return {
    base,
    customizations,
    total,
    hasCustomizations: customizations > 0.005,
    capturedBase: Number(item.captured_base_amount) || undefined,
    capturedAddon: Number(item.captured_addon_amount) || undefined,
  };
}

export function merchantBillPartsFromFoodItems(
  items: ApiFoodOrderItem[],
  pricing: { packaging: number; discount: number }
) {
  let itemsSubtotal = 0;
  let itemBaseTotal = 0;
  let customizationsTotal = 0;
  for (const it of items) {
    const parts = merchantItemLineParts(it);
    itemsSubtotal += parts.total;
    itemBaseTotal += parts.base;
    customizationsTotal += parts.customizations;
  }
  const packaging = pricing.packaging ?? 0;
  const discount = pricing.discount ?? 0;
  const total = round2(Math.max(0, itemsSubtotal + packaging - discount));
  return {
    itemsSubtotal: round2(itemsSubtotal),
    itemBaseTotal: round2(itemBaseTotal),
    customizationsTotal: round2(customizationsTotal),
    showCustomizations: customizationsTotal > 0.005,
    packaging,
    discount,
    total,
  };
}

/** Prefer API pricing.total (same as partnersite); fallback sum of line prices. */
export function merchantOrderBillTotal(
  order: {
    items?: ApiFoodOrderItem[];
    pricing?: { packaging?: number; discount?: number; total?: number } | null;
    grand_total?: number;
  }
): number {
  const pTotal = Number(order.pricing?.total);
  if (Number.isFinite(pTotal) && pTotal > 0) return round2(pTotal);
  const grand = Number(order.grand_total);
  if (Number.isFinite(grand) && grand > 0) return round2(grand);
  const items = order.items ?? [];
  return merchantBillPartsFromFoodItems(items, {
    packaging: order.pricing?.packaging ?? 0,
    discount: order.pricing?.discount ?? 0,
  }).total;
}

export function merchantOrderTotalFromItems(
  items: ApiFoodOrderItem[],
  packaging: number,
  discount: number
): number {
  return merchantBillPartsFromFoodItems(items, { packaging, discount }).total;
}

/** Merchant-facing item value before add-ons / commission markup (line base). */
export function merchantBasePriceForLineItem(item: {
  qty?: number;
  price?: number;
  base_amount?: number;
  captured_base_amount?: number;
  customizations_total?: number;
  customization_lines?: ApiFoodOrderItem["customization_lines"];
}): number {
  const base = Number(item.base_amount) || 0;
  if (base > 0.005) return Math.round(base);

  const captured = Number(item.captured_base_amount) || 0;
  if (captured > 0.005) return Math.round(captured);

  const fromField = Number(item.customizations_total) || 0;
  let cust = fromField;
  if (cust <= 0.005) {
    const lines = item.customization_lines ?? [];
    cust = round2(
      lines.filter((l) => l.kind === "addon").reduce((s, l) => s + (Number(l.amount) || 0), 0)
    );
  }

  const stored = Number(item.price) || 0;
  if (stored > cust + 0.005) return Math.round(stored - cust);
  return stored > 0.005 ? Math.round(stored) : 0;
}
