/**
 * Rider vehicles + per-vehicle service eligibility + active-vehicle selection (Phase 3).
 * Backend-authoritative: the app renders `services` and the active flag as returned; the
 * "use this vehicle" mutation is validated server-side (ownership/verified/live-order guard).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { riderApi, type RiderVehiclesResponse } from "@/src/services/api/riderApi";

export const RIDER_VEHICLES_QUERY_KEY = ["rider", "vehicles"] as const;

export function useRiderVehicles() {
  const session = useSessionStore((s) => s.session);
  const authed = Boolean(session?.accessToken);
  const qc = useQueryClient();

  const query = useQuery<RiderVehiclesResponse>({
    queryKey: RIDER_VEHICLES_QUERY_KEY,
    queryFn: () => riderApi.getVehicles(),
    enabled: authed,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const setActive = useMutation({
    mutationFn: (vehicleId: number) => riderApi.setActiveVehicle(vehicleId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: RIDER_VEHICLES_QUERY_KEY });
    },
  });

  return {
    vehicles: query.data?.vehicles ?? [],
    activeVehicleId: query.data?.activeVehicleId ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    setActiveVehicle: setActive.mutateAsync,
    isSettingActive: setActive.isPending,
  };
}
