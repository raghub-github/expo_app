import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import type { OnboardingVehicleCategory } from "@/src/lib/onboarding-vehicle-types";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export function useOnboardingVehicleCategories() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "vehicle-categories", "active-only"],
    queryFn: async (): Promise<OnboardingVehicleCategory[]> => {
      if (!session?.accessToken) return [];
      const res = await getJson<{ rows: OnboardingVehicleCategory[] }>(
        `${API_BASE()}/v1/onboarding/vehicle-categories?includeInactive=false`,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
      return res.rows ?? [];
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 60_000,
    refetchOnMount: "always",
  });
}
