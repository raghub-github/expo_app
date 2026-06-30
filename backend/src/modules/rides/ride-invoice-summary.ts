/**
 * Single source of truth for Rapido-style payment summary (page 1 / email header).
 * Platform fees ONLY from platform_fee + convenience_fee + their GST — never (total − item_total).
 */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

type GstBucket = {
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  total: number;
};

function readGstBucket(
  snap: Record<string, unknown>,
  key: string,
  fallbackTaxable: number,
  defaultRate = 0.18
): GstBucket {
  const gc =
    snap.gst_components && typeof snap.gst_components === "object"
      ? (snap.gst_components as Record<string, unknown>)
      : null;
  const raw =
    gc?.[key] && typeof gc[key] === "object"
      ? (gc[key] as Record<string, unknown>)
      : null;
  const taxable = round2(num(raw?.taxable_value) || fallbackTaxable);
  let gst = round2(num(raw?.gst));
  if (gst <= 0 && taxable > 0) gst = round2(taxable * defaultRate);
  const cgst = round2(gst / 2);
  const sgst = round2(gst - cgst);
  return { taxable, gst, cgst, sgst, total: round2(taxable + gst) };
}

export type InvoiceDiscountLine = {
  label: string;
  amount: number;
};

export type RapidoPaymentSummary = {
  totalFare: number;
  /** Gross ride charge before discounts (page 1). */
  rideChargeGross: number;
  /** Net ride charge after discounts (tax invoice page 2). */
  rideCharge: number;
  bookingFeesConvenience: number;
  platformBookingFee: number;
  platformConvenienceFee: number;
  platformGstCgst: number;
  platformGstSgst: number;
  platformFinalAmount: number;
  captainFee: number;
  rideCgst: number;
  rideSgst: number;
  discounts: InvoiceDiscountLine[];
  discountTotal: number;
};

function resolvePlatformFees(snap: Record<string, unknown>): {
  bookingFee: number;
  convenienceFee: number;
  platformCgst: number;
  platformSgst: number;
  platformFinalAmount: number;
} {
  let bookingFee = round2(num(snap.platform_fee));
  let convenienceFee = round2(num(snap.convenience_fee));

  const platformGst = readGstBucket(snap, "platform", bookingFee, 0.18);
  const convenienceGst = readGstBucket(snap, "convenience", convenienceFee, 0.18);

  const rawCharges = snap.charges;
  if (bookingFee <= 0.005 && convenienceFee <= 0.005 && Array.isArray(rawCharges)) {
    for (const row of rawCharges) {
      if (!row || typeof row !== "object" || row.kind === "tax") continue;
      const label = String(row.label ?? "").toLowerCase();
      const amount = num(row.amount);
      if (label.includes("booking") || label.includes("platform")) bookingFee += amount;
      else if (label.includes("convenience")) convenienceFee += amount;
    }
    bookingFee = round2(bookingFee);
    convenienceFee = round2(convenienceFee);
  }

  let platformCgst = round2(platformGst.cgst + convenienceGst.cgst);
  let platformSgst = round2(platformGst.sgst + convenienceGst.sgst);
  const subTotal = round2(bookingFee + convenienceFee);
  let platformFinalAmount = round2(subTotal + platformCgst + platformSgst);

  if (platformFinalAmount <= 0.005) {
    platformFinalAmount = round2(platformGst.total + convenienceGst.total);
  }

  if (platformFinalAmount <= 0.005 && subTotal > 0.005) {
    const gstTotal = round2(subTotal * 0.18);
    platformCgst = round2(gstTotal / 2);
    platformSgst = round2(gstTotal - platformCgst);
    platformFinalAmount = round2(subTotal + platformCgst + platformSgst);
  }

  return { bookingFee, convenienceFee, platformCgst, platformSgst, platformFinalAmount };
}

