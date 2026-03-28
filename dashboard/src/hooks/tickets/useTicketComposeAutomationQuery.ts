"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

export type TicketComposeAutomationDto = {
  defaultTo: string;
  defaultCc: string;
  defaultBcc: string;
  updatedAt?: string | null;
  updatedBySystemUserId?: number | null;
  updatedByEmail?: string | null;
  updatedByFullName?: string | null;
  /** Super admins may save; others see global values read-only */
  canManage?: boolean;
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
        updatedBySystemUserId: typeof d?.updatedBySystemUserId === "number" ? d.updatedBySystemUserId : null,
        updatedByEmail: typeof d?.updatedByEmail === "string" ? d.updatedByEmail : null,
        updatedByFullName: typeof d?.updatedByFullName === "string" ? d.updatedByFullName : null,
        canManage: d?.canManage === true,
      };
    },
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
    initialData: initialSnapshot ?? undefined,
    initialDataUpdatedAt: initialSnapshot != null ? 0 : undefined,
  });

  useEffect(() => {
    if (!query.data) return;
    const { canManage: _omit, ...persist } = query.data;
    saveClientSnapshot(SNAPSHOT_KEY, persist);
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
        updatedBySystemUserId: typeof d?.updatedBySystemUserId === "number" ? d.updatedBySystemUserId : null,
        updatedByEmail: typeof d?.updatedByEmail === "string" ? d.updatedByEmail : null,
        updatedByFullName: typeof d?.updatedByFullName === "string" ? d.updatedByFullName : null,
        canManage: d?.canManage === true,
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
