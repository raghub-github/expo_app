"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

export type MerchantsSearchStoreInfo = {
  storeId: number;
  name: string;
  store_id: string;
  full_address?: string | null;
  approval_status?: string | null;
  store_phones?: string[] | null;
};

export interface MerchantsSearchState {
  /** True while merchant child/parent search API is in flight (merchant portal). */
  isLoading: boolean;
  /** True after at least one search has completed for current params. */
  hasSearched: boolean;
  /** Single store when merchant portal child search returned exactly one store; null otherwise. */
  searchResultStore: MerchantsSearchStoreInfo | null;
  /** Current filter for the search (child vs parent). */
  filter: "child" | "parent";
}

const defaultState: MerchantsSearchState = {
  isLoading: false,
  hasSearched: false,
  searchResultStore: null,
  filter: "child",
};

/** Timestamp that changes on every Search click so same input still triggers refetch. */
export type MerchantsSearchTrigger = number;

/** Value + filter passed from header Search so fetch uses them before URL has updated. */
export type TriggeredSearch = { value: string; filter: "child" | "parent" } | null;

export interface MerchantsSearchContextValue extends MerchantsSearchState {
  setMerchantsSearchState: (state: MerchantsSearchState) => void;
  /** Increments on every header Search submit; use in effect deps to refetch even when URL search param unchanged. */
  lastSearchTrigger: MerchantsSearchTrigger;
  /** When Search is clicked, holds the normalized value and filter so fetch runs with them immediately (avoids stale URL). */
  triggeredSearch: TriggeredSearch;
  /** Call when user clicks Search in header (merchant form). Pass value + filter so new result loads on first click. */
  triggerMerchantSearch: (value: string, filter: "child" | "parent") => void;
  /** Clear triggered search after fetch has used it (when URL is in sync). */
  clearTriggeredSearch: () => void;
  /** True while Assign AM page is fetching parent/store search results; header Search button shows spinner when true. */
  assignAmSearchLoading: boolean;
  setAssignAmSearchLoading: (loading: boolean) => void;
}

const MerchantsSearchContext = createContext<MerchantsSearchContextValue | null>(null);

function stateShallowEqual(a: MerchantsSearchState, b: MerchantsSearchState): boolean {
  return (
    a.isLoading === b.isLoading &&
    a.hasSearched === b.hasSearched &&
    a.filter === b.filter &&
    a.searchResultStore === b.searchResultStore
  );
}

export function MerchantsSearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MerchantsSearchState>(defaultState);
  const [lastSearchTrigger, setLastSearchTrigger] = useState<MerchantsSearchTrigger>(0);
  const [triggeredSearch, setTriggeredSearch] = useState<TriggeredSearch>(null);
  const [assignAmSearchLoading, setAssignAmSearchLoading] = useState(false);
  const setMerchantsSearchState = useCallback((next: MerchantsSearchState) => {
    setState((prev) => (stateShallowEqual(prev, next) ? prev : next));
  }, []);
  const triggerMerchantSearch = useCallback((value: string, filter: "child" | "parent") => {
    setState((prev) => ({ ...prev, searchResultStore: null, isLoading: true }));
    setTriggeredSearch({ value, filter });
    setLastSearchTrigger((t) => t + 1);
  }, []);
  const clearTriggeredSearch = useCallback(() => setTriggeredSearch(null), []);
  const value = useMemo<MerchantsSearchContextValue>(
    () => ({
      ...state,
      setMerchantsSearchState,
      lastSearchTrigger,
      triggeredSearch,
      triggerMerchantSearch,
      clearTriggeredSearch,
      assignAmSearchLoading,
      setAssignAmSearchLoading,
    }),
    [
      state.isLoading,
      state.hasSearched,
      state.searchResultStore,
      state.filter,
      setMerchantsSearchState,
      lastSearchTrigger,
      triggeredSearch,
      triggerMerchantSearch,
      clearTriggeredSearch,
      assignAmSearchLoading,
      setAssignAmSearchLoading,
    ]
  );
  return (
    <MerchantsSearchContext.Provider value={value}>
      {children}
    </MerchantsSearchContext.Provider>
  );
}

export function useMerchantsSearch() {
  return useContext(MerchantsSearchContext);
}
