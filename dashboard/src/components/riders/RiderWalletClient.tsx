"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AddPenaltyModal } from "./AddPenaltyModal";
import { AddAmountModal } from "./AddAmountModal";
import { useRiderAccessQuery } from "@/hooks/queries/useRiderAccessQuery";
import { useGetRiderWalletQuery, useGetRiderLedgerQuery } from "@/store/api/riderApi";
import {
  parseNumericRiderIdFromSearch,
  riderSearchNeedsSupabaseResolve,
} from "@/lib/riders/resolve-rider-search";
import Link from "next/link";
import {
  History,
  Plus,
  Wallet,
  UtensilsCrossed,
  Package,
  Bike,
  Landmark,
  Info,
  Clock3,
  ArrowDownLeft,
  ArrowUpRight,
  MoreVertical,
  ChevronRight,
} from "lucide-react";
import { formatLedgerDisplay } from "@/lib/riders/rider-ledger-display";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

type WalletStatTone = "violet" | "green" | "purple" | "orange" | "red" | "blue";

const TONE_STYLES: Record<
  WalletStatTone,
  { wrap: string; icon: string }
> = {
  violet: { wrap: "bg-violet-50", icon: "text-violet-600" },
  green: { wrap: "bg-emerald-50", icon: "text-emerald-600" },
  purple: { wrap: "bg-purple-50", icon: "text-purple-600" },
  orange: { wrap: "bg-orange-50", icon: "text-orange-600" },
  red: { wrap: "bg-red-50", icon: "text-red-600" },
  blue: { wrap: "bg-blue-50", icon: "text-blue-600" },
};

function formatWalletAmount(value: string | number, negative = false): string {
  const n = Number(value);
  const abs = Math.abs(n).toFixed(2);
  if (negative || n < 0) return `−₹${abs}`;
  return `₹${abs}`;
}

function formatLedgerDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${date} ${time}`;
}

function WalletStatCard({
  label,
  value,
  icon,
  tone,
  negative = false,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone: WalletStatTone;
  negative?: boolean;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.wrap}`}
      >
        <span className={styles.icon}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p
          className={`mt-0.5 text-base font-bold tabular-nums ${
            negative ? "text-red-600" : "text-gray-900"
          }`}
        >
          {formatWalletAmount(value, negative)}
        </p>
      </div>
    </div>
  );
}

function ServiceBadge({ serviceLabel }: { serviceLabel: string }) {
  if (!serviceLabel || serviceLabel === "—") {
    return <span className="text-sm text-gray-400">—</span>;
  }

  const key = serviceLabel.toLowerCase();
  if (key === "food") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
        <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden />
        Food
      </span>
    );
  }
  if (key === "parcel") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">
        <Package className="h-3.5 w-3.5" aria-hidden />
        Parcel
      </span>
    );
  }
  if (key === "person ride") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-100">
        <Bike className="h-3.5 w-3.5" aria-hidden />
        Person ride
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
      {serviceLabel}
    </span>
  );
}

