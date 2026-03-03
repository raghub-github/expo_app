"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export type BankAccountItem = {
  id: number;
  account_holder_name: string;
  account_number_masked?: string | null;
  account_number?: string;
  ifsc_code: string;
  bank_name: string;
  upi_id?: string | null;
  is_primary?: boolean;
  is_active?: boolean;
  is_verified?: boolean;
  branch_name?: string | null;
  account_type?: string | null;
  payout_method?: string;
};

async function fetchBankAccounts(
  storeId: string
): Promise<BankAccountItem[]> {
  const res = await fetch(
    `/api/merchant/stores/${storeId}/bank-accounts`,
    { credentials: "include" }
  );
  const data = await res.json();
  if (!res.ok) return [];
  return Array.isArray(data) ? data : [];
}

const KEY = (id: string) => ["storeBankAccounts", id] as const;

export function useStoreBankAccounts(storeId: string | null) {
  const query = useQuery({
    queryKey: KEY(storeId ?? ""),
    queryFn: () => fetchBankAccounts(storeId!),
    enabled: !!storeId,
  });
  return {
    bankAccounts: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useInvalidateStoreBankAccounts(storeId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    if (storeId) queryClient.invalidateQueries({ queryKey: KEY(storeId) });
  };
}
