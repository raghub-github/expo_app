/**
 * Backend-authoritative per-service eligibility for the logged-in rider (Step 5b).
 * Feeds the dropdown's "preference != eligibility" surface with the engine's decision +
 * reasons. Location is best-effort (rider's live coords); when absent the backend falls
 * back to the default policy, so the hook still returns a document/vehicle-based decision.
 */
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
import { riderApi } from "@/src/services/api/riderApi";
import type { BackendEligibilityByService } from "@/src/lib/rider-service-eligibility-rows";

/** Round coords so tiny GPS jitter doesn't thrash the query key / refetch. */
function roundCoord(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100; // ~1.1km bucket — policy is geo-node scoped
}

export function useRiderServiceEligibilityStatus() {
  const session = useSessionStore((s) => s.session);
  const authed = Boolean(session?.accessToken);
  const lat = useRiderLocationStore((s) => roundCoord(s.coords?.latitude));
  const lng = useRiderLocationStore((s) => roundCoord(s.coords?.longitude));

  const query = useQuery({
    queryKey: ["rider", "eligibility", "status", lat, lng] as const,
    queryFn: async () => {
      return riderApi.getServiceEligibilityStatus(
        lat != null && lng != null ? { lat, lng } : null
      );
    },
    enabled: authed,
    staleTime: 120_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const backend: BackendEligibilityByService | null = query.data
    ? {
        food: query.data.services.food,
        parcel: query.data.services.parcel,
        person_ride: query.data.services.person_ride,
      }
    : null;

  return {
    backend,
    /** True only when the backend is actually enforcing eligibility (enforce mode). */
    enforced: query.data?.enforced === true,
    resolvedGeo: query.data?.resolvedGeo ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
