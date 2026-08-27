import type { RidePaymentFareLine } from "@/lib/ride-order-display";

export type RideFareBillApiResponse = {
  ok: true;
  rideFare: number;
  finalAmount: number;
  discountTotal: number;
  platformFee: number;
  convenienceFee: number;
  taxTotal: number;
  tipAmount: number;
  charges: Array<{ label?: string; amount?: number; kind?: string; hidden?: boolean }>;
  discounts: Array<{ label?: string; amount?: number; hidden?: boolean }>;
  taxes: Array<{ label?: string; amount?: number; hidden?: boolean }>;
  breakdownSteps?: Array<{ step?: string; amount?: number }>;
  rulesetVersion?: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Discount rows from persisted ride billing snapshot (payment-time offers). */
export function resolveSnapshotDiscountRows(
  snap: Record<string, unknown>
): Array<{ label: string; amount: number }> {
  const rawDiscounts = snap.discounts;
  if (Array.isArray(rawDiscounts) && rawDiscounts.length > 0) {
    const lines: Array<{ label: string; amount: number }> = [];
    for (const entry of rawDiscounts) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { kind?: string; label?: string; amount?: number };
      if (row.kind && row.kind !== "discount") continue;
      const amount = Math.round(num(row.amount) * 100) / 100;
      if (amount <= 0.005) continue;
      lines.push({
        label: String(row.label ?? "Discount").trim() || "Discount",
        amount,
      });
    }
    if (lines.length > 0) return lines;
  }

  const discountTotal = Math.round(num(snap.discount_total) * 100) / 100;
  if (discountTotal > 0.005) {
    return [{ label: "Discount applied", amount: discountTotal }];
  }

  const offerDiscount = Math.round(num(snap.ride_fare_offer_discount) * 100) / 100;
  if (offerDiscount > 0.005) {
    const coupon =
      typeof snap.ride_fare_coupon_code === "string" ? snap.ride_fare_coupon_code.trim() : "";
    return [{ label: coupon || "Ride offer", amount: offerDiscount }];
  }

  return [];
}

/** Build server-style fare bill from persisted order billing snapshot (matches checkout API shape). */
export function rideFareBillFromBillingSnapshot(input: {
  billingSnapshot?: Record<string, unknown> | null;
  totalAmount?: number | null;
  tipAmount?: number | null;
}): RideFareBillApiResponse | null {
  const snap = input.billingSnapshot ?? {};
  const rideFare = Math.max(
    0,
    num(snap.ride_fare) || num(snap.fare_amount) || num(snap.item_total)
  );
  const finalAmount =
    num(snap.final_amount) || (input.totalAmount != null ? num(input.totalAmount) : 0);
  if (rideFare <= 0 && finalAmount <= 0) return null;

  const tipAmount = Math.max(0, num(snap.tip_amount) || num(input.tipAmount));
  const discounts = resolveSnapshotDiscountRows(snap);
  const discountTotal =
    discounts.length > 0
      ? Math.round(discounts.reduce((sum, row) => sum + row.amount, 0) * 100) / 100
      : num(snap.discount_total);
  const platformFee = num(snap.platform_fee);
  const convenienceFee = num(snap.convenience_fee);
  const taxTotal = num(snap.tax_total);

  const rawCharges = Array.isArray(snap.charges) ? snap.charges : [];
  let charges = rawCharges.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const row = entry as { kind?: string; amount?: number; label?: string };
    if (row.kind === "tax" || row.kind === "discount") return false;
    const label = String(row.label ?? "").toLowerCase();
    if (label.includes("tip")) return false;
    return num(row.amount) > 0.005;
  }) as Array<{ label?: string; amount?: number; kind?: string }>;

  let taxes = Array.isArray(snap.taxes)
    ? (snap.taxes as Array<{ label?: string; amount?: number }>)
    : [];

  if (charges.length === 0) {
    charges = [];
    for (const entry of rawCharges) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { kind?: string; label?: string; amount?: number };
      if (row.kind === "tax" || row.kind === "discount") continue;
      const label = String(row.label ?? "").trim();
      const amount = num(row.amount);
      if (!label || amount <= 0.005) continue;
      if (label.toLowerCase().includes("tip")) continue;
      charges.push({ label, amount });
    }
  }
  if (charges.length === 0) {
    if (platformFee > 0.005) {
      const bookingLabel =
        rawCharges.find((entry) => {
          if (!entry || typeof entry !== "object") return false;
          const row = entry as { label?: string; meta?: { ruleId?: number } };
          return num(row.meta?.ruleId) > 0 || String(row.label ?? "").toLowerCase().includes("book");
        })?.label ?? "Booking fee";
      charges.push({
        label: String(bookingLabel).trim() || "Booking fee",
        amount: platformFee,
      });
    }
    if (convenienceFee > 0.005) {
      const convenienceLabel =
        rawCharges.find((entry) => {
          if (!entry || typeof entry !== "object") return false;
          return String((entry as { label?: string }).label ?? "")
            .toLowerCase()
            .includes("convenience");
        })?.label ?? "Convenience charges";
      charges.push({
        label: String(convenienceLabel).trim() || "Convenience charges",
        amount: convenienceFee,
      });
    }
    const surge = num(snap.surge_fee) || num(snap.surge_charge);
    if (surge > 0.005) charges.push({ label: "Surge pricing", amount: surge });
    const waiting = num(snap.waiting_charge) || num(snap.waiting_charges);
    if (waiting > 0.005) charges.push({ label: "Waiting charges", amount: waiting });
  }

  if (taxes.length === 0 && taxTotal > 0.005) {
    const hasGranularGst = rawCharges.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const label = String((entry as { label?: string }).label ?? "").toLowerCase();
      return label.includes("gst on") || label.includes("tax on");
    });
    if (!hasGranularGst) {
      taxes = [{ label: "GST", amount: taxTotal }];
    }
  }

  const draftBill: RideFareBillApiResponse = {
    ok: true,
    rideFare,
    finalAmount: finalAmount > 0 ? finalAmount : rideFare + tipAmount,
    discountTotal,
    platformFee,
    convenienceFee,
    taxTotal,
    tipAmount,
    charges,
    discounts,
    taxes,
  };

  const payableTotal = computeRideFarePayableTotal(draftBill);
  const paidAt =
    typeof snap.ride_fare_paid_at === "string" && snap.ride_fare_paid_at.trim().length > 0;
  const reconciledFinal =
    paidAt && finalAmount > 0 && Math.abs(finalAmount - payableTotal) <= 0.02
      ? finalAmount
      : payableTotal;

  return {
    ...draftBill,
    finalAmount: reconciledFinal,
  };
}

