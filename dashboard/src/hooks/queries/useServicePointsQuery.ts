"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";

export interface ServicePoint {
  id: number;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  address?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ServicePointsResponse {
  success: boolean;
  data?: ServicePoint[];
  error?: string;
}

async function fetchServicePoints(): Promise<ServicePoint[]> {
  const response = await fetch("/api/service-points");
  const result: ServicePointsResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch service points");
  }

  return result.data;
}

/**
 * Hook to fetch all service points
 * Uses React Query for automatic caching and refetching
 */
export function useServicePointsQuery() {
  // #region agent log
  const queryCallTime = Date.now();
  fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useServicePointsQuery.ts:25',message:'useServicePointsQuery called',data:{queryCallTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  const query = useQuery({
    queryKey: queryKeys.servicePoints.list(),
    queryFn: async () => {
      // #region agent log
      const fetchStartTime = Date.now();
      fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useServicePointsQuery.ts:30',message:'Starting service points fetch',data:{fetchStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const result = await fetchServicePoints();
      
      // #region agent log
      const fetchEndTime = Date.now();
      const fetchDuration = fetchEndTime - fetchStartTime;
      fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useServicePointsQuery.ts:35',message:'Service points fetch completed',data:{fetchDuration,resultCount:result.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      return result;
    },
    ...getCacheConfig(CacheTier.STATIC), // Service points are static data
  });
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useServicePointsQuery.ts:45',message:'Query state changed',data:{isLoading:query.isLoading,isFetching:query.isFetching,isStale:query.isStale,dataUpdatedAt:query.dataUpdatedAt,status:query.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [query.isLoading, query.isFetching, query.isStale, query.status]);
  // #endregion
  
  return query;
}

interface CreateServicePointInput {
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  address?: string;
}

interface UpdateServicePointInput {
  id: number;
  name?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  is_active?: boolean;
}

async function createServicePoint(input: CreateServicePointInput): Promise<ServicePoint> {
  const response = await fetch("/api/service-points", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const result: ServicePointsResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to create service point");
  }

  return Array.isArray(result.data) ? result.data[0] : result.data as any;
}

async function updateServicePoint(input: UpdateServicePointInput): Promise<ServicePoint> {
  const response = await fetch("/api/service-points", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const result: ServicePointsResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to update service point");
  }

  return Array.isArray(result.data) ? result.data[0] : result.data as any;
}

async function deleteServicePoint(id: number): Promise<void> {
  const response = await fetch(`/api/service-points?id=${id}`, {
    method: "DELETE",
  });

  const result: ServicePointsResponse = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to delete service point");
  }
}

/**
 * Hook to create a new service point
 * Automatically invalidates and refetches the service points list
 */
export function useCreateServicePoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createServicePoint,
    onSuccess: () => {
      // Invalidate and refetch service points list
      queryClient.invalidateQueries({ queryKey: queryKeys.servicePoints.list() });
    },
  });
}

/**
 * Hook to update a service point
 * Automatically invalidates and refetches the service points list
 */
export function useUpdateServicePoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateServicePoint,
    onSuccess: () => {
      // Invalidate and refetch service points list
      queryClient.invalidateQueries({ queryKey: queryKeys.servicePoints.list() });
    },
  });
}

/**
 * Hook to delete a service point
 * Automatically invalidates and refetches the service points list
 */
export function useDeleteServicePoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteServicePoint,
    onSuccess: () => {
      // Invalidate and refetch service points list
      queryClient.invalidateQueries({ queryKey: queryKeys.servicePoints.list() });
    },
  });
}
