/**
 * Merchant order record types + API → UI mapping (no React context — avoids Metro cycles).
 */

import type {
  ApiFoodOrder,
  ApiFoodOrderItem,
} from "@/services/ordersApi";
import { resolveMerchantOrderTotal } from "@/lib/resolveMerchantOrderTotal";

export type DeliveryType = "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP";

/** Normalize API / DB variants (`self_pickup`, `SELF_PICKUP`, etc.) to the card enum. */
export function normalizeDeliveryType(
  raw: string | null | undefined
): DeliveryType {
  const dt = String(raw ?? "delivery")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (
    dt === "SELF_PICKUP" ||
    dt === "TAKEAWAY" ||
    dt === "TAKE_AWAY" ||
    dt.includes("PICKUP")
  ) {
    return "SELF_PICKUP";
  }
  if (dt === "SELF_DELIVERY" || dt === "MX_SELF") return "SELF_DELIVERY";
  return "GATIMITRA_RIDER";
}

export type OrderStage =
  | "created"
  | "preparing"
  | "ready"
  | "picked_up"
  | "delivered"
  | "rejected"
  | "rto";

export type OrderPricing = {
  subtotal: number;
  packaging: number;
  taxes: number;
  discount: number;
  total: number;
};

export type LineItem = {
  qty: number;
  name: string;
  price: number;
  menuItemId?: number | null;
  /** Live menu image from order payload — empty means show Add photo. */
  itemImageUrl?: string | null;
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
  special_instructions?: string | null;
  specialInstructions?: string | null;
};

export type OrderRecord = {
  id: string;
  ordersCoreId: number;
  orderNumber: string;
  formattedOrderId: string | null;
  /** Tax invoice number from orders_core (GST compliance). */
  taxInvoiceNumber?: string | null;
  customerName: string;
  createdAt: string;
  displayTime: string;
  lineItems: LineItem[];
  total: number;
  pricing?: OrderPricing | null;
  billingSnapshot?: Record<string, unknown> | null;
  /** Frozen SSOT precision discount (orders_core.merchant_precision_discount). Rendered as a −line; never recomputed. */
  merchantPrecisionDiscount: number;
  totalCtm?: number | null;
  status: OrderStage;
  /** Raw API status (CREATED, ACCEPTED, PREPARING, …) for valid transitions. */
  pipelineStatus: string;
  deliveryType: DeliveryType;
  riderId?: number | null;
  riderName?: string | null;
  riderMobile?: string | null;
  riderSelfieUrl?: string | null;
  riderAssignmentStatus?: string | null;
  riderReachedAt?: string | null;
  riderDisplayVariant?:
    | "on_the_way"
    | "arrived"
    | "picked_up"
    | "delivered"
    | "cancelled"
    | "rto"
    | null;
  coreStatus?: string | null;
  currentStatus?: string | null;
  reachedMerchantAt?: string | null;
  riderReachedPickupAt?: string | null;
  pickupWaitSeconds?: number | null;
  riderStoreWaitLive?: boolean;
  riderStoreWaitAnchorAt?: string | null;
  /** Free wait seconds after rider arrives (backend SSOT, default 180). */
  riderFreeWaitSeconds?: number | null;
  /** True when free wait has elapsed and rider is still waiting. */
  riderWaitPriority?: boolean;
  pickupOtp?: string;
  /** Secure QR pickup token (order_pickup_tokens.token). */
  pickupToken?: string | null;
  /** Backend-generated KOT number (store-scoped). */
  kotNumber?: string | null;
  /** Store this order belongs to (multi-store board). */
  merchantStoreId?: number | null;
  merchantStoreName?: string | null;
  /** Short locality for incoming modal / cards (e.g. Tiruporur). */
  merchantStoreLocality?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  rtoOtp?: string;
  rejectedReason?: string | null;
  acceptedByLabel?: string | null;
  cancelledByLabel?: string | null;
  cancelledByType?: string | null;
  cancelledAt?: string | null;
  acceptedAt?: string | null;
  preparingAt?: string | null;
  preparedAt?: string | null;
  dispatchedAt?: string | null;
  handedOverToRiderAt?: string | null;
  riderPickedUpAt?: string | null;
  deliveredAt?: string | null;
  preparationTimeMinutes?: number | null;
  prepReadyByAt?: string | null;
  expectedReadyAt?: string | null;
  prepDelayMinutes?: number | null;
  prepDelayUseCount?: number | null;
  lastPrepDelayMinutesAdded?: number | null;
  preparedLateMinutes?: number | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  dropAddress?: string | null;
  distanceKm?: number | null;
  customerStoreOrderOrdinal?: number | null;
  customerStoreOrdersTotal?: number | null;
  customerPlatformOrdersTotal?: number | null;
  isBulkOrder?: boolean;
  vegNonVeg?: string | null;
  requiresUtensils?: boolean | null;
  merchantInstructionsList?: unknown;
  deliveryInstructions?: string | null;
  isScheduledOrder?: boolean;
  scheduledDeliverySummary?: string | null;
  merchantResponseDeadlineAt?: string | null;
  merchantResponseTimeoutSeconds?: number | null;
  storeRating?: StoreOrderRating | null;
};

