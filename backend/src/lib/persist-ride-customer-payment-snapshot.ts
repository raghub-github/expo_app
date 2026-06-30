import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { rideCustomerPaymentSnapshots } from "../db/schema.js";
import type { BillingResult } from "../modules/billing/types.js";

export type RidePaymentSnapshotPhase = "booking" | "payment_quote" | "payment_confirmed";

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export type RidePaymentSnapshotInput = {
  orderCoreId: number;
  orderIdText: string;
  customerId?: number | null;
  phase: RidePaymentSnapshotPhase;
  billing: BillingResult;
  billingSnapshot?: Record<string, unknown> | null;
  rideContext?: {
    rideType?: string | null;
    pickupAddress?: string | null;
    dropAddress?: string | null;
    distanceKm?: number | null;
    waitingCharge?: number | null;
    tollCharge?: number | null;
  };
  offerContext?: {
    couponCode?: string | null;
    platformOfferId?: number | null;
    merchantOfferId?: number | null;
  };
  paymentContext?: {
    paymentMethod?: string | null;
    gatiCashApplied?: number;
    razorpayAmount?: number;
    amountPaid?: number;
    razorpayOrderId?: string | null;
    razorpayPaymentId?: string | null;
  };
  metadata?: Record<string, unknown>;
};

export async function insertRideCustomerPaymentSnapshot(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: RidePaymentSnapshotInput
): Promise<number | null> {
  const b = input.billing;
  const snap = input.billingSnapshot ?? {};
  const waiting =
    input.rideContext?.waitingCharge != null
      ? round2(input.rideContext.waitingCharge)
      : round2(num(snap.waiting_charge) || num(snap.waiting_charges));
  const toll =
    input.rideContext?.tollCharge != null
      ? round2(input.rideContext.tollCharge)
      : round2(num(snap.toll_charge) || num(snap.toll_charges));

  try {
    const [row] = await db
      .insert(rideCustomerPaymentSnapshots)
      .values({
        orderCoreId: input.orderCoreId,
        orderId: input.orderIdText,
        customerId: input.customerId ?? null,
        snapshotPhase: input.phase,
        rideType: input.rideContext?.rideType?.trim() || null,
        pickupAddress: input.rideContext?.pickupAddress?.trim() || null,
        dropAddress: input.rideContext?.dropAddress?.trim() || null,
        distanceKm:
          input.rideContext?.distanceKm != null
            ? String(round2(input.rideContext.distanceKm))
            : null,
        rideFare: String(round2(b.item_total)),
        addonTotal: String(round2(b.addon_total)),
        platformFee: String(round2(b.platform_fee)),
        convenienceFee: String(round2(b.convenience_fee)),
        deliveryFee: String(round2(b.delivery_fee)),
        packagingFee: String(round2(b.packaging_fee)),
        surgeFee: String(round2(b.surge_fee)),
        smallOrderFee: String(round2(b.small_order_fee)),
        miscFee: String(round2(b.misc_fee)),
        taxTotal: String(round2(b.tax_total)),
        tipAmount: String(round2(b.tip_amount)),
        donationAmount: String(round2(b.donation_amount)),
        waitingCharge: String(waiting),
        tollCharge: String(toll),
        discountTotal: String(round2(b.discount_total)),
        payableTotal: String(round2(b.final_amount)),
        gatiCashApplied: String(round2(input.paymentContext?.gatiCashApplied ?? 0)),
        razorpayAmount: String(round2(input.paymentContext?.razorpayAmount ?? 0)),
        amountPaid:
          input.paymentContext?.amountPaid != null
            ? String(round2(input.paymentContext.amountPaid))
            : null,
        couponCode: input.offerContext?.couponCode?.trim() || null,
        platformOfferId: input.offerContext?.platformOfferId ?? null,
        merchantOfferId: input.offerContext?.merchantOfferId ?? null,
        paymentMethod: input.paymentContext?.paymentMethod?.trim() || null,
        razorpayOrderId: input.paymentContext?.razorpayOrderId?.trim() || null,
        razorpayPaymentId: input.paymentContext?.razorpayPaymentId?.trim() || null,
        billingRulesetVersion: b.ruleset_version,
        billingSnapshot: { ...snap, final_amount: b.final_amount },
        charges: b.charges,
        discounts: b.discounts,
        taxes: b.taxes,
        breakdownSteps: b.breakdown_steps,
        gstComponents: b.gst_components,
        metadata: input.metadata ?? {},
      })
      .returning({ id: rideCustomerPaymentSnapshots.id });

    return row?.id ?? null;
  } catch (err) {
    console.warn("[insertRideCustomerPaymentSnapshot] failed:", err);
    return null;
  }
}
