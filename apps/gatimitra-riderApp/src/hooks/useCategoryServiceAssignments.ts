import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import {
  FALLBACK_CATEGORY_SERVICE_BY_CODE,
  type CategoryServiceAssignmentsResponse,
} from "@/src/lib/rider-category-service-assignments";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

/** Avoid spamming Metro when backend is slow — one warn per session. */
let warnedCategoryAssignmentsFailure = false;

export function useCategoryServiceAssignments() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "category-service-assignments"],
    queryFn: async (): Promise<CategoryServiceAssignmentsResponse> => {
      try {
        const res = await getJson<CategoryServiceAssignmentsResponse>(
          `${API_BASE()}/v1/onboarding/category-service-assignments`,
          {
            // Boot path — fail fast to fallback instead of hanging 30s on a busy DB pool.
            timeout: 8_000,
            ...(session?.accessToken
              ? { headers: { authorization: `Bearer ${session.accessToken}` } }
              : {}),
          }
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
        if (__DEV__ && !warnedCategoryAssignmentsFailure) {
          warnedCategoryAssignmentsFailure = true;
          console.warn(
            "[useCategoryServiceAssignments] fetch failed, using fallback",
            e instanceof Error ? e.message : e
          );
        }
      }
      return { rows: [], byCategory: FALLBACK_CATEGORY_SERVICE_BY_CODE };
    },
    // Public config endpoint — fetch even before session hydrates.
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    retryDelay: 1_500,
    placeholderData: { rows: [], byCategory: FALLBACK_CATEGORY_SERVICE_BY_CODE },
  });
}
