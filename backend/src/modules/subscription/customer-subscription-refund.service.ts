/**
 * Revoke GMitra Plus when an order-embedded membership fee is refunded.
 * Idempotent: safe for webhook retries and reconciliation replays.
 */

import type { Sql } from "postgres";
import { eq } from "drizzle-orm";
import { getSql, getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import {
  evaluateMembershipRefundAllocation,
  extractMembershipChargeFromBillingSnapshot,
  isSubscriptionOptInTruthy,
  orderPurchasedMembershipOnCheckout,
  resolveCustomerPaidTotal,
  MONEY_EPS,
} from "../../lib/customer-subscription-refund-allocation.js";

const TERMINAL_STATUSES = new Set(["refunded", "revoked", "cancelled_refunded"]);

export type RevokeCustomerSubscriptionResult = {
  ok: boolean;
  revoked: boolean;
  idempotent: boolean;
  subscriptionId?: number;
  reason?: string;
};

async function syncCustomerGmitraPlusActiveFlag(
  sql: Sql,
  customerId: number
): Promise<void> {
  const rows = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM customer_subscriptions cs
      WHERE cs.customer_id = ${customerId}
        AND cs.status = 'active'
        AND cs.expires_at > NOW()
    ) AS has_active
  `;
  const hasActive = (rows[0] as { has_active?: boolean } | undefined)?.has_active === true;
  const db = getDb();
  await db
    .update(customers)
    .set({ gmitraPlusActive: hasActive })
    .where(eq(customers.id, customerId));
}

type OrderRefundContext = {
  orderCoreId: number;
  orderIdText: string | null;
  customerId: number;
  billingSnapshot: Record<string, unknown> | null;
  checkoutMetadata: Record<string, unknown> | null;
  customerPaidTotal: number;
  cumulativeRefunded: number;
  grandTotal: number | null;
  paymentStatus: string | null;
};

async function loadOrderRefundContext(
  orderCoreId: number,
  sql: Sql
): Promise<OrderRefundContext | null> {
  let rows: Record<string, unknown>[];
  try {
    rows = (await sql`
      SELECT
        oc.id,
        oc.order_id,
        oc.customer_id,
        oc.billing_snapshot,
        COALESCE(oc.checkout_metadata, po.checkout_metadata) AS checkout_metadata,
        oc.grand_total::text AS grand_total,
        oc.total_refunded::text AS total_refunded,
        LOWER(COALESCE(oc.payment_status::text, '')) AS payment_status
      FROM orders_core oc
      LEFT JOIN LATERAL (
        SELECT checkout_metadata
        FROM pending_orders po
        WHERE po.finalized_order_id = oc.order_id
        ORDER BY po.finalized_at DESC NULLS LAST, po.updated_at DESC NULLS LAST
        LIMIT 1
      ) po ON TRUE
      WHERE oc.id = ${orderCoreId}
      LIMIT 1
    `) as Record<string, unknown>[];
  } catch {
    rows = (await sql`
      SELECT
        oc.id,
        oc.order_id,
        oc.customer_id,
        oc.billing_snapshot,
        oc.checkout_metadata,
        oc.grand_total::text AS grand_total,
        NULL::text AS total_refunded,
        LOWER(COALESCE(oc.payment_status::text, '')) AS payment_status
      FROM orders_core oc
      WHERE oc.id = ${orderCoreId}
      LIMIT 1
    `) as Record<string, unknown>[];
  }

  const row = rows[0];
  if (!row) return null;

  const customerId = Number(row.customer_id);
  if (!Number.isFinite(customerId) || customerId <= 0) return null;

  const billingSnapshot =
    row.billing_snapshot && typeof row.billing_snapshot === "object"
      ? (row.billing_snapshot as Record<string, unknown>)
      : null;
  const checkoutMetadata =
    row.checkout_metadata && typeof row.checkout_metadata === "object"
      ? (row.checkout_metadata as Record<string, unknown>)
      : null;

  const cumulativeRefunded =
    row.total_refunded != null && Number.isFinite(Number(row.total_refunded))
      ? Number(row.total_refunded)
      : 0;
  const grandTotal =
    row.grand_total != null && Number.isFinite(Number(row.grand_total))
      ? Number(row.grand_total)
      : null;

  return {
    orderCoreId,
    orderIdText: row.order_id != null ? String(row.order_id) : null,
    customerId,
    billingSnapshot,
    checkoutMetadata,
    customerPaidTotal: resolveCustomerPaidTotal({
      billingSnapshot,
      fallbackGrandTotal: grandTotal,
    }),
    cumulativeRefunded,
    grandTotal,
    paymentStatus:
      row.payment_status != null ? String(row.payment_status).trim().toLowerCase() : null,
  };
}

async function findSubscriptionForOrder(
  ctx: OrderRefundContext,
  sql: Sql
): Promise<Record<string, unknown> | null> {
  const orderIdText = ctx.orderIdText?.trim();
  if (orderIdText) {
    const bySource = await sql`
      SELECT id, status, customer_id, amount_paid, source_order_id, refund_id
      FROM customer_subscriptions
      WHERE source_order_id = ${orderIdText}
        AND customer_id = ${ctx.customerId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (bySource.length > 0) return bySource[0] as Record<string, unknown>;
  }

  if (!orderIdText) return null;

  const byPayment = await sql`
    SELECT cs.id, cs.status, cs.customer_id, cs.amount_paid, cs.source_order_id, cs.refund_id
    FROM customer_subscriptions cs
    JOIN pending_orders po
      ON po.finalized_order_id = ${orderIdText}
     AND po.customer_id = ${ctx.customerId}
     AND (
       (cs.razorpay_payment_id IS NOT NULL AND cs.razorpay_payment_id = po.razorpay_payment_id)
       OR (cs.razorpay_order_id IS NOT NULL AND cs.razorpay_order_id = po.razorpay_order_id)
     )
    WHERE cs.customer_id = ${ctx.customerId}
      AND COALESCE(po.checkout_metadata->>'subscriptionOptIn', 'false') = 'true'
    ORDER BY cs.created_at DESC
    LIMIT 1
  `;
  if (byPayment.length > 0) {
    const sub = byPayment[0] as Record<string, unknown>;
    if (!sub.source_order_id) {
      await sql`
        UPDATE customer_subscriptions
        SET source_order_id = ${orderIdText},
            updated_at = NOW()
        WHERE id = ${Number(sub.id)}
          AND source_order_id IS NULL
      `;
      sub.source_order_id = orderIdText;
    }
    return sub;
  }

  if (!isSubscriptionOptInTruthy(ctx.checkoutMetadata)) return null;

  const membershipOnOrder = orderPurchasedMembershipOnCheckout({
    billingSnapshot: ctx.billingSnapshot,
    checkoutMetadata: ctx.checkoutMetadata,
  });
  if (!membershipOnOrder) return null;

  const byOptInWindow = await sql`
    SELECT cs.id, cs.status, cs.customer_id, cs.amount_paid, cs.source_order_id, cs.refund_id
    FROM customer_subscriptions cs
    JOIN orders_core oc ON oc.id = ${ctx.orderCoreId}
    WHERE cs.customer_id = ${ctx.customerId}
      AND cs.source_order_id IS NULL
      AND cs.created_at >= oc.placed_at - INTERVAL '2 minutes'
      AND cs.created_at <= oc.placed_at + INTERVAL '30 minutes'
    ORDER BY cs.created_at DESC
    LIMIT 1
  `;
  if (byOptInWindow.length > 0) {
    const sub = byOptInWindow[0] as Record<string, unknown>;
    await sql`
      UPDATE customer_subscriptions
      SET source_order_id = ${orderIdText},
          updated_at = NOW()
      WHERE id = ${Number(sub.id)}
        AND source_order_id IS NULL
    `;
    sub.source_order_id = orderIdText;
    return sub;
  }

  const byActiveWindow = await sql`
    SELECT cs.id, cs.status, cs.customer_id, cs.amount_paid, cs.source_order_id, cs.refund_id
    FROM customer_subscriptions cs
    JOIN orders_core oc ON oc.id = ${ctx.orderCoreId}
    WHERE cs.customer_id = ${ctx.customerId}
      AND cs.status = 'active'
      AND cs.created_at >= oc.placed_at - INTERVAL '5 minutes'
      AND cs.created_at <= oc.placed_at + INTERVAL '2 hours'
    ORDER BY cs.created_at DESC
    LIMIT 1
  `;
  if (byActiveWindow.length > 0) {
    const sub = byActiveWindow[0] as Record<string, unknown>;
    await sql`
      UPDATE customer_subscriptions
      SET source_order_id = ${orderIdText},
          updated_at = NOW()
      WHERE id = ${Number(sub.id)}
        AND source_order_id IS NULL
    `;
    sub.source_order_id = orderIdText;
    return sub;
  }

  return null;
}

