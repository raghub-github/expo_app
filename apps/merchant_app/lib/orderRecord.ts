/**
 * Merchant order record types + API → UI mapping (no React context — avoids Metro cycles).
 */

import type {
  ApiFoodOrder,
  ApiFoodOrderItem,
} from "@/services/ordersApi";
import { resolveMerchantOrderTotal } from "@/lib/resolveMerchantOrderTotal";

export type DeliveryType = "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP";

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

export type OrderRecord = {
  id: string;
  ordersCoreId: number;
  orderNumber: string;
  formattedOrderId: string | null;
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
  pickupOtp?: string;
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

export function apiStatusToStage(api: string): OrderStage {
  const u = api.toUpperCase();
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
  if (from === "created" && to === "preparing") return "ACCEPTED";
  if (from === "preparing" && to === "ready") return "READY_FOR_PICKUP";
  if (from === "ready" && to === "picked_up") return "OUT_FOR_DELIVERY";
  if (from === "picked_up" && to === "delivered") return "DELIVERED";
  return to.toUpperCase();
}

export function mapApiOrder(o: ApiFoodOrder): OrderRecord {
  const formatted = (o.formatted_order_id ?? "").trim();
  const orderNumber = formatted.length > 0 ? formatted : "";
  const deliveryType = (o.delivery_type ?? "GATIMITRA_RIDER") as DeliveryType;

  const foodRowId = o.core_only ? null : o.orders_food_id;
  const cancelledAt = coerceTimestamp(o.cancelled_at);
  const customerName = (o.customer_name ?? "").trim();

  return {
    id: foodRowId != null ? String(foodRowId) : `core-${o.orders_core_id}`,
    ordersCoreId: o.orders_core_id,
    orderNumber,
    formattedOrderId: formatted || null,
    customerName: customerName || "Guest",
    createdAt: o.created_at,
    displayTime: formatDisplayTime(o.created_at),
    lineItems: (o.items ?? []).map((it) => ({
      qty: it.qty,
      name: it.name,
      price: Number(it.price) || 0,
      menuItemId:
        it.menu_item_id != null && Number.isFinite(Number(it.menu_item_id))
          ? Number(it.menu_item_id)
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
    pickupOtp: o.pickup_otp ?? undefined,
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
  };
}

export type OrdersState = {
  orders: OrderRecord[];
  loading: boolean;
  error: string | null;
  counts: OrderCounts;
};
