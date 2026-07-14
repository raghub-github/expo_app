/**
 * Offer Engine V3 — unified runtime PricingService.
 * Single entry point for product, cart, checkout, and settlement pricing.
 * Never mutates merchant_menu_items.selling_price.
 */
import { getSql, getDb } from "../../db/client.js";
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { customerPriceFromBase, rupeesToPaise } from "../commission/pricing.js";
import { computeBillForOrder } from "../billing/billing.service.js";
import { loadBillingDatasetUncached } from "../billing/billing.repository.js";
import type { MerchantOfferRow } from "../billing/types.js";
import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";
import { pickBestMerchantOfferForLine } from "./offer-discount-estimator.js";
import { detectOfferConflicts, type ConflictCheckInput } from "./offer-conflict.service.js";
import type {
  CartPriceResult,
  CheckoutPriceResult,
  OrderPricingSnapshot,
  OfferPreviewInput,
  OfferPreviewResult,
  ProductPriceBreakdown,
  SettlementLineSnapshot,
} from "./pricing.types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

async function loadStoreCacheVersion(storeId: number): Promise<number> {
  const sql = getSql();
  const [row] = await sql<Array<{ v: string }>>`
    SELECT COALESCE(offer_pricing_cache_version, 1)::text AS v
    FROM merchant_stores WHERE id = ${storeId} LIMIT 1
  `;
  return Number(row?.v ?? 1);
}

async function loadMenuItemRow(storeId: number, menuItemId: number) {
  const sql = getSql();
  const [row] = await sql<
    Array<{
      id: number;
      item_id: string;
      item_name: string;
      base_price: string;
      selling_price: string;
      category_id: number | null;
    }>
  >`
    SELECT id, item_id, item_name,
           base_price::text, selling_price::text, category_id
    FROM merchant_menu_items
    WHERE store_id = ${storeId} AND id = ${menuItemId}
    LIMIT 1
  `;
  return row ?? null;
}

function customerPriceFromMerchantBase(merchantBaseRupees: number, commissionPct: number): number {
  if (merchantBaseRupees <= 0) return 0;
  const { customerPaise } = customerPriceFromBase(
    rupeesToPaise(merchantBaseRupees),
    commissionPct
  );
  return customerPaise / 100;
}

async function loadActiveMerchantOffers(storeId: number): Promise<MerchantOfferRow[]> {
  const db = getDb();
  const dataset = await loadBillingDatasetUncached(db, {
    merchantStoreId: storeId,
    serviceType: "FOOD",
    couponCode: null,
  });
  return dataset.merchantOffers;
}

function draftOfferToRow(
  draft: Record<string, unknown>,
  storeId: number
): MerchantOfferRow | null {
  if (!draft.offer_type) return null;
  const meta: Record<string, unknown> =
    draft.offer_metadata && typeof draft.offer_metadata === "object"
      ? { ...(draft.offer_metadata as object) }
      : {};
  if (Array.isArray(draft.menu_item_ids)) {
    meta.menu_item_ids = draft.menu_item_ids;
  }
  if (Array.isArray(draft.category_ids)) {
    meta.category_ids = draft.category_ids;
  }
  return {
    id: -1,
    offerId: "draft",
    title: String(draft.offer_title ?? "Draft offer"),
    offerType: String(draft.offer_type),
    offerSubType: (draft.offer_sub_type as string) ?? null,
    discountValue: num(draft.discount_value),
    discountPercentage: num(draft.discount_percentage),
    maxDiscountAmount: num(draft.max_discount_amount),
    minOrderAmount: num(draft.min_order_amount),
    maxOrderAmount: num(draft.max_order_amount),
    buyQuantity: draft.buy_quantity != null ? Number(draft.buy_quantity) : null,
    getQuantity: draft.get_quantity != null ? Number(draft.get_quantity) : null,
    couponCode: (draft.coupon_code as string) ?? null,
    autoApply: draft.auto_apply !== false,
    isStackable: Boolean(draft.is_stackable),
    perOrderLimit: Number(draft.per_order_limit ?? 1),
    firstOrderOnly: Boolean(draft.first_order_only),
    newUserOnly: Boolean(draft.new_user_only),
    maxUsesTotal: draft.max_uses_total != null ? Number(draft.max_uses_total) : null,
    maxUsesPerUser: draft.max_uses_per_user != null ? Number(draft.max_uses_per_user) : null,
    currentUses: 0,
    applicableOnDays: (draft.applicable_on_days as string[]) ?? null,
    applicableTimeStart: (draft.applicable_time_start as string) ?? null,
    applicableTimeEnd: (draft.applicable_time_end as string) ?? null,
    maxDiscountPerOrder: num(draft.max_discount_per_order),
    metadata: meta,
    displayPriority: Number(draft.priority ?? 0),
    priority: Number(draft.priority ?? 0),
    createdSourcePlatform: "MERCHANT_PORTAL",
    createdByRole: "MERCHANT",
    approvalStatus: "AUTO_APPROVED",
  };
}

