import type { NormalizedOrderLineItem } from "@/lib/orderLineItems";
import {
  formatBogoOfferBadge,
  formatBoostOfferBadge,
  isBogoOfferType,
  resolveMerchantOfferBadge,
} from "@/lib/merchant-offer-display";

export function formatOrderRs(amount: number, decimals = 0): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (decimals === 0) return `₹${Math.round(n)}`;
  return `₹${n.toFixed(decimals)}`;
}

export function orderItemHasBreakdown(item: NormalizedOrderLineItem): boolean {
  return Boolean(
    item.hasCustomizations ||
      (item.customizationLines && item.customizationLines.length > 0) ||
      (item.customizations && item.customizations.length > 0)
  );
}

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Variant + size label (e.g. "Half (500 ml)") — not listed under add-ons. */
export function orderItemVariantLabel(item: NormalizedOrderLineItem): string | null {
  const variantLine = item.customizationLines?.find((l) => l.kind === "variant");
  if (variantLine?.name?.trim()) return variantLine.name.trim();

  const tag = String(item.variantTag ?? item.variantName ?? "").trim();
  if (tag) return tag;

  for (const line of item.customizations ?? []) {
    const t = line.trim();
    if (!t || t.startsWith("+")) continue;
    if (/₹\s*[\d.]+\s*$/.test(t)) continue;
    if (normLabel(t).startsWith("category:")) continue;
    return t.replace(/\s*·\s*₹[\d.]+\s*$/, "").trim() || null;
  }
  return null;
}

/** Line title without duplicating variant already embedded in `item.name`. */
export function orderItemDisplayName(item: NormalizedOrderLineItem): string {
  const name = String(item.name ?? "Item").trim();
  const variant = orderItemVariantLabel(item);
  if (!variant) return name;
  const vNorm = normLabel(variant);
  if (normLabel(name).includes(vNorm)) return name;
  const suffix = `(${variant.trim()})`;
  if (name.endsWith(suffix) || name.includes(suffix)) return name;
  return `${name} (${variant})`;
}

