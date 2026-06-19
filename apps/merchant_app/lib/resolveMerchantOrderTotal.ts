import type { ApiFoodOrderItem } from "@/services/ordersApi";
import type { OrderRecord } from "@/hooks/useOrders";
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

export type MerchantOrderTotalInput = {
  pricing?: MerchantOrderPricingLike;
  total?: number;
  grand_total?: number;
  food_items_total_value?: number | null;
  lineItems?: OrderRecord["lineItems"];
  items?: ApiFoodOrderItem[];
  billingSnapshot?: Record<string, unknown> | null;
};

function lineItemsAsApiItems(lineItems: OrderRecord["lineItems"]): ApiFoodOrderItem[] {
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

function resolveMerchantDiscount(order: MerchantOrderTotalInput): number {
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

/** Same merchant-visible total as partnersite — compute from line items when available. */
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
