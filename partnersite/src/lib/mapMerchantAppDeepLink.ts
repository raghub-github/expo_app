/**
 * Merchant app (Expo) notification deep links → Partner Site web routes.
 * Shared inbox rows often store Expo paths like `/(tabs)` or `/restaurant-status`,
 * which 404 on partner.gatimitra.com if opened raw.
 */
export function mapMerchantAppDeepLinkToPartnersite(
  raw: string | null | undefined,
  opts?: { preferMx?: boolean }
): string {
  const preferMx = opts?.preferMx === true;
  const dash = preferMx ? "/mx/dashboard" : "/partners/dashboard";
  const food = preferMx ? "/mx/food-orders" : "/partners/food-orders";
  const settings = preferMx ? "/mx/store-settings" : "/partners/store-settings";
  const profile = preferMx ? "/mx/profile" : "/partners/profile";

  const t = String(raw ?? "").trim();
  if (!t) return dash;

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (typeof window !== "undefined" && u.origin === window.location.origin) {
        return mapMerchantAppDeepLinkToPartnersite(`${u.pathname}${u.search}${u.hash}`, opts);
      }
    } catch {
      /* fall through */
    }
    return t;
  }

  let path = t.startsWith("/") ? t : `/${t}`;
  const qIndex = path.indexOf("?");
  const hashIndex = path.indexOf("#");
  let search = "";
  let hash = "";
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex);
    path = path.slice(0, hashIndex);
  }
  if (qIndex >= 0) {
    search = path.slice(qIndex);
    path = path.slice(0, qIndex);
  }
  path = path.replace(/\/+$/, "") || "/";

  // Already a partner web path
  if (path.startsWith("/partners/") || path.startsWith("/mx/") || path.startsWith("/auth/")) {
    return `${path}${search}${hash}`;
  }

  if (path === "/" || path === "/(tabs)" || path === "/(tabs)/index" || path === "/index") {
    return `${dash}${search}${hash}`;
  }
  if (path.startsWith("/(tabs)/orders") || path === "/orders") {
    return `${food}${search}${hash}`;
  }
  if (path.includes("/restaurant-status") || path.endsWith("/profile/status")) {
    return `${dash}${search}${hash}`;
  }
  if (path.includes("/profile/vacation") || path.includes("/profile/hours")) {
    const tab = path.includes("vacation") ? "operations" : "timings";
    const join = search.includes("tab=") ? search : `${search ? `${search}&` : "?"}tab=${tab}`;
    return `${settings}${join}${hash}`;
  }
  if (path.includes("/profile/offers") || path.includes("/offers")) {
    return `${preferMx ? "/mx/offers" : "/partners/offers"}${search}${hash}`;
  }
  if (path.includes("/earnings") || path.includes("/payments")) {
    return `${preferMx ? "/mx/payments" : "/partners/payments"}${search}${hash}`;
  }
  if (path.includes("/reviews") || path.includes("/complaints")) {
    return `${preferMx ? "/mx/user-insights" : "/partners/user-insights"}${search}${hash}`;
  }
  if (path.includes("/menu")) {
    return `${preferMx ? "/mx/menu" : "/partners/menu"}${search}${hash}`;
  }
  if (path.includes("/profile")) {
    return `${profile}${search}${hash}`;
  }
  if (path.startsWith("/order/")) {
    return `${food}${search}${hash}`;
  }
  if (path === "/notifications" || path.startsWith("/notifications/")) {
    return `${food}${search}${hash}`;
  }

  // Unknown Expo-style path → safe home
  if (path.includes("(tabs)") || path.includes("restaurant-status")) {
    return dash;
  }

  return `${path}${search}${hash}`;
}