/** Payable total from bill parts — must match line-item sum (billing rules). */
export function computeRideFarePayableTotal(
  bill: RideFareBillApiResponse,
  extras?: { waitingCharge?: number; surgeCharge?: number }
): number {
  let waitingFromCharges = 0;
  let surgeFromCharges = 0;
  let total = bill.rideFare;

  for (const row of bill.charges ?? []) {
    if (row.kind === "tax" || row.kind === "discount") continue;
    const label = String(row.label ?? "").toLowerCase();
    if (label.includes("tip")) continue;
    const amount = num(row.amount);
    if (label.includes("waiting")) {
      waitingFromCharges += amount;
      continue;
    }
    if (label.includes("surge")) {
      surgeFromCharges += amount;
      continue;
    }
    total += amount;
  }
  for (const row of bill.taxes ?? []) total += num(row.amount);
  if (bill.tipAmount > 0.005) total += bill.tipAmount;

  total += Math.max(0, num(extras?.waitingCharge), waitingFromCharges);
  total += Math.max(0, num(extras?.surgeCharge), surgeFromCharges);

  const discountRows = (bill.discounts ?? []).reduce((sum, row) => sum + num(row.amount), 0);
  if (discountRows > 0.005) total -= discountRows;
  else if (bill.discountTotal > 0.005) total -= bill.discountTotal;

  return Math.max(0, Math.round(total * 100) / 100);
}

export function buildRideInvoiceLinesFromFareBill(
  bill: RideFareBillApiResponse,
  extras?: { waitingCharge?: number; surgeCharge?: number }
): { lines: Array<{ label: string; amount: number; isDiscount?: boolean }>; totalFare: number } {
  const { lines, payableTotal } = buildRideFareBillSummaryLines(bill, extras);
  return {
    totalFare: payableTotal,
    lines: lines
      .filter((line) => !line.emphasis)
      .map((line) => ({
        label: line.label === "Ride fare" ? "Ride Charge" : line.label,
        amount: line.amount,
        isDiscount: line.isDiscount,
      })),
  };
}

