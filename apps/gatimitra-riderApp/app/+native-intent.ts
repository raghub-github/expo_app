/**
 * Native deep-link URL rewriter (Expo Router).
 *
 * FCM / Android often launches the Rider app as `gatimitra-rider:///`
 * (empty path) when a dispatch notification is tapped. Without this rewriter
 * Expo Router can land on the Unmatched Route screen.
 *
 * Empty launcher URLs MUST land on `/` so Index can wait for session
 * validation. Dispatch taps go to `/(tabs)/orders`.
 *
 * See: https://docs.expo.dev/router/advanced/native-intent/
 */

function stripScheme(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.includes("://")) {
      const normalized = trimmed.replace(/^gatimitra-rider:\/\//i, "https://gatimitra.local/");
      const u = new URL(normalized);
      const host = u.hostname === "gatimitra.local" ? "" : u.hostname;
      const pathPart = u.pathname && u.pathname !== "/" ? u.pathname : "";
      const combined = `/${host}${pathPart}`.replace(/\/+/g, "/");
      const path = `${combined === "/" && !host ? "/" : combined}${u.search || ""}`;
      return path;
    }
  } catch {
    /* fall through */
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const AUTH_ENTRY = "/";

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const p = stripScheme(path ?? "");

    if (
      /dispatch_offer/i.test(p) ||
      /RIDER_DISPATCH_OFFER/i.test(p) ||
      /(^|\/)orders(\/|\?|$)/i.test(p)
    ) {
      return "/(tabs)/orders";
    }

    const empty =
      !p ||
      p === "/" ||
      p === "/--" ||
      p === "/index" ||
      /^\/?\?/.test(p) ||
      /^\/+$/.test(p);
    if (empty) return AUTH_ENTRY;

    void initial;
  } catch {
    void initial;
    return AUTH_ENTRY;
  }
  return path;
}
