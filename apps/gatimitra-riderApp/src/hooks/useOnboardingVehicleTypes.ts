import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import type { OnboardingVehicleType } from "@/src/lib/onboarding-vehicle-types";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export function useOnboardingVehicleTypes() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "vehicle-types", "active-only", "v2"],
    queryFn: async (): Promise<OnboardingVehicleType[]> => {
      if (!session?.accessToken) return [];
      const res = await getJson<{ rows: OnboardingVehicleType[] }>(
        `${API_BASE()}/v1/onboarding/vehicle-types?includeInactive=false`,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
      return (res.rows ?? []).map((row) => ({
        ...row,
        documentRequirements: {
          required_docs: Array.isArray(row.documentRequirements?.required_docs)
            ? row.documentRequirements.required_docs
            : [],
          optional_docs: Array.isArray(row.documentRequirements?.optional_docs)
            ? row.documentRequirements.optional_docs
            : [],
          has_own_vehicle: Boolean(row.documentRequirements?.has_own_vehicle),
          requires_max_speed: Boolean(row.documentRequirements?.requires_max_speed),
        },
      }));
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 60_000,
    refetchOnMount: "always",
  });
}
