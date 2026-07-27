import type { ApiFoodOrderItem } from "@/services/ordersApi";
import {
  merchantBillPartsFromItems as billPartsFromItems,
  merchantItemCatalogAndNet as billItemCatalogAndNet,
  merchantLineTotalForItem,
  type BillLineItem,
} from "@gatimitra/bill-print";

/** Merchant-facing money — whole rupees matching menu table prices. */
export function formatMerchantRs(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `₹${Math.round(n)}`;
}

export function apiFoodItemToBillLine(item: ApiFoodOrderItem): BillLineItem {
  const ctmRaw = (item as { ctm_from_snapshot?: boolean }).ctm_from_snapshot;
  return {
    name: item.name,
    quantity: Math.max(1, item.qty || 1),
    price: item.price,
    total: item.price,
    variantTag: item.variant_tag ?? null,
    customizationLines: item.customization_lines?.map((l) => ({
      kind: l.kind,
      name: l.name,
      amount: l.amount,
      quantity: null,
    })),
    customizations: item.customizations,
    customizationsTotal: item.customizations_total ?? null,
    baseAmount: item.base_amount ?? null,
    capturedBaseAmount: item.captured_base_amount ?? null,
    capturedAddonAmount: item.captured_addon_amount ?? null,
    hasCustomizations: item.has_customizations ?? null,
    catalogLineTotal: item.catalog_line_total ?? null,
    netLineTotal: item.net_line_total ?? null,
    offerDiscount: item.offer_discount ?? null,
    offerLabel: item.offer_label ?? null,
    isItemPromo: item.is_item_promo ?? null,
    appliedOfferType: item.applied_offer_type ?? null,
    ctmFromSnapshot: ctmRaw === true,
  };
}

/** Line total — @gatimitra/bill-print SSOT (Partner Site merchant-order-item-display parity). */
export function merchantLineTotalForFoodItem(item: ApiFoodOrderItem): number {
  return merchantLineTotalForItem(apiFoodItemToBillLine(item));
}

/** Catalog vs effective selling price from frozen order snapshot. */
export function merchantFoodItemCatalogAndNet(item: ApiFoodOrderItem): {
  catalog: number;
  net: number;
  showStrike: boolean;
  offerBadge: string | null;
  offerKind: "bogo" | "boost" | "other" | null;
} {
  return billItemCatalogAndNet(apiFoodItemToBillLine(item));
}

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

function menuRupee(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
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
  pricing: { packaging: number; discount: number; total?: number }
) {
  const billItems = items.map(apiFoodItemToBillLine);
  const lineSum = items.reduce((acc, it) => acc + merchantLineTotalForFoodItem(it), 0);
  const bill = billPartsFromItems(billItems, {
    subtotal: lineSum,
    packaging: pricing.packaging ?? 0,
    discount: pricing.discount ?? 0,
    total: pricing.total ?? 0,
  });
  return {
    itemsSubtotal: bill.itemsSubtotal,
    itemBaseTotal: bill.itemBaseTotal,
    customizationsTotal: bill.customizationsTotal,
    showCustomizations: bill.showCustomizations,
    packaging: bill.packaging,
    discount: bill.discount,
    total: bill.total,
  };
}

export function merchantOrderTotalFromItems(
  items: ApiFoodOrderItem[],
  packaging: number,
  discount: number
): number {
  return merchantBillPartsFromFoodItems(items, { packaging, discount, total: 0 }).total;
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
  return merchantLineTotalForFoodItem({
    qty: item.qty ?? 1,
    name: "",
    price: Number(item.price) || 0,
    base_amount: item.base_amount,
    captured_base_amount: item.captured_base_amount,
    customizations_total: item.customizations_total,
    customization_lines: item.customization_lines,
  });
}
