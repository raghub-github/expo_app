"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import { ticketsPathTicketId } from "@/lib/tickets/ticket-path-utils";

type TicketsNavPendingContextValue = {
  /** Ticket id the user clicked before the App Router segment commits. */
  pendingTicketId: string | null;
  beginDetailNav: (ticketId: string | number) => void;
};

const TicketsNavPendingContext = createContext<TicketsNavPendingContextValue | null>(
  null
);

function cleanPathname(pathname: string): string {
  return pathname.split("?")[0].split("#")[0];
}

/**
 * Tracks in-flight ticket detail navigation so the workspace can show the detail
 * loading shell immediately on click — without waiting for the RSC segment swap
 * (which previously paired with null `loading.tsx` fallbacks and caused a blank frame).
 */
export function TicketsNavPendingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = useAppPathname();
  const clean = cleanPathname(pathname);
  const [pendingTicketId, setPendingTicketId] = useState<string | null>(null);

  useEffect(() => {
    const onPath = ticketsPathTicketId(clean);
    if (onPath != null) {
      setPendingTicketId(null);
      return;
    }
    if (clean === "/dashboard/tickets") {
      setPendingTicketId(null);
    }
  }, [clean]);

  useEffect(() => {
    const onPopState = () => {
      const path = cleanPathname(window.location.pathname);
      if (ticketsPathTicketId(path) == null) {
        setPendingTicketId(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const beginDetailNav = useCallback((ticketId: string | number) => {
    const id = String(ticketId).trim();
    if (!id) return;
    setPendingTicketId(id);
  }, []);

  const value = useMemo(
    () => ({ pendingTicketId, beginDetailNav }),
    [pendingTicketId, beginDetailNav]
  );

  return (
    <TicketsNavPendingContext.Provider value={value}>
      {children}
    </TicketsNavPendingContext.Provider>
  );
}

export function useTicketsNavPending(): TicketsNavPendingContextValue {
  const ctx = useContext(TicketsNavPendingContext);
  if (!ctx) {
    throw new Error("useTicketsNavPending must be used within TicketsNavPendingProvider");
  }
  return ctx;
}

export function useTicketsNavPendingOptional(): TicketsNavPendingContextValue | null {
  return useContext(TicketsNavPendingContext);
}
