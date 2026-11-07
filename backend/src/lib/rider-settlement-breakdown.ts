/**
 * Rider settlement breakdown — backend SSOT explaining dispatch/accept quote
 * vs final wallet credit. Never invent reasons in the frontend; only surface
 * what this module produces from recorded snapshots + ledger totals.
 */

import { getDb } from "../db/client.js";
import { ordersCore } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  readRideRiderPayoutSnapshot,
  type RideRiderPayoutSnapshot,
} from "./ride-rider-payout-snapshot.js";
import { restoreCustomerDeliveryFieldsInSnapshot } from "./customer-delivery-fee.js";

export type RiderSettlementDifferenceReasonCode =
  | "OFFER_MATCHED"
  | "WAITING_AFTER_PICKUP"
  | "DISTANCE_ADJUSTMENT"
  | "SURGE_ADJUSTMENT"
  | "ADDITIONAL_ELIGIBLE_CHARGE"
  | "DEDUCTION"
  | "CANCELLATION_ADJUSTMENT"
  | "TIP_INCLUDED"
  | "DYNAMIC_INCENTIVE"
  | "PROMISE_FLOOR_HONOURED"
  | "PAID_RIDE_SETTLEMENT_ENGINE"
  | "MULTIPLE_ADJUSTMENTS"
  | "INVESTIGATION_REQUIRED";

export type RiderSettlementBreakdownComponent = {
  code: string;
  label: string;
  amount: number;
};

/** Snake_case payload persisted on billing_snapshot + returned to Rider App. */
export type RiderSettlementBreakdown = {
  dispatch_offer_amount: number;
  accepted_quote_amount: number;
  dispatch_quoted_distance_km: number | null;
  accepted_distance_km: number | null;
  final_billable_distance_km: number | null;
  final_base_earning: number;
  final_distance_earning: number;
  waiting_charge: number;
  additional_earning: number;
  deductions: number;
  cancellation_adjustment: number;
  final_settlement_amount: number;
  wallet_credited_amount: number;
  difference_amount: number;
  difference_reason_code: RiderSettlementDifferenceReasonCode;
  difference_reason_text: string;
  pricing_version: string | null;
  quote_id: string | null;
  settlement_id: string | null;
  investigation_required: boolean;
  components: RiderSettlementBreakdownComponent[];
  generated_at: string;
};

/** CamelCase mirror for RiderOrderSummary / OpenAPI. */
export type RiderSettlementBreakdownDto = {
  dispatchOfferAmount: number;
  acceptedQuoteAmount: number;
  dispatchQuotedDistanceKm: number | null;
  acceptedDistanceKm: number | null;
  finalBillableDistanceKm: number | null;
  finalBaseEarning: number;
  finalDistanceEarning: number;
  waitingCharge: number;
  additionalEarning: number;
  deductions: number;
  cancellationAdjustment: number;
  finalSettlementAmount: number;
  walletCreditedAmount: number;
  differenceAmount: number;
  differenceReasonCode: RiderSettlementDifferenceReasonCode;
  differenceReasonText: string;
  pricingVersion: string | null;
  quoteId: string | null;
  settlementId: string | null;
  investigationRequired: boolean;
  components: RiderSettlementBreakdownComponent[];
  generatedAt: string;
};

const RUPEE_TOLERANCE = 0.5;
const PRICING_VERSION = "rider_payout_v3.2";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? round2(v) : 0;
}

