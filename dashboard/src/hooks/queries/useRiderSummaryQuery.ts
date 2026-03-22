"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, type RiderSummaryParams } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";
import type { RiderSummary } from "@/types/rider-dashboard";
import { usePathname } from "next/navigation";
import { useAuthOptional } from "@/providers/AuthProvider";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

async function fetchRiderSummary(
  riderId: number,
  params: RiderSummaryParams,
  signal?: AbortSignal
): Promise<RiderSummary> {
  const searchParams = new URLSearchParams();
  searchParams.set("ordersLimit", String(params.ordersLimit));
  searchParams.set("withdrawalsLimit", String(params.withdrawalsLimit));
  searchParams.set("ticketsLimit", String(params.ticketsLimit));
  searchParams.set("penaltiesLimit", String(params.penaltiesLimit));
  if (params.ordersFrom) searchParams.set("ordersFrom", params.ordersFrom);
  if (params.ordersTo) searchParams.set("ordersTo", params.ordersTo);
  if (params.ordersOrderType && params.ordersOrderType !== "all") searchParams.set("ordersOrderType", params.ordersOrderType);
  if (params.ordersStatus && params.ordersStatus !== "all") searchParams.set("ordersStatus", params.ordersStatus);
  if (params.ordersOrderId && params.ordersOrderId.trim() !== "") searchParams.set("ordersOrderId", params.ordersOrderId.trim());
  if (params.withdrawalsFrom) searchParams.set("withdrawalsFrom", params.withdrawalsFrom);
  if (params.withdrawalsTo) searchParams.set("withdrawalsTo", params.withdrawalsTo);
  if (params.ticketsFrom) searchParams.set("ticketsFrom", params.ticketsFrom);
  if (params.ticketsTo) searchParams.set("ticketsTo", params.ticketsTo);
  if (params.ticketsStatus && params.ticketsStatus !== "all") searchParams.set("ticketsStatus", params.ticketsStatus);
  if (params.ticketsCategory && params.ticketsCategory !== "all") searchParams.set("ticketsCategory", params.ticketsCategory);
  if (params.ticketsPriority && params.ticketsPriority !== "all") searchParams.set("ticketsPriority", params.ticketsPriority);
  if (params.penaltiesFrom) searchParams.set("penaltiesFrom", params.penaltiesFrom);
  if (params.penaltiesTo) searchParams.set("penaltiesTo", params.penaltiesTo);
  if (params.penaltiesStatus && params.penaltiesStatus !== "all") searchParams.set("penaltiesStatus", params.penaltiesStatus);
  if (params.penaltiesServiceType && params.penaltiesServiceType !== "all") searchParams.set("penaltiesServiceType", params.penaltiesServiceType);
  if (params.penaltiesOrderId && params.penaltiesOrderId.trim() !== "") searchParams.set("penaltiesOrderId", params.penaltiesOrderId.trim());

  const response = await fetch(
    `/api/riders/${riderId}/summary?${searchParams.toString()}`,
    { credentials: "include", cache: "no-store", signal }
  );
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Failed to fetch rider summary: ${response.status}`);
  }
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch rider summary");
  }

  return result.data as RiderSummary;
}

/**
 * TanStack Query hook for rider summary (orders, withdrawals, tickets, penalties, etc.).
 * Caches by riderId + filter params. Disabled when riderId is null.
 */
export function useRiderSummaryQuery(
  riderId: number | null,
  params: RiderSummaryParams
) {
  const cacheConfig = getCacheConfig(CacheTier.MEDIUM);
  const pathname = usePathname();
  const auth = useAuthOptional();
  const authReady = auth?.authReady ?? false;
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;

  const isOnRidersRoute = pathname === "/dashboard/riders";
  const enabled = isOnRidersRoute && riderId != null && riderId > 0 && Boolean(authReady && sessionUser && permissions);

  const SNAPSHOT_TTL_MS = 10_000;
  const snapshotKey = useMemo(() => {
    if (!enabled) return null;
    return `dashboard_snapshot:rider_summary:${pathname}:${riderId}:${JSON.stringify(params)}`;
  }, [enabled, pathname, riderId, params]);

  const initialSnapshot = useMemo(() => {
    if (!snapshotKey) return null;
    return loadClientSnapshot<RiderSummary>(snapshotKey, SNAPSHOT_TTL_MS);
  }, [snapshotKey]);

  const query = useQuery({
    queryKey: queryKeys.rider.summary(riderId, params),
    queryFn: ({ signal }) => fetchRiderSummary(riderId!, params, signal),
    enabled,
    ...(initialSnapshot !== null ? { initialData: initialSnapshot } : {}),
    ...cacheConfig,
    // Refetch when mounting so invalidated cache (e.g. after penalty/revert on another route) updates UI
    refetchOnMount: true,
    // Keep previous summary visible while refetching (filters/rider change) for smooth UX
    placeholderData: (previousData) => previousData,
    retry: (failureCount, error) => {
      if (error instanceof Error) {
        if (error.message.includes("404") || error.message.includes("403")) return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
  });

  useEffect(() => {
    if (!snapshotKey || !query.data) return;
    saveClientSnapshot(snapshotKey, query.data);
  }, [snapshotKey, query.data]);

  return query;
}
