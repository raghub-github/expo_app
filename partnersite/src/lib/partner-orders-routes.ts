/** Food orders list filtered to pending new orders for the selected store. */
export function partnerNewOrdersHref(pathname: string, storeId: string): string {
  const q = `filter=NEW_ORDERS&store_id=${encodeURIComponent(storeId)}`;
  if (pathname.startsWith('/mx')) return `/mx/food-orders?${q}`;
  return `/partners/orders?${q}`;
}

/** Skip name-based store lookup when the id already looks like a public store_id. */
export function looksLikePartnerPublicStoreId(storeId: string): boolean {
  return /^GMM/i.test(String(storeId ?? '').trim());
}
