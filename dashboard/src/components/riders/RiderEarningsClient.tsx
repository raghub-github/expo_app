"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AddPenaltyModal } from "./AddPenaltyModal";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface WalletInfo {
  totalBalance: string;
  earningsFood: string;
  earningsParcel: string;
  earningsPersonRide: string;
  penaltiesFood: string;
  penaltiesParcel: string;
  penaltiesPersonRide: string;
  totalWithdrawn: string;
}

export function RiderEarningsClient() {
  const searchParams = useSearchParams();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPenaltyOpen, setAddPenaltyOpen] = useState(false);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setWallet(null);
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
        setWallet(null);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: any) {
      setError(err?.message || "Failed to resolve rider");
      setRider(null);
      setWallet(null);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchWallet = useCallback(async (riderId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/riders/${riderId}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");
      setWallet(json.data.wallet ? {
        totalBalance: json.data.wallet.totalBalance,
        earningsFood: json.data.wallet.earningsFood,
        earningsParcel: json.data.wallet.earningsParcel,
        earningsPersonRide: json.data.wallet.earningsPersonRide,
        penaltiesFood: json.data.wallet.penaltiesFood,
        penaltiesParcel: json.data.wallet.penaltiesParcel,
        penaltiesPersonRide: json.data.wallet.penaltiesPersonRide,
        totalWithdrawn: json.data.wallet.totalWithdrawn,
      } : null);
    } catch (err: any) {
      setError(err?.message || "Failed to load");
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const riderFromContext = riderContext?.currentRiderInfo
    ? { id: riderContext.currentRiderInfo.id, name: riderContext.currentRiderInfo.name, mobile: riderContext.currentRiderInfo.mobile }
    : null;

  useEffect(() => {
    if (searchValue) resolveRider(searchValue);
    else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setWallet(null);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);

  useEffect(() => {
    if (rider) fetchWallet(rider.id);
  }, [rider, fetchWallet]);

  const hasSearch = searchValue.length > 0;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Earnings"
        description="Use the search in the nav bar to select a rider. View earnings by service and add penalty if needed."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
        actionButtons={
          rider ? (
            <button
              type="button"
              onClick={() => setAddPenaltyOpen(true)}
              className="inline-flex items-center px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
            >
              Add Penalty
            </button>
          ) : null
        }
      />

      {rider && (
        <>
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 shadow-sm ring-1 ring-gray-900/5 relative">
            {loading && !wallet ? (
              <LoadingSpinner size="sm" text="Loading..." />
            ) : (
              <>
                {loading && wallet && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10 rounded-t-2xl overflow-hidden">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div className={`transition-opacity duration-200 ${loading && wallet ? "opacity-70 pointer-events-none" : ""}`}>
                {wallet ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><span className="text-gray-500">Earnings (Food)</span><p className="font-semibold text-green-700">₹{Number(wallet.earningsFood).toFixed(2)}</p></div>
                <div><span className="text-gray-500">Earnings (Parcel)</span><p className="font-semibold text-green-700">₹{Number(wallet.earningsParcel).toFixed(2)}</p></div>
                <div><span className="text-gray-500">Earnings (Person Ride)</span><p className="font-semibold text-green-700">₹{Number(wallet.earningsPersonRide).toFixed(2)}</p></div>
                <div><span className="text-gray-500">Total Balance</span><p className={`font-bold ${Number(wallet.totalBalance) < 0 ? "text-red-600" : "text-gray-900"}`}>₹{Number(wallet.totalBalance).toFixed(2)}</p></div>
                <div><span className="text-gray-500">Penalties (Food)</span><p className="font-semibold text-red-600">₹{Number(wallet.penaltiesFood).toFixed(2)}</p></div>
                <div><span className="text-gray-500">Penalties (Parcel)</span><p className="font-semibold text-red-600">₹{Number(wallet.penaltiesParcel).toFixed(2)}</p></div>
                <div><span className="text-gray-500">Penalties (Person Ride)</span><p className="font-semibold text-red-600">₹{Number(wallet.penaltiesPersonRide).toFixed(2)}</p></div>
                <div><span className="text-gray-500">Total Withdrawn</span><p className="font-semibold">₹{Number(wallet.totalWithdrawn).toFixed(2)}</p></div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No wallet record.</p>
            )}
                </div>
              </>
            )}
          </div>

          <AddPenaltyModal
            riderId={rider.id}
            riderLabel={`GMR${rider.id} • ${rider.mobile}`}
            open={addPenaltyOpen}
            onClose={() => setAddPenaltyOpen(false)}
            onSuccess={() => fetchWallet(rider.id)}
          />
        </>
      )}
    </div>
  );
}
