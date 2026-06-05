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
  seatingCapacity: number | null;
  acType: string | null;
};

export type RiderVehicleStatusResponse = {
  hasVehicle: boolean;
  isComplete: boolean;
  vehicle: RiderVehicleDto | null;
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
    refetchOnMount: "always",
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
