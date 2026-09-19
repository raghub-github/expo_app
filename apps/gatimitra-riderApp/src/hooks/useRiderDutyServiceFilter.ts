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
  geoAvailabilityToRiderServices,
  inferSelectedFromAllowedServices,
  migrateLegacyServiceFilter,
  normalizeSelectedServices,
  normalizeVehicleServiceTypes,
  toggleSelectedService,
} from "@/src/lib/rider-duty-service-types";
import { mergeRiderBlockedServices } from "@/src/lib/rider-blocked-services";
import type { RiderServiceTypeValue } from "@/src/lib/rider-vehicle-form";
import { useCategoryServiceAssignments } from "@/src/hooks/useCategoryServiceAssignments";
import {
  resolveCategoryCodeForVehicleType,
  type CategoryServiceAssignmentsResponse,
} from "@/src/lib/rider-category-service-assignments";
import { useOnboardingVehicleTypes } from "@/src/hooks/useOnboardingVehicleTypes";
import type { OnboardingVehicleType } from "@/src/lib/onboarding-vehicle-types";
import { useRiderServiceEligibilityStatus } from "@/src/hooks/useRiderServiceEligibilityStatus";
import { resolveSelectableServices } from "@/src/lib/rider-service-eligibility-rows";

export function useRiderDutyServiceFilter() {
  const queryClient = useQueryClient();
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const selectedServices = useRiderServiceFilterStore((s) => s.selectedServices);
  const setSelectedServicesStore = useRiderServiceFilterStore((s) => s.setSelectedServices);
  const hydrated = useRiderServiceFilterStore((s) => s.hydrated);

  const geoQuery = useRiderGeoServiceAvailability();
  const dutyQuery = useDutyStatus();
  const vehicleQuery = useRiderVehicle();
  const assignmentsQuery = useCategoryServiceAssignments();
  const onboardingTypesQuery = useOnboardingVehicleTypes();

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
  const vehicleCategoryCode = useMemo(() => {
    const stored = vehicleQuery.data?.vehicle?.vehicleCategory ?? null;
    if (stored) return stored;
    return resolveCategoryCodeForVehicleType(
      vehicleType,
      onboardingTypesQuery.data ?? []
    );
  }, [vehicleQuery.data, vehicleType, onboardingTypesQuery.data]);

  const categoryServiceByCode = assignmentsQuery.data?.byCategory;
  const vehicleServiceByMapsToType = assignmentsQuery.data?.byMapsToVehicleType;

  const rawEligibleServices = useMemo(
    () =>
      buildEligibleServicePool({
        geoEnabled,
        vehicleServices,
        blockedServices,
        vehicleType,
        vehicleCategoryCode,
        categoryServiceByCode,
        vehicleServiceByMapsToType,
      }),
    [
      geoEnabled,
      vehicleServices,
      blockedServices,
      vehicleType,
      vehicleCategoryCode,
      categoryServiceByCode,
      vehicleServiceByMapsToType,
    ],
  );

  // Engine eligibility is the selectable source of truth. The client pool is only
  // a fallback while the status request is still loading.
  const { backend: eligibilityBackend, enforced: eligibilityEnforced } =
    useRiderServiceEligibilityStatus();
  const eligibleServices = useMemo(
    () =>
      resolveSelectableServices({
        clientPool: rawEligibleServices,
        backend: eligibilityBackend,
        enforced: eligibilityEnforced,
      }),
    [rawEligibleServices, eligibilityBackend, eligibilityEnforced],
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
      const serviceTypes = nextSelected.filter((s) => eligibleServices.includes(s));
      if (serviceTypes.length === 0) return;
      if (!isOnDuty) return;
      await updateDutyMutation.mutateAsync(serviceTypes);
    },
    [eligibleServices, isOnDuty, updateDutyMutation],
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
  const onboardingTypes =
    queryClient.getQueryData<OnboardingVehicleType[]>(["rider", "onboarding", "vehicle-types"]) ??
    [];
  const assignments = queryClient.getQueryData<CategoryServiceAssignmentsResponse>([
    "rider",
    "onboarding",
    "category-service-assignments",
  ]);
  const vehicleCategoryCode = resolveCategoryCodeForVehicleType(
    vehicleType,
    onboardingTypes,
    vehicle?.vehicle?.vehicleCategory ?? null
  );

  const clientPool = buildEligibleServicePool({
    geoEnabled,
    vehicleServices,
    blockedServices,
    vehicleType,
    vehicleCategoryCode,
    categoryServiceByCode: assignments?.byCategory,
    vehicleServiceByMapsToType: assignments?.byMapsToVehicleType,
  });

  const eligQueries = queryClient.getQueriesData<{
    services?: Record<string, { eligible?: boolean; blocking?: { code: string; reason: string }[] }>;
  }>({ queryKey: ["rider", "eligibility", "status"] });
  const elig = eligQueries.find(([, data]) => data?.services)?.[1];
  const backend = elig?.services
    ? {
        food: elig.services.food as { eligible: boolean; blocking: { code: string; reason: string }[] },
        parcel: elig.services.parcel as { eligible: boolean; blocking: { code: string; reason: string }[] },
        person_ride: elig.services.person_ride as {
          eligible: boolean;
          blocking: { code: string; reason: string }[];
        },
      }
    : null;

  const eligible = resolveSelectableServices({
    clientPool,
    backend,
    enforced: true,
  });

  const selected =
    stored.length > 0 ? normalizeSelectedServices(stored, eligible) : [];

  if (selected.length > 0) return selected;
  // Home dropdown can already show Food/Person while eligibility cache is cold.
  // Don't block ON-DUTY just because the reconstructed pool was empty.
  if (stored.length > 0) return stored;
  return eligible.length > 0 ? eligible : undefined;
}

export { migrateLegacyServiceFilter };