/**
 * Revoke GMitra Plus subscriptions whose source order was fully refunded but
 * were not revoked during refund execution (repair path).
 */
export async function reconcileActiveSubscriptionsForRefundedOrders(
  customerId: number,
  sql: Sql = getSql()
): Promise<void> {
  const rows = await sql`
    SELECT DISTINCT ON (cs.id)
      cs.id AS subscription_id,
      oc.id AS order_core_id,
      COALESCE(
        (
          SELECT r.id
          FROM order_refunds r
          WHERE r.order_id = oc.id
            AND LOWER(COALESCE(r.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
            AND UPPER(COALESCE(r.execution_status, '')) IN ('COMPLETED', 'NOOP', 'PROCESSING')
          ORDER BY r.created_at DESC
          LIMIT 1
        ),
        0
      ) AS refund_id
    FROM customer_subscriptions cs
    INNER JOIN orders_core oc
      ON oc.customer_id = cs.customer_id
     AND (
       cs.source_order_id = oc.order_id
       OR (
         cs.source_order_id IS NULL
         AND cs.created_at >= oc.placed_at - INTERVAL '5 minutes'
         AND cs.created_at <= oc.placed_at + INTERVAL '2 hours'
       )
     )
    WHERE cs.customer_id = ${customerId}
      AND cs.status = 'active'
      AND (
        LOWER(COALESCE(oc.payment_status::text, '')) = 'refunded'
        OR EXISTS (
          SELECT 1
          FROM order_cancellation_reasons ocr
          WHERE ocr.order_id = oc.id
            AND LOWER(COALESCE(ocr.refund_status::text, '')) = 'completed'
        )
      )
    ORDER BY cs.id, oc.placed_at DESC
    LIMIT 10
  `;

  for (const raw of rows) {
    const row = raw as {
      subscription_id: number;
      order_core_id: number;
      refund_id: number;
    };
    await maybeRevokeCustomerSubscriptionOnOrderRefundCompleted(
      {
        orderCoreId: Number(row.order_core_id),
        refundId: Number(row.refund_id) > 0 ? Number(row.refund_id) : 0,
      },
      sql
    );
  }
}

