import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import {
  FALLBACK_ONBOARDING_VEHICLE_TYPES,
  type OnboardingVehicleType,
} from "@/src/lib/onboarding-vehicle-types";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export function useOnboardingVehicleTypes() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "vehicle-types"],
    queryFn: async (): Promise<OnboardingVehicleType[]> => {
      if (!session?.accessToken) {
        return FALLBACK_ONBOARDING_VEHICLE_TYPES;
      }
      try {
        const res = await getJson<{ rows: OnboardingVehicleType[] }>(
          `${API_BASE()}/v1/onboarding/vehicle-types?includeInactive=true`,
          { headers: { authorization: `Bearer ${session.accessToken}` } }
        );
        if (res.rows?.length) return res.rows;
      } catch (e) {
        console.warn("[useOnboardingVehicleTypes] fetch failed, using fallback", e);
      }
      return FALLBACK_ONBOARDING_VEHICLE_TYPES;
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
    placeholderData: FALLBACK_ONBOARDING_VEHICLE_TYPES,
  });
}
