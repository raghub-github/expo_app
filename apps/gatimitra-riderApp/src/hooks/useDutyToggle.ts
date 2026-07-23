import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDutyStore } from "@/src/stores/dutyStore";
import { riderApi } from "@/src/services/api/riderApi";
import {
  getJson,
  HttpError,
  isVehicleDetailsRequiredError,
  isVehicleNotVerifiedError,
} from "@/src/services/http";
import { getRiderAppConfig } from "@/src/config/env";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  riderVehicleQueryKey,
  type RiderVehicleStatusResponse,
} from "@/src/hooks/useRiderVehicle";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { resolveDutyServiceTypesForToggle } from "@/src/hooks/useRiderDutyServiceFilter";
import { useRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";
import { useDutyStatus } from "@/src/hooks/useDutyStatus";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import {
  isRiderFullyDispatchBlocked,
  mergeRiderBlockedServices,
} from "@/src/lib/rider-blocked-services";

async function loadRiderVehicleStatusForDutyGate(): Promise<RiderVehicleStatusResponse | null> {
  const token = useSessionStore.getState().session?.accessToken;
  if (!token) return null;
  try {
    return await getJson<RiderVehicleStatusResponse>(
      `${getRiderAppConfig().apiBaseUrl}/v1/rider/me/vehicle`,
      { headers: { authorization: `Bearer ${token}` } },
    );
  } catch {
    return null;
  }
}

function isDutyBlockedByServerError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false;
  if (error.status !== 403) return false;
  const haystack = `${error.message}\n${error.body ?? ""}`;
  return /SUBSCRIPTION_DUTY_STOPPED|ALL_SERVICES_BLOCKED|subscription penalty|Clear dues|all requested services are restricted/i.test(
    haystack
  );
}

export type SetDutyResult = {
  ok: boolean;
  blockedFromGoingOn?: boolean;
};

export function useDutyToggle() {
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const toggleDuty = useDutyStore((s) => s.toggleDuty);
  const queryClient = useQueryClient();
  const openVehicleSheet = useVehicleGateStore((s) => s.openSheet);
  const openVerificationModal = useVehicleGateStore((s) => s.openVerificationModal);
  const { data: subscriptionStatus } = useRiderSubscriptionStatus();
  const { data: dutyStatus } = useDutyStatus();
  const { data: earnings } = useEarningsSummary();

  const restrictions = earnings?.accountRestrictions;
  const blockedServices = mergeRiderBlockedServices(
    restrictions?.blacklistBlockedServices,
    dutyStatus?.blockedServiceTypes,
    restrictions?.globalWalletBlock ? ["food", "parcel", "person_ride"] : []
  );
  const accountFullyBlocked = isRiderFullyDispatchBlocked({
    accountRestricted: restrictions?.accountRestricted ?? dutyStatus?.accountRestricted,
    allServicesBlacklisted:
      restrictions?.allServicesBlacklisted ??
      dutyStatus?.allServicesBlacklisted ??
      restrictions?.globalWalletBlock === true,
    blockedServices,
  });
  const subscriptionDutyBlocked =
    subscriptionStatus?.dues?.dispatchBlocked === true ||
    subscriptionStatus?.dues?.alertBanner?.variant === "restricted";

  /** Client-side hard lock — never call PUT /duty ON while true. */
  const dutyGoOnBlocked = accountFullyBlocked || subscriptionDutyBlocked;

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
      void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["rider", "duty"] });
      void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
    },
  });

  const setDuty = async (next: boolean): Promise<SetDutyResult> => {
    if (next === isOnDuty) return { ok: true };

    if (next) {
      if (dutyGoOnBlocked) {
        void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
        void queryClient.invalidateQueries({ queryKey: ["rider", "duty"] });
        void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
        return { ok: false, blockedFromGoingOn: true };
      }

      const vehicleStatus =
        (await loadRiderVehicleStatusForDutyGate()) ??
        queryClient.getQueryData<RiderVehicleStatusResponse>(riderVehicleQueryKey) ??
        null;

      if (vehicleStatus) {
        queryClient.setQueryData(riderVehicleQueryKey, vehicleStatus);
      }

      if (!vehicleStatus?.isComplete) {
        openVehicleSheet();
        return { ok: false };
      }

      if (!vehicleStatus.vehicle?.verified) {
        openVerificationModal();
        return { ok: false };
      }

      const serviceTypes = resolveDutyServiceTypesForToggle(queryClient);
      if (!serviceTypes?.length) {
        return { ok: false };
      }

      // Do NOT optimistic-flip until server accepts — prevents fake ON-DUTY.
      try {
        const data = await updateDutyMutation.mutateAsync({
          status: next,
          serviceTypes,
        });
        await useDutyStore.getState().setDutyStatus(data.isOnDuty);
        if (!data.isOnDuty) {
          return { ok: false, blockedFromGoingOn: true };
        }
        return { ok: true };
      } catch (error) {
        if (isVehicleDetailsRequiredError(error)) {
          openVehicleSheet();
          return { ok: false };
        }
        if (isVehicleNotVerifiedError(error)) {
          openVerificationModal();
          return { ok: false };
        }
        if (isDutyBlockedByServerError(error)) {
          void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
          void queryClient.invalidateQueries({ queryKey: ["rider", "duty"] });
          void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
          return { ok: false, blockedFromGoingOn: true };
        }
        return { ok: false };
      }
    }

    try {
      const data = await updateDutyMutation.mutateAsync({
        status: next,
        serviceTypes: undefined,
      });
      await useDutyStore.getState().setDutyStatus(data.isOnDuty);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  };

  const toggle = async () => {
    await setDuty(!isOnDuty);
  };

  return {
    isOnDuty,
    toggle,
    setDuty,
    isPending: updateDutyMutation.isPending,
    dutyGoOnBlocked,
  };
}
