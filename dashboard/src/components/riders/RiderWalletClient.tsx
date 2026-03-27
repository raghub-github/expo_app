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
import { useGetRiderDetailsQuery, useGetRiderLedgerQuery } from "@/store/api/riderApi";
import Link from "next/link";
import { History, PlusCircle, AlertCircle } from "lucide-react";

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

interface LedgerRow {
  id: number;
  entryType: string;
  amount: string;
  balance: string | null;
  serviceType: string | null;
  createdAt: string;
}

interface OnboardingPaymentRow {
  id: number;
  amount: string;
  provider: string;
  refId: string;
  status: string;
  createdAt: string;
}

export function RiderWalletClient() {
  const searchParams = useSearchParams();
  const riderContext = useRiderDashboardOptional();
  const riderFromContext = riderContext?.currentRiderInfo
    ? {
        id: riderContext.currentRiderInfo.id,
        name: riderContext.currentRiderInfo.name,
        mobile: riderContext.currentRiderInfo.mobile,
      }
    : null;
  const searchValue = (searchParams.get("search") || "").trim();

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPenaltyOpen, setAddPenaltyOpen] = useState(false);
  const [addAmountOpen, setAddAmountOpen] = useState(false);
  const [recentLedger, setRecentLedger] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [onboardingPayments, setOnboardingPayments] = useState<OnboardingPaymentRow[]>([]);

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

  const riderId = rider?.id ?? riderFromContext?.id ?? null;

  const {
    data: riderDetails,
    isLoading: riderDetailsLoading,
    isFetching: riderDetailsFetching,
    error: riderDetailsError,
    refetch: refetchRiderDetails,
  } = useGetRiderDetailsQuery(riderId as number, {
    skip: riderId == null,
  } as any);

  const {
    data: ledgerData,
    isLoading: ledgerQueryLoading,
    isFetching: ledgerQueryFetching,
    refetch: refetchLedger,
  } = useGetRiderLedgerQuery(
    riderId ? { riderId, filters: { limit: 15 } } : ({ riderId: 0 } as any),
    {
      skip: riderId == null,
    } as any
  );

  useEffect(() => {
    if (searchValue) {
      resolveRider(searchValue);
    } else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setWallet(null);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);

  useEffect(() => {
    if (!riderId || !riderDetails) {
      setWallet(null);
      setOnboardingPayments([]);
      return;
    }
    if (riderDetails.wallet) {
      setWallet({
        totalBalance: riderDetails.wallet.totalBalance,
        earningsFood: riderDetails.wallet.earningsFood,
        earningsParcel: riderDetails.wallet.earningsParcel,
        earningsPersonRide: riderDetails.wallet.earningsPersonRide,
        penaltiesFood: riderDetails.wallet.penaltiesFood,
        penaltiesParcel: riderDetails.wallet.penaltiesParcel,
        penaltiesPersonRide: riderDetails.wallet.penaltiesPersonRide,
        totalWithdrawn: riderDetails.wallet.totalWithdrawn,
      });
    } else {
      setWallet(null);
    }
    const payments = (riderDetails.onboardingPayments ?? []).map((p) => ({
      id: p.id,
      amount: p.amount,
      provider: p.provider,
      refId: p.refId,
      status: p.status,
      createdAt: p.createdAt,
    }));
    setOnboardingPayments(payments);
  }, [riderId, riderDetails]);

  useEffect(() => {
    if (!ledgerData) {
      setRecentLedger([]);
      return;
    }
    const rows = (ledgerData.ledger ?? []).map((r) => ({
      id: r.id,
      entryType: r.entryType,
      amount: r.amount,
      balance: r.balance,
      serviceType: r.serviceType,
      createdAt: r.createdAt,
    }));
    setRecentLedger(rows);
  }, [ledgerData]);

  useEffect(() => {
    const err = riderDetailsError;
    if (err) {
      setError(err instanceof Error ? err.message : String(err));
      setWallet(null);
      setOnboardingPayments([]);
    }
  }, [riderDetailsError]);

  const combinedWalletLoading = riderDetailsLoading || riderDetailsFetching;
  const combinedLedgerLoading = ledgerQueryLoading || ledgerQueryFetching;

  const hasSearch = searchValue.length > 0;

  const isCredit = (t: string) =>
    ["earning", "bonus", "refund", "referral_bonus", "penalty_reversal", "manual_add", "incentive", "surge", "failed_withdrawal_revert", "cancellation_payout"].includes(t);

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Wallet & Earnings"
        description="View balance, earnings by service, and penalties. Add penalty or view full wallet history."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
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
                  ) : null}
                  {onboardingPayments.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Onboarding fee paid</p>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold tabular-nums">₹{onboardingPayments.filter((p) => p.status === "completed").reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}</span>
                        {" "}({onboardingPayments.filter((p) => p.status === "completed").length} transaction{onboardingPayments.filter((p) => p.status === "completed").length !== 1 ? "s" : ""})
                        {" · "}
                        <Link href={rider ? `/dashboard/riders/${rider.id}#onboarding-fees` : "#"} className="text-blue-600 hover:text-blue-800 font-medium">
                          View transaction details
                        </Link>
                      </p>
                    </div>
                  )}
                  {wallet ? null : (
                    <p className="text-gray-500 text-sm">No wallet record. Balance will show as ₹0.00 until ledger entries exist.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Wallet history table: header row with actions + table */}
          <div className="rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-900/5 overflow-hidden mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-5 lg:px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-semibold text-gray-800 sm:text-lg">Wallet history & actions</h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Link
                  href={rider ? `/dashboard/riders/wallet-history?search=${rider.id}` : "/dashboard/riders/wallet-history"}
                  className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <History className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Wallet History</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setAddAmountOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <PlusCircle className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Add Amount</span>
                </button>
                {canAddPenalty && (
                  <button
                    type="button"
                    onClick={() => setAddPenaltyOpen(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                    <span>Add Penalty</span>
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              {ledgerLoading && recentLedger.length === 0 ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner size="md" text="Loading recent transactions..." />
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Type</th>
                      <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Service</th>
                      <th className="px-3 sm:px-4 py-2.5 text-right text-xs font-medium text-gray-700 uppercase tracking-wide">Amount</th>
                      <th className="px-3 sm:px-4 py-2.5 text-right text-xs font-medium text-gray-700 uppercase tracking-wide hidden sm:table-cell">Balance</th>
                      <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentLedger.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                          No recent transactions. Use &quot;Wallet History&quot; for full ledger or &quot;Add Amount&quot; / &quot;Add Penalty&quot; to record entries.
                        </td>
                      </tr>
                    ) : (
                      recentLedger.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50/50">
                          <td className="px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-900">{row.entryType.replace(/_/g, " ")}</td>
                          <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700">{row.serviceType ?? "—"}</td>
                          <td className={`px-3 sm:px-4 py-2.5 text-sm text-right font-medium whitespace-nowrap ${isCredit(row.entryType) ? "text-green-600" : "text-red-600"}`}>
                            <span className="inline-flex items-center justify-end gap-0.5">
                              <span aria-hidden="true">{isCredit(row.entryType) ? "+" : "−"}</span>
                              <span>₹{Number(row.amount).toFixed(2)}</span>
                            </span>
                          </td>
                          <td className={`px-3 sm:px-4 py-2.5 text-sm text-right font-medium hidden sm:table-cell ${row.balance != null && Number(row.balance) < 0 ? "text-red-600" : "text-gray-900"}`}>
                            {row.balance != null ? `₹${Number(row.balance).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <AddPenaltyModal
            riderId={rider.id}
            riderLabel={`GMR${rider.id} • ${rider.mobile}`}
            open={addPenaltyOpen}
            onClose={() => setAddPenaltyOpen(false)}
            onSuccess={() => {
              void refetchRiderDetails();
              void refetchLedger();
            }}
          />
          <AddAmountModal
            riderId={rider.id}
            riderLabel={`GMR${rider.id} • ${rider.mobile}`}
            open={addAmountOpen}
            onClose={() => setAddAmountOpen(false)}
            onSuccess={() => {
              void refetchRiderDetails();
              void refetchLedger();
            }}
          />
        </>
      )}
    </div>
  );
}
