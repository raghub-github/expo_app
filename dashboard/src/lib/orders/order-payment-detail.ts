/**
 * Order payment card + modal — amounts from orders_core, billing_snapshot,
 * pending_orders / payment_events / timelines.
 * Total CTM = merchant-visible bill total (same as partnersite / merchant app).
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { merchantOrderTotalFromBilling } from "@/lib/merchant-visible-pricing";
import {
  orderDiscountGrantedSummaryFromBilling,
  parseBillingSnapshot,
  discountTotalFromBilling,
  type OrderDiscountOfferSource,
} from "@/lib/merchant-billing-discount";

export type OrderPaymentRecord = {
  paymentId: string;
  transactionId: string | null;
  mpTransactionId: string | null;
  paymentStatus: string;
  redemptionType: string | null;
  productType: string | null;
  refunded: boolean;
  partialRefunded: boolean;
  partiallyRefundedAmount: number | null;
  amount: number | null;
  deliveryFee: number | null;
  /** Customer cost for this line (CTC). */
  ctc: number | null;
  /** Cash paid (online) for this line. */
  cashin: number | null;
  pointsUsed: number | null;
  /** Merchant amount for this line (CTM). */
  ctm: number | null;
  cashbackEarned: number | null;
  pgName: string | null;
  pgTransactionId: string | null;
  couponCode: string | null;
  couponUserUsageCount: number | null;
  couponExpiryDate: string | null;
  couponValue: number | null;
  couponMaxDiscount: number | null;
  couponMaxUsage: number | null;
  couponMaxRedemption: number | null;
  couponType: string | null;
  couponUserEligible: boolean | null;
};

export type OrderPaymentDetail = {
  totalAmount: number | null;
  /** Merchant-visible bill total (items at merchant prices + packaging − restaurant discount). */
  totalCtm: number | null;
  totalCashbackEarned: number | null;
  /** Total discount granted to customer on this order. */
  totalDiscountGranted: number | null;
  discountOfferSource: OrderDiscountOfferSource | null;
  deliveryFee: number | null;
  source: string | null;
  paymentMode: string | null;
  partialRefunded: boolean;
  refundAmount: number | null;
  totalRefunded: number | null;
  totalPaid: number | null;
  records: OrderPaymentRecord[];
};

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function readRecord(raw: unknown): Record<string, unknown> | null {
  return parseBillingSnapshot(raw);
}

