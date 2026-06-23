/** Customer detail opened from order page Cx-Das — hide left nav for focused view. */
export const CUSTOMER_FROM_ORDER_PARAM = "fromOrder";

export function isCustomerFromOrderFlag(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
}

export function isCustomerDetailOpenedFromOrder(
  pathname: string,
  searchParams: URLSearchParams
): boolean {
  const clean = pathname.split("?")[0].split("#")[0];
  if (!isCustomerFromOrderFlag(searchParams.get(CUSTOMER_FROM_ORDER_PARAM))) return false;
  return (
    /^\/dashboard\/customers\/\d+$/.test(clean) || clean === "/dashboard/customers/all"
  );
}

/** Keep Cx-Das context when navigating between customers (search, table links, etc.). */
export function copyCustomerFromOrderParam(
  source: URLSearchParams,
  target: URLSearchParams
): void {
  if (isCustomerFromOrderFlag(source.get(CUSTOMER_FROM_ORDER_PARAM))) {
    target.set(CUSTOMER_FROM_ORDER_PARAM, "1");
  }
}

export function buildCustomerDetailQueryString(options: {
  search?: string | null;
  fromOrderSource?: URLSearchParams | null;
}): string {
  const params = new URLSearchParams();
  const search = options.search?.trim();
  if (search) params.set("search", search);
  if (options.fromOrderSource) {
    copyCustomerFromOrderParam(options.fromOrderSource, params);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function buildCustomerDetailHref(
  customerDbId: number | string,
  options: { search?: string | null; fromOrderSource?: URLSearchParams | null }
): string {
  return `/dashboard/customers/${customerDbId}${buildCustomerDetailQueryString(options)}`;
}
