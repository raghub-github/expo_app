"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AddPenaltyModal } from "./AddPenaltyModal";
import { AddAmountModal } from "./AddAmountModal";
import { useRiderAccessQuery } from "@/hooks/queries/useRiderAccessQuery";
import Link from "next/link";

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

export function RiderWalletClient() {
  const searchParams = useSearchParams();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPenaltyOpen, setAddPenaltyOpen] = useState(false);
  const [addAmountOpen, setAddAmountOpen] = useState(false);

  const { data: riderAccess } = useRiderAccessQuery();
  const canAddPenalty =
    (riderAccess?.canAddPenalty?.food ||
      riderAccess?.canAddPenalty?.parcel ||
      riderAccess?.canAddPenalty?.person_ride) ??
    false;

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
      if (isRiderId) {
        const id = value.replace(/^GMR/i, "");
        query = query.eq("id", parseInt(id, 10));
      } else if (isNumeric) {
        query = query.eq("id", parseInt(value, 10));
      } else if (isPhone) {
        query = query.eq("mobile", value.replace(/^\+?91/, ""));
      } else {
        query = query.ilike("mobile", `%${value}%`);
      }
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
      setError(err?.message || "Failed to load wallet");
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
        title="Wallet & Earnings"
        description="Use the search in the nav bar to select a rider. View balance, earnings by service, and penalties. Add penalty or view full wallet history."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
        actionButtons={
          <>
            <Link
              href={rider ? `/dashboard/riders/wallet-history?search=${rider.id}` : "/dashboard/riders/wallet-history"}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Wallet History
            </Link>
            <button
              type="button"
              onClick={() => setAddAmountOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              Add Amount
            </button>
            {canAddPenalty && (
              <button
                type="button"
                onClick={() => setAddPenaltyOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors shadow-sm"
              >
                Add Penalty
              </button>
            )}
          </>
        }
      />

      {rider && (
        <>
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5 relative">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Current Wallet</h2>
            {loading && !wallet ? (
              <LoadingSpinner size="sm" text="Loading wallet..." />
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
                      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Balance</span>
                        <p className={`text-lg font-bold mt-1 ${Number(wallet.totalBalance) < 0 ? "text-red-600" : "text-gray-900"}`}>₹{Number(wallet.totalBalance).toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Earnings (Food)</span><p className="font-semibold text-gray-900 mt-1">₹{Number(wallet.earningsFood).toFixed(2)}</p></div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Earnings (Parcel)</span><p className="font-semibold text-gray-900 mt-1">₹{Number(wallet.earningsParcel).toFixed(2)}</p></div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Earnings (Person Ride)</span><p className="font-semibold text-gray-900 mt-1">₹{Number(wallet.earningsPersonRide).toFixed(2)}</p></div>
                      <div className="rounded-xl border border-gray-100 bg-red-50/50 p-3"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Penalties (Food)</span><p className="font-semibold text-red-600 mt-1">₹{Number(wallet.penaltiesFood).toFixed(2)}</p></div>
                      <div className="rounded-xl border border-gray-100 bg-red-50/50 p-3"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Penalties (Parcel)</span><p className="font-semibold text-red-600 mt-1">₹{Number(wallet.penaltiesParcel).toFixed(2)}</p></div>
                      <div className="rounded-xl border border-gray-100 bg-red-50/50 p-3"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Penalties (Person Ride)</span><p className="font-semibold text-red-600 mt-1">₹{Number(wallet.penaltiesPersonRide).toFixed(2)}</p></div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Withdrawn</span><p className="font-semibold text-gray-900 mt-1">₹{Number(wallet.totalWithdrawn).toFixed(2)}</p></div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No wallet record. Balance will show as ₹0.00 until ledger entries exist.</p>
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
          <AddAmountModal
            riderId={rider.id}
            riderLabel={`GMR${rider.id} • ${rider.mobile}`}
            open={addAmountOpen}
            onClose={() => setAddAmountOpen(false)}
            onSuccess={() => {}}
          />
        </>
      )}
    </div>
  );
}
