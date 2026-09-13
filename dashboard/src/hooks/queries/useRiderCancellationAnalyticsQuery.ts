"use client";

import { useQuery } from "@tanstack/react-query";
import type { RiderCancellationAnalytics } from "@/lib/riders/rider-cancellation-analytics";

export type RiderCancellationAnalyticsResponse = RiderCancellationAnalytics & {
  success: boolean;
  riderId: number;
  period: { from: string | null; to: string | null };
  dataQuality: { unknownServiceOrders: number; reconciliationErrors: string[] };
};

export async function fetchRiderCancellationAnalytics(
  riderId: number,
  params: { from?: string; to?: string },
  signal?: AbortSignal
): Promise<RiderCancellationAnalyticsResponse> {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  const qs = search.toString();
  const response = await fetch(
    `/api/riders/${riderId}/cancellation-analytics${qs ? `?${qs}` : ""}`,
    { credentials: "include", cache: "no-store", signal }
  );
  const result = await response.json();
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || `Failed to fetch cancellation analytics: ${response.status}`);
  }
  return result as RiderCancellationAnalyticsResponse;
}

export function useRiderCancellationAnalyticsQuery(
  riderId: number | null,
  params: { from?: string; to?: string }
) {
  return useQuery({
    queryKey: ["rider", "cancellationAnalytics", riderId, params.from ?? "", params.to ?? ""],
    queryFn: ({ signal }) => fetchRiderCancellationAnalytics(riderId as number, params, signal),
    enabled: typeof riderId === "number" && riderId > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
