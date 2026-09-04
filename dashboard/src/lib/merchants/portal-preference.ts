export const MERCHANTS_PORTAL_STORAGE_KEY = "dashboard_merchants_portal_v1";

export type MerchantsPortal = "admin" | "merchant";

export function readStoredMerchantsPortal(): MerchantsPortal | null {
  if (typeof window === "undefined") return null;
  try {
    const s = sessionStorage.getItem(MERCHANTS_PORTAL_STORAGE_KEY);
    return s === "admin" || s === "merchant" ? s : null;
  } catch {
    return null;
  }
}

export function writeStoredMerchantsPortal(value: MerchantsPortal) {
  try {
    sessionStorage.setItem(MERCHANTS_PORTAL_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function parsePortalParam(raw: string | null): MerchantsPortal | null {
  return raw === "admin" || raw === "merchant" ? raw : null;
}

/** Users with portal toggle default to Admin when URL has no ?portal=; everyone else stays on Merchant. */
export function resolveMerchantsPortal(args: {
  portalFromUrl: MerchantsPortal | null;
  canTogglePortal: boolean;
  storedPortal?: MerchantsPortal | null;
}): MerchantsPortal {
  if (args.portalFromUrl) return args.portalFromUrl;
  if (args.canTogglePortal) return "admin";
  return "merchant";
}

/** Admin-rail tools — switching to Merchant portal must leave these pages. */
export function isAdminOnlyMerchantsPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? "";
  return (
    p.startsWith("/dashboard/merchants/menu-requests") ||
    p.startsWith("/dashboard/merchants/verifications") ||
    p.startsWith("/dashboard/merchants/assign-am") ||
    p.startsWith("/dashboard/merchants/wallet-requests") ||
    p.startsWith("/dashboard/merchants/subscription-refunds")
  );
}

export const MERCHANT_ADMIN_HOME_HREF = "/dashboard/merchants?portal=admin";

const ADMIN_HOME_LIST_CATEGORIES = new Set([
  "resubmitted",
  "verified",
  "pending",
  "rejected",
  "drafted",
  "new",
  "total",
]);

/** List / tool pages opened from All Merchants home (CTAs or KPI drill-down). */
export function isMerchantAdminInnerPage(
  pathname: string,
  searchParams?: { get: (key: string) => string | null } | null
): boolean {
  if (isAdminOnlyMerchantsPath(pathname)) return true;
  const p = (pathname.split("?")[0] ?? "").replace(/\/$/, "") || "/";
  if (p !== "/dashboard/merchants") return false;
  const category = searchParams?.get("category");
  if (category && ADMIN_HOME_LIST_CATEGORIES.has(category)) return true;
  return searchParams?.get("parent") === "true";
}

export function merchantAdminInnerPageTitle(
  pathname: string,
  searchParams?: { get: (key: string) => string | null } | null
): string | null {
  const p = (pathname.split("?")[0] ?? "").replace(/\/$/, "") || "/";
  if (p.startsWith("/dashboard/merchants/verifications")) return "Verifications";
  if (p.startsWith("/dashboard/merchants/assign-am")) return "Assign AM to Stores";
  if (p.startsWith("/dashboard/merchants/wallet-requests")) return "Wallet requests";
  if (p.startsWith("/dashboard/merchants/menu-requests")) return "Menu change requests";
  if (p.startsWith("/dashboard/merchants/subscription-refunds")) return "Subscription refunds";
  if (p !== "/dashboard/merchants") return null;
  if (searchParams?.get("parent") === "true") return "Partners";
  switch (searchParams?.get("category")) {
    case "resubmitted":
      return "Expired — re-submitted docs";
    case "verified":
      return "Verified stores";
    case "pending":
      return "Pending verification";
    case "rejected":
      return "Rejected stores";
    case "drafted":
      return "Drafted stores";
    case "new":
      return "New stores (30d)";
    case "total":
      return "All stores";
    default:
      return null;
  }
}
