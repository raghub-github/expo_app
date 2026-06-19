import { useQuery } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";

export const RIDER_DUTY_STATUS_QUERY_KEY = ["rider", "duty", "status"] as const;

export function useDutyStatus() {
  return useQuery({
    queryKey: RIDER_DUTY_STATUS_QUERY_KEY,
    queryFn: () => riderApi.getDutyStatus(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 2,
  });
}
