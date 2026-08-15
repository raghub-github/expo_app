import api from "./api";

const PREFIX = "/v1/referral";

/** Reward copy generated server-side from live config. */
export type ReferralRewardSummary = {
  inviteeLines: string[];
  shareLines: string[];
  headline: string;
  rewardsPaused: boolean;
  inviteeRewardLabel?: string | null;
  referrerRewardLabel?: string | null;
  conditionLine?: string;
  ogSummary?: string;
};

export type ReferralPublicConfig = {
  configVersion: number;
  enabled: boolean;
  referralEnabled: boolean;
  rewardEnabled: boolean;
  autoApplyEnabled: boolean;
  firstOrderOnly?: boolean;
  requireKyc?: boolean;
  minOrderAmount: number;
  monthlyRewardCap: number;
  currency: string;
  rewardSummary?: ReferralRewardSummary;
  milestones: Array<{
    id: number;
    name: string;
    milestoneOrders: number;
    rewardAmount: number;
    rewardType: string;
    alsoCreditReferred: boolean;
    referredRewardAmount: number | null;
    eventType?: string | null;
    requireKyc?: boolean;
    minOrderAmount?: number | null;
    priority?: number | null;
  }>;
};

export type ReferralHistoryItem = {
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

export type ReferralStats = {
  totalReferrals: number;
  totalActive: number;
  totalEarned: number;
};

export type ReferralMeResponse = {
  ok: boolean;
  referralCode: string | null;
  shareUrl: string | null;
  history: ReferralHistoryItem[];
  stats?: ReferralStats;
  config: ReferralPublicConfig;
};

export const referralService = {
  async getConfig(): Promise<ReferralPublicConfig> {
    const { data } = await api.get(`${PREFIX}/config`, {
      params: { userType: "customer" },
    });
    const body = data as ReferralPublicConfig & { ok?: boolean };
    return {
      ...body,
      configVersion: Number(body.configVersion) || 0,
      minOrderAmount: Number(body.minOrderAmount) || 0,
      monthlyRewardCap: Number(body.monthlyRewardCap) || 0,
      milestones: (body.milestones ?? []).map((m) => ({
        ...m,
        rewardAmount: Number(m.rewardAmount) || 0,
        referredRewardAmount:
          m.referredRewardAmount == null ? null : Number(m.referredRewardAmount) || 0,
        milestoneOrders: Number(m.milestoneOrders) || 0,
      })),
    };
  },

  async getMe(): Promise<ReferralMeResponse> {
    const { data } = await api.get(`${PREFIX}/me`);
    return data as ReferralMeResponse;
  },

  async preview(code: string): Promise<{
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
    try {
      const { data } = await api.get(`${PREFIX}/preview`, {
        params: { code: trimmed, userType: "customer" },
      });
      return data as {
        ok: boolean;
        valid?: boolean;
        code?: string;
        error?: string;
        message?: string;
        userMessage?: string;
      };
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { error?: string; code?: string; message?: string; userMessage?: string } };
      };
      const payload = ax.response?.data;
      return {
        ok: false,
        valid: false,
        error: payload?.code || payload?.error,
        message:
          payload?.userMessage ||
          payload?.message ||
          "Invalid referral code. Please check the code and try again.",
        userMessage: payload?.userMessage,
      };
    }
  },

  async apply(input: {
    referralCode?: string;
    clickToken?: string;
    playReferrer?: string;
    source?: "deep_link" | "play_install_referrer" | "manual" | "share_sheet" | "unknown";
    deviceFingerprint?: string;
  }): Promise<{ ok: boolean; error?: string; alreadyApplied?: boolean }> {
    try {
      const { data } = await api.post(`${PREFIX}/apply`, input);
      const body = data as { ok?: boolean; error?: string; code?: string; alreadyApplied?: boolean };
      if (
        body?.code === "REFERRAL_SERVICE_DISABLED" ||
        body?.error === "REFERRAL_SERVICE_DISABLED" ||
        body?.error === "referral_disabled"
      ) {
        return { ok: false, error: "REFERRAL_SERVICE_DISABLED" };
      }
      return body as { ok: boolean; error?: string; alreadyApplied?: boolean };
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string; code?: string; alreadyApplied?: boolean } } };
      const payload = ax.response?.data;
      if (payload?.alreadyApplied) {
        return { ok: true, alreadyApplied: true };
      }
      const code = payload?.code || payload?.error;
      if (code === "REFERRAL_SERVICE_DISABLED" || code === "referral_disabled") {
        return { ok: false, error: "REFERRAL_SERVICE_DISABLED" };
      }
      return { ok: false, error: code || "apply_failed" };
    }
  },
};
