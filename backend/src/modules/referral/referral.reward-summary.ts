/**
 * Human-readable reward copy derived from live referral config.
 *
 * Single source of truth so the landing page, share message, and marketing
 * surfaces all describe the same amounts. Nothing here is hardcoded.
 */

import type {
  ReferralRewardRule,
  ReferralSettings,
  ReferralUserType,
} from "./referral.config.service.js";

export type ReferralRewardSummary = {
  inviteeLines: string[];
  shareLines: string[];
  headline: string;
  rewardsPaused: boolean;
  /** Structured amounts for personalized share / OG templates. */
  inviteeRewardLabel: string | null;
  referrerRewardLabel: string | null;
  conditionLine: string;
  /** Compact OG preview line, e.g. "You Get ₹50 • Friend Gets ₹50". */
  ogSummary: string;
};

function symbolFor(currency: string): string {
  return currency?.toUpperCase() === "INR" ? "₹" : `${currency ?? ""} `.trimEnd() + " ";
}

function money(amount: number, currency: string): string {
  const symbol = symbolFor(currency);
  const rounded = Math.round(amount * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return `${symbol}${text}`;
}

function rewardNoun(rule: ReferralRewardRule): string {
  return rule.reward_type === "GATICASH" ? "GatiCash" : "wallet credit";
}

function customerSummary(
  settings: ReferralSettings,
  rules: ReferralRewardRule[],
): ReferralRewardSummary {
  const currency = settings.currency;
  const rule = rules
    .filter((r) => r.user_type === "customer" && r.active)
    .sort((a, b) => a.priority - b.priority)[0];

  if (!rule) {
    return {
      inviteeLines: ["Install GatiMitra and start ordering food, parcels and rides."],
      shareLines: ["Invite friends to GatiMitra."],
      headline: "Invite Friends & Earn Rewards",
      rewardsPaused: true,
      inviteeRewardLabel: null,
      referrerRewardLabel: null,
      conditionLine: "Complete your first eligible delivered order to unlock rewards.",
      ogSummary: "Invite Friends & Earn Rewards",
    };
  }

  const minOrder = Number(rule.min_order_amount ?? settings.min_order_amount) || 0;
  const referrerAmount = Number(rule.reward_amount) || 0;
  const friendAmount = rule.also_credit_referred
    ? Number(rule.referred_reward_amount ?? rule.reward_amount) || 0
    : 0;
  const noun = rewardNoun(rule);
  const orderCondition =
    minOrder > 0
      ? `first eligible delivered order of ${money(minOrder, currency)} or more`
      : "first eligible delivered order";

  const inviteeRewardLabel =
    friendAmount > 0 ? `${money(friendAmount, currency)} ${noun}` : null;
  const referrerRewardLabel =
    referrerAmount > 0 ? `${money(referrerAmount, currency)} ${noun}` : null;

  const inviteeLines: string[] = [];
  const shareLines: string[] = [];

  if (friendAmount > 0) {
    inviteeLines.push(`Get ${inviteeRewardLabel} after your ${orderCondition}.`);
  } else {
    inviteeLines.push(`Complete your ${orderCondition} to unlock referral rewards.`);
  }
  if (referrerAmount > 0) {
    inviteeLines.push(
      `Your friend earns ${referrerRewardLabel} when you complete it.`,
    );
  }

  if (friendAmount > 0) {
    shareLines.push(`You Get: ${inviteeRewardLabel}`);
  }
  if (referrerAmount > 0) {
    shareLines.push(`Referrer Gets: ${referrerRewardLabel}`);
  }

  const conditionLine = `Complete your ${orderCondition} and unlock your referral rewards.`;

  const ogParts: string[] = [];
  if (inviteeRewardLabel) ogParts.push(`You Get ${inviteeRewardLabel}`);
  if (referrerRewardLabel) ogParts.push(`Friend Gets ${referrerRewardLabel}`);
  const ogSummary =
    ogParts.length > 0 ? ogParts.join(" • ") : "Invite Friends & Earn Rewards";

  return {
    inviteeLines,
    shareLines: shareLines.length > 0 ? shareLines : ["Invite friends to GatiMitra."],
    headline:
      friendAmount > 0
        ? `Get ${inviteeRewardLabel} on your first order`
        : "Invite Friends & Earn Rewards",
    rewardsPaused: referrerAmount <= 0 && friendAmount <= 0,
    inviteeRewardLabel,
    referrerRewardLabel,
    conditionLine,
    ogSummary,
  };
}

function riderSummary(
  settings: ReferralSettings,
  rules: ReferralRewardRule[],
): ReferralRewardSummary {
  const currency = settings.currency;
  const milestones = rules
    .filter((r) => r.user_type === "rider" && r.active && Number(r.reward_amount) > 0)
    .sort((a, b) => a.milestone_orders - b.milestone_orders);

  if (milestones.length === 0) {
    return {
      inviteeLines: ["Join GatiMitra as a delivery partner and start earning."],
      shareLines: ["Invite riders to join GatiMitra."],
      headline: "Become a GatiMitra delivery partner",
      rewardsPaused: true,
      inviteeRewardLabel: null,
      referrerRewardLabel: null,
      conditionLine: "Complete KYC and your first delivery milestones to unlock rewards.",
      ogSummary: "Become a GatiMitra delivery partner",
    };
  }

  const first = milestones[0];
  const kycNeeded = first.require_kyc ?? settings.require_kyc;
  const noun = rewardNoun(first);

  const describe = (rule: ReferralRewardRule) =>
    `${money(Number(rule.reward_amount), currency)} after ${rule.milestone_orders} ` +
    `completed ${rule.milestone_orders === 1 ? "delivery" : "deliveries"}`;

  const inviteeRewardLabel = describe(first);
  const inviteeLines = [
    `Earn ${inviteeRewardLabel}${kycNeeded ? " (once KYC is approved)" : ""}.`,
  ];
  if (milestones.length > 1) {
    inviteeLines.push(
      `More milestones after that: ${milestones.slice(1).map(describe).join(", ")}.`,
    );
  }
  inviteeLines.push(`Rewards are credited to your rider wallet and are withdrawable.`);

  const shareLines = [
    `You Get: ${inviteeRewardLabel}${kycNeeded ? " after KYC" : ""}`,
    `Referrer Gets: ${noun} for every milestone you complete`,
  ];

  return {
    inviteeLines,
    shareLines,
    headline: `Earn ${inviteeRewardLabel}`,
    rewardsPaused: false,
    inviteeRewardLabel,
    referrerRewardLabel: noun,
    conditionLine: `Complete ${first.milestone_orders} deliveries${kycNeeded ? " after KYC approval" : ""} to unlock your first reward.`,
    ogSummary: `You Get ${inviteeRewardLabel}`,
  };
}

export function buildReferralRewardSummary(
  settings: ReferralSettings,
  rules: ReferralRewardRule[],
  userType: ReferralUserType,
): ReferralRewardSummary {
  const summary =
    userType === "rider"
      ? riderSummary(settings, rules)
      : customerSummary(settings, rules);

  const rewardsEnabled =
    settings.enabled &&
    settings.reward_enabled &&
    (userType === "customer"
      ? settings.customer_referral_enabled && settings.customer_reward_enabled
      : settings.rider_referral_enabled && settings.rider_reward_enabled);

  if (!rewardsEnabled) {
    return {
      ...summary,
      shareLines: [...summary.shareLines, "Reward payouts are currently paused."],
      rewardsPaused: true,
    };
  }
  return summary;
}

/**
 * Personalized, WhatsApp-optimized share message.
 * All amounts come from the live summary — never hardcode values here.
 */
export function buildPersonalizedShareMessage(opts: {
  referrerName?: string | null;
  referralCode: string;
  shareUrl: string;
  summary: ReferralRewardSummary;
  audience?: "customer" | "rider";
}): string {
  const name = opts.referrerName?.trim() || "Your friend";
  const code = opts.referralCode.trim().toUpperCase();
  const url = opts.shareUrl.trim();
  const isRider = opts.audience === "rider";

  const lines: string[] = [
    `🎉 ${name} invited you to join GatiMitra${isRider ? " as a delivery partner" : ""}!`,
    "",
    opts.summary.conditionLine,
    "",
  ];

  if (opts.summary.inviteeRewardLabel) {
    lines.push(`🎁 You Get: ${opts.summary.inviteeRewardLabel}`);
  }
  if (opts.summary.referrerRewardLabel) {
    lines.push(`🎁 ${name} Gets: ${opts.summary.referrerRewardLabel}`);
  }
  if (opts.summary.inviteeRewardLabel || opts.summary.referrerRewardLabel) {
    lines.push("");
  }

  lines.push("Join Now:");
  lines.push(url);
  lines.push("");
  lines.push(`Referral Code: ${code}`);
  lines.push("");
  lines.push("*T&C Apply.");

  return lines.join("\n");
}
