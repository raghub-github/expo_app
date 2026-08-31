import React from "react";
import { StyleSheet, View } from "react-native";
import { useRiderVehicle } from "@/src/hooks/useRiderVehicle";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";
import { VehicleDetailsBottomSheet } from "@/src/components/vehicle/VehicleDetailsBottomSheet";

/**
 * Vehicle-details gate on home/tabs when the profile has no complete active vehicle.
 * Can be skipped for the session; going ON duty re-opens the sheet.
 */
export function RiderVehiclePrompt() {
  const { data, isFetched, refetch } = useRiderVehicle();
  const sheetForced = useVehicleGateStore((s) => s.sheetOpen);
  const skippedThisSession = useVehicleGateStore((s) => s.skippedThisSession);
  const closeSheet = useVehicleGateStore((s) => s.closeSheet);
  const skipSheet = useVehicleGateStore((s) => s.skipSheet);
  const clearSkip = useVehicleGateStore((s) => s.clearSkip);
  const needsVehicle = isFetched && !data?.isComplete;
  const shouldShow = sheetForced || (needsVehicle && !skippedThisSession);

  if (!shouldShow) return null;

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
