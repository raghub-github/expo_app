import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { ordersCore, ordersRide } from "../../db/schema.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { computeBillForRide } from "../billing/rideBilling.service.js";
import type { BillingResult } from "../billing/types.js";
import type { AppliedLine } from "../billing/types.js";
import { resolveInvoiceDiscounts } from "./ride-invoice-summary.js";
import {
  attachRideSurgeToSnapshot,
  resolveCustomerRideSurge,
} from "./pricing/rideSurgeResolver.js";
import { catalogCodeToPricingVehicle } from "../ride-state-config/catalogVehicleMap.js";
import { resolveRideStateIdFromCoords } from "../ride-state-config/rideStateConfig.repository.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function billNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function resolvePersistedWaitingCharge(snap: Record<string, unknown>): number {
  return Math.max(
    0,
    billNum(snap.waiting_charge),
    billNum(snap.pickup_waiting_charge),
    billNum(snap.waiting_charges),
    billNum(snap.waiting_fee)
  );
}

function chargesIncludeWaiting(charges: AppliedLine[]): boolean {
  return charges.some((row) => String(row.label ?? "").toLowerCase().includes("waiting"));
}

function asPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function trimmedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Coupon + platform offer persisted at booking — keep them on finalization recompute. */
function resolvePersistedRideOffer(input: {
  prevSnap: Record<string, unknown>;
  meta: Record<string, unknown>;
  couponCode?: string | null;
  platformOfferId?: number | null;
  forceNoAutoOffer?: boolean;
}): { couponCode: string | null; platformOfferId: number | null; forceNoAutoOffer: boolean } {
  const couponCode =
    input.couponCode?.trim() ||
    trimmedText(input.prevSnap.ride_fare_coupon_code) ||
    trimmedText(input.meta.couponCode) ||
    trimmedText(input.meta.ride_fare_coupon_code) ||
    null;
  const platformOfferId =
    input.forceNoAutoOffer === true && input.platformOfferId == null
      ? null
      : input.platformOfferId ??
        asPositiveInt(input.prevSnap.ride_fare_platform_offer_id) ??
        asPositiveInt(input.meta.selectedPlatformOfferId);
  const forceNoAutoOffer =
    input.forceNoAutoOffer === true ||
    (platformOfferId == null &&
      !couponCode &&
      input.platformOfferId == null &&
      (input.prevSnap.ride_fare_force_no_auto_offer === true ||
        input.meta.forceNoAutoOffer === true));
  return { couponCode, platformOfferId, forceNoAutoOffer };
}

function resolveRideBaseFare(order: {
  fareAmount: string | null;
  itemTotal: string | null;
  billingSnapshot: unknown;
}): number {
  const snap =
    order.billingSnapshot != null && typeof order.billingSnapshot === "object"
      ? (order.billingSnapshot as Record<string, unknown>)
      : {};
  const fromSnap =
    billNum(snap.ride_fare) ||
    billNum(snap.fare_amount) ||
    billNum(snap.item_total);
  if (fromSnap > 0) return Math.round(fromSnap * 100) / 100;
  const fromCore = billNum(order.fareAmount) || billNum(order.itemTotal);
  return fromCore > 0 ? Math.round(fromCore * 100) / 100 : 0;
}

