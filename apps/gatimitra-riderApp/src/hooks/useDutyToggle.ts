import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDutyStore } from "@/src/stores/dutyStore";
import { riderApi } from "@/src/services/api/riderApi";
import {
  isVehicleDetailsRequiredError,
  isVehicleNotVerifiedError,
} from "@/src/services/http";
import { riderVehicleQueryKey, type RiderVehicleStatusResponse } from "@/src/hooks/useRiderVehicle";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { resolveDutyServiceTypesForToggle } from "@/src/hooks/useRiderDutyServiceFilter";

export function useDutyToggle() {
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const toggleDuty = useDutyStore((s) => s.toggleDuty);
  const queryClient = useQueryClient();
  const openVehicleSheet = useVehicleGateStore((s) => s.openSheet);
  const openVerificationModal = useVehicleGateStore((s) => s.openVerificationModal);

  const updateDutyMutation = useMutation({
    mutationFn: async ({
      status,
      serviceTypes,
    }: {
      status: boolean;
      serviceTypes?: string[];
    }) => {
      const deviceId = await getOrCreateDeviceId();
      return riderApi.updateDutyStatus(status, serviceTypes, { deviceId });
    },
    onSuccess: (data) => {
      void useDutyStore.getState().setDutyStatus(data.isOnDuty);
    },
    onError: (error) => {
      void toggleDuty();
      if (isVehicleDetailsRequiredError(error)) {
        openVehicleSheet();
      } else if (isVehicleNotVerifiedError(error)) {
        openVerificationModal();
      }
    },
  });

  const setDuty = async (next: boolean) => {
    if (next === isOnDuty) return;
    const cached = queryClient.getQueryData<RiderVehicleStatusResponse>(riderVehicleQueryKey);
    if (next) {
      if (cached && !cached.isComplete) {
        openVehicleSheet();
        return;
      }
      if (cached?.vehicle && !cached.vehicle.verified) {
        openVerificationModal();
        return;
      }
      const serviceTypes = resolveDutyServiceTypesForToggle(queryClient);
      if (!serviceTypes?.length) {
        return;
      }
      await toggleDuty();
      updateDutyMutation.mutate({
        status: next,
        serviceTypes,
      });
      return;
    }
    await toggleDuty();
    updateDutyMutation.mutate({
      status: next,
      serviceTypes: undefined,
    });
  };

  const toggle = async () => {
    await setDuty(!isOnDuty);
  };

  return {
    isOnDuty,
    toggle,
    setDuty,
    isPending: updateDutyMutation.isPending,
  };
}
