/** Payments + payout history paths for `/partners/*` vs legacy `/mx/*`. */
export function partnerPaymentsBase(pathname: string | null): string {
  if (!pathname || pathname.startsWith('/mx')) return '/mx/payments';
  return '/partners/payments';
}

export function partnerPayoutHistoryHref(pathname: string | null): string {
  return `${partnerPaymentsBase(pathname)}/payout-history`;
}

export function partnerPayoutHistoryDetailHref(
  pathname: string | null,
  cardId: string,
  query: URLSearchParams,
): string {
  const q = new URLSearchParams(query);
  q.delete('id');
  const qs = q.toString();
  return `${partnerPaymentsBase(pathname)}/payout-history/${encodeURIComponent(cardId)}${qs ? `?${qs}` : ''}`;
}
