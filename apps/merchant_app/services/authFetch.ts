import { notifySessionRevoked } from "@/services/sessionEvents";
import { refreshMerchantSessionIfNeeded } from "@/services/merchantSessionRefresh";

export async function authFetch(
  url: string,
  token: string,
  opts: RequestInit = {}
): Promise<Response> {
  // Normalize body for React Native fetch:
  // Some callers may accidentally pass non-string bodies (e.g. Date/object),
  // which can crash fetch internals ("string argument must be of type string...").
  let normalizedBody = opts.body as any;
  const isFormData =
    typeof FormData !== "undefined" && normalizedBody instanceof FormData;
  if (normalizedBody instanceof Date) {
    normalizedBody = normalizedBody.toISOString();
  } else if (
    normalizedBody != null &&
    !isFormData &&
    typeof normalizedBody !== "string" &&
    typeof normalizedBody !== "number" &&
    typeof normalizedBody !== "boolean"
  ) {
    try {
      normalizedBody = JSON.stringify(normalizedBody, (_k, v) => {
        const isDateObject = v != null && Object.prototype.toString.call(v) === "[object Date]";
        return isDateObject ? new Date(v as any).toISOString() : v;
      });
    } catch {
      // leave as-is; fetch will throw a clearer error
    }
  }

  const shouldSetJsonContentType =
    normalizedBody != null &&
    !(typeof FormData !== "undefined" && normalizedBody instanceof FormData);

  const buildRequest = (bearer: string): RequestInit => {
    let body = normalizedBody;
    const finalBodyType =
      body == null ? "null" : Object.prototype.toString.call(body);
    if (finalBodyType === "[object Date]") {
      body = new Date(body as any).toISOString();
    }
    return {
      ...opts,
      body,
      headers: {
        ...(shouldSetJsonContentType ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${bearer}`,
        "X-Merchant-App-Slug": "gatimitra",
        ...(opts.headers || {}),
      },
    };
  };

  let activeToken = token;

  const runFetch = async (): Promise<Response> => {
    try {
      return await fetch(url, buildRequest(activeToken));
    } catch (e) {
      const detail =
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : e instanceof TypeError
            ? "Request could not be completed (network, DNS, or invalid URL)."
            : String(e);
      throw new Error(`Network request failed: ${detail}`);
    }
  };

  let res = await runFetch();

  if (res.status === 401) {
    const errText = await res.clone().text().catch(() => "");
    let code = "";
    try {
      const data = JSON.parse(errText) as { error?: string };
      code = typeof data?.error === "string" ? data.error : "";
    } catch {
      /* ignore */
    }

    if (code === "invalid_token") {
      const refreshed = await refreshMerchantSessionIfNeeded({ force: true });
      if (refreshed && refreshed !== activeToken) {
        activeToken = refreshed;
        res = await runFetch();
      }
    }
  }

  if (res.status === 401) {
    try {
      const cloned = res.clone();
      const data = (await cloned.json()) as { error?: string; message?: string };
      const code = typeof data?.error === "string" ? data.error : undefined;
      const msg = typeof data?.message === "string" ? data.message : "";
      if (code === "session_revoked") {
        const isForcedDeviceLogout =
          msg.includes("Signed out from all devices") ||
          msg.includes("Signed out from this device");
        if (isForcedDeviceLogout) {
          notifySessionRevoked({ reason: "revoked" });
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return res;
}
