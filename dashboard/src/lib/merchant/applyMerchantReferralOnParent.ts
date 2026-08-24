/**
 * After merchant_parents insert, attribute a referral to the parent PK.
 * Never fails parent/store registration — apply is retry-safe / idempotent.
 */

type ApplySource = "deep_link" | "play_install_referrer" | "manual" | "share_sheet" | "unknown";

function backendBase(): string {
  return (
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : "")
  ).replace(/\/+$/, "");
}

function internalSecret(): string {
  return (
    process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim() ||
    process.env.INTERNAL_API_TOKEN?.trim() ||
    ""
  );
}

export async function applyMerchantReferralOnParentCreate(opts: {
  parentPk: number | string | null | undefined;
  referralCode?: string | null;
  source?: ApplySource;
  referredPhone?: string | null;
  createIfMissing?: boolean;
}): Promise<{ ok: boolean; status?: number; error?: string; referralCode?: string | null }> {
  const code = String(opts.referralCode ?? "").trim().toUpperCase();
  const parentPk = opts.parentPk;
  if (parentPk == null || parentPk === "") return { ok: true };
  const secret = internalSecret();
  const base = backendBase();
  if (!secret || !base) {
    console.warn("[referral] skip apply-onboarding: missing backend URL or secret");
    return { ok: false, error: "missing_secret" };
  }
  try {
    const res = await fetch(`${base}/v1/referral/internal/apply-onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({
        ...(code ? { referralCode: code } : {}),
        parentMerchantId: parentPk,
        source: opts.source ?? "manual",
        referredPhone: opts.referredPhone ?? undefined,
        createIfMissing: opts.createIfMissing ?? true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        referralCode?: string | null;
      };
      console.warn("[referral] apply-onboarding failed", res.status, body);
      return {
        ok: false,
        status: res.status,
        error: body.code || body.error,
        referralCode: body.referralCode ?? null,
      };
    }
    const body = (await res.json().catch(() => ({}))) as { referralCode?: string | null };
    return { ok: true, status: res.status, referralCode: body.referralCode ?? null };
  } catch (err) {
    console.warn("[referral] apply-onboarding error", err);
    return { ok: false, error: "apply_failed" };
  }
}
