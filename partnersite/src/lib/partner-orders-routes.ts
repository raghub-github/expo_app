/** Food orders list filtered to pending new orders for the selected store. */
export function partnerNewOrdersHref(pathname: string, storeId: string): string {
  return partnerOrdersFilterHref(pathname, storeId, 'NEW_ORDERS');
}

/** Food orders list on Preparing tab after accept from incoming modal. */
export function partnerPreparingOrdersHref(pathname: string, storeId: string): string {
  return partnerOrdersFilterHref(pathname, storeId, 'PREPARING');
}

function partnerOrdersFilterHref(pathname: string, storeId: string, filter: string): string {
  const q = `filter=${encodeURIComponent(filter)}&store_id=${encodeURIComponent(storeId)}`;
  if (pathname.startsWith('/mx')) return `/mx/food-orders?${q}`;
  return `/partners/orders?${q}`;
}

/** Skip name-based store lookup when the id already looks like a public store_id. */
export function looksLikePartnerPublicStoreId(storeId: string): boolean {
  return /^GMM/i.test(String(storeId ?? '').trim());
}