/** Add-on / extra lines only (excludes variant size and category notes). */
export function orderItemCustomizationRows(
  item: NormalizedOrderLineItem
): Array<{ label: string; amount: number | null }> {
  const variant = orderItemVariantLabel(item);

  if (item.customizationLines?.length) {
    return item.customizationLines
      .filter((l) => l.kind === "addon")
      .map((l) => ({
        label: l.name,
        amount: l.amount > 0 ? l.amount : null,
      }));
  }

  return (item.customizations ?? [])
    .map((line) => {
      const m = line.match(/₹\s*([\d.]+)\s*$/);
      return {
        label: line.replace(/\s*·\s*₹[\d.]+\s*$/, "").trim(),
        amount: m ? Number(m[1]) : null,
      };
    })
    .filter((row) => {
      const label = normLabel(row.label);
      if (label.startsWith("category:")) return false;
      if (variant && normLabel(variant) === label) return false;
      return true;
    });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function menuRupee(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

function customizationTotalForItem(item: NormalizedOrderLineItem): number {
  const fromField = Number(item.customizationsTotal) || 0;
  if (fromField > 0.005) return fromField;
  if (Number(item.capturedAddonAmount) > 0.005) {
    return Number(item.capturedAddonAmount);
  }
  if (item.customizationLines?.length) {
    return round2(
      item.customizationLines
        .filter((l) => l.kind === "addon")
        .reduce((s, l) => s + (Number(l.amount) || 0), 0)
    );
  }
  return orderItemCustomizationRows(item).reduce((s, r) => s + (r.amount ?? 0), 0);
}

function baseAmountForItem(item: NormalizedOrderLineItem): number {
  const qty = Math.max(1, item.quantity || 1);
  const fromBreakdown = Number(item.baseAmount) || 0;
  if (fromBreakdown > 0.005) return round2(fromBreakdown);

  const captured = Number(item.capturedBaseAmount) || 0;
  if (captured > 0.005) return round2(captured);

  if (item.customizationLines?.length) {
    const variantOnly = item.customizationLines
      .filter((l) => l.kind === "variant")
      .reduce((s, l) => s + (Number(l.amount) || 0), 0);
    if (variantOnly > 0.005) return round2(variantOnly);
  }

  const unit = Number(item.price) || 0;
  if (unit > 0.005) return round2(unit * qty);

  const lineTotal = Number(item.total) || 0;
  const cust = customizationTotalForItem(item);
  if (lineTotal > cust + 0.005) return round2(lineTotal - cust);
  return 0;
}

export function merchantLineTotalForItem(item: NormalizedOrderLineItem): number {
  // Prefer frozen Merchant CTM snapshot over live/customer line math.
  if (item.ctmFromSnapshot) {
    if (item.netLineTotal != null && Number.isFinite(item.netLineTotal)) {
      return menuRupee(item.netLineTotal);
    }
    if (item.catalogLineTotal != null && item.catalogLineTotal > 0.005) {
      return menuRupee(item.catalogLineTotal);
    }
  }
  if (
    item.netLineTotal != null &&
    item.catalogLineTotal != null &&
    item.netLineTotal < item.catalogLineTotal - 0.005
  ) {
    return menuRupee(item.netLineTotal);
  }
  if (item.catalogLineTotal != null && item.catalogLineTotal > 0.005) {
    return menuRupee(item.catalogLineTotal);
  }

  const base = baseAmountForItem(item);
  const cust = customizationTotalForItem(item);
  if (base > 0.005 || cust > 0.005) return menuRupee(base + cust);

  const qty = Math.max(1, item.quantity || 1);
  return menuRupee(Number(item.total) || Number(item.price) * qty);
}

/** Catalog vs effective selling price from frozen order snapshot (no recalculation). */
export function merchantItemCatalogAndNet(item: NormalizedOrderLineItem): {
  catalog: number;
  net: number;
  showStrike: boolean;
  offerBadge: string | null;
  offerKind: "bogo" | "boost" | "other" | null;
} {
  const lineTotal = merchantLineTotalForItem(item);
  const hasCatalog =
    item.catalogLineTotal != null && Number(item.catalogLineTotal) > 0.005;
  const catalog = hasCatalog ? menuRupee(Number(item.catalogLineTotal)) : lineTotal;

  let net = catalog;
  if (item.netLineTotal != null && Number.isFinite(Number(item.netLineTotal))) {
    net = menuRupee(Number(item.netLineTotal));
  } else if (
    item.isItemPromo &&
    item.offerDiscount != null &&
    item.offerDiscount > 0.005
  ) {
    net = menuRupee(Math.max(0, catalog - Number(item.offerDiscount)));
  } else if (!hasCatalog && !item.ctmFromSnapshot) {
    net = lineTotal;
  }

  const { kind, badge } = resolveMerchantOfferBadge({
    offerType: item.appliedOfferType,
    offerLabel: item.offerLabel,
  });

  // BOGO: same gross & net on merchant UI — badge only (no strikethrough).
  if (kind === "bogo" || isBogoOfferType(item.appliedOfferType)) {
    return {
      catalog,
      net: catalog,
      showStrike: false,
      offerBadge: badge ?? formatBogoOfferBadge(item.offerLabel),
      offerKind: "bogo",
    };
  }

  const showStrike = net < catalog - 0.005;
  return {
    catalog,
    net,
    showStrike,
    offerBadge: showStrike
      ? badge ?? (kind === "boost" ? formatBoostOfferBadge() : item.offerLabel ?? null)
      : kind === "boost"
        ? badge ?? formatBoostOfferBadge()
        : null,
    offerKind: kind,
  };
}

export function orderItemsTotals(items: NormalizedOrderLineItem[]) {
  const itemsLineTotal = items.reduce((acc, it) => acc + merchantLineTotalForItem(it), 0);
  const baseSubtotal = items.reduce((acc, it) => acc + baseAmountForItem(it), 0);
  const customizationsTotal = items.reduce(
    (acc, it) => acc + customizationTotalForItem(it),
    0
  );
  return { itemsLineTotal, baseSubtotal, customizationsTotal };
}

export function computeMerchantBillTotal(parts: {
  itemPrice: number;
  customizationsTotal: number;
  packaging: number;
  discount: number;
}): number {
  const { itemPrice, customizationsTotal, packaging, discount } = parts;
  return round2(
    Math.max(0, itemPrice + customizationsTotal + packaging - discount)
  );
}

export function merchantItemLineParts(item: NormalizedOrderLineItem) {
  const base = menuRupee(baseAmountForItem(item));
  const customizations = menuRupee(customizationTotalForItem(item));
  const total = merchantLineTotalForItem(item);
  return {
    base,
    customizations,
    total,
    hasCustomizations: customizations > 0.005,
    capturedBase: Number(item.capturedBaseAmount) || undefined,
    capturedAddon: Number(item.capturedAddonAmount) || undefined,
  };
}

export function merchantBillPartsFromItems(
  items: NormalizedOrderLineItem[],
  pricing: { subtotal: number; packaging: number; discount: number; total: number }
) {
  const { itemsLineTotal, baseSubtotal, customizationsTotal } = orderItemsTotals(items);
  const packaging = pricing.packaging ?? 0;
  const discount = pricing.discount ?? 0;
  const computed = menuRupee(Math.max(0, itemsLineTotal + packaging - discount));
  const frozen = Number(pricing.total);
  const total =
    Number.isFinite(frozen) && frozen > 0 ? menuRupee(frozen) : computed;
  return {
    itemsSubtotal: menuRupee(itemsLineTotal),
    itemBaseTotal: menuRupee(baseSubtotal),
    customizationsTotal: menuRupee(customizationsTotal),
    showCustomizations: customizationsTotal > 0.005,
    packaging,
    discount,
    total,
  };
}

/** Single merchant-visible order total (CTM) — prefer frozen pricing.total from accept. */
export function resolveMerchantCtm(order: {
  pricing?: { total?: number | null; packaging?: number; discount?: number } | null;
  total_ctm?: number | string | null;
  food_items_total_value?: number | string | null;
  merchant_precision_discount?: number | string | null;
  items?: NormalizedOrderLineItem[] | null;
}): number {
  const fromPricing = Number(order.pricing?.total);
  if (Number.isFinite(fromPricing) && fromPricing > 0) return round2(fromPricing);

  const fromFrozen = Number(order.total_ctm);
  if (Number.isFinite(fromFrozen) && fromFrozen > 0) return round2(fromFrozen);

  const items = order.items ?? [];
  if (items.length > 0) {
    const packaging = Number(order.pricing?.packaging) || 0;
    // Prefer cart precision column when present; pricing.discount is precision-only on frozen CTM.
    const precision = Math.max(
      0,
      Number(order.merchant_precision_discount) || Number(order.pricing?.discount) || 0
    );
    const lineSum = items.reduce((s, it) => s + merchantLineTotalForItem(it), 0);
    if (lineSum > 0.005) {
      return round2(Math.max(0, lineSum + packaging - precision));
    }
  }

  const fromField = Number(order.food_items_total_value);
  if (Number.isFinite(fromField) && fromField > 0) return round2(fromField);

  return 0;
}
