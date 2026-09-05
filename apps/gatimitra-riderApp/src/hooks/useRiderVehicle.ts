import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson, putJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export type RiderVehicleDto = {
  id: number;
  vehicleType: string;
  vehicleTypeLabel: string;
  registrationNumber: string;
  fuelType: string | null;
  fuelTypeLabel: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  ownershipType: string | null;
  registrationState: string | null;
  verified: boolean;
  isCommercial: boolean;
  serviceTypes: string[];
  vehicleCategory: string | null;
  seatingCapacity: number | null;
  acType: string | null;
};

export type RiderVehicleOnboardingPrefill = {
  registrationNumber: string | null;
  vehicleChoice: string | null;
  vehicleCategoryCode: string | null;
  resolvedVehicleType: string | null;
  vehicleTypeLabel: string | null;
  suggestedAcType: "AC" | "Non-AC" | null;
  suggestedIsCommercial: boolean | null;
};

export type RiderVehicleFormMode = "full" | "cashfree_missing_only";

export type RiderVehicleMissingField =
  | "vehicle_type"
  | "registration_number"
  | "fuel_type"
  | "make"
  | "model"
  | "color"
  | "year"
  | "service_types"
  | "ownership_type"
  | "is_commercial"
  | "seating_capacity"
  | "ac_type";

export type RiderVehicleFormMeta = {
  formMode: RiderVehicleFormMode;
  prefillSource: "cashfree_rc" | "manual" | null;
  initialStep: 1 | 2;
  step1Complete: boolean;
  step2Complete: boolean;
  missingFields: RiderVehicleMissingField[];
};

export type RiderVehicleStatusResponse = {
  hasVehicle: boolean;
  isComplete: boolean;
  vehicle: RiderVehicleDto | null;
  onboardingVehicleChoice?: string | null;
  onboardingVehicleCategoryCode?: string | null;
  onboardingPrefill?: RiderVehicleOnboardingPrefill | null;
  formMeta?: RiderVehicleFormMeta;
};

export type UpsertRiderVehiclePayload = {
  vehicleType: string;
  registrationNumber: string;
  fuelType?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  ownershipType?: string | null;
  registrationState?: string | null;
  serviceTypes: string[];
  isCommercial: boolean;
  seatingCapacity?: number | null;
  acType?: string | null;
  vehicleCategoryCode?: string | null;
  onboardingVehicleChoice?: string | null;
};

export const riderVehicleQueryKey = ["rider", "me", "vehicle"] as const;

export function useRiderVehicle() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: riderVehicleQueryKey,
    queryFn: async (): Promise<RiderVehicleStatusResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      return getJson<RiderVehicleStatusResponse>(`${API_BASE()}/v1/rider/me/vehicle`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
    },
    enabled: !!session?.accessToken,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}

export function useUpsertRiderVehicle() {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpsertRiderVehiclePayload) => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return putJson<RiderVehicleStatusResponse>(`${API_BASE()}/v1/rider/me/vehicle`, payload, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(riderVehicleQueryKey, data);
    },
  });
}
