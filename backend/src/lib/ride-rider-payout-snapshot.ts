import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, ordersRide, riders } from "../db/schema.js";
import { resolveOrderRiderPayoutBreakdown } from "./resolve-order-rider-payout.js";
import {
  rideGeoFromCheckoutMetadata,
  rideTripDistanceFromCheckoutMetadata,
  roundRideTripDistanceKm,
} from "./ride-address-display.js";
import { haversineDistanceMeters } from "./order-assignment-engine.js";
import {
  computeCustomerPickupWaitingCharge,
  computeRiderPickupWaitingEarning,
  resolveRidePickupFreeWaitMinutes,
  resolveRidePickupWaitingChargePerMin,
} from "./ride-pickup-wait.js";
import { restoreCustomerDeliveryFieldsInSnapshot } from "./customer-delivery-fee.js";

export type RideRiderPayoutSnapshot = {
  baseEarning: number;
  waitingEarning: number;
  surgeEarning: number;
  appliedSurges: { name: string; amount: number }[];
  totalEarning: number;
  /** Frozen at accept — matches incoming offer modal. */
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  totalDistanceKm?: number;
  snapshottedAt: string;
};

function round0(n: number): number {
  return Math.round(n);
}

export function readRideRiderPayoutSnapshot(
  billingSnapshot: unknown
): RideRiderPayoutSnapshot | null {
  if (billingSnapshot == null || typeof billingSnapshot !== "object") return null;
  const snap = billingSnapshot as Record<string, unknown>;
  const raw = snap.rider_payout_snapshot;
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const total = Number(obj.totalEarning);
  if (!Number.isFinite(total) || total <= 0) return null;
  const surges = Array.isArray(obj.appliedSurges)
    ? obj.appliedSurges
        .map((s) => {
          if (s == null || typeof s !== "object") return null;
          const line = s as Record<string, unknown>;
          const name = String(line.name ?? "").trim();
          const amount = Number(line.amount);
          if (!name || !Number.isFinite(amount) || amount <= 0) return null;
          return { name, amount: round0(amount) };
        })
        .filter((x): x is { name: string; amount: number } => x != null)
    : [];
  const pickupDistanceKm = roundRideTripDistanceKm(Number(obj.pickupDistanceKm));
  const tripDistanceKm = roundRideTripDistanceKm(Number(obj.tripDistanceKm));
  const totalDistanceKm = roundRideTripDistanceKm(Number(obj.totalDistanceKm));
  return {
    baseEarning: round0(Number(obj.baseEarning) || 0),
    waitingEarning: round0(Number(obj.waitingEarning) || 0),
    surgeEarning: round0(Number(obj.surgeEarning) || 0),
    appliedSurges: surges,
    totalEarning: round0(total),
    pickupDistanceKm,
    tripDistanceKm,
    totalDistanceKm,
    snapshottedAt: String(obj.snapshottedAt ?? ""),
  };
}

export function isRideFarePaymentPending(paymentStatus: string | null | undefined): boolean {
  const ps = String(paymentStatus ?? "").trim().toLowerCase();
  return ps !== "paid" && ps !== "completed";
}

export function isRideFarePaymentSettled(paymentStatus: string | null | undefined): boolean {
  return !isRideFarePaymentPending(paymentStatus);
}

/** Rider wallet/ledger must not credit until customer pays or admin clears hold. */
export function isRideRiderWalletCreditBlocked(input: {
  paymentStatus?: string | null;
  adminRiderPaymentClearedAt?: Date | string | null;
}): boolean {
  if (
    input.adminRiderPaymentClearedAt != null &&
    String(input.adminRiderPaymentClearedAt).trim().length > 0
  ) {
    return false;
  }
  return isRideFarePaymentPending(input.paymentStatus);
}

type RideEarningDisplaySummary = {
  category?: string;
  status?: string;
  paymentStatus?: string | null;
  adminRiderPaymentClearedAt?: string | null;
  baseEarning?: number;
  totalEarning?: number;
  estimatedEarning?: number;
  customerTipAmount?: number;
  waitingEarning?: number;
  surgeEarning?: number;
  appliedSurges?: { name: string; amount: number }[];
};