/**
 * Runtime price for a single menu item (customer-visible, offer-adjusted).
 */
export async function calculateProductPrice(input: {
  storeId: number;
  menuItemId: number;
  quantity?: number;
  previewOffer?: Record<string, unknown>;
  extraOffers?: MerchantOfferRow[];
}): Promise<ProductPriceBreakdown> {
  const qty = Math.max(1, input.quantity ?? 1);
  const cacheVersion = await loadStoreCacheVersion(input.storeId);
  const item = await loadMenuItemRow(input.storeId, input.menuItemId);
  if (!item) {
    throw new Error("menu_item_not_found");
  }

  const commission = await resolveStoreCommission(input.storeId);
  const merchantBase = num(item.selling_price);
  const mrpBase = num(item.base_price) > 0 ? num(item.base_price) : merchantBase;
  const mrp = customerPriceFromMerchantBase(mrpBase, commission.percent);
  const sellingPrice = customerPriceFromMerchantBase(merchantBase, commission.percent);
  const lineTotal = round2(sellingPrice * qty);

  let offers = await loadActiveMerchantOffers(input.storeId);
  if (input.previewOffer) {
    const draft = draftOfferToRow(input.previewOffer, input.storeId);
    if (draft) offers = [draft, ...offers];
  }
  if (input.extraOffers?.length) {
    offers = [...input.extraOffers, ...offers];
  }

  const best = pickBestMerchantOfferForLine(
    offers,
    lineTotal,
    input.menuItemId,
    item.category_id
  );
  const merchantDiscount = round2(best?.discount ?? 0);
  const finalLine = round2(Math.max(0, lineTotal - merchantDiscount));
  const finalPerUnit = round2(finalLine / qty);
  const platformCommission = round2(sellingPrice - merchantBase);
  const merchantSettlement = round2(merchantBase * qty - merchantDiscount);

  return {
    menuItemId: input.menuItemId,
    itemId: item.item_id,
    itemName: item.item_name,
    quantity: qty,
    mrp: round2(mrp),
    sellingPrice: round2(sellingPrice),
    merchantDiscount,
    platformDiscount: 0,
    couponDiscount: 0,
    walletDiscount: 0,
    subscriptionDiscount: 0,
    finalPrice: finalPerUnit,
    merchantBasePerUnit: round2(merchantBase),
    platformCommission,
    merchantSettlement,
    appliedOfferIds: best ? [best.offer.id] : [],
    appliedOfferTitles: best ? [best.offer.title] : [],
    cacheVersion,
  };
}

/**
 * Cart-level pricing — delegates to billing pipeline for authoritative totals.
 */
