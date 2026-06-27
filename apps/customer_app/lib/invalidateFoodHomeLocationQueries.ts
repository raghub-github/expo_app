import type { QueryClient } from "@tanstack/react-query";

/** Refetch food home listing, offers, layout, and geo when delivery location changes. */
export function invalidateFoodHomeLocationQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["merchants"] }),
    queryClient.invalidateQueries({ queryKey: ["active-location"] }),
    queryClient.invalidateQueries({ queryKey: ["addresses"] }),
    queryClient.invalidateQueries({ queryKey: ["featured-offers-home"] }),
    queryClient.invalidateQueries({ queryKey: ["food-home-layout"] }),
    queryClient.invalidateQueries({ queryKey: ["geo", "services"] }),
    queryClient.invalidateQueries({ queryKey: ["weather"] }),
  ]);
}