export type StoreOrderRating = {
  reviewId: number;
  rating: number;
  reviewText: string | null;
  reviewTitle: string | null;
  createdAt: string;
  replyText: string | null;
  repliedAt: string | null;
  replies?: Array<{ text: string; at: string }>;
};

export type OrderCounts = {
  all: number;
} & Record<OrderStage, number>;

function coerceTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  try {
    const d = new Date(value as string | number | Date);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

function formatDisplayTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return formatDisplayTime(iso);
}

export function apiStatusToStage(api: string | null | undefined): OrderStage {
  const u = String(api ?? "CREATED").toUpperCase();
  if (u === "CREATED" || u === "NEW" || u === "PLACED") return "created";
  if (u === "ACCEPTED" || u === "PREPARING") return "preparing";
  if (u === "READY_FOR_PICKUP") return "ready";
  if (u === "OUT_FOR_DELIVERY") return "picked_up";
  if (u === "DELIVERED") return "delivered";
  if (u === "CANCELLED") return "rejected";
  if (u === "RTO") return "rto";
  return "created";
}

export function stageTransitionToApi(from: OrderStage, to: OrderStage): string {
  if (to === "rejected") return "CANCELLED";
  if (to === "rto") return "RTO";
  if (to === "ready") return "READY_FOR_PICKUP";
  if (from === "created" && to === "preparing") return "ACCEPTED";
  if (from === "ready" && to === "picked_up") return "OUT_FOR_DELIVERY";
  if (from === "picked_up" && to === "delivered") return "DELIVERED";
  return to.toUpperCase();
}

