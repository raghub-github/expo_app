/** Client-side default orders list route (matches server getDefaultOrdersDashboardHref priority). */

export function getOrdersNavHref(
  accessibleDashboards: Set<string> | null,
  isSuperAdmin: boolean
): string {
  if (isSuperAdmin) return "/dashboard/orders/food";
  if (!accessibleDashboards) return "/dashboard/orders/food";
  if (accessibleDashboards.has("ORDER_FOOD")) return "/dashboard/orders/food";
  if (accessibleDashboards.has("ORDER_PARCEL")) return "/dashboard/orders/parcel";
  if (accessibleDashboards.has("ORDER_PERSON_RIDE")) return "/dashboard/orders/person-ride";
  return "/dashboard/orders";
}

export function isOrdersSectionPath(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0];
  return clean === "/dashboard/orders" || clean.startsWith("/dashboard/orders/");
}
