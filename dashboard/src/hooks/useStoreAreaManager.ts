"use client";

import { useQuery } from "@tanstack/react-query";

export type AreaManagerInfo = {
  id: number;
  name: string;
  email: string;
  mobile: string;
};

async function fetchAreaManager(
  storeId: string
): Promise<AreaManagerInfo | null> {
  const res = await fetch(
    `/api/merchant/stores/${storeId}/area-manager`,
    { credentials: "include" }
  );
  const data = await res.json();
  if (!res.ok || !data.success) return null;
  return data.areaManager ?? null;
}

const KEY = (id: string) => ["storeAreaManager", id] as const;

export function useStoreAreaManager(storeId: string | null) {
  const query = useQuery({
    queryKey: KEY(storeId ?? ""),
    queryFn: () => fetchAreaManager(storeId!),
    enabled: !!storeId,
  });
  return {
    areaManager: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