/** Flag pending wallet credit; earnings remain visible for rider payment-wait UI. */
export function maskRideEarningsIfWalletCreditPending<T extends RideEarningDisplaySummary>(
  summary: T,
  ledgerTotal?: number | null
): T & { walletCreditPending?: boolean } {
  if (summary.category !== "ride" || summary.status !== "delivered") {
    return { ...summary, walletCreditPending: false };
  }
  const ledgerCredited = ledgerTotal != null && ledgerTotal > 0;
  if (ledgerCredited) {
    return { ...summary, walletCreditPending: false };
  }
  if (
    !isRideRiderWalletCreditBlocked({
      paymentStatus: summary.paymentStatus,
      adminRiderPaymentClearedAt: summary.adminRiderPaymentClearedAt,
    })
  ) {
    return { ...summary, walletCreditPending: false };
  }
  return {
    ...summary,
    walletCreditPending: true,
  };
}

function parseCoord(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type RideRiderPayoutSummaryInput = {
  baseEarning?: number | null;
  waitingEarning?: number | null;
  surgeEarning?: number | null;
  appliedSurges?: { name: string; amount: number }[] | null;
  totalEarning?: number | null;
  estimatedEarning?: number | null;
  customerTipAmount?: number | null;
  pickupDistanceKm?: number | null;
  tripDistanceKm?: number | null;
  totalDistanceKm?: number | null;
};

export function buildRideRiderPayoutSnapshotFromSummary(
  summary: RideRiderPayoutSummaryInput
): RideRiderPayoutSnapshot | null {
  const base = round0(Number(summary.baseEarning) || 0);
  const waiting = round0(Number(summary.waitingEarning) || 0);
  const surge = round0(Number(summary.surgeEarning) || 0);
  const tip = round0(Number(summary.customerTipAmount) || 0);
  const appliedSurges = (summary.appliedSurges ?? [])
    .map((line) => ({
      name: line.name.trim(),
      amount: round0(line.amount),
    }))
    .filter((line) => line.name.length > 0 && line.amount > 0);
  const coreTotal = round0(
    Number(summary.totalEarning) || Number(summary.estimatedEarning) || 0
  );
  const totalEarning =
    coreTotal > 0 ? coreTotal : round0(base + waiting + surge + tip);
  if (totalEarning <= 0) return null;

  const pickupDistanceKm = roundRideTripDistanceKm(Number(summary.pickupDistanceKm));
  const tripDistanceKm = roundRideTripDistanceKm(Number(summary.tripDistanceKm));
  const totalDistanceKm = roundRideTripDistanceKm(Number(summary.totalDistanceKm));

  return {
    baseEarning: base,
    waitingEarning: waiting,
    surgeEarning: surge,
    appliedSurges,
    totalEarning,
    pickupDistanceKm,
    tripDistanceKm,
    totalDistanceKm,
    snapshottedAt: new Date().toISOString(),
  };
}

function parseStandalonePayoutSnapshot(raw: unknown): RideRiderPayoutSnapshot | null {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const total = Number(obj.totalEarning);
  if (!Number.isFinite(total) || total <= 0) return null;
  const surges = Array.isArray(obj.appliedSurges)
    ? obj.appliedSurges
        .map((s) => {
          if (s == null || typeof s !== "object") return null;
          const line = s as Record<string, unknown>;
          const name = String(line.name ?? "").trim();
          const amount = Number(line.amount);
          if (!name || !Number.isFinite(amount) || amount <= 0) return null;
          return { name, amount: round0(amount) };
        })
        .filter((x): x is { name: string; amount: number } => x != null)
    : [];
  return {
    baseEarning: round0(Number(obj.baseEarning) || 0),
    waitingEarning: round0(Number(obj.waitingEarning) || 0),
    surgeEarning: round0(Number(obj.surgeEarning) || 0),
    appliedSurges: surges,
    totalEarning: round0(total),
    pickupDistanceKm: roundRideTripDistanceKm(Number(obj.pickupDistanceKm)),
    tripDistanceKm: roundRideTripDistanceKm(Number(obj.tripDistanceKm)),
    totalDistanceKm: roundRideTripDistanceKm(Number(obj.totalDistanceKm)),
    snapshottedAt: String(obj.snapshottedAt ?? ""),
  };
}

/** Merge accept-time surge (frozen) with live waiting from billing snapshot. */
export function resolveRideRiderPayoutForDisplay(args: {
  billingSnapshot?: unknown;
  acceptPayoutSnapshot?: unknown;
}): RideRiderPayoutSnapshot | null {
  const billing = readRideRiderPayoutSnapshot(args.billingSnapshot);
  const accept = parseStandalonePayoutSnapshot(args.acceptPayoutSnapshot);
  if (!billing && !accept) return null;
  if (!accept) return billing;
  if (!billing) return accept;

  const baseEarning = accept.baseEarning > 0 ? accept.baseEarning : billing.baseEarning;
  const surgeEarning = accept.surgeEarning > 0 ? accept.surgeEarning : billing.surgeEarning;
  const appliedSurges =
    accept.appliedSurges.length > 0 ? accept.appliedSurges : billing.appliedSurges;
  const waitingEarning = billing.waitingEarning;
  const tipResidual = Math.max(
    0,
    billing.totalEarning -
      billing.baseEarning -
      billing.waitingEarning -
      billing.surgeEarning
  );

  return {
    baseEarning,
    waitingEarning,
    surgeEarning,
    appliedSurges,
    totalEarning: round0(baseEarning + waitingEarning + surgeEarning + tipResidual),
    pickupDistanceKm: accept.pickupDistanceKm ?? billing.pickupDistanceKm,
    tripDistanceKm: accept.tripDistanceKm ?? billing.tripDistanceKm,
    totalDistanceKm: accept.totalDistanceKm ?? billing.totalDistanceKm,
    snapshottedAt: accept.snapshottedAt || billing.snapshottedAt,
  };
}

async function freezeAcceptPayoutSnapshotIfMissing(
  orderCorePk: number,
  snapshot: RideRiderPayoutSnapshot
): Promise<void> {
  const db = getDb();
  await db
    .update(ordersRide)
    .set({
      acceptPayoutSnapshot: snapshot,
      updatedAt: new Date(),
    })
    .where(
      and(eq(ordersRide.orderId, orderCorePk), isNull(ordersRide.acceptPayoutSnapshot))
    );
}

/** Generic despite the name — safe for any order type (the ordersRide join degrades to fareAmount fallback). */
export async function writeRideRiderPayoutSnapshot(
  orderCorePk: number,
  snapshot: RideRiderPayoutSnapshot,
  customerTipAmount: number,
  options?: { freezeAcceptSnapshot?: boolean }
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({
      billingSnapshot: ordersCore.billingSnapshot,
      fareAmount: ordersCore.fareAmount,
      estimatedFare: ordersRide.estimatedFare,
      finalFare: ordersRide.finalFare,
    })
    .from(ordersCore)
    .leftJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  const prevSnap =
    row?.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};

  const tip = round0(customerTipAmount);
  const riderPayout = Math.max(0, snapshot.totalEarning - tip);

  // Rider Fare Engine v3.0 ledger enrichment: record the customer fare the
  // payout was derived from, so platform revenue is auditable per order.
  const customerFare = Number(row?.finalFare ?? row?.estimatedFare ?? row?.fareAmount ?? 0);
  const ledgerExtra =
    Number.isFinite(customerFare) && customerFare > 0
      ? {
          customer_fare: customerFare,
          platform_revenue: round0(Math.max(0, customerFare - riderPayout)),
          rider_percentage_effective: Math.round((riderPayout / customerFare) * 10000) / 100,
        }
      : {};

  // Customer delivery_fee is immutable after checkout. Rider payout lives only in
  // rider_payout_snapshot / rider_earning — never overwrite delivery_fee.
  const snapWithCustomerFee = restoreCustomerDeliveryFieldsInSnapshot(
    prevSnap,
    riderPayout
  );

  await db
    .update(ordersCore)
    .set({
      riderEarning: String(riderPayout),
      billingSnapshot: {
        ...snapWithCustomerFee,
        rider_payout_snapshot: snapshot,
        ...ledgerExtra,
      },
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, orderCorePk));

  if (options?.freezeAcceptSnapshot) {
    await freezeAcceptPayoutSnapshotIfMissing(orderCorePk, snapshot);
  }
}