export function mapApiOrder(
  o: ApiFoodOrder,
  storeCtx?: {
    storeId?: number | null;
    storeName?: string | null;
    storeLocality?: string | null;
  } | null
): OrderRecord {
  const formatted = (o.formatted_order_id ?? "").trim();
  const orderNumber = formatted.length > 0 ? formatted : "";
  const deliveryType = normalizeDeliveryType(o.delivery_type);

  const foodRowId = o.core_only ? null : o.orders_food_id;
  const cancelledAt = coerceTimestamp(o.cancelled_at);
  const customerName = (o.customer_name ?? "").trim();
  const createdAt = coerceTimestamp(o.created_at) ?? new Date(0).toISOString();
  const items = Array.isArray(o.items) ? o.items.filter((it): it is NonNullable<typeof it> => it != null) : [];

  return {
    id: foodRowId != null ? String(foodRowId) : `core-${o.orders_core_id}`,
    ordersCoreId: Number(o.orders_core_id) || 0,
    orderNumber,
    formattedOrderId: formatted || null,
    taxInvoiceNumber: o.tax_invoice_number?.trim() || null,
    customerName: customerName || "Guest",
    createdAt,
    displayTime: formatDisplayTime(createdAt),
    lineItems: items.map((it) => ({
      qty: Number(it.qty) || 0,
      name: String(it.name ?? "Item"),
      price: Number(it.price) || 0,
      menuItemId:
        it.menu_item_id != null && Number.isFinite(Number(it.menu_item_id))
          ? Number(it.menu_item_id)
          : null,
      itemImageUrl:
        typeof it.item_image_url === "string" && it.item_image_url.trim()
          ? it.item_image_url.trim()
          : null,
      vegNonveg: it.veg_nonveg ?? null,
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
      specialInstructions: it.special_instructions ?? it.specialInstructions ?? null,
    })),
    total: resolveMerchantOrderTotal({
      pricing: o.pricing
        ? {
            subtotal: Number(o.pricing.subtotal) || 0,
            packaging: Number(o.pricing.packaging) || 0,
            taxes: Number(o.pricing.taxes) || 0,
            discount: Number(o.pricing.discount) || 0,
            total: Number(o.pricing.total) || 0,
          }
        : null,
      grand_total: o.grand_total,
      total_ctm: o.total_ctm ?? null,
      food_items_total_value: o.food_items_total_value ?? null,
      items: o.items,
      billingSnapshot: o.billing_snapshot ?? null,
      merchantPrecisionDiscount: Math.max(0, Number(o.merchant_precision_discount) || 0),
    }),
    pricing: o.pricing
      ? {
          subtotal: Number(o.pricing.subtotal) || 0,
          packaging: Number(o.pricing.packaging) || 0,
          taxes: Number(o.pricing.taxes) || 0,
          discount: Number(o.pricing.discount) || 0,
          total: Number(o.pricing.total) || 0,
        }
      : null,
    billingSnapshot: o.billing_snapshot ?? null,
    merchantPrecisionDiscount: Math.max(0, Number(o.merchant_precision_discount) || 0),
    totalCtm: resolveMerchantOrderTotal({
      pricing: o.pricing
        ? {
            subtotal: Number(o.pricing.subtotal) || 0,
            packaging: Number(o.pricing.packaging) || 0,
            taxes: Number(o.pricing.taxes) || 0,
            discount: Number(o.pricing.discount) || 0,
            total: Number(o.pricing.total) || 0,
          }
        : null,
      grand_total: o.grand_total,
      total_ctm: o.total_ctm ?? null,
      food_items_total_value: o.food_items_total_value ?? null,
      items: o.items,
      billingSnapshot: o.billing_snapshot ?? null,
      merchantPrecisionDiscount: Math.max(0, Number(o.merchant_precision_discount) || 0),
    }),
    status: apiStatusToStage(o.order_status),
    pipelineStatus: String(o.order_status || "CREATED").toUpperCase(),
    deliveryType,
    riderId: o.rider_id != null ? Number(o.rider_id) : null,
    riderName: o.rider_name?.trim() || null,
    riderMobile: o.rider_mobile?.trim() || null,
    riderSelfieUrl: o.rider_selfie_url?.trim() || null,
    riderAssignmentStatus: o.rider_assignment_status?.trim() || null,
    riderReachedAt: coerceTimestamp(o.reached_merchant_at ?? o.rider_reached_at),
    riderDisplayVariant: o.rider_display_variant ?? null,
    coreStatus: o.core_status?.trim() || null,
    currentStatus: o.current_status?.trim() || null,
    reachedMerchantAt: coerceTimestamp(o.reached_merchant_at),
    riderReachedPickupAt: coerceTimestamp(o.rider_reached_pickup_at),
    pickupWaitSeconds:
      o.pickup_wait_seconds != null && Number.isFinite(Number(o.pickup_wait_seconds))
        ? Math.max(0, Math.floor(Number(o.pickup_wait_seconds)))
        : null,
    riderStoreWaitLive: o.rider_store_wait_live === true,
    riderStoreWaitAnchorAt: coerceTimestamp(o.rider_store_wait_anchor_at),
    riderFreeWaitSeconds:
      o.rider_free_wait_seconds != null && Number.isFinite(Number(o.rider_free_wait_seconds))
        ? Math.max(0, Math.floor(Number(o.rider_free_wait_seconds)))
        : null,
    riderWaitPriority: o.rider_wait_priority === true,
    pickupOtp: o.pickup_otp ?? undefined,
    pickupToken: o.pickup_token?.trim() || null,
    kotNumber: o.kot_number?.trim() || null,
    merchantStoreId:
      storeCtx?.storeId != null && Number.isFinite(Number(storeCtx.storeId))
        ? Number(storeCtx.storeId)
        : null,
    merchantStoreName: storeCtx?.storeName?.trim() || null,
    merchantStoreLocality: storeCtx?.storeLocality?.trim() || null,
    paymentMethod: o.payment_method?.trim() || null,
    paymentStatus: o.payment_status?.trim() || null,
    rtoOtp: o.rto_otp ?? undefined,
    rejectedReason: o.rejected_reason ?? null,
    acceptedByLabel: o.accepted_by_label ?? null,
    cancelledByLabel: o.cancelled_by_label ?? null,
    cancelledByType: o.cancelled_by_type ?? null,
    cancelledAt,
    acceptedAt: coerceTimestamp(o.accepted_at),
    preparingAt: coerceTimestamp(o.preparing_at),
    preparedAt: coerceTimestamp(o.prepared_at),
    dispatchedAt: coerceTimestamp(o.dispatched_at),
    handedOverToRiderAt: coerceTimestamp(o.handed_over_to_rider_at),
    riderPickedUpAt: coerceTimestamp(o.rider_picked_up_at),
    deliveredAt: coerceTimestamp(o.delivered_at),
  preparationTimeMinutes:
      o.preparation_time_minutes != null ? Number(o.preparation_time_minutes) : null,
    prepReadyByAt: o.prep_ready_by_at?.trim() || null,
    expectedReadyAt: o.expected_ready_at?.trim() || null,
    prepDelayMinutes: o.prep_delay_minutes != null ? Number(o.prep_delay_minutes) : null,
    prepDelayUseCount: o.prep_delay_use_count != null ? Number(o.prep_delay_use_count) : null,
    lastPrepDelayMinutesAdded:
      o.last_prep_delay_minutes_added != null
        ? Number(o.last_prep_delay_minutes_added)
        : null,
    preparedLateMinutes:
      o.prepared_late_minutes != null ? Number(o.prepared_late_minutes) : null,
    customerPhone: o.customer_phone?.trim() || null,
    customerEmail: o.customer_email?.trim() || null,
    dropAddress: o.drop_address?.trim() || null,
    distanceKm: o.distance_km != null ? Number(o.distance_km) : null,
    customerStoreOrderOrdinal: o.customer_store_order_ordinal ?? null,
    customerStoreOrdersTotal: o.customer_store_orders_total ?? null,
    customerPlatformOrdersTotal: o.customer_platform_orders_total ?? null,
    isBulkOrder: Boolean(o.is_bulk_order),
    vegNonVeg: o.veg_non_veg ?? null,
    requiresUtensils: o.requires_utensils ?? null,
    merchantInstructionsList: o.merchant_instructions_list,
    deliveryInstructions: o.delivery_instructions?.trim() || null,
    isScheduledOrder: Boolean(o.is_scheduled_order),
    scheduledDeliverySummary: o.scheduled_delivery_summary?.trim() || null,
    merchantResponseDeadlineAt: coerceTimestamp(o.merchant_response_deadline_at),
    merchantResponseTimeoutSeconds:
      o.merchant_response_timeout_seconds != null &&
      Number.isFinite(Number(o.merchant_response_timeout_seconds))
        ? Math.max(0, Math.floor(Number(o.merchant_response_timeout_seconds)))
        : null,
    storeRating: mapStoreRating(o.store_rating),
  };
}

