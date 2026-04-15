import { notifySessionRevoked } from "@/services/sessionEvents";

export async function authFetch(
  url: string,
  token: string,
  opts: RequestInit = {}
): Promise<Response> {
  const shouldSetJsonContentType =
    opts.body != null &&
    // If caller passes FormData, let fetch set the correct multipart boundary.
    !(typeof FormData !== "undefined" && opts.body instanceof FormData);

  let res: Response;
  try {
    res = await fetch(url, {
      ...opts,
      headers: {
        ...(shouldSetJsonContentType ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        /** Lets backend set unified_tickets.buyer_np_name for GatiMitra merchant tickets (IGM / NP flows). */
        "X-Merchant-App-Slug": "gatimitra",
        ...(opts.headers || {}),
      },
    });
  } catch (e) {
    const detail =
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : e instanceof TypeError
          ? "Request could not be completed (network, DNS, or invalid URL)."
          : String(e);
    throw new Error(`Network request failed: ${detail}`);
  }

  if (res.status === 401) {
    try {
      const cloned = res.clone();
      const data = (await cloned.json()) as any;
      const code = typeof data?.error === "string" ? data.error : undefined;
      const msg = typeof data?.message === "string" ? data.message : "";
      /**
       * Only force “session ended” when auth plugin explicitly revoked this/all devices.
       * Other 401 bodies may reuse `session_revoked` (e.g. wrong app routes) — those must not auto sign-out.
       */
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

