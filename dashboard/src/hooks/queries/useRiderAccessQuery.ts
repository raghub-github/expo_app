"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";

export interface RiderAccessByService {
  food: boolean;
  parcel: boolean;
  person_ride: boolean;
}

export interface RiderAccessData {
  hasRiderAccess: boolean;
  isSuperAdmin: boolean;
  canAddPenalty: RiderAccessByService;
  /** Revert penalty: only for agents with UPDATE on rider service (not view-only) */
  canRevertPenalty: RiderAccessByService;
  canBlock: RiderAccessByService;
  canUnblock: RiderAccessByService;
  canFreezeWallet: boolean;
  canRequestWalletCredit: boolean;
  canApproveRejectWalletCredit?: boolean;
}

async function fetchRiderAccess(): Promise<RiderAccessData> {
  const response = await fetch("/api/auth/rider-access", {
    credentials: "include",
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    let errorMessage = `Failed to fetch rider access: ${response.status}`;
    try {
      const errorData = JSON.parse(text);
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = text || errorMessage;
    }
    throw new Error(errorMessage);
  }
  let result: { success: boolean; data?: RiderAccessData; error?: string };
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Invalid response from rider-access API");
  }
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch rider access");
  }
  return result.data;
}

const riderAccessCacheConfig = {
  ...getCacheConfig(CacheTier.MEDIUM),  staleTime: 60_000,
};

export function useRiderAccessQuery() {
  return useQuery({
    queryKey: queryKeys.rider.access(),
    queryFn: fetchRiderAccess,
    ...riderAccessCacheConfig,
    placeholderData: (previousData) => previousData,
  });
}
