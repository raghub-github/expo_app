/**
 * Native deep-link URL rewriter (Expo Router).
 *
 * Incoming HTTPS App Links do not match the route tree 1:1. This file maps them
 * onto `app/address/save.tsx` before Expo Router resolves a screen.
 *
 * Canonical: https://gatimitra.com/address/share/<token>
 * Legacy:    https://gatimitra.com/addr/<shortCode>?id=<token>
 * Scheme:    gatimitra://address/save?id=<token>
 */

import { extractAddressShareToken, isAddressSharePath } from "@/lib/addressShareLink";

function isReferralPath(path: string): boolean {
  return /(^|\/\/|\/)(ref|invite)(\/|\?|$)/.test(path) || /referral(\?|$)/.test(path);
}

function extractReferralCode(path: string): { code: string; click?: string } | null {
  try {
    const normalized = path.includes("://")
      ? path.replace(/^gatimitra:\/\//, "https://gatimitra.local/")
      : `https://gatimitra.local${path.startsWith("/") ? path : `/${path}`}`;
    const u = new URL(normalized);
    const click = u.searchParams.get("click") || undefined;
    const fromQuery = u.searchParams.get("code") || u.searchParams.get("ref");
    const m = u.pathname.match(/\/(?:ref|invite)\/([A-Za-z0-9_-]+)/i);
    const code = (fromQuery || m?.[1] || "").trim().toUpperCase();
    if (!code) return null;
    return { code, click };
  } catch {
    return null;
  }
}

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (isAddressSharePath(path)) {
      const token = extractAddressShareToken(path);
      if (token) {
        return `/address/save?id=${encodeURIComponent(token)}`;
      }
      return `/address/save`;
    }
    if (isReferralPath(path)) {
      const parsed = extractReferralCode(path);
      if (parsed?.code) {
        const q = new URLSearchParams();
        q.set("code", parsed.code);
        if (parsed.click) q.set("click", parsed.click);
        return `/profile/referrals?${q.toString()}&autoApply=1`;
      }
    }
  } catch {
    void initial;
  }
  return path;
}
