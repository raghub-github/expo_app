import type { ApiFoodOrderItem } from "@/services/ordersApi";
import {
  formatBoostOfferBadge,
  isBogoOfferType,
  resolveMerchantOfferBadge,
} from "@/lib/merchant-offer-display";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function menuRupee(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

/** Merchant-facing money — whole rupees matching menu table prices. */
export function formatMerchantRs(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `₹${Math.round(n)}`;
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
  if (
    item.net_line_total != null &&
    item.catalog_line_total != null &&
    item.net_line_total < item.catalog_line_total - 0.005
  ) {
    return menuRupee(item.net_line_total);
  }
  if (item.catalog_line_total != null && item.catalog_line_total > 0.005) {
    return menuRupee(item.catalog_line_total);
  }

  const fromApi = round2(Number(item.price) || 0);
  if (fromApi > 0.005) return menuRupee(fromApi);

  const base = baseTotal(item);
  const cust = addonTotal(item);
  if (base > 0.005 || cust > 0.005) return menuRupee(base + cust);
  return 0;
}

/** Catalog vs effective selling price from frozen order snapshot. */
export function merchantFoodItemCatalogAndNet(item: ApiFoodOrderItem): {
  catalog: number;
  net: number;
  showStrike: boolean;
  offerBadge: string | null;
  offerKind: "bogo" | "boost" | "other" | null;
} {
  const lineTotal = merchantLineTotalForFoodItem(item);
  const hasCatalog =
    item.catalog_line_total != null && item.catalog_line_total > 0.005;
  const catalog = hasCatalog ? menuRupee(item.catalog_line_total!) : lineTotal;

  let net = catalog;
  if (item.net_line_total != null && Number.isFinite(item.net_line_total)) {
    net = menuRupee(item.net_line_total);
  } else if (
    item.is_item_promo &&
    item.offer_discount != null &&
    item.offer_discount > 0.005
  ) {
    net = menuRupee(Math.max(0, catalog - item.offer_discount));
  } else if (!hasCatalog) {
    net = lineTotal;
  }

  const { kind, badge } = resolveMerchantOfferBadge({
    offerType: item.applied_offer_type,
    offerLabel: item.offer_label,
  });

  // BOGO: same gross & net — badge only (no strikethrough).
  if (kind === "bogo" || isBogoOfferType(item.applied_offer_type)) {
    return {
      catalog,
      net: catalog,
      showStrike: false,
      offerBadge: badge,
      offerKind: "bogo",
    };
  }

  const showStrike = net < catalog - 0.005;
  return {
    catalog,
    net,
    showStrike,
    offerBadge: showStrike
      ? badge ?? (kind === "boost" ? formatBoostOfferBadge() : item.offer_label ?? null)
      : kind === "boost"
        ? badge ?? formatBoostOfferBadge()
        : null,
    offerKind: kind,
  };
}

export function merchantItemLineParts(item: ApiFoodOrderItem) {
  const total = merchantLineTotalForFoodItem(item);
  const base = menuRupee(baseTotal(item));
  const customizations = menuRupee(addonTotal(item));
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
  const total = menuRupee(Math.max(0, itemsSubtotal + packaging - discount));
  return {
    itemsSubtotal: menuRupee(itemsSubtotal),
    itemBaseTotal: menuRupee(itemBaseTotal),
    customizationsTotal: menuRupee(customizationsTotal),
    showCustomizations: customizationsTotal > 0.005,
    packaging,
    discount,
    total,
  };
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
  if (base > 0.005) return menuRupee(base);

  const captured = Number(item.captured_base_amount) || 0;
  if (captured > 0.005) return menuRupee(captured);

  const fromField = Number(item.customizations_total) || 0;
  let cust = fromField;
  if (cust <= 0.005) {
    const lines = item.customization_lines ?? [];
    cust = round2(
      lines.filter((l) => l.kind === "addon").reduce((s, l) => s + (Number(l.amount) || 0), 0)
    );
  }

  const stored = Number(item.price) || 0;
  if (stored > cust + 0.005) return menuRupee(stored - cust);
  return stored > 0.005 ? menuRupee(stored) : 0;
}
