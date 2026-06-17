import { getSql } from "../db/client.js";
import { isRiderEligibleForDeliveryWalletCredit } from "./rider-delivery-wallet-eligibility.js";
import { resolveOrderRiderPayoutAmount } from "./resolve-order-rider-payout.js";
import type { OrderRiderPayoutService } from "./resolve-order-rider-payout.js";
import { rideTripDistanceFromCheckoutMetadata, rideGeoFromCheckoutMetadata } from "./ride-address-display.js";
import { readRideRiderPayoutSnapshot } from "./ride-rider-payout-snapshot.js";

export type RiderOrderWalletServiceType = "food" | "parcel" | "person_ride";

export type CreditRiderOrderEarningInput = {
  ordersCoreId: number;
  riderId: number;
  orderType: RiderOrderWalletServiceType;
  deliveryFee?: number;
  tipAmount?: number;
  formattedOrderId?: string | null;
  orderIdText?: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBillingAmount(snapshot: unknown, keys: string[]): number {
  if (snapshot == null || typeof snapshot !== "object") return 0;
  const obj = snapshot as Record<string, unknown>;
  for (const key of keys) {
    const n = Number(obj[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Rider payout is delivery fee — never order grand total. */
export function resolveRiderDeliveryFeeFromCore(row: {
  riderEarning: unknown;
  fareAmount: unknown;
  billingSnapshot?: unknown;
}): number {
  const direct = Number(row.riderEarning);
  if (Number.isFinite(direct) && direct > 0) return round2(direct);

  const fromBilling = parseBillingAmount(row.billingSnapshot, [
    "delivery_fee",
    "final_delivery_fee",
    "deliveryFee",
    "finalDeliveryFee",
  ]);
  if (fromBilling > 0) return round2(fromBilling);

  const fare = Number(row.fareAmount);
  if (Number.isFinite(fare) && fare > 0) return round2(fare);

  return 0;
}

function deliveryRef(coreId: number): string {
  return `rider_earn:delivery:${coreId}`;
}

function tipRef(coreId: number): string {
  return `rider_earn:tip:${coreId}`;
}

async function ledgerRefExists(riderId: number, ref: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1 AS ok
    FROM wallet_ledger
    WHERE rider_id = ${riderId}
      AND ref = ${ref}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function readWalletBalance(riderId: number): Promise<number> {
  const sql = getSql();
  await sql`
    INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
    VALUES (${riderId}, 0, NOW())
    ON CONFLICT (rider_id) DO NOTHING
  `;
  const rows = await sql`
    SELECT COALESCE(total_balance, 0) AS bal
    FROM rider_wallet
    WHERE rider_id = ${riderId}
    LIMIT 1
  `;
  return round2(Number((rows[0] as { bal?: unknown })?.bal ?? 0));
}

async function readLedgerEarningTotal(riderId: number, coreId: number): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT COALESCE(SUM(amount::numeric), 0) AS total
    FROM wallet_ledger
    WHERE rider_id = ${riderId}
      AND ref IN (${deliveryRef(coreId)}, ${tipRef(coreId)})
  `;
  return round2(Number((rows[0] as { total?: unknown })?.total ?? 0));
}

async function syncRiderEarningOnOrderCore(coreId: number, total: number): Promise<void> {
  if (total <= 0) return;
  const sql = getSql();
  await sql`
    UPDATE orders_core
    SET
      rider_earning = ${total.toFixed(2)},
      updated_at = NOW()
    WHERE id = ${coreId}
      AND (rider_earning IS NULL OR rider_earning::numeric = 0)
  `;
}

async function insertEarning(input: {
  riderId: number;
  amount: number;
  balanceAfter: number;
  serviceType: RiderOrderWalletServiceType;
  ref: string;
  description: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO wallet_ledger (
      rider_id,
      entry_type,
      amount,
      balance,
      service_type,
      ref,
      ref_type,
      description,
      metadata,
      performed_by_type
    ) VALUES (
      ${input.riderId},
      'earning',
      ${input.amount.toFixed(2)},
      ${input.balanceAfter.toFixed(2)},
      ${input.serviceType},
      ${input.ref},
      'order',
      ${input.description},
      ${JSON.stringify(input.metadata)}::jsonb,
      'system'
    )
  `;
}

/**
 * Credit rider wallet when an order is delivered.
 * Writes to wallet_ledger (trigger syncs rider_wallet). Idempotent via ref keys.
 */
export async function creditRiderOrderEarningOnDelivered(
  input: CreditRiderOrderEarningInput
): Promise<{
  credited: boolean;
  deliveryCredited: boolean;
  tipCredited: boolean;
  error?: string;
}> {
  const coreId = Number(input.ordersCoreId);
  const riderId = Number(input.riderId);
  if (!Number.isFinite(coreId) || coreId <= 0 || !Number.isFinite(riderId) || riderId <= 0) {
    return { credited: false, deliveryCredited: false, tipCredited: false, error: "invalid_input" };
  }

  const sql = getSql();
  const eligibility = await isRiderEligibleForDeliveryWalletCredit(coreId, riderId, sql);
  if (!eligibility.eligible) {
    return {
      credited: false,
      deliveryCredited: false,
      tipCredited: false,
      error: eligibility.error,
    };
  }

  let deliveryFee = input.deliveryFee;
  let tipAmount = input.tipAmount;
  let orderIdText = input.orderIdText?.trim() || null;
  let displayId = input.formattedOrderId?.trim() || null;

  const rows = await sql`
    SELECT
      c.order_id,
      c.formatted_order_id,
      c.order_type,
      c.rider_earning,
      c.fare_amount,
      c.tip_amount,
      c.billing_snapshot,
      c.pickup_lat,
      c.pickup_lon,
      c.drop_lat,
      c.drop_lon,
      c.distance_km,
      c.checkout_metadata,
      r.ride_type,
      r.pickup_wait_seconds
    FROM orders_core c
    LEFT JOIN orders_ride r ON r.order_id = c.id
    WHERE c.id = ${coreId}
    LIMIT 1
  `;
  const row = rows[0] as {
    order_id?: string | null;
    formatted_order_id?: string | null;
    order_type?: string | null;
    rider_earning?: unknown;
    fare_amount?: unknown;
    tip_amount?: unknown;
    billing_snapshot?: unknown;
    pickup_lat?: unknown;
    pickup_lon?: unknown;
    drop_lat?: unknown;
    drop_lon?: unknown;
    distance_km?: unknown;
    checkout_metadata?: unknown;
    ride_type?: string | null;
    pickup_wait_seconds?: number | null;
  } | undefined;

  if (!row) {
    return { credited: false, deliveryCredited: false, tipCredited: false, error: "order_not_found" };
  }

  orderIdText = orderIdText || row.order_id?.trim() || String(coreId);
  displayId = displayId || row.formatted_order_id?.trim() || orderIdText;

  if (deliveryFee == null) {
    const orderType = String(row.order_type ?? input.orderType);
    const payoutService: OrderRiderPayoutService =
      orderType === "person_ride" ? "ride" : orderType === "parcel" ? "parcel" : "food";

    if (orderType === "person_ride" || orderType === "food") {
      const acceptSnap = readRideRiderPayoutSnapshot(row.billing_snapshot);
      if (acceptSnap != null && acceptSnap.totalEarning > 0) {
        const snapTip = Number(row.tip_amount);
        const tipRounded =
          Number.isFinite(snapTip) && snapTip > 0 ? round2(snapTip) : 0;
        deliveryFee = round2(Math.max(0, acceptSnap.totalEarning - tipRounded));
      }
    }

    if (deliveryFee == null || deliveryFee <= 0) {
      const tripKmFromBooking = rideTripDistanceFromCheckoutMetadata(row.checkout_metadata);
      const tripKmCore = Number(row.distance_km);
      const tripKm =
        tripKmFromBooking ??
        (Number.isFinite(tripKmCore) && tripKmCore > 0 ? tripKmCore : undefined);
      const waitSec = Number(row.pickup_wait_seconds);
      const waitingMinutes =
        Number.isFinite(waitSec) && waitSec > 0 ? Math.max(0, Math.round(waitSec / 60)) : 0;
      const rideGeo =
        payoutService === "ride" ? rideGeoFromCheckoutMetadata(row.checkout_metadata) : {};
      const geoPayout = await resolveOrderRiderPayoutAmount({
        service: payoutService,
        pickupLat: Number(row.pickup_lat),
        pickupLng: Number(row.pickup_lon),
        dropLat: Number(row.drop_lat),
        dropLng: Number(row.drop_lon),
        dropKm: tripKm,
        riderId,
        rideCatalogCode: row.ride_type,
        waitingMinutes: payoutService === "ride" ? waitingMinutes : undefined,
        pincode: rideGeo.pickupPincode,
        state: rideGeo.pickupState,
      });
      if (geoPayout != null && geoPayout > 0) {
        deliveryFee = geoPayout;
      } else {
        deliveryFee = resolveRiderDeliveryFeeFromCore({
          riderEarning: row.rider_earning,
          fareAmount: row.fare_amount,
          billingSnapshot: row.billing_snapshot,
        });
      }
    }
  }
  if (tipAmount == null) {
    const tip = Number(row.tip_amount);
    tipAmount = Number.isFinite(tip) && tip > 0 ? round2(tip) : 0;
  }

  deliveryFee = round2(Math.max(0, Number(deliveryFee ?? 0)));
  tipAmount = round2(Math.max(0, Number(tipAmount ?? 0)));
  displayId = displayId || orderIdText || String(coreId);

  const serviceType = input.orderType;
  const baseMeta = {
    ordersCoreId: coreId,
    orderIdText,
    displayId,
    orderPublicId: displayId,
    serviceType,
    source: "order_delivered",
  };

  let deliveryCredited = false;
  let tipCredited = false;

  if (deliveryFee <= 0 && tipAmount <= 0) {
    return { credited: false, deliveryCredited: false, tipCredited: false, error: "zero_earning" };
  }

  try {
    if (deliveryFee > 0) {
      const ref = deliveryRef(coreId);
      if (!(await ledgerRefExists(riderId, ref))) {
        const balanceAfter = round2((await readWalletBalance(riderId)) + deliveryFee);
        await insertEarning({
          riderId,
          amount: deliveryFee,
          balanceAfter,
          serviceType,
          ref,
          description: `Delivery earning — Order #${displayId}`,
          metadata: { ...baseMeta, component: "delivery" },
        });
      }
      deliveryCredited = true;
    }

    if (tipAmount > 0) {
      const ref = tipRef(coreId);
      if (!(await ledgerRefExists(riderId, ref))) {
        const balanceAfter = round2((await readWalletBalance(riderId)) + tipAmount);
        await insertEarning({
          riderId,
          amount: tipAmount,
          balanceAfter,
          serviceType,
          ref,
          description: `Customer tip — Order #${displayId}`,
          metadata: { ...baseMeta, component: "tip" },
        });
      }
      tipCredited = true;
    }

    const totalRiderEarning = round2(deliveryFee + tipAmount);
    const ledgerTotal = await readLedgerEarningTotal(riderId, coreId);
    const earningToSync = ledgerTotal > 0 ? ledgerTotal : totalRiderEarning;
    if (earningToSync > 0) {
      await syncRiderEarningOnOrderCore(coreId, earningToSync);
    }

    if (deliveryCredited || tipCredited) {
      const { touchRiderIncomeTimestamp } = await import("./rider-subscription-wallet.js");
      await touchRiderIncomeTimestamp(riderId);
    }

    return { credited: true, deliveryCredited, tipCredited };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return { credited: true, deliveryCredited: true, tipCredited: tipAmount > 0 };
    }
    console.warn("[creditRiderOrderEarningOnDelivered]", coreId, msg);
    return { credited: false, deliveryCredited, tipCredited, error: msg };
  }
}
