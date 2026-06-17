import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useRiderServiceFilterStore } from "@/src/stores/riderServiceFilterStore";
import { useRiderGeoServiceAvailability } from "@/src/hooks/useRiderGeoServiceAvailability";
import { useDutyStatus, RIDER_DUTY_STATUS_QUERY_KEY } from "@/src/hooks/useDutyStatus";
import {
  useRiderVehicle,
  riderVehicleQueryKey,
  type RiderVehicleStatusResponse,
} from "@/src/hooks/useRiderVehicle";
import { riderApi } from "@/src/services/api/riderApi";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import {
  buildEligibleServicePool,
  computeEligibleDutyServices,
  geoAvailabilityToRiderServices,
  inferSelectedFromAllowedServices,
  migrateLegacyServiceFilter,
  normalizeSelectedServices,
  normalizeVehicleServiceTypes,
  toggleSelectedService,
} from "@/src/lib/rider-duty-service-types";
import { mergeRiderBlockedServices } from "@/src/lib/rider-blocked-services";
import type { RiderServiceTypeValue } from "@/src/lib/rider-vehicle-form";

export function useRiderDutyServiceFilter() {
  const queryClient = useQueryClient();
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const selectedServices = useRiderServiceFilterStore((s) => s.selectedServices);
  const setSelectedServicesStore = useRiderServiceFilterStore((s) => s.setSelectedServices);
  const hydrated = useRiderServiceFilterStore((s) => s.hydrated);

  const geoQuery = useRiderGeoServiceAvailability();
  const dutyQuery = useDutyStatus();
  const vehicleQuery = useRiderVehicle();

  const vehicleServices = useMemo(
    () => normalizeVehicleServiceTypes(vehicleQuery.data?.vehicle?.serviceTypes),
    [vehicleQuery.data],
  );

  const blockedServices = useMemo(
    () =>
      mergeRiderBlockedServices(
        dutyQuery.data?.blockedServiceTypes,
        dutyQuery.data?.allServicesBlacklisted ? ["food", "parcel", "person_ride"] : [],
      ),
    [dutyQuery.data],
  );

  const geoEnabled = useMemo(
    () => geoAvailabilityToRiderServices(geoQuery.data),
    [geoQuery.data],
  );

  const vehicleType = vehicleQuery.data?.vehicle?.vehicleType ?? null;

  const eligibleServices = useMemo(
    () =>
      buildEligibleServicePool({
        geoEnabled,
        vehicleServices,
        blockedServices,
        vehicleType,
      }),
    [geoEnabled, vehicleServices, blockedServices, vehicleType],
  );

  const activeSelection = useMemo(
    () => normalizeSelectedServices(selectedServices, eligibleServices),
    [selectedServices, eligibleServices],
  );

  const syncedDutyRef = useRef(false);

  useEffect(() => {
    if (!hydrated || eligibleServices.length === 0) return;
    const normalized = normalizeSelectedServices(selectedServices, eligibleServices);
    if (selectedServices.length === 0) {
      void setSelectedServicesStore(eligibleServices);
      return;
    }
    if (normalized.join(",") !== selectedServices.join(",")) {
      void setSelectedServicesStore(normalized);
    }
  }, [hydrated, selectedServices, eligibleServices, setSelectedServicesStore]);

  useEffect(() => {
    if (!hydrated || !dutyQuery.data?.isOnDuty || syncedDutyRef.current) return;
    if (eligibleServices.length === 0) return;
    const allowed = normalizeVehicleServiceTypes(dutyQuery.data.allowedServiceTypes);
    const inferred = inferSelectedFromAllowedServices(allowed, eligibleServices);
    if (inferred.join(",") !== activeSelection.join(",")) {
      void setSelectedServicesStore(inferred);
    }
    syncedDutyRef.current = true;
  }, [
    hydrated,
    dutyQuery.data,
    eligibleServices,
    activeSelection,
    setSelectedServicesStore,
  ]);

  const updateDutyMutation = useMutation({
    mutationFn: async (serviceTypes: string[]) => {
      const deviceId = await getOrCreateDeviceId();
      return riderApi.updateDutyStatus(true, serviceTypes, { deviceId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RIDER_DUTY_STATUS_QUERY_KEY });
    },
  });

  const pushDutySelection = useCallback(
    async (nextSelected: RiderServiceTypeValue[]) => {
      const serviceTypes = computeEligibleDutyServices({
        selectedServices: nextSelected,
        geoEnabled,
        vehicleServices,
        blockedServices,
        vehicleType,
      });
      if (serviceTypes.length === 0) return;
      if (!isOnDuty) return;
      await updateDutyMutation.mutateAsync(serviceTypes);
    },
    [geoEnabled, vehicleServices, blockedServices, vehicleType, isOnDuty, updateDutyMutation],
  );

  const setSelectedServices = useCallback(
    async (next: RiderServiceTypeValue[]) => {
      const normalized = normalizeSelectedServices(next, eligibleServices);
      await setSelectedServicesStore(normalized);
      await pushDutySelection(normalized);
    },
    [eligibleServices, setSelectedServicesStore, pushDutySelection],
  );

  const toggleService = useCallback(
    async (service: RiderServiceTypeValue) => {
      const next = toggleSelectedService(activeSelection, service, eligibleServices);
      if (next.join(",") === activeSelection.join(",")) return;
      await setSelectedServices(next);
    },
    [activeSelection, eligibleServices, setSelectedServices],
  );

  return {
    selectedServices: activeSelection,
    eligibleServices,
    setSelectedServices,
    toggleService,
    geoLoading: geoQuery.isLoading,
    geoFound: geoQuery.data?.found === true,
    stateName: geoQuery.data?.stateName ?? null,
    isUpdating: updateDutyMutation.isPending,
    visible: eligibleServices.length > 0,
  };
}

