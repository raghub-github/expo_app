"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface MerchantOffer {
  id: number;
  title: string;
  offerCode: string;
  discountType: "FLAT" | "PERCENTAGE";
  discountValue: number;
  minOrderAmount: number | null;
  validFrom: string;
  validTill: string;
  isActive: boolean;
  createdAt: string;
  storeId: number | null;
  storeName: string | null;
}

export interface MerchantOffersFilters {
  search?: string;
  status?: "active" | "inactive" | "";
  limit?: number;
  offset?: number;
}

async function fetchMerchantOffers(filters: MerchantOffersFilters): Promise<{ offers: MerchantOffer[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  params.set("limit", String(filters.limit ?? 20));
  params.set("offset", String(filters.offset ?? 0));

  const res = await fetch(`/api/offers/merchant?${params}`, { credentials: "include" });
  if (res.status === 401) throw new Error("Session expired");
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Failed to fetch offers");
  return json.data;
}

export function useMerchantOffersQuery(filters: MerchantOffersFilters) {
  return useQuery({
    queryKey: queryKeys.offers.merchant.list(filters as unknown as Record<string, unknown>),    queryFn: () => fetchMerchantOffers(filters),
  });
}

export function useCreateMerchantOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      offerCode: string;
      discountType: "FLAT" | "PERCENTAGE";
      discountValue: number;
      minOrderAmount?: number | null;
      validFrom: string;
      validTill: string;
      isActive?: boolean;
      storeId?: number | null;
    }) => {
      const res = await fetch("/api/offers/merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create offer");
      return json.data as MerchantOffer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers", "merchant"] });
    },
  });
}

export function useUpdateMerchantOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<MerchantOffer> & { id: number }) => {
      const res = await fetch(`/api/offers/merchant/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update offer");
      return json.data as MerchantOffer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers", "merchant"] });
    },
  });
}

export function useToggleMerchantOfferStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/offers/merchant/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update status");
      return json.data as MerchantOffer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers", "merchant"] });
    },
  });
}

export function useDeleteMerchantOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/offers/merchant/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to delete offer");
      return json.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers", "merchant"] });
    },
  });
}

export function useOffersStores() {
  return useQuery({
    queryKey: queryKeys.offers.stores(),
    queryFn: async () => {
      const res = await fetch("/api/offers/stores", { credentials: "include" });
      if (res.status === 401) throw new Error("Session expired");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to fetch stores");
      return json.data as { id: number; storeId: string; name: string }[];
    },
  });
}
