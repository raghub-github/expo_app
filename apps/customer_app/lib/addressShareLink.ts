/**
 * Parse GatiMitra saved-address share URLs.
 * Canonical: https://gatimitra.com/address/share/<token>
 * Legacy:    https://gatimitra.com/addr/<shortCode>?id=<token>
 */

export function extractAddressShareToken(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl?.trim()) return null;
  const raw = pathOrUrl.trim();

  try {
    const normalized = raw.includes("://")
      ? raw.replace(/^gatimitra:\/\//i, "https://gatimitra.local/")
      : `https://gatimitra.local${raw.startsWith("/") ? raw : `/${raw}`}`;
    const u = new URL(normalized);
    const fromQuery = (u.searchParams.get("id") || u.searchParams.get("token") || "").trim();
    const sharePath = u.pathname.match(/\/address\/share\/([A-Za-z0-9_-]+)/i);
    if (sharePath?.[1]?.trim()) return sharePath[1].trim();
    const saveHost = u.hostname.toLowerCase() === "address" && /^\/save\/?/i.test(u.pathname);
    if (saveHost && fromQuery) return fromQuery;
    if (/\/address\/save/i.test(u.pathname) && fromQuery) return fromQuery;
    if (/(^|\/)addr(\/|$)/i.test(u.pathname) && fromQuery) return fromQuery;
    if (u.hostname.toLowerCase() === "addr" && fromQuery) return fromQuery;
    if (fromQuery && /address/i.test(`${u.hostname}${u.pathname}`)) return fromQuery;
    return fromQuery || null;
  } catch {
    return null;
  }
}

export function isAddressSharePath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  return (
    /\/address\/share\//i.test(pathOrUrl) ||
    /\/address\/save/i.test(pathOrUrl) ||
    /(^|\/\/|\/)addr(\/|\?|$)/i.test(pathOrUrl) ||
    /gatimitra:\/\/address/i.test(pathOrUrl)
  );
}
