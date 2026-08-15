/**
 * Rider referral config (public) + authenticated /me profile.
 * Amounts and milestones are Super Admin driven — never hardcode rewards.
 */

import { ApiError } from "@gatimitra/sdk";
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
    referredRewardAmount?: number | null;
    alsoCreditReferred?: boolean;
    eventType?: string | null;
    minOrderAmount?: number | null;
    priority?: number | null;
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
        referredRewardAmount:
          m.referredRewardAmount == null ? null : Number(m.referredRewardAmount) || 0,
        alsoCreditReferred: Boolean(m.alsoCreditReferred),
      })),
    };
  } catch {
    return null;
  }
}

export async function previewRiderReferral(code: string): Promise<{
  ok: boolean;
  valid?: boolean;
  code?: string;
  error?: string;
  message?: string;
  userMessage?: string;
}> {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length < 3) {
    return {
      ok: false,
      valid: false,
      error: "invalid_code",
      message: "Invalid referral code. Please check the code and try again.",
    };
  }
  const { apiBaseUrl } = getRiderAppConfig();
  try {
    const res = await fetch(
      `${apiBaseUrl}/v1/referral/preview?code=${encodeURIComponent(trimmed)}&userType=rider`,
      { headers: { Accept: "application/json" } },
    );
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      valid?: boolean;
      code?: string;
      error?: string;
      message?: string;
      userMessage?: string;
    };
    if (!res.ok || body.ok === false || body.valid === false) {
      return {
        ok: false,
        valid: false,
        error: body.error,
        message:
          body.userMessage ||
          body.message ||
          "Invalid referral code. Please check the code and try again.",
        userMessage: body.userMessage,
      };
    }
    return {
      ok: true,
      valid: true,
      code: body.code || trimmed,
      message: body.message,
    };
  } catch {
    return {
      ok: false,
      valid: false,
      error: "invalid_code",
      message: "Invalid referral code. Please check the code and try again.",
    };
  }
}

export async function applyRiderReferral(input: {
  referralCode?: string;
  clickToken?: string;
  playReferrer?: string;
  source?: "deep_link" | "play_install_referrer" | "manual" | "share_sheet" | "unknown";
  deviceFingerprint?: string;
}): Promise<{ ok: boolean; error?: string; alreadyApplied?: boolean }> {
  try {
    const body = await riderApi.applyReferral(input);
    const payload = body as { ok?: boolean; error?: string; code?: string; alreadyApplied?: boolean };
    if (
      payload?.code === "REFERRAL_SERVICE_DISABLED" ||
      payload?.error === "REFERRAL_SERVICE_DISABLED" ||
      payload?.error === "referral_disabled"
    ) {
      return { ok: false, error: "REFERRAL_SERVICE_DISABLED" };
    }
    return body as { ok: boolean; error?: string; alreadyApplied?: boolean };
  } catch (err) {
    if (err instanceof ApiError) {
      const payload = (err.payload ?? {}) as {
        error?: string;
        code?: string;
        alreadyApplied?: boolean;
      };
      if (payload.alreadyApplied) return { ok: true, alreadyApplied: true };
      const code = payload.code || payload.error;
      if (code === "REFERRAL_SERVICE_DISABLED" || code === "referral_disabled") {
        return { ok: false, error: "REFERRAL_SERVICE_DISABLED" };
      }
      return { ok: false, error: code || "apply_failed" };
    }
    throw err;
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
      enabled: false,
      referralEnabled: false,
      rewardEnabled: false,
      requireKyc: false,
      currency: "INR",
      milestones: [],
    }) as RiderReferralConfig,
  };
}
