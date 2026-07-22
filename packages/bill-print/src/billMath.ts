import type { BillLineItem, BillPricingBreakdown } from "./types";
import {
  formatBogoOfferBadge,
  formatBoostOfferBadge,
  isBogoOfferType,
  resolveMerchantOfferBadge,
} from "./offerDisplay";
import { formatOrderRs } from "./format";

export { formatOrderRs };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function menuRupee(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

function customizationTotalForItem(item: BillLineItem): number {
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
  return 0;
}

function baseAmountForItem(item: BillLineItem): number {
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

export function merchantLineTotalForItem(item: BillLineItem): number {
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

export function merchantItemCatalogAndNet(item: BillLineItem): {
  catalog: number;
  net: number;
  showStrike: boolean;
  offerBadge: string | null;
  offerKind: "bogo" | "boost" | "other" | null;
} {
  const lineTotal = merchantLineTotalForItem(item);
  const hasCatalog =
    item.catalogLineTotal != null && item.catalogLineTotal > 0.005;
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

export function orderItemsTotals(items: BillLineItem[]) {
  const itemsLineTotal = items.reduce((acc, it) => acc + merchantLineTotalForItem(it), 0);
  const baseSubtotal = items.reduce((acc, it) => acc + baseAmountForItem(it), 0);
  const customizationsTotal = items.reduce(
    (acc, it) => acc + customizationTotalForItem(it),
    0
  );
  return { itemsLineTotal, baseSubtotal, customizationsTotal };
}

export function merchantBillPartsFromItems(
  items: BillLineItem[],
  pricing: BillPricingBreakdown
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

export function itemCookingNote(item: BillLineItem): string {
  const special = (item.specialInstructions ?? "").trim();
  if (special) return special;
  const fromLine = item.customizationLines?.find((l) => l.kind === "note")?.name?.trim();
  return fromLine ?? "";
}
