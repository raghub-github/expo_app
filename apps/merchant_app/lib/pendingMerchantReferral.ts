/**
 * Deferred merchant referral attribution from deep link / landing page.
 */

import * as SecureStore from "expo-secure-store";

const KEY = "merchant_pending_referral_v1";

export type PendingMerchantReferral = {
  code: string;
  clickToken?: string | null;
  source: "deep_link";
  savedAt: string;
};

export async function storePendingMerchantReferral(
  pending: Omit<PendingMerchantReferral, "savedAt">,
): Promise<void> {
  const code = pending.code?.trim().toUpperCase();
  if (!code) return;
  const payload: PendingMerchantReferral = {
    ...pending,
    code,
    savedAt: new Date().toISOString(),
  };
  await SecureStore.setItemAsync(KEY, JSON.stringify(payload));
}

export async function peekPendingMerchantReferral(): Promise<PendingMerchantReferral | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingMerchantReferral;
    if (!parsed?.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingMerchantReferral(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

/** gatimitra-merchant://referral?code=… or https://partner.gatimitra.com/merchant-ref/CODE */
export function parseMerchantReferralFromUrl(url: string | null | undefined): {
  code: string;
  clickToken?: string;
} | null {
  if (!url?.trim()) return null;
  try {
    const normalized = url.replace(/^gatimitra-merchant:\/\//i, "https://gatimitra.local/");
    const u = new URL(normalized);
    const path = u.pathname || "";
    const codeFromQuery = u.searchParams.get("code") || u.searchParams.get("ref");
    const click = u.searchParams.get("click") || undefined;
    const m = path.match(/\/(?:merchant-ref|referral)\/([A-Za-z0-9_-]+)/i);
    const code = (codeFromQuery || m?.[1] || "").trim().toUpperCase();
    if (!code) return null;
    return { code, clickToken: click };
  } catch {
    return null;
  }
}
