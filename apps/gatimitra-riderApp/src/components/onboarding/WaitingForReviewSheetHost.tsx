import React, { useEffect } from "react";
import { WaitingForReviewSheet } from "@/src/components/onboarding/WaitingForReviewSheet";
import { useWaitingForReviewSheetStore } from "@/src/stores/waitingForReviewSheetStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { isRiderWaitingForOnboardingReview } from "@/src/lib/onboarding-routes";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";
import { useSubscriptionDutyBlockedSheetStore } from "@/src/stores/subscriptionDutyBlockedSheetStore";

/** Root host: auto-opens Waiting for Review sheet once when rider lands on home. */
export function WaitingForReviewSheetHost() {
  const visible = useWaitingForReviewSheetStore((s) => s.visible);
  const close = useWaitingForReviewSheetStore((s) => s.close);
  const open = useWaitingForReviewSheetStore((s) => s.open);
  const autoShownForRiderId = useWaitingForReviewSheetStore((s) => s.autoShownForRiderId);
  const markAutoShown = useWaitingForReviewSheetStore((s) => s.markAutoShown);
  const resetAutoShown = useWaitingForReviewSheetStore((s) => s.resetAutoShown);

  const riderId = useOnboardingStore((s) => s.data.riderId);
  const { data: riderStatus, isFetched } = useRiderStatus(riderId);

  const waiting = isRiderWaitingForOnboardingReview(riderStatus);

  useEffect(() => {
    if (!isFetched) return;
    if (!waiting) {
      close();
      if (autoShownForRiderId) resetAutoShown();
      return;
    }
    if (!riderId) return;
    // Suppress overlapping vehicle / subscription duty sheets while waiting.
    useVehicleGateStore.getState().closeSheet();
    useVehicleGateStore.getState().closeVerificationModal();
    useSubscriptionDutyBlockedSheetStore.getState().close();
    if (autoShownForRiderId === String(riderId)) return;
    open();
    markAutoShown(String(riderId));
  }, [
    isFetched,
    waiting,
    riderId,
    autoShownForRiderId,
    open,
    close,
    markAutoShown,
    resetAutoShown,
  ]);

  return <WaitingForReviewSheet visible={visible} onClose={close} />;
}
