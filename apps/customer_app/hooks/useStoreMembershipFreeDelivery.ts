import { useMemo } from "react";
import { useCurrentSubscription } from "@/hooks/useCustomerSubscription";
import { isStoreEligibleForMembershipFreeDelivery } from "@/lib/membershipFreeDelivery";

/** Whether the signed-in member gets free delivery at `storeDistanceKm`. */
export function useStoreMembershipFreeDelivery(
  storeDistanceKm: number | null | undefined
): boolean {
  const { data } = useCurrentSubscription();

  return useMemo(
    () =>
      isStoreEligibleForMembershipFreeDelivery({
        subscriptionActive: data?.active === true,
        freeDeliveryEnabled: data?.plan?.freeDeliveryEnabled === true,
        maxFreeDeliveryRadiusKm: data?.plan?.maxFreeDeliveryRadiusKm,
        storeDistanceKm,
      }),
    [
      data?.active,
      data?.plan?.freeDeliveryEnabled,
      data?.plan?.maxFreeDeliveryRadiusKm,
      storeDistanceKm,
    ]
  );
}
