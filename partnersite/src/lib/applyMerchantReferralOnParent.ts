import { fetchBackend } from "@/lib/fetch-backend";

type ApplySource = "deep_link" | "play_install_referrer" | "manual" | "share_sheet" | "unknown";

function internalSecret(): string {
  return (
    process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim() ||
    process.env.INTERNAL_API_TOKEN?.trim() ||
    ""
  );
}

export type ApplyOnboardingResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

/**
 * After merchant_parents insert, attribute a referral to the parent PK.
 * Never fails parent registration — apply is retry-safe / idempotent.
 */
export async function applyMerchantReferralOnParentCreate(opts: {
  parentPk: number | string | null | undefined;
  referralCode?: string | null;
  source?: ApplySource;
  referredPhone?: string | null;
  createIfMissing?: boolean;
}): Promise<ApplyOnboardingResult> {
  const code = String(opts.referralCode ?? "").trim().toUpperCase();
  const parentPk = opts.parentPk;
  if (!code || parentPk == null || parentPk === "") return { ok: true };
  const secret = internalSecret();
  if (!secret) {
    console.warn("[referral] skip apply-onboarding: missing X-Internal-Secret");
    return { ok: false, error: "missing_secret" };
  }
  try {
    const res = await fetchBackend("/v1/referral/internal/apply-onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({
        referralCode: code,
        parentMerchantId: parentPk,
        source: opts.source ?? "manual",
        referredPhone: opts.referredPhone ?? undefined,
        createIfMissing: opts.createIfMissing ?? true,
      }),
      timeoutMs: 8_000,
    });
    if (!res) {
      console.warn("[referral] apply-onboarding unreachable");
      return { ok: false, error: "unreachable" };
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      console.warn("[referral] apply-onboarding failed", res.status, body);
      return {
        ok: false,
        status: res.status,
        error: body.code || body.error,
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.warn("[referral] apply-onboarding error", err);
    return { ok: false, error: "apply_failed" };
  }
}
