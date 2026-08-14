/**
 * User-facing referral copy. Amounts and thresholds come from the backend;
 * this layer only formats them into natural language. Never show Super Admin,
 * rule IDs, event enums, or "referrer/referred" labels.
 */

export type ReferralAudience = "customer" | "rider" | "merchant";

export type ReferralMilestoneInput = {
  rewardAmount?: number | null;
  referredRewardAmount?: number | null;
  alsoCreditReferred?: boolean;
  milestoneOrders?: number | null;
  eventType?: string | null;
  requireKyc?: boolean;
  minOrderAmount?: number | null;
  priority?: number | null;
};

export type ReferralCopyInput = {
  audience: ReferralAudience;
  referralEnabled?: boolean;
  rewardEnabled?: boolean;
  rewardsPaused?: boolean;
  currency?: string;
  minOrderAmount?: number;
  requireKyc?: boolean;
  firstOrderOnly?: boolean;
  milestones?: ReferralMilestoneInput[] | null;
};

export type ReferralStep = { title: string; body: string };

export type ReferralPresentedCopy = {
  title: string;
  subtitle: string;
  hasActiveReward: boolean;
  youEarnAmount: number | null;
  theyEarnAmount: number | null;
  youEarnLine: string | null;
  theyEarnLine: string | null;
  headline: string;
  theyEarnDetail: string | null;
  requirementPhrase: string;
  steps: ReferralStep[];
  tip: string;
  unavailableMessage: string;
  shareMessage: (opts: {
    referrerName?: string | null;
    referralCode: string;
    shareUrl: string;
  }) => string;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function formatReferralMoney(amount: number, currency = "INR"): string {
  const symbol = (currency || "INR").toUpperCase() === "INR" ? "₹" : `${currency} `;
  const rounded = Math.round(amount * 100) / 100;
  const text = Number.isInteger(rounded) ? String(Math.round(rounded)) : rounded.toFixed(2);
  return `${symbol}${text}`;
}

function invitedNoun(audience: ReferralAudience): string {
  if (audience === "rider") return "invited rider";
  if (audience === "merchant") return "invited merchant";
  return "friend";
}

function pickPrimary(milestones: ReferralMilestoneInput[]): ReferralMilestoneInput | null {
  const scored = [...milestones].filter(
    (m) => num(m.rewardAmount) > 0 || num(m.referredRewardAmount) > 0,
  );
  if (scored.length === 0) return milestones[0] ?? null;

  const kind = (m: ReferralMilestoneInput) => {
    const event = String(m.eventType ?? "").toUpperCase();
    const orders = num(m.milestoneOrders);
    if (event === "ORDER_DELIVERED_COUNT" || (orders > 0 && event !== "STORE_APPROVED")) return 3;
    if (event === "STORE_APPROVED" || event === "REGISTRATION_COMPLETED") return 1;
    return 2;
  };

  scored.sort((a, b) => {
    const kindDiff = kind(b) - kind(a);
    if (kindDiff !== 0) return kindDiff;
    const rewardDiff = num(b.rewardAmount) - num(a.rewardAmount);
    if (rewardDiff !== 0) return rewardDiff;
    const orderDiff = num(b.milestoneOrders) - num(a.milestoneOrders);
    if (orderDiff !== 0) return orderDiff;
    return num(b.priority) - num(a.priority);
  });
  return scored[0] ?? null;
}

function theyAmount(m: ReferralMilestoneInput | null): number {
  if (!m) return 0;
  if (m.alsoCreditReferred === false && m.referredRewardAmount == null) return 0;
  if (m.referredRewardAmount != null) return num(m.referredRewardAmount);
  if (m.alsoCreditReferred) return num(m.rewardAmount);
  return 0;
}

function requirementPhrase(
  audience: ReferralAudience,
  m: ReferralMilestoneInput | null,
  minOrderAmount: number,
  requireKyc: boolean,
): string {
  const event = String(m?.eventType ?? "").toUpperCase();
  const orders = num(m?.milestoneOrders);
  const min = num(m?.minOrderAmount ?? minOrderAmount);
  const kyc = Boolean(m?.requireKyc ?? requireKyc);

  if (event === "STORE_APPROVED") return "get their store approved";
  if (event === "REGISTRATION_COMPLETED") return "complete registration";
  if (event === "MENU_COMPLETED") return "complete their menu";
  if (event === "ACTIVE_DAYS" && orders > 0) {
    return `stay active for ${orders} ${orders === 1 ? "day" : "days"}`;
  }

  if (audience === "customer") {
    if (min > 0) return `complete a delivered order of ${formatReferralMoney(min)} or more`;
    return "complete their first delivered order";
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

function requirementAfterClause(phrase: string): string {
  if (phrase.startsWith("complete ")) return `after completing ${phrase.slice("complete ".length)}`;
  if (phrase.startsWith("get ")) return `after they ${phrase}`;
  if (phrase.startsWith("stay ")) return `after they ${phrase}`;
  return `after they ${phrase}`;
}

function thirdPerson(phrase: string): string {
  if (phrase.startsWith("complete ")) return `completes ${phrase.slice("complete ".length)}`;
  if (phrase.startsWith("get ")) return `gets ${phrase.slice("get ".length)}`;
  if (phrase.startsWith("stay ")) return `stays ${phrase.slice("stay ".length)}`;
  return phrase;
}

function inviteeWhenClause(phrase: string): string {
  const you = phrase.replace(/\btheir\b/g, "your").replace(/\bthey\b/g, "you");
  return `when you ${you}`;
}

export function buildInviteShareMessage(opts: {
  audience: ReferralAudience;
  senderName: string;
  referralCode: string;
  referralUrl: string;
  referredRewardLabel: string | null;
  requirementPhrase: string;
}): string {
  const name = opts.senderName.trim() || "A friend";
  const code = opts.referralCode.trim().toUpperCase();
  const url = opts.referralUrl.trim();
  const when = inviteeWhenClause(opts.requirementPhrase);
  const rewardLine =
    opts.referredRewardLabel != null
      ? `🎁 Get ${opts.referredRewardLabel} ${when}.`
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

export function presentReferralCopy(input: ReferralCopyInput): ReferralPresentedCopy {
  const audience = input.audience;
  const they = invitedNoun(audience);
  const currency = input.currency || "INR";
  const minOrder = num(input.minOrderAmount);
  const requireKyc = Boolean(input.requireKyc);
  const paused = input.rewardsPaused === true || input.rewardEnabled === false;
  const primary = pickPrimary(input.milestones ?? []);
  const youAmt = num(primary?.rewardAmount);
  const theyAmt = theyAmount(primary);
  const hasActiveReward = !paused && (youAmt > 0 || theyAmt > 0);
  const youEarnAmount = hasActiveReward && youAmt > 0 ? youAmt : null;
  const theyEarnAmount = hasActiveReward && theyAmt > 0 ? theyAmt : null;
  const youLabel = youEarnAmount != null ? formatReferralMoney(youEarnAmount, currency) : null;
  const theyLabel = theyEarnAmount != null ? formatReferralMoney(theyEarnAmount, currency) : null;
  const req = requirementPhrase(audience, primary, minOrder, requireKyc);
  const afterReq = requirementAfterClause(req);

  const unavailableMessage = "Referral rewards are currently unavailable.";

  const title = "Refer & Earn";
  const subtitle =
    audience === "merchant"
      ? "Invite other merchants and earn rewards when they qualify."
      : audience === "rider"
        ? "Invite another rider and earn rewards when they complete the required milestones."
        : "Invite your friends to GatiMitra and earn rewards when they complete their qualifying order.";

  const youEarnLine = youLabel ? `You earn ${youLabel}` : null;
  const theyEarnLine = theyLabel ? `They earn ${theyLabel}` : null;
  const theyEarnDetail = theyLabel
    ? `Your ${they} earns ${theyLabel} ${afterReq}.`
    : null;

  let headline = subtitle;
  if (hasActiveReward && youLabel && audience === "merchant") {
    headline = `Earn ${youLabel} for every merchant you refer`;
  } else if (hasActiveReward && youLabel && audience === "rider") {
    headline = `Earn ${youLabel} when your invited rider ${thirdPerson(req)}.`;
  } else if (hasActiveReward && youLabel && theyLabel) {
    headline = `You earn ${youLabel}. Your friend earns ${theyLabel}.`;
  } else if (hasActiveReward && youLabel) {
    headline = `You earn ${youLabel} when your friend ${req}.`;
  } else if (!hasActiveReward) {
    headline = unavailableMessage;
  }

  const bothEarnBody =
    youLabel && theyLabel
      ? `You receive ${youLabel} and your ${they} receives ${theyLabel}.`
      : youLabel
        ? `You receive ${youLabel}.`
        : theyLabel
          ? `Your ${they} receives ${theyLabel}.`
          : "Rewards credit when the requirement is met.";

  const steps: ReferralStep[] =
    audience === "merchant"
      ? [
          {
            title: "Invite a merchant",
            body: "Share your referral link with another merchant.",
          },
          {
            title: "They get started",
            body: "Your invited merchant joins GatiMitra using your referral link.",
          },
          {
            title: "They complete the requirement",
            body: `They ${req}.`,
          },
          { title: "You both earn", body: bothEarnBody },
        ]
      : audience === "rider"
        ? [
            {
              title: "Invite a rider",
              body: "Share your referral link with another rider.",
            },
            {
              title: "They join GatiMitra",
              body: "They register using your referral link.",
            },
            {
              title: "Complete the milestones",
              body: `They ${req}.`,
            },
            { title: "Earn rewards", body: bothEarnBody },
          ]
        : [
            { title: "Invite a friend", body: "Share your referral link." },
            {
              title: "Your friend joins",
              body: "They sign up using your referral link.",
            },
            {
              title: "Complete the requirement",
              body: `They ${req}.`,
            },
            { title: "Both earn", body: bothEarnBody },
          ];

  const tip =
    audience === "customer"
      ? "Rewards credit as GatiCash after a delivered order and can be used inside GatiMitra."
      : "Rewards credit to your wallet after the requirement is met.";

  return {
    title,
    subtitle,
    hasActiveReward,
    youEarnAmount,
    theyEarnAmount,
    youEarnLine,
    theyEarnLine,
    headline: hasActiveReward ? headline : unavailableMessage,
    theyEarnDetail,
    requirementPhrase: req,
    steps: hasActiveReward ? steps : steps.slice(0, 2),
    tip,
    unavailableMessage,
    shareMessage: ({ referrerName, referralCode, shareUrl }) =>
      buildInviteShareMessage({
        audience,
        senderName: referrerName?.trim() || "A friend",
        referralCode,
        referralUrl: shareUrl,
        referredRewardLabel: theyLabel,
        requirementPhrase: req,
      }),
  };
}

export const REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE =
  "This referral code is no longer available.";

export function isReferralServiceDisabledError(error?: string | null): boolean {
  const e = String(error ?? "").trim();
  return e === "REFERRAL_SERVICE_DISABLED" || e === "referral_disabled";
}

export function userMessageForReferralApplyError(error?: string | null): string {
  if (isReferralServiceDisabledError(error)) {
    return REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE;
  }
  return "Could not apply referral code.";
}

export function friendlyReferralStatus(status: string | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "reward_credited" || s === "credited") return "Reward credited";
  if (s === "first_order_pending") return "Waiting for first order";
  if (s === "milestone_pending") return "In progress";
  if (s === "cap_reached") return "Monthly limit reached";
  if (s === "fraud_blocked") return "Unavailable";
  if (s === "cancelled") return "Cancelled";
  if (s === "attributed" || s === "pending") return "Pending";
  if (!s) return "Pending";
  return s.replace(/_/g, " ");
}
