"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";

/** Message thrown when the API returns 401 (session expired). Used for no-retry and UI. */
export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again to continue.";

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
  data?: ServicePoint[] | ServicePoint | { message: string; id: number };
  error?: string;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!contentType.includes("application/json") || !text.trim()) {
    throw new Error(response.ok ? "Empty response" : `Server error (${response.status}). Please try again.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid response from server. Please try again.");
  }
}

const FETCH_TIMEOUT_MS = 20000; // 20s so slow DB doesn't hang the UI

async function fetchServicePoints(): Promise<ServicePoint[]> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch("/api/service-points", {
      credentials: "include",
      signal: ac.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 401) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    const result = await parseJsonResponse<ServicePointsResponse>(response);

    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to fetch service points");
    }

    const data = result.data;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. Please refresh the page.");
    }
    throw err;
  }
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
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) return false;
      // Retry on network errors (e.g. "Failed to fetch", connection refused, timeout)
      if (error instanceof Error && (error.message === "Failed to fetch" || error.name === "TypeError")) {
        return failureCount < 3;
      }
      return failureCount < 1;
    },
    retryDelay: (attemptIndex) => Math.min(800 * 2 ** attemptIndex, 5000),
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
  let response: Response;
  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    response = await fetch("/api/service-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
  } catch (error) {
    // Network error (failed to fetch, CORS, timeout, etc.)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error("Request timed out. Please try again.");
    }
    throw new Error(
      error instanceof Error 
        ? `Network error: ${error.message}` 
        : "Failed to connect to server. Please check your internet connection and try again."
    );
  }

  // Check if response is ok before parsing
  if (!response.ok) {
    let errorMessage = `Server error: ${response.status} ${response.statusText}`;
    try {
      const errorResult = await response.json();
      errorMessage = errorResult.error || errorMessage;
    } catch {
      // If response is not JSON, use status text
    }
    throw new Error(errorMessage);
  }

  let result: ServicePointsResponse;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("Invalid response from server. Please try again.");
  }

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to create service point");
  }

  // Handle different response formats
  if (Array.isArray(result.data)) {
    return result.data[0] as ServicePoint;
  } else if ('id' in result.data && 'latitude' in result.data) {
    return result.data as ServicePoint;
  } else {
    throw new Error("Unexpected response format from server");
  }
}

async function updateServicePoint(input: UpdateServicePointInput): Promise<ServicePoint> {
  let response: Response;
  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    response = await fetch("/api/service-points", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
  } catch (error) {
    // Network error (failed to fetch, CORS, timeout, etc.)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error("Request timed out. Please try again.");
    }
    throw new Error(
      error instanceof Error 
        ? `Network error: ${error.message}` 
        : "Failed to connect to server. Please check your internet connection and try again."
    );
  }

  // Check if response is ok before parsing
  if (!response.ok) {
    let errorMessage = `Server error: ${response.status} ${response.statusText}`;
    try {
      const errorResult = await response.json();
      errorMessage = errorResult.error || errorMessage;
    } catch {
      // If response is not JSON, use status text
    }
    throw new Error(errorMessage);
  }

  let result: ServicePointsResponse;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("Invalid response from server. Please try again.");
  }

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to update service point");
  }

  // Handle different response formats
  if (Array.isArray(result.data)) {
    return result.data[0] as ServicePoint;
  } else if ('id' in result.data && 'latitude' in result.data) {
    return result.data as ServicePoint;
  } else {
    throw new Error("Unexpected response format from server");
  }
}

async function deleteServicePoint(id: number): Promise<void> {
  let response: Response;
  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    response = await fetch(`/api/service-points?id=${id}`, {
      method: "DELETE",
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
  } catch (error) {
    // Network error (failed to fetch, CORS, timeout, etc.)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error("Request timed out. Please try again.");
    }
    throw new Error(
      error instanceof Error 
        ? `Network error: ${error.message}` 
        : "Failed to connect to server. Please check your internet connection and try again."
    );
  }

  // Check if response is ok before parsing
  if (!response.ok) {
    let errorMessage = `Server error: ${response.status} ${response.statusText}`;
    try {
      const errorResult = await response.json();
      errorMessage = errorResult.error || errorMessage;
    } catch {
      // If response is not JSON, use status text
    }
    throw new Error(errorMessage);
  }

  let result: ServicePointsResponse;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("Invalid response from server. Please try again.");
  }

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
      // Use refetchQueries to ensure data is fresh before UI updates
      queryClient.invalidateQueries({ queryKey: queryKeys.servicePoints.list() });
      // Also explicitly refetch to ensure data is loaded
      queryClient.refetchQueries({ queryKey: queryKeys.servicePoints.list() });
    },
    onError: (error) => {
      // Log error for debugging
      console.error("Failed to create service point:", error);
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
      // Use refetchQueries to ensure data is fresh before UI updates
      queryClient.invalidateQueries({ queryKey: queryKeys.servicePoints.list() });
      // Also explicitly refetch to ensure data is loaded
      queryClient.refetchQueries({ queryKey: queryKeys.servicePoints.list() });
    },
    onError: (error) => {
      // Log error for debugging
      console.error("Failed to delete service point:", error);
    },
  });
}
