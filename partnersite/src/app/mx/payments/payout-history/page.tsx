'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowLeft, ChevronRight, ExternalLink, Loader2, Receipt, TrendingUp } from 'lucide-react';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { PageSkeletonGeneric } from '@/components/PageSkeleton';
import { DEMO_RESTAURANT_ID } from '@/lib/constants';
import { usePartnerStoreRecord } from '@/hooks/usePartnerStoreRecord';
import { useMerchantLedger, useMerchantWallet, usePayoutSettlement, usePayoutCycles, useMerchantPayoutRequests } from '@/hooks/useMerchantApi';
import {
  buildPayoutCards,
  buildPayoutCardsFromCycles,
  mergePayoutCardsWithActiveRequests,
  formatCurrency,
  formatPeriodRange,
  formatShortDate,
  payoutCardToParams,
  payoutReturnedDisplayAmount,
  resolveWalletDisplayBalance,
  statusBadgeStyle,
  statusLabel,
  type PayoutCard,
  type PayoutStatus,
} from '@/lib/merchant-payout-utils';
import {
  partnerPaymentsBase,
  partnerPayoutHistoryDetailHref,
} from '@/lib/partner-payments-routes';

type StatusFilter = 'all' | PayoutStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ACCRUING', label: 'To be paid' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PROCESSING', label: 'In process' },
  { key: 'PAID', label: 'Settled' },
  { key: 'RETURNED', label: 'Returned' },
  { key: 'FAILED', label: 'Failed' },
];

function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const badge = statusBadgeStyle(status);
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: badge.bg, color: badge.text }}
    >
      {statusLabel(status)}
    </span>
  );
}

function PayoutHistoryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const id =
      searchParams?.get('storeId') ??
      (typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null);
    setStoreId(id || DEMO_RESTAURANT_ID);
  }, [searchParams]);

  const { data: storeRecord } = usePartnerStoreRecord(storeId);
  const displayName =
    (storeRecord as { store_name?: string } | null)?.store_name ?? 'Payout History';

  const { data: ledgerData, isLoading } = useMerchantLedger(
    storeId,
    { limit: 100, offset: 0 },
    { enabled: !!storeId },
  );
  const { data: wallet } = useMerchantWallet(storeId, { enabled: !!storeId });
  const { data: cycleRows } = usePayoutCycles(storeId, { enabled: !!storeId });
  const { data: payoutRequestsData } = useMerchantPayoutRequests(storeId, 20, { enabled: !!storeId });
  const walletBalance = resolveWalletDisplayBalance(wallet);

  const payoutCards = useMemo(() => {
    const base =
      cycleRows && cycleRows.length > 0
        ? buildPayoutCardsFromCycles(cycleRows)
        : buildPayoutCards(ledgerData?.entries ?? []);
    return mergePayoutCardsWithActiveRequests(base, payoutRequestsData?.recent ?? []);
  }, [cycleRows, ledgerData?.entries, payoutRequestsData?.recent]);
  const currentCycleCard = useMemo(
    () => payoutCards.find((c) => c.isCurrentCycle),
    [payoutCards],
  );

  const { data: currentCycleSettlementRaw, isLoading: settlementLoading } = usePayoutSettlement(
    storeId,
    currentCycleCard?.periodStart ?? null,
    currentCycleCard?.periodEnd ?? null,
    {
      enabled: !!currentCycleCard,
      cycleId: currentCycleCard?.cycleId ?? null,
    },
  );
  const currentCycleEstPayout = currentCycleSettlementRaw?.estimatedPayout ?? 0;

  const pastPayoutCards = useMemo(() => {
    const past = payoutCards.filter((c) => !c.isCurrentCycle);
    if (statusFilter === 'all') return past;
    return past.filter((c) => c.status === statusFilter);
  }, [payoutCards, statusFilter]);

  const showCurrentCycle =
    currentCycleCard != null && (statusFilter === 'all' || statusFilter === 'ACCRUING');

  const detailHref = (cardId: string, card: PayoutCard) => {
    const detailCard =
      card.payoutRequestId != null && currentCycleCard
        ? { ...currentCycleCard, netPayout: card.netPayout, status: card.status }
        : card;
    const q = new URLSearchParams(payoutCardToParams(detailCard));
    return partnerPayoutHistoryDetailHref(pathname, detailCard.id, q);
  };

  if (isLoading && !ledgerData) {
    return (
      <MXLayoutWhite restaurantName={displayName} restaurantId={storeId || DEMO_RESTAURANT_ID}>
        <PageSkeletonGeneric />
      </MXLayoutWhite>
    );
  }

  return (
    <MXLayoutWhite restaurantName={displayName} restaurantId={storeId || DEMO_RESTAURANT_ID}>
      <PartnerPageHeader
        title="Payout History"
        subtitle="Weekly payout cycles and settlement status"
      />
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#f8fafc] w-full">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain hide-scrollbar">
          <div className="bg-white border-b border-gray-200">
            <div className="px-4 sm:px-6 lg:px-8 py-3 max-w-7xl mx-auto w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <MobileHamburgerButton />
                <button
                  type="button"
                  onClick={() => router.push(partnerPaymentsBase(pathname))}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-emerald-700 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
                >
                  <ArrowLeft size={16} />
                  Back to payments
                </button>
                {storeId ? (
                  <span className="hidden sm:inline text-xs text-gray-400">|</span>
                ) : null}
                {storeId ? (
                  <span className="hidden sm:inline text-xs text-gray-500 truncate">
                    Store ID: {storeId}
                  </span>
                ) : null}
              </div>

              <div
                className="inline-flex items-center p-0.5 bg-gray-100 rounded-lg border border-gray-200 self-start lg:self-auto overflow-x-auto max-w-full"
                role="tablist"
                aria-label="Filter payouts by status"
              >
                {STATUS_FILTERS.map(({ key, label }) => {
                  const active = statusFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setStatusFilter(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto w-full space-y-4 pb-10">
            {isLoading || (showCurrentCycle && settlementLoading && !currentCycleSettlementRaw) ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              </div>
            ) : (
              <>
                {showCurrentCycle && currentCycleCard ? (
                  <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-amber-50/80 to-white flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                          <TrendingUp size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Current cycle
                          </p>
                          <p className="text-sm text-gray-700">
                            {formatPeriodRange(
                              currentCycleCard.periodStart,
                              currentCycleCard.periodEnd,
                            )}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={detailHref(currentCycleCard.id, currentCycleCard)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 shrink-0"
                      >
                        View details
                        <ChevronRight size={16} />
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                      <div className="px-5 py-4">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                          Wallet balance
                        </p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          {formatCurrency(walletBalance)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Est. cycle payout · {formatCurrency(currentCycleEstPayout)}
                        </p>
                      </div>
                      <div className="px-5 py-4">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                          Orders
                        </p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          {currentCycleSettlementRaw?.orderCount ?? currentCycleCard.orderCount}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          in this cycle
                        </p>
                      </div>
                      <div className="px-5 py-4">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                          Payout period
                        </p>
                        <p className="text-sm font-semibold text-gray-900 mt-2">
                          {formatPeriodRange(
                            currentCycleCard.periodStart,
                            currentCycleCard.periodEnd,
                          )}
                        </p>
                      </div>
                      <div className="px-5 py-4 flex flex-col justify-center">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Status
                        </p>
                        <PayoutStatusBadge status={currentCycleCard.status} />
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Payouts</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {pastPayoutCards.length}{' '}
                        {pastPayoutCards.length === 1 ? 'record' : 'records'}
                        {statusFilter !== 'all'
                          ? ` · ${STATUS_FILTERS.find((f) => f.key === statusFilter)?.label}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  {pastPayoutCards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                      <Receipt className="w-10 h-10 text-gray-300 mb-3" />
                      <p className="font-medium text-gray-900 text-sm">No payouts found</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">
                        {statusFilter === 'all'
                          ? 'Completed withdrawals will appear here once settled.'
                          : 'Try another status filter to see more payouts.'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200 text-left">
                            <th className="py-3 px-5 font-semibold text-gray-700 text-xs">
                              Payout period
                            </th>
                            <th className="py-3 px-5 font-semibold text-gray-700 text-xs text-right">
                              Net payout
                            </th>
                            <th className="py-3 px-5 font-semibold text-gray-700 text-xs text-center">
                              Orders
                            </th>
                            <th className="py-3 px-5 font-semibold text-gray-700 text-xs">
                              Payout date
                            </th>
                            <th className="py-3 px-5 font-semibold text-gray-700 text-xs text-center">
                              Status
                            </th>
                            <th className="py-3 px-5 font-semibold text-gray-700 text-xs text-right">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {pastPayoutCards.map((card) => (
                            <tr
                              key={card.id}
                              className="hover:bg-gray-50/80 transition-colors"
                            >
                              <td className="py-3.5 px-5 text-gray-900 font-medium">
                                {formatPeriodRange(card.periodStart, card.periodEnd)}
                                {card.closeNote ? (
                                  <span className="block text-xs font-normal text-amber-700 mt-0.5">
                                    {card.closeNote}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-3.5 px-5 text-right font-semibold text-gray-900 tabular-nums">
                                {formatCurrency(card.netPayout)}
                                {payoutReturnedDisplayAmount(card) > 0 ? (
                                  <span className="block text-xs font-normal text-gray-500">
                                    {formatCurrency(payoutReturnedDisplayAmount(card))} returned
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-3.5 px-5 text-center text-gray-600 tabular-nums">
                                {card.orderCount}
                              </td>
                              <td className="py-3.5 px-5 text-gray-600">
                                {card.payoutDate ? formatShortDate(card.payoutDate) : '—'}
                              </td>
                              <td className="py-3.5 px-5 text-center">
                                <PayoutStatusBadge status={card.status} />
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <Link
                                  href={detailHref(card.id, card)}
                                  className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                                >
                                  Details
                                  <ExternalLink size={14} />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </MXLayoutWhite>
  );
}

export default function PayoutHistoryPage() {
  return (
    <Suspense
      fallback={
        <MXLayoutWhite restaurantName="Payout History" restaurantId={DEMO_RESTAURANT_ID}>
          <PartnerPageHeader title="Payout History" subtitle="Loading payout history…" />
          <PageSkeletonGeneric />
        </MXLayoutWhite>
      }
    >
      <PayoutHistoryContent />
    </Suspense>
  );
}
