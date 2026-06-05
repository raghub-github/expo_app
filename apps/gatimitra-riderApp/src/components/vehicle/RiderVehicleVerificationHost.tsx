import React from "react";
import { VehicleVerificationPendingModal } from "@/src/components/vehicle/VehicleVerificationPendingModal";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";

export function RiderVehicleVerificationHost() {
  const open = useVehicleGateStore((s) => s.verificationModalOpen);
  const close = useVehicleGateStore((s) => s.closeVerificationModal);

  return <VehicleVerificationPendingModal visible={open} onDismiss={close} />;
}
