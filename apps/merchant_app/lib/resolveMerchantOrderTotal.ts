import type { ApiFoodOrderItem } from "@/services/ordersApi";
import { merchantBillPartsFromFoodItems } from "@/lib/merchant-line-total";
import { merchantFundedDiscountFromBilling } from "@/lib/merchant-billing-discount";

/** Partner Site / payout-engine money rounding (2dp). */
function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
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
  menuItemId?: number | string | null;
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
  ctm_from_snapshot?: boolean;
};

export type MerchantOrderTotalInput = {
  pricing?: MerchantOrderPricingLike;
  total?: number;
  grand_total?: number;
  /** Frozen CTM from orders_core.total_ctm (Partner Site / payout SSOT). */
  total_ctm?: number | null;
  /** CamelCase alias used by OrderRecord in the app. */
  totalCtm?: number | null;
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
    catalog_line_total: it.catalog_line_total,
    net_line_total: it.net_line_total,
    offer_discount: it.offer_discount,
    offer_label: it.offer_label ?? null,
    is_item_promo: it.is_item_promo === true,
    applied_offer_type: it.applied_offer_type ?? null,
    ctm_from_snapshot: it.ctm_from_snapshot === true,
  }));
}

function resolveItems(order: MerchantOrderTotalInput): ApiFoodOrderItem[] {
  return order.items ?? (order.lineItems?.length ? lineItemsAsApiItems(order.lineItems) : []);
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
 * Merchant bill cart discount = frozen orders_core.merchant_precision_discount (SSOT).
 * BOOST lives in line nets — never fold it into this cart discount.
 */
function resolveMerchantDiscount(order: MerchantOrderTotalInput): number {
  const frozen = Number(order.merchantPrecisionDiscount);
  if (Number.isFinite(frozen) && frozen > 0) return frozen;
  if (order.merchantPrecisionDiscount != null) return 0;
  const fromBilling = merchantFundedDiscountFromBilling(order.billingSnapshot);
  if (fromBilling > 0) return fromBilling;
  return Number(order.pricing?.discount) || 0;
}

function billFromItems(order: MerchantOrderTotalInput, opts?: { forceRecomputeTotal?: boolean }) {
  const items = resolveItems(order);
  if (items.length === 0) return null;
  return merchantBillPartsFromFoodItems(items, {
    packaging: resolvePackaging(order),
    discount: resolveMerchantDiscount(order),
    total: opts?.forceRecomputeTotal ? 0 : undefined,
  });
}

/**
 * Merchant-visible order payout / CTM — Partner Site resolveMerchantCtm parity:
 * Prefer frozen orders_core.total_ctm whenever present (never lose to a drifted pricing.total).
 * Then pricing.total, line recompute, food_items_total_value, mapped totals.
 */
export function resolveMerchantOrderTotal(order: MerchantOrderTotalInput): number {
  const fromFrozen = Number(order.total_ctm ?? order.totalCtm);
  if (Number.isFinite(fromFrozen) && fromFrozen > 0) return round2(fromFrozen);

  const fromPricing = Number(order.pricing?.total);
  if (Number.isFinite(fromPricing) && fromPricing > 0) return round2(fromPricing);

  const fromItems = billFromItems(order, { forceRecomputeTotal: true });
  if (fromItems && fromItems.total > 0.005) return round2(fromItems.total);

  const fromFood = Number(order.food_items_total_value);
  if (Number.isFinite(fromFood) && fromFood > 0) return round2(fromFood);

  const fromMapped = Number(order.total);
  if (Number.isFinite(fromMapped) && fromMapped > 0) return round2(fromMapped);

  const fromGrand = Number(order.grand_total);
  if (Number.isFinite(fromGrand) && fromGrand > 0) return round2(fromGrand);

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

/**
 * Incoming-order bill — same SSOT as Active cards / Partner Site:
 * prefer frozen `total_ctm` (and API pricing.total), never a drifted recompute
 * from customer-priced lines that can appear before accept hydration.
 */
export function merchantIncomingBillPartsFromOrder(
  order: MerchantOrderTotalInput
): MerchantBillParts {
  return merchantBillPartsFromOrder(order);
}

/**
 * Bill summary parts — frozen total_ctm is SSOT; item subtotal is derived by the
 * shared @gatimitra/bill-print engine so Partner Site and merchant app match.
 */
export function merchantBillPartsFromOrder(order: MerchantOrderTotalInput): MerchantBillParts {
  const total = resolveMerchantOrderTotal(order);
  const packaging = resolvePackaging(order);
  const discount = resolveMerchantDiscount(order);
  const items = resolveItems(order);

  if (items.length === 0) {
    return {
      itemsSubtotal: Math.max(0, total - packaging + discount),
      packaging,
      discount,
      taxes: 0,
      total,
    };
  }

  const bill = merchantBillPartsFromFoodItems(items, {
    packaging,
    discount,
    total,
  });

  return {
    itemsSubtotal: bill.itemsSubtotal,
    packaging: bill.packaging,
    discount: bill.discount,
    taxes: 0,
    total: bill.total,
  };
}
