"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type StoreProfile = {
  id: number;
  store_id: string;
  name: string;
  store_name: string;
  store_display_name?: string | null;
  store_description?: string | null;
  store_email?: string | null;
  store_phones?: string[] | null;
  full_address?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  banner_url?: string | null;
  gallery_images?: string[] | null;
  cuisine_types?: string[] | null;
  food_categories?: string[] | null;
  avg_preparation_time_minutes?: number | null;
  min_order_amount?: number | null;
  delivery_radius_km?: number | null;
  is_pure_veg?: boolean | null;
  accepts_online_payment?: boolean | null;
  accepts_cash?: boolean | null;
  store_type?: string | null;
  approval_status: string;
  current_onboarding_step?: number | null;
  onboarding_completed?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  delisted_at?: string | null;
  delist_reason?: string | null;
  delisted_by_name?: string | null;
  delisted_by_email?: string | null;
  delisted_by_role?: string | null;
};

async function fetchStore(storeId: string): Promise<StoreProfile | null> {
  const res = await fetch(
    `/api/merchant/stores/${storeId}?verification=1`,
    { credentials: "include" }
  );
  const data = await res.json();
  if (!res.ok || !data.success) return null;
  return data.store ?? null;
}

export const STORE_KEY = (id: string) => ["store", id] as const;

/** Cache store for 30 minutes so navigation between Dashboard/Settings/Orders reuses data; refetch only on new search or refresh. */
const STALE_TIME_MS = 30 * 60 * 1000;
const GC_TIME_MS = 60 * 60 * 1000;

export function useStore(storeId: string | null) {
  const query = useQuery({
    queryKey: STORE_KEY(storeId ?? ""),
    queryFn: () => fetchStore(storeId!),
    enabled: !!storeId,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  return {
    store: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useStoreMutation(storeId: string | null) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (payload: Partial<StoreProfile>) => {
      const res = await fetch(`/api/merchant/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed");
      return data;
    },
    onSuccess: () => {
      if (storeId) queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
    },
  });
  return mutation;
}
