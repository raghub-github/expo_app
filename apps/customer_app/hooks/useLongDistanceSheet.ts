import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentSubscription, useCheckoutSubscriptionPlan } from "@/hooks/useCustomerSubscription";
import {
  isLongDistanceBeyondMembershipFreeDelivery,
  resolveMembershipFreeDeliveryRadiusKm,
} from "@/lib/longDistanceSheet";
import { useLongDistanceSheetSeenStore } from "@/store/longDistanceSheetSeenStore";

/**
 * Far-away store warning — once per storeId per app session.
 * Marks seen immediately when presenting (not only on dismiss) so remounts /
 * focus / checkout→back cannot re-open. Checkout never mounts this hook.
 */
export function useLongDistanceSheet(args: {
  merchantId: string;
  distanceKm: number | null | undefined;
  serviceable?: boolean | null;
}) {
  const { data: current } = useCurrentSubscription(true);
  const { checkoutPlan } = useCheckoutSubscriptionPlan();
  const [visible, setVisible] = useState(false);

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
    const seenStore = useLongDistanceSheetSeenStore.getState();
    if (seenStore.hasSeen(id)) {
      setVisible(false);
      return;
    }
    // Mark before open — prevents duplicate sheets from remount/focus races.
    seenStore.markSeen(id);
    setVisible(true);
  }, [args.merchantId, shouldShow]);

  const onClose = useCallback(() => {
    const id = args.merchantId.trim();
    if (id) useLongDistanceSheetSeenStore.getState().markSeen(id);
    setVisible(false);
  }, [args.merchantId]);

  return {
    visible,
    onClose,
  };
}