function mergeBillingIntoSnapshot(
  billing: BillingResult,
  baseSnapshot: Record<string, unknown>,
  prevSnap: Record<string, unknown>,
  extras?: {
    pickupWaitingCharge?: number;
    pickupWaitSeconds?: number;
    /** Phase 3 — surge shares carried on the snapshot for settlement. */
    surge?: {
      total: number;
      customerShare: number;
      companyShare: number;
      applied?: unknown[];
    };
  }
): Record<string, unknown> {
  let charges: AppliedLine[] = [...(billing.charges ?? [])];
  const waiting = Math.max(
    0,
    extras?.pickupWaitingCharge ?? 0,
    resolvePersistedWaitingCharge(prevSnap)
  );
  let finalAmount = round2(billing.final_amount);

  if (waiting > 0) {
    const hasWaiting = chargesIncludeWaiting(charges);
    if (!hasWaiting) {
      charges.push({
        kind: "charge",
        label: "Waiting charges",
        amount: waiting,
      });
      finalAmount = round2(finalAmount + waiting);
    }
  }

  return {
    ...baseSnapshot,
    ride_fare: billing.item_total,
    fare_amount: billing.item_total,
    item_total: billing.item_total,
    items_net_after_discounts: billing.items_net_after_discounts,
    platform_fee: billing.platform_fee,
    convenience_fee: billing.convenience_fee,
    tax_total: billing.tax_total,
    discount_total: billing.discount_total,
    tip_amount: billing.tip_amount,
    charges,
    taxes: billing.taxes,
    discounts: billing.discounts,
    gst_components: billing.gst_components,
    ruleset_version: billing.ruleset_version,
    final_amount: finalAmount,
    ...(waiting > 0
      ? {
          waiting_charge: waiting,
          pickup_waiting_charge: waiting,
          pickup_wait_seconds: extras?.pickupWaitSeconds ?? prevSnap.pickup_wait_seconds,
        }
      : {}),
    ...(extras?.surge
      ? {
          surge_total: extras.surge.total,
          surge_customer_share: extras.surge.customerShare,
          surge_company_share: extras.surge.companyShare,
          applied_surges: extras.surge.applied ?? [],
        }
      : {
          surge_total: prevSnap.surge_total,
          surge_customer_share: prevSnap.surge_customer_share,
          surge_company_share: prevSnap.surge_company_share,
          applied_surges: prevSnap.applied_surges,
        }),
    ride_fare_coupon_code: prevSnap.ride_fare_coupon_code,
    ride_fare_platform_offer_id: (() => {
      if (Array.isArray(billing.discounts)) {
        for (const row of billing.discounts) {
          const id = Number(
            (row as { meta?: { platformOfferId?: unknown } })?.meta?.platformOfferId
          );
          if (Number.isFinite(id) && id > 0) return id;
        }
      }
      return prevSnap.ride_fare_platform_offer_id;
    })(),
    ride_fare_force_no_auto_offer:
      Number(billing.discount_total) < 0.005
        ? prevSnap.ride_fare_force_no_auto_offer === true
        : false,
    ride_fare_offer_discount: prevSnap.ride_fare_offer_discount,
    ride_fare_paid_at: prevSnap.ride_fare_paid_at,
    gatiCashAmount: prevSnap.gatiCashAmount,
  };
}

