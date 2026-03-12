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

  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(shouldSetJsonContentType ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });

  if (res.status === 401) {
    try {
      const cloned = res.clone();
      const data = (await cloned.json()) as any;
      const code = typeof data?.error === "string" ? data.error : undefined;
      if (code === "session_revoked") {
        notifySessionRevoked({ reason: "revoked" });
      }
    } catch {
      // ignore parse errors
    }
  }

  return res;
}

