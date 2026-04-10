"use client";

import { useEffect } from "react";
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

function composePlaceholderFromSnapshot(): TicketComposeAutomationDto | undefined {
  const snap = loadClientSnapshot<{
    defaultTo?: string;
    defaultCc?: string;
    defaultBcc?: string;
    updatedAt?: string | null;
    updatedBySystemUserId?: number | null;
    updatedByEmail?: string | null;
    updatedByFullName?: string | null;
  }>(SNAPSHOT_KEY, 24 * 60 * 60 * 1000);
  if (!snap) return undefined;
  return {
    defaultTo: typeof snap.defaultTo === "string" ? snap.defaultTo : "",
    defaultCc: typeof snap.defaultCc === "string" ? snap.defaultCc : "",
    defaultBcc: typeof snap.defaultBcc === "string" ? snap.defaultBcc : "",
    updatedAt: snap.updatedAt ?? null,
    updatedBySystemUserId: typeof snap.updatedBySystemUserId === "number" ? snap.updatedBySystemUserId : null,
    updatedByEmail: typeof snap.updatedByEmail === "string" ? snap.updatedByEmail : null,
    updatedByFullName: typeof snap.updatedByFullName === "string" ? snap.updatedByFullName : null,
    canManage: false,
  };
}

export function useTicketComposeAutomationQuery() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    placeholderData: () => composePlaceholderFromSnapshot(),
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
    gcTime: 24 * 60 * 60 * 1000,
    /**
     * Do not use localStorage as initialData: server render has no snapshot, so the client would
     * hydrate with different DOM (fields + “Last updated”) and trip Next.js hydration errors.
     */
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
