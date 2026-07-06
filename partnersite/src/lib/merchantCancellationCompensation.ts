export type MerchantCancellationCompensationDisplay = {
  engine_enabled: boolean;
  admin_override?: boolean;
  compensation_pct: number;
  merchant_keeps_amount: number;
  net_order_value: number;
  cancelled_by_brand: string;
  reason_detail: string;
  eligible_message: string;
  show_policy_link: boolean;
  policy_modal_title: string;
  scenario_code: string;
  exclusion_code: string | null;
  applied_policy_title: string;
  applied_policy_description: string;
};

export type MerchantCompensationPolicyDisplay = {
  policy_modal_title: string;
  order_ready_accuracy_threshold: number;
  customer_cancel_grace_seconds: number;
  scenarios: Array<{
    scenario_code: string;
    compensation_pct: number;
    policy_title: string;
    policy_description: string;
    is_enabled: boolean;
  }>;
  exclusions: Array<{
    exclusion_code: string;
    policy_title: string;
    policy_description: string;
    is_enabled: boolean;
  }>;
};

export type CompensationPolicySection = {
  heading: string;
  bullets: string[];
  variant: 'compensation' | 'exclusion';
};

function gracePeriodLabel(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  if (s < 60) return s === 1 ? '1 second' : `${s} seconds`;
  const mins = Math.round(s / 60);
  if (mins === 1) return '1 minute';
  return `${mins} minutes`;
}

function compensationHeading(pct: number): string {
  const rounded = Math.round(pct);
  if (rounded >= 100) return 'Full compensation (i.e., 100% of net order value):';
  if (rounded === 80) return '80% of net order value less reusable items compensation:';
  return `${rounded}% of net order value compensation:`;
}

function interpolatePolicyText(
  text: string,
  policy: MerchantCompensationPolicyDisplay,
): string {
  return text
    .replace(/\{threshold\}/gi, String(Math.round(policy.order_ready_accuracy_threshold)))
    .replace(/\{grace\}/gi, gracePeriodLabel(policy.customer_cancel_grace_seconds));
}

function scenarioBullet(
  scenario: MerchantCompensationPolicyDisplay['scenarios'][number],
  policy: MerchantCompensationPolicyDisplay,
): string {
  const desc = scenario.policy_description?.trim();
  if (desc) return interpolatePolicyText(desc, policy);
  const title = scenario.policy_title?.trim();
  if (title) return title;
  return 'See compensation terms.';
}

function exclusionBullet(
  rule: MerchantCompensationPolicyDisplay['exclusions'][number],
  policy: MerchantCompensationPolicyDisplay,
): string {
  const desc = rule.policy_description?.trim();
  if (desc) return interpolatePolicyText(desc, policy);
  const title = rule.policy_title?.trim();
  if (title) return title;
  return 'No compensation applies.';
}

function sectionHeadingForPct(
  pct: number,
  scenarios: MerchantCompensationPolicyDisplay['scenarios'],
): string {
  if (scenarios.length === 1) {
    const title = scenarios[0]?.policy_title?.trim();
    if (title) return `${Math.round(pct)}% — ${title}:`;
  }
  return compensationHeading(pct);
}

export function buildCompensationPolicySections(
  policy: MerchantCompensationPolicyDisplay,
): CompensationPolicySection[] {
  const sections: CompensationPolicySection[] = [];
  const byPct = new Map<number, MerchantCompensationPolicyDisplay['scenarios']>();

  for (const scenario of policy.scenarios) {
    if (!scenario.is_enabled) continue;
    const pct = Math.round(scenario.compensation_pct);
    const list = byPct.get(pct) ?? [];
    list.push(scenario);
    byPct.set(pct, list);
  }

  for (const pct of [...byPct.keys()].sort((a, b) => b - a)) {
    const scenarios = byPct.get(pct)!;
    sections.push({
      heading: sectionHeadingForPct(pct, scenarios),
      bullets: scenarios.map((s) => scenarioBullet(s, policy)),
      variant: 'compensation',
    });
  }

  const exclusionBullets = policy.exclusions
    .filter((e) => e.is_enabled)
    .map((e) => exclusionBullet(e, policy));

  if (exclusionBullets.length > 0) {
    sections.push({
      heading: 'No compensation:',
      bullets: exclusionBullets,
      variant: 'exclusion',
    });
  }

  return sections;
}

