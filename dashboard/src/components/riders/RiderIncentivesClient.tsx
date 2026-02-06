"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { Gift, Zap } from "lucide-react";
import Link from "next/link";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

export function RiderIncentivesClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      return;
    }
    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");
      let query = supabase.from("riders").select("id, name, mobile");
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));
      const isRiderId = /^GMR(\d+)$/i.test(value);
      const isNumeric = /^\d{1,9}$/.test(value);
      if (isRiderId) query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      else if (isNumeric) query = query.eq("id", parseInt(value, 10));
      else if (isPhone) query = query.eq("mobile", value.replace(/^\+?91/, ""));
      else query = query.ilike("mobile", `%${value}%`);
      const { data, error: e } = await query.limit(1).single();
      if (e || !data) {
        setRider(null);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve rider");
      setRider(null);
    } finally {
      setResolveLoading(false);
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
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);

  const hasSearch = searchValue.length > 0;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Incentives & Surges"
        description="Use the search in the nav bar to select a rider. Incentives and surge data appear here when available."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
      />

      {rider && (
        <div className="rounded-2xl border border-gray-200/90 bg-white p-6 sm:p-8 shadow-sm ring-1 ring-gray-900/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-amber-50 to-orange-50/80 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
                <Gift className="h-5 w-5" />
                Incentives & Bonuses
              </div>
              <p className="text-sm text-gray-600 mb-3">Earnings from incentives and bonuses for this rider will appear here when data is available.</p>
              <p className="text-xs text-gray-500">Check wallet history for bonus and referral credits.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-violet-50 to-purple-50/80 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-violet-800 mb-2">
                <Zap className="h-5 w-5" />
                Surges & Offers
              </div>
              <p className="text-sm text-gray-600 mb-3">Surge pricing and special offers applied to this rider&apos;s orders will appear here when data is available.</p>
              <p className="text-xs text-gray-500">Order-level surge and offer details can be viewed in the Orders section.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/dashboard/riders/orders?search=${rider.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              View Orders
            </Link>
            <Link
              href={`/dashboard/riders/wallet?search=${rider.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              View Wallet & Earnings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
