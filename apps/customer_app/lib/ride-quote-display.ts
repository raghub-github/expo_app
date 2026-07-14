import type { RideFareQuote } from "@/services/rideQuote.service";

export type RideQuoteBillingLine = {
  label: string;
  amount: number;
};

/** Slab-quoted ride fare (excludes billing surcharges) — used for server placement validation. */
export function resolveRideQuoteSlabFare(quote: Pick<RideFareQuote, "finalFare">): number {
  const slab = quote.finalFare;
  if (!Number.isFinite(slab) || slab <= 0) return 0;
  return Math.round(slab);
}

/** Customer-payable total including platform/booking fees and GST when billing is present. */
export function resolveRideQuotePayableAmount(
  quote: Pick<RideFareQuote, "finalFare" | "billing">
): number {
  const billed = quote.billing?.finalAmount;
  if (billed != null && Number.isFinite(billed) && billed > 0) {
    return Math.round(billed);
  }
  return resolveRideQuoteSlabFare(quote);
}

export function buildRideQuoteBillingLines(quote: RideFareQuote): RideQuoteBillingLine[] {
  const billing = quote.billing;
  const lines: RideQuoteBillingLine[] = [];
  const seen = new Set<string>();

  const push = (label: string, amount: number) => {
    const rounded = Math.round(amount);
    if (!Number.isFinite(rounded) || rounded <= 0) return;
    const key = `${label}:${rounded}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ label, amount: rounded });
  };

  push("Ride fare", billing?.rideFare ?? quote.finalFare);

  const platformFee = billing?.platformFee ?? 0;
  const convenienceFee = billing?.convenienceFee ?? 0;
  if (platformFee > 0) push("Platform fee", platformFee);
  if (convenienceFee > 0) push("Booking fee", convenienceFee);

  for (const charge of billing?.charges ?? []) {
    const label = String(charge.label ?? "").trim();
    const amount = Number(charge.amount ?? 0);
    if (!label || amount <= 0) continue;
    if (label.toLowerCase().includes("platform")) continue;
    if (label.toLowerCase().includes("booking") || label.toLowerCase().includes("convenience")) {
      continue;
    }
    push(label, amount);
  }

  const taxTotal = billing?.taxTotal ?? 0;
  if (taxTotal > 0) {
    push("GST & taxes", taxTotal);
  } else {
    for (const tax of billing?.taxes ?? []) {
      const label = String(tax.label ?? "").trim();
      const amount = Number(tax.amount ?? 0);
      if (!label || amount <= 0) continue;
      push(label, amount);
    }
  }

  return lines;
}
