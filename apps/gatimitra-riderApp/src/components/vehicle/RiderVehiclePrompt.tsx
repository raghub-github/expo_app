import React from "react";
import { StyleSheet, View } from "react-native";
import { useRiderVehicle } from "@/src/hooks/useRiderVehicle";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";
import { VehicleDetailsBottomSheet } from "@/src/components/vehicle/VehicleDetailsBottomSheet";

/**
 * Mandatory vehicle-details gate on home/tabs when profile has no complete active vehicle.
 */
export function RiderVehiclePrompt() {
  const { data, isFetched, refetch } = useRiderVehicle();
  const sheetForced = useVehicleGateStore((s) => s.sheetOpen);
  const closeSheet = useVehicleGateStore((s) => s.closeSheet);
  const needsVehicle = isFetched && !data?.isComplete;
  const shouldShow = needsVehicle || sheetForced;

  if (!shouldShow) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <VehicleDetailsBottomSheet
        visible
        initial={data?.vehicle ?? null}
        onboardingVehicleChoice={data?.onboardingVehicleChoice ?? null}
        onboardingVehicleCategoryCode={data?.onboardingVehicleCategoryCode ?? null}
        onboardingPrefill={data?.onboardingPrefill ?? null}
        onCompleted={() => {
          closeSheet();
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