export async function revokeCustomerSubscriptionForOrderRefund(args: {
  subscriptionId: number;
  customerId: number;
  refundId: number;
  refundedAmount: number;
  sourceOrderId: string;
  reason: string;
  sql?: Sql;
}): Promise<RevokeCustomerSubscriptionResult> {
  const sql = args.sql ?? getSql();
  const subscriptionId = Number(args.subscriptionId);
  const refundId = Number(args.refundId);

  const existing = await sql`
    SELECT id, status, refund_id
    FROM customer_subscriptions
    WHERE id = ${subscriptionId}
      AND customer_id = ${args.customerId}
    LIMIT 1
  `;
  const row = existing[0] as { id: number; status: string; refund_id: number | null } | undefined;
  if (!row) return { ok: false, revoked: false, idempotent: false, reason: "subscription_not_found" };

  if (TERMINAL_STATUSES.has(String(row.status))) {
    return {
      ok: true,
      revoked: false,
      idempotent: true,
      subscriptionId,
      reason: "already_revoked",
    };
  }

  const refundedAmount =
    Number.isFinite(Number(args.refundedAmount)) && Number(args.refundedAmount) > 0
      ? Math.round(Number(args.refundedAmount) * 100) / 100
      : 0;

  const updated =
    refundedAmount > 0
      ? await sql`
          UPDATE customer_subscriptions
          SET status = 'refunded',
              refund_id = COALESCE(NULLIF(${refundId}, 0), refund_id),
              refunded_amount = ${String(refundedAmount)}::numeric,
              refunded_at = NOW(),
              revoke_reason = ${args.reason},
              source_order_id = COALESCE(source_order_id, ${args.sourceOrderId}),
              updated_at = NOW()
          WHERE id = ${subscriptionId}
            AND customer_id = ${args.customerId}
            AND status NOT IN ('refunded', 'revoked', 'cancelled_refunded')
          RETURNING id
        `
      : await sql`
          UPDATE customer_subscriptions
          SET status = 'refunded',
              refund_id = COALESCE(NULLIF(${refundId}, 0), refund_id),
              refunded_at = NOW(),
              revoke_reason = ${args.reason},
              source_order_id = COALESCE(source_order_id, ${args.sourceOrderId}),
              updated_at = NOW()
          WHERE id = ${subscriptionId}
            AND customer_id = ${args.customerId}
            AND status NOT IN ('refunded', 'revoked', 'cancelled_refunded')
          RETURNING id
        `;

  if (updated.length === 0) {
    return {
      ok: true,
      revoked: false,
      idempotent: true,
      subscriptionId,
      reason: "already_revoked_race",
    };
  }

  await syncCustomerGmitraPlusActiveFlag(sql, args.customerId);

  return {
    ok: true,
    revoked: true,
    idempotent: false,
    subscriptionId,
    reason: args.reason,
  };
}

