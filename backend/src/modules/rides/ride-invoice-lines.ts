import { resolveRidePayableTotal } from "./ride-invoice-summary.js";

function billNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export type RideInvoiceLine = {
  label: string;
  amount: number;
  isDiscount?: boolean;
};

export function buildRideInvoiceLinesFromSnapshot(input: {
  billingSnapshot: Record<string, unknown> | null | undefined;
  fareAmount?: string | null;
  tipAmount?: string | null;
  grandTotal?: string | null;
}): { lines: RideInvoiceLine[]; totalFare: number } {
  const snap =
    input.billingSnapshot != null && typeof input.billingSnapshot === "object"
      ? input.billingSnapshot
      : {};

  const tip = Math.max(0, billNum(input.tipAmount) || billNum(snap.tip_amount));
  const rideFare = Math.max(
    0,
    billNum(snap.ride_fare) ||
      billNum(snap.fare_amount) ||
      billNum(snap.item_total) ||
      billNum(input.fareAmount)
  );

  const platformFee = billNum(snap.platform_fee);
  const convenienceFee = billNum(snap.convenience_fee);
  const taxTotal = billNum(snap.tax_total);
  const waitingCharge = billNum(snap.waiting_charge) || billNum(snap.waiting_charges);
  const surgeCharge = billNum(snap.surge_fee) || billNum(snap.surge_charge);

  const lines: RideInvoiceLine[] = [{ label: "Ride Charge", amount: round2(rideFare) }];

  const pushFee = (label: string, amount: number) => {
    if (amount <= 0.005) return;
    if (lines.some((l) => l.label === label && Math.abs(l.amount - amount) < 0.01)) return;
    lines.push({ label, amount: round2(amount) });
  };

  const rawCharges = snap.charges;
  const hasChargeRows = Array.isArray(rawCharges) && rawCharges.length > 0;

  if (hasChargeRows) {
    for (const entry of rawCharges) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { label?: string; amount?: number; kind?: string };
      if (row.kind === "tax") continue;
      const label = String(row.label ?? "").trim();
      const amount = billNum(row.amount);
      if (!label || amount <= 0.005) continue;
      if (label.toLowerCase().includes("tip")) continue;
      pushFee(label, amount);
    }
  } else {
    if (platformFee > 0.005) pushFee("Booking fee", platformFee);
    if (convenienceFee > 0.005) pushFee("Convenience charges", convenienceFee);
    pushFee("Waiting charges", waitingCharge);
    pushFee("Surge pricing", surgeCharge);
  }

  const rawTaxes = snap.taxes;
  if (Array.isArray(rawTaxes) && rawTaxes.length > 0) {
    for (const entry of rawTaxes) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { label?: string; amount?: number };
      const label = String(row.label ?? "GST").trim() || "GST";
      pushFee(label, billNum(row.amount));
    }
  } else if (taxTotal > 0.005) {
    pushFee("GST", taxTotal);
  }

  if (hasChargeRows) {
    pushFee("Waiting charges", waitingCharge);
    pushFee("Surge pricing", surgeCharge);
  }

  if (tip > 0.005) {
    const tipAlreadyInCharges =
      hasChargeRows &&
      rawCharges.some((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const label = String((entry as { label?: string }).label ?? "").toLowerCase();
        return label.includes("tip");
      });
    if (!tipAlreadyInCharges) pushFee("Captain tip", tip);
  }

  const rawDiscounts = snap.discounts;
  let discountLinesAdded = false;
  if (Array.isArray(rawDiscounts)) {
    for (const entry of rawDiscounts) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { kind?: string; label?: string; amount?: number };
      if (row.kind && row.kind !== "discount") continue;
      const amount = billNum(row.amount);
      if (amount <= 0.005) continue;
      lines.push({
        label: String(row.label ?? "Discount").trim() || "Discount",
        amount: round2(amount),
        isDiscount: true,
      });
      discountLinesAdded = true;
    }
  }
  if (!discountLinesAdded) {
    const discountTotal = billNum(snap.discount_total);
    const offerDiscount = billNum(snap.ride_fare_offer_discount);
    const amount = discountTotal > 0.005 ? discountTotal : offerDiscount;
    if (amount > 0.005) {
      const coupon =
        typeof snap.ride_fare_coupon_code === "string" ? snap.ride_fare_coupon_code.trim() : "";
      lines.push({
        label: coupon || "Ride offer",
        amount: round2(amount),
        isDiscount: true,
      });
    }
  }

  const snapFinal = billNum(snap.final_amount);
  const grand = billNum(input.grandTotal);
  let totalFare = round2(snapFinal > 0 ? snapFinal : grand > 0 ? grand : rideFare + tip);
  totalFare = reconcileRideInvoiceTotal({
    rideFare,
    tip,
    lines,
    snapFinal,
    grand,
    totalFare,
  });

  return { lines, totalFare };
}

