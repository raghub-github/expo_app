"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { riderSearchMatchesLoadedRider } from "@/lib/riders/resolve-rider-search";

export type ResolvedRiderSearchInfo = {
  id: number;
  name: string | null;
  mobile: string;
  city?: string | null;
  state?: string | null;
  status?: string;
  onboardingStage?: string;
  kycStatus?: string;
};

function normalizePhone(value: string): string {
  return value.replace(/^\+?91/, "").replace(/\D/g, "");
}

function searchMatchesRider(search: string, rider: ResolvedRiderSearchInfo): boolean {
  return riderSearchMatchesLoadedRider(search, rider);
}

/**
 * Resolve rider from ?search= without redundant Supabase calls when the rider
 * is already in RiderDashboardContext (e.g. switching Activity Logs → Orders).
 */
export function useResolvedRiderSearch() {
  const searchParams = useAppSearchParams();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const hasSearch = Boolean(searchValue);

  const [rider, setRider] = useState<ResolvedRiderSearchInfo | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const riderFromContext = useMemo((): ResolvedRiderSearchInfo | null => {
    const info = riderContext?.currentRiderInfo;
    if (!info) return null;
    return {
      id: info.id,
      name: info.name,
      mobile: info.mobile,
      city: info.city,
      state: info.state,
      status: info.status,
      onboardingStage: info.onboardingStage,
      kycStatus: info.kycStatus,
    };
  }, [riderContext?.currentRiderInfo]);

  const resolveFromSupabase = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setError(null);
      return;
    }

    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");

      let query = supabase
        .from("riders")
        .select(
          "id, name, mobile, city, state, status, onboarding_stage, kyc_status"
        );

      const isRiderId = /^GMR(\d+)$/i.test(value);
      const isNumeric = /^\d{1,9}$/.test(value);
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));

      if (isRiderId) {
        query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      } else if (isNumeric) {
        query = query.eq("id", parseInt(value, 10));
      } else if (isPhone) {
        query = query.eq("mobile", value.replace(/^\+?91/, ""));
      } else {
        query = query.ilike("mobile", `%${value}%`);
      }

      const { data, error: supabaseError } = await query.limit(1).maybeSingle();
      if (supabaseError) throw supabaseError;
      if (!data) {
        setRider(null);
        setError("No rider found");
        return;
      }

      setRider({
        id: data.id,
        name: data.name,
        mobile: data.mobile,
        city: data.city,
        state: data.state,
        status: data.status,
        onboardingStage: data.onboarding_stage,
        kycStatus: data.kyc_status,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve rider");
      setRider(null);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSearch) {
      if (riderFromContext) {
        setRider(riderFromContext);
        setError(null);
      } else {
        setRider(null);
        setError(null);
      }
      setResolveLoading(false);
      return;
    }

    if (riderFromContext && searchMatchesRider(searchValue, riderFromContext)) {
      setRider(riderFromContext);
      setError(null);
      setResolveLoading(false);
      return;
    }

    void resolveFromSupabase(searchValue);
  }, [hasSearch, searchValue, riderFromContext, resolveFromSupabase]);

  return {
    rider,
    resolveLoading,
    error,
    hasSearch,
    searchValue,
    riderFromContext,
  };
}
