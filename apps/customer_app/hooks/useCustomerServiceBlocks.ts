import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import {
  fetchCustomerServiceBlocks,
  mapCustomerAccountBlocks,
  type CustomerAccountBlocksMap,
} from "@/services/customerServiceBlocks.service";

export const CUSTOMER_SERVICE_BLOCKS_QUERY_KEY = ["customer", "service-blocks"] as const;

/** Poll while app is open — admin block/unblock should land within a few seconds. */
const SERVICE_BLOCKS_POLL_MS = 8_000;

export function useCustomerServiceBlocks() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  const query = useQuery({
    queryKey: CUSTOMER_SERVICE_BLOCKS_QUERY_KEY,
    queryFn: fetchCustomerServiceBlocks,
    enabled: hydrated && !!session,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchInterval: hydrated && session ? SERVICE_BLOCKS_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
    placeholderData: (previous) => previous,
  });

  const accountBlocks: CustomerAccountBlocksMap = mapCustomerAccountBlocks(query.data ?? []);

  return {
    ...query,
    accountBlocks,
  };
}
