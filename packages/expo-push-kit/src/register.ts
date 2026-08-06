import type { PushDeviceMetadata } from "./types";
import type { NativePushTokenType } from "./types";

export type RegisterPushBody = {
  expo_push_token?: string | null;
  device_type: "ios" | "android" | "web" | "unknown";
  native_push_token?: string | null;
  native_token_type?: NativePushTokenType | null;
  store_id?: number | null;
  device_model?: string | null;
  device_brand?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  app_version?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

export type UnregisterPushBody = {
  expo_push_token?: string | null;
  native_push_token?: string | null;
};

async function pushFetch(
  url: string,
  accessToken: string,
  body: unknown
): Promise<{ ok: boolean; status: number; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    const isAbort = (e as Error)?.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: isAbort ? "timeout_after_15s" : e instanceof Error ? e.message : "network_error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * POST /v1/push/register with Bearer token (role comes from JWT).
 */
export async function registerExpoPushTokenOnBackend(
  apiBaseUrl: string,
  accessToken: string,
  body: RegisterPushBody
): Promise<{ ok: boolean; status: number; error?: string }> {
  const base = apiBaseUrl.replace(/\/$/, "");
  return pushFetch(`${base}/v1/push/register`, accessToken, body);
}

/**
 * POST /v1/push/unregister — remove Expo + native tokens and unsubscribe topics.
 */
export async function unregisterPushTokenOnBackend(
  apiBaseUrl: string,
  accessToken: string,
  body: UnregisterPushBody
): Promise<{ ok: boolean; status: number; error?: string }> {
  const base = apiBaseUrl.replace(/\/$/, "");
  return pushFetch(`${base}/v1/push/unregister`, accessToken, body);
}

export type { PushDeviceMetadata };
