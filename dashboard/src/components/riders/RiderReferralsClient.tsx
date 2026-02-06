"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { UserPlus, Hash, User } from "lucide-react";
import Link from "next/link";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface RiderDetailResponse {
  rider: {
    id: number;
    name: string | null;
    mobile: string;
    referralCode: string | null;
    referredBy: number | null;
  };
}

export function RiderReferralsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState<number | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setReferralCode(null);
      setReferredBy(null);
      return;
    }
    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");
      let query = supabase.from("riders").select("id, name, mobile");
      const isRiderId = /^GMR(\d+)$/i.test(value);
      const isNumeric = /^\d{1,9}$/.test(value);
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));
      if (isRiderId) query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      else if (isNumeric) query = query.eq("id", parseInt(value, 10));
      else if (isPhone) query = query.eq("mobile", value.replace(/^\+?91/, ""));
      else query = query.ilike("mobile", `%${value}%`);
      const { data, error: e } = await query.limit(1).single();
      if (e || !data) {
        setRider(null);
        setReferralCode(null);
        setReferredBy(null);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve rider");
      setRider(null);
      setReferralCode(null);
      setReferredBy(null);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchRiderDetail = useCallback(async (riderId: number) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/riders/${riderId}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load rider");
      const data = json.data as RiderDetailResponse;
      setReferralCode(data.rider?.referralCode ?? null);
      setReferredBy(data.rider?.referredBy ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load referral data");
      setReferralCode(null);
      setReferredBy(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const riderFromContext = riderContext?.currentRiderInfo
    ? { id: riderContext.currentRiderInfo.id, name: riderContext.currentRiderInfo.name, mobile: riderContext.currentRiderInfo.mobile }
    : null;

  useEffect(() => setSearchInput(searchValue), [searchValue]);
  useEffect(() => {
    if (searchValue) resolveRider(searchValue);
    else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setReferralCode(null);
      setReferredBy(null);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);
  useEffect(() => {
    if (rider) fetchRiderDetail(rider.id);
  }, [rider, fetchRiderDetail]);

  const hasSearch = searchValue.length > 0;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Referral Data"
        description="Use the search in the nav bar to select a rider. View referral code and referred-by information."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
      />
      {rider && (
        <>
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5 relative">
            {detailLoading && referralCode == null && referredBy == null ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="md" text="Loading referral data..." />
              </div>
            ) : (
              <>
                {detailLoading && (referralCode != null || referredBy != null) && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10 rounded-t-2xl overflow-hidden">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div className={`transition-opacity duration-200 ${detailLoading && (referralCode != null || referredBy != null) ? "opacity-70 pointer-events-none" : ""}`}>
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-600" />
                Referral Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
                    <Hash className="h-4 w-4" />
                    Referral Code
                  </div>
                  <p className="text-lg font-bold text-gray-900 font-mono">{referralCode || "—"}</p>
                  <p className="text-xs text-gray-500 mt-1">Other users can use this code when signing up to refer this rider.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
                    <User className="h-4 w-4" />
                    Referred By
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {referredBy != null ? (
                      <Link href={`/dashboard/riders?search=${referredBy}`} className="text-blue-600 hover:underline">
                        GMR{referredBy}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Rider ID of the referrer, if any.</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4">Referral history and list of referred riders can be expanded when data is available.</p>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