/** Bill summary lines from server billing engine — no client-side fee math. */
export function buildRideFareBillSummaryLines(
  bill: RideFareBillApiResponse,
  extras?: { waitingCharge?: number; surgeCharge?: number }
): { lines: RidePaymentFareLine[]; payableTotal: number } {
  const lines: RidePaymentFareLine[] = [];
  const seen = new Set<string>();
  const stepLabels = new Set<string>();

  const normalizeLabel = (label: string) => label.trim().toLowerCase();

  const push = (
    label: string,
    amount: number,
    opts?: { emphasis?: boolean; isDiscount?: boolean }
  ) => {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 0.005 && !opts?.emphasis) return;
    const labelLower = normalizeLabel(label);
    if (labelLower.includes("tip") && lines.some((l) => normalizeLabel(l.label).includes("tip"))) {
      return;
    }
    const key = `${labelLower}:${rounded}:${opts?.isDiscount ? "d" : "c"}:${opts?.emphasis ? "t" : "n"}`;
    if (seen.has(key)) return;
    seen.add(key);
    stepLabels.add(labelLower);
    lines.push({
      label: label.trim() || "Charge",
      amount: rounded,
      emphasis: opts?.emphasis,
      isDiscount: opts?.isDiscount,
    });
  };

  push("Ride fare", bill.rideFare);

  const breakdownSteps = bill.breakdownSteps ?? [];
  if (breakdownSteps.length > 0) {
    for (const step of breakdownSteps) {
      const label = String(step.step ?? "").trim();
      const amount = num(step.amount);
      if (!label) continue;
      const labelLower = normalizeLabel(label);
      if (labelLower.includes("tip")) continue;
      if (amount < -0.005) {
        push(label, Math.abs(amount), { isDiscount: true });
      } else if (amount > 0.005) {
        push(label, amount);
      }
    }
  } else {
    for (const row of bill.charges ?? []) {
      if (row.hidden) continue;
      if (row.kind === "tax" || row.kind === "discount") continue;
      const label = String(row.label ?? "").trim();
      const labelLower = normalizeLabel(label);
      if (!label || labelLower.includes("tip")) continue;
      if (labelLower.includes("gst") || labelLower.includes("tax")) continue;
      push(label, num(row.amount));
    }

    const visibleTaxes = (bill.taxes ?? []).filter((row) => !row.hidden);
    const hasGranularGst = visibleTaxes.some((row) => {
      const labelLower = normalizeLabel(String(row.label ?? ""));
      return labelLower.includes("gst on") || labelLower.includes("tax on");
    });

    for (const row of visibleTaxes) {
      const label = String(row.label ?? "GST").trim() || "GST";
      const amount = num(row.amount);
      if (amount <= 0.005) continue;
      const labelLower = normalizeLabel(label);
      if (
        hasGranularGst &&
        (labelLower === "gst" || labelLower === "gst & taxes") &&
        Math.abs(amount - bill.taxTotal) < 0.05
      ) {
        continue;
      }
      push(label, amount);
    }
  }

  for (const row of bill.charges ?? []) {
    if (row.hidden) continue;
    if (row.kind === "tax" || row.kind === "discount") continue;
    const label = String(row.label ?? "").trim();
    const labelLower = normalizeLabel(label);
    if (!label || labelLower.includes("tip")) continue;
    if (stepLabels.has(labelLower)) continue;
    if (labelLower.includes("gst") || labelLower.includes("tax")) continue;
    push(label, num(row.amount));
  }

  const waiting = Math.max(0, num(extras?.waitingCharge));
  const surge = Math.max(0, num(extras?.surgeCharge));
  if (waiting > 0 && ![...stepLabels].some((l) => l.includes("waiting"))) {
    push("Waiting charges", waiting);
  }
  if (surge > 0 && ![...stepLabels].some((l) => l.includes("surge"))) {
    push("Surge pricing", surge);
  }

  if (bill.tipAmount > 0.005) {
    push("Captain tip", bill.tipAmount);
  }

  const hasDiscountLine = lines.some((line) => line.isDiscount);
  if (!hasDiscountLine) {
    const discountRows = bill.discounts ?? [];
    if (discountRows.length > 0) {
      for (const row of discountRows) {
        if (row.hidden) continue;
        const label = String(row.label ?? "Discount").trim() || "Discount";
        const amount = num(row.amount);
        if (amount > 0.005) push(label, amount, { isDiscount: true });
      }
    } else if (bill.discountTotal > 0.005) {
      push("Discount applied", bill.discountTotal, { isDiscount: true });
    }
  }

  const fromParts = computeRideFarePayableTotal(bill, extras);
  const fromFinal =
    bill.finalAmount > 0.005 ? Math.round(bill.finalAmount * 100) / 100 : 0;
  const payableTotal = Math.max(fromParts, fromFinal);

  push("Total fare", payableTotal, { emphasis: true });

  return { lines, payableTotal };
}

