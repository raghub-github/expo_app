/** Default membership free-delivery radius when plan omits a value. */
export const DEFAULT_MEMBERSHIP_FREE_DELIVERY_RADIUS_KM = 7;

export function resolveMembershipFreeDeliveryRadiusKm(
  maxFreeDeliveryRadiusKm: number | null | undefined
): number {
  const n = Number(maxFreeDeliveryRadiusKm);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MEMBERSHIP_FREE_DELIVERY_RADIUS_KM;
}

export function isStoreWithinMembershipFreeDeliveryRadius(args: {
  storeDistanceKm: number | null | undefined;
  maxFreeDeliveryRadiusKm: number | null | undefined;
}): boolean {
  const dist = args.storeDistanceKm;
  if (dist == null || !Number.isFinite(dist) || dist < 0) return false;
  const radius = resolveMembershipFreeDeliveryRadiusKm(args.maxFreeDeliveryRadiusKm);
  return dist <= radius;
}

/** True when an active member's plan covers free delivery for this store distance. */
export function isStoreEligibleForMembershipFreeDelivery(args: {
  subscriptionActive: boolean;
  freeDeliveryEnabled: boolean;
  storeDistanceKm: number | null | undefined;
  maxFreeDeliveryRadiusKm: number | null | undefined;
}): boolean {
  if (!args.subscriptionActive || !args.freeDeliveryEnabled) return false;
  return isStoreWithinMembershipFreeDeliveryRadius({
    storeDistanceKm: args.storeDistanceKm,
    maxFreeDeliveryRadiusKm: args.maxFreeDeliveryRadiusKm,
  });
}
