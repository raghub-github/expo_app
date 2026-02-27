"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoreProfile } from "./useStore";
import type { BankAccountItem } from "./useStoreBankAccounts";
import type { AreaManagerInfo } from "./useStoreAreaManager";

export type StoreProfileFull = {
  store: StoreProfile | null;
  documents: Record<string, unknown> | null;
  operatingHours: Record<string, unknown> | null;
  agreementAcceptance: Record<string, unknown> | null;
  bankAccounts: BankAccountItem[];
  areaManager: AreaManagerInfo | null;
};

async function fetchProfileFull(storeId: string): Promise<StoreProfileFull> {
  const res = await fetch(`/api/merchant/stores/${storeId}/profile-full`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data?.error ?? "Failed to load profile");
  }
  const store = data.store ?? null;
  return {
    store,
    documents: data.documents ?? null,
    operatingHours: data.operatingHours ?? null,
    agreementAcceptance: data.agreementAcceptance ?? null,
    bankAccounts: Array.isArray(data.bankAccounts) ? data.bankAccounts : [],
    areaManager: data.areaManager ?? null,
  };
}

export const STORE_PROFILE_FULL_KEY = (id: string) => ["storeProfileFull", id] as const;

const STALE_MS = 2 * 60 * 1000;

export function useStoreProfileFull(storeId: string | null) {
  const query = useQuery({
    queryKey: STORE_PROFILE_FULL_KEY(storeId ?? ""),
    queryFn: () => fetchProfileFull(storeId!),
    enabled: !!storeId,
    staleTime: STALE_MS,
    gcTime: STALE_MS * 2,
  });
  return {
    data: query.data ?? null,
    store: query.data?.store ?? null,
    documents: query.data?.documents ?? null,
    operatingHours: query.data?.operatingHours ?? null,
    agreementAcceptance: query.data?.agreementAcceptance ?? null,
    bankAccounts: query.data?.bankAccounts ?? [],
    areaManager: query.data?.areaManager ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useInvalidateStoreProfileFull(storeId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    if (storeId) queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
  };
}
