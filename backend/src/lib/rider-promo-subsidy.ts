/**
 * Promotion-subsidy accounting — makes the gap between what the customer pays and
 * what the rider earns explicit and reconcilable. No unexplained money.
 *
 * The rider is paid their share of the GROSS service value (see rider-fare-basis).
 * A customer offer reduces what the CUSTOMER collects toward that fare, never the
 * rider's share. The shortfall is absorbed first by the platform's own margin and,
 * only when the discount exceeds that margin, by an explicit company subsidy so the
 * rider always stays whole.
 *
 * Invariant (money conservation, fare component):
 *   collectedFare + companySubsidy === riderShare + platformRevenue
 * i.e. every rupee the rider is paid is funded by the customer's payment plus the
 * company subsidy — nothing created, nothing lost, at any discount.
 */

export type RiderFundingSplit = {
  /** Gross (pre-discount) fare basis the split is computed from. */
  grossBasis: number;
  /** Rider's fare share — fixed, offer-independent. */
  riderShare: number;
  /** What the customer actually pays toward the fare (gross − discount, floored at 0). */
  collectedFare: number;
  /** Platform's realised margin after funding the rider from the collection. */
  platformRevenue: number;
  /** Company/platform promotional funding injected so the rider stays whole. */
  companySubsidy: number;
  /** The customer discount that drove the split. */
  discount: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nonNeg(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Resolve the funding split for a completed order's fare component.
 *
 * @param grossBasis   gross pre-discount fare basis (rider-fare-basis output)
 * @param riderShare   rider's fare share (rider% of gross) — must be ≤ grossBasis
 * @param discount     customer discount applied to the fare (coupon/offer/free ride)
 */
export function resolveRiderFundingSplit(input: {
  grossBasis: number;
  riderShare: number;
  discount: number;
}): RiderFundingSplit {
  const grossBasis = round2(nonNeg(input.grossBasis));
  // Rider share can never exceed the gross basis it is derived from.
  const riderShare = round2(Math.min(nonNeg(input.riderShare), grossBasis));
  // Discount can never exceed the gross fare (a 100% free ride discounts the whole fare).
  const discount = round2(Math.min(nonNeg(input.discount), grossBasis));

  const collectedFare = round2(Math.max(0, grossBasis - discount));
  const platformRevenue = round2(Math.max(0, collectedFare - riderShare));
  const companySubsidy = round2(Math.max(0, riderShare - collectedFare));

  return { grossBasis, riderShare, collectedFare, platformRevenue, companySubsidy, discount };
}
