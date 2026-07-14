/**
 * GET /api/orders/[orderId]/items
 * Real line items + billing summary for order detail / items refund modal.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, supabaseAdmin } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import {
  collectCoreItemOrderKeys,
  DELIVERY_FEE_ITEM_ID,
  loadCoreDbItemsByOrderTextIds,
  resolveOrderItems,
} from "@/lib/foodOrderItems";
import { buildOrderPricingSummary, type OrderItemLineAmounts } from "@/lib/orderItemsPayload";
import {
  loadCommissionSnapshotsForCoreId,
  merchantAddonUnitForLine,
  merchantBaseUnitForItem,
  merchantOrderTotalFromBilling,
} from "@/lib/merchant-visible-pricing";
import { getActiveCommissionForStore } from "@/lib/db/operations/commission";
import {
  merchantFundedDiscountFromBilling,
  merchantFundedDiscountLinesFromBilling,
  parseBillingSnapshot,
} from "@/lib/merchant-billing-discount";
import {
  buildCustomisationDetail,
  findCartLineForOrderItem,
  formatCustomisationPlain,
} from "@/lib/order-item-customisation";
import { extractItemsArray } from "@/lib/orderLineItems";
import { itemsFromBillingSnapshot } from "@/lib/foodOrderItems";
import { computeMerchantCtmForPartnerOrder } from "@/lib/merchant-order-ctm";
import {
  merchantBillPartsFromItems,
  merchantLineTotalForItem,
} from "@/lib/merchant-order-item-display";
import { resolvePartnerOrderItems } from "@/lib/partnerFoodOrderItems";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function imageFromSnapshot(snap: Record<string, unknown> | null | undefined): string | null {
  if (!snap || typeof snap !== "object") return null;
  const url = String(
    snap.item_image_url ?? snap.imageUrl ?? snap.itemImageUrl ?? snap.image_url ?? ""
  ).trim();
  return url || null;
}

function packagingPerUnitFromSnapshot(snap: Record<string, unknown> | null | undefined): number {
  if (!snap || typeof snap !== "object") return 0;
  const raw =
    snap.packaging_charges ?? snap.packagingCharges ?? snap.packaging_charge ?? 0;
  const n = asNum(raw);
  return n > 0 ? n : 0;
}

/** GST on food line items from billing_snapshot (order-level, allocated per line). */
function itemGstFromBilling(snap: Record<string, unknown> | null): number {
  if (!snap) return 0;
  const gst = snap.gst_components;
  if (gst && typeof gst === "object") {
    const itemsComp = (gst as Record<string, unknown>).items;
    if (itemsComp && typeof itemsComp === "object") {
      const g = asNum((itemsComp as Record<string, unknown>).gst);
      if (g > 0) return g;
    }
  }
  const taxes = Array.isArray(snap.taxes) ? snap.taxes : [];
  let sum = 0;
  for (const t of taxes) {
    const row = t as Record<string, unknown>;
    const group = String(row.tax_group ?? row.taxGroup ?? "").toLowerCase();
    if (group === "item") sum += asNum(row.tax ?? row.amount);
  }
  return sum;
}

function taxFromSnapshotPerUnit(
  snap: Record<string, unknown> | null | undefined,
  baseUnit: number
): number {
  if (!snap || typeof snap !== "object") return 0;
  const lineTax = asNum(snap.tax_amount ?? snap.taxAmount ?? snap.gst_amount ?? snap.gstAmount);
  if (lineTax > 0) return lineTax;
  const rate = asNum(snap.tax_percentage ?? snap.taxPercentage ?? snap.tax_rate ?? snap.taxRate);
  if (rate > 0) return (baseUnit * rate) / 100;
  return 0;
}

function addonUnitPrice(
  storedAddonPrice: number,
  addonList: Array<{ price: number; quantity: number }>
): number {
  if (storedAddonPrice > 0) return storedAddonPrice;
  return addonList.reduce((s, a) => s + a.price * Math.max(1, a.quantity), 0);
}

