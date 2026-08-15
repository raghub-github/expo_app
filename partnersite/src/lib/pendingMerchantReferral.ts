/**
 * Persist a merchant referral code through Partner Site onboarding,
 * including refresh, step changes, and login/signup.
 *
 * Priority is applied at submit time: explicit > deep-link > stored.
 */

const STORAGE_KEY = "gm_pending_merchant_referral_v1";
const COOKIE_KEY = "gm_pending_merchant_referral_v1";

export type PendingMerchantReferral = {
  code: string;
  clickToken?: string | null;
  source: "deep_link" | "manual";
  savedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function normalizeMerchantReferralCode(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function storePendingMerchantReferral(
  pending: Omit<PendingMerchantReferral, "savedAt">,
): void {
  if (!canUseStorage()) return;
  const code = normalizeMerchantReferralCode(pending.code);
  if (code.length < 3) return;
  const payload: PendingMerchantReferral = {
    ...pending,
    code,
    savedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function peekPendingMerchantReferral(): PendingMerchantReferral | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PendingMerchantReferral;
      const code = normalizeMerchantReferralCode(parsed?.code);
      if (code.length >= 3) return { ...parsed, code };
    }
  } catch {
    /* fall through to cookie */
  }
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`),
    );
    if (!match?.[1]) return null;
    const parsed = JSON.parse(decodeURIComponent(match[1])) as PendingMerchantReferral;
    const code = normalizeMerchantReferralCode(parsed?.code);
    if (code.length < 3) return null;
    storePendingMerchantReferral({
      code,
      clickToken: parsed.clickToken,
      source: parsed.source === "manual" ? "manual" : "deep_link",
    });
    return { ...parsed, code };
  } catch {
    return null;
  }
}

export function clearPendingMerchantReferral(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax`;
  } catch {
    /* ignore */
  }
}

export function pickMerchantReferralCode(opts: {
  explicit?: string | null;
  deepLink?: string | null;
  stored?: string | null;
}): string | null {
  const n = (v?: string | null) => {
    const t = normalizeMerchantReferralCode(v);
    return t.length >= 3 ? t : "";
  };
  return n(opts.explicit) || n(opts.deepLink) || n(opts.stored) || null;
}

export function parseMerchantReferralFromPath(
  pathname: string,
  search: string,
): { code: string; clickToken?: string } | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const fromQuery = params.get("ref") || params.get("code") || params.get("referralCode");
    const click = params.get("click") || undefined;
    const m = pathname.match(/\/merchant-ref\/([A-Za-z0-9_-]+)/i);
    const code = normalizeMerchantReferralCode(fromQuery || m?.[1] || "");
    if (!code) return null;
    return { code, clickToken: click };
  } catch {
    return null;
  }
}
