/**
 * Backend-authoritative per-service eligibility for the logged-in rider.
 * Home, KYC, Vehicles, and duty toggle all consume this hook so they cannot
 * diverge. Evaluated at the rider's registered working location (same as Admin
 * onboarding eligibility) — live GPS is used for duty/dispatch, not for which
 * services appear selectable in the Home dropdown.
 *
 * Polls while the app is foregrounded so Super Admin Geo & coverage FOOD/PARCEL/
 * RIDE toggles lock/unlock within a few seconds without a restart.
 */
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { riderApi } from "@/src/services/api/riderApi";
import type { BackendEligibilityByService } from "@/src/lib/rider-service-eligibility-rows";

/** How often Home re-checks geo coverage toggles while the app is open.
 * Keep moderate — sub-10s polling drains battery even OFF-DUTY. */
const GEO_COVERAGE_POLL_MS = 30_000;

export function useRiderServiceEligibilityStatus() {
  const session = useSessionStore((s) => s.session);
  const authed = Boolean(session?.accessToken);

  const query = useQuery({
    queryKey: ["rider", "eligibility", "status", "registered"] as const,
    queryFn: async () => {
      // No live coords — backend falls back to registered lat/pincode/state so
      // Home matches Admin + Vehicles (profile location), not a traveling GPS fix.
      return riderApi.getServiceEligibilityStatus(null);
    },
    enabled: authed,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: authed ? GEO_COVERAGE_POLL_MS : false,
    refetchIntervalInBackground: false,
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