function mapStoreRating(
  raw: ApiFoodOrder["store_rating"] | null | undefined
): StoreOrderRating | null {
  if (!raw || typeof raw !== "object") return null;
  const rating = Number(raw.rating);
  const reviewId = Number(raw.review_id);
  if (!Number.isFinite(rating) || rating < 1 || !Number.isFinite(reviewId) || reviewId < 1) {
    return null;
  }
  return {
    reviewId,
    rating: Math.min(5, Math.max(1, rating)),
    reviewText: raw.review_text != null ? String(raw.review_text).trim() || null : null,
    reviewTitle: raw.review_title != null ? String(raw.review_title).trim() || null : null,
    createdAt: coerceTimestamp(raw.created_at) ?? new Date().toISOString(),
    replyText: raw.reply_text != null ? String(raw.reply_text).trim() || null : null,
    repliedAt: coerceTimestamp(raw.replied_at),
  };
}

export type StoreReviewMatchRow = {
  id: number;
  orderId?: number | null;
  overallRating: number;
  reviewTitle: string | null;
  reviewText: string | null;
  createdAt: string;
  replyText?: string | null;
  repliedAt?: string | null;
  formattedOrderId?: string | null;
};

function publicOrderKey(value: unknown): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  return text.length > 0 ? text : null;
}

