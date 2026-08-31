import type { OrderDetail, OrderSummary } from "@/services/order.service";
import { getRideOption } from "@/features/ride/rideOptions";
import { resolveRideImage, resolveSelectedRideMapMarkerImageKey } from "@/features/ride/rideOptionAssets";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { resolvePlaceDisplayName } from "@/services/location.service";
import { parseRideFareDistanceKm } from "@/lib/ride-fare-distance";
import {
  buildRideInvoiceLinesFromFareBill,
  rideFareBillFromBillingSnapshot,
  resolveSnapshotDiscountRows,
} from "@/lib/ride-fare-bill-display";
import {
  estimateRidePickupWaitingCharge,
  resolveRidePickupWaitingChargePerMin,
  type RidePickupWaitFields,
} from "@/lib/ride-pickup-wait";
import { resolvePersonRideCustomerPayable } from "@/lib/ride-customer-payable";

const RIDE_IMAGE_KEY: Record<string, string> = {
  bike: "bike",
  "bike-lite": "bike",
  auto: "auto",
  ev_auto: "ev_auto",
  travel: "ev_auto",
  "cab-economy": "cab",
  "cab-premium": "cab_premium",
};

export function resolveRideCatalogImageKey(rideType: string | null | undefined): string {
  const raw = (rideType ?? "").trim().toLowerCase();
  return RIDE_IMAGE_KEY[raw] ?? "bike";
}

export function getRideServiceLabel(rideType: string | null | undefined): string {
  const raw = (rideType ?? "").trim().toLowerCase();
  if (!raw) return "Ride";
  const option = getRideOption(raw);
  if (option.name) return `${option.name} Ride`;
  return raw
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatRideHistoryDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const time = d
      .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s/g, " ");
    return `${date} • ${time}`;
  } catch {
    return iso;
  }
}

export function getRideDropTitle(order: Pick<OrderSummary, "deliveryAddress" | "merchantAddress">): string {
  const drop = resolvePlaceDisplayName({
    primary: order.deliveryAddress,
    fullAddress: order.deliveryAddress,
  });
  if (drop) return drop;
  const pickup = resolvePlaceDisplayName({
    primary: order.merchantAddress,
    fullAddress: order.merchantAddress,
  });
  return pickup || "Ride";
}

export function getRideHistoryStatusLabel(status: string): string {
  const s = normalizeCustomerOrderStatus(status);
  if (s === "DELIVERED") return "Completed";
  if (s === "CANCELLED") return "Cancelled";
  if (s === "PAYMENT_FAILED" || s === "FAILED") return "Payment failed";
  return "In progress";
}

export function formatRideFare(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "₹0";
  const rounded = Math.round(amount * 10) / 10;
  return `₹${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}`;
}

export function resolveRideVehicleImage(rideType: string | null | undefined) {
  return resolveRideImage(resolveRideCatalogImageKey(rideType));
}

/** Map marker image_key for the booked ride (bike / auto / cab / cab_premium). */
export function resolveRideMapMarkerImageKey(rideType: string | null | undefined): string {
  return resolveSelectedRideMapMarkerImageKey(rideType, resolveRideCatalogImageKey(rideType));
}

export function getRideFareBreakdown(order: Pick<OrderDetail, "totalAmount" | "tipAmount">) {
  const total = Number(order.totalAmount ?? 0);
  const tip = Math.max(0, Number(order.tipAmount ?? 0));
  const rideCharge = Math.max(0, total - tip);
  return { total, tip, rideCharge };
}

