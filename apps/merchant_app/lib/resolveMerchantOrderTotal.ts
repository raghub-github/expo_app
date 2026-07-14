import type { ApiFoodOrderItem } from "@/services/ordersApi";
import { merchantBillPartsFromFoodItems } from "@/lib/merchant-line-total";
import { merchantFundedDiscountFromBilling } from "@/lib/merchant-billing-discount";

function menuRupee(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

export type MerchantOrderPricingLike = {
  subtotal?: number;
  packaging?: number;
  taxes?: number;
  discount?: number;
  total?: number;
} | null;

/** Minimal line shape for bill math — avoids importing OrderRecord (Metro cycle). */
export type MerchantBillLineItem = {
  qty: number;
  name: string;
  price: number;
  menuItemId?: number | null;
  vegNonveg?: string | null;
  customizations?: string[];
  variant_tag?: string | null;
  customization_lines?: ApiFoodOrderItem["customization_lines"];
  base_amount?: number;
  customizations_total?: number;
  captured_base_amount?: number;
  captured_addon_amount?: number;
  has_customizations?: boolean;
  catalog_line_total?: number;
  net_line_total?: number;
  offer_discount?: number;
  offer_label?: string | null;
  is_item_promo?: boolean;
  applied_offer_type?: string | null;
};

export type MerchantOrderTotalInput = {
  pricing?: MerchantOrderPricingLike;
  total?: number;
  grand_total?: number;
  food_items_total_value?: number | null;
  lineItems?: MerchantBillLineItem[];
  items?: ApiFoodOrderItem[];
  billingSnapshot?: Record<string, unknown> | null;
  /** Frozen SSOT precision discount (orders_core.merchant_precision_discount). */
  merchantPrecisionDiscount?: number | null;
};

function lineItemsAsApiItems(lineItems: MerchantBillLineItem[]): ApiFoodOrderItem[] {
  return lineItems.map((it) => ({
    qty: it.qty,
    name: it.name,
    price: it.price,
    menu_item_id: it.menuItemId ?? null,
    veg_nonveg: it.vegNonveg ?? null,
    customizations: it.customizations,
    variant_tag: it.variant_tag ?? null,
    customization_lines: it.customization_lines,
    base_amount: it.base_amount,
    customizations_total: it.customizations_total,
    captured_base_amount: it.captured_base_amount,
    captured_addon_amount: it.captured_addon_amount,
    has_customizations: it.has_customizations,
    // Critical: forward CTM nets so BOOST (and other item offers) reduce the bill.
    catalog_line_total: it.catalog_line_total,
    net_line_total: it.net_line_total,
    offer_discount: it.offer_discount,
    offer_label: it.offer_label ?? null,
    is_item_promo: it.is_item_promo === true,
    applied_offer_type: it.applied_offer_type ?? null,
  }));
}

function resolvePackaging(order: MerchantOrderTotalInput): number {
  const snap = order.billingSnapshot;
  if (snap && typeof snap === "object") {
    const fromSnap = Number(snap.packaging_fee);
    if (Number.isFinite(fromSnap) && fromSnap >= 0) return fromSnap;
  }
  return Number(order.pricing?.packaging) || 0;
}

/**
 * Merchant bill cart discount = the FROZEN precision value from
 * orders_core.merchant_precision_discount only (SSOT). BOOST lives in line nets —
 * never fold it into this cart discount or it will double-subtract. Falls back to
 * legacy billing-derived merchant-funded total only when the frozen column is absent.
 */
function resolveMerchantDiscount(order: MerchantOrderTotalInput): number {
  const frozen = Number(order.merchantPrecisionDiscount);
  if (Number.isFinite(frozen) && frozen > 0) return frozen;
  if (order.merchantPrecisionDiscount != null) return 0;
  const fromBilling = merchantFundedDiscountFromBilling(order.billingSnapshot);
  if (fromBilling > 0) return fromBilling;
  return Number(order.pricing?.discount) || 0;
}

function billFromItems(order: MerchantOrderTotalInput) {
  const items =
    order.items ??
    (order.lineItems?.length ? lineItemsAsApiItems(order.lineItems) : []);
  if (items.length === 0) return null;
  return merchantBillPartsFromFoodItems(items, {
    packaging: resolvePackaging(order),
    discount: resolveMerchantDiscount(order),
  });
}

/**
 * Same merchant-visible total as Partner Site:
 * Σ(net_line_total) + packaging − merchant_precision_discount.
 * Prefer line recompute over API pricing.total (older backends omitted precision).
 */
export function resolveMerchantOrderTotal(order: MerchantOrderTotalInput): number {
  const fromItems = billFromItems(order);
  if (fromItems && fromItems.total > 0) return fromItems.total;

  const fromPricing = Number(order.pricing?.total);
  if (Number.isFinite(fromPricing) && fromPricing > 0) return menuRupee(fromPricing);

  const fromFood = Number(order.food_items_total_value);
  if (Number.isFinite(fromFood) && fromFood > 0) return menuRupee(fromFood);

  const fromMapped = Number(order.total);
  if (Number.isFinite(fromMapped) && fromMapped > 0) return menuRupee(fromMapped);

  const fromGrand = Number(order.grand_total);
  if (Number.isFinite(fromGrand) && fromGrand > 0) return menuRupee(fromGrand);

  return 0;
}

export function merchantOrderBillTotal(order: MerchantOrderTotalInput): number {
  return resolveMerchantOrderTotal(order);
}

export type MerchantBillParts = {
  itemsSubtotal: number;
  packaging: number;
  discount: number;
  taxes: number;
  total: number;
};

/** Bill summary parts aligned with partnersite MerchantOrderBillSummary. */
export function merchantBillPartsFromOrder(order: MerchantOrderTotalInput): MerchantBillParts {
  const fromItems = billFromItems(order);
  if (fromItems) {
    return {
      itemsSubtotal: fromItems.itemsSubtotal,
      packaging: fromItems.packaging,
      discount: fromItems.discount,
      taxes: 0,
      total: fromItems.total,
    };
  }

  const total = resolveMerchantOrderTotal(order);
  return {
    itemsSubtotal: Number(order.pricing?.subtotal) || 0,
    packaging: resolvePackaging(order),
    discount: resolveMerchantDiscount(order),
    taxes: Number(order.pricing?.taxes) || 0,
    total,
  };
}
