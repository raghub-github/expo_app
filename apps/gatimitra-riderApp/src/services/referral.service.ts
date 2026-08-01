/**
 * Rider referral config (public) + authenticated /me profile.
 * Amounts and milestones are Super Admin driven — never hardcode rewards.
 */

import { getRiderAppConfig } from "@/src/config/env";
import { riderApi } from "@/src/services/api/riderApi";

export type RiderReferralRewardSummary = {
  inviteeLines: string[];
  shareLines: string[];
  headline: string;
  rewardsPaused: boolean;
  inviteeRewardLabel?: string | null;
  referrerRewardLabel?: string | null;
  conditionLine?: string;
  ogSummary?: string;
};

export type RiderReferralConfig = {
  configVersion: number;
  enabled: boolean;
  referralEnabled: boolean;
  rewardEnabled: boolean;
  requireKyc: boolean;
  currency: string;
  rewardSummary?: RiderReferralRewardSummary;
  milestones: Array<{
    id: number;
    name: string;
    milestoneOrders: number;
    rewardAmount: number;
    rewardType: string;
    requireKyc: boolean;
  }>;
};

export type RiderReferralHistoryItem = {
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

export type RiderReferralStats = {
  totalReferrals: number;
  totalActive: number;
  totalEarned: number;
};

export type RiderReferralMeResponse = {
  ok: boolean;
  referralCode: string | null;
  shareUrl: string | null;
  history: RiderReferralHistoryItem[];
  stats?: RiderReferralStats;
  config: RiderReferralConfig;
};

export async function fetchRiderReferralConfig(
  signal?: AbortSignal,
): Promise<RiderReferralConfig | null> {
  const { apiBaseUrl } = getRiderAppConfig();
  try {
    const res = await fetch(`${apiBaseUrl}/v1/referral/config?userType=rider`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as RiderReferralConfig & { ok?: boolean };
    return {
      ...body,
      configVersion: Number(body.configVersion) || 0,
      milestones: (body.milestones ?? []).map((m) => ({
        ...m,
        milestoneOrders: Number(m.milestoneOrders) || 0,
        rewardAmount: Number(m.rewardAmount) || 0,
      })),
    };
  } catch {
    return null;
  }
}

export async function fetchRiderReferralMe(
  _signal?: AbortSignal,
): Promise<RiderReferralMeResponse> {
  const body = (await riderApi.getReferralMe()) as RiderReferralMeResponse;
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
      enabled: true,
      referralEnabled: true,
      rewardEnabled: true,
      requireKyc: false,
      currency: "INR",
      milestones: [],
    }) as RiderReferralConfig,
  };
}
