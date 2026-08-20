/** Last opened merchant store PK — used when the URL drops `/stores/[id]`. */
const LAST_MERCHANT_STORE_ID_KEY = "gm:last-merchant-store-id";

export function parseNumericStoreId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return /^\d+$/.test(s) ? s : null;
}

export function storeIdFromPathname(pathname: string | null | undefined): string | null {
  const clean = (pathname ?? "").split("?")[0].split("#")[0];
  const match = clean.match(/\/dashboard\/merchants\/stores\/(\d+)(?=\/|$)/);
  return match ? match[1] : null;
}

export function readLastMerchantStoreId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return parseNumericStoreId(sessionStorage.getItem(LAST_MERCHANT_STORE_ID_KEY));
  } catch {
    return null;
  }
}

export function writeLastMerchantStoreId(storeId: string | null | undefined): void {
  const id = parseNumericStoreId(storeId);
  if (!id || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LAST_MERCHANT_STORE_ID_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * First numeric id wins. Always also consult the live URL and session last-store
 * so a reused layout / empty RSC param cannot leave Menu fetching as "".
 */
export function resolveEffectiveStoreId(candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const id = parseNumericStoreId(candidate);
    if (id) return id;
  }
  if (typeof window !== "undefined") {
    const fromPath = storeIdFromPathname(window.location.pathname);
    if (fromPath) return fromPath;
    return readLastMerchantStoreId();
  }
  return null;
}

/** Path after `/stores/{id}` — e.g. `menu`, `orders`, ``. */
export function storePageSuffix(pathname: string): string {
  const clean = pathname.split("?")[0].split("#")[0];
  const stripped = clean.replace(/^\/dashboard\/merchants\/stores(?:\/\d+)?\/?/, "");
  return stripped.replace(/^\/+/, "");
}

export function merchantStoreHref(
  storeId: string,
  suffix = "",
  search = ""
): string {
  const id = parseNumericStoreId(storeId);
  if (!id) return "/dashboard/merchants";
  const rest = suffix.replace(/^\/+/, "");
  const path = rest
    ? `/dashboard/merchants/stores/${id}/${rest}`
    : `/dashboard/merchants/stores/${id}`;
  const qs = search.replace(/^\?/, "");
  return qs ? `${path}?${qs}` : path;
}