function formatSignedRupee(n: number): string {
  const abs = Math.abs(round2(n));
  const formatted = `₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  if (n > RUPEE_TOLERANCE) return `+${formatted}`;
  if (n < -RUPEE_TOLERANCE) return `−${formatted}`;
  return formatted;
}

function parseStandaloneSnapshot(raw: unknown): RideRiderPayoutSnapshot | null {
  if (raw == null || typeof raw !== "object") return null;
  // Reuse billing reader by wrapping.
  return readRideRiderPayoutSnapshot({ rider_payout_snapshot: raw });
}

export function toRiderSettlementBreakdownDto(
  b: RiderSettlementBreakdown
): RiderSettlementBreakdownDto {
  return {
    dispatchOfferAmount: b.dispatch_offer_amount,
    acceptedQuoteAmount: b.accepted_quote_amount,
    dispatchQuotedDistanceKm: b.dispatch_quoted_distance_km,
    acceptedDistanceKm: b.accepted_distance_km,
    finalBillableDistanceKm: b.final_billable_distance_km,
    finalBaseEarning: b.final_base_earning,
    finalDistanceEarning: b.final_distance_earning,
    waitingCharge: b.waiting_charge,
    additionalEarning: b.additional_earning,
    deductions: b.deductions,
    cancellationAdjustment: b.cancellation_adjustment,
    finalSettlementAmount: b.final_settlement_amount,
    walletCreditedAmount: b.wallet_credited_amount,
    differenceAmount: b.difference_amount,
    differenceReasonCode: b.difference_reason_code,
    differenceReasonText: b.difference_reason_text,
    pricingVersion: b.pricing_version,
    quoteId: b.quote_id,
    settlementId: b.settlement_id,
    investigationRequired: b.investigation_required,
    components: b.components,
    generatedAt: b.generated_at,
  };
}

export function readRiderSettlementBreakdown(
  billingSnapshot: unknown
): RiderSettlementBreakdown | null {
  if (billingSnapshot == null || typeof billingSnapshot !== "object") return null;
  const raw = (billingSnapshot as Record<string, unknown>).rider_settlement_breakdown;
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const finalAmt = money(o.final_settlement_amount);
  const code = String(o.difference_reason_code ?? "").trim();
  if (!code) return null;
  return {
    dispatch_offer_amount: money(o.dispatch_offer_amount),
    accepted_quote_amount: money(o.accepted_quote_amount),
    dispatch_quoted_distance_km:
      o.dispatch_quoted_distance_km == null ? null : money(o.dispatch_quoted_distance_km),
    accepted_distance_km:
      o.accepted_distance_km == null ? null : money(o.accepted_distance_km),
    final_billable_distance_km:
      o.final_billable_distance_km == null ? null : money(o.final_billable_distance_km),
    final_base_earning: money(o.final_base_earning),
    final_distance_earning: money(o.final_distance_earning),
    waiting_charge: money(o.waiting_charge),
    additional_earning: money(o.additional_earning),
    deductions: money(o.deductions),
    cancellation_adjustment: money(o.cancellation_adjustment),
    final_settlement_amount: finalAmt,
    wallet_credited_amount: money(o.wallet_credited_amount ?? finalAmt),
    difference_amount: money(o.difference_amount),
    difference_reason_code: code as RiderSettlementDifferenceReasonCode,
    difference_reason_text: String(o.difference_reason_text ?? "").trim() || "—",
    pricing_version:
      o.pricing_version != null ? String(o.pricing_version) : PRICING_VERSION,
    quote_id: o.quote_id != null ? String(o.quote_id) : null,
    settlement_id: o.settlement_id != null ? String(o.settlement_id) : null,
    investigation_required: Boolean(o.investigation_required),
    components: Array.isArray(o.components)
      ? (o.components as RiderSettlementBreakdownComponent[])
          .filter((c) => c && typeof c === "object")
          .map((c) => ({
            code: String(c.code ?? ""),
            label: String(c.label ?? ""),
            amount: money(c.amount),
          }))
      : [],
    generated_at: String(o.generated_at ?? ""),
  };
}

export type BuildRiderSettlementBreakdownInput = {
  /** Frozen accept / dispatch promise (prefer accept_payout_snapshot). */
  acceptedSnapshot: RideRiderPayoutSnapshot | null;
  /** Current billing rider_payout_snapshot (may include post-accept waiting). */
  finalSnapshot: RideRiderPayoutSnapshot | null;
  /** Actual wallet credit total for this order (ledger). */
  walletCreditedAmount: number;
  /** Tip credited separately (not part of dispatch offer). */
  tipAmount?: number;
  /** Dynamic incentive credited as its own ledger line. */
  dynamicIncentiveAmount?: number;
  /** Explicit cancellation fee/credit for rider (signed). */
  cancellationAdjustment?: number;
  /** Explicit deductions (positive number = money taken from rider). */
  deductions?: number;
  /** Other evidenced additional earning (company subsidy, etc.). */
  additionalEarning?: number;
  /** Final billable trip km if known. */
  finalBillableDistanceKm?: number | null;
  quoteId?: string | null;
  settlementId?: string | null;
  /** When true, final came from rideSettlement.engine rather than v3 legs. */
  paidRideSettlementEngine?: boolean;
  /** Promise floor raised recomputed legs up to accept amount. */
  promiseFloorHonoured?: boolean;
};

type ExplainedDelta = {
  code: RiderSettlementDifferenceReasonCode;
  text: string;
  amount: number;
  componentCode: string;
  componentLabel: string;
};

/**
 * Pure builder — unit-testable. Reasons are only emitted when component
 * evidence exists; unexplained residual → INVESTIGATION_REQUIRED.
 */
export function buildRiderSettlementBreakdown(
  input: BuildRiderSettlementBreakdownInput
): RiderSettlementBreakdown {
  const accept = input.acceptedSnapshot;
  const finalSnap = input.finalSnapshot ?? accept;

  const acceptedQuote = money(accept?.totalEarning ?? 0);
  const dispatchOffer = acceptedQuote; // accept freeze is the contractual dispatch quote

  const finalBase = money(finalSnap?.baseEarning ?? 0);
  const finalWaiting = money(finalSnap?.waitingEarning ?? 0);
  const finalSurge = money(finalSnap?.surgeEarning ?? 0);
  const tip = money(input.tipAmount);
  const dynamicIncentive = money(input.dynamicIncentiveAmount);
  const cancellationAdj = money(input.cancellationAdjustment);
  const deductions = Math.max(0, money(input.deductions));
  const extraAdditional = money(input.additionalEarning);

  const walletCredited = money(input.walletCreditedAmount);
  // Prefer ledger as final settlement when present; else snapshot composition + tip.
  const composedFinal =
    walletCredited > 0
      ? walletCredited
      : round2(
          finalBase +
            finalWaiting +
            finalSurge +
            tip +
            Math.max(0, extraAdditional) +
            cancellationAdj -
            deductions
        );

  const acceptBase = money(accept?.baseEarning ?? 0);
  const acceptWaiting = money(accept?.waitingEarning ?? 0);
  const acceptSurge = money(accept?.surgeEarning ?? 0);

  const deltaWaiting = round2(finalWaiting - acceptWaiting);
  const deltaBase = round2(finalBase - acceptBase);
  const deltaSurge = round2(finalSurge - acceptSurge);

  const explained: ExplainedDelta[] = [];

  if (Math.abs(deltaWaiting) > RUPEE_TOLERANCE) {
    explained.push({
      code: "WAITING_AFTER_PICKUP",
      text:
        deltaWaiting > 0
          ? `${formatSignedRupee(deltaWaiting)} — Additional waiting charge after pickup.`
          : `${formatSignedRupee(deltaWaiting)} — Waiting charge reduced vs accepted quote.`,
      amount: deltaWaiting,
      componentCode: "waiting",
      componentLabel: "Waiting charge",
    });
  }

  if (Math.abs(deltaBase) > RUPEE_TOLERANCE) {
    const distAccept = accept?.tripDistanceKm ?? null;
    const distFinal =
      input.finalBillableDistanceKm ?? finalSnap?.tripDistanceKm ?? null;
    const distanceChanged =
      distAccept != null &&
      distFinal != null &&
      Math.abs(distAccept - distFinal) > 0.05;
    explained.push({
      code: distanceChanged ? "DISTANCE_ADJUSTMENT" : "ADDITIONAL_ELIGIBLE_CHARGE",
      text: distanceChanged
        ? `${formatSignedRupee(deltaBase)} — Final billable distance ${
            (distFinal ?? 0) > (distAccept ?? 0) ? "increased" : "was lower"
          } due to an approved route adjustment.`
        : `${formatSignedRupee(deltaBase)} — Base earning adjusted vs accepted quote.`,
      amount: deltaBase,
      componentCode: "base",
      componentLabel: "Base earning",
    });
  }

  if (Math.abs(deltaSurge) > RUPEE_TOLERANCE) {
    explained.push({
      code: "SURGE_ADJUSTMENT",
      text: `${formatSignedRupee(deltaSurge)} — Surge / incentive component changed vs accepted quote.`,
      amount: deltaSurge,
      componentCode: "surge",
      componentLabel: "Surge",
    });
  }

  // Tip already inside accepted total must not re-appear as a +diff explanation.
  const tipInAccept = accept
    ? Math.max(
        0,
        round2(acceptedQuote - acceptBase - acceptWaiting - acceptSurge)
      )
    : 0;
  const tipDelta = round2(tip - tipInAccept);
  if (Math.abs(tipDelta) > RUPEE_TOLERANCE) {
    explained.push({
      code: "TIP_INCLUDED",
      text: `${formatSignedRupee(tipDelta)} — Customer tip credited at settlement.`,
      amount: tipDelta,
      componentCode: "tip",
      componentLabel: "Customer tip",
    });
  }

  // Dynamic incentive is usually inside accept surge; only explain if it is
  // credited beyond what accept already counted (wallet - accept > surge delta).
  if (
    dynamicIncentive > RUPEE_TOLERANCE &&
    Math.abs(deltaSurge) <= RUPEE_TOLERANCE &&
    tip <= RUPEE_TOLERANCE &&
    Math.abs(deltaWaiting) <= RUPEE_TOLERANCE &&
    Math.abs(deltaBase) <= RUPEE_TOLERANCE
  ) {
    // Tip/waiting/base unchanged — incentive already in accept; no extra line.
  }

  if (extraAdditional > RUPEE_TOLERANCE) {
    explained.push({
      code: "ADDITIONAL_ELIGIBLE_CHARGE",
      text: `${formatSignedRupee(extraAdditional)} — Additional eligible service charge.`,
      amount: extraAdditional,
      componentCode: "additional",
      componentLabel: "Additional earning",
    });
  }

  if (deductions > RUPEE_TOLERANCE) {
    explained.push({
      code: "DEDUCTION",
      text: `${formatSignedRupee(-deductions)} — Deduction applied at settlement.`,
      amount: -deductions,
      componentCode: "deduction",
      componentLabel: "Deduction",
    });
  }

  if (Math.abs(cancellationAdj) > RUPEE_TOLERANCE) {
    explained.push({
      code: "CANCELLATION_ADJUSTMENT",
      text: `${formatSignedRupee(cancellationAdj)} — Cancellation policy adjustment.`,
      amount: cancellationAdj,
      componentCode: "cancellation",
      componentLabel: "Cancellation adjustment",
    });
  }

  if (input.promiseFloorHonoured) {
    explained.push({
      code: "PROMISE_FLOOR_HONOURED",
      text: `Offer amount matched — accepted quote honouring (promise floor).`,
      amount: 0,
      componentCode: "promise_floor",
      componentLabel: "Promise floor",
    });
  }

  if (input.paidRideSettlementEngine && Math.abs(composedFinal - acceptedQuote) > RUPEE_TOLERANCE) {
    explained.push({
      code: "PAID_RIDE_SETTLEMENT_ENGINE",
      text: `${formatSignedRupee(composedFinal - acceptedQuote)} — Paid ride settlement engine vs accept snapshot.`,
      amount: round2(composedFinal - acceptedQuote),
      componentCode: "ride_settlement",
      componentLabel: "Ride settlement",
    });
  }

  const difference = round2(composedFinal - acceptedQuote);
  const explainedSum = round2(explained.reduce((s, e) => s + e.amount, 0));
  const residual = round2(difference - explainedSum);

  let reasonCode: RiderSettlementDifferenceReasonCode;
  let reasonText: string;
  let investigationRequired = false;

  if (Math.abs(difference) <= RUPEE_TOLERANCE) {
    reasonCode = "OFFER_MATCHED";
    reasonText = "Offer amount matched";
  } else if (Math.abs(residual) <= RUPEE_TOLERANCE && explained.length === 1) {
    reasonCode = explained[0]!.code;
    reasonText = explained[0]!.text;
  } else if (Math.abs(residual) <= RUPEE_TOLERANCE && explained.length > 1) {
    reasonCode = "MULTIPLE_ADJUSTMENTS";
    reasonText = explained.map((e) => e.text).join(" ");
  } else if (Math.abs(residual) <= RUPEE_TOLERANCE && explained.length === 0) {
    // Diff exists but no component evidence — should not happen if math is consistent;
    // treat as investigation.
    reasonCode = "INVESTIGATION_REQUIRED";
    reasonText = `${formatSignedRupee(difference)} — Settlement differs from offer without a recorded adjustment reason. Flagged for investigation.`;
    investigationRequired = true;
  } else {
    reasonCode = "INVESTIGATION_REQUIRED";
    reasonText = `${formatSignedRupee(difference)} — Settlement differs from offer; unexplained residual ${formatSignedRupee(residual)}. Flagged for investigation.`;
    investigationRequired = true;
  }

  const acceptTrip =
    accept?.tripDistanceKm ?? accept?.totalDistanceKm ?? null;
  const finalTrip =
    input.finalBillableDistanceKm ??
    finalSnap?.tripDistanceKm ??
    finalSnap?.totalDistanceKm ??
    acceptTrip;

  const components: RiderSettlementBreakdownComponent[] = [
    { code: "accepted_base", label: "Accepted base earning", amount: acceptBase },
    { code: "final_base", label: "Final base earning", amount: finalBase },
    {
      code: "final_distance",
      label: "Distance-based earning",
      amount: finalBase,
    },
    { code: "waiting", label: "Waiting charge", amount: finalWaiting },
    { code: "surge", label: "Surge / incentives", amount: finalSurge },
    { code: "tip", label: "Customer tip", amount: tip },
    {
      code: "additional",
      label: "Additional earning",
      amount: round2(extraAdditional + dynamicIncentive),
    },
    { code: "deductions", label: "Deductions", amount: -deductions },
    {
      code: "cancellation",
      label: "Cancellation adjustment",
      amount: cancellationAdj,
    },
  ].filter((c) => Math.abs(c.amount) > 0.005 || c.code.startsWith("final_") || c.code.startsWith("accepted_"));

  for (const e of explained) {
    if (!components.some((c) => c.code === e.componentCode && Math.abs(c.amount - e.amount) < 0.01)) {
      components.push({
        code: e.componentCode,
        label: e.componentLabel,
        amount: e.amount,
      });
    }
  }

  const quoteId =
    input.quoteId?.trim() ||
    (accept?.snapshottedAt ? `accept:${accept.snapshottedAt}` : null);

  return {
    dispatch_offer_amount: dispatchOffer,
    accepted_quote_amount: acceptedQuote,
    dispatch_quoted_distance_km: acceptTrip,
    accepted_distance_km: acceptTrip,
    final_billable_distance_km: finalTrip,
    final_base_earning: finalBase,
    final_distance_earning: finalBase,
    waiting_charge: finalWaiting,
    additional_earning: round2(extraAdditional + Math.max(0, tip) + Math.max(0, dynamicIncentive)),
    deductions,
    cancellation_adjustment: cancellationAdj,
    final_settlement_amount: composedFinal,
    wallet_credited_amount: walletCredited > 0 ? walletCredited : composedFinal,
    difference_amount: difference,
    difference_reason_code: reasonCode,
    difference_reason_text: reasonText,
    pricing_version: PRICING_VERSION,
    quote_id: quoteId,
    settlement_id: input.settlementId?.trim() || null,
    investigation_required: investigationRequired,
    components,
    generated_at: new Date().toISOString(),
  };
}

/** Merge breakdown into billing_snapshot (freeze-once unless force). */
export async function persistRiderSettlementBreakdown(
  orderCorePk: number,
  breakdown: RiderSettlementBreakdown,
  options?: { force?: boolean }
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ billingSnapshot: ordersCore.billingSnapshot })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  const prev =
    row?.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};

  if (!options?.force && prev.rider_settlement_breakdown != null) {
    return;
  }

  const next = restoreCustomerDeliveryFieldsInSnapshot(
    {
      ...prev,
      rider_settlement_breakdown: breakdown,
      ...(breakdown.investigation_required
        ? {
            rider_settlement_investigation: {
              required: true,
              difference_amount: breakdown.difference_amount,
              flagged_at: breakdown.generated_at,
              reason: breakdown.difference_reason_text,
            },
          }
        : {}),
    },
    money(breakdown.final_settlement_amount)
  );

  await db
    .update(ordersCore)
    .set({
      billingSnapshot: next,
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, orderCorePk));
}

export function resolveAcceptedPayoutSnapshot(args: {
  billingSnapshot?: unknown;
  acceptPayoutSnapshot?: unknown;
}): RideRiderPayoutSnapshot | null {
  return (
    parseStandaloneSnapshot(args.acceptPayoutSnapshot) ??
    readRideRiderPayoutSnapshot(args.billingSnapshot)
  );
}

export function buildAndDtoFromSnapshots(args: {
  billingSnapshot?: unknown;
  acceptPayoutSnapshot?: unknown;
  walletCreditedAmount?: number;
  tipAmount?: number;
  settlementId?: string | null;
}): RiderSettlementBreakdownDto | null {
  const existing = readRiderSettlementBreakdown(args.billingSnapshot);
  if (existing) return toRiderSettlementBreakdownDto(existing);

  const accepted = resolveAcceptedPayoutSnapshot(args);
  const finalSnap = readRideRiderPayoutSnapshot(args.billingSnapshot) ?? accepted;
  if (!accepted && !finalSnap) return null;

  const built = buildRiderSettlementBreakdown({
    acceptedSnapshot: accepted,
    finalSnapshot: finalSnap,
    walletCreditedAmount: money(args.walletCreditedAmount),
    tipAmount: args.tipAmount,
    settlementId: args.settlementId,
  });
  return toRiderSettlementBreakdownDto(built);
}
