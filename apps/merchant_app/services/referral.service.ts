/**
 * Merchant referral config + authenticated /me profile.
 * Amounts come from Super Admin via the backend — never hardcode rewards.
 */

import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

export type MerchantReferralRewardSummary = {
  inviteeLines: string[];
  shareLines: string[];
  headline: string;
  rewardsPaused: boolean;
  inviteeRewardLabel?: string | null;
  referrerRewardLabel?: string | null;
  conditionLine?: string;
  ogSummary?: string;
};

export type MerchantReferralConfig = {
  configVersion: number;
  enabled: boolean;
  referralEnabled: boolean;
  rewardEnabled: boolean;
  requireKyc: boolean;
  currency: string;
  rewardSummary?: MerchantReferralRewardSummary;
  milestones: Array<{
    id: number;
    name: string;
    milestoneOrders: number;
    rewardAmount: number;
    referredRewardAmount?: number | null;
    alsoCreditReferred?: boolean;
    rewardType: string;
    eventType?: string | null;
    requireKyc: boolean;
    minOrderAmount?: number | null;
    priority?: number | null;
  }>;
};

export type MerchantReferralHistoryItem = {
  id: number | string;
  referred_user_id?: number | string;
  referred_display_id?: string | null;
  referred_name?: string | null;
  status?: string;
  reward_status?: string;
  completed_orders?: number;
  reward_earned?: number;
  is_active?: boolean;
  created_at?: string;
  auto_applied?: boolean;
  kyc_approved?: boolean;
};

export type MerchantReferralStats = {
  totalReferrals: number;
  totalActive: number;
  totalEarned: number;
};

export type MerchantReferralMeResponse = {
  ok: boolean;
  referralCode: string | null;
  shareUrl: string | null;
  history: MerchantReferralHistoryItem[];
  stats?: MerchantReferralStats;
  config: MerchantReferralConfig;
};

const getBase = () => getConfig().apiBaseUrl;

export async function fetchMerchantReferralConfig(): Promise<MerchantReferralConfig | null> {
  try {
    const res = await fetch(`${getBase()}/v1/referral/config?userType=merchant`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as MerchantReferralConfig & { ok?: boolean };
    return {
      ...body,
      configVersion: Number(body.configVersion) || 0,
      milestones: (body.milestones ?? []).map((m) => ({
        ...m,
        milestoneOrders: Number(m.milestoneOrders) || 0,
        rewardAmount: Number(m.rewardAmount) || 0,
        referredRewardAmount:
          m.referredRewardAmount == null ? null : Number(m.referredRewardAmount) || 0,
      })),
    };
  } catch {
    return null;
  }
}

export async function fetchMerchantReferralMe(token: string): Promise<MerchantReferralMeResponse> {
  const res = await authFetch(`${getBase()}/v1/referral/me`, token, { timeoutMs: 12_000 });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load referrals");
  }
  const body = (await res.json()) as MerchantReferralMeResponse;
  const history = (Array.isArray(body.history) ? body.history : []).map((row) => ({
    ...row,
    reward_earned: Number(row.reward_earned ?? 0) || 0,
    is_active: Boolean(row.is_active),
  }));
  return {
    ...body,
    history,
    stats: body.stats ?? {
      totalReferrals: history.length,
      totalActive: history.filter((r) => r.is_active).length,
      totalEarned: history.reduce((s, r) => s + (Number(r.reward_earned) || 0), 0),
    },
    config: (body.config ?? {
      configVersion: 0,
      enabled: false,
      referralEnabled: false,
      rewardEnabled: false,
      requireKyc: false,
      currency: "INR",
      milestones: [],
    }) as MerchantReferralConfig,
  };
}

export async function fetchMerchantReferralShare(
  token: string,
): Promise<{ message: string; shareUrl: string | null; referralCode: string | null }> {
  const res = await authFetch(`${getBase()}/v1/referral/share`, token, {
    method: "POST",
    body: JSON.stringify({ channel: "native" }),
    timeoutMs: 12_000,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Could not build share message");
  }
  const body = (await res.json()) as {
    message?: string;
    shareUrl?: string | null;
    referralCode?: string | null;
  };
  return {
    message: String(body.message ?? ""),
    shareUrl: body.shareUrl ?? null,
    referralCode: body.referralCode ?? null,
  };
}

export async function applyMerchantReferral(
  token: string,
  opts: { referralCode: string; clickToken?: string | null },
): Promise<{ ok: boolean; alreadyApplied?: boolean; error?: string }> {
  const res = await authFetch(`${getBase()}/v1/referral/apply`, token, {
    method: "POST",
    body: JSON.stringify({
      referralCode: opts.referralCode,
      clickToken:
        opts.clickToken && opts.clickToken.length >= 8 ? opts.clickToken : undefined,
      source: "deep_link",
    }),
    timeoutMs: 12_000,
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    code?: string;
    alreadyApplied?: boolean;
  };
  const disabled =
    body.code === "REFERRAL_SERVICE_DISABLED" ||
    body.error === "REFERRAL_SERVICE_DISABLED" ||
    body.error === "referral_disabled";
  if (disabled) {
    return { ok: false, alreadyApplied: false, error: "REFERRAL_SERVICE_DISABLED" };
  }
  if (body.alreadyApplied) {
    return { ok: true, alreadyApplied: true };
  }
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      return { ok: false, alreadyApplied: false, error: body.error || body.code };
    }
    throw new Error(body.error || "Could not apply referral");
  }
  return { ok: body.ok !== false, alreadyApplied: Boolean(body.alreadyApplied) };
}
