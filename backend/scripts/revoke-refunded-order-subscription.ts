/**
 * Revoke GMitra Plus for a customer's last refunded order that included membership.
 * Usage: npx tsx scripts/revoke-refunded-order-subscription.ts GM100001
 */
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";
import { maybeRevokeCustomerSubscriptionOnOrderRefundCompleted } from "../src/modules/subscription/customer-subscription-refund.service.js";
import { syncOrderRefundCompletionMarkers } from "../src/lib/order-refund-completion-sync.js";

loadEnv();
const customerCode = process.argv[2]?.trim() || "GM100001";
const sql = postgres(getEnv().DATABASE_URL, { max: 1 });

async function main() {
  const custRows = await sql`
    SELECT id, customer_id, gmitra_plus_active
    FROM customers
    WHERE customer_id = ${customerCode}
    LIMIT 1
  `;
  const cust = custRows[0] as
    | { id: number; customer_id: string; gmitra_plus_active: boolean }
    | undefined;
  if (!cust) {
    console.log("Customer not found:", customerCode);
    return;
  }
  console.log("Before customer:", cust);

  const subs = await sql`
    SELECT id, status, source_order_id, amount_paid::text, created_at, revoke_reason
    FROM customer_subscriptions
    WHERE customer_id = ${cust.id}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log("Subscriptions:", subs);

  const orders = await sql`
    SELECT
      oc.id,
      oc.order_id,
      oc.payment_status,
      oc.total_refunded::text,
      oc.grand_total::text,
      oc.checkout_metadata->>'subscriptionOptIn' AS opt_in,
      oc.placed_at,
      (
        SELECT r.id
        FROM order_refunds r
        WHERE r.order_id = oc.id
        ORDER BY r.created_at DESC
        LIMIT 1
      ) AS refund_id,
      (
        SELECT r.refund_status
        FROM order_refunds r
        WHERE r.order_id = oc.id
        ORDER BY r.created_at DESC
        LIMIT 1
      ) AS refund_status,
      (
        SELECT r.execution_status
        FROM order_refunds r
        WHERE r.order_id = oc.id
        ORDER BY r.created_at DESC
        LIMIT 1
      ) AS exec_status
    FROM orders_core oc
    LEFT JOIN LATERAL (
      SELECT checkout_metadata, checkout_metadata->>'subscriptionOptIn' AS po_opt_in
      FROM pending_orders po
      WHERE po.finalized_order_id = oc.order_id
      ORDER BY po.finalized_at DESC NULLS LAST
      LIMIT 1
    ) po ON TRUE
    WHERE oc.customer_id = ${cust.id}
      AND (
        oc.checkout_metadata->>'subscriptionOptIn' = 'true'
        OR po.po_opt_in = 'true'
        OR oc.billing_snapshot::text ILIKE '%customer_subscription_checkout%'
      )
    ORDER BY oc.placed_at DESC NULLS LAST
    LIMIT 10
  `;
  console.log("Membership orders:", orders);

  const target = orders.find((o) => {
    const ps = String(o.payment_status ?? "").toLowerCase();
    const rs = String(o.refund_status ?? "").toLowerCase();
    const tr = Number(o.total_refunded ?? 0);
    const es = String(o.exec_status ?? "").toUpperCase();
    return (
      ps === "refunded" ||
      rs === "completed" ||
      tr > 0.005 ||
      es === "COMPLETED" ||
      es === "NOOP"
    );
  });

  if (!target) {
    console.log("No refunded membership order found — revoking latest active subscription if any");
    const active = await sql`
      UPDATE customer_subscriptions cs
      SET status = 'refunded',
          refunded_at = COALESCE(refunded_at, NOW()),
          revoke_reason = COALESCE(NULLIF(TRIM(revoke_reason), ''), 'manual_revoke_refunded_order'),
          updated_at = NOW()
      WHERE cs.customer_id = ${cust.id}
        AND cs.status = 'active'
      RETURNING id, source_order_id
    `;
    console.log("Direct revoke:", active);
  } else {
    const orderCoreId = Number(target.id);
    const refundId = Number(target.refund_id) || 0;
    console.log("Target:", target.order_id, { orderCoreId, refundId });

    if (refundId > 0) {
      await syncOrderRefundCompletionMarkers(
        { orderCoreId, refundId, kind: "completed" },
        sql
      );
    }

    const result = await maybeRevokeCustomerSubscriptionOnOrderRefundCompleted(
      { orderCoreId, refundId },
      sql
    );
    console.log("Revoke result:", result);

    if (!result.revoked && result.reason === "no_linked_subscription") {
      const direct = await sql`
        UPDATE customer_subscriptions cs
        SET status = 'refunded',
            refunded_at = COALESCE(refunded_at, NOW()),
            revoke_reason = 'manual_revoke_refunded_order_no_link',
            source_order_id = COALESCE(source_order_id, ${String(target.order_id)}),
            updated_at = NOW()
        WHERE cs.customer_id = ${cust.id}
          AND cs.status = 'active'
        RETURNING id
      `;
      console.log("Fallback direct revoke:", direct);
    }
  }

  await sql`
    UPDATE customers c
    SET gmitra_plus_active = EXISTS (
          SELECT 1 FROM customer_subscriptions cs
          WHERE cs.customer_id = c.id AND cs.status = 'active' AND cs.expires_at > NOW()
        ),
        updated_at = NOW()
    WHERE c.id = ${cust.id}
  `;

  const afterCust = await sql`
    SELECT customer_id, gmitra_plus_active FROM customers WHERE id = ${cust.id}
  `;
  const afterSubs = await sql`
    SELECT id, status, source_order_id, revoke_reason, refunded_at
    FROM customer_subscriptions
    WHERE customer_id = ${cust.id}
    ORDER BY created_at DESC
    LIMIT 3
  `;
  console.log("After customer:", afterCust[0]);
  console.log("After subscriptions:", afterSubs);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end());