async function fetchDiscountFromOrderTables(input: {
  orderCoreId: number;
  orderIdText: string | null;
  formattedOrderId: string | null;
}): Promise<{ amount: number | null; offerSource: OrderDiscountOfferSource | null }> {
  const db = getDb();
  const textIds = [
    input.orderIdText?.trim(),
    input.formattedOrderId?.trim(),
  ].filter((v): v is string => Boolean(v));

  for (const orderText of textIds) {
    try {
      const rows = await db.execute(sql`
        SELECT discount_total
        FROM order_bill_summary_versions
        WHERE order_id = ${orderText}
        ORDER BY version_no DESC
        LIMIT 1
      `);
      const total = asNum((rows as unknown as Record<string, unknown>[])[0]?.discount_total);
      if (total != null && total > 0) {
        return { amount: round2(total), offerSource: null };
      }
    } catch {
      /* table may not exist */
    }
  }

  for (const orderText of textIds) {
    try {
      const rows = await db.execute(sql`
        SELECT amount, funding_type
        FROM order_discount_lines
        WHERE order_id = ${orderText}
        ORDER BY line_no ASC
      `);
      const lines = rows as unknown as Array<{
        amount?: unknown;
        funding_type?: unknown;
      }>;
      if (lines.length === 0) continue;

      let sum = 0;
      const funding = new Set<string>();
      for (const line of lines) {
        sum += Math.abs(asNum(line.amount) ?? 0);
        if (line.funding_type != null) {
          funding.add(String(line.funding_type).toUpperCase());
        }
      }
      if (sum <= 0) continue;

      let offerSource: OrderDiscountOfferSource | null = null;
      if (funding.size === 1) {
        const only = [...funding][0];
        if (only.includes("MERCHANT") || only.includes("STORE")) {
          offerSource = "Store";
        } else if (only.includes("PLATFORM")) {
          offerSource = "Platform";
        }
      } else if (funding.size > 1) {
        offerSource = "Mixed";
      }
      return { amount: round2(sum), offerSource };
    } catch {
      /* table may not exist */
    }
  }

  const lookupIds = new Set<number>([input.orderCoreId]);
  for (const orderText of textIds) {
    const digits = orderText.replace(/\D/g, "");
    if (digits) {
      const n = Number(digits);
      if (Number.isFinite(n) && n > 0) lookupIds.add(n);
    }
  }

  for (const lookupId of lookupIds) {
    try {
      const rows = await db.execute(sql`
        SELECT discount_amount, offer_source, platform_share, merchant_share
        FROM offer_order_applications
        WHERE order_id = ${lookupId}
      `);
      const apps = rows as unknown as Array<{
        discount_amount?: unknown;
        offer_source?: unknown;
        platform_share?: unknown;
        merchant_share?: unknown;
      }>;
      if (apps.length === 0) continue;

      let sum = 0;
      let platformShare = 0;
      let merchantShare = 0;
      for (const app of apps) {
        const amt = Math.abs(asNum(app.discount_amount) ?? 0);
        sum += amt;
        platformShare += Math.abs(asNum(app.platform_share) ?? 0);
        merchantShare += Math.abs(asNum(app.merchant_share) ?? 0);
      }
      if (sum <= 0) continue;

      let offerSource: OrderDiscountOfferSource | null = null;
      const sources = new Set(
        apps.map((a) => String(a.offer_source ?? "").toUpperCase()).filter(Boolean),
      );
      if (sources.size === 1) {
        const only = [...sources][0];
        offerSource =
          only === "MERCHANT" ? "Store" : only === "PLATFORM" || only === "COUPON" ? "Platform" : null;
      } else if (sources.size > 1) {
        offerSource = "Mixed";
      } else if (merchantShare > 0.01 && platformShare > 0.01) {
        offerSource = "Mixed";
      } else if (merchantShare > 0.01) {
        offerSource = "Store";
      } else if (platformShare > 0.01) {
        offerSource = "Platform";
      }

      return { amount: round2(sum), offerSource };
    } catch {
      /* table may not exist */
    }
  }

  return { amount: null, offerSource: null };
}

function merchantItemSubtotalFromBilling(
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>
): number {
  return (
    round2(
      (asNum(billing?.item_total) ?? 0) + (asNum(billing?.addon_total) ?? 0)
    ) ||
    round2((asNum(core.item_total) ?? 0) + (asNum(core.addon_total) ?? 0))
  );
}

function merchantGrossFromBilling(
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>
): number {
  return merchantItemSubtotalFromBilling(billing, core);
}

function cashbackFromBilling(billing: Record<string, unknown> | null): number | null {
  if (!billing) return null;
  let sum = 0;
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const label = String(row.label ?? "").toLowerCase();
    const kind = String(row.kind ?? "").toLowerCase();
    if (label.includes("cashback") || kind === "cashback") {
      sum += asNum(row.amount) ?? 0;
    }
  }
  const meta = billing.cashback_amount ?? billing.cashbackAmount;
  if (meta != null) sum += asNum(meta) ?? 0;
  return sum > 0 ? round2(sum) : null;
}

type CouponMeta = {
  code: string | null;
  value: number | null;
  maxDiscount: number | null;
  maxUsage: number | null;
  maxRedemption: number | null;
  type: string | null;
  userUsageCount: number | null;
  expiryDate: string | null;
  userEligible: boolean | null;
};

