"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { RiderListEntry, RiderSummary, RiderSummaryInfo } from "@/types/rider-dashboard";

export type RecentSectionId = "orders" | "withdrawals" | "tickets" | "penalties";

interface RiderDashboardState {
  riders: RiderListEntry[];
  riderSummary: RiderSummary | null;
  loading: boolean;
  summaryLoading: boolean;
  loadingSection: RecentSectionId | null;
  error: string | null;
  hasSearched: boolean;
  showDefault: boolean;
}

interface RiderDashboardContextValue extends RiderDashboardState {
  setRiders: (r: RiderListEntry[]) => void;
  setRiderSummary: (s: RiderSummary | null) => void;
  setLoading: (v: boolean) => void;
  setSummaryLoading: (v: boolean) => void;
  setLoadingSection: (v: RecentSectionId | null) => void;
  setError: (v: string | null) => void;
  setHasSearched: (v: boolean) => void;
  setShowDefault: (v: boolean) => void;

  /** Set current rider from search result (keeps rider across navigation). */
  setCurrentRiderFromSearch: (riders: RiderListEntry[], summary: RiderSummary | null) => void;
  /** Clear current rider (e.g. new search with empty query). */
  clearRider: () => void;

  /** Current rider id if one is selected; null otherwise. */
  currentRiderId: number | null;
  /** Minimal rider info for sub-pages (penalties, orders, etc.). */
  currentRiderInfo: RiderSummaryInfo | null;
}

const defaultState: RiderDashboardState = {
  riders: [],
  riderSummary: null,
  loading: false,
  summaryLoading: false,
  loadingSection: null,
  error: null,
  hasSearched: false,
  showDefault: true,
};

const RiderDashboardContext = createContext<RiderDashboardContextValue | null>(null);

function riderSummaryToInfo(summary: RiderSummary): RiderSummaryInfo {
  const r = summary.rider;
  return {
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    city: r.city,
    state: r.state,
    status: r.status,
    onboardingStage: r.onboardingStage,
    kycStatus: r.kycStatus,
  };
}

function riderListEntryToInfo(entry: RiderListEntry): RiderSummaryInfo {
  return {
    id: entry.id,
    name: entry.name,
    mobile: entry.mobile,
    city: entry.city,
    state: entry.state,
    status: entry.status,
    onboardingStage: entry.onboarding_stage,
    kycStatus: entry.kyc_status,
  };
}

export function RiderDashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RiderDashboardState>(defaultState);

  const setRiders = useCallback((riders: RiderListEntry[]) => {
    setState((s) => ({ ...s, riders }));
  }, []);
  const setRiderSummary = useCallback((riderSummary: RiderSummary | null) => {
    setState((s) => ({ ...s, riderSummary }));
  }, []);
  const setLoading = useCallback((loading: boolean) => {
    setState((s) => ({ ...s, loading }));
  }, []);
  const setSummaryLoading = useCallback((summaryLoading: boolean) => {
    setState((s) => ({ ...s, summaryLoading }));
  }, []);
  const setLoadingSection = useCallback((loadingSection: RecentSectionId | null) => {
    setState((s) => ({ ...s, loadingSection }));
  }, []);
  const setError = useCallback((error: string | null) => {
    setState((s) => ({ ...s, error }));
  }, []);
  const setHasSearched = useCallback((hasSearched: boolean) => {
    setState((s) => ({ ...s, hasSearched }));
  }, []);
  const setShowDefault = useCallback((showDefault: boolean) => {
    setState((s) => ({ ...s, showDefault }));
  }, []);

  const setCurrentRiderFromSearch = useCallback(
    (riders: RiderListEntry[], summary: RiderSummary | null) => {
      setState((s) => ({
        ...s,
        riders,
        riderSummary: summary,
        hasSearched: true,
        showDefault: false,
        error: null,
      }));
    },
    []
  );

  const clearRider = useCallback(() => {
    setState({
      ...defaultState,
      showDefault: true,
      hasSearched: false,
      riders: [],
      riderSummary: null,
    });
  }, []);

  // Single source of truth for "selected rider"
  // Prefer summary.rider.id (used by main rider card), fall back to first rider in list.
  const currentRiderId =
    (state.riderSummary?.rider as { id?: number } | null | undefined)?.id ??
    state.riders[0]?.id ??
    null;
  const currentRiderInfo = useMemo((): RiderSummaryInfo | null => {
    if (state.riderSummary) return riderSummaryToInfo(state.riderSummary);
    if (state.riders[0]) return riderListEntryToInfo(state.riders[0]);
    return null;
  }, [state.riderSummary, state.riders]);

  const value = useMemo<RiderDashboardContextValue>(
    () => ({
      ...state,
      setRiders,
      setRiderSummary,
      setLoading,
      setSummaryLoading,
      setLoadingSection,
      setError,
      setHasSearched,
      setShowDefault,
      setCurrentRiderFromSearch,
      clearRider,
      currentRiderId,
      currentRiderInfo,
    }),
    [
      state,
      setRiders,
      setRiderSummary,
      setLoading,
      setSummaryLoading,
      setLoadingSection,
      setError,
      setHasSearched,
      setShowDefault,
      setCurrentRiderFromSearch,
      clearRider,
      currentRiderId,
      currentRiderInfo,
    ]
  );

  return (
    <RiderDashboardContext.Provider value={value}>
      {children}
    </RiderDashboardContext.Provider>
  );
}

export function useRiderDashboard(): RiderDashboardContextValue {
  const ctx = useContext(RiderDashboardContext);
  if (!ctx) {
    throw new Error("useRiderDashboard must be used within RiderDashboardProvider");
  }
  return ctx;
}

/** Safe hook: returns null if outside provider (e.g. on a non-rider page). */
export function useRiderDashboardOptional(): RiderDashboardContextValue | null {
  return useContext(RiderDashboardContext);
}
