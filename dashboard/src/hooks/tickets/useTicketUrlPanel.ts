"use client";

import { useSyncExternalStore, useCallback, useMemo } from "react";
import {
  readLocationSearch,
  subscribeLocationSearch,
} from "@/lib/navigation/history-location-sync";

export type TicketUrlPanel = "conversation" | "activities" | "csat";

function parsePanel(search: string): TicketUrlPanel {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("panel");
  if (q === "activities") return "activities";
  if (q === "csat") return "csat";
  return "conversation";
}

/**
 * Reads `?panel=activities|csat` from the URL without `useAppSearchParams()`, so the ticket
 * detail tree does not sit behind a Suspense boundary that can remount the whole page
 * when the query string updates.
 *
 * History notifications are deferred with `setTimeout(0)` so React never receives updates
 * synchronously from patched `history.replaceState` during `useInsertionEffect` (Next 16).
 */
export function useTicketUrlPanel(): TicketUrlPanel {
  const search = useSyncExternalStore(subscribeLocationSearch, readLocationSearch, () => "");
  return useMemo(() => parsePanel(search), [search]);
}

/** Raw `window.location.search` (including `?`) for building links without `useAppSearchParams()`. */
export function useTicketLocationSearch(): string {
  return useSyncExternalStore(subscribeLocationSearch, readLocationSearch, () => "");
}

export function useTicketPanelNavigation(pathname: string | null, router: { replace: (href: string, opts?: { scroll?: boolean }) => void }) {
  const setTicketPanel = useCallback(
    (next: TicketUrlPanel) => {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      if (next === "conversation") {
        params.delete("panel");
      } else {
        params.set("panel", next);
      }
      const base = pathname ?? "";
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router]
  );

  return setTicketPanel;
}
