import type { Sql } from "postgres";
import {
  merchantBillPartsFromItems,
  type BillLineItem,
} from "@gatimitra/bill-print";
import {
  annotateMerchantItemsWithItemOffers,
  merchantFundedDiscountFromBilling,
} from "../../lib/merchant-billing-discount.js";
import { emitEvent } from "../notifications/eventBus.js";
import {
  applyMerchantBaseToOrderItems,
  loadSnapshotsByOrderTexts,
  scaleMerchantOrderItemBreakdown,
  type ItemCommissionSnapshot,
} from "../../lib/merchant-visible-pricing.js";
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { resolvePartnerPipeline } from "../../lib/partner-orders-unify.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import {
  labelsForStatusUpdate,
  normalizeActionMode,
  normalizeActionSource,
  type MerchantOrderActionMode,
  type MerchantOrderActionSource,
} from "../../lib/merchant-order-food-action-labels.js";
import { recordAcceptanceTimeline } from "../../lib/order-acceptance-timeline.js";
import { recordCancellationTimeline } from "../../lib/order-cancellation-timeline.js";
import { resolveStorePrepWithBuffer } from "../../lib/order-prep-time.js";
import { applyPaymentCancellationPayment } from "../../lib/apply-cancellation-payment.js";
import {
  executeOrderCancellationFinancials,
  executeRtoFinancials,
  lookupOrderContext,
} from "../../lib/financial-rule-executor.js";
import { refundFieldsFromEngineResult } from "../../lib/order-cancellation-refund.js";
import { recordOrderCancellation } from "../../lib/record-order-cancellation.js";
import { autoRefundOnCancellation } from "../../lib/auto-refund-on-cancellation.js";
import { creditMerchantOrderEarningOnDelivered } from "../../lib/credit-merchant-order-on-delivered.js";
import { applyMerchantOrderCancellationLedger } from "../../lib/apply-merchant-cancellation-ledger.js";
import {
  clearMerchantStoreOrderNotifications,
  shouldClearOrderNotifications,
} from "../../lib/clear-merchant-order-notifications.js";
import { recordReadyTimeline } from "../../lib/order-food-status-timeline.js";
import { maybeStartOrderDispatch } from "../../lib/order-dispatch.service.js";
import { fetchFoodRiderAcceptFlow } from "../../lib/food-rider-accept-flow.js";
import { loadMerchantOrderLineItemsByTextIds } from "../../lib/load-merchant-order-line-items.js";
import { resolveMerchantCancellationFields } from "../../lib/merchant-cancellation-fields.js";
import {
  resolveOrderCancellationCompensationDisplay,
  type MerchantCancellationCompensationDisplay,
} from "../../lib/merchant-cancellation-compensation-display.js";
import { recordRiderAssignmentDeliveredIfActive } from "../../lib/order-rider-assignment-history.js";
import {
  resolveReachedMerchantAt,
  resolveRiderDisplayVariant,
  resolveRiderStoreWaitState,
  type RiderDisplayVariant,
} from "../../lib/rider-merchant-display-state.js";
import { resolveRiderFreeWaitSnapshot } from "../../lib/food-rider-free-wait.js";

export type MerchantFoodOrderItem = {
  qty: number;
  name: string;
  price: number;
  menu_item_id?: number | null;
  /** Live menu primary image (null/empty → show Add photo on preparing cards). */
  item_image_url?: string | null;
  veg_nonveg?: string | null;
  customizations?: string[];
  variant_tag?: string | null;
  category_name?: string | null;
  customization_lines?: Array<{
    name: string;
    amount: number;
    kind: "variant" | "addon" | "note";
  }>;
  base_amount?: number;
  customizations_total?: number;
  captured_base_amount?: number;
  captured_addon_amount?: number;
  has_customizations?: boolean;
  /** Menu/catalog line total before item Boost (same as price after merchant-base rewrite). */
  catalog_line_total?: number;
  /** Line total after allocating restaurant item-offer discount. */
  net_line_total?: number;
  offer_discount?: number;
  offer_label?: string | null;
  is_item_promo?: boolean;
  applied_offer_type?: string | null;
  /** Frozen from merchant_ctm_pricing_snapshot â€” do not rescale from live menu. */
  ctm_from_snapshot?: boolean;
  special_instructions?: string | null;
  specialInstructions?: string | null;
};

export type MerchantOrderPricing = {
  subtotal: number;
  packaging: number;
  taxes: number;
  discount: number;
  total: number;
};