/** Freeze rider offer payout at accept — must match incoming-offer geo slab earnings. */
export async function persistRideRiderPayoutFromSummary(
  orderCorePk: number,
  summary: RideRiderPayoutSummaryInput
): Promise<RideRiderPayoutSnapshot | null> {
  const db = getDb();
  const [row] = await db
    .select({ billingSnapshot: ordersCore.billingSnapshot })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);
  if (!row) return null;

  const existing = readRideRiderPayoutSnapshot(row.billingSnapshot);
  if (existing) {
    await freezeAcceptPayoutSnapshotIfMissing(orderCorePk, existing);
    return existing;
  }

  const snapshot = buildRideRiderPayoutSnapshotFromSummary(summary);
  if (!snapshot) return null;

  const tip = round0(Number(summary.customerTipAmount) || 0);
  await writeRideRiderPayoutSnapshot(orderCorePk, snapshot, tip, {
    freezeAcceptSnapshot: true,
  });
  return snapshot;
}

/** Freeze rider offer payout at accept time — fallback when summary is unavailable. */
export async function persistRideRiderAcceptPayoutSnapshot(
  orderCorePk: number,
  riderId: number
): Promise<RideRiderPayoutSnapshot | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      distanceKm: ordersCore.distanceKm,
      checkoutMetadata: ordersCore.checkoutMetadata,
      billingSnapshot: ordersCore.billingSnapshot,
      fareAmount: ordersCore.fareAmount,
      rideType: ordersRide.rideType,
      customerTipAmount: ordersRide.customerTipAmount,
      acceptPayoutSnapshot: ordersRide.acceptPayoutSnapshot,
      estimatedFare: ordersRide.estimatedFare,
      finalFare: ordersRide.finalFare,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row?.id) return null;

  const existing = readRideRiderPayoutSnapshot(row.billingSnapshot);
  if (existing) return existing;

  const [riderRow] = await db
    .select({ lat: riders.lat, lon: riders.lon })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  const pickupLat = parseCoord(row.pickupLat);
  const pickupLng = parseCoord(row.pickupLon);
  const dropLat = parseCoord(row.dropLat);
  const dropLng = parseCoord(row.dropLon);
  const rideGeo = rideGeoFromCheckoutMetadata(row.checkoutMetadata);
  const tripKm =
    rideTripDistanceFromCheckoutMetadata(row.checkoutMetadata) ??
    roundRideTripDistanceKm(row.distanceKm != null ? Number(row.distanceKm) : undefined);

  const riderLat = parseCoord(riderRow?.lat);
  const riderLng = parseCoord(riderRow?.lon);
  const pickupKm =
    riderLat && riderLng && pickupLat && pickupLng
      ? Math.max(0, Math.round((haversineDistanceMeters(riderLat, riderLng, pickupLat, pickupLng) / 1000) * 10) / 10)
      : undefined;

  const customerFare = Number(row.finalFare ?? row.estimatedFare ?? row.fareAmount ?? 0);
  if (!Number.isFinite(customerFare) || customerFare <= 0) return null;

  const payout = await resolveOrderRiderPayoutBreakdown({
    service: "ride",
    customerFare,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    pickupKm,
    dropKm: tripKm,
    riderLat: riderLat || undefined,
    riderLng: riderLng || undefined,
    riderId,
    rideCatalogCode: row.rideType,
    pincode: rideGeo.pickupPincode,
    state: rideGeo.pickupState,
    waitingMinutes: 0,
  });

  if (payout == null || payout.finalAmount <= 0) return null;

  return persistRideRiderPayoutFromSummary(orderCorePk, {
    baseEarning: payout.subtotalBeforeSurge,
    waitingEarning: 0,
    surgeEarning: payout.surgeTotal,
    appliedSurges: payout.appliedSurges,
    totalEarning: payout.finalAmount + round0(Number(row.customerTipAmount) || 0),
    customerTipAmount: round0(Number(row.customerTipAmount) || 0),
    pickupDistanceKm: pickupKm,
    tripDistanceKm: tripKm,
    totalDistanceKm:
      pickupKm != null && tripKm != null
        ? Math.round((pickupKm + tripKm) * 10) / 10
        : tripKm ?? pickupKm,
  });
}

