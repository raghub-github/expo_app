const STORE_RETURN_TO_KEY_PREFIX = "gm:merchant-store:return-to:";

function isSafeInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export function readStoredMerchantStoreReturnTo(storeId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${STORE_RETURN_TO_KEY_PREFIX}${storeId}`)?.trim() ?? "";
    return raw && isSafeInternalPath(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredMerchantStoreReturnTo(storeId: string, returnTo: string): void {
  if (typeof window === "undefined") return;
  const href = returnTo.trim();
  if (!isSafeInternalPath(href)) return;
  try {
    sessionStorage.setItem(`${STORE_RETURN_TO_KEY_PREFIX}${storeId}`, href);
  } catch {
    // ignore private mode / quota
  }
}

export function resolveMerchantStoreBackHref(args: {
  storeId: string | null;
  returnToParam?: string | null;
}): string {
  const fromQuery = (args.returnToParam || "").trim();
  if (fromQuery && isSafeInternalPath(fromQuery)) return fromQuery;
  if (args.storeId) {
    const stored = readStoredMerchantStoreReturnTo(args.storeId);
    if (stored) return stored;
  }
  return "/dashboard/merchants";
}
