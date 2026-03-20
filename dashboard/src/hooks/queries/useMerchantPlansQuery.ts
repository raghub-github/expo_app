"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number" || t === "boolean") return String(value);
  if (t === "bigint") return JSON.stringify(value.toString() + "n");
  if (t === "function") return '"[function]"';
  if (Array.isArray(value)) return `[${value.map((v) => stableSerialize(v)).join(",")}]`;
  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export interface MerchantPlan {
  id: number;
  planName: string;
  planCode: string;
  description: string | null;
  price: number;
  billingCycle: string;
  maxMenuItems: number | null;
  maxCuisines: number | null;
  maxMenuCategories: number | null;
  imageUploadAllowed: boolean;
  maxImageUploads: number | null;
  analyticsAccess: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  marketingAutomation: boolean;
  customApiIntegrations: boolean;
  dedicatedAccountManager: boolean;
  displayOrder: number | null;
  isActive: boolean;
  isPopular: boolean;
  createdAt: string | null;
}

export interface MerchantPlansFilters {
  search?: string;
  status?: "active" | "inactive" | "";
  limit?: number;
  offset?: number;
}

async function fetchMerchantPlans(filters: MerchantPlansFilters): Promise<{ plans: MerchantPlan[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  params.set("limit", String(filters.limit ?? 20));
  params.set("offset", String(filters.offset ?? 0));

  const res = await fetch(`/api/offers/merchant-plans?${params}`, { credentials: "include" });
  if (res.status === 401) throw new Error("Session expired");
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Failed to fetch plans");
  return json.data;
}

export function useMerchantPlansQuery(filters: MerchantPlansFilters) {
  const filtersKey = stableSerialize(filters);
  const fetchPlans = useCallback(() => fetchMerchantPlans(filters), [filters]);

  return useQuery({
    queryKey: ["offers", "merchant-plans", "list", filtersKey],
    queryFn: fetchPlans,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    retry: 1,
  });
}

export function useCreateMerchantPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<MerchantPlan> & { planName: string; planCode: string }) => {
      const res = await fetch("/api/offers/merchant-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create plan");
      return json.data as MerchantPlan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers", "merchant-plans"] });
    },
  });
}

export function useUpdateMerchantPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<MerchantPlan> & { id: number }) => {
      const res = await fetch(`/api/offers/merchant-plans/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update plan");
      return json.data as MerchantPlan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers", "merchant-plans"] });
    },
  });
}

export function useToggleMerchantPlanStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/offers/merchant-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update status");
      return json.data as MerchantPlan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers", "merchant-plans"] });
    },
  });
}

export function useDeleteMerchantPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/offers/merchant-plans/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to delete plan");
      return json.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers", "merchant-plans"] });
    },
  });
}
