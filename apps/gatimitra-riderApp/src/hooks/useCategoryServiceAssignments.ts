import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import {
  FALLBACK_CATEGORY_SERVICE_BY_CODE,
  type CategoryServiceAssignmentsResponse,
} from "@/src/lib/rider-category-service-assignments";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export function useCategoryServiceAssignments() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "category-service-assignments"],
    queryFn: async (): Promise<CategoryServiceAssignmentsResponse> => {
      if (!session?.accessToken) {
        return { rows: [], byCategory: FALLBACK_CATEGORY_SERVICE_BY_CODE };
      }
      try {
        const res = await getJson<CategoryServiceAssignmentsResponse>(
          `${API_BASE()}/v1/onboarding/category-service-assignments`,
          { headers: { authorization: `Bearer ${session.accessToken}` } }
        );
        if (res.byCategory && Object.keys(res.byCategory).length > 0) {
          return {
            rows: res.rows ?? [],
            byCategory: res.byCategory,
            vehicleRows: res.vehicleRows ?? [],
            byMapsToVehicleType: res.byMapsToVehicleType ?? {},
          };
        }
      } catch (e) {
        console.warn("[useCategoryServiceAssignments] fetch failed, using fallback", e);
      }
      return { rows: [], byCategory: FALLBACK_CATEGORY_SERVICE_BY_CODE };
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
    placeholderData: { rows: [], byCategory: FALLBACK_CATEGORY_SERVICE_BY_CODE },
  });
}