function billNum(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function isPersonRideOrder(
  order: Pick<OrderDetail, "checkoutMetadata" | "orderType">
): boolean {
  const meta = order.checkoutMetadata as Record<string, unknown> | null;
  if (meta?.serviceType === "RIDE") return true;
  return order.orderType === "person_ride";
}

/** Parse ₹X/min from fare quote waiting note. */
export function parseWaitingChargePerMinFromNote(note: string | null | undefined): number {
  if (!note?.trim()) return 0;
  const match = note.match(/₹\s*(\d+(?:\.\d+)?)\s*\/\s*min/i);
  if (!match?.[1]) return 0;
  const perMin = Number(match[1]);
  return Number.isFinite(perMin) && perMin > 0 ? perMin : 0;
}

/** Booking-time ride fare (excludes tip and waiting). */
export function resolveRideBookingBaseFare(
  order: Pick<
    OrderDetail,
    "totalAmount" | "tipAmount" | "checkoutMetadata" | "billingSnapshot" | "orderType"
  >,
  liveEstimatedFare?: number | null
): number {
  if (liveEstimatedFare != null && Number.isFinite(liveEstimatedFare) && liveEstimatedFare > 0) {
    return Math.round(liveEstimatedFare);
  }

  const meta = order.checkoutMetadata as Record<string, unknown> | null;
  const metaFare = Number(meta?.estimatedFare ?? meta?.finalFare);
  if (Number.isFinite(metaFare) && metaFare > 0) return Math.round(metaFare);

  const snap = (order.billingSnapshot ?? {}) as Record<string, unknown>;
  const snapFare = billNum(snap.fare_amount) || billNum(snap.ride_fare);
  if (snapFare > 0 && isPersonRideOrder(order)) return Math.round(snapFare);

  const tip = Math.max(0, Number(order.tipAmount ?? 0));
  const total = Number(order.totalAmount ?? 0);
  return Math.max(0, Math.round(total - tip));
}

export type ActiveRideTripFare = {
  rideFare: number;
  waitingCharge: number;
  tip: number;
  totalFare: number;
  hasPickupWait: boolean;
};

export function buildActiveRideTripFareBreakdown(args: {
  order: OrderDetail;
  liveEstimatedFare?: number | null;
  serverWaitingCharge?: number | null;
  waitingChargePerMin?: number | null;
  pickupWaitFields: RidePickupWaitFields;
  finalizedPickupWaitSec: number;
  pickupWaitActive?: boolean;
  nowMs?: number;
}): ActiveRideTripFare {
  const snapBill = parseRideDeliveredBill(args.order);
  const tip = Math.max(0, Number(args.order.tipAmount ?? snapBill.tip ?? 0));
  const rideFare = resolveRideBookingBaseFare(args.order, args.liveEstimatedFare);

  const meta = args.order.checkoutMetadata as Record<string, unknown> | null;
  const perMin =
    args.waitingChargePerMin != null && args.waitingChargePerMin > 0
      ? args.waitingChargePerMin
      : resolveRidePickupWaitingChargePerMin(meta) ||
        parseWaitingChargePerMinFromNote(
          typeof meta?.waitingChargeNote === "string" ? meta.waitingChargeNote : null
        );

  const billWaitFields: RidePickupWaitFields = {
    ...args.pickupWaitFields,
    pickupWaitSeconds: args.finalizedPickupWaitSec,
  };
  const estimatedWaiting = estimateRidePickupWaitingCharge(
    billWaitFields,
    perMin,
    args.nowMs ?? Date.now()
  );
  let waitingCharge = resolveRidePaymentWaitingCharge({
    order: args.order,
    snapWaiting: snapBill.waitingCharge,
    liveWaiting: estimatedWaiting,
  });
  if (
    args.serverWaitingCharge != null &&
    args.serverWaitingCharge > 0 &&
    !isRidePickupWaitFinalized(args.order)
  ) {
    waitingCharge = args.serverWaitingCharge;
  }

  const hasPickupWait = args.finalizedPickupWaitSec > 0;
  const totalFare = rideFare + waitingCharge + tip;

  return { rideFare, waitingCharge, tip, totalFare, hasPickupWait };
}

function tripKmFromBillingSnapshot(snap: Record<string, unknown>): number | null {
  const raw = snap.rider_payout_snapshot;
  if (raw == null || typeof raw !== "object") return null;
  const trip = Number((raw as Record<string, unknown>).tripDistanceKm);
  return Number.isFinite(trip) && trip > 0 ? Math.round(trip * 10) / 10 : null;
}

/** Canonical booking trip km — matches fare quote and rider accept-offer modal. */
export function resolveRideOrderTripDistanceKm(
  order: Pick<OrderDetail | OrderSummary, "distanceKm" | "checkoutMetadata" | "billingSnapshot">
): number | null {
  const snap =
    order.billingSnapshot != null && typeof order.billingSnapshot === "object"
      ? (order.billingSnapshot as Record<string, unknown>)
      : null;
  const fromSnap = snap ? tripKmFromBillingSnapshot(snap) : null;
  if (fromSnap != null) return fromSnap;

  const fromMeta = parseRideFareDistanceKm(
    order.checkoutMetadata as { routeDistanceKm?: number | string; tripKm?: number | string } | undefined
  );
  if (fromMeta != null) return fromMeta;

  const fromSnapLegacy = snap ? billNum(snap.distance_km) || billNum(snap.route_distance_km) : 0;
  if (fromSnapLegacy > 0) return Math.round(fromSnapLegacy * 10) / 10;

  const core = order.distanceKm;
  if (core != null && Number.isFinite(Number(core)) && Number(core) > 0) {
    return Math.round(Number(core) * 10) / 10;
  }
  return null;
}

export type RideDeliveredBill = {
  rideFare: number;
  waitingCharge: number;
  surgeCharge: number;
  additionalCharges: number;
  tip: number;
  total: number;
  distanceKm: number | null;
  paymentMethodLabel: string;
};

export type RidePaymentFareLine = {
  label: string;
  amount: number;
  emphasis?: boolean;
  isDiscount?: boolean;
};

export type RidePaymentFareBreakdown = {
  lines: RidePaymentFareLine[];
  rideFare: number;
  waitingCharge: number;
  surgeCharge: number;
  tip: number;
  additionalCharges: number;
  total: number;
};

export function formatRidePaymentMethod(method: string | null | undefined): string {
  const raw = (method ?? "").trim().toLowerCase();
  if (!raw || raw === "cod") return "Online";
  if (raw.includes("online")) return "Online";
  if (raw.includes("upi")) return "UPI";
  if (raw.includes("card")) return "Card";
  if (raw.includes("wallet")) return "Wallet";
  if (raw.includes("cash")) return "Cash";
  return method?.trim() || "Online";
}

function resolveBillingSnapshotWaitingCharge(snap: Record<string, unknown>): number {
  const waitingCharge = billNum(snap.waiting_charge);
  const pickupWaiting = billNum(snap.pickup_waiting_charge);
  const waitingFee = billNum(snap.waiting_fee);
  return Math.max(waitingCharge, pickupWaiting, waitingFee, 0);
}

export function parseRideDeliveredBill(
  order: Pick<
    OrderDetail,
    | "totalAmount"
    | "tipAmount"
    | "paymentMethod"
    | "billingSnapshot"
    | "distanceKm"
    | "checkoutMetadata"
    | "orderType"
  > & { fareAmount?: number | null }
): RideDeliveredBill {
  const snap = (order.billingSnapshot ?? {}) as Record<string, unknown>;
  const tip = Math.max(0, billNum(snap.tip_amount) || Number(order.tipAmount ?? 0));
  const waitingCharge = resolveBillingSnapshotWaitingCharge(snap);
  const platformFee = billNum(snap.platform_fee);
  const convenienceFee = billNum(snap.convenience_fee);
  const taxTotal = billNum(snap.tax_total);
  const additionalCharges = Math.max(
    0,
    platformFee +
      convenienceFee +
      taxTotal +
      billNum(snap.misc_fee) +
      billNum(snap.small_order_fee) +
      billNum(snap.additional_charge) +
      billNum(snap.extra_charge)
  );
  const surgeCharge = Math.max(0, billNum(snap.surge_fee) + billNum(snap.surge_charge));
  const personRide = isPersonRideOrder(order);
  const rideFareFromSnap = Math.max(
    0,
    billNum(snap.ride_fare) ||
      billNum(snap.fare_amount) ||
      (!personRide ? billNum(snap.item_total) || billNum(snap.delivery_fee) : 0)
  );
  const serverTotal = Math.max(0, billNum(snap.final_amount) || Number(order.totalAmount ?? 0));
  const rideFare =
    rideFareFromSnap > 0
      ? rideFareFromSnap
      : personRide
        ? resolveRideBookingBaseFare(order)
        : Math.max(0, serverTotal - tip - waitingCharge - surgeCharge - additionalCharges);

  const distanceKm = resolveRideOrderTripDistanceKm(order);
  const componentTotal = rideFare + waitingCharge + surgeCharge + additionalCharges + tip;
  const hasSnapFinal = snap.final_amount != null && snap.final_amount !== "";
  const total = hasSnapFinal ? billNum(snap.final_amount) : Math.max(componentTotal, serverTotal);

  return {
    rideFare,
    waitingCharge,
    surgeCharge,
    additionalCharges,
    tip,
    total,
    distanceKm,
    paymentMethodLabel: formatRidePaymentMethod(order.paymentMethod),
  };
}

function isRidePickupWaitFinalized(
  order: Pick<OrderDetail, "pickupOtpVerifiedAt" | "pickupWaitSeconds">
): boolean {
  return (
    order.pickupOtpVerifiedAt != null &&
    order.pickupWaitSeconds != null &&
    Number.isFinite(Number(order.pickupWaitSeconds))
  );
}

function resolveRidePaymentWaitingCharge(args: {
  order: Pick<
    OrderDetail,
    | "pickupOtpVerifiedAt"
    | "pickupWaitSeconds"
    | "estimatedPickupWaitingCharge"
  >;
  snapWaiting: number;
  liveWaiting: number;
}): number {
  if (isRidePickupWaitFinalized(args.order) && args.snapWaiting > 0) {
    return args.snapWaiting;
  }
  const serverEst = Number(args.order.estimatedPickupWaitingCharge ?? 0);
  if (Number.isFinite(serverEst) && serverEst > 0) return serverEst;
  return Math.max(0, args.liveWaiting);
}

/** Amount due on delivered unpaid person rides (list + detail). */
export function resolveRidePaymentDueAmount(
  order: Pick<
    OrderDetail,
    | "totalAmount"
    | "tipAmount"
    | "billingSnapshot"
    | "checkoutMetadata"
    | "orderType"
    | "pickupOtpVerifiedAt"
    | "pickupWaitSeconds"
    | "pickupWaitingChargePerMin"
    | "estimatedPickupWaitingCharge"
    | "paymentMethod"
    | "distanceKm"
    | "riderReachedPickupAt"
  >
): number {
  const quoted = resolvePersonRideCustomerPayable({
    totalAmount: order.totalAmount,
    checkoutMetadata: order.checkoutMetadata,
    billingSnapshot: "billingSnapshot" in order ? order.billingSnapshot : undefined,
  });
  if ("billingSnapshot" in order && order.billingSnapshot != null) {
    const breakdownTotal = buildRidePaymentFareBreakdown(order as OrderDetail).total;
    const hasFinal =
      order.billingSnapshot.final_amount != null && order.billingSnapshot.final_amount !== "";
    if (hasFinal) return breakdownTotal;
    return quoted;
  }
  return quoted;
}

function rideBillingFeeLines(snap: Record<string, unknown>): RidePaymentFareLine[] {
  const lines: RidePaymentFareLine[] = [];
  const seen = new Set<string>();

  const pushLine = (label: string, amount: number) => {
    if (amount <= 0.005) return;
    const key = `${label}:${amount}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ label, amount: Math.round(amount * 100) / 100 });
  };

  const rawCharges = snap.charges;
  if (Array.isArray(rawCharges)) {
    for (const entry of rawCharges) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { label?: string; amount?: number; kind?: string };
      if (row.kind === "tax") continue;
      const label = String(row.label ?? "").trim();
      const amount = billNum(row.amount);
      if (!label || amount <= 0.005) continue;
      if (label.toLowerCase().includes("tip")) continue;
      pushLine(label, amount);
    }
  }

  const rawTaxes = snap.taxes;
  if (Array.isArray(rawTaxes)) {
    for (const entry of rawTaxes) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { label?: string; amount?: number };
      const label = String(row.label ?? "GST").trim() || "GST";
      pushLine(label, billNum(row.amount));
    }
  }

  const hasBookingFee = lines.some((line) => {
    const lower = line.label.toLowerCase();
    return lower.includes("platform") || lower.includes("booking");
  });
  const hasConvenience = lines.some((line) => line.label.toLowerCase().includes("convenience"));
  const hasTax = lines.some((line) => {
    const lower = line.label.toLowerCase();
    return lower.includes("gst") || lower.includes("tax");
  });

  if (!hasBookingFee) pushLine("Booking fee", billNum(snap.platform_fee));
  if (!hasConvenience) pushLine("Convenience charges", billNum(snap.convenience_fee));
  if (!hasTax) pushLine("GST & taxes", billNum(snap.tax_total));

  return lines;
}

export type RideSummaryInvoiceLine = {
  label: string;
  amount: number;
  isDiscount?: boolean;
};

function rideOfferDiscountLabel(
  snap: Record<string, unknown>,
  meta: Record<string, unknown>
): string {
  const coupon = [
    snap.ride_fare_coupon_code,
    snap.coupon_code,
    meta.couponCode,
    meta.rideCouponCode,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find((v) => v.length > 0);
  return coupon || "Offer applied";
}

function billMetaNum(meta: Record<string, unknown>, key: string): number {
  const n = Number(meta[key]);
  return Number.isFinite(n) ? n : 0;
}

function bookingQuotedPayable(meta: Record<string, unknown>): number | null {
  if (meta.quotedGrandTotal == null || meta.quotedGrandTotal === "") return null;
  const n = Number(meta.quotedGrandTotal);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function originalRideFareFromSnap(snap: Record<string, unknown>): number {
  return Math.max(
    billNum(snap.ride_fare),
    billNum(snap.fare_amount),
    billNum(snap.item_total),
    billNum(snap.original_fare),
    billNum(snap.original_amount)
  );
}

function bookingOriginalFare(snap: Record<string, unknown>, meta: Record<string, unknown>): number {
  return Math.max(
    originalRideFareFromSnap(snap),
    billMetaNum(meta, "estimatedFare"),
    billMetaNum(meta, "quotedListFare")
  );
}

function withInvoiceOfferDiscount(
  snap: Record<string, unknown>,
  meta: Record<string, unknown>,
  lines: RideSummaryInvoiceLine[],
  totalFare: number
): { lines: RideSummaryInvoiceLine[]; totalFare: number; totalBeforeDiscount: number | null } {
  const quotedPayable = bookingQuotedPayable(meta);
  const displayTotal = quotedPayable != null ? quotedPayable : totalFare;
  const next = [...lines];
  const chargesSum = next.filter((l) => !l.isDiscount).reduce((s, l) => s + l.amount, 0);
  const original = Math.max(bookingOriginalFare(snap, meta), chargesSum);
  const rideChargeIdx = next.findIndex((l) => {
    const lower = l.label.toLowerCase();
    return lower.includes("ride charge") || lower.includes("ride fare");
  });
  if (original > 0.005 && rideChargeIdx >= 0 && next[rideChargeIdx]!.amount <= 0.005) {
    next[rideChargeIdx] = { ...next[rideChargeIdx]!, amount: original };
  } else if (original > 0.005 && rideChargeIdx < 0) {
    next.unshift({ label: "Ride Charge", amount: original });
  }

  const existingDiscount = next.filter((l) => l.isDiscount).reduce((s, l) => s + l.amount, 0);
  if (existingDiscount <= 0.005 && original > displayTotal + 0.005) {
    next.push({
      label: rideOfferDiscountLabel(snap, meta),
      amount: Math.round((original - displayTotal) * 100) / 100,
      isDiscount: true,
    });
  }

  const useful = next.some((l) => l.amount > 0.005);
  if (!useful && original > 0.005) {
    const synthesized: RideSummaryInvoiceLine[] = [{ label: "Ride Charge", amount: original }];
    if (original > displayTotal + 0.005) {
      synthesized.push({
        label: rideOfferDiscountLabel(snap, meta),
        amount: Math.round((original - displayTotal) * 100) / 100,
        isDiscount: true,
      });
    }
    return {
      lines: synthesized,
      totalFare: displayTotal,
      totalBeforeDiscount: original > displayTotal + 0.005 ? original : null,
    };
  }

  const discountTotal = next.filter((l) => l.isDiscount).reduce((s, l) => s + l.amount, 0);
  const totalBeforeDiscount =
    discountTotal > 0.005 ? Math.round((displayTotal + discountTotal) * 100) / 100 : original > displayTotal + 0.005 ? original : null;

  return { lines: next, totalFare: displayTotal, totalBeforeDiscount };
}

/** Completed-ride invoice / summary lines — same breakdown as ride checkout bill. */
export function buildRideSummaryInvoice(
  order: Pick<
    OrderDetail,
    | "totalAmount"
    | "tipAmount"
    | "paymentStatus"
    | "billingSnapshot"
    | "distanceKm"
    | "checkoutMetadata"
    | "orderType"
    | "paymentMethod"
    | "pickupOtpVerifiedAt"
    | "pickupWaitSeconds"
    | "pickupWaitingChargePerMin"
    | "estimatedPickupWaitingCharge"
    | "riderReachedPickupAt"
  >
): {
  lines: RideSummaryInvoiceLine[];
  totalFare: number;
  isEstimate: boolean;
  totalBeforeDiscount: number | null;
} {
  const snap =
    order.billingSnapshot != null && typeof order.billingSnapshot === "object"
      ? (order.billingSnapshot as Record<string, unknown>)
      : {};
  const meta =
    order.checkoutMetadata != null && typeof order.checkoutMetadata === "object"
      ? (order.checkoutMetadata as Record<string, unknown>)
      : {};
  const quotedPayable = bookingQuotedPayable(meta);

  const fareBill = rideFareBillFromBillingSnapshot({
    billingSnapshot: snap,
    totalAmount: order.totalAmount,
    tipAmount: order.tipAmount,
  });

  const paymentCompleted =
    String(order.paymentStatus ?? "").toLowerCase() === "completed" ||
    String(order.paymentStatus ?? "").toLowerCase() === "paid" ||
    (typeof snap.ride_fare_paid_at === "string" && snap.ride_fare_paid_at.trim().length > 0) ||
    snap.ride_fare_paid_by === "offer" ||
    (quotedPayable != null && quotedPayable <= 0.005);

  if (fareBill) {
    const { lines, totalFare } = buildRideInvoiceLinesFromFareBill(fareBill);
    const invoice = withInvoiceOfferDiscount(snap, meta, lines, totalFare);
    return {
      ...invoice,
      isEstimate: !paymentCompleted,
    };
  }

  const breakdown = buildRidePaymentFareBreakdown(order);

  const lines: RideSummaryInvoiceLine[] = [
    { label: "Ride Charge", amount: breakdown.rideFare },
  ];

  const platformFee = billNum(snap.platform_fee);
  const convenienceFee = billNum(snap.convenience_fee);
  const feeLines = rideBillingFeeLines(snap);

  if (platformFee > 0.005) {
    lines.push({ label: "Booking fee", amount: platformFee });
  }
  if (convenienceFee > 0.005) {
    lines.push({ label: "Convenience charges", amount: convenienceFee });
  }

  for (const row of feeLines) {
    const lower = row.label.toLowerCase();
    if (lower.includes("booking") && platformFee > 0.005) continue;
    if (lower.includes("convenience") && convenienceFee > 0.005) continue;
    if (lines.some((l) => l.label === row.label && Math.abs(l.amount - row.amount) < 0.01)) continue;
    lines.push(row);
  }

  if (
    platformFee <= 0.005 &&
    convenienceFee <= 0.005 &&
    feeLines.length === 0 &&
    breakdown.additionalCharges > 0.005
  ) {
    lines.push({
      label: "Booking Fees & Convenience Charges",
      amount: breakdown.additionalCharges,
    });
  }

  if (breakdown.waitingCharge > 0.005) {
    lines.push({ label: "Waiting charges", amount: breakdown.waitingCharge });
  }
  if (breakdown.surgeCharge > 0.005) {
    lines.push({ label: "Surge pricing", amount: breakdown.surgeCharge });
  }

  const nightCharge = billNum(snap.night_charge) || billNum(snap.night_charge_total);
  if (nightCharge > 0.005) {
    lines.push({ label: "Night charge", amount: nightCharge });
  }
  const tollCharge = billNum(snap.toll_charge) || billNum(snap.toll_charges);
  if (tollCharge > 0.005) {
    lines.push({ label: "Toll", amount: tollCharge });
  }
  const airportCharge = billNum(snap.airport_charge);
  if (airportCharge > 0.005) {
    lines.push({ label: "Airport charge", amount: airportCharge });
  }

  const taxTotal = billNum(snap.tax_total);
  if (taxTotal > 0.005) {
    const snapTaxes = Array.isArray(snap.taxes) ? snap.taxes : [];
    if (snapTaxes.length > 0) {
      for (const entry of snapTaxes) {
        if (!entry || typeof entry !== "object") continue;
        const row = entry as { label?: string; amount?: number };
        const amount = billNum(row.amount);
        if (amount <= 0.005) continue;
        lines.push({
          label: String(row.label ?? "GST").trim() || "GST",
          amount,
        });
      }
    } else {
      lines.push({ label: "GST", amount: taxTotal });
    }
  }

  if (breakdown.tip > 0.005) {
    lines.push({ label: "Captain tip", amount: breakdown.tip });
  }

  const rawDiscounts = resolveSnapshotDiscountRows(snap);
  for (const row of rawDiscounts) {
    lines.push({ label: row.label, amount: row.amount, isDiscount: true });
  }

  const invoice = withInvoiceOfferDiscount(snap, meta, lines, breakdown.total);
  return {
    ...invoice,
    isEstimate: !paymentCompleted,
  };
}

export function buildRidePaymentFareBreakdown(
  order: Pick<
    OrderDetail,
    | "totalAmount"
    | "tipAmount"
    | "paymentMethod"
    | "billingSnapshot"
    | "distanceKm"
    | "checkoutMetadata"
    | "orderType"
    | "riderReachedPickupAt"
    | "pickupOtpVerifiedAt"
    | "pickupWaitSeconds"
    | "pickupWaitingChargePerMin"
    | "estimatedPickupWaitingCharge"
  >
): RidePaymentFareBreakdown {
  const snapBill = parseRideDeliveredBill(order);
  const pickupWaitFields: RidePickupWaitFields = {
    riderReachedPickupAt: order.riderReachedPickupAt ?? null,
    pickupOtpVerifiedAt: order.pickupOtpVerifiedAt ?? null,
    pickupWaitSeconds: order.pickupWaitSeconds ?? null,
  };
  const finalizedPickupWaitSec =
    order.pickupWaitSeconds != null && Number.isFinite(order.pickupWaitSeconds)
      ? Math.max(0, Math.floor(order.pickupWaitSeconds))
      : 0;

  const liveTrip = buildActiveRideTripFareBreakdown({
    order: order as OrderDetail,
    serverWaitingCharge: order.estimatedPickupWaitingCharge,
    waitingChargePerMin: order.pickupWaitingChargePerMin,
    pickupWaitFields,
    finalizedPickupWaitSec,
    pickupWaitActive: false,
  });

  const waitingCharge = resolveRidePaymentWaitingCharge({
    order,
    snapWaiting: snapBill.waitingCharge,
    liveWaiting: liveTrip.waitingCharge,
  });
  const rideFare = snapBill.rideFare > 0 ? snapBill.rideFare : liveTrip.rideFare;
  const surgeCharge = snapBill.surgeCharge;
  const tip = Math.max(snapBill.tip, liveTrip.tip);
  const snap =
    order.billingSnapshot != null && typeof order.billingSnapshot === "object"
      ? (order.billingSnapshot as Record<string, unknown>)
      : {};
  const billingFeeLines = rideBillingFeeLines(snap).filter((line) => {
    const lower = line.label.toLowerCase();
    return !lower.includes("waiting") && !lower.includes("surge");
  });
  const billingFeesTotal = billingFeeLines.reduce((s, l) => s + l.amount, 0);
  const additionalCharges =
    billingFeesTotal > 0.005 ? billingFeesTotal : snapBill.additionalCharges;
  const componentTotal = rideFare + waitingCharge + surgeCharge + additionalCharges + tip;
  const hasSnapFinal = snap.final_amount != null && snap.final_amount !== "";
  const snapFinal = billNum(snap.final_amount);
  const total = hasSnapFinal
    ? snapFinal
    : Math.max(componentTotal, snapBill.total);

  const lines: RidePaymentFareLine[] = [{ label: "Ride fare", amount: rideFare }];
  if (waitingCharge > 0) {
    lines.push({ label: "Waiting charges", amount: waitingCharge });
  }
  if (surgeCharge > 0) {
    lines.push({ label: "Surge pricing", amount: surgeCharge });
  }
  if (billingFeeLines.length > 0) {
    lines.push(...billingFeeLines);
  } else if (additionalCharges > 0) {
    lines.push({ label: "Additional charges", amount: additionalCharges });
  }
  if (tip > 0) {
    lines.push({ label: "Captain tip", amount: tip });
  }
  lines.push({ label: "Total fare", amount: total, emphasis: true });

  return {
    lines,
    rideFare,
    waitingCharge,
    surgeCharge,
    tip,
    additionalCharges,
    total,
  };
}

export function formatRideTripStats(distanceKm?: number | null, durationMins?: number | null): string | null {
  const parts: string[] = [];
  if (durationMins != null && Number.isFinite(durationMins) && durationMins > 0) {
    parts.push(`${Math.round(durationMins * 10) / 10} mins`);
  }
  if (distanceKm != null && Number.isFinite(distanceKm) && distanceKm > 0) {
    parts.push(`${Math.round(distanceKm * 10) / 10} kms`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" • ")} (.est)`;
}