export function resolveDutyServiceTypesForToggle(
  queryClient: ReturnType<typeof useQueryClient>,
): string[] | undefined {
  const stored = useRiderServiceFilterStore.getState().selectedServices;
  const vehicle = queryClient.getQueryData<RiderVehicleStatusResponse>(riderVehicleQueryKey);
  const vehicleServices = normalizeVehicleServiceTypes(vehicle?.vehicle?.serviceTypes);

  const geoQueries = queryClient.getQueriesData<{
    found?: boolean;
    food?: boolean;
    parcel?: boolean;
    ride?: boolean;
  }>({
    queryKey: ["rider", "geo", "services"],
  });
  const geoData = geoQueries.find(([, data]) => data)?.[1];
  const geoEnabled = geoAvailabilityToRiderServices(
    geoData
      ? {
          found: geoData.found === true,
          food: !!geoData.food,
          parcel: !!geoData.parcel,
          ride: !!geoData.ride,
          pincode: null,
          stateName: null,
          resolvedLevel: null,
        }
      : null,
  );

  const duty = queryClient.getQueryData<{
    blockedServiceTypes?: string[];
    allServicesBlacklisted?: boolean;
  }>(RIDER_DUTY_STATUS_QUERY_KEY);
  const blockedServices = mergeRiderBlockedServices(
    duty?.blockedServiceTypes,
    duty?.allServicesBlacklisted ? ["food", "parcel", "person_ride"] : [],
  );

  const vehicleType = vehicle?.vehicle?.vehicleType ?? null;

  const eligible = buildEligibleServicePool({
    geoEnabled,
    vehicleServices,
    blockedServices,
    vehicleType,
  });

  const selected =
    stored.length > 0
      ? normalizeSelectedServices(stored, eligible)
      : eligible;

  const serviceTypes = computeEligibleDutyServices({
    selectedServices: selected,
    geoEnabled,
    vehicleServices,
    blockedServices,
    vehicleType,
  });
  return serviceTypes.length > 0 ? serviceTypes : undefined;
}

export { migrateLegacyServiceFilter };