/** Recompute ride customer bill from billing rules + persist to orders_core (single source of truth). */
export async function syncRideCustomerBillingSnapshot(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderCorePk: number,
  opts?: {
    pickupWaitingCharge?: number;
    pickupWaitSeconds?: number;
    couponCode?: string | null;
    platformOfferId?: number | null;
    forceNoAutoOffer?: boolean;
    skipIfPaid?: boolean;
  }
): Promise<{ ok: true; finalAmount: number } | { ok: false }> {
  const [row] = await db
    .select({
      id: ordersCore.id,
      customerId: ordersCore.customerId,
      fareAmount: ordersCore.fareAmount,
      itemTotal: ordersCore.itemTotal,
      tipAmount: ordersCore.tipAmount,
      distanceKm: ordersCore.distanceKm,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      billingSnapshot: ordersCore.billingSnapshot,
      checkoutMetadata: ordersCore.checkoutMetadata,
      estimatedFare: ordersRide.estimatedFare,
      customerTipAmount: ordersRide.customerTipAmount,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row?.id) return { ok: false };

  const prevSnap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};

  if (opts?.skipIfPaid && typeof prevSnap.ride_fare_paid_at === "string") {
    return { ok: true, finalAmount: round2(billNum(prevSnap.final_amount)) };
  }

  const customerPk = row.customerId != null ? Number(row.customerId) : 0;
  if (!Number.isFinite(customerPk) || customerPk <= 0) return { ok: false };

  const rideFare = Math.max(
    0,
    billNum(prevSnap.ride_fare) ||
      billNum(prevSnap.fare_amount) ||
      billNum(prevSnap.item_total) ||
      billNum(row.estimatedFare) ||
      billNum(row.fareAmount) ||
      billNum(row.itemTotal)
  );
  if (rideFare <= 0) return { ok: false };

  const meta =
    row.checkoutMetadata != null && typeof row.checkoutMetadata === "object"
      ? (row.checkoutMetadata as Record<string, unknown>)
      : {};

  const tipAmount = Math.max(
    0,
    billNum(row.customerTipAmount) || billNum(row.tipAmount) || billNum(prevSnap.tip_amount)
  );

  const { couponCode, platformOfferId, forceNoAutoOffer } = resolvePersistedRideOffer({
    prevSnap,
    meta,
    couponCode: opts?.couponCode,
    platformOfferId: opts?.platformOfferId,
    forceNoAutoOffer: opts?.forceNoAutoOffer,
  });

  const billRes = await computeBillForRide(db, {
    customerId: customerPk,
    rideFare,
    distanceKm: billNum(row.distanceKm),
    pickupLat: billNum(row.pickupLat),
    pickupLng: billNum(row.pickupLon),
    dropLat: billNum(row.dropLat),
    dropLon: billNum(row.dropLon),
    tipAmount,
    couponCode,
    pickupPincode: typeof meta.pickupPincode === "string" ? meta.pickupPincode : null,
    pickupState: typeof meta.pickupState === "string" ? meta.pickupState : null,
    selectedPlatformOfferId: platformOfferId,
    forceNoAutoOffer,
    rideType: typeof meta.rideType === "string" ? meta.rideType : null,
    vehicleType: typeof meta.rideType === "string" ? meta.rideType : null,
    paymentMode:
      typeof row.paymentMethod === "string"
        ? row.paymentMethod
        : typeof meta.paymentMethod === "string"
          ? meta.paymentMethod
          : null,
    useCache: false,
  });

  if (!billRes.ok) return { ok: false };

  // Phase 3 — resolve surge shares so admin snapshot mirrors what settlement
  // will see. Silently degrades to previous snapshot values if we lack the
  // vehicle / state context (e.g. legacy orders without rideType metadata).
  let surgeExtras:
    | {
        total: number;
        customerShare: number;
        companyShare: number;
        applied: unknown[];
      }
    | undefined;
  const metaObj =
    row.checkoutMetadata != null && typeof row.checkoutMetadata === "object"
      ? (row.checkoutMetadata as Record<string, unknown>)
      : {};
  const rideType =
    typeof metaObj.rideType === "string" ? metaObj.rideType.trim() : "";
  const pricingVehicle = rideType ? catalogCodeToPricingVehicle(rideType) : null;
  if (pricingVehicle) {
    try {
      const stateId = await resolveRideStateIdFromCoords({
        pickupLat: billNum(row.pickupLat),
        pickupLng: billNum(row.pickupLon),
        pickupPincode:
          typeof metaObj.pickupPincode === "string" ? metaObj.pickupPincode : null,
        pickupState:
          typeof metaObj.pickupState === "string" ? metaObj.pickupState : null,
      });
      const surge = await resolveCustomerRideSurge({
        stateId,
        pricingVehicle,
        baseFareForPct: rideFare,
      });
      surgeExtras = {
        total: surge.surgeTotal,
        customerShare: surge.customerShareTotal,
        companyShare: surge.companyShareTotal,
        applied: surge.appliedSurges.map((a) => ({
          surge_id: a.surgeId,
          name: a.name,
          applied_amount: a.appliedAmount,
          funding_mode: a.fundingMode,
          customer_share_amount: a.customerShareAmount,
          company_share_amount: a.companyShareAmount,
        })),
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[ride-bill-sync] surge attachment skipped", err);
    }
  }

  const mergedSnapshot = mergeBillingIntoSnapshot(
    billRes.billing,
    billRes.snapshot,
    prevSnap,
    {
      pickupWaitingCharge: opts?.pickupWaitingCharge,
      pickupWaitSeconds: opts?.pickupWaitSeconds,
      surge: surgeExtras,
    }
  );
  const finalAmount = round2(billNum(mergedSnapshot.final_amount));

  await db
    .update(ordersCore)
    .set({
      grandTotal: String(finalAmount),
      fareAmount: String(round2(billRes.billing.item_total)),
      tipAmount: String(round2(tipAmount)),
      billingSnapshot: mergedSnapshot,
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, orderCorePk));

  if (opts?.pickupWaitingCharge != null && opts.pickupWaitingCharge > 0) {
    await db
      .update(ordersRide)
      .set({
        waitingCharges: String(round2(opts.pickupWaitingCharge)),
        finalFare: String(finalAmount),
        updatedAt: new Date(),
      })
      .where(eq(ordersRide.orderId, orderCorePk));
  } else {
    await db
      .update(ordersRide)
      .set({
        finalFare: String(finalAmount),
        updatedAt: new Date(),
      })
      .where(eq(ordersRide.orderId, orderCorePk));
  }

  return { ok: true, finalAmount };
}

export type RideBillForCustomerResult =
  | {
      ok: true;
      billing: BillingResult;
      snapshot: Record<string, unknown>;
      orderCoreId: number;
      orderIdText: string;
      customerId: number;
      pickupAddress: string | null;
      dropAddress: string | null;
      distanceKm: number;
      rideType: string | null;
      paymentMethod: string | null;
    }
  | { ok: false; code: string; message: string; statusCode?: number };

export async function computeRideBillForCustomerOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: {
    customerPk: number;
    orderRef: string;
    couponCode?: string | null;
    platformOfferId?: number | null;
    forceNoAutoOffer?: boolean;
  }
): Promise<RideBillForCustomerResult> {
  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      fareAmount: ordersCore.fareAmount,
      itemTotal: ordersCore.itemTotal,
      tipAmount: ordersCore.tipAmount,
      distanceKm: ordersCore.distanceKm,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      dropAddressRaw: ordersCore.dropAddressRaw,
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
      billingSnapshot: ordersCore.billingSnapshot,
      checkoutMetadata: ordersCore.checkoutMetadata,
    })
    .from(ordersCore)
    .where(customerOrderRefWhere(input.customerPk, input.orderRef))
    .limit(1);

  if (!orderRow?.id) {
    return { ok: false, code: "ORDER_NOT_FOUND", message: "Order not found", statusCode: 404 };
  }
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    return { ok: false, code: "NOT_RIDE_ORDER", message: "Not a ride order", statusCode: 400 };
  }

  const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (statusUpper !== "DELIVERED") {
    return {
      ok: false,
      code: "RIDE_NOT_DELIVERED",
      message: "Ride fare bill is available only after delivery",
      statusCode: 409,
    };
  }

  const rideFare = resolveRideBaseFare(orderRow);
  if (rideFare <= 0) {
    return { ok: false, code: "INVALID_FARE", message: "Ride fare is not available", statusCode: 400 };
  }

  const meta =
    orderRow.checkoutMetadata != null && typeof orderRow.checkoutMetadata === "object"
      ? (orderRow.checkoutMetadata as Record<string, unknown>)
      : {};

  const pickupLat = billNum(orderRow.pickupLat);
  const pickupLng = billNum(orderRow.pickupLon);
  const dropLat = billNum(orderRow.dropLat);
  const dropLon = billNum(orderRow.dropLon);
  const distanceKm = billNum(orderRow.distanceKm);
  const tipAmount = Math.max(0, billNum(orderRow.tipAmount));

  const prevSnap =
    orderRow.billingSnapshot != null && typeof orderRow.billingSnapshot === "object"
      ? (orderRow.billingSnapshot as Record<string, unknown>)
      : {};
  const { couponCode, platformOfferId, forceNoAutoOffer } = resolvePersistedRideOffer({
    prevSnap,
    meta,
    couponCode: input.couponCode,
    platformOfferId: input.platformOfferId,
    forceNoAutoOffer: input.forceNoAutoOffer,
  });

  const billRes = await computeBillForRide(db, {
    customerId: input.customerPk,
    rideFare,
    distanceKm,
    pickupLat,
    pickupLng,
    dropLat,
    dropLon,
    tipAmount,
    couponCode,
    pickupPincode:
      typeof meta.pickupPincode === "string" ? meta.pickupPincode : null,
    pickupState: typeof meta.pickupState === "string" ? meta.pickupState : null,
    selectedPlatformOfferId: platformOfferId,
    forceNoAutoOffer,
    rideType: typeof meta.rideType === "string" ? meta.rideType : null,
    vehicleType: typeof meta.rideType === "string" ? meta.rideType : null,
    paymentMode:
      typeof meta.paymentMethod === "string"
        ? meta.paymentMethod
        : orderRow.paymentMethod ?? null,
    useCache: false,
  });

  if (!billRes.ok) return billRes;

  const persistedWaiting = resolvePersistedWaitingCharge(prevSnap);
  if (persistedWaiting > 0.005) {
    const charges = [...(billRes.billing.charges ?? [])];
    if (!chargesIncludeWaiting(charges)) {
      charges.push({
        kind: "charge",
        label: "Waiting charges",
        amount: persistedWaiting,
      });
      billRes.billing = {
        ...billRes.billing,
        charges,
        final_amount: round2(Number(billRes.billing.final_amount) + persistedWaiting),
      };
    }
    billRes.snapshot = {
      ...billRes.snapshot,
      waiting_charge: persistedWaiting,
      pickup_waiting_charge: persistedWaiting,
    };
  }

  const paymentCompleted =
    String(orderRow.paymentStatus ?? "").toLowerCase() === "completed";
  if (paymentCompleted && orderRow.billingSnapshot != null) {
    const snap =
      typeof orderRow.billingSnapshot === "object"
        ? (orderRow.billingSnapshot as Record<string, unknown>)
        : {};
    const paidAt =
      typeof snap.ride_fare_paid_at === "string" && snap.ride_fare_paid_at.trim().length > 0;
    const persistedDiscounts = resolveInvoiceDiscounts(snap);
    if (persistedDiscounts.length > 0) {
      const persistedTotal = Math.round(
        persistedDiscounts.reduce((sum, row) => sum + row.amount, 0) * 100
      ) / 100;
      if (persistedTotal > billRes.billing.discount_total + 0.005) {
        billRes.billing.discounts = persistedDiscounts.map((row) => ({
          kind: "discount" as const,
          label: row.label,
          amount: row.amount,
        }));
        billRes.billing.discount_total = persistedTotal;
      }
    }
    const snapFinal = billNum(snap.final_amount);
    if (paidAt && snapFinal > 0) {
      billRes.billing.final_amount = snapFinal;
    }
  }

  const rideType =
    typeof meta.rideType === "string" ? meta.rideType.trim() || null : null;

  // Phase 3 — attach the surge funding split to the snapshot BEFORE it flows
  // into the settlement engine (billingToComponents reads
  // `surge_customer_share` / `surge_company_share` from the snapshot). The
  // customer bill is unaffected (finalFare already includes customer surge
  // from quote time); we're only recording who funds the rider's surge pass-
  // through so settlement debits the right party.
  const pricingVehicle = rideType ? catalogCodeToPricingVehicle(rideType) : null;
  if (pricingVehicle) {
    try {
      const stateId = await resolveRideStateIdFromCoords({
        pickupLat,
        pickupLng,
        pickupPincode:
          typeof meta.pickupPincode === "string" ? meta.pickupPincode : null,
        pickupState:
          typeof meta.pickupState === "string" ? meta.pickupState : null,
      });
      const surge = await resolveCustomerRideSurge({
        stateId,
        pricingVehicle,
        baseFareForPct: rideFare,
      });
      attachRideSurgeToSnapshot(billRes.snapshot, surge);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[ride-bill] surge attachment skipped", err);
    }
  }

  // Toll history total → snapshot (rider pass-through).
  try {
    const { sumRideTollAmount } = await import("./pricing/rideToll.service.js");
    const tollTotal = await sumRideTollAmount(orderRow.id);
    if (tollTotal > 0) {
      billRes.snapshot.toll_charge = tollTotal;
      billRes.snapshot.toll_charges = tollTotal;
      billRes.billing.final_amount = round2(
        Number(billRes.billing.final_amount) + tollTotal
      );
    }
  } catch (err) {
    console.warn("[ride-bill] toll attachment skipped", err);
  }

  // Night charge when an active geo config matches completion time.
  try {
    const { loadActiveNightConfig } = await import(
      "./pricing/rideNightConfig.repository.js"
    );
    const { computeNightCharge } = await import("./pricing/rideNightCharge.js");
    const stateHint =
      typeof meta.pickupState === "string" ? meta.pickupState : null;
    const nightCfg = await loadActiveNightConfig({
      geoLevel: "state",
      geoRefId: stateHint,
      stateRefId: stateHint,
    });
    if (nightCfg) {
      const night = computeNightCharge({
        at: new Date(),
        tripKm: distanceKm ?? 0,
        baseAmount: rideFare,
        config: nightCfg,
      });
      if (night.applicable && night.total > 0) {
        billRes.snapshot.night_charge = night.customerShare;
        billRes.snapshot.night_charge_total = night.total;
        billRes.snapshot.night_customer_share = night.customerShare;
        billRes.snapshot.night_company_share = night.companyShare;
        billRes.snapshot.night_funding_mode = night.fundingMode;
        if (night.customerShare > 0) {
          billRes.billing.final_amount = round2(
            Number(billRes.billing.final_amount) + night.customerShare
          );
        }
      }
    }
  } catch (err) {
    console.warn("[ride-bill] night attachment skipped", err);
  }

  return {
    ok: true,
    billing: billRes.billing,
    snapshot: billRes.snapshot,
    orderCoreId: orderRow.id,
    orderIdText: orderRow.orderId?.trim() || String(orderRow.id),
    customerId: input.customerPk,
    pickupAddress: orderRow.pickupAddressRaw ?? null,
    dropAddress: orderRow.dropAddressRaw ?? null,
    distanceKm,
    rideType,
    paymentMethod: orderRow.paymentMethod ?? null,
  };
}