function extractCouponMeta(billing: Record<string, unknown> | null): CouponMeta {
  const empty: CouponMeta = {
    code: null,
    value: null,
    maxDiscount: null,
    maxUsage: null,
    maxRedemption: null,
    type: null,
    userUsageCount: null,
    expiryDate: null,
    userEligible: null,
  };
  if (!billing) return empty;

  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const meta =
      row.meta && typeof row.meta === "object"
        ? (row.meta as Record<string, unknown>)
        : {};
    const label = String(row.label ?? "").toLowerCase();
    const isCoupon =
      String(meta.source ?? "").toLowerCase() === "coupon" ||
      meta.couponCode != null ||
      meta.code != null ||
      label.includes("coupon");
    if (!isCoupon) continue;

    return {
      code:
        (typeof meta.couponCode === "string" && meta.couponCode.trim()) ||
        (typeof meta.code === "string" && meta.code.trim()) ||
        null,
      value: asNum(meta.couponValue ?? meta.value ?? row.amount),
      maxDiscount: asNum(meta.maxDiscount ?? meta.couponMaxDiscount),
      maxUsage: asNum(meta.maxUsage ?? meta.couponMaxUsage),
      maxRedemption: asNum(meta.maxRedemption ?? meta.couponMaxRedemption),
      type:
        (typeof meta.couponType === "string" && meta.couponType) ||
        (typeof row.kind === "string" && row.kind) ||
        null,
      userUsageCount: asNum(meta.userUsageCount ?? meta.usageCount),
      expiryDate:
        typeof meta.expiryDate === "string"
          ? meta.expiryDate
          : typeof meta.expiresAt === "string"
            ? meta.expiresAt
            : null,
      userEligible:
        typeof meta.userEligible === "boolean"
          ? meta.userEligible
          : typeof meta.eligible === "boolean"
            ? meta.eligible
            : null,
    };
  }
  return empty;
}

function resolveDeliveryFee(
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>,
  settlementDelivery: number | null
): number | null {
  const fromBilling = asNum(billing?.delivery_fee);
  const quoted = asNum(billing?.deliveryFeeQuotedInr ?? billing?.delivery_fee_quoted);
  const fee =
    settlementDelivery ??
    asNum(core.total_delivery_fee) ??
    (fromBilling != null && fromBilling > 0 ? fromBilling : null) ??
    (quoted != null && quoted > 0 ? quoted : null);
  return fee != null && fee > 0 ? round2(fee) : null;
}

function isOnlinePaymentMode(mode: string | null): boolean {
  if (!mode) return false;
  const m = mode.trim().toUpperCase();
  return m !== "COD" && m !== "CASH" && m !== "CASH_ON_DELIVERY";
}

