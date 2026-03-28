"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

export type TicketComposeAutomationDto = {
  defaultTo: string;
  defaultCc: string;
  defaultBcc: string;
  updatedAt?: string | null;
};

const QUERY_KEY = ["ticketComposeAutomation"] as const;

const SNAPSHOT_KEY = "dashboard_snapshot:ticketComposeAutomation";
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function useTicketComposeAutomationQuery() {
  const initialSnapshot = useMemo(
    () => loadClientSnapshot<TicketComposeAutomationDto>(SNAPSHOT_KEY, SNAPSHOT_TTL_MS),
    []
  );

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<TicketComposeAutomationDto> => {
      const res = await fetch("/api/tickets/compose-automation", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const d = json?.data;
      return {
        defaultTo: typeof d?.defaultTo === "string" ? d.defaultTo : "",
        defaultCc: typeof d?.defaultCc === "string" ? d.defaultCc : "",
        defaultBcc: typeof d?.defaultBcc === "string" ? d.defaultBcc : "",
        updatedAt: d?.updatedAt ?? null,
      };
    },
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
    initialData: initialSnapshot ?? undefined,
    initialDataUpdatedAt: initialSnapshot != null ? 0 : undefined,
  });

  useEffect(() => {
    if (query.data) saveClientSnapshot(SNAPSHOT_KEY, query.data);
  }, [query.data]);

  return query;
}

export function useTicketComposeAutomationSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { defaultTo: string; defaultCc: string; defaultBcc: string }) => {
      const res = await fetch("/api/tickets/compose-automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Save failed");
      const d = json?.data;
      return {
        defaultTo: String(d?.defaultTo ?? ""),
        defaultCc: String(d?.defaultCc ?? ""),
        defaultBcc: String(d?.defaultBcc ?? ""),
        updatedAt: d?.updatedAt ?? null,
      } satisfies TicketComposeAutomationDto;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });
}

export function invalidateTicketComposeAutomation(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}
