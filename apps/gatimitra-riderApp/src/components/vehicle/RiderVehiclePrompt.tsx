import React from "react";
import { StyleSheet, View } from "react-native";
import { useRiderVehicle } from "@/src/hooks/useRiderVehicle";
import { useRiderHomeLocation } from "@/src/hooks/useRiderHomeLocation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";
import { useDocumentUpdateSheetStore } from "@/src/stores/documentUpdateSheetStore";
import { VehicleDetailsBottomSheet } from "@/src/components/vehicle/VehicleDetailsBottomSheet";
import { RcVerificationPendingBottomSheet } from "@/src/components/vehicle/RcVerificationPendingBottomSheet";
import { RcVerificationRejectedBottomSheet } from "@/src/components/vehicle/RcVerificationRejectedBottomSheet";
import {
  isRcApprovedForVehicleSheet,
  isRcManualReviewPending,
  isRcRejectedOrNeedsReupload,
} from "@/src/lib/rc-verification-state";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { isRiderWaitingForOnboardingReview } from "@/src/lib/onboarding-routes";

/**
 * Vehicle-details gate on home/tabs when the profile has no complete active vehicle.
 * Can be skipped for the session; going ON duty re-opens the sheet.
 *
 * Waits until the home-location sheet is done so the two Modals never overlap.
 *
 * RC gating: pending → pending sheet; rejected → reupload sheet; approved → vehicle complete.
 * While onboarding Waiting-for-Review is active, skip these sheets (one sheet only).
 */
export function RiderVehiclePrompt() {
  const riderId = useOnboardingStore((s) => s.data.riderId);
  const {
    needsHomeLocation,
    statusLoading: homeLocLoading,
    locationStatusReady,
  } = useRiderHomeLocation(riderId);
  const { data: riderStatus } = useRiderStatus(riderId);
  const { data, isFetched, refetch } = useRiderVehicle();
  const sheetForced = useVehicleGateStore((s) => s.sheetOpen);
  const skippedThisSession = useVehicleGateStore((s) => s.skippedThisSession);
  const closeSheet = useVehicleGateStore((s) => s.closeSheet);
  const skipSheet = useVehicleGateStore((s) => s.skipSheet);
  const clearSkip = useVehicleGateStore((s) => s.clearSkip);
  const openDocUpdate = useDocumentUpdateSheetStore((s) => s.open);

  // Paid riders waiting for admin review only see WaitingForReviewSheet — not RC pending too.
  if (isRiderWaitingForOnboardingReview(riderStatus)) {
    return null;
  }

  const rcState = data?.rcVerificationState ?? null;
  const rcPending = isRcManualReviewPending(rcState);
  const rcRejected = isRcRejectedOrNeedsReupload(rcState);
  const rcApproved = isRcApprovedForVehicleSheet(rcState);

  const needsVehicle = isFetched && !data?.isComplete;
  // Location first, then vehicle — never mount both Modals at once (incl. while status loads).
  const locationBlocking =
    !riderId || homeLocLoading || !locationStatusReady || needsHomeLocation;

  const needsRcGate = isFetched && (rcPending || rcRejected);
  const needsVehicleComplete = needsVehicle && (rcApproved || (!rcState && !rcPending && !rcRejected));
  const shouldShow =
    !locationBlocking && (sheetForced || ((needsRcGate || needsVehicleComplete) && !skippedThisSession));

  if (!shouldShow) return null;

  const dismiss = () => {
    closeSheet();
    skipSheet();
  };

  if (rcPending) {
    return (
      <View style={styles.host} pointerEvents="box-none">
        <RcVerificationPendingBottomSheet
          visible
          onAcknowledge={dismiss}
          onSkip={dismiss}
        />
      </View>
    );
  }

  if (rcRejected) {
    return (
      <View style={styles.host} pointerEvents="box-none">
        <RcVerificationRejectedBottomSheet
          visible
          onSkip={dismiss}
          onReupload={() => {
            dismiss();
            openDocUpdate("rc");
          }}
        />
      </View>
    );
  }

  if (!needsVehicleComplete && !sheetForced) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <VehicleDetailsBottomSheet
        visible
        initial={data?.vehicle ?? null}
        formMeta={data?.formMeta ?? null}
        onboardingVehicleChoice={data?.onboardingVehicleChoice ?? null}
        onboardingVehicleCategoryCode={data?.onboardingVehicleCategoryCode ?? null}
        onboardingPrefill={data?.onboardingPrefill ?? null}
        onSkip={skipSheet}
        onCompleted={() => {
          closeSheet();
          clearSkip();
          void refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 11000,
    elevation: 11000,
  },
});
