/**
 * Native deep-link URL rewriter (Expo Router).
 *
 * FCM / Android often launches the Partner app as `gatimitra-merchant:///`
 * (empty path) when an order notification is tapped. Without this rewriter
 * Expo Router lands on the Unmatched Route screen.
 *
 * Empty launcher URLs MUST land on `/` so Index can wait for session
 * validation. Never send a cold start to `/(tabs)` — that mounts the
 * authenticated tree before auth is known.
 *
 * New-order pushes deep-link to `/(tabs)?orderTab=New`. Lifecycle / rider /
 * rating pushes deep-link to `/order/{foodId}` — preserve that path.
 *
 * See: https://docs.expo.dev/router/advanced/native-intent/
 */

function stripScheme(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.includes("://")) {
      const normalized = trimmed.replace(/^gatimitra-merchant:\/\//i, "https://gatimitra.local/");
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

function foodOrderIdFromPath(path: string): string | null {
  const m = path.match(/\/order(?:s)?\/(\d+)(?:\/|\?|#|$)/i);
  return m?.[1] ?? null;
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

    // Preserve explicit New-tab deep links from MERCHANT_NEW_ORDER pushes.
    if (/orderTab=New/i.test(p) || /(^|\/)new_order(\/|\?|$)/i.test(p)) {
      return "/(tabs)?orderTab=New";
    }

    // Lifecycle / rider / rating: keep numeric order detail routes.
    const foodId = foodOrderIdFromPath(p);
    if (foodId) return `/order/${foodId}`;

    const empty =
      !p ||
      p === "/" ||
      p === "/--" ||
      p === "/index" ||
      /^\/?\?/.test(p) ||
      /^\/+$/.test(p);
    // Empty launcher URL: Index decides Login vs inner app after session validation.
    if (empty) return AUTH_ENTRY;

    const ordersList = p.match(/^\/+orders\/?(?:\?(.*))?$/i);
    if (ordersList) {
      const q = ordersList[1] ? `?${ordersList[1]}` : "";
      return `/(tabs)/orders${q}`;
    }
    void initial;
  } catch {
    void initial;
    return AUTH_ENTRY;
  }
  return path;
}
