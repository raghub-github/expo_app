/** Normalize merchant route / cart ids for reliable equality checks. */
export function normalizeMerchantRouteId(id: string | null | undefined): string {
  return String(id ?? "").trim();
}

export function merchantCartMatchesRoute(
  cartMerchantId: string | null | undefined,
  routeMerchantId: string | null | undefined
): boolean {
  const cartId = normalizeMerchantRouteId(cartMerchantId);
  const routeId = normalizeMerchantRouteId(routeMerchantId);
  return cartId.length > 0 && cartId === routeId;
}