/** Attach Reviews-tab rows onto delivered cards that the food-orders payload missed. */
export function attachStoreRatingsFromReviews(
  orders: OrderRecord[],
  reviews: StoreReviewMatchRow[]
): OrderRecord[] {
  if (orders.length === 0 || reviews.length === 0) return orders;
  const byCoreId = new Map<number, StoreReviewMatchRow>();
  const byFoodId = new Map<number, StoreReviewMatchRow>();
  const byPublicId = new Map<string, StoreReviewMatchRow>();
  for (const row of reviews) {
    const rating = Number(row.overallRating);
    const reviewId = Number(row.id);
    if (!Number.isFinite(rating) || rating < 1 || !Number.isFinite(reviewId) || reviewId < 1) {
      continue;
    }
    const orderId = Number(row.orderId);
    if (Number.isFinite(orderId) && orderId > 0) {
      if (!byCoreId.has(orderId)) byCoreId.set(orderId, row);
      if (!byFoodId.has(orderId)) byFoodId.set(orderId, row);
    }
    const publicId = publicOrderKey(row.formattedOrderId);
    if (publicId && !byPublicId.has(publicId)) byPublicId.set(publicId, row);
  }

  return orders.map((order) => {
    if (order.status !== "delivered" || order.storeRating != null) return order;
    const foodId = Number(order.id);
    const matched =
      (order.ordersCoreId > 0 ? byCoreId.get(order.ordersCoreId) : undefined) ??
      (Number.isFinite(foodId) && foodId > 0 ? byFoodId.get(foodId) : undefined) ??
      byPublicId.get(publicOrderKey(order.formattedOrderId) ?? "") ??
      byPublicId.get(publicOrderKey(order.orderNumber) ?? "") ??
      null;
    if (!matched) return order;
    return {
      ...order,
      storeRating: {
        reviewId: Number(matched.id),
        rating: Math.min(5, Math.max(1, Number(matched.overallRating))),
        reviewText: matched.reviewText != null ? String(matched.reviewText).trim() || null : null,
        reviewTitle: matched.reviewTitle != null ? String(matched.reviewTitle).trim() || null : null,
        createdAt: coerceTimestamp(matched.createdAt) ?? new Date().toISOString(),
        replyText: matched.replyText != null ? String(matched.replyText).trim() || null : null,
        repliedAt: coerceTimestamp(matched.repliedAt),
      },
    };
  });
}

