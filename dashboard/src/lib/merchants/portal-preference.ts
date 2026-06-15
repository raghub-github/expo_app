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
