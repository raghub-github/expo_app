/**
 * Server-side merchant session validation.
 * Presence of a SecureStore token / partner cache is never treated as logged-in.
 */

import { getConfig } from "@/config/env";
import type { PartnerData } from "@/context/AuthContext";
import {
  clearAllMerchantAuthArtifacts,
  readMerchantAccessToken,
  readMerchantTokenExpiresAt,
} from "@/lib/merchantSessionStorage";
import { refreshMerchantSessionIfNeeded } from "@/services/merchantSessionRefresh";

const VALIDATE_TIMEOUT_MS = 12_000;

export type MerchantSession = {
  token: string;
  partner: PartnerData;
  expiresAt: number | null;
};

export type SessionValidationResult =
  | { ok: true; session: MerchantSession }
  | { ok: false; reason: "invalid" | "network" };

export function parsePartnerData(raw: unknown): PartnerData | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PartnerData>;
  if (!p.parent || typeof p.parent !== "object" || p.parent.id == null) return null;
  return {
    parent: p.parent,
    childStores: Array.isArray(p.childStores) ? p.childStores : [],
    activeDevices: typeof p.activeDevices === "number" ? p.activeDevices : 0,
  };
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
    return { ok: false, reason: "invalid" };
  }

  let token = stored.trim();
  const expiresAt = await readMerchantTokenExpiresAt();
  const nowSec = Math.floor(Date.now() / 1000);
  const locallyExpired = expiresAt != null && expiresAt <= nowSec;

  try {
    if (locallyExpired) {
      const refreshed = await refreshMerchantSessionIfNeeded({ force: true });
      if (!refreshed?.trim()) {
        await clearAllMerchantAuthArtifacts();
        return { ok: false, reason: "invalid" };
      }
      token = refreshed.trim();
    }

    let res = await fetchPartnerMe(token, VALIDATE_TIMEOUT_MS);

    if (res.status === 401) {
      const refreshed = await refreshMerchantSessionIfNeeded({ force: true });
      if (!refreshed?.trim()) {
        await clearAllMerchantAuthArtifacts();
        return { ok: false, reason: "invalid" };
      }
      token = refreshed.trim();
      res = await fetchPartnerMe(token, VALIDATE_TIMEOUT_MS);
    }

    if (res.status === 401) {
      await clearAllMerchantAuthArtifacts();
      return { ok: false, reason: "invalid" };
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

    // The token was ACCEPTED (not 401) but we couldn't read a partner — a transient 5xx, an
    // unexpected body shape, or a slow gateway. Auth did NOT fail, so never log the merchant out
    // here: return "network" so the caller keeps the persisted session and re-validates later.
    // Only a confirmed 401 (above) or an expired token whose refresh failed clears the session.
    return { ok: false, reason: "network" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