export function splitEligibleMessage(message: string): {
  brandPrefix: string | null;
  body: string;
} {
  const m = message.trim();
  const match = /^Cancelled by ([^:]+):\s*/i.exec(m);
  if (!match) return { brandPrefix: null, body: m };
  const brand = match[1]?.trim() ?? '';
  const body = m.slice(match[0].length).trim();
  return {
    brandPrefix: brand ? `Cancelled by ${brand}:` : null,
    body,
  };
}

export function splitCancellationEligibleMessage(message: string): {
  brandPrefix: string | null;
  cancelReason: string | null;
  policySentence: string | null;
} {
  const { brandPrefix, body } = splitEligibleMessage(message);
  if (!body) {
    return { brandPrefix, cancelReason: null, policySentence: null };
  }

  const policyMatch = /\.\s*(As per policy,.+)$/i.exec(body);
  if (policyMatch) {
    const reason = body.slice(0, policyMatch.index).trim().replace(/\.\s*$/, '');
    return {
      brandPrefix,
      cancelReason: reason || null,
      policySentence: policyMatch[1].trim(),
    };
  }

  return { brandPrefix, cancelReason: body, policySentence: null };
}

export function resolveCancellationMessageParts(args: {
  eligibleMessage?: string | null;
  cancelledByBrand?: string | null;
  reasonDetail?: string | null;
  rejectedReason?: string | null;
}): {
  brandPrefix: string | null;
  cancelReason: string | null;
  policySentence: string | null;
} {
  const eligible = args.eligibleMessage?.trim();
  const rejected =
    args.rejectedReason?.trim() ||
    args.reasonDetail?.trim() ||
    null;

  if (eligible) {
    const split = splitCancellationEligibleMessage(eligible);
    const cancelReason = rejected || split.cancelReason;
    if (cancelReason || split.policySentence) {
      return {
        brandPrefix: split.brandPrefix,
        cancelReason: cancelReason || null,
        policySentence: split.policySentence,
      };
    }
  }

  const brand = args.cancelledByBrand?.trim();
  const reason = rejected;
  if (brand || reason) {
    return {
      brandPrefix: brand ? `Cancelled by ${brand}:` : null,
      cancelReason: reason || null,
      policySentence: eligible ? splitCancellationEligibleMessage(eligible).policySentence : null,
    };
  }

  return { brandPrefix: null, cancelReason: null, policySentence: null };
}

export function formatAppliedPayoutPolicy(
  comp: MerchantCancellationCompensationDisplay | null | undefined,
): string | null {
  if (!comp) return null;

  if (comp.admin_override) {
    const amount = comp.merchant_keeps_amount;
    const pct = Math.round(comp.compensation_pct);
    if (pct <= 0 || amount <= 0) {
      return 'Payout adjusted by admin — no compensation for this cancellation.';
    }
    if (pct >= 100) {
      return `Payout adjusted by admin — full compensation — you receive ₹${amount.toFixed(2)}.`;
    }
    return `Payout adjusted by admin — you receive ₹${amount.toFixed(2)}.`;
  }

  if (!comp.engine_enabled) return null;
  const pct = Math.round(comp.compensation_pct);
  const title = comp.applied_policy_title?.trim();
  const amount = comp.merchant_keeps_amount;

  if (comp.exclusion_code || pct <= 0) {
    return title
      ? `Payout policy applied: No compensation (${title}).`
      : 'Payout policy applied: No compensation for this cancellation.';
  }
  if (pct >= 100) {
    return title
      ? `Payout policy applied: Full compensation (${title}) — you receive ₹${amount.toFixed(2)}.`
      : `Payout policy applied: Full compensation — you receive ₹${amount.toFixed(2)}.`;
  }
  return title
    ? `Payout policy applied: ${pct}% compensation (${title}) — you receive ₹${amount.toFixed(2)}.`
    : `Payout policy applied: ${pct}% of net order value — you receive ₹${amount.toFixed(2)}.`;
}
