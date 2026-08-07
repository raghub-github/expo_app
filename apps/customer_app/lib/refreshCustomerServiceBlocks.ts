/**
 * Force-refresh per-service account blocks app-wide.
 * Keeps home tiles, tab bar, and gate hosts in sync after admin block/unblock.
 */

import type { QueryClient } from "@tanstack/react-query";
import { CUSTOMER_SERVICE_BLOCKS_QUERY_KEY } from "@/hooks/useCustomerServiceBlocks";
import { fetchCustomerServiceBlocks } from "@/services/customerServiceBlocks.service";

export async function refreshCustomerServiceBlocks(queryClient: QueryClient): Promise<void> {
  try {
    const blocks = await fetchCustomerServiceBlocks();
    queryClient.setQueryData(CUSTOMER_SERVICE_BLOCKS_QUERY_KEY, blocks);
  } catch {
    // Keep last known blocks — network blips must not flash tiles back to normal.
  }
}
