import { getConfig } from "@/config/env";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";
import {
  readMerchantAccessToken,
  readMerchantTokenExpiresAt,
  writeMerchantSessionToken,
} from "@/lib/merchantSessionStorage";

const AUTH_PREFIX = "/v1/auth";
const REFRESH_LEAD_SEC = 60 * 60 * 24; // refresh when < 24h left

type TokenListener = (token: string, expiresAt: number) => void;
const listeners: TokenListener[] = [];

let refreshInFlight: Promise<string | null> | null = null;

export function onMerchantTokenRefreshed(listener: TokenListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function emitTokenRefreshed(token: string, expiresAt: number): void {
  for (const listener of listeners) {
    try {
      listener(token, expiresAt);
    } catch {
      /* ignore */
    }
  }
}

export async function refreshMerchantSessionIfNeeded(opts?: {
  force?: boolean;
}): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const token = await readMerchantAccessToken();
    if (!token) return null;

    const expiresAt = await readMerchantTokenExpiresAt();
    const nowSec = Math.floor(Date.now() / 1000);
    if (!opts?.force && expiresAt != null && expiresAt - nowSec > REFRESH_LEAD_SEC) {
      return token;
    }

    const deviceId = await getOrCreateMerchantDeviceId();
    const { apiBaseUrl } = getConfig();
    const res = await fetch(`${apiBaseUrl}${AUTH_PREFIX}/merchant/refresh-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ deviceId }),
    });

    const raw = await res.text().catch(() => "");
    let data: { accessToken?: string; expiresAt?: number; error?: string } = {};
    try {
      data = raw ? (JSON.parse(raw) as typeof data) : {};
    } catch {
      return token;
    }

    if (!res.ok || !data.accessToken || !data.expiresAt) {
      return token;
    }

    await writeMerchantSessionToken(data.accessToken, data.expiresAt);
    emitTokenRefreshed(data.accessToken, data.expiresAt);
    return data.accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}
