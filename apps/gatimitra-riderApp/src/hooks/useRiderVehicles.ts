/**
 * Rider vehicles + per-vehicle service eligibility + active-vehicle selection (Phase 3).
 * Backend-authoritative: the app renders `services` and the active flag as returned; the
 * "use this vehicle" mutation is validated server-side (ownership/verified/live-order guard).
 *
 * Eligibility is resolved at the rider's registered location (same as Admin + Home
 * service dropdown) so screens cannot diverge when live GPS is in another state.
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
    queryFn: () => riderApi.getVehicles(null),
    enabled: authed,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    // Instant paint from last successful fetch (tabs prefetch / prior visit).
    placeholderData: (previous) =>
      previous ?? qc.getQueryData<RiderVehiclesResponse>(RIDER_VEHICLES_QUERY_KEY),
  });

  const setActive = useMutation({
    mutationFn: (vehicleId: number) => riderApi.setActiveVehicle(vehicleId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: RIDER_VEHICLES_QUERY_KEY });
      await qc.invalidateQueries({ queryKey: ["rider", "eligibility"] });
    },
  });

  const vehicles = query.data?.vehicles ?? [];
  // Only block the screen when we have nothing to show yet (no cache / placeholder).
  const isLoading = query.isLoading && vehicles.length === 0 && !query.isFetched;

  return {
    vehicles,
    activeVehicleId: query.data?.activeVehicleId ?? null,
    isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    setActiveVehicle: setActive.mutateAsync,
    isSettingActive: setActive.isPending,
  };
}

export function prefetchRiderVehicles(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const token = useSessionStore.getState().session?.accessToken;
  if (!token) return Promise.resolve();
  return queryClient
    .prefetchQuery({
      queryKey: RIDER_VEHICLES_QUERY_KEY,
      queryFn: () => riderApi.getVehicles(null),
      staleTime: 60_000,
    })
    .then(() => undefined);
}
