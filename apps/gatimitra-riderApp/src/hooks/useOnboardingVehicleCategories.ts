import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import {
  FALLBACK_ONBOARDING_VEHICLE_CATEGORIES,
  type OnboardingVehicleCategory,
} from "@/src/lib/onboarding-vehicle-types";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export function useOnboardingVehicleCategories() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "vehicle-categories"],
    queryFn: async (): Promise<OnboardingVehicleCategory[]> => {
      if (!session?.accessToken) {
        return FALLBACK_ONBOARDING_VEHICLE_CATEGORIES;
      }
      try {
        const res = await getJson<{ rows: OnboardingVehicleCategory[] }>(
          `${API_BASE()}/v1/onboarding/vehicle-categories?includeInactive=true`,
          { headers: { authorization: `Bearer ${session.accessToken}` } }
        );
        if (res.rows?.length) return res.rows;
      } catch (e) {
        console.warn("[useOnboardingVehicleCategories] fetch failed, using fallback", e);
      }
      return FALLBACK_ONBOARDING_VEHICLE_CATEGORIES;
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
    placeholderData: FALLBACK_ONBOARDING_VEHICLE_CATEGORIES,
  });
}