export type MerchantFoodOrderDto = {
  orders_food_id: number;
  orders_core_id: number;
  core_only: boolean;
  formatted_order_id: string | null;
  /** Tax invoice number from orders_core (GST compliance). */
  tax_invoice_number?: string | null;
  order_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  delivery_type: string;
  rider_id: number | null;
  rider_name: string | null;
  rider_mobile: string | null;
  rider_selfie_url: string | null;
  rider_assignment_status: string | null;
  rider_reached_at: string | null;
  /** Canonical rider phase for merchant UI â€” computed server-side. */
  rider_display_variant: RiderDisplayVariant;
  core_status: string | null;
  current_status: string | null;
  reached_merchant_at: string | null;
  rider_reached_pickup_at: string | null;
  pickup_wait_seconds: number | null;
  rider_store_wait_live: boolean;
  rider_store_wait_anchor_at: string | null;
  /** Free wait after rider arrives (seconds). */
  rider_free_wait_seconds: number;
  /** True when free wait elapsed and rider still at store. */
  rider_wait_priority: boolean;
  grand_total: number;
  food_items_total_value?: number | null;
  /** Frozen merchant CTM from orders_core.total_ctm (payout engine / Partner Site SSOT). */
  total_ctm?: number | null;
  pricing: MerchantOrderPricing;
  /** Frozen merchant precision discount (orders_core.merchant_precision_discount) â€” SSOT, pass-through. */
  merchant_precision_discount: number;
  /** Full checkout breakdown (orders_core.billing_snapshot). */
  billing_snapshot: Record<string, unknown> | null;
  payment_status: string | null;
  items: MerchantFoodOrderItem[];
  pickup_otp: string | null;
  /** Secure QR token from order_pickup_tokens (merchant/partner print only). */
  pickup_token: string | null;
  /** Backend-generated store-scoped KOT number. */
  kot_number: string | null;
  rto_otp: string | null;
  payment_method: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  prepared_at: string | null;
  handed_over_to_rider_at: string | null;
  rider_picked_up_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  rejected_reason: string | null;
  accepted_by_label: string | null;
  cancelled_by_label: string | null;
  cancelled_by_type: string | null;
  /** Zomato-style compensation message from penalty engine (cancelled orders). */
  cancellation_compensation: MerchantCancellationCompensationDisplay | null;
  customer_email: string | null;
  drop_address: string | null;
  distance_km: number | null;
  /** 1-based: customer's Nth order at this store (Partner Site ordinal). */
  customer_store_order_ordinal: number | null;
  customer_store_orders_total: number | null;
  customer_platform_orders_total: number | null;
  is_bulk_order: boolean;
  veg_non_veg: string | null;
  requires_utensils: boolean | null;
  delivery_instructions: string | null;
  merchant_instructions_list: unknown;
  is_scheduled_order?: boolean;
  scheduled_delivery_summary?: string | null;
  preparation_time_minutes: number | null;
  prep_ready_by_at: string | null;
  expected_ready_at: string | null;
  prep_delay_minutes: number | null;
  prep_delay_use_count: number | null;
  last_prep_delay_minutes_added: number | null;
  prepared_late_minutes: number | null;
  merchant_response_deadline_at: string | null;
  merchant_response_timeout_seconds: number | null;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  try {
    const d = new Date(v as string | number | Date);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

function computePreparedLateMinutes(
  preparedAtIso: string,
  prepReadyByAtIso: string | null | undefined
): number {
  if (!prepReadyByAtIso) return 0;
  const lateMs = new Date(preparedAtIso).getTime() - new Date(prepReadyByAtIso).getTime();
  if (lateMs <= 0) return 0;
  return Math.max(1, Math.ceil(lateMs / 60_000));
}

type TimelineMilestoneSnapshot = {
  accepted_at: string | null;
  preparing_at: string | null;
  prepared_at: string | null;
  handed_over_to_rider_at: string | null;
  rider_picked_up_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

function emptyTimelineSnapshot(): TimelineMilestoneSnapshot {
  return {
    accepted_at: null,
    preparing_at: null,
    prepared_at: null,
    handed_over_to_rider_at: null,
    rider_picked_up_at: null,
    dispatched_at: null,
    delivered_at: null,
    cancelled_at: null,
  };
}

function mapTimelineStatusToMilestone(status: string): keyof TimelineMilestoneSnapshot | null {
  const u = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!u) return null;
  if (u.includes("accept")) return "accepted_at";
  if (u.includes("prepar")) return "preparing_at";
  if (
    u.includes("ready_for_pickup") ||
    u === "dispatch_ready" ||
    (u.includes("ready") && !u.includes("prepar"))
  ) {
    return "prepared_at";
  }
  if (u.includes("handover") || u.includes("handed")) return "handed_over_to_rider_at";
  if (
    u === "dispatched" ||
    u === "despatched" ||
    u.includes("picked") ||
    u.includes("pick_up") ||
    u.includes("out_for") ||
    (u.includes("dispatch") && !u.includes("ready"))
  ) {
    return "dispatched_at";
  }
  if (u.includes("deliver")) return "delivered_at";
  if (u.includes("cancel")) return "cancelled_at";
  if (u === "rto" || u.includes("return")) return "cancelled_at";
  return null;
}

function absorbTimelineRow(
  snap: TimelineMilestoneSnapshot,
  status: string,
  occurredAt: unknown
): void {
  const field = mapTimelineStatusToMilestone(status);
  const at = toIsoOrNull(occurredAt);
  if (!field || !at) return;
  const prev = snap[field];
  if (!prev || new Date(at).getTime() > new Date(prev).getTime()) {
    snap[field] = at;
  }
}

/** Postgres bigint/numeric often arrives as string â€” normalize for Map keys and IN lists. */
function coerceCustomerId(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type CustomerRow = {
  full_name: string | null;
  primary_mobile: string | null;
};

function pickCustomerDisplayName(cust: CustomerRow | undefined): string | null {
  if (!cust) return null;
  const full = (cust.full_name ?? "").trim();
  return full || null;
}

function mergeDbItemFields(
  it: MerchantFoodOrderItem,
  db?: MerchantFoodOrderItem
): MerchantFoodOrderItem {
  if (!db) return it;
  return {
    ...it,
    name: db.name || it.name,
    customizations: db.customizations ?? it.customizations,
    variant_tag: db.variant_tag ?? it.variant_tag,
    category_name: db.category_name ?? it.category_name,
    customization_lines: db.customization_lines ?? it.customization_lines,
    base_amount: db.base_amount ?? it.base_amount,
    customizations_total: db.customizations_total ?? it.customizations_total,
    captured_base_amount: db.captured_base_amount ?? it.captured_base_amount,
    captured_addon_amount: db.captured_addon_amount ?? it.captured_addon_amount,
    has_customizations: db.has_customizations ?? it.has_customizations,
    menu_item_id: db.menu_item_id ?? it.menu_item_id,
    item_image_url: db.item_image_url ?? it.item_image_url,
    catalog_line_total: db.catalog_line_total ?? it.catalog_line_total,
    net_line_total: db.net_line_total ?? it.net_line_total,
    offer_discount: db.offer_discount ?? it.offer_discount,
    offer_label: db.offer_label ?? it.offer_label,
    is_item_promo: db.is_item_promo ?? it.is_item_promo,
    applied_offer_type: db.applied_offer_type ?? it.applied_offer_type,
    ctm_from_snapshot: db.ctm_from_snapshot === true || it.ctm_from_snapshot === true,
    special_instructions: db.special_instructions ?? it.special_instructions ?? null,
    specialInstructions: db.specialInstructions ?? it.specialInstructions ?? db.special_instructions ?? it.special_instructions ?? null,
  };
}

function normalizeItems(raw: unknown): MerchantFoodOrderItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MerchantFoodOrderItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const qty = Number(r.quantity ?? r.qty ?? 1) || 1;
    const name = String(r.item_name ?? r.name ?? "Item");
    const price = num(r.total_price ?? r.price ?? r.base_price ?? 0);
    const vegRaw = r.veg_nonveg ?? r.vegNonveg ?? r.food_type ?? null;
    const veg_nonveg =
      vegRaw != null && String(vegRaw).trim() !== "" ? String(vegRaw).trim() : null;
    let customizations: string[] | undefined;
    if (Array.isArray(r.customizations)) {
      customizations = (r.customizations as unknown[])
        .map((c) => String(c).trim())
        .filter(Boolean);
    } else if (Array.isArray(r.addons)) {
      customizations = (r.addons as Record<string, unknown>[])
        .map((a) => {
          const n = String(a.addon_name ?? a.name ?? "Add-on").trim();
          const q = Number(a.quantity) || 1;
          return q > 1 ? `${n} Ã—${q}` : n;
        })
        .filter(Boolean);
    }
    const custText = r.customization ?? r.customisation;
    if ((!customizations || customizations.length === 0) && custText != null) {
      const t = String(custText).trim();
      if (t) customizations = t.split(/[,;|â€¢]+/).map((s) => s.trim()).filter(Boolean);
    }
    const instructionRaw =
      r.item_instructions ?? r.special_instructions ?? r.specialInstructions ?? null;
    const specialInstructions =
      instructionRaw != null && String(instructionRaw).trim()
        ? String(instructionRaw).trim().slice(0, 100)
        : null;
    const menuItemRaw = r.menu_item_id ?? r.menuItemId ?? null;
    const menu_item_id =
      menuItemRaw != null && Number.isFinite(Number(menuItemRaw)) && Number(menuItemRaw) > 0
        ? Number(menuItemRaw)
        : null;
    const imageRaw = r.item_image_url ?? r.itemImageUrl ?? r.image_url ?? null;
    const item_image_url =
      imageRaw != null && String(imageRaw).trim() ? String(imageRaw).trim() : null;
    out.push({
      qty,
      name,
      price,
      menu_item_id,
      item_image_url,
      veg_nonveg,
      customizations: customizations?.length ? customizations : undefined,
      has_customizations: (customizations?.length ?? 0) > 0,
      special_instructions: specialInstructions,
      specialInstructions,
    });
  }
  return out;
}

function mapDeliveryType(
  deliveryType: string | null | undefined,
  riderId: number | null,
  selfDeliveryEnabled: boolean
): "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP" {
  const dt = String(deliveryType ?? "delivery").toLowerCase();
  if (dt === "self_pickup" || dt.includes("pickup")) return "SELF_PICKUP";
  if (riderId != null && riderId > 0) return "GATIMITRA_RIDER";
  if (selfDeliveryEnabled) return "SELF_DELIVERY";
  return "GATIMITRA_RIDER";
}

function merchantFoodItemToBillLine(it: MerchantFoodOrderItem): BillLineItem {
  return {
    name: it.name,
    quantity: Math.max(1, it.qty || 1),
    price: it.price,
    total: it.price,
    variantTag: it.variant_tag ?? null,
    customizationLines: it.customization_lines?.map((l) => ({
      kind: l.kind,
      name: l.name,
      amount: l.amount,
      quantity: null,
    })),
    customizations: it.customizations,
    customizationsTotal: it.customizations_total ?? null,
    baseAmount: it.base_amount ?? null,
    capturedBaseAmount: it.captured_base_amount ?? null,
    capturedAddonAmount: it.captured_addon_amount ?? null,
    hasCustomizations: it.has_customizations ?? null,
    catalogLineTotal: it.catalog_line_total ?? null,
    netLineTotal: it.net_line_total ?? null,
    offerDiscount: it.offer_discount ?? null,
    offerLabel: it.offer_label ?? null,
    isItemPromo: it.is_item_promo ?? null,
    appliedOfferType: it.applied_offer_type ?? null,
    ctmFromSnapshot: it.ctm_from_snapshot === true,
  };
}

/** Cart precision already allocated on CTM lines — remainder applied once on the bill. */
function precisionDiscountOnLines(items: MerchantFoodOrderItem[]): number {
  return items.reduce((s, it) => {
    const t = String(it.applied_offer_type ?? "")
      .toUpperCase()
      .replace(/[-\s]+/g, "_");
    if (t === "PRECISION" || t === "CART_PERCENTAGE" || t === "CART_FLAT") {
      return s + (num(it.offer_discount) || 0);
    }
    if (
      it.is_item_promo !== true &&
      (num(it.offer_discount) || 0) > 0.005 &&
      !/BOOST|BOGO|BUY_/.test(t)
    ) {
      return s + (num(it.offer_discount) || 0);
    }
    return s;
  }, 0);
}

/**
 * Partner Site food-orders GET parity — items + packaging − precision (taxes: 0).
 * Uses @gatimitra/bill-print merchantBillPartsFromItems (same as PartnerIncomingOrderModal).
 */
function assembleMerchantOrderPricing(
  items: MerchantFoodOrderItem[],
  opts: {
    packaging: number;
    merchantDiscount: number;
    precisionFromCore: number;
    allCtmFrozen: boolean;
  }
): MerchantOrderPricing {
  const { packaging, merchantDiscount, precisionFromCore, allCtmFrozen } = opts;
  const billItems = items.map(merchantFoodItemToBillLine);
  const merchantSubtotal = round2(items.reduce((s, it) => s + num(it.price), 0));
  const ctmNetSum = round2(
    items.reduce((s, it) => s + num(it.net_line_total ?? it.price), 0)
  );
  const precisionOnLines = allCtmFrozen ? precisionDiscountOnLines(items) : 0;
  const missingPrecision = allCtmFrozen
    ? Math.max(0, precisionFromCore - precisionOnLines)
    : 0;
  const resolvedDisc = allCtmFrozen ? precisionFromCore : merchantDiscount;
  const resolvedTotal = allCtmFrozen
    ? round2(Math.max(0, ctmNetSum - missingPrecision + packaging))
    : 0;

  const bill = merchantBillPartsFromItems(billItems, {
    subtotal: merchantSubtotal,
    packaging,
    discount: resolvedDisc,
    total: resolvedTotal,
  });

  return {
    subtotal: bill.itemsSubtotal,
    packaging: bill.packaging,
    taxes: 0,
    discount: resolvedDisc,
    total: bill.total,
  };
}

type CoreRow = {
  id: number;
  order_id: string | null;
  formatted_order_id: string | null;
  customer_full_name: string | null;
  customer_primary_mobile: string | null;
  status: string;
  current_status: string | null;
  delivery_type: string | null;
  grand_total: unknown;
  item_total: unknown;
  addon_total: unknown;
  billing_snapshot: unknown;
  merchant_precision_discount: unknown;
  /** Frozen merchant CTM (orders_core.total_ctm) — payout engine SSOT when present. */
  total_ctm: unknown;
  payment_status: string | null;
  created_at: Date | string;
  customer_id: number | null;
  rider_id: number | null;
  payment_method: string | null;
  items: unknown;
  drop_address_raw: string | null;
  drop_address_normalized: string | null;
  distance_km: unknown;
  cancelled_at: string | null;
  is_bulk_order: boolean | null;
  merchant_instructions_list: unknown;
  tax_invoice_number?: string | null;
  checkout_metadata: unknown;
};

type FoodRow = {
  id: number;
  order_id: number | null;
  core_order_id: string | null;
  merchant_store_id: number | null;
  customer_id: number | null;
  order_status: string | null;
  food_items_total_value: unknown;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  items: unknown;
  formatted_order_id: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  prepared_at: string | null;
  handed_over_to_rider_at: string | null;
  rider_picked_up_at: string | null;
  rider_reached_pickup_at: string | null;
  pickup_wait_seconds: number | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  rejected_reason: string | null;
  accepted_by_label: string | null;
  cancelled_by_label: string | null;
  veg_non_veg: string | null;
  pickup_otp: string | null;
  rto_otp: string | null;
  requires_utensils: boolean | null;
  delivery_instructions: string | null;
  merchant_instructions_list: unknown;
  preparation_time_minutes: number | null;
  prep_ready_by_at: string | null;
  expected_ready_at: string | null;
  prep_delay_minutes: number | null;
  prep_delay_use_count: number | null;
  last_prep_delay_minutes_added: number | null;
  prepared_late_minutes: number | null;
  merchant_acceptance_deadline_at: string | null;
  merchant_acceptance_window_seconds: number | null;
};

export type MerchantFoodOrderRiderLogEntry = {
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  selfie_url: string | null;
  assignment_status: string;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

/** orders_core.customer_id â†’ customers (join + map); then orders_food.customer_name. */
function resolveCustomerName(
  core: CoreRow,
  food: FoodRow | null,
  cust: CustomerRow | undefined
): string | null {
  const fromJoin = pickCustomerDisplayName({
    full_name: core.customer_full_name,
    primary_mobile: core.customer_primary_mobile,
  });
  if (fromJoin) return fromJoin;
  const fromCustomers = pickCustomerDisplayName(cust);
  if (fromCustomers) return fromCustomers;
  const fromFood = (food?.customer_name ?? "").trim();
  if (fromFood && !/^(customer|guest)$/i.test(fromFood)) return fromFood;
  return fromFood || null;
}

function resolveCustomerId(core: CoreRow, food: FoodRow | null): number | null {
  return coerceCustomerId(core.customer_id) ?? coerceCustomerId(food?.customer_id);
}

function resolveFormattedOrderId(core: CoreRow, food: FoodRow | null): string | null {
  const coreFmt = core.formatted_order_id?.trim();
  if (coreFmt) return coreFmt;
  const foodFmt = food?.formatted_order_id?.trim();
  if (foodFmt) return foodFmt;
  const textOid = String(core.order_id ?? "").trim();
  return textOid.length > 0 ? textOid : null;
}

function matchFoodToCore(core: CoreRow, foodByCorePk: Map<number, FoodRow>, foodByTextId: Map<string, FoodRow>): FoodRow | null {
  const byPk = foodByCorePk.get(core.id);
  if (byPk) return byPk;
  const textId = String(core.order_id ?? "").trim();
  if (textId) return foodByTextId.get(textId) ?? null;
  return null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function resolveScheduledMeta(core: CoreRow): { isScheduled: boolean; summary: string | null } {
  const checkout = readRecord(core.checkout_metadata);
  const summary =
    typeof checkout?.scheduledDeliverySummary === "string"
      ? checkout.scheduledDeliverySummary.trim()
      : null;
  const isScheduled =
    Boolean(summary) || checkout?.isScheduled === true || checkout?.scheduled === true;
  return { isScheduled, summary: summary || null };
}

async function loadCoreRows(
  sql: Sql,
  storeId: number,
  limit: number,
  ordersFoodId?: number
): Promise<CoreRow[]> {
  if (ordersFoodId != null && Number.isFinite(ordersFoodId)) {
    try {
      const rows = await sql<CoreRow[]>`
        SELECT
          oc.id,
          oc.order_id,
          oc.formatted_order_id,
          cust.full_name AS customer_full_name,
          cust.primary_mobile AS customer_primary_mobile,
          oc.status,
          oc.current_status,
          oc.delivery_type,
          oc.grand_total,
          oc.item_total,
          oc.addon_total,
          oc.billing_snapshot,
          oc.merchant_precision_discount,
          oc.total_ctm,
          oc.checkout_metadata,
          oc.payment_status,
          oc.created_at,
          oc.customer_id,
          oc.rider_id,
          oc.payment_method,
          oc.items,
          oc.drop_address_normalized,
          oc.drop_address_raw,
          oc.distance_km,
          oc.cancelled_at,
          oc.is_bulk_order,
          oc.merchant_instructions_list,
          oc.tax_invoice_number
        FROM orders_food of
        LEFT JOIN orders_core oc
          ON oc.id = of.order_id
          OR (of.core_order_id IS NOT NULL AND oc.order_id = of.core_order_id)
        LEFT JOIN customers cust ON cust.id = oc.customer_id
        WHERE of.id = ${ordersFoodId}
          AND (
            oc.merchant_store_id = ${storeId}
            OR of.merchant_store_id = ${storeId}
          )
        LIMIT 1
      `;
      return rows.filter((r) => Number.isFinite(Number(r.id)));
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "42703") throw err;
      // 0412 not applied yet â€” load without merchant_precision_discount.
      const rows = await sql<CoreRow[]>`
        SELECT
          oc.id,
          oc.order_id,
          oc.formatted_order_id,
          cust.full_name AS customer_full_name,
          cust.primary_mobile AS customer_primary_mobile,
          oc.status,
          oc.current_status,
          oc.delivery_type,
          oc.grand_total,
          oc.item_total,
          oc.addon_total,
          oc.billing_snapshot,
          oc.checkout_metadata,
          oc.payment_status,
          oc.created_at,
          oc.customer_id,
          oc.rider_id,
          oc.payment_method,
          oc.items,
          oc.drop_address_normalized,
          oc.drop_address_raw,
          oc.distance_km,
          oc.cancelled_at,
          oc.is_bulk_order,
          oc.merchant_instructions_list,
          oc.tax_invoice_number
        FROM orders_food of
        LEFT JOIN orders_core oc
          ON oc.id = of.order_id
          OR (of.core_order_id IS NOT NULL AND oc.order_id = of.core_order_id)
        LEFT JOIN customers cust ON cust.id = oc.customer_id
        WHERE of.id = ${ordersFoodId}
          AND (
            oc.merchant_store_id = ${storeId}
            OR of.merchant_store_id = ${storeId}
          )
        LIMIT 1
      `;
      return rows.filter((r) => Number.isFinite(Number(r.id)));
    }
  }

  try {
    return await sql.begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '3500ms'`;
      return await tx<CoreRow[]>`
      SELECT
        oc.id,
        oc.order_id,
        oc.formatted_order_id,
        cust.full_name AS customer_full_name,
        cust.primary_mobile AS customer_primary_mobile,
        oc.status,
        oc.current_status,
        oc.delivery_type,
        oc.grand_total,
        oc.item_total,
        oc.addon_total,
        oc.billing_snapshot,
        oc.merchant_precision_discount,
        oc.total_ctm,
        oc.checkout_metadata,
        oc.payment_status,
        oc.created_at,
        oc.customer_id,
        oc.rider_id,
        oc.payment_method,
        oc.items,
        oc.drop_address_normalized,
        oc.drop_address_raw,
        oc.distance_km,
        oc.cancelled_at,
        oc.is_bulk_order,
        oc.merchant_instructions_list,
        oc.tax_invoice_number
      FROM orders_core oc
      LEFT JOIN customers cust ON cust.id = oc.customer_id
      WHERE oc.merchant_store_id = ${storeId}
      ORDER BY oc.created_at DESC
      LIMIT ${limit}
    `;
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // 57014 = statement_timeout — fall back to a smaller capped window
    if (code === "57014") {
      try {
        return await Promise.race([
          sql<CoreRow[]>`
          SELECT
            oc.id,
            oc.order_id,
            oc.formatted_order_id,
            cust.full_name AS customer_full_name,
            cust.primary_mobile AS customer_primary_mobile,
            oc.status,
            oc.current_status,
            oc.delivery_type,
            oc.grand_total,
            oc.item_total,
            oc.addon_total,
            oc.billing_snapshot,
            oc.merchant_precision_discount,
            oc.total_ctm,
            oc.checkout_metadata,
            oc.payment_status,
            oc.created_at,
            oc.customer_id,
            oc.rider_id,
            oc.payment_method,
            oc.items,
            oc.drop_address_normalized,
            oc.drop_address_raw,
            oc.distance_km,
            oc.cancelled_at,
            oc.is_bulk_order,
            oc.merchant_instructions_list,
            oc.tax_invoice_number
          FROM orders_core oc
          LEFT JOIN customers cust ON cust.id = oc.customer_id
          WHERE oc.merchant_store_id = ${storeId}
          ORDER BY oc.created_at DESC
          LIMIT ${Math.min(limit, 25)}
        `,
          new Promise<CoreRow[]>((resolve) => {
            setTimeout(() => resolve([]), 2_000);
          }),
        ]);
      } catch {
        return [];
      }
    }
    if (code !== "42703") throw err;
    return await sql<CoreRow[]>`
      SELECT
        oc.id,
        oc.order_id,
        oc.formatted_order_id,
        cust.full_name AS customer_full_name,
        cust.primary_mobile AS customer_primary_mobile,
        oc.status,
        oc.current_status,
        oc.delivery_type,
        oc.grand_total,
        oc.item_total,
        oc.addon_total,
        oc.billing_snapshot,
        oc.checkout_metadata,
        oc.payment_status,
        oc.created_at,
        oc.customer_id,
        oc.rider_id,
        oc.payment_method,
        oc.items,
        oc.drop_address_normalized,
        oc.drop_address_raw,
        oc.distance_km,
        oc.cancelled_at,
        oc.is_bulk_order,
        oc.merchant_instructions_list,
        oc.tax_invoice_number
      FROM orders_core oc
      LEFT JOIN customers cust ON cust.id = oc.customer_id
      WHERE oc.merchant_store_id = ${storeId}
      ORDER BY oc.created_at DESC
      LIMIT ${limit}
    `;
  }
}

async function loadFoodRowsForCores(sql: Sql, storeId: number, cores: CoreRow[]): Promise<FoodRow[]> {
  if (cores.length === 0) return [];

  const corePks = cores.map((c) => c.id).filter((n) => Number.isFinite(n));
  const textIds = [
    ...new Set(cores.map((c) => String(c.order_id ?? "").trim()).filter((s) => s.length > 0)),
  ];

  if (corePks.length === 0 && textIds.length === 0) return [];

  let rows: FoodRow[];
  // Prefer PK join only — `OR core_order_id` prevents index use and stalls under load.
  if (corePks.length > 0) {
    rows = await sql<FoodRow[]>`
      SELECT
        of.id,
        of.order_id,
        of.core_order_id,
        of.merchant_store_id,
        of.customer_id,
        of.order_status,
        of.food_items_total_value,
        of.customer_name,
        of.customer_phone,
        of.customer_email,
        of.items,
        of.formatted_order_id,
        of.accepted_at,
        of.preparing_at,
        of.prepared_at,
        of.handed_over_to_rider_at,
        of.rider_picked_up_at,
        of.rider_reached_pickup_at,
        of.pickup_wait_seconds,
        of.dispatched_at,
        of.delivered_at,
        of.cancelled_at,
        of.rejected_reason,
        of.accepted_by_label,
        of.cancelled_by_label,
        of.veg_non_veg,
        of.pickup_otp,
        of.rto_otp,
        of.requires_utensils,
        of.delivery_instructions,
        of.merchant_instructions_list,
        of.preparation_time_minutes,
        of.prep_ready_by_at,
        of.expected_ready_at,
        of.prep_delay_minutes,
        of.prep_delay_use_count,
        of.last_prep_delay_minutes_added,
        of.prepared_late_minutes,
        of.merchant_acceptance_deadline_at,
        of.merchant_acceptance_window_seconds
      FROM orders_food of
      WHERE of.merchant_store_id = ${storeId}
        AND of.order_id IN ${sql(corePks)}
    `;
    const matchedCore = new Set(
      rows.map((r) => Number(r.order_id)).filter((n) => Number.isFinite(n))
    );
    const missingTextIds = cores
      .filter((c) => !matchedCore.has(c.id))
      .map((c) => String(c.order_id ?? "").trim())
      .filter((s) => s.length > 0);
    if (missingTextIds.length > 0) {
      const extra = await sql<FoodRow[]>`
        SELECT
          of.id,
          of.order_id,
          of.core_order_id,
          of.merchant_store_id,
          of.customer_id,
          of.order_status,
          of.food_items_total_value,
          of.customer_name,
          of.customer_phone,
          of.customer_email,
          of.items,
          of.formatted_order_id,
          of.accepted_at,
          of.preparing_at,
          of.prepared_at,
          of.handed_over_to_rider_at,
          of.rider_picked_up_at,
          of.rider_reached_pickup_at,
          of.pickup_wait_seconds,
          of.dispatched_at,
          of.delivered_at,
          of.cancelled_at,
          of.rejected_reason,
          of.accepted_by_label,
          of.cancelled_by_label,
          of.veg_non_veg,
          of.pickup_otp,
          of.rto_otp,
          of.requires_utensils,
          of.delivery_instructions,
          of.merchant_instructions_list,
          of.preparation_time_minutes,
          of.prep_ready_by_at,
          of.expected_ready_at,
          of.prep_delay_minutes,
          of.prep_delay_use_count,
          of.last_prep_delay_minutes_added,
          of.prepared_late_minutes,
          of.merchant_acceptance_deadline_at,
          of.merchant_acceptance_window_seconds
        FROM orders_food of
        WHERE of.merchant_store_id = ${storeId}
          AND of.core_order_id IN ${sql(missingTextIds)}
      `;
      rows = [...rows, ...extra];
    }
  } else if (textIds.length > 0) {
    rows = await sql<FoodRow[]>`
      SELECT
        of.id,
        of.order_id,
        of.core_order_id,
        of.merchant_store_id,
        of.customer_id,
        of.order_status,
        of.food_items_total_value,
        of.customer_name,
        of.customer_phone,
        of.customer_email,
        of.items,
        of.formatted_order_id,
        of.accepted_at,
        of.preparing_at,
        of.prepared_at,
        of.handed_over_to_rider_at,
        of.rider_picked_up_at,
        of.rider_reached_pickup_at,
        of.pickup_wait_seconds,
        of.dispatched_at,
        of.delivered_at,
        of.cancelled_at,
        of.rejected_reason,
        of.accepted_by_label,
        of.cancelled_by_label,
        of.veg_non_veg,
        of.pickup_otp,
        of.rto_otp,
        of.requires_utensils,
        of.delivery_instructions,
        of.merchant_instructions_list,
        of.preparation_time_minutes,
        of.prep_ready_by_at,
        of.expected_ready_at,
        of.prep_delay_minutes,
        of.prep_delay_use_count,
        of.last_prep_delay_minutes_added,
        of.prepared_late_minutes,
        of.merchant_acceptance_deadline_at,
        of.merchant_acceptance_window_seconds
      FROM orders_food of
      WHERE of.merchant_store_id = ${storeId}
        AND of.core_order_id IN ${sql(textIds)}
    `;
  } else {
    return [];
  }
  return rows;
}

function indexFoodRows(foods: FoodRow[]): {
  byCorePk: Map<number, FoodRow>;
  byTextId: Map<string, FoodRow>;
} {
  const byCorePk = new Map<number, FoodRow>();
  const byTextId = new Map<string, FoodRow>();
  for (const f of foods) {
    if (f.order_id != null && Number.isFinite(Number(f.order_id))) {
      byCorePk.set(Number(f.order_id), f);
    }
    const textId = String(f.core_order_id ?? "").trim();
    if (textId) byTextId.set(textId, f);
  }
  return { byCorePk, byTextId };
}

function resolveCancelledAt(food: FoodRow | null, core: CoreRow): string | null {
  const fromFood = food?.cancelled_at;
  if (fromFood) return new Date(fromFood).toISOString();
  if (core.cancelled_at) return new Date(core.cancelled_at).toISOString();
  return null;
}

type ActiveRiderSnapshot = {
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  rider_selfie_url: string | null;
  rider_assignment_status: string | null;
  rider_reached_at: string | null;
  picked_up_at: string | null;
};

async function loadActiveRidersByCoreIds(
  sql: Sql,
  coreIds: number[]
): Promise<Map<number, ActiveRiderSnapshot>> {
  const result = new Map<number, ActiveRiderSnapshot>();
  if (coreIds.length === 0) return result;

  const assignments = await sql<
    Array<{
      core_id: number;
      rider_id: number;
      rider_name: string | null;
      rider_mobile: string | null;
      assignment_status: string | null;
      is_active: boolean | null;
      assignment_sequence: number | null;
      assigned_at: string | null;
      reached_merchant_at: string | null;
      picked_up_at: string | null;
      cancelled_at: string | null;
      unassigned_at: string | null;
    }>
  >`
    SELECT
      COALESCE(ora.order_core_id, ora.order_id) AS core_id,
      ora.rider_id,
      ora.rider_name,
      ora.rider_mobile,
      ora.assignment_status,
      ora.is_active,
      ora.assignment_sequence,
      ora.assigned_at,
      ora.reached_merchant_at,
      ora.picked_up_at,
      ora.cancelled_at,
      ora.unassigned_at
    FROM order_rider_assignments ora
    WHERE ora.order_core_id IN ${sql(coreIds)}
      AND ora.cancelled_at IS NULL
      AND ora.unassigned_at IS NULL
      AND UPPER(COALESCE(ora.assignment_status::text, '')) NOT IN ('CANCELLED', 'REJECTED', 'UNASSIGNED')
    ORDER BY
      ora.order_core_id,
      CASE WHEN ora.is_active THEN 0 ELSE 1 END,
      ora.assignment_sequence DESC NULLS LAST,
      ora.assigned_at DESC NULLS LAST
  `;

  const byCore = new Map<number, (typeof assignments)[number]>();
  for (const row of assignments) {
    const coreId = Number(row.core_id);
    if (!Number.isFinite(coreId) || byCore.has(coreId)) continue;
    byCore.set(coreId, row);
  }
  if (byCore.size === 0) return result;

  const riderIds = [...new Set([...byCore.values()].map((a) => a.rider_id))];
  const riders = await sql<
    Array<{ id: number; name: string | null; mobile: string | null; selfie_url: string | null }>
  >`
    SELECT id, name, mobile, selfie_url FROM riders WHERE id IN ${sql(riderIds)}
  `;
  const riderMap = new Map(riders.map((r) => [Number(r.id), r]));

  for (const [coreId, assignment] of byCore) {
    const rider = riderMap.get(assignment.rider_id);
    result.set(coreId, {
      rider_id: assignment.rider_id,
      rider_name: rider?.name?.trim() || assignment.rider_name?.trim() || null,
      rider_mobile: assignment.rider_mobile ?? rider?.mobile ?? null,
      rider_selfie_url: toAbsoluteClientMediaUrl(rider?.selfie_url ?? null),
      rider_assignment_status: assignment.assignment_status ?? null,
      rider_reached_at: assignment.reached_merchant_at ?? null,
      picked_up_at: assignment.picked_up_at ?? null,
    });
  }

  return result;
}

async function buildOrderDto(
  core: CoreRow,
  food: FoodRow | null,
  opts: {
    storeId: number;
    commissionPercent?: number;
    snapshotsByOrderText: Map<string, ItemCommissionSnapshot[]>;
    selfDeliveryEnabled: boolean;
    customerById: Map<number, CustomerRow>;
    storeOrdinalByCoreId: Map<number, number>;
    customerStoreOrdersTotalById: Map<number, number>;
    customerPlatformOrdersTotalById: Map<number, number>;
    timelineSnapByCoreId: Map<number, TimelineMilestoneSnapshot>;
    itemsByOrderTextId: Map<string, MerchantFoodOrderItem[]>;
    /** Board-only: menu_item_id + item_image_url without replacing JSON line items. */
    menuMetaByOrderTextId?: Map<
      string,
      Array<{ menu_item_id: number | null; item_image_url: string | null }>
    >;
    otpByCoreId: Map<number, { pickup: string | null; rto: string | null }>;
    activeRiderByCoreId: Map<number, ActiveRiderSnapshot>;
    pickupTokenByCoreId: Map<number, { token: string | null; kot_number: string | null }>;
    /** Payout-engine SSOT: order_settlement_breakdown.merchant_gross by core id. */
    settlementGrossByCoreId: Map<number, number>;
    /** Board list path — skip heavy per-row commission rescale. */
    boardList?: boolean;
  }
): Promise<MerchantFoodOrderDto> {
  const otps = opts.otpByCoreId.get(core.id);
  const pickupMeta = opts.pickupTokenByCoreId.get(core.id);
  const coreOnly = food == null;
  const tl = opts.timelineSnapByCoreId?.get(core.id);
  const scheduledMeta = resolveScheduledMeta(core);
  const activeRider = opts.activeRiderByCoreId.get(core.id);
  const resolvedRiderId =
    core.rider_id != null && Number.isFinite(Number(core.rider_id))
      ? Number(core.rider_id)
      : activeRider?.rider_id ?? null;

  const riderPickedUpAt =
    toIsoOrNull(food?.rider_picked_up_at) ??
    tl?.rider_picked_up_at ??
    toIsoOrNull(activeRider?.picked_up_at) ??
    null;
  const pipeline = resolvePartnerPipeline(
    food?.order_status ?? null,
    core.status,
    core.current_status,
    riderPickedUpAt
  );
  const customerId = resolveCustomerId(core, food);
  const cust = customerId != null ? opts.customerById.get(customerId) : undefined;
  const textOid = String(core.order_id ?? "").trim();
  let items = normalizeItems(food?.items ?? core.items);
  const fromDb = textOid ? opts.itemsByOrderTextId.get(textOid) : undefined;
  if (fromDb?.length) {
    if (items.length === 0) {
      items = fromDb;
    } else {
      items = items.map((it, i) => mergeDbItemFields(it, fromDb[i]));
      if (fromDb.length > items.length) items = fromDb;
    }
  }

  const menuMeta = textOid ? opts.menuMetaByOrderTextId?.get(textOid) : undefined;
  if (menuMeta?.length && items.length > 0) {
    items = items.map((it, i) => {
      const meta = menuMeta[i];
      if (!meta) return it;
      return {
        ...it,
        menu_item_id: it.menu_item_id ?? meta.menu_item_id,
        item_image_url: it.item_image_url ?? meta.item_image_url,
      };
    });
  } else if (menuMeta?.length && items.length === 0) {
    // JSON missing — still expose names from core items load is preferred;
    // without names, skip empty stubs so the card does not show blank rows.
  }

  const snaps = textOid ? opts.snapshotsByOrderText.get(textOid) ?? [] : [];
  const itemsBeforeBase = items.map((it) => ({ ...it }));
  const allCtmFrozen =
    items.length > 0 && items.every((it) => it.ctm_from_snapshot === true);
  const boardList = opts.boardList === true;
  if (allCtmFrozen) {
    // Merchant CTM snapshot is already merchant-rupee SSOT — do not rescale from menu/commission.
    items = items.map((it) => ({
      ...it,
      // Keep catalog for strike; price stays catalog so annotate/bill math stay consistent.
      price: num(it.catalog_line_total ?? it.price),
    }));
  } else if (boardList) {
    // Board: trust JSON / lite meta prices — applyMerchantBase is too slow at list scale.
    items = itemsBeforeBase;
  } else {
    const { items: merchantItems, merchantSubtotal } = await applyMerchantBaseToOrderItems(
      items,
      snaps,
      { storeId: opts.storeId, commissionPercent: opts.commissionPercent }
    );
    items = itemsBeforeBase.map((it, i) => {
      const mapped = merchantItems[i];
      const lineTotal = num(mapped?.price ?? it.price);
      return scaleMerchantOrderItemBreakdown(it, lineTotal) as MerchantFoodOrderItem;
    });
    void merchantSubtotal;
  }

  const billingSnap =
    core.billing_snapshot && typeof core.billing_snapshot === "object"
      ? (core.billing_snapshot as Record<string, unknown>)
      : null;
  // CTM snapshot is immutable SSOT — skip recompute. Legacy orders still annotate.
  // Board list also skips annotate (avoids per-order CPU on the hot path).
  if (!allCtmFrozen && !boardList) {
    items = annotateMerchantItemsWithItemOffers(items, billingSnap);
  }

  const packaging = num(billingSnap?.packaging_fee ?? 0);
  const merchantDiscount = merchantFundedDiscountFromBilling(billingSnap);
  const precisionFromCore = Math.max(0, num(core.merchant_precision_discount));
  const fromCoreCtm = num(core.total_ctm);
  const pricing = assembleMerchantOrderPricing(items, {
    packaging,
    merchantDiscount,
    precisionFromCore,
    allCtmFrozen,
  });
  const merchantTotal = pricing.total;
  const riderReachedPickupAt = toIsoOrNull(food?.rider_reached_pickup_at);
  const riderDisplayInput = {
    order_status: pipeline,
    core_status: core.status != null ? String(core.status) : null,
    current_status: core.current_status ?? null,
    reached_merchant_at: activeRider?.rider_reached_at ?? null,
    rider_reached_pickup_at: riderReachedPickupAt,
    rider_picked_up_at: riderPickedUpAt,
    pickup_wait_seconds:
      food?.pickup_wait_seconds != null && Number.isFinite(Number(food.pickup_wait_seconds))
        ? Math.max(0, Math.floor(Number(food.pickup_wait_seconds)))
        : null,
    rider_assignment_status: activeRider?.rider_assignment_status ?? null,
  };
  const reachedMerchantAt = resolveReachedMerchantAt(riderDisplayInput);
  const riderDisplayVariant = resolveRiderDisplayVariant(riderDisplayInput);
  const storeWait = resolveRiderStoreWaitState(riderDisplayInput);
  const freeWaitSnap = resolveRiderFreeWaitSnapshot({
    arrived: riderDisplayVariant === "arrived",
    live: storeWait.live,
    anchorAt: storeWait.anchorAt,
    finalizedSeconds: storeWait.finalizedSeconds,
  });

  return {
    orders_food_id: food != null ? Number(food.id) : core.id,
    orders_core_id: core.id,
    core_only: coreOnly,
    formatted_order_id: resolveFormattedOrderId(core, food),
    tax_invoice_number:
      typeof core.tax_invoice_number === "string"
        ? core.tax_invoice_number.trim() || null
        : null,
    order_status: pipeline,
    customer_name: resolveCustomerName(core, food, cust),
    customer_phone:
      food?.customer_phone ?? cust?.primary_mobile ?? core.customer_primary_mobile ?? null,
    customer_email: food?.customer_email ?? null,
    created_at: new Date(core.created_at).toISOString(),
    delivery_type: mapDeliveryType(
      core.delivery_type,
      resolvedRiderId,
      opts.selfDeliveryEnabled
    ),
    rider_id: resolvedRiderId,
    rider_name: activeRider?.rider_name ?? null,
    rider_mobile: activeRider?.rider_mobile ?? null,
    rider_selfie_url: activeRider?.rider_selfie_url ?? null,
    rider_assignment_status: activeRider?.rider_assignment_status ?? null,
    rider_reached_at: reachedMerchantAt,
    rider_display_variant: riderDisplayVariant,
    core_status: riderDisplayInput.core_status,
    current_status: riderDisplayInput.current_status,
    reached_merchant_at: reachedMerchantAt,
    rider_reached_pickup_at: riderReachedPickupAt,
    pickup_wait_seconds: riderDisplayInput.pickup_wait_seconds,
    rider_store_wait_live: storeWait.live,
    rider_store_wait_anchor_at: storeWait.anchorAt,
    rider_free_wait_seconds: freeWaitSnap.freeWaitSeconds,
    rider_wait_priority: freeWaitSnap.priority,
    grand_total: merchantTotal,
    food_items_total_value: merchantTotal,
    total_ctm: fromCoreCtm > 0 ? round2(fromCoreCtm) : merchantTotal > 0 ? merchantTotal : null,
    pricing,
    merchant_precision_discount: Math.max(0, num(core.merchant_precision_discount)),
    billing_snapshot: billingSnap,
    payment_status: core.payment_status ?? null,
    items,
    pickup_otp: food?.pickup_otp ?? otps?.pickup ?? null,
    pickup_token: pickupMeta?.token ?? null,
    kot_number: pickupMeta?.kot_number ?? null,
    rto_otp: food?.rto_otp ?? otps?.rto ?? null,
    payment_method: core.payment_method,
    accepted_at: toIsoOrNull(food?.accepted_at) ?? tl?.accepted_at ?? null,
    preparing_at: toIsoOrNull(food?.preparing_at) ?? tl?.preparing_at ?? null,
    prepared_at: toIsoOrNull(food?.prepared_at) ?? tl?.prepared_at ?? null,
    handed_over_to_rider_at:
      toIsoOrNull(food?.handed_over_to_rider_at) ?? tl?.handed_over_to_rider_at ?? null,
    rider_picked_up_at: riderPickedUpAt,
    dispatched_at: toIsoOrNull(food?.dispatched_at) ?? tl?.dispatched_at ?? null,
    delivered_at: toIsoOrNull(food?.delivered_at) ?? tl?.delivered_at ?? null,
    cancelled_at: resolveCancelledAt(food, core) ?? tl?.cancelled_at ?? null,
    rejected_reason: food?.rejected_reason ?? null,
    accepted_by_label: food?.accepted_by_label ?? null,
    cancelled_by_label: food?.cancelled_by_label ?? null,
    cancelled_by_type:
      (food as { cancelled_by_type?: string | null } | null)?.cancelled_by_type ??
      (core as { cancelled_by_type?: string | null }).cancelled_by_type ??
      null,
    drop_address:
      (core.drop_address_normalized as string | null)?.trim() ||
      (core.drop_address_raw as string | null)?.trim() ||
      null,
    distance_km:
      core.distance_km != null && core.distance_km !== "" ? num(core.distance_km) : null,
    customer_store_order_ordinal: opts.storeOrdinalByCoreId?.get(core.id) ?? null,
    customer_store_orders_total:
      customerId != null
        ? opts.customerStoreOrdersTotalById?.get(customerId) ?? null
        : null,
    customer_platform_orders_total:
      customerId != null
        ? opts.customerPlatformOrdersTotalById?.get(customerId) ?? null
        : null,
    is_bulk_order: Boolean(core.is_bulk_order),
    veg_non_veg: food?.veg_non_veg != null ? String(food.veg_non_veg) : null,
    requires_utensils: food?.requires_utensils ?? null,
    delivery_instructions: food?.delivery_instructions ?? null,
    merchant_instructions_list:
      food?.merchant_instructions_list ?? core.merchant_instructions_list ?? [],
    is_scheduled_order: scheduledMeta.isScheduled,
    scheduled_delivery_summary: scheduledMeta.summary,
    preparation_time_minutes:
      food?.preparation_time_minutes != null ? Number(food.preparation_time_minutes) : null,
    prep_ready_by_at: toIsoOrNull(food?.prep_ready_by_at),
    expected_ready_at: toIsoOrNull(food?.expected_ready_at),
    prep_delay_minutes:
      food?.prep_delay_minutes != null ? Number(food.prep_delay_minutes) : null,
    prep_delay_use_count:
      food?.prep_delay_use_count != null ? Number(food.prep_delay_use_count) : null,
    last_prep_delay_minutes_added:
      food?.last_prep_delay_minutes_added != null
        ? Number(food.last_prep_delay_minutes_added)
        : null,
    prepared_late_minutes:
      food?.prepared_late_minutes != null ? Number(food.prepared_late_minutes) : null,
    merchant_response_deadline_at: toIsoOrNull(food?.merchant_acceptance_deadline_at),
    merchant_response_timeout_seconds:
      food?.merchant_acceptance_window_seconds != null &&
      Number.isFinite(Number(food.merchant_acceptance_window_seconds))
        ? Math.max(0, Math.floor(Number(food.merchant_acceptance_window_seconds)))
        : null,
    cancellation_compensation: null,
  };
}

const PREP_DELAY_OPTIONS = [5, 10, 15] as const;

export async function patchMerchantFoodOrderPrepDelay(
  sql: Sql,
  storeId: number,
  ordersFoodId: number,
  additionalMinutes: number
): Promise<MerchantFoodOrderDto> {
  if (
    !PREP_DELAY_OPTIONS.includes(additionalMinutes as (typeof PREP_DELAY_OPTIONS)[number])
  ) {
    throw new Error("invalid_prep_delay_minutes");
  }

  const existingRows = await sql`
    SELECT
      of.id,
      of.order_id,
      of.order_status,
      of.prep_ready_by_at,
      of.prep_delay_minutes,
      of.prep_delay_use_count,
      of.merchant_store_id,
      COALESCE(oc.is_bulk_order, false) AS is_bulk_order
    FROM orders_food of
    LEFT JOIN orders_core oc ON oc.id = of.order_id
    WHERE of.id = ${ordersFoodId}
    LIMIT 1
  `;
  const existing = existingRows[0] as
    | {
        id: number;
        order_id: number | null;
        order_status: string | null;
        prep_ready_by_at: string | null;
        prep_delay_minutes: number | null;
        prep_delay_use_count: number | null;
        merchant_store_id: number;
        is_bulk_order: boolean;
      }
    | undefined;
  if (!existing) throw new Error("order_not_found");
  if (Number(existing.merchant_store_id) !== storeId) throw new Error("store_mismatch");

  const st = String(existing.order_status || "").toUpperCase();
  if (st !== "PREPARING" && st !== "ACCEPTED") {
    throw new Error("prep_delay_not_allowed");
  }

  const prevUseCount = Number(existing.prep_delay_use_count) || 0;
  const maxUses = existing.is_bulk_order ? 2 : 1;
  if (prevUseCount >= maxUses) {
    throw new Error("prep_delay_limit_reached");
  }

  const now = new Date().toISOString();
  const prevDelay = Number(existing.prep_delay_minutes) || 0;
  const newDelayTotal = prevDelay + additionalMinutes;
  const newUseCount = prevUseCount + 1;
  const { computeExpectedReadyAtFromNow } = await import("../../lib/order-prep-time.js");
  const newExpectedReadyAt = computeExpectedReadyAtFromNow(additionalMinutes, now);

  await sql`
    UPDATE orders_food
    SET expected_ready_at = ${newExpectedReadyAt}::timestamptz,
        prep_delay_minutes = ${newDelayTotal},
        prep_delay_use_count = ${newUseCount},
        last_prep_delay_minutes_added = ${additionalMinutes},
        updated_at = ${now}::timestamptz
    WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
  `;

  if (existing.order_id != null && Number.isFinite(Number(existing.order_id))) {
    try {
      await sql`
        UPDATE orders_core
        SET expected_ready_at = ${newExpectedReadyAt}::timestamptz,
            prep_delay_minutes = ${newDelayTotal},
            prep_delay_use_count = ${newUseCount},
            updated_at = ${now}::timestamptz
        WHERE id = ${Number(existing.order_id)}
      `;
    } catch {
      /* non-fatal */
    }
  }

  try {
    await sql`
      INSERT INTO merchant_order_food_actions (
        orders_food_id, orders_core_id, merchant_store_id,
        from_status, to_status, action_source, actor_type, actor_label, metadata
      )
      VALUES (
        ${ordersFoodId},
        ${existing.order_id != null ? Number(existing.order_id) : null},
        ${storeId},
        ${st},
        ${st},
        ${"app"},
        ${"merchant"},
        ${"Store"},
        ${JSON.stringify({
          prep_delay_minutes_added: additionalMinutes,
          prep_delay_minutes_total: newDelayTotal,
          expected_ready_at: newExpectedReadyAt,
          prep_ready_by_at: existing.prep_ready_by_at,
        })}
      )
    `;
  } catch {
    /* non-fatal */
  }

  if (existing.order_id != null && Number.isFinite(Number(existing.order_id))) {
    try {
      const { applyPrepDelayCustomerEffects } = await import(
        "../../lib/customer-prep-delay-effects.js"
      );
      await applyPrepDelayCustomerEffects(sql, {
        ordersCoreId: Number(existing.order_id),
        additionalMinutes,
        expectedReadyAt: newExpectedReadyAt,
      });
    } catch {
      /* non-fatal â€” prep delay DB update already committed */
    }
  }

  const orders = await loadMerchantFoodOrders(sql, storeId, { ordersFoodId });
  const updated = orders[0];
  if (!updated) throw new Error("order_not_found");
  return updated;
}

export async function loadMerchantFoodOrderRidersLog(
  sql: Sql,
  storeId: number,
  ordersFoodId: number
): Promise<MerchantFoodOrderRiderLogEntry[]> {
  const foodRows = await sql<
    Array<{ order_id: number | null; core_order_id: string | null }>
  >`
    SELECT order_id, core_order_id FROM orders_food
    WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    LIMIT 1
  `;
  const food = foodRows[0];
  if (!food) return [];

  let coreOrderId: number | null =
    food.order_id != null && Number.isFinite(Number(food.order_id))
      ? Number(food.order_id)
      : null;
  if (coreOrderId == null) {
    const textId = String(food.core_order_id ?? "").trim();
    if (textId) {
      const coreRows = await sql<{ id: number }[]>`
        SELECT id FROM orders_core WHERE order_id = ${textId} LIMIT 1
      `;
      const id = coreRows[0]?.id;
      if (id != null && Number.isFinite(Number(id))) coreOrderId = Number(id);
    }
  }
  if (coreOrderId == null) return [];

  const assignments = await sql<
    Array<{
      rider_id: number;
      rider_name: string | null;
      rider_mobile: string | null;
      assignment_status: string | null;
      assigned_at: string | null;
      accepted_at: string | null;
      rejected_at: string | null;
      reached_merchant_at: string | null;
      picked_up_at: string | null;
      delivered_at: string | null;
      cancelled_at: string | null;
      unassigned_at: string | null;
    }>
  >`
    SELECT rider_id, rider_name, rider_mobile, assignment_status,
      assignment_sequence, is_active,
      assigned_at, accepted_at, rejected_at, reached_merchant_at,
      picked_up_at, delivered_at, cancelled_at, unassigned_at
    FROM order_rider_assignments
    WHERE order_core_id = ${coreOrderId}
       OR order_id = ${coreOrderId}
    ORDER BY assignment_sequence DESC NULLS LAST, assigned_at DESC NULLS LAST
  `;
  if (!assignments.length) return [];

  const riderIds = [...new Set(assignments.map((a) => a.rider_id))];
  const riders = await sql<
    Array<{ id: number; name: string | null; mobile: string | null; selfie_url: string | null }>
  >`
    SELECT id, name, mobile, selfie_url FROM riders WHERE id IN ${sql(riderIds)}
  `;
  const riderMap = new Map(riders.map((r) => [r.id, r]));

  return assignments.map((a) => {
    const r = riderMap.get(a.rider_id);
    const endedAt = a.cancelled_at ?? a.unassigned_at ?? null;
    let status = a.assignment_status ?? "pending";
    if (
      endedAt &&
      !["CANCELLED", "REJECTED", "UNASSIGNED"].includes(String(status).toUpperCase())
    ) {
      status = "CANCELLED";
    }
    return {
      rider_id: a.rider_id,
      rider_name: r?.name?.trim() || a.rider_name?.trim() || null,
      rider_mobile: a.rider_mobile ?? r?.mobile ?? null,
      selfie_url: toAbsoluteClientMediaUrl(r?.selfie_url ?? null),
      assignment_status: status,
      assigned_at: toIsoOrNull(a.assigned_at),
      accepted_at: toIsoOrNull(a.accepted_at),
      rejected_at: toIsoOrNull(a.rejected_at),
      reached_merchant_at: toIsoOrNull(a.reached_merchant_at),
      picked_up_at: toIsoOrNull(a.picked_up_at),
      delivered_at: toIsoOrNull(a.delivered_at),
      cancelled_at: toIsoOrNull(endedAt),
    };
  });
}

export async function loadMerchantFoodOrders(
  sql: Sql,
  storeId: number,
  options: { limit?: number; ordersFoodId?: number } = {}
): Promise<MerchantFoodOrderDto[]> {
  const limit = Math.min(options.limit ?? 200, 500);
  const ordersFoodId = options.ordersFoodId;

  const cores = await loadCoreRows(sql, storeId, limit, ordersFoodId);
  if (cores.length === 0) return [];

  const isBoardList = ordersFoodId == null;
  const foods = isBoardList
    ? await (async () => {
        try {
          return await Promise.race([
            loadFoodRowsForCores(sql, storeId, cores),
            new Promise<FoodRow[]>((resolve) => {
              setTimeout(() => resolve([]), 2_000);
            }),
          ]);
        } catch {
          return [] as FoodRow[];
        }
      })()
    : await loadFoodRowsForCores(sql, storeId, cores);
  const { byCorePk, byTextId } = indexFoodRows(foods);

  const customerIds = [
    ...new Set(
      [
        ...cores.map((c) => coerceCustomerId(c.customer_id)),
        ...foods.map((f) => coerceCustomerId(f.customer_id)),
      ].filter((id): id is number => id != null)
    ),
  ];
  const textOrderIds = [
    ...new Set(cores.map((c) => String(c.order_id ?? "").trim()).filter((s) => s.length > 0)),
  ];
  const coreIds = cores.map((c) => c.id);

  /**
   * Board list: run independent lookups in parallel and skip mint/CTM/settlement work.
   * Sequential enrich + KOT mint was starving the pool and tripping the 18s route race.
   */
  let selfDeliveryEnabled = false;
  const customerById = new Map<number, CustomerRow>();
  let itemsByOrderTextId = new Map<string, MerchantFoodOrderItem[]>();
  let menuMetaByOrderTextId = new Map<
    string,
    Array<{ menu_item_id: number | null; item_image_url: string | null }>
  >();
  const otpByCoreId = new Map<number, { pickup: string | null; rto: string | null }>();
  const pickupTokenByCoreId = new Map<
    number,
    { token: string | null; kot_number: string | null }
  >();
  const storeOrdinalByCoreId = new Map<number, number>();
  const timelineSnapByCoreId = new Map<number, TimelineMilestoneSnapshot>();
  const customerStoreOrdersTotalById = new Map<number, number>();
  const customerPlatformOrdersTotalById = new Map<number, number>();
  let snapshotsByOrderText = new Map<string, ItemCommissionSnapshot[]>();
  const settlementGrossByCoreId = new Map<number, number>();
  let commissionPercent: number | undefined;
  let activeRiderByCoreId = new Map<number, ActiveRiderSnapshot>();

  const ingestTokenRows = (
    rows: Array<{ order_id: number; token: string | null; kot_number?: string | null }>
  ) => {
    for (const t of rows) {
      const cid = Number(t.order_id);
      if (!Number.isFinite(cid)) continue;
      pickupTokenByCoreId.set(cid, {
        token: t.token != null ? String(t.token) : null,
        kot_number: t.kot_number != null ? String(t.kot_number) : null,
      });
    }
  };

  const withTimeout = async <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => {
    try {
      return await Promise.race([
        p,
        new Promise<T>((resolve) => {
          setTimeout(() => resolve(fallback), ms);
        }),
      ]);
    } catch {
      return fallback;
    }
  };

  if (isBoardList) {
    /**
     * Board must stay under ~2s. Skip menu-meta + Nth-order COUNTs (those stall
     * the pool under partner-site + app polling). Enrich is best-effort with
     * hard caps so one slow table cannot trip the route deadline.
     */
    const [
      settingsRows,
      custs,
      otpRows,
      tokPack,
      riders,
    ] = await Promise.all([
      withTimeout(
        sql`SELECT self_delivery FROM merchant_store_settings WHERE store_id = ${storeId} LIMIT 1`.then(
          (r) => r as Array<{ self_delivery?: boolean }>
        ),
        800,
        [] as Array<{ self_delivery?: boolean }>
      ),
      customerIds.length > 0
        ? withTimeout(
            sql`
              SELECT id, full_name, primary_mobile
              FROM customers
              WHERE id IN ${sql(customerIds)}
            `.then((r) => r as unknown as Array<CustomerRow & { id: number | string | bigint }>),
            1_000,
            [] as Array<CustomerRow & { id: number | string | bigint }>
          )
        : Promise.resolve([] as Array<CustomerRow & { id: number | string | bigint }>),
      coreIds.length > 0
        ? withTimeout(
            sql`
              SELECT order_id, otp_code, otp_type
              FROM order_food_otps
              WHERE order_id IN ${sql(coreIds)}
            `.then(
              (r) =>
                r as unknown as Array<{ order_id: number; otp_code: string; otp_type: string }>
            ),
            800,
            [] as Array<{ order_id: number; otp_code: string; otp_type: string }>
          )
        : Promise.resolve([] as Array<{ order_id: number; otp_code: string; otp_type: string }>),
      coreIds.length > 0
        ? withTimeout(
            (async () => {
              try {
                return (await sql`
                  SELECT order_id, token, kot_number
                  FROM order_pickup_tokens
                  WHERE order_id IN ${sql(coreIds)}
                `) as unknown as Array<{
                  order_id: number;
                  token: string | null;
                  kot_number: string | null;
                }>;
              } catch {
                try {
                  return (await sql`
                    SELECT order_id, token
                    FROM order_pickup_tokens
                    WHERE order_id IN ${sql(coreIds)}
                  `) as unknown as Array<{
                    order_id: number;
                    token: string | null;
                    kot_number?: string | null;
                  }>;
                } catch {
                  return [] as Array<{
                    order_id: number;
                    token: string | null;
                    kot_number?: string | null;
                  }>;
                }
              }
            })(),
            800,
            [] as Array<{ order_id: number; token: string | null; kot_number?: string | null }>
          )
        : Promise.resolve(
            [] as Array<{ order_id: number; token: string | null; kot_number?: string | null }>
          ),
      coreIds.length > 0
        ? withTimeout(loadActiveRidersByCoreIds(sql, coreIds), 1_000, new Map())
        : Promise.resolve(new Map() as Map<number, ActiveRiderSnapshot>),
    ]);

    selfDeliveryEnabled = settingsRows[0]?.self_delivery === true;
    for (const c of custs) {
      const id = coerceCustomerId(c.id);
      if (id == null) continue;
      customerById.set(id, {
        full_name: c.full_name,
        primary_mobile: c.primary_mobile,
      });
    }
    for (const o of otpRows) {
      const cid = Number(o.order_id);
      const entry = otpByCoreId.get(cid) ?? { pickup: null, rto: null };
      const t = String(o.otp_type ?? "").toUpperCase();
      if (t === "RTO") entry.rto = String(o.otp_code);
      else if (t === "PICKUP") entry.pickup = String(o.otp_code);
      otpByCoreId.set(cid, entry);
    }
    ingestTokenRows(tokPack);
    activeRiderByCoreId = riders;
  } else {
    // ── Single-order detail: parallel lite enrich (no ordinal / KOT mint / hung COUNTs) ──
    const [
      settingsRows,
      custs,
      lineItems,
      otpRows,
      tokPack,
      riders,
      tlRows,
      snapMap,
    ] = await Promise.all([
      withTimeout(
        sql`SELECT self_delivery FROM merchant_store_settings WHERE store_id = ${storeId} LIMIT 1`.then(
          (r) => r as Array<{ self_delivery?: boolean }>
        ),
        1_000,
        [] as Array<{ self_delivery?: boolean }>
      ),
      customerIds.length > 0
        ? withTimeout(
            sql`
              SELECT id, full_name, primary_mobile
              FROM customers
              WHERE id IN ${sql(customerIds)}
            `.then((r) => r as unknown as Array<CustomerRow & { id: number | string | bigint }>),
            1_500,
            [] as Array<CustomerRow & { id: number | string | bigint }>
          )
        : Promise.resolve([] as Array<CustomerRow & { id: number | string | bigint }>),
      textOrderIds.length > 0
        ? withTimeout(loadMerchantOrderLineItemsByTextIds(sql, textOrderIds), 2_500, new Map())
        : Promise.resolve(new Map() as typeof itemsByOrderTextId),
      coreIds.length > 0
        ? withTimeout(
            sql`
              SELECT order_id, otp_code, otp_type
              FROM order_food_otps
              WHERE order_id IN ${sql(coreIds)}
            `.then(
              (r) =>
                r as unknown as Array<{ order_id: number; otp_code: string; otp_type: string }>
            ),
            1_000,
            [] as Array<{ order_id: number; otp_code: string; otp_type: string }>
          )
        : Promise.resolve([] as Array<{ order_id: number; otp_code: string; otp_type: string }>),
      coreIds.length > 0
        ? withTimeout(
            (async () => {
              try {
                return (await sql`
                  SELECT order_id, token, kot_number
                  FROM order_pickup_tokens
                  WHERE order_id IN ${sql(coreIds)}
                `) as unknown as Array<{
                  order_id: number;
                  token: string | null;
                  kot_number: string | null;
                }>;
              } catch {
                return [] as Array<{
                  order_id: number;
                  token: string | null;
                  kot_number?: string | null;
                }>;
              }
            })(),
            1_000,
            [] as Array<{ order_id: number; token: string | null; kot_number?: string | null }>
          )
        : Promise.resolve(
            [] as Array<{ order_id: number; token: string | null; kot_number?: string | null }>
          ),
      coreIds.length > 0
        ? withTimeout(loadActiveRidersByCoreIds(sql, coreIds), 1_500, new Map())
        : Promise.resolve(new Map() as Map<number, ActiveRiderSnapshot>),
      coreIds.length > 0
        ? withTimeout(
            sql`
              SELECT order_id, status, occurred_at
              FROM order_timelines
              WHERE order_id IN ${sql(coreIds)}
              ORDER BY occurred_at ASC, id ASC
            `.then(
              (r) =>
                r as unknown as Array<{
                  order_id: number;
                  status: string;
                  occurred_at: unknown;
                }>
            ),
            1_500,
            [] as Array<{ order_id: number; status: string; occurred_at: unknown }>
          )
        : Promise.resolve([] as Array<{ order_id: number; status: string; occurred_at: unknown }>),
      textOrderIds.length > 0
        ? withTimeout(loadSnapshotsByOrderTexts(sql, textOrderIds, storeId), 1_500, new Map())
        : Promise.resolve(new Map() as Map<string, ItemCommissionSnapshot[]>),
    ]);

    selfDeliveryEnabled = settingsRows[0]?.self_delivery === true;
    for (const c of custs) {
      const id = coerceCustomerId(c.id);
      if (id == null) continue;
      customerById.set(id, {
        full_name: c.full_name,
        primary_mobile: c.primary_mobile,
      });
    }
    itemsByOrderTextId = lineItems;
    for (const o of otpRows) {
      const cid = Number(o.order_id);
      const entry = otpByCoreId.get(cid) ?? { pickup: null, rto: null };
      const t = String(o.otp_type ?? "").toUpperCase();
      if (t === "RTO") entry.rto = String(o.otp_code);
      else if (t === "PICKUP") entry.pickup = String(o.otp_code);
      otpByCoreId.set(cid, entry);
    }
    ingestTokenRows(tokPack);
    activeRiderByCoreId = riders;
    for (const row of tlRows) {
      const cid = Number(row.order_id);
      if (!Number.isFinite(cid)) continue;
      let snap = timelineSnapByCoreId.get(cid);
      if (!snap) {
        snap = emptyTimelineSnapshot();
        timelineSnapByCoreId.set(cid, snap);
      }
      absorbTimelineRow(snap, String(row.status ?? ""), row.occurred_at);
    }
    snapshotsByOrderText = snapMap;

    try {
      commissionPercent = await withTimeout(
        resolveStoreCommission(storeId).then((c) => c.percent),
        800,
        undefined as unknown as number
      );
    } catch {
      commissionPercent = undefined;
    }
  }

  // Legacy ordinal / heavy detail blocks removed — board + detail use parallel paths above.

  const buildOpts = {
    storeId,
    commissionPercent,
    snapshotsByOrderText,
    selfDeliveryEnabled,
    customerById,
    storeOrdinalByCoreId,
    customerStoreOrdersTotalById,
    customerPlatformOrdersTotalById,
    timelineSnapByCoreId,
    itemsByOrderTextId,
    menuMetaByOrderTextId,
    otpByCoreId,
    activeRiderByCoreId,
    pickupTokenByCoreId,
    settlementGrossByCoreId,
    boardList: ordersFoodId == null,
  };

  type CancelCatalogRow = {
    order_id: number;
    reason_text: string | null;
    metadata: unknown;
    refund_reason: string | null;
    food_rejected_reason: string | null;
    food_cancelled_by_label: string | null;
    cancelled_by_type: string | null;
    cancellation_details: unknown;
    display_reason: string | null;
    ocr_cancelled_by_label: string | null;
    ocr_cancelled_by_type: string | null;
    attribute: string | null;
    rejection_label: string | null;
  };
  const cancelCatalogByCore = new Map<number, CancelCatalogRow>();
  /**
   * Board list: skip cancel-catalog entirely.
   * Detail: lite join only (no correlated order_refunds subquery — that stalled 10s+).
   */
  if (coreIds.length > 0 && ordersFoodId != null) {
    const rows = await withTimeout(
      (async () => {
        try {
          return await sql<CancelCatalogRow[]>`
            SELECT
              c.id AS order_id,
              f.rejected_reason AS food_rejected_reason,
              f.cancelled_by_label AS food_cancelled_by_label,
              COALESCE(f.cancelled_by_type, c.cancelled_by_type) AS cancelled_by_type,
              COALESCE(f.cancellation_details, c.cancellation_details) AS cancellation_details,
              ocr.reason_text,
              ocr.metadata,
              ocr.display_reason,
              ocr.cancelled_by_label AS ocr_cancelled_by_label,
              ocr.cancelled_by_type AS ocr_cancelled_by_type,
              ocr.attribute,
              ocr.rejection_label,
              NULL::text AS refund_reason
            FROM orders_core c
            LEFT JOIN orders_food f ON f.order_id = c.id
            LEFT JOIN LATERAL (
              SELECT
                reason_text,
                metadata,
                display_reason,
                cancelled_by_label,
                cancelled_by_type,
                attribute,
                rejection_label
              FROM order_cancellation_reasons
              WHERE id = c.cancellation_reason_id
                 OR (c.cancellation_reason_id IS NULL AND order_id = c.id)
              ORDER BY created_at DESC
              LIMIT 1
            ) ocr ON TRUE
            WHERE c.id IN ${sql(coreIds)}
          `;
        } catch {
          return [] as CancelCatalogRow[];
        }
      })(),
      1_500,
      [] as CancelCatalogRow[]
    );
    for (const row of rows) {
      cancelCatalogByCore.set(Number(row.order_id), row);
    }
  }


  const built = await Promise.all(
    cores.map(async (core) => {
      try {
        const food = matchFoodToCore(core, byCorePk, byTextId);
        const dto = await buildOrderDto(core, food, buildOpts);
        const catalog = cancelCatalogByCore.get(core.id);
        const isCancelledOrder =
          dto.order_status === "CANCELLED" || dto.order_status === "REJECTED";
        if (!isCancelledOrder) return dto;

        const meta =
          catalog?.metadata && typeof catalog.metadata === "object" && !Array.isArray(catalog.metadata)
            ? (catalog.metadata as Record<string, unknown>)
            : null;
        const resolved = resolveMerchantCancellationFields({
          rejected_reason: catalog?.food_rejected_reason ?? dto.rejected_reason,
          cancelled_by_label: catalog?.food_cancelled_by_label ?? dto.cancelled_by_label,
          cancelled_by_type: catalog?.cancelled_by_type ?? dto.cancelled_by_type,
          cancellation_details: catalog?.cancellation_details,
          catalog_attribute:
            catalog?.attribute ??
            (meta && typeof meta.attribute === "string" ? meta.attribute : null),
          catalog_rejection:
            catalog?.rejection_label ??
            (meta && typeof meta.rejection === "string" ? meta.rejection : null),
          reason_text: catalog?.reason_text,
          refund_reason: catalog?.refund_reason,
          ocr_display_reason: catalog?.display_reason,
          ocr_cancelled_by_label: catalog?.ocr_cancelled_by_label,
          ocr_cancelled_by_type: catalog?.ocr_cancelled_by_type,
        });

        const netOrderValue =
          num(dto.pricing?.total) > 0
            ? num(dto.pricing.total)
            : num(dto.food_items_total_value) > 0
              ? num(dto.food_items_total_value)
              : num(dto.grand_total);

        let cancellation_compensation: MerchantCancellationCompensationDisplay | null = null;
        /** Detail only — compensation engine is too heavy for the board list; hard-cap wait. */
        if (ordersFoodId != null) {
          cancellation_compensation = await withTimeout(
            resolveOrderCancellationCompensationDisplay(sql, {
              orderCoreId: core.id,
              merchantStoreId: storeId,
              cancelledByType: resolved.cancelled_by_type,
              cancelledByLabel: resolved.cancelled_by_label,
              rejectedReason: resolved.rejected_reason,
              orderCreatedAt: dto.created_at,
              cancelledAt: dto.cancelled_at,
              preparedAt: dto.prepared_at,
              riderPickedUpAt: dto.rider_picked_up_at,
              netOrderValue,
            }).catch(() => null),
            1_200,
            null
          );
        }

        return {
          ...dto,
          rejected_reason: resolved.rejected_reason,
          cancelled_by_label: resolved.cancelled_by_label,
          cancelled_by_type: resolved.cancelled_by_type,
          cancellation_compensation,
        };
      } catch {
        /* One bad row must never blank the whole merchant order board / incoming sheet. */
        return null;
      }
    })
  );
  return built.filter((o): o is MerchantFoodOrderDto => o != null);
}

function normalizeOrderStatusForTransition(raw: string | null | undefined): string {
  let s = String(raw || "CREATED").toUpperCase().replace("NEW", "CREATED");
  if (s === "PLACED" || s === "ORDER_RECEIVED" || s === "ORDER_PLACED") s = "CREATED";
  return s;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["ACCEPTED", "CANCELLED"],
  NEW: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "READY_FOR_PICKUP", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED", "RTO"],
  READY_FOR_PICKUP: ["OUT_FOR_DELIVERY", "CANCELLED", "RTO"],
  OUT_FOR_DELIVERY: ["DELIVERED", "RTO"],
  DELIVERED: [],
  CANCELLED: [],
  RTO: [],
};

async function resolveCoreIdForFood(
  sql: Sql,
  food: { id: number; order_id: number | null; core_order_id: string | null }
): Promise<number | null> {
  if (food.order_id != null && Number.isFinite(Number(food.order_id))) {
    return Number(food.order_id);
  }
  const textId = String(food.core_order_id ?? "").trim();
  if (!textId) return null;
  const rows = await sql`SELECT id FROM orders_core WHERE order_id = ${textId} LIMIT 1`;
  const row = rows[0] as { id?: number } | undefined;
  return row?.id != null ? Number(row.id) : null;
}

export async function patchMerchantFoodOrderStatus(
  sql: Sql,
  storeId: number,
  ordersFoodId: number,
  newStatus: string,
  rejectedReason?: string | null,
  opts?: {
    actionSource?: MerchantOrderActionSource;
    actionMode?: MerchantOrderActionMode;
    preparationTimeMinutes?: number | null;
  }
): Promise<MerchantFoodOrderDto> {
  const status = String(newStatus || "").toUpperCase();
  if (!status) throw new Error("status_required");

  const existingRows = await sql`
    SELECT id, order_id, core_order_id, order_status, merchant_store_id, food_items_total_value, rider_picked_up_at
    FROM orders_food
    WHERE id = ${ordersFoodId}
    LIMIT 1
  `;
  const existing = existingRows[0] as
    | {
        id: number;
        order_id: number | null;
        core_order_id: string | null;
        order_status: string | null;
        merchant_store_id: number;
        food_items_total_value: unknown;
        rider_picked_up_at: string | null;
      }
    | undefined;
  if (!existing) throw new Error("order_not_found");
  if (Number(existing.merchant_store_id) !== storeId) throw new Error("store_mismatch");

  const corePk = await resolveCoreIdForFood(sql, existing);
  if (corePk == null) throw new Error("core_order_not_found");

  let currentStatus = normalizeOrderStatusForTransition(existing.order_status);
  const coreRows = await sql`
    SELECT status, current_status FROM orders_core WHERE id = ${corePk} LIMIT 1
  `;
  const core = coreRows[0] as { status?: string; current_status?: string | null } | undefined;
  if (core) {
    currentStatus = normalizeOrderStatusForTransition(
      resolvePartnerPipeline(
        existing.order_status,
        core.status ?? "assigned",
        core.current_status ?? null,
        toIsoOrNull(existing.rider_picked_up_at)
      )
    );
  }

  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(status)) {
    throw new Error(`invalid_transition:${currentStatus}:${status}`);
  }

  const now = new Date().toISOString();
  const actionSource = normalizeActionSource(opts?.actionSource ?? "app");
  const actionMode = normalizeActionMode(opts?.actionMode);
  const actionLabels = labelsForStatusUpdate({
    newStatus: status,
    actionSource,
    actionMode,
    rejectedReason,
  });

  /** Populated on CANCELLED for context-aware customer cancel notifications. */
  let cancelNotifyRefund: {
    refundEligible: boolean;
    refundStatus: string | null;
    refundAmount: number | null;
  } | null = null;

  if (status === "ACCEPTED") {
    const storeRows = await sql<{
      avg_preparation_time_minutes: number | null;
      preparation_buffer_minutes: number | null;
    }[]>`
      SELECT ms.avg_preparation_time_minutes, COALESCE(ss.preparation_buffer_minutes, 0) AS preparation_buffer_minutes
      FROM merchant_stores ms
      LEFT JOIN merchant_store_settings ss ON ss.store_id = ms.id
      WHERE ms.id = ${storeId}
      LIMIT 1
    `;
    const { resolveAcceptPrepCommitment } = await import("../../lib/order-prep-time.js");
    const storeRow = storeRows[0];
    const storeDefaultWithBuffer = resolveStorePrepWithBuffer(
      storeRow?.avg_preparation_time_minutes,
      storeRow?.preparation_buffer_minutes
    );
    const prep = resolveAcceptPrepCommitment({
      acceptedAtIso: now,
      storeDefaultMinutes: storeDefaultWithBuffer,
      bodyPrepMinutes: opts?.preparationTimeMinutes,
    });

    const acceptRows = await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz, accepted_at = ${now}::timestamptz,
          accepted_by_label = ${actionLabels.accepted_by_label ?? null},
          preparation_time_minutes = ${prep.prepMinutes},
          prep_ready_by_at = ${prep.prepReadyByAt}::timestamptz,
          expected_ready_at = ${prep.prepReadyByAt}::timestamptz,
          prep_time_source = ${prep.prepTimeSource}
      WHERE id = ${ordersFoodId}
        AND merchant_store_id = ${storeId}
        AND UPPER(REPLACE(COALESCE(order_status, 'CREATED'), 'NEW', 'CREATED')) IN (
          'CREATED', 'PLACED', 'ORDER_RECEIVED', 'ORDER_PLACED'
        )
      RETURNING id
    `;
    if (!Array.isArray(acceptRows) || acceptRows.length === 0) {
      // Another device already accepted/moved this order — prevent duplicate accept.
      throw new Error(`invalid_transition:${currentStatus}:${status}`);
    }
    try {
      await sql`
        UPDATE orders_core
        SET
          prep_ready_by_at = ${prep.prepReadyByAt}::timestamptz,
          prep_time_minutes = ${prep.prepMinutes},
          expected_ready_at = ${prep.prepReadyByAt}::timestamptz,
          current_status = 'ACCEPTED',
          updated_at = ${now}::timestamptz
        WHERE id = ${corePk}
      `;
    } catch {
      /* non-fatal */
    }
    try {
      await recordAcceptanceTimeline(sql, {
        orderCorePk: corePk,
        previousStatus: currentStatus,
        actionSource,
        acceptMode: actionMode,
        acceptedByLabel: actionLabels.accepted_by_label ?? null,
      });
    } catch {
      /* non-fatal */
    }
    try {
      const preview = await loadMerchantFoodOrders(sql, storeId, { ordersFoodId, limit: 1 });
      const ctmOrder = preview[0];
      const ctm =
        num(ctmOrder?.pricing?.total) > 0
          ? num(ctmOrder?.pricing?.total)
          : num(existing.food_items_total_value);
      if (ctm > 0) {
        await sql`
          UPDATE orders_food
          SET food_items_total_value = ${ctm}, updated_at = ${now}::timestamptz
          WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
        `;
      }
    } catch {
      /* non-fatal */
    }
    try {
      const flow = await fetchFoodRiderAcceptFlow();
      if (flow === "after_merchant_accept") {
        void maybeStartOrderDispatch(corePk);
      }
    } catch {
      /* non-fatal */
    }
    try {
      const idRows = await sql<{ order_id: string | null }[]>`
        SELECT order_id FROM orders_core WHERE id = ${corePk} LIMIT 1
      `;
      const orderIdText = idRows[0]?.order_id?.trim();
      if (orderIdText) {
        void import("../eta/eta.live-engine.js")
          .then(({ runLiveEtaForOrder }) => runLiveEtaForOrder(orderIdText, "STATUS_CHANGE"))
          .catch(() => undefined);
      }
    } catch {
      /* non-fatal */
    }
  } else if (status === "PREPARING") {
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz, preparing_at = ${now}::timestamptz, prepared_at = NULL
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
  } else if (status === "READY_FOR_PICKUP") {
    const prepRows = await sql<{ prep_ready_by_at: string | null }[]>`
      SELECT prep_ready_by_at FROM orders_food WHERE id = ${ordersFoodId} LIMIT 1
    `;
    const prepReadyByAt = prepRows[0]?.prep_ready_by_at ?? null;
    const lateMins = computePreparedLateMinutes(now, prepReadyByAt);
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz,
          preparing_at = COALESCE(preparing_at, ${now}::timestamptz),
          prepared_at = ${now}::timestamptz,
          prepared_late_minutes = ${lateMins}
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
    try {
      await sql`
        UPDATE orders_core
        SET prepared_late_minutes = ${lateMins}, updated_at = ${now}::timestamptz
        WHERE id = ${corePk}
      `;
    } catch {
      /* non-fatal */
    }
    try {
      await recordReadyTimeline(sql, {
        orderCorePk: corePk,
        previousStatus: currentStatus,
        preparedAt: now,
        actionSource,
      });
    } catch {
      /* non-fatal */
    }
    try {
      const riderRows = await sql<
        { rider_id: number | null; current_status: string | null }[]
      >`
        SELECT rider_id, current_status
        FROM orders_core
        WHERE id = ${corePk}
        LIMIT 1
      `;
      const assignedRiderId = Number(riderRows[0]?.rider_id ?? 0);
      const coreCurrent = String(riderRows[0]?.current_status ?? "").trim().toUpperCase();
      if (assignedRiderId > 0 && coreCurrent === "RIDER_ASSIGNED") {
        await sql`
          UPDATE orders_core
          SET current_status = 'OUT_FOR_DELIVERY', updated_at = ${now}::timestamptz
          WHERE id = ${corePk} AND rider_id = ${assignedRiderId}
        `;
        await sql`
          UPDATE orders_food
          SET
            order_status = 'OUT_FOR_DELIVERY',
            dispatched_at = ${now}::timestamptz,
            updated_at = ${now}::timestamptz
          WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
        `;
      }
    } catch {
      /* non-fatal â€” rider may still dispatch via pool after ready */
    }
    void maybeStartOrderDispatch(corePk);

    try {
      const idRows = await sql<{ order_id: string | null; prep_time_minutes: number | null; preparing_at: string | null }[]>`
        SELECT oc.order_id, oc.prep_time_minutes, of.preparing_at::text
        FROM orders_core oc
        JOIN orders_food of ON of.order_id = oc.id
        WHERE oc.id = ${corePk}
        LIMIT 1
      `;
      const orderIdText = idRows[0]?.order_id?.trim();
      if (orderIdText) {
        void import("../eta/eta.live-engine.js")
          .then(({ runLiveEtaForOrder }) => runLiveEtaForOrder(orderIdText, "STATUS_CHANGE"))
          .catch(() => undefined);

        const expectedPrep = Number(idRows[0]?.prep_time_minutes) || 15;
        const preparingAt = idRows[0]?.preparing_at ? new Date(idRows[0].preparing_at) : null;
        const actualPrep =
          preparingAt && Number.isFinite(preparingAt.getTime())
            ? Math.max(1, Math.round((new Date(now).getTime() - preparingAt.getTime()) / 60_000))
            : expectedPrep;

        void import("../eta/eta.merchant-prep-stats.js")
          .then(({ recordMerchantPrepCompletion }) =>
            recordMerchantPrepCompletion({
              merchantStoreId: storeId,
              expectedPrepMinutes: expectedPrep,
              actualPrepMinutes: actualPrep,
              wasLate: (lateMins ?? 0) > 0,
              lateMinutes: lateMins ?? 0,
            })
          )
          .catch(() => undefined);
      }
    } catch {
      /* non-fatal */
    }
  } else if (status === "OUT_FOR_DELIVERY") {
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz, dispatched_at = ${now}::timestamptz
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
  } else if (status === "DELIVERED") {
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz, delivered_at = ${now}::timestamptz
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
    try {
      const orderText = String(existing.core_order_id ?? "").trim();
      if (orderText) {
        await recordRiderAssignmentDeliveredIfActive({
          orderCorePk: corePk,
          orderIdText: orderText,
          occurredAt: new Date(now),
          statusMessage: "Order delivered",
        });
      }
    } catch {
      /* non-fatal */
    }
  } else if (status === "CANCELLED") {
    const cancelLabel = actionLabels.cancelled_by_label ?? null;
    // Optimistic concurrency: only cancel if status is still the expected previous state.
    // Prevents double-accept/reject races across devices.
    const cancelRows = rejectedReason
      ? await sql`
          UPDATE orders_food
          SET order_status = ${status}, updated_at = ${now}::timestamptz, cancelled_at = ${now}::timestamptz,
              rejected_reason = ${rejectedReason}, cancelled_by_label = ${cancelLabel}
          WHERE id = ${ordersFoodId}
            AND merchant_store_id = ${storeId}
            AND UPPER(REPLACE(COALESCE(order_status, 'CREATED'), 'NEW', 'CREATED')) = ${currentStatus}
          RETURNING id
        `
      : await sql`
          UPDATE orders_food
          SET order_status = ${status}, updated_at = ${now}::timestamptz, cancelled_at = ${now}::timestamptz,
              cancelled_by_label = ${cancelLabel}
          WHERE id = ${ordersFoodId}
            AND merchant_store_id = ${storeId}
            AND UPPER(REPLACE(COALESCE(order_status, 'CREATED'), 'NEW', 'CREATED')) = ${currentStatus}
          RETURNING id
        `;
    if (!Array.isArray(cancelRows) || cancelRows.length === 0) {
      throw new Error(`invalid_transition:${currentStatus}:${status}`);
    }
    try {
      await recordCancellationTimeline(sql, {
        orderCorePk: corePk,
        previousStatus: currentStatus,
        rejectedReason: rejectedReason ?? null,
        actorType: actionSource === "admin" ? "admin" : actionSource === "system" ? "system" : "store",
        cancelMode: actionMode,
      });
    } catch {
      /* non-fatal */
    }
    const displayReason = (rejectedReason ?? "").trim() || "Order cancelled";
    const coreMoney = await sql`
      SELECT grand_total, accepted_at FROM orders_core WHERE id = ${corePk} LIMIT 1
    `;
    const coreRow = coreMoney[0] as { grand_total?: unknown; accepted_at?: string | null } | undefined;
    const cancelledByType =
      actionSource === "admin" ? "admin" : actionSource === "system" ? "system" : "store";
    const orderCtx = await lookupOrderContext(corePk, sql);
    const engineResult = await executeOrderCancellationFinancials({
      orderCoreId: corePk,
      ordersFoodId,
      coreOrderId: orderCtx.coreOrderId,
      merchantStoreId: storeId,
      previousStatus: currentStatus,
      cancelledByType,
      orderGross: num(coreRow?.grand_total ?? existing.food_items_total_value ?? orderCtx.grandTotal),
      serviceType: orderCtx.serviceType,
      cancellationReasonId: null,
    });
    const refund = refundFieldsFromEngineResult(engineResult.raw);
    try {
      await recordOrderCancellation(sql, {
        orderCorePk: corePk,
        cancelledBy: "merchant",
        reasonText: displayReason,
        displayReason,
        cancelledByType,
        cancelledByLabel: cancelLabel ?? actionLabels.cancelled_by_label ?? "Cancelled",
        actionSource,
        cancelMode: actionMode,
        previousStatus: currentStatus,
        acceptedAt: coreRow?.accepted_at ?? null,
        grandTotal: coreRow?.grand_total ?? 0,
        refundStatus: refund.refundStatus,
        refundAmount: refund.refundAmount,
        metadata: engineResult.raw ? { financial_rule_engine: engineResult.raw } : undefined,
      });
    } catch {
      /* non-fatal */
    }
    // Auto-refund the customer when the MERCHANT (store) or the SYSTEM cancelled
    // — the customer paid and didn't get the order, so their money goes back.
    // Agent/admin uses the dashboard refund flow. Customer cancel refunds only
    // pre-accept (full) inside food.order-cancel.service.ts via autoRefundOnCancellation.
    // Amount uses the rule engine's computed refund, falling back to 100% of what was paid.
    // Best-effort: leaves a retriable order_refunds row on failure.
    if (cancelledByType === "store" || cancelledByType === "system") {
      try {
        const engineAmount = Number(refund.refundAmount);
        await autoRefundOnCancellation(
          {
            orderCoreId: corePk,
            reason: displayReason || "Order cancelled by merchant",
            actorRole: cancelledByType,
            amount: Number.isFinite(engineAmount) && engineAmount > 0 ? engineAmount : null,
          },
          sql
        );
      } catch {
        /* non-fatal — refund can be retried via /v1/internal/orders/:id/refund/execute */
      }
    }
    // Store/system cancel always auto-refunds paid amount; admin follows engine result.
    const engineAmt = Number(refund.refundAmount);
    cancelNotifyRefund = {
      refundEligible:
        cancelledByType === "store" ||
        cancelledByType === "system" ||
        (Number.isFinite(engineAmt) && engineAmt > 0.005 && refund.refundStatus !== "no_refund"),
      refundStatus: refund.refundStatus,
      refundAmount:
        Number.isFinite(engineAmt) && engineAmt > 0.005
          ? engineAmt
          : cancelledByType === "store" || cancelledByType === "system"
            ? num(coreRow?.grand_total ?? orderCtx.grandTotal)
            : null,
    };
    if (!engineResult.applied) {
      try {
        await applyPaymentCancellationPayment({
          orderCoreId: corePk,
          ordersFoodId,
          merchantStoreId: storeId,
          previousStatus: currentStatus,
          cancelledByType,
          orderGross: num(coreRow?.grand_total ?? existing.food_items_total_value),
          coreOrderId: orderCtx.coreOrderId,
          serviceType: orderCtx.serviceType,
        });
      } catch {
        /* non-fatal */
      }
    }
  } else if (status === "RTO") {
    try {
      await sql`SELECT convert_food_order_otp_to_rto(${corePk})`;
    } catch {
      /* optional RPC */
    }
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz, is_rto = true, rto_at = ${now}::timestamptz
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
    try {
      const orderCtx = await lookupOrderContext(corePk, sql);
      await executeRtoFinancials({
        orderCoreId: corePk,
        ordersFoodId,
        coreOrderId: orderCtx.coreOrderId,
        merchantStoreId: storeId,
        previousStatus: currentStatus,
        triggeredByType: actionSource === "admin" ? "admin" : "merchant",
        orderGross: num(orderCtx.grandTotal),
        cancellationReasonId: null,
      }, sql);
    } catch {
      /* non-fatal */
    }
  } else {
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
  }

  try {
    await sql`
      UPDATE orders_core SET current_status = ${status}, updated_at = ${now}::timestamptz
      WHERE id = ${corePk}
    `;
  } catch {
    /* non-fatal */
  }

  try {
    const meta = JSON.stringify({
      ...(rejectedReason ? { rejected_reason: rejectedReason } : {}),
      ...(status === "ACCEPTED" ? { accept_mode: actionMode } : {}),
      ...(status === "CANCELLED" ? { cancel_mode: actionMode } : {}),
    });
    await sql`
      INSERT INTO merchant_order_food_actions (
        orders_food_id, orders_core_id, merchant_store_id,
        from_status, to_status, action_source, actor_type, actor_label, metadata
      ) VALUES (
        ${ordersFoodId}, ${corePk}, ${storeId},
        ${currentStatus}, ${status}, ${actionSource}, ${"merchant"}, ${actionLabels.actor_label},
        ${meta}::text::jsonb
      )
    `;
  } catch {
    /* non-fatal */
  }

  const loaded = await loadMerchantFoodOrders(sql, storeId, { ordersFoodId, limit: 1 });
  const order = loaded[0];
  if (!order) throw new Error("order_not_found_after_update");

  // Merchant CTM snapshot (net of merchant-funded offers) is the source of truth â€”
  // order_settlement_breakdown.merchant_gross is written from it at placement time.
  const settlementRows = await sql`
    SELECT merchant_gross FROM order_settlement_breakdown WHERE order_id = ${corePk} LIMIT 1
  `;
  const fromCtm = num((settlementRows[0] as { merchant_gross?: unknown } | undefined)?.merchant_gross);
  const merchantGross =
    fromCtm > 0
      ? fromCtm
      : num(order.pricing?.total) > 0
        ? num(order.pricing?.total)
        : num(existing.food_items_total_value);

  await creditMerchantOrderEarningOnDelivered({
    merchantStoreId: storeId,
    ordersFoodId,
    ordersCoreId: corePk,
    amount: merchantGross,
    newStatus: status,
    previousStatus: currentStatus,
  });

  if (status === "CANCELLED") {
    const cancelledByType =
      actionSource === "admin" ? "admin" : actionSource === "system" ? "system" : "store";
    const cancelledByLabel = actionLabels.cancelled_by_label ?? null;
    try {
      await applyMerchantOrderCancellationLedger(
        {
          orderCoreId: corePk,
          source: actionSource === "admin" ? "admin_cancel" : "merchant_cancel",
          cancelledByType,
          cancelledByLabel,
        },
        sql
      );
    } catch (ledgerErr) {
      console.warn("[patchMerchantFoodOrderStatus] cancellation ledger failed:", ledgerErr);
    }
  }

  if (shouldClearOrderNotifications(status)) {
    try {
      await clearMerchantStoreOrderNotifications(sql, {
        merchantStoreId: storeId,
        ordersFoodId,
        orderCoreId: corePk,
        formattedOrderId:
          (order as { formatted_order_id?: string | null }).formatted_order_id ??
          existing.core_order_id ??
          null,
      });
    } catch {
      /* non-fatal */
    }
  }

  // Emit domain event so notifications module can send status pushes to
  // customer / merchant / rider without this file knowing anything about
  // the notification pipeline.
  try {
    const orderIdText = existing.core_order_id ?? String(existing.order_id ?? "");
    const ownerRows = (await sql`
      SELECT c.customer_id AS customer_user_id, s.user_id AS merchant_user_id, s.store_display_name AS store_name
      FROM public.orders_core oc
      LEFT JOIN public.customers c ON c.id = oc.customer_id
      LEFT JOIN public.merchant_stores s ON s.id = ${storeId}
      WHERE oc.id = ${corePk}
      LIMIT 1
    `) as unknown as Array<{ customer_user_id: string | null; merchant_user_id: string | null; store_name: string | null }>;
    const owner = ownerRows[0];
    emitEvent("order.status_changed", {
      orderId: orderIdText,
      orderShortId: order.formatted_order_id ?? orderIdText,
      fromStatus: currentStatus,
      toStatus: status,
      customerId: owner?.customer_user_id ?? null,
      merchantUserId: owner?.merchant_user_id ?? null,
      merchantStoreId: storeId,
      merchantName: owner?.store_name ?? null,
      reason: rejectedReason ?? undefined,
      ...(status === "CANCELLED" && cancelNotifyRefund
        ? {
            refundEligible: cancelNotifyRefund.refundEligible,
            refundStatus: cancelNotifyRefund.refundStatus,
            refundAmount: cancelNotifyRefund.refundAmount,
          }
        : {}),
    });
    try {
      const { publishOrderEvent } = await import("../realtime/publish.js");
      const channels = [orderIdText, order.formatted_order_id].filter(
        (v): v is string => Boolean(String(v ?? "").trim())
      );
      await Promise.all(
        [...new Set(channels)].map((id) =>
          publishOrderEvent(String(id).trim(), {
            type: "status_changed",
            status: String(status).toUpperCase(),
            orderId: String(id).trim(),
            orderIdText: String(id).trim(),
            source: "merchant",
          })
        )
      );
    } catch {
      /* tolerated */
    }
  } catch { /* tolerated */ }

  return order;
}

export type MerchantOrderTimelineEntry = {
  id: number;
  status: string;
  previous_status: string | null;
  status_message: string | null;
  actor_type: string | null;
  occurred_at: string;
  expected_by_at: string | null;
  metadata: Record<string, unknown> | null;
};

/** Timeline rows from order_timelines for a store food order. */
export async function loadMerchantFoodOrderTimeline(
  sql: Sql,
  storeId: number,
  ordersFoodId: number
): Promise<MerchantOrderTimelineEntry[]> {
  const ownerRows = await sql`
    SELECT order_id, core_order_id
    FROM orders_food
    WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    LIMIT 1
  `;
  const owner = ownerRows[0] as { order_id?: number | null; core_order_id?: string | null } | undefined;
  let coreId = Number(owner?.order_id);
  if (!Number.isFinite(coreId) || coreId < 1) {
    const textId = String(owner?.core_order_id ?? "").trim();
    if (textId) {
      const coreRows = await sql`
        SELECT id FROM orders_core WHERE order_id = ${textId} LIMIT 1
      `;
      coreId = Number((coreRows[0] as { id?: number } | undefined)?.id);
    }
  }
  if (!Number.isFinite(coreId) || coreId < 1) return [];

  const rows = await sql`
    SELECT
      id,
      status,
      previous_status,
      status_message,
      actor_type,
      occurred_at,
      expected_by_at,
      metadata
    FROM order_timelines
    WHERE order_id = ${coreId}
    ORDER BY occurred_at ASC, id ASC
  `;
  return rows as unknown as MerchantOrderTimelineEntry[];
}