function buildPaymentLineRecords(args: {
  paymentIdLabel: string;
  transactionId: string | null;
  mpTransactionId: string | null;
  paymentStatus: string;
  redemptionType: string | null;
  orderType: string;
  refunded: boolean;
  partialRefunded: boolean;
  partialRefundedAmount: number | null;
  billing: Record<string, unknown> | null;
  core: Record<string, unknown>;
  merchantItemSubtotal: number | null;
  merchantTotal: number | null;
  deliveryFeeTotal: number | null;
  cashbackEarned: number | null;
  pgName: string | null;
  pgTransactionId: string | null;
  paymentMode: string | null;
  coupon: CouponMeta;
}): OrderPaymentRecord[] {
  const billing = args.billing ?? {};
  const core = args.core;
  const online = isOnlinePaymentMode(args.paymentMode);
  const attachCoupon = (row: OrderPaymentRecord, withCoupon: boolean): OrderPaymentRecord => ({
    ...row,
    couponCode: withCoupon ? args.coupon.code : null,
    couponUserUsageCount: withCoupon ? args.coupon.userUsageCount : null,
    couponExpiryDate: withCoupon ? args.coupon.expiryDate : null,
    couponValue: withCoupon ? args.coupon.value : null,
    couponMaxDiscount: withCoupon ? args.coupon.maxDiscount : null,
    couponMaxUsage: withCoupon ? args.coupon.maxUsage : null,
    couponMaxRedemption: withCoupon ? args.coupon.maxRedemption : null,
    couponType: withCoupon ? args.coupon.type : null,
    couponUserEligible: withCoupon ? args.coupon.userEligible : null,
  });

  const base = {
    paymentId: args.paymentIdLabel,
    transactionId: args.transactionId,
    mpTransactionId: args.mpTransactionId,
    paymentStatus: args.paymentStatus,
    redemptionType: args.redemptionType,
    refunded: args.refunded,
    partialRefunded: args.partialRefunded,
    partiallyRefundedAmount: args.partialRefunded ? args.partialRefundedAmount : null,
    cashbackEarned: args.cashbackEarned,
    pgName: args.pgName,
    pgTransactionId: args.pgTransactionId ?? args.transactionId,
    pointsUsed: null,
    couponCode: null as string | null,
    couponUserUsageCount: null as number | null,
    couponExpiryDate: null as string | null,
    couponValue: null as number | null,
    couponMaxDiscount: null as number | null,
    couponMaxUsage: null as number | null,
    couponMaxRedemption: null as number | null,
    couponType: null as string | null,
    couponUserEligible: null as boolean | null,
  };

  const itemGross =
    round2((asNum(billing.item_total) ?? 0) + (asNum(billing.addon_total) ?? 0)) ||
    round2((asNum(core.item_total) ?? 0) + (asNum(core.addon_total) ?? 0));
  const packaging = round2(asNum(billing.packaging_fee) ?? 0);
  const delivery = args.deliveryFeeTotal ?? round2(asNum(billing.delivery_fee) ?? 0);
  const platform = round2(asNum(billing.platform_fee) ?? 0);
  const surge = round2(asNum(billing.surge_fee) ?? 0);
  const smallOrder = round2(asNum(billing.small_order_fee) ?? 0);
  const convenience = round2(asNum(billing.convenience_fee) ?? 0);
  const misc = round2(asNum(billing.misc_fee) ?? 0);
  const gst = round2(asNum(billing.tax_total) ?? 0);
  const tip = round2(asNum(billing.tip_amount) ?? 0);
  const donation = round2(asNum(billing.donation_amount) ?? 0);

  const merchantItem = args.merchantItemSubtotal;
  const itemRatio =
    merchantItem != null && merchantItem > 0 && itemGross > 0
      ? merchantItem / itemGross
      : null;

  const lineCtm = (customerAmt: number, merchantBillable: boolean): number | null => {
    if (!merchantBillable || customerAmt <= 0) return null;
    if (itemRatio != null) return round2(customerAmt * itemRatio);
    return null;
  };

  const pushLine = (
    productType: string,
    amount: number,
    opts?: { deliveryFee?: number | null; ctm?: number | null; merchantBillable?: boolean }
  ): OrderPaymentRecord | null => {
    if (amount <= 0) return null;
    const ctc = round2(amount);
    const ctm =
      opts?.ctm != null
        ? opts.ctm
        : lineCtm(ctc, opts?.merchantBillable ?? false);
    return {
      ...base,
      productType,
      amount: ctc,
      ctc,
      cashin: online ? ctc : null,
      ctm,
      deliveryFee: opts?.deliveryFee ?? null,
    };
  };

  const lines: OrderPaymentRecord[] = [];
  let couponAttached = false;

  const specs: Array<OrderPaymentRecord | null> = [
    pushLine("FOOD", itemGross, { merchantBillable: true, ctm: merchantItem ?? undefined }),
    pushLine("PACKAGING", packaging, { merchantBillable: true, ctm: packaging > 0 ? packaging : null }),
    pushLine("DELIVERY_FEE", delivery, { deliveryFee: delivery > 0 ? delivery : null }),
    pushLine("PLATFORM_FEE", platform),
    pushLine("SURGE_FEE", surge),
    pushLine("SMALL_ORDER_FEE", smallOrder),
    pushLine("CONVENIENCE_FEE", convenience),
    pushLine("MISC_FEE", misc),
    pushLine("GST", gst),
    pushLine("TIP", tip),
    pushLine("DONATION", donation),
  ];

  for (const row of specs) {
    if (!row) continue;
    const withCoupon = !couponAttached;
    if (withCoupon) couponAttached = true;
    lines.push(attachCoupon(row, withCoupon));
  }

  if (lines.length === 0) {
    const grand =
      asNum(core.grand_total) ?? asNum(billing.final_amount) ?? asNum(billing.final_payable);
    if (grand != null && grand > 0) {
      lines.push(
        attachCoupon(
          {
            ...base,
            productType: args.orderType?.toUpperCase() || "ORDER",
            amount: round2(grand),
            ctc: round2(grand),
            cashin: online ? round2(grand) : null,
            ctm: args.merchantTotal,
            deliveryFee: args.deliveryFeeTotal,
          },
          true
        )
      );
    }
  }

  return lines;
}

