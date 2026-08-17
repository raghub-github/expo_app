/**
 * Resolve ws-gateway base URL the same way merchant/rider/customer apps do:
 * EXPO_PUBLIC_WS_BASE_URL → NEXT_PUBLIC_WS_BASE_URL → derive from REST host :4100.
 */
export function resolveDashboardWsBaseUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_WS_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  const apiBase = (
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    ""
  )
    .trim()
    .replace(/\/+$/, "");

  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      const wsPort = (process.env.NEXT_PUBLIC_WS_PORT ?? "4100").trim() || "4100";
      if (parsed.port === "3000" || parsed.port === "4000" || parsed.port === "") {
        parsed.port = wsPort;
      }
      parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      return parsed.origin;
    } catch {
      /* fall through */
    }
  }

  if (process.env.NODE_ENV === "development") {
    return "ws://127.0.0.1:4100";
  }
  return "wss://ws.gatimitra.com";
}
