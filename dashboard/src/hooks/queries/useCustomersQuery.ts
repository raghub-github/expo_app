"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";
import { CustomerWithStats } from "@/lib/db/operations/customers";
import { useAuthOptional } from "@/providers/AuthProvider";

interface CustomersResponse {
  success: boolean;
  data?: CustomerWithStats[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}

export interface CustomersQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  orderType?: "food" | "parcel" | "person_ride";
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  enabled?: boolean;
}

/** Exported for prefetch-on-hover (dashboard section preload). */
export async function fetchCustomers(
  params: CustomersQueryParams = {},
  signal?: AbortSignal
): Promise<{
  customers: CustomerWithStats[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.set("page", params.page.toString());
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.search) searchParams.set("search", params.search);
  if (params.status) searchParams.set("status", params.status);
  if (params.orderType) searchParams.set("orderType", params.orderType);
  if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) searchParams.set("dateTo", params.dateTo);
  if (params.sortBy) searchParams.set("sortBy", params.sortBy);
  if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);

  const response = await fetch(`/api/customers?${searchParams.toString()}`, { signal });
  const result: CustomersResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch customers");
  }

  return {
    customers: result.data,
    pagination: result.pagination || {
      page: params.page || 1,
      limit: params.limit || 20,
      total: 0,
      totalPages: 0,
    },
  };
}

/**
 * Hook to fetch customers with filters and pagination
 * Uses React Query for automatic caching and refetching
 */
export function useCustomersQuery(params: CustomersQueryParams = {}) {
  const pathname = usePathname();
  const auth = useAuthOptional();
  const authReady = auth?.authReady ?? false;
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;

  const { enabled: enabledFromParams = true, ...queryParams } = params;

  const isOnCustomersRoute = pathname === "/dashboard/customers";
  const isAllowed = Boolean(authReady && sessionUser && permissions);
  const enabled = Boolean(isOnCustomersRoute && isAllowed && enabledFromParams);
  return useQuery({
    queryKey: queryKeys.customers.list(queryParams as Record<string, unknown>),
    queryFn: ({ signal }) => fetchCustomers(queryParams, signal),
    enabled,
    ...getCacheConfig(CacheTier.MEDIUM), // Customers list is medium frequency
  });
}
