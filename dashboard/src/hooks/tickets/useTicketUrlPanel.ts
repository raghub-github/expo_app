"use client";

import { useSyncExternalStore, useCallback, useMemo } from "react";

export type TicketUrlPanel = "conversation" | "activities" | "csat";

function parsePanel(search: string): TicketUrlPanel {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("panel");
  if (q === "activities") return "activities";
  if (q === "csat") return "csat";
  return "conversation";
}

let locationSearchListeners = new Set<() => void>();
let historyPatched = false;
/** Pending macrotask so we coalesce multiple push/replace in one frame. */
let notifyTimeout: ReturnType<typeof setTimeout> | null = null;

function flushLocationSearchListeners() {
  notifyTimeout = null;
  const fns = Array.from(locationSearchListeners);
  for (const fn of fns) {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function notifyLocationSearchListeners() {
  if (typeof window === "undefined") return;
  if (notifyTimeout != null) return;
  notifyTimeout = window.setTimeout(flushLocationSearchListeners, 0);
}

function patchHistoryForSearchSync() {
  if (typeof window === "undefined" || historyPatched) return;
  historyPatched = true;
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    origPush(...args);
    notifyLocationSearchListeners();
  };
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    origReplace(...args);
    notifyLocationSearchListeners();
  };
  window.addEventListener("popstate", notifyLocationSearchListeners);
}

function getSearchSnapshot(): string {
  return typeof window !== "undefined" ? window.location.search : "";
}

function getServerSearchSnapshot(): string {
  return "";
}

function subscribeSearch(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  patchHistoryForSearchSync();
  locationSearchListeners.add(onStoreChange);
  return () => {
    locationSearchListeners.delete(onStoreChange);
  };
}

/**
 * Reads `?panel=activities|csat` from the URL without `useSearchParams()`, so the ticket
 * detail tree does not sit behind a Suspense boundary that can remount the whole page
 * when the query string updates.
 *
 * History notifications are deferred with `setTimeout(0)` so React never receives updates
 * synchronously from patched `history.replaceState` during `useInsertionEffect` (Next 16).
 */
export function useTicketUrlPanel(): TicketUrlPanel {
  const search = useSyncExternalStore(subscribeSearch, getSearchSnapshot, getServerSearchSnapshot);
  return useMemo(() => parsePanel(search), [search]);
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
