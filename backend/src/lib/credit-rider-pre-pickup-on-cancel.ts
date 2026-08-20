/**
 * Credit the rider's first-mile (pre-pickup) allowance when an order/ride is cancelled
 * through NO fault of the rider AFTER the rider had already reached the pickup point.
 *
 * The rider→pickup allowance is snapshotted on `orders_core.rider_pre_pickup_allowance`
 * at accept. On delivery it is folded into the delivery earning (credit-rider-order-on-
 * delivered). But if the order is cancelled before pickup — and it is not the rider's fault —
 * the rider still travelled the first mile and must be paid it. Most such trips are
 * company-funded (the default), so the customer's price is unaffected.
 *
 * Mirrors the proven earning path exactly: insert ONE wallet_ledger 'earning' row and let
 * the 0318 trigger credit rider_wallet (total_balance + earnings_<service>). Idempotent via a
 * unique ref. Best-effort — never throws to the cancellation flow.
 */
import type { Sql } from "postgres";

export type PrePickupCancelCreditResult = {
  credited: boolean;
  amount?: number;
  skipped?: string;
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Rider is at fault when the cancellation reason is attributed to RIDER, or a rider cancelled
 * with no non-rider attribution. In those cases the first-mile is forfeited. */
export function isRiderFaultCancellation(
  attribute: string | null | undefined,
  cancelledByType: string | null | undefined
): boolean {
  const attr = String(attribute ?? "").trim().toUpperCase();
  if (attr === "RIDER") return true;
  if (!attr && String(cancelledByType ?? "").trim().toLowerCase() === "rider") return true;
  return false;
}

function walletServiceKey(orderType: string): "food" | "parcel" | "person_ride" {
  const t = String(orderType ?? "").trim().toLowerCase();
  if (t === "person_ride" || t === "ride") return "person_ride";
  if (t === "parcel") return "parcel";
  return "food";
}

function prePickupCancelRef(orderCorePk: number, riderId: number): string {
  return `rider_prepickup_cancel:${orderCorePk}:${riderId}`;
}

/**
 * Best-effort: credit the pre-pickup allowance to the assigned rider when a non-rider-fault
 * cancellation happens after the rider reached pickup (and before pickup was completed).
 * Runs on the caller's `sql` so it is atomic with the cancellation bookkeeping.
 */
export async function maybeCreditRiderPrePickupOnCancel(
  sql: Sql,
  input: { orderCorePk: number; cancelledByType: string; attribute?: string | null }
): Promise<PrePickupCancelCreditResult> {
  try {
    if (isRiderFaultCancellation(input.attribute, input.cancelledByType)) {
      return { credited: false, skipped: "rider_fault" };
    }

    const rows = await sql<
      {
        rider_id: number | null;
        order_type: string | null;
        allowance: string | null;
        actual_pickup_time: string | null;
        reached_pickup_at: string | null;
        order_public_id: string | null;
      }[]
    >`
      SELECT
        oc.rider_id,
        oc.order_type,
        oc.rider_pre_pickup_allowance::text AS allowance,
        oc.actual_pickup_time::text          AS actual_pickup_time,
        COALESCE(f.rider_reached_pickup_at, p.rider_reached_pickup_at, r.rider_reached_pickup_at)::text
                                             AS reached_pickup_at,
        COALESCE(oc.formatted_order_id, oc.order_id) AS order_public_id
      FROM orders_core oc
      LEFT JOIN orders_food   f ON f.order_id = oc.id
      LEFT JOIN orders_parcel p ON p.order_id = oc.id
      LEFT JOIN orders_ride   r ON r.order_id = oc.id
      WHERE oc.id = ${input.orderCorePk}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { credited: false, skipped: "order_not_found" };

    const riderId = Number(row.rider_id ?? 0);
    if (!Number.isFinite(riderId) || riderId <= 0) return { credited: false, skipped: "no_rider" };
    if (!row.reached_pickup_at) return { credited: false, skipped: "not_reached_pickup" };
    // If pickup already completed, the delivery-credit path pays the first mile — don't double-pay.
    if (row.actual_pickup_time) return { credited: false, skipped: "already_picked_up" };

    const amount = round2(Math.max(0, Number(row.allowance ?? 0)));
    if (!(amount > 0)) return { credited: false, skipped: "no_allowance" };

    const ref = prePickupCancelRef(input.orderCorePk, riderId);
    const dup = await sql`SELECT 1 FROM wallet_ledger WHERE rider_id = ${riderId} AND ref = ${ref} LIMIT 1`;
    if (dup.length > 0) return { credited: false, skipped: "already_credited" };

    await sql`
      INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
      VALUES (${riderId}, 0, NOW())
      ON CONFLICT (rider_id) DO NOTHING
    `;
    const balRows = await sql<{ bal: string }[]>`
      SELECT COALESCE(total_balance, 0) AS bal FROM rider_wallet WHERE rider_id = ${riderId} LIMIT 1
    `;
    const balanceAfter = round2(Number(balRows[0]?.bal ?? 0) + amount);
    const service = walletServiceKey(row.order_type ?? "food");
    const publicId = row.order_public_id ?? String(input.orderCorePk);

    // entry_type 'earning' → 0318 trigger credits rider_wallet (total_balance + earnings_<service>).
    await sql`
      INSERT INTO wallet_ledger (
        rider_id, entry_type, amount, balance, service_type, ref, ref_type, description, metadata, performed_by_type
      ) VALUES (
        ${riderId}, 'earning', ${amount.toFixed(2)}, ${balanceAfter.toFixed(2)}, ${service}, ${ref}, 'order',
        ${`First-mile allowance (cancelled after arrival) — Order #${publicId}`},
        ${JSON.stringify({
          orderId: input.orderCorePk,
          orderPublicId: publicId,
          serviceType: service,
          reason: "pre_pickup_cancel_credit",
          cancelledByType: input.cancelledByType,
          attribute: input.attribute ?? null,
          funding: "company",
        })}::text::jsonb,
        'system'
      )
    `;

    return { credited: true, amount };
  } catch {
    return { credited: false, skipped: "error" };
  }
}
