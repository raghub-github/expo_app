/**
 * Long-distance store sheet — membership free-delivery km vs canonical store km.
 * Dashboard: Customer plan → "Free delivery up to X KM" (`maxFreeDeliveryRadiusKm`).
 */

export function coercePositiveKm(value: unknown): number | null {
  const km = Number(value);
  if (!Number.isFinite(km) || km <= 0) return null;
  return km;
}

/** Parse "Free delivery up to 5 KM" style benefit copy. */
export function radiusKmFromPlanBenefits(benefits: string[] | null | undefined): number | null {
  if (!benefits?.length) return null;
  for (const raw of benefits) {
    const m = String(raw).match(/(\d+(?:\.\d+)?)\s*k\.?m\.?/i);
    if (m) return coercePositiveKm(m[1]);
  }
  return null;
}

export function resolveMembershipFreeDeliveryRadiusKm(args: {
  active?: boolean | null;
  planRadiusKm?: unknown;
  planBenefits?: string[] | null;
  advertisedRadiusKm?: unknown;
  advertisedBenefits?: string[] | null;
}): number | null {
  if (args.active) {
    const fromPlan =
      coercePositiveKm(args.planRadiusKm) ?? radiusKmFromPlanBenefits(args.planBenefits);
    if (fromPlan != null) return fromPlan;
  }
  return (
    coercePositiveKm(args.advertisedRadiusKm) ??
    radiusKmFromPlanBenefits(args.advertisedBenefits)
  );
}

export function isLongDistanceBeyondMembershipFreeDelivery(args: {
  distanceKm: number | null | undefined;
  freeDeliveryRadiusKm: number | null | undefined;
  serviceable?: boolean | null;
}): boolean {
  if (args.serviceable === false) return false;
  const distanceKm = coercePositiveKm(args.distanceKm);
  const radiusKm = coercePositiveKm(args.freeDeliveryRadiusKm);
  if (distanceKm == null || radiusKm == null) return false;
  return distanceKm > radiusKm;
}
