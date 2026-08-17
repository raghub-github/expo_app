import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentSubscription, useCheckoutSubscriptionPlan } from "@/hooks/useCustomerSubscription";
import {
  isLongDistanceBeyondMembershipFreeDelivery,
  resolveMembershipFreeDeliveryRadiusKm,
} from "@/lib/longDistanceSheet";

export function useLongDistanceSheet(args: {
  merchantId: string;
  distanceKm: number | null | undefined;
  serviceable?: boolean | null;
}) {
  const { data: current } = useCurrentSubscription(true);
  const { checkoutPlan } = useCheckoutSubscriptionPlan();
  const [visible, setVisible] = useState(false);
  const dismissedForMerchantRef = useRef<string | null>(null);

  const freeDeliveryRadiusKm = useMemo(
    () =>
      resolveMembershipFreeDeliveryRadiusKm({
        active: current?.active === true,
        planRadiusKm: current?.plan?.maxFreeDeliveryRadiusKm,
        planBenefits: current?.plan?.benefits,
        advertisedRadiusKm: checkoutPlan?.maxFreeDeliveryRadiusKm,
        advertisedBenefits: checkoutPlan?.benefits,
      }),
    [
      current?.active,
      current?.plan?.maxFreeDeliveryRadiusKm,
      current?.plan?.benefits,
      checkoutPlan?.maxFreeDeliveryRadiusKm,
      checkoutPlan?.benefits,
    ]
  );

  const shouldShow = isLongDistanceBeyondMembershipFreeDelivery({
    distanceKm: args.distanceKm,
    freeDeliveryRadiusKm,
    serviceable: args.serviceable,
  });

  useEffect(() => {
    const id = args.merchantId.trim();
    if (!id || !shouldShow) {
      setVisible(false);
      return;
    }
    if (dismissedForMerchantRef.current === id) return;
    setVisible(true);
  }, [args.merchantId, shouldShow]);

  const onClose = useCallback(() => {
    dismissedForMerchantRef.current = args.merchantId.trim() || null;
    setVisible(false);
  }, [args.merchantId]);

  return {
    visible,
    onClose,
  };
}