function reconcileRideInvoiceTotal(input: {
  rideFare: number;
  tip: number;
  lines: RideInvoiceLine[];
  snapFinal: number;
  grand: number;
  totalFare: number;
}): number {
  let computed = input.rideFare + input.tip;
  for (const line of input.lines) {
    if (line.isDiscount) computed -= line.amount;
    else if (!line.label.toLowerCase().includes("ride charge")) computed += line.amount;
  }
  computed = round2(Math.max(0, computed));
  const snapFinal = round2(input.snapFinal > 0 ? input.snapFinal : input.grand);
  if (snapFinal <= 0) return computed;
  const rideOnly = Math.abs(snapFinal - (input.rideFare + input.tip)) < 0.5;
  if (rideOnly && computed > snapFinal + 0.5) return computed;
  if (computed > snapFinal + 0.5) return computed;
  return snapFinal > 0 ? snapFinal : input.totalFare;
}

/** Build invoice lines from live billing engine output (matches checkout). */
export function buildRideInvoiceLinesFromBilling(billing: {
  item_total: number;
  final_amount: number;
  platform_fee: number;
  convenience_fee: number;
  tax_total: number;
  tip_amount: number;
  discount_total: number;
  charges: Array<{ label?: string; amount?: number; kind?: string }>;
  taxes: Array<{ label?: string; amount?: number }>;
  discounts: Array<{ label?: string; amount?: number }>;
}): { lines: RideInvoiceLine[]; totalFare: number } {
  const rideFare = round2(Math.max(0, billing.item_total));
  const lines: RideInvoiceLine[] = [{ label: "Ride Charge", amount: rideFare }];

  const pushFee = (label: string, amount: number) => {
    if (amount <= 0.005) return;
    if (lines.some((l) => l.label === label && Math.abs(l.amount - amount) < 0.01)) return;
    lines.push({ label, amount: round2(amount) });
  };

  const chargeRows = billing.charges ?? [];
  if (chargeRows.length > 0) {
    for (const row of chargeRows) {
      if (row.kind === "tax") continue;
      const label = String(row.label ?? "").trim() || "Charge";
      pushFee(label, billNum(row.amount));
    }
  } else {
    if (billing.platform_fee > 0.005) pushFee("Booking fee", billing.platform_fee);
    if (billing.convenience_fee > 0.005) pushFee("Convenience charges", billing.convenience_fee);
  }

  const taxRows = billing.taxes ?? [];
  if (taxRows.length > 0) {
    for (const row of taxRows) {
      const label = String(row.label ?? "GST").trim() || "GST";
      pushFee(label, billNum(row.amount));
    }
  } else if (billing.tax_total > 0.005) {
    pushFee("GST", billing.tax_total);
  }

  if (billing.tip_amount > 0.005) {
    const tipAlreadyInCharges = (billing.charges ?? []).some((row) => {
      const label = String(row.label ?? "").toLowerCase();
      return label.includes("tip");
    });
    if (!tipAlreadyInCharges) {
      pushFee("Captain tip", billing.tip_amount);
    }
  }

  const discountRows = billing.discounts ?? [];
  if (discountRows.length > 0) {
    for (const row of discountRows) {
      const amount = billNum(row.amount);
      if (amount <= 0.005) continue;
      lines.push({
        label: String(row.label ?? "Discount").trim() || "Discount",
        amount: round2(amount),
        isDiscount: true,
      });
    }
  } else if (billing.discount_total > 0.005) {
    lines.push({ label: "Discount applied", amount: round2(billing.discount_total), isDiscount: true });
  }

  const totalFare = resolveRidePayableTotal(billing);

  return { lines, totalFare };
}
