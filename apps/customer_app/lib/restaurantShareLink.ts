/**
 * Public restaurant share URLs — same host as address share so App Links open
 * the Customer App. Canonical: https://gatimitra.com/restaurant/{public_slug}
 */

const STORE_WEB_BASE = "https://gatimitra.com";

export function buildRestaurantShareUrl(publicSlug: string): string {
  const slug = publicSlug.trim().replace(/^\/+|\/+$/g, "");
  if (!slug) return STORE_WEB_BASE;
  return `${STORE_WEB_BASE}/restaurant/${encodeURIComponent(slug)}`;
}

export function buildRestaurantShareMessage(storeName: string, url: string): string {
  const name = storeName.trim() || "Restaurant";
  return `${name}\n${url}`;
}

export function extractRestaurantShareSlug(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl?.trim()) return null;
  const raw = pathOrUrl.trim();
  try {
    const normalized = raw.includes("://")
      ? raw.replace(/^gatimitra:\/\//i, "https://gatimitra.local/")
      : `https://gatimitra.local${raw.startsWith("/") ? raw : `/${raw}`}`;
    const u = new URL(normalized);
    const fromQuery = (u.searchParams.get("store") || u.searchParams.get("id") || "").trim();
    const restaurantPath = u.pathname.match(/\/restaurant\/([^/?#]+)/i);
    if (restaurantPath?.[1]) {
      try {
        return decodeURIComponent(restaurantPath[1]).trim() || null;
      } catch {
        return restaurantPath[1].trim() || null;
      }
    }
    const merchantPath = u.pathname.match(/\/home\/merchant\/([^/?#]+)/i);
    if (merchantPath?.[1]) {
      try {
        return decodeURIComponent(merchantPath[1]).trim() || null;
      } catch {
        return merchantPath[1].trim() || null;
      }
    }
    if (u.hostname.toLowerCase() === "restaurant" && fromQuery) return fromQuery;
    return null;
  } catch {
    return null;
  }
}

export function isRestaurantSharePath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  return (
    /\/restaurant\//i.test(pathOrUrl) ||
    /gatimitra:\/\/restaurant/i.test(pathOrUrl) ||
    /\/home\/merchant\//i.test(pathOrUrl)
  );
}