/** Minimal ApiFoodOrder from a board OrderRecord — paints detail while GET refreshes. */
export function orderRecordToApiFoodOrder(r: OrderRecord): ApiFoodOrder | null {
  if (r.id.startsWith("core-")) return null;
  const foodId = parseInt(r.id, 10);
  if (!Number.isFinite(foodId) || foodId <= 0) return null;
  return {
    orders_food_id: foodId,
    orders_core_id: r.ordersCoreId,
    formatted_order_id: r.formattedOrderId,
    tax_invoice_number: r.taxInvoiceNumber ?? null,
    order_status: r.pipelineStatus || "CREATED",
    customer_name: r.customerName || null,
    customer_phone: r.customerPhone ?? null,
    customer_email: r.customerEmail ?? null,
    drop_address: r.dropAddress ?? null,
    distance_km: r.distanceKm ?? null,
    customer_store_order_ordinal: r.customerStoreOrderOrdinal ?? null,
    customer_store_orders_total: r.customerStoreOrdersTotal ?? null,
    customer_platform_orders_total: r.customerPlatformOrdersTotal ?? null,
    is_bulk_order: r.isBulkOrder,
    veg_non_veg: r.vegNonVeg ?? null,
    created_at: r.createdAt,
    delivery_type: r.deliveryType,
    rider_id: r.riderId ?? null,
    rider_name: r.riderName ?? null,
    rider_mobile: r.riderMobile ?? null,
    rider_selfie_url: r.riderSelfieUrl ?? null,
    rider_assignment_status: r.riderAssignmentStatus ?? null,
    rider_reached_at: r.riderReachedAt ?? null,
    rider_display_variant: r.riderDisplayVariant ?? null,
    core_status: r.coreStatus ?? null,
    current_status: r.currentStatus ?? null,
    reached_merchant_at: r.reachedMerchantAt ?? null,
    rider_reached_pickup_at: r.riderReachedPickupAt ?? null,
    pickup_wait_seconds: r.pickupWaitSeconds ?? null,
    rider_store_wait_live: r.riderStoreWaitLive,
    rider_store_wait_anchor_at: r.riderStoreWaitAnchorAt ?? null,
    rider_free_wait_seconds: r.riderFreeWaitSeconds ?? null,
    rider_wait_priority: r.riderWaitPriority,
    grand_total: r.total,
    food_items_total_value: r.total,
    total_ctm: r.totalCtm ?? null,
    merchant_precision_discount: r.merchantPrecisionDiscount,
    pricing: r.pricing
      ? {
          subtotal: r.pricing.subtotal,
          packaging: r.pricing.packaging,
          taxes: r.pricing.taxes,
          discount: r.pricing.discount,
          total: r.pricing.total,
        }
      : null,
    billing_snapshot: r.billingSnapshot ?? null,
    payment_status: r.paymentStatus ?? null,
    items: r.lineItems.map((it) => ({
      qty: it.qty,
      name: it.name,
      price: it.price,
      menu_item_id: it.menuItemId ?? null,
      item_image_url: it.itemImageUrl ?? null,
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
      is_item_promo: it.is_item_promo,
      applied_offer_type: it.applied_offer_type ?? null,
      ctm_from_snapshot: it.ctm_from_snapshot,
      special_instructions: it.specialInstructions ?? it.special_instructions ?? null,
    })),
    pickup_otp: r.pickupOtp ?? null,
    pickup_token: r.pickupToken ?? null,
    kot_number: r.kotNumber ?? null,
    rto_otp: r.rtoOtp ?? null,
    requires_utensils: r.requiresUtensils ?? null,
    delivery_instructions: r.deliveryInstructions ?? null,
    merchant_instructions_list: r.merchantInstructionsList,
    payment_method: r.paymentMethod ?? null,
    accepted_at: r.acceptedAt ?? null,
    preparing_at: r.preparingAt ?? null,
    prepared_at: r.preparedAt ?? null,
    dispatched_at: r.dispatchedAt ?? null,
    preparation_time_minutes: r.preparationTimeMinutes ?? null,
    prep_ready_by_at: r.prepReadyByAt ?? null,
    expected_ready_at: r.expectedReadyAt ?? null,
    prep_delay_minutes: r.prepDelayMinutes ?? null,
    prep_delay_use_count: r.prepDelayUseCount ?? null,
    last_prep_delay_minutes_added: r.lastPrepDelayMinutesAdded ?? null,
    prepared_late_minutes: r.preparedLateMinutes ?? null,
    handed_over_to_rider_at: r.handedOverToRiderAt ?? null,
    rider_picked_up_at: r.riderPickedUpAt ?? null,
    delivered_at: r.deliveredAt ?? null,
    cancelled_at: r.cancelledAt ?? null,
    rejected_reason: r.rejectedReason ?? null,
    accepted_by_label: r.acceptedByLabel ?? null,
    cancelled_by_label: r.cancelledByLabel ?? null,
    cancelled_by_type: r.cancelledByType ?? null,
    is_scheduled_order: r.isScheduledOrder,
    scheduled_delivery_summary: r.scheduledDeliverySummary ?? null,
    merchant_response_deadline_at: r.merchantResponseDeadlineAt ?? null,
    merchant_response_timeout_seconds: r.merchantResponseTimeoutSeconds ?? null,
    store_rating: r.storeRating
      ? {
          review_id: r.storeRating.reviewId,
          rating: r.storeRating.rating,
          review_text: r.storeRating.reviewText,
          review_title: r.storeRating.reviewTitle,
          created_at: r.storeRating.createdAt,
          reply_text: r.storeRating.replyText,
          replied_at: r.storeRating.repliedAt,
        }
      : null,
  };
}

export type OrdersState = {
  orders: OrderRecord[];
  loading: boolean;
  error: string | null;
  counts: OrderCounts;
};
