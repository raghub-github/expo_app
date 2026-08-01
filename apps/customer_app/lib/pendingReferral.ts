/**
 * Deferred referral attribution — stores pending code from deep link / Play Install Referrer.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@gatimitra/pending_referral_v1";

export type PendingReferral = {
  code: string;
  clickToken?: string | null;
  source: "deep_link" | "play_install_referrer";
  savedAt: string;
};

export async function storePendingReferral(pending: Omit<PendingReferral, "savedAt">): Promise<void> {
  const code = pending.code?.trim().toUpperCase();
  if (!code) return;
  const payload: PendingReferral = {
    ...pending,
    code,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

export async function peekPendingReferral(): Promise<PendingReferral | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingReferral;
    if (!parsed?.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingReferral(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** Parse gatimitra://referral?code=…&click=… or https://gatimitra.com/ref/CODE */
export function parseReferralFromUrl(url: string | null | undefined): {
  code: string;
  clickToken?: string;
} | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.replace(/^gatimitra:\/\//, "https://gatimitra.local/"));
    const path = u.pathname || "";
    const codeFromQuery = u.searchParams.get("code") || u.searchParams.get("ref");
    const click = u.searchParams.get("click") || undefined;
    const m = path.match(/\/(?:ref|invite)\/([A-Za-z0-9_-]+)/i);
    const code = (codeFromQuery || m?.[1] || "").trim().toUpperCase();
    if (!code) return null;
    return { code, clickToken: click };
  } catch {
    return null;
  }
}

/** Play Install Referrer payload like ref_GMBHIM123 */
export function parsePlayInstallReferrer(referrer: string | null | undefined): string | null {
  const raw = String(referrer ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith("ref_")) return raw.slice(4).toUpperCase();
  if (/^[A-Z0-9_-]{4,32}$/i.test(raw) && !lower.startsWith("addr_")) {
    return raw.toUpperCase();
  }
  return null;
}