/** Freeze food rider offer payout at accept — matches incoming-offer geo slab earnings. */
export async function persistFoodRiderAcceptPayoutSnapshot(
  orderCorePk: number,
  riderId: number
): Promise<RideRiderPayoutSnapshot | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      distanceKm: ordersCore.distanceKm,
      billingSnapshot: ordersCore.billingSnapshot,
      tipAmount: ordersCore.tipAmount,
      fareAmount: ordersCore.fareAmount,
    })
    .from(ordersCore)
    .where(and(eq(ordersCore.id, orderCorePk), eq(ordersCore.orderType, "food")))
    .limit(1);

  if (!row?.id) return null;

  const existing = readRideRiderPayoutSnapshot(row.billingSnapshot);
  if (existing) return existing;

  const [riderRow] = await db
    .select({ lat: riders.lat, lon: riders.lon })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  const pickupLat = parseCoord(row.pickupLat);
  const pickupLng = parseCoord(row.pickupLon);
  const dropLat = parseCoord(row.dropLat);
  const dropLng = parseCoord(row.dropLon);
  const tripKm = roundRideTripDistanceKm(
    row.distanceKm != null ? Number(row.distanceKm) : undefined
  );

  const riderLat = parseCoord(riderRow?.lat);
  const riderLng = parseCoord(riderRow?.lon);
  const pickupKm =
    riderLat && riderLng && pickupLat && pickupLng
      ? Math.max(
          0,
          Math.round(
            (haversineDistanceMeters(riderLat, riderLng, pickupLat, pickupLng) / 1000) * 10
          ) / 10
        )
      : undefined;

  const customerFare = Number(row.fareAmount ?? 0);
  if (!Number.isFinite(customerFare) || customerFare <= 0) return null;

  const payout = await resolveOrderRiderPayoutBreakdown({
    service: "food",
    customerFare,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    pickupKm,
    dropKm: tripKm,
    riderLat: riderLat || undefined,
    riderLng: riderLng || undefined,
    riderId,
    waitingMinutes: 0,
  });

  if (payout == null || payout.finalAmount <= 0) return null;

  const tip = round0(Number(row.tipAmount) || 0);
  return persistRideRiderPayoutFromSummary(orderCorePk, {
    baseEarning: payout.subtotalBeforeSurge,
    waitingEarning: 0,
    surgeEarning: payout.surgeTotal,
    appliedSurges: payout.appliedSurges,
    totalEarning: payout.finalAmount + tip,
    customerTipAmount: tip,
    pickupDistanceKm: pickupKm,
    tripDistanceKm: tripKm,
    totalDistanceKm:
      pickupKm != null && tripKm != null
        ? Math.round((pickupKm + tripKm) * 10) / 10
        : tripKm ?? pickupKm,
  });
}