async function merchantGrossFromCommissionSnapshots(
  orderCoreId: number,
  merchantStoreId: number | null,
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>
): Promise<number | null> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT
        s.merchant_base_price::text AS merchant_base_price,
        oci.quantity,
        oci.base_price::text AS base_price,
        oci.addon_price::text AS addon_price
      FROM order_item_commission_snapshots s
      JOIN orders_core_items oci ON oci.id = s.order_item_id
      WHERE s.order_id = ${orderCoreId}
        ${merchantStoreId != null && merchantStoreId > 0 ? sql`AND s.store_id = ${merchantStoreId}` : sql``}
    `);
    const list = rows as unknown as Array<{
      merchant_base_price: string;
      quantity: number;
      base_price: string;
      addon_price: string;
    }>;
    if (list.length === 0) return null;
    let itemSum = 0;
    for (const r of list) {
      const qty = Math.max(1, Number(r.quantity) || 1);
      const merchantBase = asNum(r.merchant_base_price) ?? 0;
      const customerBase = asNum(r.base_price) ?? 0;
      const customerAddonPerUnit = asNum(r.addon_price) ?? 0;
      let merchantAddonPerUnit = customerAddonPerUnit;
      if (
        customerAddonPerUnit > 0.005 &&
        merchantBase > 0.005 &&
        customerBase > 0.005
      ) {
        merchantAddonPerUnit = round2(
          customerAddonPerUnit * (merchantBase / customerBase)
        );
      }
      itemSum += (merchantBase + merchantAddonPerUnit) * qty;
    }
    if (itemSum <= 0) return null;
    return round2(itemSum);
  } catch {
    return null;
  }
}

/** Merchant bill total — matches partnersite / merchant app (not settlement net). */
async function resolveTotalCtm(
  merchantStoreId: number | null,
  core: Record<string, unknown>,
  billing: Record<string, unknown> | null,
  orderCoreId?: number
): Promise<number | null> {
  const db = getDb();
  const packagingFallback = asNum(billing?.packaging_fee) ?? 0;
  const customerGrand =
    asNum(core.grand_total) ??
    asNum(billing?.final_amount) ??
    asNum(billing?.final_payable);

  let merchantItemSubtotal =
    orderCoreId != null && orderCoreId > 0
      ? await merchantGrossFromCommissionSnapshots(
          orderCoreId,
          merchantStoreId,
          billing,
          core
        )
      : null;
  if (merchantItemSubtotal == null || merchantItemSubtotal <= 0) {
    merchantItemSubtotal = merchantGrossFromBilling(billing, core);
  }

  const computed =
    merchantItemSubtotal > 0
      ? merchantOrderTotalFromBilling(
          merchantItemSubtotal,
          billing,
          packagingFallback
        )
      : null;

  if (computed != null && computed > 0) return computed;

  if (orderCoreId != null && orderCoreId > 0) {
    try {
      const foodRows = await db.execute(sql`
        SELECT food_items_total_value::text AS food_items_total_value
        FROM orders_food
        WHERE order_id = ${orderCoreId}
        LIMIT 1
      `);
      const foodTotal = asNum(
        (foodRows as unknown as Record<string, unknown>[])[0]?.food_items_total_value
      );
      if (foodTotal != null && foodTotal > 0) {
        const looksLikeCustomerTotal =
          customerGrand != null && foodTotal >= customerGrand - 0.02;
        if (!looksLikeCustomerTotal) return round2(foodTotal);
      }
    } catch {
      /* orders_food optional */
    }
  }

  return null;
}

export async function fetchOrderPaymentDetail(input: {
  orderCoreId: number;
  orderIdText: string | null;
  formattedOrderId: string | null;
  displayId: string;
  merchantStoreId: number | null;
  orderType: string;
  orderSource: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  grandTotal?: number | null;
  itemTotal?: number | null;
  addonTotal?: number | null;
  tipAmount?: number | null;
}): Promise<OrderPaymentDetail> {
  const db = getDb();
  const orderCoreId = input.orderCoreId;
  const paymentIdLabel =
    input.formattedOrderId?.trim() ||
    input.orderIdText?.trim() ||
    input.displayId;

  let core: Record<string, unknown> = {};
  try {
    const rows = await db.execute(sql`
      SELECT
        grand_total,
        item_total,
        addon_total,
        tip_amount,
        commission_amount,
        total_delivery_fee,
        total_ctm,
        total_refunded,
        total_paid,
        billing_snapshot,
        payment_method,
        payment_status,
        order_source
      FROM orders_core
      WHERE id = ${orderCoreId}
      LIMIT 1
    `);
    core = (rows as unknown as Record<string, unknown>[])[0] ?? {};
  } catch {
    core = {};
  }

  let billing = readRecord(core.billing_snapshot ?? core.billingSnapshot);

  let settlementDelivery: number | null = null;
  try {
    const sb = await db.execute(sql`
      SELECT delivery_fee
      FROM order_settlement_breakdown
      WHERE order_id = ${orderCoreId}
      LIMIT 1
    `);
    const row = (sb as unknown as Record<string, unknown>[])[0];
    if (row) {
      settlementDelivery = asNum(row.delivery_fee);
    }
  } catch {
    /* table may not exist */
  }

  let razorpayOrderId: string | null = null;
  let razorpayPaymentId: string | null = null;
  let pgName: string | null = null;

  const orderText =
    input.orderIdText?.trim() || input.formattedOrderId?.trim() || null;

  if (orderText) {
    try {
      const pending = await db.execute(sql`
        SELECT razorpay_order_id, razorpay_payment_id, payment_method, billing_snapshot
        FROM pending_orders
        WHERE finalized_order_id = ${orderText}
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      const p = (pending as unknown as Record<string, unknown>[])[0];
      if (p) {
        if (!billing || discountTotalFromBilling(billing) <= 0) {
          const pendingBilling = readRecord(p.billing_snapshot ?? p.billingSnapshot);
          if (pendingBilling) billing = pendingBilling;
        }
        razorpayOrderId =
          p.razorpay_order_id != null ? String(p.razorpay_order_id) : null;
        razorpayPaymentId =
          p.razorpay_payment_id != null ? String(p.razorpay_payment_id) : null;
        if (!pgName && p.payment_method != null) {
          pgName = String(p.payment_method);
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const pe = await db.execute(sql`
        SELECT razorpay_order_id, razorpay_payment_id, payload, source
        FROM payment_events
        WHERE order_id = ${orderText}
          AND razorpay_payment_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const e = (pe as unknown as Record<string, unknown>[])[0];
      if (e) {
        razorpayOrderId =
          razorpayOrderId ??
          (e.razorpay_order_id != null ? String(e.razorpay_order_id) : null);
        razorpayPaymentId =
          razorpayPaymentId ??
          (e.razorpay_payment_id != null ? String(e.razorpay_payment_id) : null);
        if (!pgName) {
          const payload = readRecord(e.payload);
          const method =
            payload?.method ??
            payload?.payment_method ??
            (payload?.payment && typeof payload.payment === "object"
              ? (payload.payment as Record<string, unknown>).method
              : null);
          pgName =
            (method != null ? String(method) : null) ??
            (e.source != null ? String(e.source) : null);
        }
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const tl = await db.execute(sql`
      SELECT metadata
      FROM order_timelines
      WHERE order_id = ${orderCoreId}
        AND metadata IS NOT NULL
      ORDER BY occurred_at DESC
      LIMIT 5
    `);
    for (const row of tl as unknown as { metadata?: unknown }[]) {
      const meta = readRecord(row.metadata);
      if (!meta) continue;
      razorpayOrderId =
        razorpayOrderId ??
        (typeof meta.razorpay_order_id === "string" ? meta.razorpay_order_id : null);
      razorpayPaymentId =
        razorpayPaymentId ??
        (typeof meta.razorpay_payment_id === "string" ? meta.razorpay_payment_id : null);
      if (razorpayOrderId && razorpayPaymentId) break;
    }
  } catch {
    /* ignore */
  }

  const totalAmount =
    asNum(core.grand_total) ??
    asNum(billing?.final_amount) ??
    input.grandTotal ??
    null;

  const deliveryFee = resolveDeliveryFee(billing, core, settlementDelivery);

  let merchantItemSubtotal =
    orderCoreId > 0
      ? await merchantGrossFromCommissionSnapshots(
          orderCoreId,
          input.merchantStoreId,
          billing,
          core
        )
      : null;
  if (merchantItemSubtotal == null || merchantItemSubtotal <= 0) {
    merchantItemSubtotal = merchantGrossFromBilling(billing, core);
  }

  const totalCtm = await resolveTotalCtm(
    input.merchantStoreId,
    core,
    billing,
    orderCoreId
  );

  const totalRefunded =
    asNum(core.total_refunded) ?? null;
  const totalPaid = asNum(core.total_paid) ?? totalAmount;

  const paymentStatus =
    (core.payment_status != null ? String(core.payment_status) : null) ??
    input.paymentStatus ??
    "—";

  const paymentMode =
    (core.payment_method != null ? String(core.payment_method) : null) ??
    input.paymentMethod;

  if (!pgName) {
    pgName = razorpayPaymentId ? "razorpay" : paymentMode;
  }

  const isRefunded =
    paymentStatus.toLowerCase().includes("refund") ||
    (totalRefunded != null && totalRefunded > 0);

  const partialRefunded =
    isRefunded &&
    totalRefunded != null &&
    totalAmount != null &&
    totalRefunded > 0 &&
    totalRefunded < totalAmount - 0.01;

  const coupon = extractCouponMeta(billing);
  const cashbackEarned = cashbackFromBilling(billing);
  let discountSummary = orderDiscountGrantedSummaryFromBilling(billing);
  if (discountSummary.amount == null) {
    discountSummary = await fetchDiscountFromOrderTables({
      orderCoreId,
      orderIdText: input.orderIdText,
      formattedOrderId: input.formattedOrderId,
    });
  }

  const records = buildPaymentLineRecords({
    paymentIdLabel,
    transactionId: razorpayPaymentId,
    mpTransactionId: razorpayOrderId,
    paymentStatus,
    redemptionType:
      (core.order_source != null ? String(core.order_source) : null) ??
      input.orderSource,
    orderType: input.orderType,
    refunded: isRefunded && !partialRefunded,
    partialRefunded,
    partialRefundedAmount:
      totalRefunded != null && totalRefunded > 0 ? round2(totalRefunded) : null,
    billing,
    core,
    merchantItemSubtotal: merchantItemSubtotal > 0 ? merchantItemSubtotal : null,
    merchantTotal: totalCtm,
    deliveryFeeTotal: deliveryFee,
    cashbackEarned,
    pgName,
    pgTransactionId: razorpayPaymentId,
    paymentMode,
    coupon,
  });

  return {
    totalAmount: totalAmount != null ? round2(totalAmount) : null,
    totalCtm,
    totalCashbackEarned: cashbackEarned,
    totalDiscountGranted: discountSummary.amount,
    discountOfferSource: discountSummary.offerSource,
    deliveryFee,
    source:
      (core.order_source != null ? String(core.order_source) : null) ??
      input.orderSource,
    paymentMode,
    partialRefunded,
    refundAmount: totalRefunded != null && totalRefunded > 0 ? round2(totalRefunded) : null,
    totalRefunded: totalRefunded != null ? round2(totalRefunded) : null,
    totalPaid: totalPaid != null ? round2(totalPaid) : null,
    records,
  };
}
