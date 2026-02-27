"use client";

import { useQuery } from "@tanstack/react-query";

export type StoreVerificationData = {
  store: Record<string, unknown>;
  documents: Record<string, unknown> | null;
  operatingHours: Record<string, unknown> | null;
  onboardingPayments: Record<string, unknown>[];
  agreementAcceptance: Record<string, unknown> | null;
  menuMediaFiles: Array<{
    id: number;
    original_file_name: string | null;
    r2_key: string;
    public_url: string | null;
    verification_status: string;
    created_at: string;
  }>;
};

async function fetchVerificationData(
  storeId: string
): Promise<StoreVerificationData | null> {
  const res = await fetch(
    `/api/merchant/stores/${storeId}/verification-data`,
    { credentials: "include" }
  );
  const data = await res.json();
  if (!res.ok || !data.success) return null;
  return {
    store: data.store ?? {},
    documents: data.documents ?? null,
    operatingHours: data.operatingHours ?? null,
    onboardingPayments: Array.isArray(data.onboardingPayments)
      ? data.onboardingPayments
      : [],
    agreementAcceptance: data.agreementAcceptance ?? null,
    menuMediaFiles: Array.isArray(data.menuMediaFiles) ? data.menuMediaFiles : [],
  };
}

const KEY = (id: string) => ["storeVerificationData", id] as const;

export function useStoreVerificationData(storeId: string | null) {
  const query = useQuery({
    queryKey: KEY(storeId ?? ""),
    queryFn: () => fetchVerificationData(storeId!),
    enabled: !!storeId,
  });
  return {
    data: query.data ?? null,
    store: query.data?.store ?? null,
    documents: query.data?.documents ?? null,
    operatingHours: query.data?.operatingHours ?? null,
    agreementAcceptance: query.data?.agreementAcceptance ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