/** After pickup OTP: add waiting to customer grand total + rider snapshot (surge frozen at accept). */
export async function applyRidePickupWaitingToBilling(
  orderCorePk: number,
  riderId: number
): Promise<{ customerWaiting: number; riderWaiting: number } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      distanceKm: ordersCore.distanceKm,
      checkoutMetadata: ordersCore.checkoutMetadata,
      billingSnapshot: ordersCore.billingSnapshot,
      grandTotal: ordersCore.grandTotal,
      fareAmount: ordersCore.fareAmount,
      tipAmount: ordersCore.tipAmount,
      rideType: ordersRide.rideType,
      estimatedFare: ordersRide.estimatedFare,
      customerTipAmount: ordersRide.customerTipAmount,
      pickupWaitSeconds: ordersRide.pickupWaitSeconds,
      acceptPayoutSnapshot: ordersRide.acceptPayoutSnapshot,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row?.id) return null;

  const waitSeconds =
    row.pickupWaitSeconds != null ? Math.max(0, Number(row.pickupWaitSeconds) || 0) : 0;

  const freeMinutes = await resolveRidePickupFreeWaitMinutes({
    checkoutMetadata: row.checkoutMetadata,
    pickupLat: Number(row.pickupLat),
    pickupLng: Number(row.pickupLon),
    rideType: row.rideType,
  });
  const customerPerMin = await resolveRidePickupWaitingChargePerMin({
    checkoutMetadata: row.checkoutMetadata,
    pickupLat: Number(row.pickupLat),
    pickupLng: Number(row.pickupLon),
    rideType: row.rideType,
  });

  let waitingMax: number | null = null;
  let waitingFundingMode: "CUSTOMER_100" | "COMPANY_100" | "MERCHANT_100" | "SHARED" = "CUSTOMER_100";
  let waitingCustomerSharePct = 100;
  let waitingCompanySharePct = 0;
  try {
    const geoHints = rideGeoFromCheckoutMetadata(row.checkoutMetadata);
    const { resolveRidePricingGeoFromPickup } = await import(
      "../modules/ride-state-config/rideStateConfig.repository.js"
    );
    const rideGeo = await resolveRidePricingGeoFromPickup({
      pickupLat: Number(row.pickupLat),
      pickupLng: Number(row.pickupLon),
      pickupPincode: geoHints.pickupPincode,
      pickupState: geoHints.pickupState,
    });
    if (rideGeo.pricingGeo) {
      const { loadEffectiveServicePayoutRule } = await import(
        "../modules/rider-payout-pricing/riderPayoutPricing.repository.js"
      );
      const { rule } = await loadEffectiveServicePayoutRule({
        level: rideGeo.pricingGeo.level,
        refId: rideGeo.pricingGeo.refId,
        service: "ride",
      });
      if (rule) {
        waitingMax = rule.waitingMaxCharge;
        waitingFundingMode = rule.waitingFundingMode ?? "CUSTOMER_100";
        waitingCustomerSharePct = rule.waitingCustomerSharePct ?? 100;
        waitingCompanySharePct = rule.waitingCompanySharePct ?? 0;
      }
    }
  } catch {
    /* keep defaults */
  }

  const { computeWaitingCharge } = await import(
    "../modules/rides/pricing/rideWaitingCharge.js"
  );
  const waitingSplit = computeWaitingCharge(waitSeconds, {
    freeMinutes,
    chargePerMin: customerPerMin,
    maxCharge: waitingMax,
    fundingMode: waitingFundingMode,
    customerSharePct: waitingCustomerSharePct,
    companySharePct: waitingCompanySharePct,
  });
  // Customer bill only includes the customer-funded share.
  const customerWaiting = waitingSplit.customerShare;

  let riderWaiting = 0;
  if (waitSeconds > 0) {
    riderWaiting = await computeRiderPickupWaitingEarning({
      checkoutMetadata: row.checkoutMetadata,
      pickupLat: parseCoord(row.pickupLat),
      pickupLng: parseCoord(row.pickupLon),
      rideType: row.rideType,
      pickupWaitSeconds: waitSeconds,
    });
  }

  const tip = round0(
    Number(row.customerTipAmount) || Number(row.tipAmount) || 0
  );
  const rideFare = round0(
    Number(row.estimatedFare) || Number(row.fareAmount) || 0
  );

  let snapshot = resolveRideRiderPayoutForDisplay({
    billingSnapshot: row.billingSnapshot,
    acceptPayoutSnapshot: row.acceptPayoutSnapshot,
  });
  if (!snapshot) {
    await persistRideRiderAcceptPayoutSnapshot(orderCorePk, riderId);
    const [refreshed] = await db
      .select({
        billingSnapshot: ordersCore.billingSnapshot,
        acceptPayoutSnapshot: ordersRide.acceptPayoutSnapshot,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(eq(ordersCore.id, orderCorePk))
      .limit(1);
    snapshot = resolveRideRiderPayoutForDisplay({
      billingSnapshot: refreshed?.billingSnapshot,
      acceptPayoutSnapshot: refreshed?.acceptPayoutSnapshot,
    });
  }

  if (snapshot) {
    const updatedSnapshot: RideRiderPayoutSnapshot = {
      ...snapshot,
      waitingEarning: riderWaiting,
      totalEarning: round0(
        snapshot.baseEarning + riderWaiting + snapshot.surgeEarning + tip
      ),
    };
    await writeRideRiderPayoutSnapshot(orderCorePk, updatedSnapshot, tip);
  }

  const [afterSnapRow] = await db
    .select({ billingSnapshot: ordersCore.billingSnapshot })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);
  const mergedSnap =
    afterSnapRow?.billingSnapshot != null && typeof afterSnapRow.billingSnapshot === "object"
      ? (afterSnapRow.billingSnapshot as Record<string, unknown>)
      : row.billingSnapshot != null && typeof row.billingSnapshot === "object"
        ? (row.billingSnapshot as Record<string, unknown>)
        : {};

  const { syncRideCustomerBillingSnapshot } = await import(
    "../modules/rides/ride-bill.service.js"
  );
  const synced = await syncRideCustomerBillingSnapshot(db, orderCorePk, {
    pickupWaitingCharge: customerWaiting,
    pickupWaitSeconds: waitSeconds,
    skipIfPaid: true,
  });

  // Persist waiting funding split for settlement (company-funded waiting is a subsidy).
  {
    const { getSql } = await import("../db/client.js");
    const sql = getSql();
    await sql`
      UPDATE orders_core
      SET billing_snapshot = COALESCE(billing_snapshot, '{}'::jsonb) || ${JSON.stringify({
        waiting_charge: customerWaiting,
        waiting_charge_gross: waitingSplit.capped,
        waiting_customer_share: waitingSplit.customerShare,
        waiting_company_share: waitingSplit.companyShare,
        waiting_funding_mode: waitingSplit.fundingMode,
        company_funded_waiting: waitingSplit.companyShare,
      })}::text::jsonb,
          updated_at = NOW()
      WHERE id = ${orderCorePk}
    `;
  }

  if (!synced.ok) {
    const tip = round0(Number(row.customerTipAmount) || Number(row.tipAmount) || 0);
    const rideFare = round0(Number(row.estimatedFare) || Number(row.fareAmount) || 0);
    const newGrandTotal = round0(rideFare + customerWaiting + tip);
    await db
      .update(ordersCore)
      .set({
        grandTotal: String(newGrandTotal),
        billingSnapshot: {
          ...mergedSnap,
          ride_fare: rideFare,
          fare_amount: rideFare,
          waiting_charge: customerWaiting,
          pickup_waiting_charge: customerWaiting,
          tip_amount: tip,
          final_amount: newGrandTotal,
          pickup_wait_seconds: waitSeconds,
        },
        updatedAt: new Date(),
      })
      .where(eq(ordersCore.id, orderCorePk));
  }

  await db
    .update(ordersRide)
    .set({
      waitingCharges: String(customerWaiting),
      updatedAt: new Date(),
    })
    .where(eq(ordersRide.orderId, orderCorePk));

  return { customerWaiting, riderWaiting };
}