export async function calculateCart(input: {
  customerId: number;
  merchantId: string;
  storeId: number;
  items: NormalizedOrderItem[];
  couponCode?: string | null;
  userSegment?: "NEW" | "EXISTING" | "ALL";
}): Promise<CartPriceResult> {
  const db = getDb();
  const bill = await computeBillForOrder(db, {
    customerId: input.customerId,
    merchantId: input.merchantId,
    items: input.items,
    couponCode: input.couponCode ?? null,
    userSegment: input.userSegment ?? "ALL",
    useCache: false,
  });

  if (!bill.ok) {
    throw new Error(bill.message);
  }

  const cacheVersion = await loadStoreCacheVersion(input.storeId);
  const b = bill.billing;
  const snap = bill.snapshot;

  const lines: CartPriceResult["lines"] = input.items.map((item, i) => {
    const unit = num(item.basePrice);
    const qty = Math.max(1, item.quantity);
    return {
      menuItemId: item.menuItemId,
      itemId: null,
      itemName: item.itemName ?? null,
      quantity: qty,
      mrp: unit,
      sellingPrice: unit,
      merchantDiscount: 0,
      platformDiscount: 0,
      couponDiscount: 0,
      walletDiscount: 0,
      subscriptionDiscount: 0,
      finalPrice: unit,
      merchantBasePerUnit: unit,
      platformCommission: 0,
      merchantSettlement: unit * qty,
      appliedOfferIds: [],
      appliedOfferTitles: [],
      cacheVersion,
      lineTotal: round2(unit * qty),
      addonTotal: 0,
    };
  });

  return {
    lines,
    itemSubtotal: num(b.item_total),
    addonSubtotal: num(b.addon_total),
    merchantDiscount: num(b.discount_total),
    platformDiscount: 0,
    couponDiscount: 0,
    walletDiscount: 0,
    subscriptionDiscount: 0,
    packagingFee: num(b.packaging_fee),
    deliveryFee: num(b.delivery_fee),
    taxTotal: num(b.tax_total),
    finalAmount: num(b.final_amount),
    merchantSettlement: round2(num(b.item_total) - num(b.discount_total)),
    platformCost: 0,
    cacheVersion,
    billingSnapshot: snap,
  };
}

/**
 * Checkout pricing — same as cart but includes immutable order snapshot.
 */
export async function calculateCheckout(
  input: Parameters<typeof calculateCart>[0] & {
    addressId?: number;
    deliveryType?: "delivery" | "self_pickup";
    selectedMerchantOfferId?: number | null;
    selectedPlatformOfferId?: number | null;
  }
): Promise<CheckoutPriceResult> {
  const db = getDb();
  const bill = await computeBillForOrder(db, {
    customerId: input.customerId,
    merchantId: input.merchantId,
    items: input.items,
    addressId: input.addressId,
    couponCode: input.couponCode ?? null,
    userSegment: input.userSegment ?? "ALL",
    deliveryType: input.deliveryType ?? "delivery",
    selectedMerchantOfferId: input.selectedMerchantOfferId ?? null,
    selectedPlatformOfferId: input.selectedPlatformOfferId ?? null,
    useCache: false,
  });

  if (!bill.ok) {
    throw new Error(bill.message);
  }

  const cart = await calculateCart(input);
  const orderSnapshot = buildOrderSnapshotFromBilling(
    input.storeId,
    bill.snapshot,
    bill.billing
  );

  return { ...cart, orderSnapshot };
}

function buildOrderSnapshotFromBilling(
  storeId: number,
  snapshot: Record<string, unknown>,
  billing: {
    item_total?: number;
    discount_total?: number;
    final_amount?: number;
    packaging_fee?: number;
    delivery_fee?: number;
    tax_total?: number;
  }
): OrderPricingSnapshot {
  const discounts = Array.isArray(snapshot.discounts)
    ? (snapshot.discounts as Array<{ label?: string; amount?: number; meta?: Record<string, unknown> }>)
    : [];

  const appliedOffers = discounts
    .filter((d) => d.meta?.merchantOfferId != null)
    .map((d) => ({
      id: Number(d.meta!.merchantOfferId),
      title: String(d.label ?? "Offer"),
      source: "merchant" as const,
    }));

  return {
    version: 3,
    computedAt: new Date().toISOString(),
    storeId,
    lines: [],
    totals: {
      mrp: num(billing.item_total),
      sellingPrice: num(billing.item_total),
      merchantDiscount: num(billing.discount_total),
      platformDiscount: 0,
      couponDiscount: 0,
      walletDiscount: num(snapshot.wallet_discount),
      subscriptionDiscount: num(snapshot.subscription_discount),
      packaging: num(billing.packaging_fee),
      delivery: num(billing.delivery_fee),
      tax: num(billing.tax_total),
      finalAmount: num(billing.final_amount),
      merchantSettlement: round2(num(billing.item_total) - num(billing.discount_total)),
      platformCost: 0,
    },
    appliedOffers,
  };
}

