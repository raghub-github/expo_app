import { useQuery } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";
import { useSessionStore } from "@/src/stores/sessionStore";

export const RIDER_DUTY_STATUS_QUERY_KEY = ["rider", "duty", "status"] as const;

export function useDutyStatus() {
  const session = useSessionStore((s) => s.session);
  const sessionHydrated = useSessionStore((s) => s.hydrated);

  return useQuery({
    queryKey: RIDER_DUTY_STATUS_QUERY_KEY,
    queryFn: () => riderApi.getDutyStatus(),
    enabled: sessionHydrated && Boolean(session?.accessToken),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 2,
  });
}
