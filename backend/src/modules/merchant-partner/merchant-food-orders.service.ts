import type { Sql } from "postgres";
import { merchantFundedDiscountFromBilling } from "../../lib/merchant-billing-discount.js";
import {
  applyMerchantBaseToOrderItems,
  loadSnapshotsByOrderTexts,
  merchantOrderTotalFromBilling,
  scaleMerchantOrderItemBreakdown,
  type ItemCommissionSnapshot,
} from "../../lib/merchant-visible-pricing.js";
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { resolvePartnerPipeline } from "../../lib/partner-orders-unify.js";
import {
  labelsForStatusUpdate,
  normalizeActionMode,
  normalizeActionSource,
  type MerchantOrderActionMode,
  type MerchantOrderActionSource,
} from "../../lib/merchant-order-food-action-labels.js";
import { recordAcceptanceTimeline } from "../../lib/order-acceptance-timeline.js";
import { recordCancellationTimeline } from "../../lib/order-cancellation-timeline.js";
import { recordReadyTimeline } from "../../lib/order-food-status-timeline.js";
import { loadMerchantOrderLineItemsByTextIds } from "../../lib/load-merchant-order-line-items.js";

export type MerchantFoodOrderItem = {
  qty: number;
  name: string;
  price: number;
  menu_item_id?: number | null;
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
  order_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  delivery_type: string;
  rider_id: number | null;
  grand_total: number;
  pricing: MerchantOrderPricing;
  /** Full checkout breakdown (orders_core.billing_snapshot). */
  billing_snapshot: Record<string, unknown> | null;
  payment_status: string | null;
  items: MerchantFoodOrderItem[];
  pickup_otp: string | null;
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

/** Postgres bigint/numeric often arrives as string — normalize for Map keys and IN lists. */
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
          return q > 1 ? `${n} ×${q}` : n;
        })
        .filter(Boolean);
    }
    const custText = r.customization ?? r.customisation;
    if ((!customizations || customizations.length === 0) && custText != null) {
      const t = String(custText).trim();
      if (t) customizations = t.split(/[,;|•]+/).map((s) => s.trim()).filter(Boolean);
    }
    out.push({
      qty,
      name,
      price,
      veg_nonveg,
      customizations: customizations?.length ? customizations : undefined,
      has_customizations: (customizations?.length ?? 0) > 0,
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

function parseMerchantBillingBreakdown(
  core: {
    item_total: unknown;
    addon_total?: unknown;
    grand_total: unknown;
    billing_snapshot?: unknown;
  },
  foodTotal: number
): MerchantOrderPricing {
  const snap =
    core.billing_snapshot && typeof core.billing_snapshot === "object"
      ? (core.billing_snapshot as Record<string, unknown>)
      : null;

  const itemTotal = num(snap?.item_total ?? core.item_total);
  const addonTotal = num(snap?.addon_total ?? core.addon_total);
  const subtotal = itemTotal + addonTotal;
  const packaging = num(snap?.packaging_fee ?? 0);
  const taxes = num(snap?.tax_total ?? 0);
  const discount = merchantFundedDiscountFromBilling(snap);
  const total =
    foodTotal > 0
      ? foodTotal
      : Math.max(0, subtotal + packaging + taxes - discount);

  return { subtotal, packaging, taxes, discount, total };
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

/** orders_core.customer_id → customers (join + map); then orders_food.customer_name. */
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
        oc.is_bulk_order
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

  return sql<CoreRow[]>`
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
      oc.merchant_instructions_list
    FROM orders_core oc
    LEFT JOIN customers cust ON cust.id = oc.customer_id
    WHERE oc.merchant_store_id = ${storeId}
    ORDER BY oc.created_at DESC
    LIMIT ${limit}
  `;
}

async function loadFoodRowsForCores(sql: Sql, storeId: number, cores: CoreRow[]): Promise<FoodRow[]> {
  if (cores.length === 0) return [];

  const corePks = cores.map((c) => c.id).filter((n) => Number.isFinite(n));
  const textIds = [
    ...new Set(cores.map((c) => String(c.order_id ?? "").trim()).filter((s) => s.length > 0)),
  ];

  if (corePks.length === 0 && textIds.length === 0) return [];

  let rows: FoodRow[];
  if (corePks.length > 0 && textIds.length > 0) {
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
        of.merchant_instructions_list
      FROM orders_food of
      WHERE of.merchant_store_id = ${storeId}
        AND (of.order_id IN ${sql(corePks)} OR of.core_order_id IN ${sql(textIds)})
    `;
  } else if (corePks.length > 0) {
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
        of.merchant_instructions_list
      FROM orders_food of
      WHERE of.merchant_store_id = ${storeId}
        AND of.order_id IN ${sql(corePks)}
    `;
  } else {
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
        of.merchant_instructions_list
      FROM orders_food of
      WHERE of.merchant_store_id = ${storeId}
        AND of.core_order_id IN ${sql(textIds)}
    `;
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
    otpByCoreId: Map<number, { pickup: string | null; rto: string | null }>;
  }
): Promise<MerchantFoodOrderDto> {
  const pipeline = resolvePartnerPipeline(
    food?.order_status ?? null,
    core.status,
    core.current_status
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

  const snaps = textOid ? opts.snapshotsByOrderText.get(textOid) ?? [] : [];
  const itemsBeforeBase = items.map((it) => ({ ...it }));
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

  const billingSnap =
    core.billing_snapshot && typeof core.billing_snapshot === "object"
      ? (core.billing_snapshot as Record<string, unknown>)
      : null;
  const packaging = num(billingSnap?.packaging_fee ?? 0);
  const merchantDiscount = merchantFundedDiscountFromBilling(billingSnap);
  const itemsSubtotal = round2(items.reduce((s, it) => s + num(it.price), 0));
  const merchantTotal = merchantOrderTotalFromBilling(
    itemsSubtotal > 0.005 ? itemsSubtotal : merchantSubtotal,
    billingSnap,
    packaging
  );
  const pricing: MerchantOrderPricing = {
    subtotal: itemsSubtotal > 0.005 ? itemsSubtotal : merchantSubtotal,
    packaging,
    taxes: 0,
    discount: merchantDiscount,
    total: merchantTotal,
  };

  const otps = opts.otpByCoreId.get(core.id);
  const coreOnly = food == null;
  const tl = opts.timelineSnapByCoreId?.get(core.id);
  const scheduledMeta = resolveScheduledMeta(core);

  return {
    orders_food_id: food != null ? Number(food.id) : core.id,
    orders_core_id: core.id,
    core_only: coreOnly,
    formatted_order_id: resolveFormattedOrderId(core, food),
    order_status: pipeline,
    customer_name: resolveCustomerName(core, food, cust),
    customer_phone:
      food?.customer_phone ?? cust?.primary_mobile ?? core.customer_primary_mobile ?? null,
    customer_email: food?.customer_email ?? null,
    created_at: new Date(core.created_at).toISOString(),
    delivery_type: mapDeliveryType(core.delivery_type, core.rider_id, opts.selfDeliveryEnabled),
    rider_id: core.rider_id,
    grand_total: merchantTotal,
    pricing,
    billing_snapshot: billingSnap,
    payment_status: core.payment_status ?? null,
    items,
    pickup_otp: food?.pickup_otp ?? otps?.pickup ?? null,
    rto_otp: food?.rto_otp ?? otps?.rto ?? null,
    payment_method: core.payment_method,
    accepted_at: toIsoOrNull(food?.accepted_at) ?? tl?.accepted_at ?? null,
    preparing_at: toIsoOrNull(food?.preparing_at) ?? tl?.preparing_at ?? null,
    prepared_at: toIsoOrNull(food?.prepared_at) ?? tl?.prepared_at ?? null,
    handed_over_to_rider_at:
      toIsoOrNull(food?.handed_over_to_rider_at) ?? tl?.handed_over_to_rider_at ?? null,
    rider_picked_up_at: toIsoOrNull(food?.rider_picked_up_at) ?? tl?.rider_picked_up_at ?? null,
    dispatched_at: toIsoOrNull(food?.dispatched_at) ?? tl?.dispatched_at ?? null,
    delivered_at: toIsoOrNull(food?.delivered_at) ?? tl?.delivered_at ?? null,
    cancelled_at: resolveCancelledAt(food, core) ?? tl?.cancelled_at ?? null,
    rejected_reason: food?.rejected_reason ?? null,
    accepted_by_label: food?.accepted_by_label ?? null,
    cancelled_by_label: food?.cancelled_by_label ?? null,
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
  };
}

export async function loadMerchantFoodOrderRidersLog(
  sql: Sql,
  storeId: number,
  ordersFoodId: number
): Promise<MerchantFoodOrderRiderLogEntry[]> {
  const foodRows = await sql<{ order_id: number | null }[]>`
    SELECT order_id FROM orders_food
    WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    LIMIT 1
  `;
  const coreOrderId = foodRows[0]?.order_id;
  if (coreOrderId == null || !Number.isFinite(Number(coreOrderId))) return [];

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
    }>
  >`
    SELECT rider_id, rider_name, rider_mobile, assignment_status,
      assigned_at, accepted_at, rejected_at, reached_merchant_at,
      picked_up_at, delivered_at, cancelled_at
    FROM order_rider_assignments
    WHERE order_id = ${Number(coreOrderId)}
    ORDER BY assigned_at DESC NULLS LAST
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
    return {
      rider_id: a.rider_id,
      rider_name: a.rider_name ?? r?.name ?? null,
      rider_mobile: a.rider_mobile ?? r?.mobile ?? null,
      selfie_url: r?.selfie_url ?? null,
      assignment_status: a.assignment_status ?? "pending",
      assigned_at: a.assigned_at,
      accepted_at: a.accepted_at,
      rejected_at: a.rejected_at,
      reached_merchant_at: a.reached_merchant_at,
      picked_up_at: a.picked_up_at,
      delivered_at: a.delivered_at,
      cancelled_at: a.cancelled_at,
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

  const foods = await loadFoodRowsForCores(sql, storeId, cores);
  const { byCorePk, byTextId } = indexFoodRows(foods);

  const settingsRows = await sql`
    SELECT self_delivery FROM merchant_store_settings WHERE store_id = ${storeId} LIMIT 1
  `;
  const selfDeliveryEnabled =
    (settingsRows[0] as { self_delivery?: boolean } | undefined)?.self_delivery === true;

  const customerIds = [
    ...new Set(
      [
        ...cores.map((c) => coerceCustomerId(c.customer_id)),
        ...foods.map((f) => coerceCustomerId(f.customer_id)),
      ].filter((id): id is number => id != null)
    ),
  ];
  const customerById = new Map<number, CustomerRow>();
  if (customerIds.length > 0) {
    const custs = await sql`
      SELECT id, full_name, primary_mobile
      FROM customers
      WHERE id IN ${sql(customerIds)}
    `;
    for (const c of custs as unknown as Array<
      CustomerRow & { id: number | string | bigint }
    >) {
      const id = coerceCustomerId(c.id);
      if (id == null) continue;
      customerById.set(id, {
        full_name: c.full_name,
        primary_mobile: c.primary_mobile,
      });
    }
  }

  const textOrderIds = [
    ...new Set(cores.map((c) => String(c.order_id ?? "").trim()).filter((s) => s.length > 0)),
  ];
  const itemsByOrderTextId =
    textOrderIds.length > 0
      ? await loadMerchantOrderLineItemsByTextIds(sql, textOrderIds)
      : new Map<string, MerchantFoodOrderItem[]>();

  const coreIds = cores.map((c) => c.id);
  const otpByCoreId = new Map<number, { pickup: string | null; rto: string | null }>();
  try {
    const otpRows = await sql`
      SELECT order_id, otp_code, otp_type
      FROM order_food_otps
      WHERE order_id IN ${sql(coreIds)}
    `;
    for (const o of otpRows as unknown as Array<{ order_id: number; otp_code: string; otp_type: string }>) {
      const cid = Number(o.order_id);
      const entry = otpByCoreId.get(cid) ?? { pickup: null, rto: null };
      const t = String(o.otp_type ?? "").toUpperCase();
      if (t === "RTO") entry.rto = String(o.otp_code);
      else if (t === "PICKUP") entry.pickup = String(o.otp_code);
      otpByCoreId.set(cid, entry);
    }
  } catch {
    /* optional table */
  }

  const storeOrdinalByCoreId = new Map<number, number>();
  if (coreIds.length > 0) {
    const ordRows = await sql`
      SELECT
        oc.id,
        (
          SELECT COUNT(*)::int
          FROM orders_core prior
          LEFT JOIN LATERAL (
            SELECT pf.customer_id
            FROM orders_food pf
            WHERE pf.order_id = prior.id
               OR (pf.core_order_id IS NOT NULL AND pf.core_order_id = prior.order_id)
            ORDER BY pf.id DESC
            LIMIT 1
          ) pfood ON TRUE
          WHERE prior.merchant_store_id = ${storeId}
            AND COALESCE(prior.customer_id, pfood.customer_id) IS NOT NULL
            AND COALESCE(prior.customer_id, pfood.customer_id) = eff.cust_id
            AND prior.created_at <= oc.created_at
        ) AS ord
      FROM orders_core oc
      LEFT JOIN LATERAL (
        SELECT pf.customer_id
        FROM orders_food pf
        WHERE pf.order_id = oc.id
           OR (pf.core_order_id IS NOT NULL AND pf.core_order_id = oc.order_id)
        ORDER BY pf.id DESC
        LIMIT 1
      ) ofood ON TRUE
      CROSS JOIN LATERAL (
        SELECT COALESCE(oc.customer_id, ofood.customer_id) AS cust_id
      ) eff
      WHERE oc.id IN ${sql(coreIds)}
        AND eff.cust_id IS NOT NULL
    `;
    for (const row of ordRows as unknown as Array<{ id: number; ord: number }>) {
      const ord = Number(row.ord);
      if (Number.isFinite(ord) && ord > 0) storeOrdinalByCoreId.set(Number(row.id), ord);
    }

    const missingIds = coreIds.filter((id) => !storeOrdinalByCoreId.has(id));
    if (missingIds.length > 0) {
      const phoneOrdRows = await sql`
        SELECT
          oc.id,
          (
            SELECT COUNT(*)::int
            FROM orders_core prior
            LEFT JOIN customers pc ON pc.id = prior.customer_id
            LEFT JOIN LATERAL (
              SELECT pf.customer_phone
              FROM orders_food pf
              WHERE pf.order_id = prior.id
                 OR (pf.core_order_id IS NOT NULL AND pf.core_order_id = prior.order_id)
              ORDER BY pf.id DESC
              LIMIT 1
            ) pfood ON TRUE
            WHERE prior.merchant_store_id = ${storeId}
              AND prior.created_at <= oc.created_at
              AND NULLIF(
                REGEXP_REPLACE(COALESCE(pc.primary_mobile, pfood.customer_phone, ''), '\\D', '', 'g'),
                ''
              ) = oc_phone.phone_norm
          ) AS ord
        FROM orders_core oc
        INNER JOIN LATERAL (
          SELECT NULLIF(
            REGEXP_REPLACE(
              COALESCE(
                (SELECT c.primary_mobile FROM customers c WHERE c.id = oc.customer_id LIMIT 1),
                (SELECT pf.customer_phone FROM orders_food pf
                  WHERE pf.order_id = oc.id OR pf.core_order_id = oc.order_id
                  ORDER BY pf.id DESC LIMIT 1),
                ''
              ),
              '\\D',
              '',
              'g'
            ),
            ''
          ) AS phone_norm
        ) oc_phone ON TRUE
        WHERE oc.id IN ${sql(missingIds)}
          AND oc_phone.phone_norm IS NOT NULL
      `;
      for (const row of phoneOrdRows as unknown as Array<{ id: number; ord: number }>) {
        const ord = Number(row.ord);
        if (Number.isFinite(ord) && ord > 0) storeOrdinalByCoreId.set(Number(row.id), ord);
      }
    }
  }

  const timelineSnapByCoreId = new Map<number, TimelineMilestoneSnapshot>();
  if (coreIds.length > 0) {
    try {
      const tlRows = await sql`
        SELECT order_id, status, occurred_at
        FROM order_timelines
        WHERE order_id IN ${sql(coreIds)}
        ORDER BY occurred_at ASC, id ASC
      `;
      for (const row of tlRows as unknown as Array<{
        order_id: number;
        status: string;
        occurred_at: unknown;
      }>) {
        const cid = Number(row.order_id);
        if (!Number.isFinite(cid)) continue;
        let snap = timelineSnapByCoreId.get(cid);
        if (!snap) {
          snap = emptyTimelineSnapshot();
          timelineSnapByCoreId.set(cid, snap);
        }
        absorbTimelineRow(snap, String(row.status ?? ""), row.occurred_at);
      }
    } catch {
      /* optional table */
    }
  }

  const customerStoreOrdersTotalById = new Map<number, number>();
  const customerPlatformOrdersTotalById = new Map<number, number>();
  if (customerIds.length > 0) {
    const storeCountRows = await sql`
      SELECT customer_id, COUNT(*)::int AS cnt
      FROM orders_core
      WHERE merchant_store_id = ${storeId}
        AND customer_id IN ${sql(customerIds)}
      GROUP BY customer_id
    `;
    for (const row of storeCountRows as unknown as Array<{ customer_id: number; cnt: number }>) {
      const cid = coerceCustomerId(row.customer_id);
      if (cid != null) customerStoreOrdersTotalById.set(cid, Number(row.cnt) || 0);
    }

    const platformCountRows = await sql`
      SELECT customer_id, COUNT(*)::int AS cnt
      FROM orders_core
      WHERE customer_id IN ${sql(customerIds)}
      GROUP BY customer_id
    `;
    for (const row of platformCountRows as unknown as Array<{ customer_id: number; cnt: number }>) {
      const cid = coerceCustomerId(row.customer_id);
      if (cid != null) customerPlatformOrdersTotalById.set(cid, Number(row.cnt) || 0);
    }
  }

  const snapshotsByOrderText = await loadSnapshotsByOrderTexts(sql, textOrderIds, storeId);
  let commissionPercent: number | undefined;
  try {
    commissionPercent = (await resolveStoreCommission(storeId)).percent;
  } catch {
    commissionPercent = undefined;
  }

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
    otpByCoreId,
  };

  return Promise.all(
    cores.map(async (core) => {
      const food = matchFoodToCore(core, byCorePk, byTextId);
      return buildOrderDto(core, food, buildOpts);
    })
  );
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
  }
): Promise<MerchantFoodOrderDto> {
  const status = String(newStatus || "").toUpperCase();
  if (!status) throw new Error("status_required");

  const existingRows = await sql`
    SELECT id, order_id, core_order_id, order_status, merchant_store_id, food_items_total_value
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
      resolvePartnerPipeline(existing.order_status, core.status ?? "assigned", core.current_status ?? null)
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

  if (status === "ACCEPTED") {
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz, accepted_at = ${now}::timestamptz,
          accepted_by_label = ${actionLabels.accepted_by_label ?? null}
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
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
  } else if (status === "PREPARING") {
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz, preparing_at = ${now}::timestamptz, prepared_at = NULL
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
  } else if (status === "READY_FOR_PICKUP") {
    await sql`
      UPDATE orders_food
      SET order_status = ${status}, updated_at = ${now}::timestamptz,
          preparing_at = COALESCE(preparing_at, ${now}::timestamptz),
          prepared_at = ${now}::timestamptz
      WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
    `;
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
  } else if (status === "CANCELLED") {
    const cancelLabel = actionLabels.cancelled_by_label ?? null;
    if (rejectedReason) {
      await sql`
        UPDATE orders_food
        SET order_status = ${status}, updated_at = ${now}::timestamptz, cancelled_at = ${now}::timestamptz,
            rejected_reason = ${rejectedReason}, cancelled_by_label = ${cancelLabel}
        WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
      `;
    } else {
      await sql`
        UPDATE orders_food
        SET order_status = ${status}, updated_at = ${now}::timestamptz, cancelled_at = ${now}::timestamptz,
            cancelled_by_label = ${cancelLabel}
        WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
      `;
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
        ${meta}::jsonb
      )
    `;
  } catch {
    /* non-fatal */
  }

  const didJustDeliver = status === "DELIVERED" && currentStatus !== "DELIVERED";
  if (didJustDeliver) {
    const amount = num(existing.food_items_total_value);
    if (amount > 0) {
      try {
        const walletRows = await sql`SELECT get_or_create_merchant_wallet(${storeId}) AS wallet_id`;
        const walletId = Number((walletRows[0] as { wallet_id?: number | string } | undefined)?.wallet_id);
        if (Number.isFinite(walletId) && walletId > 0) {
          await sql`
            SELECT merchant_wallet_credit(
              ${walletId}, ${amount}, ${"ORDER_EARNING"}, ${"AVAILABLE"},
              ${"ORDER"}, ${ordersFoodId}, ${`order_earning_${ordersFoodId}`},
              ${`Order #${corePk} delivered`}, ${"{}"}::jsonb
            )
          `;
        }
      } catch {
        /* non-fatal */
      }
    }
  }

  const loaded = await loadMerchantFoodOrders(sql, storeId, { ordersFoodId, limit: 1 });
  const order = loaded[0];
  if (!order) throw new Error("order_not_found_after_update");
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
  return rows as MerchantOrderTimelineEntry[];
}
