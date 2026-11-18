/**
 * Person Ride settlement RECOVERY (safety net), run with the online-QR reconciler.
 *
 * A ride's payment is committed first (so both apps flip to "paid" at once) and
 * the rider's settlement is posted right after. If that second step fails (DB
 * blip, deploy restart) the rider would be paid nothing and nothing retried it —
 * the old code logged a warning and moved on. This pass finds paid, delivered
 * rides with no settlement and posts it through the same idempotent engine.
 *
 *   - QR-paid rides            → ensureRideQrSettlement (wallet credit = R)
 *   - free (offer) rides        → settleZeroBillRide (wallet credit = R, company-funded)
 *   - everything else is reported, never guessed at.
 *
 * Also retries refunds of QR payments captured after the ride was already
 * settled another way (late captures) that failed to refund the first time.
 */
import { getSql } from "../db/client.js";

const MIN_AGE = "1 minute";
const LOOKBACK = "14 days";

export async function reconcileUnsettledRidesOnce(): Promise<{ checked: number; settled: number }> {
  const sql = getSql();
  const rows = await sql<
    Array<{
      id: string | number;
      order_id: string | null;
      rider_id: number;
      grand_total: string | null;
      paid_by: string | null;
      has_qr_payment: boolean;
    }>
  >`
    SELECT c.id, c.order_id, c.rider_id, c.grand_total,
           c.billing_snapshot->>'ride_fare_paid_by' AS paid_by,
           EXISTS (
             SELECT 1 FROM orders_core_payments p
             WHERE p.order_id = c.order_id
               AND p.payment_method = 'upi_qr'
               AND p.payment_status = 'PAID'
               AND p.gateway_response->>'source' = 'ride_online_qr'
           ) AS has_qr_payment
    FROM orders_core c
    JOIN orders_ride r ON r.order_id = c.id
    WHERE c.order_type = 'person_ride'
      AND c.status = 'delivered'
      AND c.rider_id IS NOT NULL
      AND lower(c.payment_status::text) IN ('completed', 'paid')
      AND r.settlement_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM ride_settlements s WHERE s.order_core_id = c.id)
      AND c.updated_at < now() - ${MIN_AGE}::interval
      AND c.updated_at > now() - ${LOOKBACK}::interval
    ORDER BY c.updated_at
    LIMIT 25
  `;
  if (rows.length === 0) return { checked: 0, settled: 0 };

  let settled = 0;
  for (const r of rows) {
    const orderCorePk = Number(r.id);
    try {
      if (r.has_qr_payment) {
        const { ensureRideQrSettlement } = await import("../modules/rides/ride-online-qr.service.js");
        const res = await ensureRideQrSettlement(orderCorePk);
        if (res === "settled") settled += 1;
        continue;
      }
      const free = r.paid_by === "offer" || !(Number(r.grand_total ?? 0) > 0);
      if (free) {
        const { settleZeroBillRide, hasLegacyRideDeliveryCredit } = await import(
          "../modules/rides/ride-zero-bill.service.js"
        );
        // Free rides from before this engine were credited by the legacy delivery
        // path — the engine's credit would dedupe on the same ref, but a fresh
        // settlement row would misstate history. Leave those as they are.
        if (await hasLegacyRideDeliveryCredit(orderCorePk, Number(r.rider_id))) continue;
        const res = await settleZeroBillRide(orderCorePk);
        if (!res.alreadySettled) settled += 1;
        continue;
      }
      console.warn(
        `[ride-settlement-recovery] paid ride ${r.order_id ?? orderCorePk} has no settlement and no QR payment — needs review`
      );
    } catch (err) {
      console.warn(
        `[ride-settlement-recovery] ride ${r.order_id ?? orderCorePk} failed:`,
        (err as Error)?.message ?? err
      );
    }
  }
  return { checked: rows.length, settled };
}

/** Retry refunds of late-captured QR payments whose first refund attempt failed. */
export async function retryLateCaptureRefundsOnce(): Promise<{ checked: number; refunded: number }> {
  const sql = getSql();
  const rows = await sql<
    Array<{ id: number; order_id: string; transaction_id: string; gateway_response: Record<string, unknown> | null }>
  >`
    SELECT id, order_id, transaction_id, gateway_response
    FROM orders_core_payments
    WHERE payment_method = 'upi_qr'
      AND payment_status = 'REFUND_PENDING'
      AND (gateway_response->>'lateCaptureAfterSettlement')::boolean IS TRUE
      AND COALESCE(gateway_response->>'refundId', '') = ''
      AND created_at > now() - interval '30 days'
    ORDER BY id
    LIMIT 10
  `;
  let refunded = 0;
  for (const r of rows) {
    const gr = r.gateway_response ?? {};
    const paymentId = String(gr.razorpayPaymentId ?? "").trim();
    if (!paymentId) continue;
    try {
      const { retryLateCaptureRefund } = await import("../modules/rides/ride-online-qr.service.js");
      const ok = await retryLateCaptureRefund({
        id: Number(r.id),
        orderId: r.order_id,
        qrId: r.transaction_id,
        razorpayPaymentId: paymentId,
        amountPaise: Math.round(Number(gr.amountPaise ?? 0)),
      });
      if (ok) refunded += 1;
    } catch (err) {
      console.warn(`[late-capture-refund] ${r.order_id} retry failed:`, (err as Error)?.message ?? err);
    }
  }
  return { checked: rows.length, refunded };
}