type LineAmounts = {
  amountPerQuantity: number;
  taxPerQuantity: number;
  chargesPerQuantity: number;
  totalPerQuantity: number;
  lineTotal: number;
};

function computeLineAmounts(args: {
  qty: number;
  baseUnit: number;
  addonUnit: number;
  packagingUnit: number;
  lineSubtotalForGst: number;
  totalSubtotalForGst: number;
  orderItemGst: number;
  orderPackagingFee: number;
  totalLineSubtotalForPackaging: number;
  snap: Record<string, unknown> | null;
}): LineAmounts {
  const qty = Math.max(1, args.qty);
  const baseUnit = args.baseUnit;
  const addonUnit = args.addonUnit;

  let packagingLineTotal = args.packagingUnit * qty;
  if (
    packagingLineTotal <= 0 &&
    args.orderPackagingFee > 0 &&
    args.totalLineSubtotalForPackaging > 0
  ) {
    packagingLineTotal =
      (args.lineSubtotalForGst / args.totalLineSubtotalForPackaging) * args.orderPackagingFee;
  }
  const packagingPerUnit = packagingLineTotal / qty;

  const chargesPerQuantity = addonUnit + packagingPerUnit;

  let lineTaxTotal = 0;
  const snapTaxUnit = taxFromSnapshotPerUnit(args.snap, baseUnit);
  if (snapTaxUnit > 0) {
    lineTaxTotal = snapTaxUnit * qty;
  } else if (args.orderItemGst > 0 && args.totalSubtotalForGst > 0) {
    lineTaxTotal = (args.lineSubtotalForGst / args.totalSubtotalForGst) * args.orderItemGst;
  }

  const taxPerQuantity = lineTaxTotal / qty;
  const totalPerQuantity = baseUnit + chargesPerQuantity + taxPerQuantity;
  const lineTotal =
    Math.round((baseUnit * qty + addonUnit * qty + packagingLineTotal + lineTaxTotal) * 100) / 100;

  return {
    amountPerQuantity: Math.round(baseUnit * 100) / 100,
    taxPerQuantity: Math.round(taxPerQuantity * 100) / 100,
    chargesPerQuantity: Math.round(chargesPerQuantity * 100) / 100,
    totalPerQuantity: Math.round(totalPerQuantity * 100) / 100,
    lineTotal,
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const allowed =
      (await Promise.all([
        isSuperAdmin(user.id, user.email ?? ""),
        hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"),
      ])).some(Boolean);

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Access to Orders dashboard required." },
        { status: 403 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Server misconfigured" }, { status: 500 });
    }

    const db = supabaseAdmin;

    const { data: core, error: coreErr } = await db
      .from("orders_core")
      .select(
        "id, order_id, merchant_store_id, item_total, addon_total, grand_total, billing_snapshot, checkout_metadata, items, total_ctm, merchant_precision_discount"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (coreErr) {
      console.error("[GET /api/orders/[orderId]/items] core:", coreErr.message);
      return NextResponse.json({ success: false, error: coreErr.message }, { status: 500 });
    }
    if (!core) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }


    const textOrderId = String(core.order_id ?? "").trim();
    const storeId = core.merchant_store_id != null ? Number(core.merchant_store_id) : null;

    const [
      { data: food, error: foodErr },
      { data: pendingRow },
      { data: coreItemRows },
      commissionSnaps,
    ] = await Promise.all([
      db.from("orders_food").select("*").eq("order_id", orderId).maybeSingle(),
      textOrderId
        ? db
            .from("pending_orders")
            .select("items_snapshot")
            .eq("finalized_order_id", textOrderId)
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      textOrderId
        ? db
            .from("orders_core_items")
            .select(
              "id, order_id, menu_item_id, item_name, variant_name, category_name, quantity, base_price, addon_price, total_price, veg_nonveg, item_snapshot, applied_offer_type, applied_offer_label, offer_discount_amount"
            )
            .eq("order_id", textOrderId)
            .order("id")
        : Promise.resolve({ data: [] }),
      loadCommissionSnapshotsForCoreId(db, orderId, storeId),
    ]);

    if (foodErr) {
      console.error("[GET /api/orders/[orderId]/items] food:", foodErr.message);
    }

    const keys = collectCoreItemOrderKeys(
      core as Record<string, unknown>,
      food as Record<string, unknown> | null
    );

    const itemIds = (coreItemRows ?? [])
      .map((r) => Number((r as { id: number }).id))
      .filter((n) => Number.isFinite(n));

    const menuIds = [
      ...new Set(
        (coreItemRows ?? [])
          .map((r) => Number((r as { menu_item_id?: number }).menu_item_id))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ];

    const [itemsByTextId, { data: addonRows }, { data: menuRows }] = await Promise.all([
      loadCoreDbItemsByOrderTextIds(db, keys),
      itemIds.length > 0
        ? db
            .from("orders_core_item_addons")
            .select("order_item_id, addon_name, quantity, addon_price")
            .in("order_item_id", itemIds)
        : Promise.resolve({ data: [] }),
      storeId != null && menuIds.length > 0
        ? db
            .from("merchant_menu_items")
            .select("id, item_image_url")
            .eq("store_id", storeId)
            .in("id", menuIds)
        : Promise.resolve({ data: [] }),
    ]);

    const normalized = resolveOrderItems(
      core as Record<string, unknown>,
      food as Record<string, unknown> | null,
      itemsByTextId
    );

    const addonsByItemId = new Map<
      number,
      Array<{ addon_name?: string | null; quantity: number; addon_price?: string | number | null }>
    >();
    for (const a of addonRows || []) {
      const itemId = Number((a as { order_item_id: number }).order_item_id);
      if (!Number.isFinite(itemId)) continue;
      const list = addonsByItemId.get(itemId) ?? [];
      list.push(a);
      addonsByItemId.set(itemId, list);
    }

    const menuImageById = new Map<number, string>();
    for (const m of menuRows || []) {
      const id = Number((m as { id: number }).id);
      const url = String((m as { item_image_url?: string }).item_image_url ?? "").trim();
      if (Number.isFinite(id) && url) menuImageById.set(id, url);
    }

    const cartLineSources: unknown[] = [];
    if (pendingRow?.items_snapshot) cartLineSources.push(pendingRow.items_snapshot);
    if (core.items != null) cartLineSources.push(core.items);
    if (food?.items != null) cartLineSources.push((food as { items?: unknown }).items);
    const billingCart = itemsFromBillingSnapshot(core as Record<string, unknown>);
    if (Array.isArray(billingCart) && billingCart.length > 0) {
      cartLineSources.push(billingCart);
    }
    let cartLines: Record<string, unknown>[] = [];
    for (const src of cartLineSources) {
      const arr = extractItemsArray(src);
      if (arr.length > cartLines.length) {
        cartLines = arr.map((r) =>
          r && typeof r === "object" ? (r as Record<string, unknown>) : {}
        );
      }
    }

    const detailRows: Array<{
      id: number;
      menuItemId: number | null;
      name: string;
      status: "AVAILABLE" | "FIXED";
      customisation: string;
      customisationDetail: ReturnType<typeof buildCustomisationDetail> | null;
      quantity: number;
      amountPerQuantity: number;
      taxPerQuantity: number;
      chargesPerQuantity: number;
      totalPerQuantity: number;
      customer?: OrderItemLineAmounts;
      lineTotal: number;
      hasImage: boolean;
      imageUrl: string | null;
      variantName: string | null;
      addons: Array<{ name: string; quantity: number; price: number; type?: string | null }>;
      vegNonveg: string | null;
      appliedOfferType: string | null;
      offerLabel: string | null;
    }> = [];

    const billingSnap = parseBillingSnapshot(core.billing_snapshot);

    const customerPricingSummary = buildOrderPricingSummary(
      billingSnap,
      core as Record<string, unknown>
    );

    let commissionPercent: number | undefined;
    const needsCommissionFallback =
      storeId != null &&
      (coreItemRows ?? []).some((row) => {
        const id = Number((row as { id: number }).id);
        const snap = commissionSnaps.find((s) => s.orderItemId === id);
        return !snap || snap.merchantBasePerUnit <= 0;
      });
    if (needsCommissionFallback) {
      try {
        const trace = await getActiveCommissionForStore(storeId!);
        commissionPercent = trace.percent;
      } catch {
        commissionPercent = undefined;
      }
    }

    const orderItemGst = itemGstFromBilling(billingSnap);
    const orderPackagingFee = customerPricingSummary.packaging;

    type PendingLine = {
      id: number;
      menuItemId: number | null;
      name: string;
      variant: string | null;
      qty: number;
      baseUnit: number;
      customerUnit: number;
      addonUnit: number;
      packagingUnit: number;
      lineSubtotalForGst: number;
      lineSubtotalForGstCustomer: number;
      snap: Record<string, unknown> | null;
      addonList: Array<{ name: string; quantity: number; price: number; type?: string | null }>;
      imageUrl: string | null;
      vegNonveg: string | null;
      cartLine: Record<string, unknown> | null;
      storedAddonPrice: number;
      appliedOfferType: string | null;
      offerLabel: string | null;
    };
    const pendingLines: PendingLine[] = [];

    const billingPricingRows: Array<Record<string, unknown>> = Array.isArray(
      (billingSnap as Record<string, unknown> | null)?.order_line_pricing
    )
      ? ((billingSnap as Record<string, unknown>).order_line_pricing as Array<
          Record<string, unknown>
        >)
      : Array.isArray((billingSnap as Record<string, unknown> | null)?.orderLinePricing)
        ? ((billingSnap as Record<string, unknown>).orderLinePricing as Array<
            Record<string, unknown>
          >)
        : [];

    const offerFromBilling = (
      lineIndex: number,
      menuItemId: number | null
    ): { type: string | null; label: string | null } => {
      if (!billingPricingRows.length) return { type: null, label: null };
      const mid = menuItemId != null ? String(menuItemId) : "";
      const row =
        billingPricingRows[lineIndex] ??
        (mid
          ? billingPricingRows.find(
              (r) => String(r.menuItemId ?? r.menu_item_id ?? "").trim() === mid
            )
          : undefined);
      if (!row) return { type: null, label: null };
      const type =
        String(row.appliedOfferType ?? row.applied_offer_type ?? "").trim() || null;
      const label =
        String(row.appliedOfferLabel ?? row.applied_offer_label ?? "").trim() || null;
      if (!type || type.toUpperCase() === "NONE") return { type: null, label: null };
      return { type, label };
    };

    if (coreItemRows && coreItemRows.length > 0) {
      let lineIndex = 0;
      for (const row of coreItemRows) {
        const r = row as {
          id: number;
          menu_item_id?: number | null;
          item_name: string;
          variant_name?: string | null;
          quantity: number;
          base_price: string | number;
          addon_price?: string | number | null;
          veg_nonveg?: string | null;
          item_snapshot?: Record<string, unknown> | null;
          applied_offer_type?: string | null;
          applied_offer_label?: string | null;
        };
        const qty = Math.max(1, Number(r.quantity) || 1);
        const customerUnit = asNum(r.base_price);
        const baseUnit = merchantBaseUnitForItem(
          r.id,
          commissionSnaps,
          customerUnit,
          commissionPercent
        );
        const snap = r.item_snapshot ?? null;
        const variant = String(r.variant_name ?? "").trim() || null;

        const addonList = (addonsByItemId.get(r.id) ?? []).map((a) => {
          const row = a as {
            addon_name?: string | null;
            quantity?: number;
            addon_price?: string | number | null;
          };
          return {
            name: String(row.addon_name ?? "Add-on").trim(),
            quantity: Math.max(1, Number(row.quantity) || 1),
            price: asNum(row.addon_price),
            type: null,
          };
        });
        const customerAddonUnit = addonUnitPrice(asNum(r.addon_price), addonList);
        const addonUnit = merchantAddonUnitForLine(customerUnit, baseUnit, customerAddonUnit);
        const packagingUnit = packagingPerUnitFromSnapshot(snap);

        const menuItemId =
          r.menu_item_id != null && Number.isFinite(Number(r.menu_item_id))
            ? Number(r.menu_item_id)
            : null;
        let imageUrl = imageFromSnapshot(snap);
        if (!imageUrl && menuItemId != null) {
          imageUrl = menuImageById.get(menuItemId) ?? null;
        }

        const itemName = String(r.item_name ?? "Item").trim();
        const cartLine = findCartLineForOrderItem(cartLines, {
          lineIndex,
          menuItemId,
          name: itemName,
          variant,
        });

        const frozenType = String(r.applied_offer_type ?? "").trim() || null;
        const frozenLabel = String(r.applied_offer_label ?? "").trim() || null;
        const fromBill = offerFromBilling(lineIndex, menuItemId);
        const appliedOfferType =
          frozenType && frozenType.toUpperCase() !== "NONE"
            ? frozenType
            : fromBill.type;
        const offerLabel = frozenLabel || fromBill.label;

        pendingLines.push({
          id: r.id,
          menuItemId,
          name: itemName,
          variant,
          qty,
          baseUnit,
          customerUnit,
          addonUnit,
          packagingUnit,
          lineSubtotalForGst: baseUnit * qty + addonUnit * qty,
          lineSubtotalForGstCustomer: customerUnit * qty + addonUnit * qty,
          snap,
          addonList,
          imageUrl,
          vegNonveg: r.veg_nonveg ?? null,
          cartLine,
          storedAddonPrice: asNum(r.addon_price),
          appliedOfferType,
          offerLabel,
        });
        lineIndex += 1;
      }
    } else if (normalized.length > 0) {
      normalized.forEach((it, idx) => {
        const qty = Math.max(1, it.quantity);
        const baseUnit = asNum(it.price);
        const addonUnit = 0;
        const fromBill = offerFromBilling(idx, it.menuItemId ?? null);
        pendingLines.push({
          id: idx + 1,
          menuItemId: it.menuItemId ?? null,
          name: it.name,
          variant: it.variantName ?? null,
          qty,
          baseUnit,
          customerUnit: baseUnit,
          addonUnit,
          packagingUnit: 0,
          lineSubtotalForGst: baseUnit * qty,
          lineSubtotalForGstCustomer: baseUnit * qty,
          snap: null,
          addonList: [],
          imageUrl: it.imageUrl ?? null,
          vegNonveg: it.vegNonveg ?? null,
          cartLine: findCartLineForOrderItem(cartLines, {
            lineIndex: idx,
            menuItemId: it.menuItemId ?? null,
            name: it.name,
            variant: it.variantName ?? null,
          }),
          storedAddonPrice: 0,
          appliedOfferType: it.appliedOfferType ?? fromBill.type,
          offerLabel: it.offerLabel ?? fromBill.label,
        });
      });
    }

    const totalSubtotalForGst = pendingLines.reduce((s, l) => s + l.lineSubtotalForGst, 0);
    const totalSubtotalForGstCustomer = pendingLines.reduce(
      (s, l) => s + l.lineSubtotalForGstCustomer,
      0
    );
    const totalLineSubtotalForPackaging = totalSubtotalForGst;

    for (const line of pendingLines) {
      const amounts = computeLineAmounts({
        qty: line.qty,
        baseUnit: line.baseUnit,
        addonUnit: line.addonUnit,
        packagingUnit: line.packagingUnit,
        lineSubtotalForGst: line.lineSubtotalForGst,
        totalSubtotalForGst,
        orderItemGst,
        orderPackagingFee,
        totalLineSubtotalForPackaging,
        snap: line.snap,
      });
      const customerAmounts = computeLineAmounts({
        qty: line.qty,
        baseUnit: line.customerUnit,
        addonUnit: line.addonUnit,
        packagingUnit: line.packagingUnit,
        lineSubtotalForGst: line.lineSubtotalForGstCustomer,
        totalSubtotalForGst: totalSubtotalForGstCustomer,
        orderItemGst,
        orderPackagingFee,
        totalLineSubtotalForPackaging: totalSubtotalForGstCustomer,
        snap: line.snap,
      });

      const customisationDetail = buildCustomisationDetail({
        variantName: line.variant,
        basePrice: line.baseUnit,
        itemSnapshot: line.snap,
        cartLine: line.cartLine,
        storedAddonPrice: line.storedAddonPrice,
        addons: line.addonList,
      });

      detailRows.push({
        id: line.id,
        menuItemId: line.menuItemId,
        name: line.name,
        status: "AVAILABLE",
        customisation: formatCustomisationPlain(customisationDetail),
        customisationDetail,
        quantity: line.qty,
        amountPerQuantity: amounts.amountPerQuantity,
        taxPerQuantity: amounts.taxPerQuantity,
        chargesPerQuantity: amounts.chargesPerQuantity,
        totalPerQuantity: amounts.totalPerQuantity,
        customer: {
          amountPerQuantity: customerAmounts.amountPerQuantity,
          taxPerQuantity: customerAmounts.taxPerQuantity,
          chargesPerQuantity: customerAmounts.chargesPerQuantity,
          totalPerQuantity: customerAmounts.totalPerQuantity,
        },
        lineTotal: amounts.lineTotal,
        hasImage: Boolean(line.imageUrl),
        imageUrl: line.imageUrl,
        variantName: line.variant,
        addons: line.addonList,
        vegNonveg: line.vegNonveg,
        appliedOfferType: line.appliedOfferType,
        offerLabel: line.offerLabel,
      });
    }

    const merchantPartnerItems = resolvePartnerOrderItems(
      core as Record<string, unknown>,
      (food as Record<string, unknown> | null) ?? null,
      itemsByTextId
    );
    const allCtmFrozen =
      merchantPartnerItems.length > 0 &&
      merchantPartnerItems.every((it) => it.ctmFromSnapshot === true);
    const precisionFromCore = Math.max(
      0,
      Number((core as { merchant_precision_discount?: unknown }).merchant_precision_discount) || 0
    );

    let merchantSubtotal = round2(
      allCtmFrozen
        ? merchantPartnerItems.reduce((s, it) => s + merchantLineTotalForItem(it), 0)
        : pendingLines.reduce((s, l) => s + l.lineSubtotalForGst, 0)
    );
    const merchantDiscountLegacy = merchantFundedDiscountFromBilling(billingSnap);
    const merchantDiscountLinesLegacy = merchantFundedDiscountLinesFromBilling(billingSnap);
    // SSOT: cart precision only when CTM nets already include item BOOST.
    const merchantDiscount = allCtmFrozen
      ? precisionFromCore
      : Math.max(merchantDiscountLegacy, precisionFromCore);
    const merchantDiscountLines = allCtmFrozen
      ? precisionFromCore > 0.005
        ? [
            {
              label: "Merchant Precision Discount",
              amount: precisionFromCore,
            },
          ]
        : []
      : merchantDiscountLinesLegacy;

    let merchantTotal: number | null = null;
    const frozenCoreCtm = Number((core as { total_ctm?: unknown }).total_ctm);
    if (Number.isFinite(frozenCoreCtm) && frozenCoreCtm > 0) {
      merchantTotal = round2(frozenCoreCtm);
    } else if (storeId != null && storeId > 0) {
      try {
        merchantTotal = await computeMerchantCtmForPartnerOrder(db, orderId, storeId);
      } catch {
        merchantTotal = null;
      }
    }
    if (merchantTotal == null || merchantTotal <= 0) {
      if (allCtmFrozen && merchantSubtotal > 0.005) {
        merchantTotal = round2(
          Math.max(0, merchantSubtotal + customerPricingSummary.packaging - precisionFromCore)
        );
      } else {
        const bill = merchantBillPartsFromItems(merchantPartnerItems, {
          subtotal: 0,
          packaging: customerPricingSummary.packaging,
          discount: merchantDiscount,
          total: 0,
        });
        merchantTotal =
          bill.total > 0
            ? round2(bill.total)
            : merchantOrderTotalFromBilling(
                merchantSubtotal,
                billingSnap,
                customerPricingSummary.packaging
              );
      }
    }
    if (allCtmFrozen && merchantSubtotal <= 0.005 && merchantTotal > 0) {
      merchantSubtotal = round2(
        Math.max(0, merchantTotal - customerPricingSummary.packaging + precisionFromCore)
      );
    }

    const merchantLines: Array<{
      key: string;
      label: string;
      amount: number;
      kind: "charge" | "tax" | "discount";
      discountTag?: "platform" | "store" | "mixed";
    }> = [];
    if (merchantSubtotal > 0) {
      merchantLines.push({
        key: "items",
        label: allCtmFrozen
          ? "Items subtotal (merchant nets)"
          : "Items subtotal (merchant prices)",
        amount: merchantSubtotal,
        kind: "charge",
      });
    }
    if (customerPricingSummary.packaging > 0) {
      merchantLines.push({
        key: "packaging",
        label: "Packaging",
        amount: customerPricingSummary.packaging,
        kind: "charge",
      });
    }
    for (const d of merchantDiscountLines) {
      merchantLines.push({
        key: "merchant_discount",
        label: d.label,
        amount: d.amount,
        kind: "discount",
        discountTag: "store",
      });
    }
    if (merchantDiscountLines.length === 0 && merchantDiscount > 0) {
      merchantLines.push({
        key: "merchant_discount",
        label: allCtmFrozen ? "Merchant Precision Discount" : "Restaurant discount",
        amount: merchantDiscount,
        kind: "discount",
        discountTag: "store",
      });
    }

    const pricing = {
      lines: merchantLines,
      itemsAmountTotal: merchantSubtotal,
      packaging: customerPricingSummary.packaging,
      packagingTax: 0,
      gst: 0,
      deliveryFee: 0,
      discount: merchantDiscount,
      platformFee: 0,
      surgeFee: 0,
      smallOrderFee: 0,
      convenienceFee: 0,
      miscFee: 0,
      tipAmount: 0,
      donationAmount: 0,
      totalOrderAmount: merchantTotal,
      customer: customerPricingSummary,
    };

    const offerByItemId = new Map<
      number,
      { appliedOfferType: string | null; offerLabel: string | null }
    >();
    for (const list of itemsByTextId.values()) {
      for (const raw of list) {
        const id = Number(raw.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const type =
          (raw.applied_offer_type as string | null | undefined) ??
          (raw.appliedOfferType as string | null | undefined) ??
          null;
        const label =
          (raw.offer_label as string | null | undefined) ??
          (raw.offerLabel as string | null | undefined) ??
          null;
        if (type || label) {
          offerByItemId.set(id, { appliedOfferType: type, offerLabel: label });
        }
      }
    }
    for (let i = 0; i < merchantPartnerItems.length; i++) {
      const partner = merchantPartnerItems[i];
      const row = detailRows[i];
      if (!partner || !row) continue;
      if (!partner.appliedOfferType && !partner.offerLabel) continue;
      if (offerByItemId.has(Number(row.id))) continue;
      offerByItemId.set(Number(row.id), {
        appliedOfferType: partner.appliedOfferType ?? null,
        offerLabel: partner.offerLabel ?? null,
      });
    }

    const rows = detailRows.map((r) => {
      const fromRow = r as {
        appliedOfferType?: string | null;
        offerLabel?: string | null;
        id: number;
      };
      const fromMap = offerByItemId.get(Number(fromRow.id));
      return {
        ...r,
        appliedOfferType:
          fromMap?.appliedOfferType ?? fromRow.appliedOfferType ?? null,
        offerLabel: fromMap?.offerLabel ?? fromRow.offerLabel ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      orderId,
      formattedOrderId: (core as { formatted_order_id?: string }).formatted_order_id ?? null,
      items: rows,
      normalizedItems: normalized,
      pricing,
    });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/items] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load order items",
      },
      { status: 500 }
    );
  }
}