/**
 * Called once when an order refund reaches completed state.
 * Uses billing_snapshot allocation — partial food refunds do not revoke membership.
 */
export async function maybeRevokeCustomerSubscriptionOnOrderRefundCompleted(
  args: { orderCoreId: number; refundId: number; refundAmount?: number | null },
  sql: Sql = getSql()
): Promise<RevokeCustomerSubscriptionResult> {
  const ctx = await loadOrderRefundContext(args.orderCoreId, sql);
  if (!ctx?.orderIdText) {
    return { ok: true, revoked: false, idempotent: true, reason: "order_not_found" };
  }

  if (
    !orderPurchasedMembershipOnCheckout({
      billingSnapshot: ctx.billingSnapshot,
      checkoutMetadata: ctx.checkoutMetadata,
    })
  ) {
    return {
      ok: true,
      revoked: false,
      idempotent: true,
      reason: "no_membership_purchase_on_order",
    };
  }

  let refundRowAmount = 0;
  let refundRowCompleted = false;
  const refundId = Number(args.refundId);
  if (Number.isFinite(refundId) && refundId > 0) {
    const refundRows = await sql`
      SELECT refund_amount::text, execution_status, refund_status
      FROM order_refunds
      WHERE id = ${refundId}
        AND order_id = ${args.orderCoreId}
      LIMIT 1
    `;
    const rr = refundRows[0] as
      | { refund_amount?: string; execution_status?: string; refund_status?: string }
      | undefined;
    if (rr) {
      refundRowAmount = Number(rr.refund_amount ?? 0);
      const exec = String(rr.execution_status ?? "").toUpperCase();
      const status = String(rr.refund_status ?? "").toLowerCase();
      refundRowCompleted =
        exec === "COMPLETED" || exec === "NOOP" || status === "completed";
    }
  }

  const passedRefundAmount =
    args.refundAmount != null && Number.isFinite(Number(args.refundAmount))
      ? Number(args.refundAmount)
      : 0;
  const effectiveRefunded = Math.max(
    ctx.cumulativeRefunded,
    refundRowCompleted ? Math.max(refundRowAmount, passedRefundAmount) : 0
  );

  const membershipFromSnapshot = extractMembershipChargeFromBillingSnapshot(ctx.billingSnapshot);
  let membershipChargeTotal = membershipFromSnapshot.total;

  const sub = await findSubscriptionForOrder(ctx, sql);
  if (membershipChargeTotal <= MONEY_EPS && sub) {
    const amountPaid = Number(sub.amount_paid);
    if (Number.isFinite(amountPaid) && amountPaid > MONEY_EPS) {
      membershipChargeTotal = amountPaid;
    }
  }

  const allocation = evaluateMembershipRefundAllocation({
    customerPaidTotal: ctx.customerPaidTotal,
    membershipChargeTotal,
    cumulativeRefunded: effectiveRefunded,
  });

  const orderFullyRefunded =
    ctx.paymentStatus === "refunded" ||
    (refundRowCompleted &&
      ctx.customerPaidTotal > MONEY_EPS &&
      Math.max(refundRowAmount, passedRefundAmount) + MONEY_EPS >= ctx.customerPaidTotal) ||
    (ctx.customerPaidTotal > MONEY_EPS &&
      effectiveRefunded + MONEY_EPS >= ctx.customerPaidTotal);

  if (!allocation.shouldRevokeMembership && !orderFullyRefunded) {
    return {
      ok: true,
      revoked: false,
      idempotent: true,
      reason: "membership_fee_not_refunded_yet",
    };
  }

  if (!sub) {
    return { ok: true, revoked: false, idempotent: true, reason: "no_linked_subscription" };
  }

  const status = String(sub.status ?? "");
  if (TERMINAL_STATUSES.has(status)) {
    return {
      ok: true,
      revoked: false,
      idempotent: true,
      subscriptionId: Number(sub.id),
      reason: "already_revoked",
    };
  }

  const revokeReason =
    allocation.shouldRevokeMembership && allocation.isFullOrderRefund
      ? "order_full_refund_including_membership"
      : allocation.shouldRevokeMembership
        ? "order_membership_fee_refund_allocation"
        : "order_refund_payment_status_reconcile";

  return revokeCustomerSubscriptionForOrderRefund({
    subscriptionId: Number(sub.id),
    customerId: ctx.customerId,
    refundId: args.refundId,
    refundedAmount: effectiveRefunded,
    sourceOrderId: ctx.orderIdText,
    reason: revokeReason,
    sql,
  });
}
