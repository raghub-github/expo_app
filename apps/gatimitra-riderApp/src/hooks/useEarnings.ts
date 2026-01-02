import { useQuery } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";

/**
 * Hook to fetch earnings summary
 */
export function useEarningsSummary() {
  return useQuery({
    queryKey: ["rider", "earnings", "summary"],
    queryFn: () => riderApi.getEarningsSummary(),
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000,
  });
}

