/** Onboarding / store verification step titles (1–8). */
export const STORE_VERIFICATION_STEP_LABELS: Record<number, string> = {
  1: "Restaurant information",
  2: "Location details",
  3: "Menu setup",
  4: "Restaurant documents",
  5: "Operational details",
  6: "Bank account",
  7: "Commission plan",
  8: "Sign & submit",
};

export const STORE_VERIFICATIONS_PATH = "/dashboard/merchants/verifications";

export function storeVerificationStepLabel(step: number): string {
  return STORE_VERIFICATION_STEP_LABELS[step] ?? `Step ${step}`;
}

/** True when viewing a specific store inside Merchants → Verifications. */
export function isStoreVerificationDetailPath(
  pathname: string,
  searchParams?: { get: (key: string) => string | null } | null
): boolean {
  const clean = pathname.split("?")[0].split("#")[0];
  if (clean !== STORE_VERIFICATIONS_PATH) return false;
  return Boolean(searchParams?.get("storeId")?.trim());
}

export function parseStoreVerificationStepParam(
  raw: string | null | undefined
): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 8) return null;
  return n;
}

/**
 * Header back target while inside store verification:
 * - step open → same store overview (drop `step`)
 * - store overview → `returnTo` or verifications list (drop `storeId`)
 */
export function buildStoreVerificationHeaderBackHref(searchParams: {
  get: (key: string) => string | null;
}): string {
  const storeId = searchParams.get("storeId")?.trim() || "";
  const step = parseStoreVerificationStepParam(searchParams.get("step"));
  const returnTo = searchParams.get("returnTo")?.trim() || "";
  const portal = searchParams.get("portal");
  const reviewRejected = searchParams.get("reviewRejected");

  const withPortal = (href: string) => {
    if (portal !== "admin" && portal !== "merchant") return href;
    try {
      const u = new URL(href, "http://localhost");
      if (!u.searchParams.has("portal")) u.searchParams.set("portal", portal);
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return href;
    }
  };

  if (storeId && step != null) {
    const params = new URLSearchParams();
    params.set("storeId", storeId);
    if (returnTo) params.set("returnTo", returnTo);
    if (reviewRejected === "1") params.set("reviewRejected", "1");
    if (portal === "admin" || portal === "merchant") params.set("portal", portal);
    return `${STORE_VERIFICATIONS_PATH}?${params.toString()}`;
  }

  if (returnTo.startsWith("/")) return withPortal(returnTo);

  const params = new URLSearchParams();
  if (portal === "admin" || portal === "merchant") params.set("portal", portal);
  const qs = params.toString();
  return qs ? `${STORE_VERIFICATIONS_PATH}?${qs}` : STORE_VERIFICATIONS_PATH;
}

/** Build href for a verification step (or overview when step is null). */
export function buildStoreVerificationStepHref(
  searchParams: { get: (key: string) => string | null; toString?: () => string },
  step: number | null
): string {
  const params = new URLSearchParams(
    typeof searchParams.toString === "function" ? searchParams.toString() : ""
  );
  const storeId = searchParams.get("storeId")?.trim();
  if (!storeId) return STORE_VERIFICATIONS_PATH;
  params.set("storeId", storeId);
  if (step == null) params.delete("step");
  else params.set("step", String(step));
  const qs = params.toString();
  return `${STORE_VERIFICATIONS_PATH}${qs ? `?${qs}` : ""}`;
}
