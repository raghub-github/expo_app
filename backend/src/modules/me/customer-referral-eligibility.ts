/**
 * Pure eligibility check for minting a customer's OWN referral code.
 *
 * The code is name-based, so it requires a real (non-"Pending") full name and a
 * completed profile, and is only minted when the customer doesn't already have
 * one. The referral-service toggle is checked separately (async) by the caller —
 * this predicate is the deterministic, unit-testable part.
 */
export function customerNeedsReferralCode(row: {
  referralCode: string | null | undefined;
  profileCompleted: boolean | null | undefined;
  fullName: string | null | undefined;
}): boolean {
  if (row.referralCode && row.referralCode.trim().length > 0) return false;
  if (!row.profileCompleted) return false;
  const fullName = (row.fullName ?? "").trim();
  if (fullName.length === 0) return false;
  if (fullName.toLowerCase() === "pending") return false;
  return true;
}