export type RideGstBreakdownLine = {
  key: string;
  label: string;
  amount: number;
};

export type RideCheckoutCompactBill = {
  rideFare: number;
  bookingFee: number;
  gstTotal: number;
  gstLines: RideGstBreakdownLine[];
  grandTotal: number;
  discounts: Array<{ label: string; amount: number }>;
  extraLines: Array<{ label: string; amount: number }>;
  payableTotal: number;
};

function isRideTaxLabel(label: string): boolean {
  const lower = label.trim().toLowerCase();
  return lower.includes("gst") || lower.includes("tax");
}

function isRideTipLabel(label: string): boolean {
  return label.trim().toLowerCase().includes("tip");
}

/** Zomato-style checkout bill — ride fare, booking fee, GST total + popup breakdown lines. */
export function buildRideCheckoutCompactBill(
  bill: RideFareBillApiResponse,
  extras?: { waitingCharge?: number; surgeCharge?: number }
): RideCheckoutCompactBill {
  const normalizeLabel = (label: string) => label.trim().toLowerCase();
  const rideFare = Math.round(bill.rideFare * 100) / 100;

  let bookingFee = 0;
  for (const row of bill.charges ?? []) {
    if (row.hidden || row.kind === "tax" || row.kind === "discount") continue;
    const label = String(row.label ?? "").trim();
    if (!label || isRideTipLabel(label) || isRideTaxLabel(label)) continue;
    const labelLower = normalizeLabel(label);
    if (labelLower.includes("waiting") || labelLower.includes("surge")) continue;
    bookingFee += num(row.amount);
  }
  bookingFee = Math.round(bookingFee * 100) / 100;

  const visibleTaxes = (bill.taxes ?? []).filter((row) => !row.hidden);
  const hasGranularGst = visibleTaxes.some((row) => {
    const labelLower = normalizeLabel(String(row.label ?? ""));
    return labelLower.includes("gst on") || labelLower.includes("tax on");
  });

  const gstLines: RideGstBreakdownLine[] = [];
  for (const row of visibleTaxes) {
    const label = String(row.label ?? "GST").trim() || "GST";
    const amount = num(row.amount);
    if (amount <= 0.005) continue;
    const labelLower = normalizeLabel(label);
    if (
      hasGranularGst &&
      (labelLower === "gst" || labelLower === "gst & taxes") &&
      Math.abs(amount - bill.taxTotal) < 0.05
    ) {
      continue;
    }
    gstLines.push({
      key: labelLower,
      label,
      amount: Math.round(amount * 100) / 100,
    });
  }

  const gstFromLines = Math.round(gstLines.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  const gstTotal =
    bill.taxTotal > 0.005
      ? Math.round(bill.taxTotal * 100) / 100
      : gstFromLines;

  const extraLines: Array<{ label: string; amount: number }> = [];
  const waiting = Math.max(0, num(extras?.waitingCharge));
  const surge = Math.max(0, num(extras?.surgeCharge));
  if (waiting > 0.005) {
    extraLines.push({ label: "Waiting charges", amount: Math.round(waiting * 100) / 100 });
  }
  if (surge > 0.005) {
    extraLines.push({ label: "Surge pricing", amount: Math.round(surge * 100) / 100 });
  }
  if (bill.tipAmount > 0.005) {
    extraLines.push({
      label: "Captain tip",
      amount: Math.round(bill.tipAmount * 100) / 100,
    });
  }

  const discounts: Array<{ label: string; amount: number }> = [];
  for (const row of bill.discounts ?? []) {
    if (row.hidden) continue;
    const amount = num(row.amount);
    if (amount <= 0.005) continue;
    discounts.push({
      label: String(row.label ?? "Discount").trim() || "Discount",
      amount: Math.round(amount * 100) / 100,
    });
  }
  if (discounts.length === 0 && bill.discountTotal > 0.005) {
    discounts.push({
      label: "Discount applied",
      amount: Math.round(bill.discountTotal * 100) / 100,
    });
  }

  const fromParts = computeRideFarePayableTotal(bill, extras);
  const fromFinal =
    bill.finalAmount > 0.005 ? Math.round(bill.finalAmount * 100) / 100 : 0;
  const payableTotal = Math.max(fromParts, fromFinal);

  return {
    rideFare,
    bookingFee,
    gstTotal,
    gstLines,
    grandTotal: payableTotal,
    discounts,
    extraLines,
    payableTotal,
  };
}
