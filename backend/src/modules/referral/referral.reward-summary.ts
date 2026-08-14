/**
 * Human-readable reward copy derived from live referral config.
 *
 * Amounts and thresholds always come from the database. This module only
 * formats them for invitees (landing pages / WhatsApp). Apps format their
 * own sharer-facing copy from the same structured amounts.
 */

import type {
  ReferralRewardRule,
  ReferralSettings,
  ReferralUserType,
} from "./referral.config.service.js";
import { referralRewardsEnabled } from "./referral.participants.js";

export type ReferralRewardSummary = {
  inviteeLines: string[];
  shareLines: string[];
  headline: string;
  rewardsPaused: boolean;
  inviteeRewardLabel: string | null;
  referrerRewardLabel: string | null;
  conditionLine: string;
  ogSummary: string;
  youEarnAmount: number | null;
  theyEarnAmount: number | null;
  requirementOrders: number | null;
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

function pickPrimary(
  rules: ReferralRewardRule[],
  userType: ReferralUserType,
): ReferralRewardRule | null {
  const active = rules.filter(
    (r) =>
      r.user_type === userType &&
      r.active &&
      (Number(r.reward_amount) > 0 || Number(r.referred_reward_amount) > 0),
  );
  if (active.length === 0) {
    return rules.find((r) => r.user_type === userType && r.active) ?? null;
  }
  const kind = (r: ReferralRewardRule) => {
    const event = String(r.event_type ?? "").toUpperCase();
    const orders = Number(r.milestone_orders) || 0;
    if (event === "ORDER_DELIVERED_COUNT" || (orders > 0 && event !== "STORE_APPROVED")) return 3;
    if (event === "STORE_APPROVED" || event === "REGISTRATION_COMPLETED") return 1;
    return 2;
  };
  active.sort((a, b) => {
    const kindDiff = kind(b) - kind(a);
    if (kindDiff !== 0) return kindDiff;
    const rewardDiff = (Number(b.reward_amount) || 0) - (Number(a.reward_amount) || 0);
    if (rewardDiff !== 0) return rewardDiff;
    const orderDiff = (Number(b.milestone_orders) || 0) - (Number(a.milestone_orders) || 0);
    if (orderDiff !== 0) return orderDiff;
    return (Number(b.priority) || 0) - (Number(a.priority) || 0);
  });
  return active[0] ?? null;
}

function theyAmount(rule: ReferralRewardRule | null): number {
  if (!rule) return 0;
  if (rule.also_credit_referred === false && rule.referred_reward_amount == null) return 0;
  if (rule.referred_reward_amount != null) return Number(rule.referred_reward_amount) || 0;
  if (rule.also_credit_referred) return Number(rule.reward_amount) || 0;
  return 0;
}

function requirementPhrase(
  audience: ReferralUserType,
  rule: ReferralRewardRule | null,
  settings: ReferralSettings,
): string {
  const event = String(rule?.event_type ?? "").toUpperCase();
  const orders = Number(rule?.milestone_orders) || 0;
  const min = Number(rule?.min_order_amount ?? settings.min_order_amount) || 0;
  const kyc = Boolean(rule?.require_kyc ?? settings.require_kyc);

  if (event === "STORE_APPROVED") return "get your store approved";
  if (event === "REGISTRATION_COMPLETED") return "complete registration";
  if (event === "MENU_COMPLETED") return "complete your menu";
  if (event === "ACTIVE_DAYS" && orders > 0) {
    return `stay active for ${orders} ${orders === 1 ? "day" : "days"}`;
  }

  if (audience === "customer") {
    if (min > 0) return `complete a delivered order of ${money(min, settings.currency)} or more`;
    return "complete your first delivered order";
  }
  if (audience === "rider") {
    const base =
      orders > 0
        ? `complete ${orders} ${orders === 1 ? "delivery" : "deliveries"}`
        : "complete the required delivery milestones";
    return kyc ? `${base} after KYC approval` : base;
  }
  if (orders > 0) return `complete ${orders} delivered orders`;
  return "complete the required orders";
}

function afterClause(phrase: string): string {
  if (phrase.startsWith("complete ")) return `after completing ${phrase.slice("complete ".length)}`;
  if (phrase.startsWith("get ")) return `after you ${phrase}`;
  if (phrase.startsWith("stay ")) return `after you ${phrase}`;
  return `after you ${phrase}`;
}

function emptySummary(audience: ReferralUserType): ReferralRewardSummary {
  const headline =
    audience === "rider"
      ? "Become a GatiMitra delivery partner"
      : audience === "merchant"
        ? "Become a GatiMitra merchant partner"
        : "Invite friends & earn rewards";
  return {
    inviteeLines: ["Join GatiMitra and start earning with us."],
    shareLines: ["Invite others to GatiMitra."],
    headline,
    rewardsPaused: true,
    inviteeRewardLabel: null,
    referrerRewardLabel: null,
    conditionLine: "Referral rewards are currently unavailable.",
    ogSummary: headline,
    youEarnAmount: null,
    theyEarnAmount: null,
    requirementOrders: null,
  };
}

function audienceSummary(
  settings: ReferralSettings,
  rules: ReferralRewardRule[],
  audience: ReferralUserType,
): ReferralRewardSummary {
  const currency = settings.currency;
  const rule = pickPrimary(rules, audience);
  if (!rule) return emptySummary(audience);

  const youAmt = Number(rule.reward_amount) || 0;
  const theyAmt = theyAmount(rule);
  const youLabel = youAmt > 0 ? money(youAmt, currency) : null;
  const theyLabel = theyAmt > 0 ? money(theyAmt, currency) : null;
  const req = requirementPhrase(audience, rule, settings);
  const after = afterClause(req);
  const orders = Number(rule.milestone_orders) || 0;

  const inviteeLines: string[] = [];
  if (theyLabel) {
    inviteeLines.push(`Get ${theyLabel} ${after}.`);
  } else {
    inviteeLines.push(`Join GatiMitra and ${req} to unlock rewards.`);
  }

  const shareLines: string[] = [];
  if (youLabel) shareLines.push(`You earn ${youLabel}`);
  if (theyLabel) shareLines.push(`They earn ${theyLabel}`);

  const headline = theyLabel
    ? `Get ${theyLabel} ${after}`
    : "Join GatiMitra and grow with us";

  return {
    inviteeLines,
    shareLines: shareLines.length > 0 ? shareLines : ["Invite others to GatiMitra."],
    headline,
    rewardsPaused: youAmt <= 0 && theyAmt <= 0,
    inviteeRewardLabel: theyLabel,
    referrerRewardLabel: youLabel,
    conditionLine: theyLabel
      ? `Get ${theyLabel} ${after}.`
      : `Join GatiMitra and ${req}.`,
    ogSummary: theyLabel ? `Get ${theyLabel} ${after}` : headline,
    youEarnAmount: youAmt > 0 ? youAmt : null,
    theyEarnAmount: theyAmt > 0 ? theyAmt : null,
    requirementOrders: orders > 0 ? orders : null,
  };
}

export function buildReferralRewardSummary(
  settings: ReferralSettings,
  rules: ReferralRewardRule[],
  userType: ReferralUserType,
): ReferralRewardSummary {
  const summary = audienceSummary(settings, rules, userType);
  const rewardsEnabled = referralRewardsEnabled(settings, userType);

  if (!rewardsEnabled) {
    return {
      ...summary,
      shareLines: ["Referral rewards are currently unavailable."],
      rewardsPaused: true,
      youEarnAmount: null,
      theyEarnAmount: null,
      inviteeRewardLabel: null,
      referrerRewardLabel: null,
      conditionLine: "Referral rewards are currently unavailable.",
      headline: "Referral rewards are currently unavailable.",
    };
  }
  return summary;
}

/**
 * Recipient-facing WhatsApp/share text.
 * Never includes the sender's reward.
 */
export function buildPersonalizedShareMessage(opts: {
  referrerName?: string | null;
  referralCode: string;
  shareUrl: string;
  summary: ReferralRewardSummary;
  audience?: "customer" | "rider" | "merchant";
}): string {
  const name = opts.referrerName?.trim() || "A friend";
  const code = opts.referralCode.trim().toUpperCase();
  const url = opts.shareUrl.trim();
  const theyLabel = opts.summary.inviteeRewardLabel;
  const condition = opts.summary.conditionLine?.trim() || "";
  const rewardLine =
    theyLabel && condition.toLowerCase().startsWith("get ")
      ? `🎁 ${condition}`
      : theyLabel
        ? `🎁 Get ${theyLabel} when you qualify.`
        : null;

  const intro =
    opts.audience === "merchant"
      ? "Join GatiMitra and grow your business with online orders, more customers, and easy digital tools! 📈"
      : opts.audience === "rider"
        ? "Join GatiMitra as a delivery partner and earn on your own schedule! 🛵"
        : "Join GatiMitra for food, parcels, and more — delivered to your door! 🍽️";

  const mid =
    opts.audience === "merchant"
      ? "I’m already using GatiMitra. Join through my referral link and get started with GatiMitra for your business."
      : opts.audience === "rider"
        ? "I’m already riding with GatiMitra. Use my referral link to sign up."
        : "I’m already using GatiMitra. Sign up with my referral link to get started.";

  const closer =
    opts.audience === "merchant"
      ? "Let’s grow together! 🚀"
      : opts.audience === "rider"
        ? "Let’s earn together! 🚀"
        : "See you on GatiMitra! 🚀";

  return [
    "Hey!",
    "",
    intro,
    "",
    mid,
    "",
    ...(rewardLine ? [rewardLine, ""] : []),
    "👉 Join here:",
    url,
    "",
    "Use my referral code:",
    code,
    "",
    closer,
    "",
    `– ${name}`,
  ].join("\n");
}