export function resolveInvoiceDiscounts(
  snap: Record<string, unknown> | null | undefined
): InvoiceDiscountLine[] {
  const snapObj = snap != null && typeof snap === "object" ? snap : {};
  const rawDiscounts = snapObj.discounts;
  if (Array.isArray(rawDiscounts) && rawDiscounts.length > 0) {
    const lines: InvoiceDiscountLine[] = [];
    for (const entry of rawDiscounts) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { kind?: string; label?: string; amount?: number };
      if (row.kind && row.kind !== "discount") continue;
      const amount = round2(num(row.amount));
      if (amount <= 0.005) continue;
      lines.push({
        label: String(row.label ?? "Discount").trim() || "Discount",
        amount,
      });
    }
    if (lines.length > 0) return lines;
  }

  const discountTotal = round2(num(snapObj.discount_total));
  if (discountTotal > 0.005) {
    return [{ label: "Discount applied", amount: discountTotal }];
  }

  const offerDiscount = round2(num(snapObj.ride_fare_offer_discount));
  if (offerDiscount > 0.005) {
    const coupon =
      typeof snapObj.ride_fare_coupon_code === "string"
        ? snapObj.ride_fare_coupon_code.trim()
        : "";
    return [{ label: coupon || "Ride offer", amount: offerDiscount }];
  }

  return [];
}

/** Tip paid by customer — excluded from PDF/email tax invoice totals. */
export function resolveTipAmount(snap: Record<string, unknown> | null | undefined): number {
  const snapObj = snap != null && typeof snap === "object" ? snap : {};
  const direct = round2(num(snapObj.tip_amount));
  if (direct > 0.005) return direct;

  const rawCharges = snapObj.charges;
  if (!Array.isArray(rawCharges)) return 0;

  let tip = 0;
  for (const row of rawCharges) {
    if (!row || typeof row !== "object" || row.kind === "tax") continue;
    const label = String(row.label ?? "").toLowerCase();
    if (label.includes("tip")) tip += num(row.amount);
  }
  return round2(tip);
}

/** Invoice/PDF total — payable amount minus tip. */
export function resolveInvoiceTotalExclTip(
  snap: Record<string, unknown> | null | undefined,
  paidTotal?: number
): number {
  const snapObj = snap != null && typeof snap === "object" ? snap : {};
  const total = round2(num(snapObj.final_amount) || num(paidTotal));
  const tip = resolveTipAmount(snapObj);
  if (tip <= 0.005) return total;
  return round2(Math.max(0, total - tip));
}

/** Rapido page-1: Ride Charge + Booking Fees & Convenience = Total (inclusive). Tip excluded when requested. */
export function resolveRapidoPaymentSummary(
  snap: Record<string, unknown> | null | undefined,
  totalFareInput?: number,
  opts?: { excludeTip?: boolean }
): RapidoPaymentSummary {
  const snapObj = snap != null && typeof snap === "object" ? snap : {};
  let totalFare = round2(num(snapObj.final_amount) || num(totalFareInput));
  if (opts?.excludeTip === true) {
    totalFare = resolveInvoiceTotalExclTip(snapObj, totalFare);
  }

  const platform = resolvePlatformFees(snapObj);
  const bookingFeesConvenience = platform.platformFinalAmount;
  const rideCharge = round2(Math.max(0, totalFare - bookingFeesConvenience));
  const discounts = resolveInvoiceDiscounts(snapObj);
  const discountTotal = round2(discounts.reduce((sum, row) => sum + row.amount, 0));
  const rideChargeGross = round2(rideCharge + discountTotal);

  const rideGst = readGstBucket(snapObj, "items", rideCharge, 0.05);
  let captainFee = rideGst.taxable;
  let rideCgst = rideGst.cgst;
  let rideSgst = rideGst.sgst;

  const ridePartsSum = round2(captainFee + rideCgst + rideSgst);
  if (rideCharge > 0 && Math.abs(ridePartsSum - rideCharge) > 0.05) {
    captainFee = round2(rideCharge / 1.05);
    const gstTotal = round2(rideCharge - captainFee);
    rideCgst = round2(gstTotal / 2);
    rideSgst = round2(gstTotal - rideCgst);
  }

  return {
    totalFare,
    rideChargeGross,
    rideCharge,
    bookingFeesConvenience,
    platformBookingFee: platform.bookingFee,
    platformConvenienceFee: platform.convenienceFee,
    platformGstCgst: platform.platformCgst,
    platformGstSgst: platform.platformSgst,
    platformFinalAmount: platform.platformFinalAmount,
    captainFee,
    rideCgst,
    rideSgst,
    discounts,
    discountTotal,
  };
}

/** Authoritative payable total from billing engine output. */
export function resolveRidePayableTotal(billing: {
  final_amount: number;
}): number {
  return round2(Math.max(0, billing.final_amount));
}