/** Reconcile stale grand totals for delivered rides with finalized pickup wait. */
export async function ensureRidePickupWaitingBillingReconciled(
  orderCorePk: number,
  riderId: number | null | undefined
): Promise<void> {
  if (!riderId || riderId <= 0) return;
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      status: ordersCore.status,
      paymentStatus: ordersCore.paymentStatus,
      grandTotal: ordersCore.grandTotal,
      fareAmount: ordersCore.fareAmount,
      tipAmount: ordersCore.tipAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      estimatedFare: ordersRide.estimatedFare,
      customerTipAmount: ordersRide.customerTipAmount,
      pickupWaitSeconds: ordersRide.pickupWaitSeconds,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row?.id || row.status !== "delivered") return;
  const waitSeconds =
    row.pickupWaitSeconds != null ? Math.max(0, Number(row.pickupWaitSeconds) || 0) : 0;
  if (waitSeconds <= 0) return;

  const snap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};
  const snapWaiting = round0(
    Number(snap.waiting_charge ?? snap.pickup_waiting_charge ?? snap.waiting_fee) || 0
  );
  const rideFare = round0(Number(row.estimatedFare) || Number(row.fareAmount) || 0);
  const tip = round0(Number(row.customerTipAmount) || Number(row.tipAmount) || 0);
  const currentTotal = round0(Number(row.grandTotal) || 0);
  const expectedTotal = round0(rideFare + snapWaiting + tip);

  if (snapWaiting <= 0 || currentTotal < expectedTotal) {
    await applyRidePickupWaitingToBilling(orderCorePk, riderId);
  }
}