export function RiderWalletClient() {
  const searchParams = useSearchParams();
  const riderContext = useRiderDashboardOptional();
  const riderFromContext = useMemo<RiderInfo | null>(() => {
    const info = riderContext?.currentRiderInfo;
    if (!info) return null;
    return { id: info.id, name: info.name, mobile: info.mobile };
  }, [
    riderContext?.currentRiderInfo?.id,
    riderContext?.currentRiderInfo?.name,
    riderContext?.currentRiderInfo?.mobile,
  ]);
  const searchValue = (searchParams.get("search") || "").trim();
  const parsedRiderId = useMemo(() => parseNumericRiderIdFromSearch(searchValue), [searchValue]);

  const [rider, setRider] = useState<RiderInfo | null>(null);
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

  const resolveRiderByPhone = useCallback(async (value: string) => {
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
      if (isPhone) {
        query = query.eq("mobile", value.replace(/^\+?91/, ""));
      } else {
        query = query.ilike("mobile", `%${value}%`);
      }
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

  const applyRider = useCallback((next: RiderInfo | null) => {
    setRider((prev) => {
      if (prev === next) return prev;
      if (!prev && !next) return prev;
      if (
        prev &&
        next &&
        prev.id === next.id &&
        prev.name === next.name &&
        prev.mobile === next.mobile
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!searchValue) {
      if (riderFromContext) {
        applyRider(riderFromContext);
        setError(null);
      } else {
        applyRider(null);
        setError(null);
      }
      return;
    }

    if (parsedRiderId != null) {
      if (riderFromContext?.id === parsedRiderId) {
        applyRider(riderFromContext);
      } else {
        setRider((prev) =>
          prev?.id === parsedRiderId
            ? prev
            : { id: parsedRiderId, name: null, mobile: "" },
        );
      }
      setError(null);
      return;
    }

    if (riderSearchNeedsSupabaseResolve(searchValue)) {
      void resolveRiderByPhone(searchValue);
    }
  }, [searchValue, parsedRiderId, riderFromContext, resolveRiderByPhone, applyRider]);

  const riderId = rider?.id ?? parsedRiderId ?? riderFromContext?.id ?? null;

  const {
    data: walletData,
    isLoading: walletLoading,
    isFetching: walletFetching,
    error: walletError,
    refetch: refetchWallet,
  } = useGetRiderWalletQuery(riderId as number, {
    skip: riderId == null,
  } as never);

  const {
    data: ledgerData,
    isLoading: ledgerLoading,
    isFetching: ledgerFetching,
    refetch: refetchLedger,
  } = useGetRiderLedgerQuery(
    riderId ? { riderId, filters: { limit: 15 } } : ({ riderId: 0 } as never),
    { skip: riderId == null } as never,
  );

  const walletRider = walletData?.rider;

  useEffect(() => {
    if (!walletRider) return;
    applyRider({
      id: walletRider.id,
      name: walletRider.name,
      mobile: walletRider.mobile,
    });
    setError(null);
  }, [walletRider?.id, walletRider?.name, walletRider?.mobile, applyRider]);

  useEffect(() => {
    if (walletError) {
      const msg =
        walletError && typeof walletError === "object" && "data" in walletError
          ? String((walletError as { data?: { error?: string } }).data?.error ?? "Failed to load wallet")
          : walletError instanceof Error
            ? walletError.message
            : "Failed to load wallet";
      setError(msg);
    }
  }, [walletError]);

  const wallet = walletData?.wallet ?? null;
  const onboardingPayments = walletData?.onboardingPayments ?? [];
  const recentLedger = ledgerData?.ledger ?? [];
  const ledgerTotal = ledgerData?.total ?? recentLedger.length;
  const walletBusy = walletLoading || walletFetching;
  const ledgerBusy = ledgerLoading || ledgerFetching;
  const hasSearch = searchValue.length > 0;

  const completedOnboarding = onboardingPayments.filter((p) => p.status === "completed");
  const onboardingPaidTotal = completedOnboarding.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-5 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Wallet & Earnings"
        description="Track earnings, penalties & wallet activity"
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
        hideTitle
      />

      {riderId != null && (
        <>
          {/* Current Wallet */}
          <section className="relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-900/5">
            {walletBusy && wallet && (
              <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-gray-100">
                <div className="h-full w-1/3 animate-pulse rounded-r bg-violet-500" />
              </div>
            )}

            <div className="border-b border-gray-100 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Wallet className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Current Wallet</h2>
              </div>
            </div>

            <div className={`px-4 py-4 sm:px-6 sm:py-5 ${walletBusy && wallet ? "opacity-70" : ""}`}>
              {walletBusy && !wallet ? (
                <LoadingSpinner size="sm" text="Loading wallet..." />
              ) : wallet ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <WalletStatCard
                      label="Total Balance"
                      value={wallet.totalBalance}
                      tone="violet"
                      icon={<Wallet className="h-5 w-5" />}
                    />
                    <WalletStatCard
                      label="Earnings (Food)"
                      value={wallet.earningsFood}
                      tone="green"
                      icon={<UtensilsCrossed className="h-5 w-5" />}
                    />
                    <WalletStatCard
                      label="Earnings (Parcel)"
                      value={wallet.earningsParcel}
                      tone="purple"
                      icon={<Package className="h-5 w-5" />}
                    />
                    <WalletStatCard
                      label="Earnings (Person Ride)"
                      value={wallet.earningsPersonRide}
                      tone="orange"
                      icon={<Bike className="h-5 w-5" />}
                    />
                    <WalletStatCard
                      label="Penalties (Food)"
                      value={wallet.penaltiesFood}
                      tone="red"
                      negative
                      icon={<UtensilsCrossed className="h-5 w-5" />}
                    />
                    <WalletStatCard
                      label="Penalties (Parcel)"
                      value={wallet.penaltiesParcel}
                      tone="red"
                      negative
                      icon={<Package className="h-5 w-5" />}
                    />
                    <WalletStatCard
                      label="Penalties (Person Ride)"
                      value={wallet.penaltiesPersonRide}
                      tone="red"
                      negative
                      icon={<Bike className="h-5 w-5" />}
                    />
                    <WalletStatCard
                      label="Total Withdrawn"
                      value={wallet.totalWithdrawn}
                      tone="blue"
                      icon={<Landmark className="h-5 w-5" />}
                    />
                  </div>

                  {completedOnboarding.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                      <Info className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                      <span className="font-medium">Onboarding Fee Paid</span>
                      <span className="font-bold tabular-nums">
                        ₹{onboardingPaidTotal.toFixed(2)} ({completedOnboarding.length} transaction
                        {completedOnboarding.length !== 1 ? "s" : ""})
                      </span>
                      <span className="text-sky-700">|</span>
                      <Link
                        href={`/dashboard/riders/${riderId}#onboarding-fees`}
                        className="inline-flex items-center gap-0.5 font-semibold text-sky-700 hover:text-sky-900"
                      >
                        View transaction details
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  No wallet record. Balance will show as ₹0.00 until ledger entries exist.
                </p>
              )}
            </div>
          </section>

          {/* Wallet history & actions */}
          <section className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-900/5">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                  <Clock3 className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Wallet History & Actions</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/dashboard/riders/wallet-history?search=${riderId}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  <History className="h-4 w-4 shrink-0" aria-hidden />
                  Wallet History
                </Link>
                <button
                  type="button"
                  onClick={() => setAddAmountOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  Add Amount
                </button>
                {canAddPenalty && (
                  <button
                    type="button"
                    onClick={() => setAddPenaltyOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    Add Penalty
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              {ledgerBusy && recentLedger.length === 0 ? (
                <div className="flex justify-center py-14">
                  <LoadingSpinner size="md" text="Loading recent transactions..." />
                </div>
              ) : (
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Reason
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Order ID
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Service
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Balance
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Date & Time
                      </th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-12">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentLedger.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                          No recent transactions. Use &quot;Wallet History&quot; for full ledger or
                          &quot;Add Amount&quot; / &quot;Add Penalty&quot; to record entries.
                        </td>
                      </tr>
                    ) : (
                      recentLedger.map((row) => {
                        const display = formatLedgerDisplay(row);
                        const isCredit = display.flow === "credit";
                        return (
                          <tr key={row.id} className="transition-colors hover:bg-gray-50/60">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5 min-w-[160px]">
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                    isCredit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                                  }`}
                                >
                                  {isCredit ? (
                                    <ArrowDownLeft className="h-4 w-4" aria-hidden />
                                  ) : (
                                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                                  )}
                                </div>
                                <span className="text-sm font-semibold text-gray-900">{display.title}</span>
                              </div>
                            </td>
                            <td
                              className="px-4 py-3.5 text-sm text-gray-600 max-w-[220px] truncate"
                              title={display.reason || undefined}
                            >
                              {display.reason || "—"}
                            </td>
                            <td className="px-4 py-3.5 text-sm font-medium text-gray-800 whitespace-nowrap">
                              {display.orderId ?? "—"}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <ServiceBadge serviceLabel={display.serviceLabel} />
                            </td>
                            <td
                              className={`px-4 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap ${
                                isCredit ? "text-emerald-600" : "text-red-600"
                              }`}
                            >
                              {isCredit ? "+" : "−"}₹{Number(row.amount).toFixed(2)}
                            </td>
                            <td
                              className={`px-4 py-3.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap ${
                                row.balance != null && Number(row.balance) < 0
                                  ? "text-red-600"
                                  : "text-gray-900"
                              }`}
                            >
                              {row.balance != null ? `₹${Number(row.balance).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                              {formatLedgerDateTime(row.createdAt)}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <Link
                                href={`/dashboard/riders/wallet-history?search=${riderId}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                aria-label="View in wallet history"
                              >
                                <MoreVertical className="h-4 w-4" aria-hidden />
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {recentLedger.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm text-gray-500">
                  Showing <span className="font-medium text-gray-700">1</span> to{" "}
                  <span className="font-medium text-gray-700">{recentLedger.length}</span> of{" "}
                  <span className="font-medium text-gray-700">{ledgerTotal}</span> entries
                </p>
                <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    disabled
                    className="rounded-md px-2.5 py-1 text-sm text-gray-400"
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-violet-600 px-3 py-1 text-sm font-semibold text-white"
                    aria-current="page"
                  >
                    1
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-md px-2.5 py-1 text-sm text-gray-400"
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </section>

          <AddPenaltyModal
            riderId={riderId}
            riderLabel={`GMR${riderId}${rider?.mobile ? ` • ${rider.mobile}` : ""}`}
            open={addPenaltyOpen}
            onClose={() => setAddPenaltyOpen(false)}
            onSuccess={() => {
              void refetchWallet();
              void refetchLedger();
            }}
          />
          <AddAmountModal
            riderId={riderId}
            riderLabel={`GMR${riderId}${rider?.mobile ? ` • ${rider.mobile}` : ""}`}
            open={addAmountOpen}
            onClose={() => setAddAmountOpen(false)}
            onSuccess={() => {
              void refetchWallet();
              void refetchLedger();
            }}
          />
        </>
      )}
    </div>
  );
}