/**
 * Settlement view from persisted billing snapshot (never recalculates historical orders).
 */
export function calculateSettlement(snapshot: Record<string, unknown>): OrderPricingSnapshot {
  const totals = snapshot as Record<string, unknown>;
  return {
    version: 3,
    computedAt: String(totals.computedAt ?? new Date().toISOString()),
    storeId: Number(totals.merchantStoreId ?? 0),
    lines: [],
    totals: {
      mrp: num(totals.item_total),
      sellingPrice: num(totals.item_total),
      merchantDiscount: num(totals.discount_total),
      platformDiscount: 0,
      couponDiscount: 0,
      walletDiscount: num(totals.wallet_discount),
      subscriptionDiscount: num(totals.subscription_discount),
      packaging: num(totals.packaging_fee),
      delivery: num(totals.delivery_fee),
      tax: num(totals.tax_total),
      finalAmount: num(totals.final_amount),
      merchantSettlement: round2(num(totals.item_total) - num(totals.discount_total)),
      platformCost: 0,
    },
    appliedOffers: [],
  };
}

/**
 * Partner Site live preview + conflict detection.
 */
export async function previewOfferPricing(input: OfferPreviewInput): Promise<OfferPreviewResult> {
  const conflicts = await detectOfferConflicts({
    storeId: input.storeId,
    validFrom: String(input.draftOffer?.valid_from ?? new Date().toISOString()),
    validTill: String(
      input.draftOffer?.valid_till ??
        new Date(Date.now() + 7 * 86400000).toISOString()
    ),
    menuItemIds: (input.draftOffer?.menu_item_ids as string[]) ?? undefined,
    categoryIds: (input.draftOffer?.category_ids as number[]) ?? undefined,
    priority: Number(input.draftOffer?.priority ?? 0),
    isStackable: Boolean(input.draftOffer?.is_stackable),
    excludeOfferId: input.excludeOfferId ?? null,
    applicableOnDays: (input.draftOffer?.applicable_on_days as string[]) ?? null,
    applicableTimeStart: (input.draftOffer?.applicable_time_start as string) ?? null,
    applicableTimeEnd: (input.draftOffer?.applicable_time_end as string) ?? null,
  } satisfies ConflictCheckInput);

  let sample: ProductPriceBreakdown | null = null;
  if (input.menuItemId != null && input.menuItemId > 0) {
    sample = await calculateProductPrice({
      storeId: input.storeId,
      menuItemId: input.menuItemId,
      quantity: input.sampleQuantity ?? 1,
      previewOffer: input.draftOffer,
    });
  } else if (input.draftOffer) {
    const ids = (input.draftOffer.menu_item_ids as string[]) ?? [];
    if (ids.length > 0) {
      const sql = getSql();
      const [mapped] = await sql<Array<{ id: number }>>`
        SELECT id FROM merchant_menu_items
        WHERE store_id = ${input.storeId}
          AND (id::text = ${ids[0]} OR item_id = ${ids[0]})
        LIMIT 1
      `;
      if (mapped?.id) {
        sample = await calculateProductPrice({
          storeId: input.storeId,
          menuItemId: mapped.id,
          quantity: input.sampleQuantity ?? 1,
          previewOffer: input.draftOffer,
        });
      }
    }
  }

  const cacheVersion = await loadStoreCacheVersion(input.storeId);
  return { sample, conflicts, cacheVersion };
}

export const PricingService = {
  calculateProductPrice,
  calculateCart,
  calculateCheckout,
  calculateSettlement,
  previewOfferPricing,
};
