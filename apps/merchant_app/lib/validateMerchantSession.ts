/**
 * Server-side merchant session validation.
 * Presence of a SecureStore token / partner cache is never treated as logged-in.
 *
 * IMPORTANT: This module never clears auth storage. Callers must clear only when the
 * failing token is still the live session (prevents old 401/validate from wiping a
 * newer login).
 */

import { getConfig } from "@/config/env";
import type { PartnerData } from "@/context/AuthContext";
import {
  readMerchantAccessToken,
  readMerchantTokenExpiresAt,
} from "@/lib/merchantSessionStorage";
import { refreshMerchantSessionIfNeeded } from "@/services/merchantSessionRefresh";
import {
  hasValidMerchantIdentity,
  parsePartnerData as parsePartnerIdentity,
} from "@/lib/merchantPartnerIdentity";

export { hasValidMerchantIdentity };
export type { MerchantIdentityPartner } from "@/lib/merchantPartnerIdentity";

const VALIDATE_TIMEOUT_MS = 12_000;

export type MerchantSession = {
  token: string;
  partner: PartnerData;
  expiresAt: number | null;
};

export type SessionValidationResult =
  | { ok: true; session: MerchantSession }
  | { ok: false; reason: "invalid" | "network"; tokenAttempted: string | null };

export function parsePartnerData(raw: unknown): PartnerData | null {
  const parsed = parsePartnerIdentity(raw);
  return parsed as PartnerData | null;
}

async function fetchPartnerMe(token: string, timeoutMs: number): Promise<Response> {
  const { apiBaseUrl } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${apiBaseUrl}/v1/merchant-partner/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function partnerFromMeResponse(res: Response): Promise<PartnerData | null> {
  if (!res.ok) return null;
  try {
    const data = (await res.json()) as unknown;
    return parsePartnerData(data);
  } catch {
    return null;
  }
}

/**
 * Confirm the stored JWT against the backend device-session source of truth.
 * Returns invalid for missing/expired/revoked tokens; network if we cannot tell.
 */
export async function validateMerchantSessionFromStore(): Promise<SessionValidationResult> {
  const stored = await readMerchantAccessToken();
  if (!stored?.trim()) {
    return { ok: false, reason: "invalid", tokenAttempted: null };
  }

  let token = stored.trim();
  const expiresAt = await readMerchantTokenExpiresAt();
  const nowSec = Math.floor(Date.now() / 1000);
  const locallyExpired = expiresAt != null && expiresAt <= nowSec;

  try {
    if (locallyExpired) {
      const refreshed = await refreshMerchantSessionIfNeeded({ force: true });
      if (!refreshed?.trim()) {
        return { ok: false, reason: "invalid", tokenAttempted: token };
      }
      token = refreshed.trim();
    }

    let res = await fetchPartnerMe(token, VALIDATE_TIMEOUT_MS);

    if (res.status === 401) {
      const refreshed = await refreshMerchantSessionIfNeeded({ force: true });
      if (!refreshed?.trim()) {
        return { ok: false, reason: "invalid", tokenAttempted: token };
      }
      token = refreshed.trim();
      res = await fetchPartnerMe(token, VALIDATE_TIMEOUT_MS);
    }

    if (res.status === 401) {
      return { ok: false, reason: "invalid", tokenAttempted: token };
    }

    const partner = await partnerFromMeResponse(res);
    if (partner) {
      return {
        ok: true,
        session: {
          token,
          partner,
          expiresAt: (await readMerchantTokenExpiresAt()) ?? expiresAt,
        },
      };
    }

    // Token accepted (not 401) but partner unreadable — transient; never treat as logout.
    return { ok: false, reason: "network", tokenAttempted: token };
  } catch {
    return { ok: false, reason: "network", tokenAttempted: token };
  }
}
