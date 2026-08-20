/**
 * Native deep-link URL rewriter (Expo Router).
 *
 * FCM / Android often launches the Partner app as `gatimitra-merchant:///`
 * (empty path) when an order notification is tapped. Without this rewriter
 * Expo Router lands on the Unmatched Route screen.
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

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const p = stripScheme(path ?? "");
    const foodId = foodOrderIdFromPath(p);
    if (foodId) return `/order/${foodId}`;

    const empty =
      !p ||
      p === "/" ||
      p === "/--" ||
      p === "/index" ||
      /^\/?\?/.test(p) ||
      /^\/+$/.test(p);
    if (empty) return "/(tabs)";

    if (/(^|\/)new_order(\/|\?|$)/i.test(p)) return "/(tabs)/orders";

    const ordersList = p.match(/^\/+orders\/?(?:\?(.*))?$/i);
    if (ordersList) {
      const q = ordersList[1] ? `?${ordersList[1]}` : "";
      return `/(tabs)/orders${q}`;
    }
    void initial;
  } catch {
    void initial;
    return "/(tabs)";
  }
  return path;
}
