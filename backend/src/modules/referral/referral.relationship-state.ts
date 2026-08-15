/**
 * Per-party reward state for two-sided referral jobs.
 * Relationship-level "fully credited" is derived only after required parties succeed.
 */

export type PartyRewardState =
  | "pending"
  | "credited"
  | "failed"
  | "skipped"
  | "disabled";

export type RelationshipRewardState =
  | "both_pending"
  | "referrer_credited_referred_pending"
  | "referred_credited_referrer_pending"
  | "both_credited"
  | "permanent_failure"
  | "skipped_disabled";

export type RewardJobStatusRow = {
  reward_party: string;
  status: string;
};

export function jobStatusToPartyState(status: string): PartyRewardState {
  const s = String(status ?? "").toLowerCase();
  if (s === "succeeded" || s === "credited") return "credited";
  if (s === "skipped" || s === "skipped_disabled" || s === "skipped_cap") return "skipped";
  if (s === "dead") return "failed";
  if (s === "disabled") return "disabled";
  return "pending";
}

export function deriveRelationshipRewardState(opts: {
  alsoCreditReferred: boolean;
  referrer: PartyRewardState;
  referred: PartyRewardState;
}): RelationshipRewardState {
  const referrer = opts.referrer;
  const referred = opts.alsoCreditReferred ? opts.referred : "credited";

  const done = (p: PartyRewardState) => p === "credited" || p === "skipped" || p === "disabled";
  const failed = (p: PartyRewardState) => p === "failed";

  if (!opts.alsoCreditReferred) {
    if (referrer === "credited") return "both_credited";
    if (referrer === "skipped" || referrer === "disabled") return "skipped_disabled";
    if (referrer === "failed") return "permanent_failure";
    return "both_pending";
  }

  if (referrer === "credited" && referred === "credited") return "both_credited";
  if (
    (referrer === "skipped" || referrer === "disabled") &&
    (referred === "skipped" || referred === "disabled")
  ) {
    return "skipped_disabled";
  }
  if (failed(referrer) && failed(referred)) return "permanent_failure";
  if (failed(referrer) && done(referred) && referred !== "credited") return "permanent_failure";
  if (failed(referred) && done(referrer) && referrer !== "credited") return "permanent_failure";
  if (failed(referrer) && referred === "credited") return "referred_credited_referrer_pending";
  if (failed(referred) && referrer === "credited") return "referrer_credited_referred_pending";
  if (referrer === "credited" && !done(referred) && !failed(referred)) {
    return "referrer_credited_referred_pending";
  }
  if (referred === "credited" && !done(referrer) && !failed(referrer)) {
    return "referred_credited_referrer_pending";
  }
  if (failed(referrer) || failed(referred)) return "permanent_failure";
  if (done(referrer) && done(referred) && (referrer === "credited" || referred === "credited")) {
    return referrer === "credited" && referred === "credited"
      ? "both_credited"
      : "skipped_disabled";
  }
  return "both_pending";
}

export function partiesFromJobs(
  rows: RewardJobStatusRow[],
  alsoCreditReferred: boolean,
): { referrer: PartyRewardState; referred: PartyRewardState } {
  let referrer: PartyRewardState = "pending";
  let referred: PartyRewardState = alsoCreditReferred ? "pending" : "credited";
  for (const row of rows) {
    const party = String(row.reward_party ?? "").toLowerCase();
    const state = jobStatusToPartyState(row.status);
    if (party === "referrer") referrer = state;
    if (party === "referred") referred = state;
  }
  return { referrer, referred };
}

export function relationshipIsFullyCredited(state: RelationshipRewardState): boolean {
  return state === "both_credited";
}
