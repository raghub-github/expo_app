export type RegisterPushBody = {
  expo_push_token: string;
  device_type: "ios" | "android" | "web" | "unknown";
  /**
   * Optional device / app / locale metadata. Backed by migration 0419 —
   * server accepts + stores what's present, ignores what's absent. Sending
   * these unlocks:
   *   - targeted sends by app_version (staged rollouts)
   *   - locale-aware template rendering
   *   - timezone-respecting scheduled pushes
   *   - analytics: active devices by model / OS
   */
  device_model?: string | null;
  device_brand?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  app_version?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

/**
 * POST /v1/push/register with Bearer token (role comes from JWT).
 * Uses AbortController to fail fast on flaky LAN (default fetch has no
 * timeout, would hang forever). 15s window is longer than typical mobile
 * network variance but short enough that a broken deploy shows quickly.
 */
export async function registerExpoPushTokenOnBackend(
  apiBaseUrl: string,
  accessToken: string,
  body: RegisterPushBody,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${base}/v1/push/register`, {
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
      error: isAbort ? "timeout_after_15s" : (e instanceof Error ? e.message : "network_error"),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
