export type RegisterPushBody = {
  expo_push_token: string;
  device_type: "ios" | "android" | "web" | "unknown";
};

/**
 * POST /v1/push/register with Bearer token (role comes from JWT).
 */
export async function registerExpoPushTokenOnBackend(
  apiBaseUrl: string,
  accessToken: string,
  body: RegisterPushBody
): Promise<{ ok: boolean; status: number; error?: string }> {
  const base = apiBaseUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "network_error" };
  }
}
