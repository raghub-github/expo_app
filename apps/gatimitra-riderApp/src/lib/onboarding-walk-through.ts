import { nextOnboardingRoute } from "@/src/lib/onboarding-routes";

export function parseOnboardingWalkParam(
  raw: string | string[] | null | undefined
): boolean {
  const w = Array.isArray(raw) ? raw[0] : raw;
  return w === "1" || w === "true" || w === "yes";
}

/** Append walk=1 so completed-step auto-redirects do not skip screens. */
export function withOnboardingWalkParam(href: string): string {
  if (!href) return href;
  if (/[?&]walk=(?:1|true|yes)(?:&|$)/i.test(href)) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}walk=1`;
}

/** Open rental/EV wizard at a specific doc (sequential — never auto-jump to last incomplete). */
export function rentalEvOnboardingHref(options?: {
  docCode?: string;
  walk?: boolean;
}): `/(onboarding)/rental-ev?${string}` {
  const doc = String(options?.docCode || "rental_proof").trim() || "rental_proof";
  let href = `/(onboarding)/rental-ev?doc=${encodeURIComponent(doc)}`;
  if (options?.walk) {
    href = withOnboardingWalkParam(href);
  }
  return href as `/(onboarding)/rental-ev?${string}`;
}

/** Macro Continue: always the next route in the funnel (never furthest pending). */
export function onboardingContinueHref(
  currentRouteName: string,
  options?: {
    vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment" | null;
    /** When true, append walk=1 to the destination. */
    walk?: boolean;
  }
): `/(onboarding)/${string}` | null {
  const next = nextOnboardingRoute(currentRouteName, {
    vehicleOnboardingFlow: options?.vehicleOnboardingFlow,
  });
  if (!next) return null;
  return (options?.walk ? withOnboardingWalkParam(next) : next) as `/(onboarding)/${string}`;
}
