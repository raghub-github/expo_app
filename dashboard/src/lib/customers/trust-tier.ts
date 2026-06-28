/**
 * Trust tier labels match DB enum `customer_trust_tier` and trust_score ranges.
 * 0–10 Premium, 11–25 Very Good, 26–45 Good, 46–65 Bad, 66–85 Very Bad, 86–100 Fraud.
 */

export type CustomerTrustTier =
  | "PREMIUM"
  | "VERY_GOOD"
  | "GOOD"
  | "BAD"
  | "VERY_BAD"
  | "FRAUD";

export const TRUST_TIER_LABEL: Record<CustomerTrustTier, string> = {
  PREMIUM: "Premium",
  VERY_GOOD: "Very Good",
  GOOD: "Good",
  BAD: "Bad",
  VERY_BAD: "Very Bad",
  FRAUD: "Fraud",
};

/** Fallback when `trust_tier` is null (e.g. pre-migration row). */
export function trustTierFromScore(
  score: number | string | null | undefined
): CustomerTrustTier {
  const s = score == null ? 5 : Number(score);
  if (Number.isNaN(s)) return "VERY_GOOD";
  if (s >= 0 && s <= 10) return "PREMIUM";
  if (s <= 25) return "VERY_GOOD";
  if (s <= 45) return "GOOD";
  if (s <= 65) return "BAD";
  if (s <= 85) return "VERY_BAD";
  return "FRAUD";
}

export function resolveTrustTier(
  tier: string | null | undefined,
  score: number | string | null | undefined
): CustomerTrustTier {
  if (tier && tier in TRUST_TIER_LABEL) return tier as CustomerTrustTier;
  return trustTierFromScore(score);
}

/** User Type / badge styling: positive tiers green, middle amber, risk red. */
export function trustTierUserTypeClass(tier: CustomerTrustTier): string {
  switch (tier) {
    case "PREMIUM":
    case "VERY_GOOD":
      return "font-semibold text-green-600";
    case "GOOD":
      return "font-semibold text-amber-700";
    case "BAD":
    case "VERY_BAD":
    case "FRAUD":
      return "font-semibold text-red-600";
    default:
      return "font-semibold text-gray-900";
  }
}

export function trustTierBadgeClass(tier: CustomerTrustTier): string {
  switch (tier) {
    case "PREMIUM":
      return "bg-emerald-100 text-emerald-900";
    case "VERY_GOOD":
      return "bg-green-100 text-green-900";
    case "GOOD":
      return "bg-amber-100 text-amber-900";
    case "BAD":
      return "bg-orange-100 text-orange-900";
    case "VERY_BAD":
      return "bg-rose-100 text-rose-900";
    case "FRAUD":
      return "bg-red-100 text-red-900";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
