'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { FormattedOrderId } from '@/components/FormattedOrderId';
import { PayoutOrderDetailSheet } from '@/components/payments/PayoutOrderDetailSheet';
import { usePartnerStoreRecord } from '@/hooks/usePartnerStoreRecord';
import { prefetchCompensationPolicy } from '@/lib/compensationPolicyCache';
import {
  usePayoutSettlement,
  useMerchantBankAccounts,
  useMerchantLedger,
  type LedgerEntry,
} from '@/hooks/useMerchantApi';
import { parsePgTimestamp } from '@/lib/parse-pg-timestamp';
import { partnerPayoutHistoryHref } from '@/lib/partner-payments-routes';
import {
  PAYOUT_STORE_OFFER_DISCOUNT_LINES,
  PAYOUT_STORE_OFFERS_SECTION_LABEL,
  PAYOUT_CANCELLATION_COMPENSATION_LABEL,
  PAYOUT_ORDER_TYPE_OPTIONS,
  buildSettlementDetailSections,
  buildOrderPayoutBreakdown,
  MERCHANT_GROSS_REVENUE_LABEL,
  entriesInPayoutPeriod,
  filterPayoutOrderBreakdowns,
  formatCurrency,
  formatPeriodRange,
  formatShortDate,
  orderSettlementBadge,
  payoutOrderTypeFilterLabel,
  selectPayoutOrderLedgerEntries,
  statusBadgeStyle,
  statusLabel,
  type PayoutOrderTypeFilter,
  type PayoutSettlementSummary,
  type PayoutStatus,
  type OrderPayoutBreakdown,
} from '@/lib/merchant-payout-utils';

type DetailTab = 'summary' | 'orders';

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

const EMPTY_SETTLEMENT: PayoutSettlementSummary = {
  netOrderValue: 0,
  itemSubtotal: 0,
  packagingCharges: 0,
  restaurantDiscounts: 0,
  couponOfferDiscount: 0,
  percentageFlatOfferDiscount: 0,
  comboOfferDiscount: 0,
  freeDeliveryOfferDiscount: 0,
  orderDeductions: 0,
  mechanismFee: 0,
  customerCompensation: 0,
  cancellationCompensation: 0,
  otherCredits: 0,
  withdrawalReversalCredits: 0,
  manualCredits: 0,
  adjustmentCredits: 0,
  gstCredits: 0,
  penaltyReversalCredits: 0,
  penalties: 0,
  refundAdjustments: 0,
  manualDebitAdjustments: 0,
  chargebacks: 0,
  estimatedPayout: 0,
  orderCount: 0,
  deliveredOrderCount: 0,
  rejectedOrderCount: 0,
};

function formatSettlementValue(amount: number, opts?: { negative?: boolean; count?: boolean }) {
  if (opts?.count) return String(amount);
  if (opts?.negative && amount > 0) return `− ${formatCurrency(amount)}`;
  return formatCurrency(amount);
}

function SettlementRow({
  label,
  amount,
  negative,
  bold,
  green,
  expanded,
  onToggle,
  showChevron,
  count,
}: {
  label: string;
  amount: number;
  negative?: boolean;
  bold?: boolean;
  green?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  showChevron?: boolean;
  count?: boolean;
}) {
  const display = formatSettlementValue(amount, { negative, count });
  const canToggle = showChevron && onToggle;
  const Tag = canToggle ? 'button' : 'div';

  return (
    <Tag
      type={canToggle ? 'button' : undefined}
      onClick={canToggle ? onToggle : undefined}
      className={`flex items-center justify-between w-full py-2.5 text-left ${bold ? 'font-semibold' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {showChevron ? (
          expanded ? (
            <ChevronUp size={14} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          )
        ) : (
          <span className="inline-block w-[14px] h-[14px] shrink-0" aria-hidden />
        )}
        <span className={`text-sm text-gray-800 ${bold ? 'font-semibold' : ''}`}>{label}</span>
      </div>
      <span
        className={`text-sm shrink-0 ml-2 ${
          green ? 'text-emerald-700 font-semibold' : negative && amount > 0 ? 'text-red-600' : 'text-gray-900'
        } ${bold ? 'font-semibold' : ''}`}
      >
        {display}
      </span>
    </Tag>
  );
}

function SettlementSubRow({
  label,
  amount,
  negative,
  green,
  last,
  count,
}: {
  label: string;
  amount: number;
  negative?: boolean;
  green?: boolean;
  last?: boolean;
  count?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 pl-5 ${last ? '' : 'border-b border-gray-50'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-px h-4 bg-gray-200" />
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <span
        className={`text-xs shrink-0 ml-2 ${
          negative && amount > 0
            ? 'text-red-600'
            : green && amount > 0
              ? 'text-emerald-700'
              : 'text-gray-800'
        }`}
      >
        {formatSettlementValue(amount, { negative, count })}
      </span>
    </div>
  );
}

function ExpandableSettlementSection({
  label,
  amount,
  items,
  negative,
  bold,
  green,
  count,
  defaultExpanded = false,
}: {
  label: string;
  amount: number;
  items: { label: string; amount: number; negative?: boolean; green?: boolean; count?: boolean }[];
  negative?: boolean;
  bold?: boolean;
  green?: boolean;
  count?: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div>
      <SettlementRow
        label={label}
        amount={amount}
        negative={negative}
        bold={bold}
        green={green}
        count={count}
        expanded={expanded}
        showChevron
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded ? (
        <div className="pb-1">
          {items.map((item, index) => (
            <SettlementSubRow
              key={item.label}
              label={item.label}
              amount={item.amount}
              negative={item.negative}
              green={item.green ?? green}
              count={item.count}
              last={index === items.length - 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OrderPayoutTableRow({
  item,
  payoutStatus,
  onOpen,
}: {
  item: OrderPayoutBreakdown;
  payoutStatus: PayoutStatus;
  onOpen: () => void;
}) {
  const paymentLine = item.paymentLabel.toLowerCase().includes('paid')
    ? item.paymentLabel
    : `Paid ${item.paymentLabel}`;
  const isRejected = item.fulfillmentStatus === 'rejected';
  const settlementBadge = orderSettlementBadge(payoutStatus);
  const showCancelLine =
    isRejected && (item.cancellationBrandPrefix || item.cancellationMessage);

  const settlementClass =
    settlementBadge.variant === 'settled'
      ? 'bg-emerald-50 text-emerald-700'
      : settlementBadge.variant === 'processing'
        ? 'bg-orange-50 text-orange-700'
        : settlementBadge.variant === 'failed'
          ? 'bg-red-50 text-red-700'
          : 'bg-amber-50 text-amber-800';

  return (
    <tr className="hover:bg-gray-50/80 transition-colors align-top">
      <td className="py-3.5 px-5">
        <button type="button" onClick={onOpen} className="text-left group">
          <FormattedOrderId
            formattedOrderId={item.formattedOrderId}
            fallbackOrderId={item.ordersCoreId ?? item.foodOrderId ?? item.entry.id}
            size="sm"
          />
          {showCancelLine ? (
            <p className="text-xs text-gray-500 mt-1 max-w-xs leading-relaxed line-clamp-2">
              {item.cancellationBrandPrefix ? (
                <span className="text-red-600 font-medium">{item.cancellationBrandPrefix} </span>
              ) : null}
              {item.cancellationMessage}
            </p>
          ) : null}
        </button>
      </td>
      <td className="py-3.5 px-5">
        <span
          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            isRejected ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {isRejected ? 'Rejected' : 'Delivered'}
        </span>
      </td>
      <td className="py-3.5 px-5">
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${settlementClass}`}>
          {settlementBadge.label}
        </span>
      </td>
      <td className="py-3.5 px-5 text-gray-600 text-sm whitespace-nowrap">
        <div>{item.deliveredLabel}</div>
        <div className="text-xs text-gray-400 mt-0.5">{paymentLine}</div>
      </td>
      <td className="py-3.5 px-5 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
        {formatCurrency(item.grossRevenue)}
      </td>
      <td className="py-3.5 px-5 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
        {formatCurrency(item.netReceivable)}
      </td>
      <td className="py-3.5 px-5 text-right text-gray-700 tabular-nums whitespace-nowrap">
        {formatCurrency(item.unsettledAmount)}
      </td>
      <td className="py-3.5 px-5 text-right">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          View
          <ChevronRight size={14} />
        </button>
      </td>
    </tr>
  );
}

export function PayoutDetailClient({
  storeId,
  payoutId,
  netPayout,
  orderCount,
  periodStartIso,
  periodEndIso,
  payoutDateIso,
  status,
  isCurrentCycle,
  pgTransactionId,
  cycleId,
  storeName,
  storePublicId,
  storeLocation,
}: {
  storeId: string;
  payoutId: string;
  netPayout: number;
  orderCount: number;
  periodStartIso: string;
  periodEndIso: string;
  payoutDateIso: string;
  status: PayoutStatus;
  isCurrentCycle: boolean;
  pgTransactionId: string;
  cycleId?: number | null;
  storeName: string;
  storePublicId: string;
  storeLocation: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [detailTab, setDetailTab] = useState<DetailTab>('summary');
  const [orderTypeFilter, setOrderTypeFilter] = useState<PayoutOrderTypeFilter>('all');
  const [orderSheetTarget, setOrderSheetTarget] = useState<OrderPayoutBreakdown | null>(null);

  const { data: storeRecord } = usePartnerStoreRecord(storeId);

  const openOrderSheet = useCallback((item: OrderPayoutBreakdown) => {
    if (!item.ordersCoreId && !item.foodOrderId) return;
    setOrderSheetTarget(item);
  }, []);

  const closeOrderSheet = useCallback(() => {
    setOrderSheetTarget(null);
  }, []);

  const periodStart = useMemo(() => parsePgTimestamp(periodStartIso), [periodStartIso]);
  const periodEnd = useMemo(() => parsePgTimestamp(periodEndIso), [periodEndIso]);
  const payoutDate = useMemo(() => parsePgTimestamp(payoutDateIso), [payoutDateIso]);

  const ledgerParams = useMemo(
    () => ({
      limit: 200,
      offset: 0,
      from: periodStartIso || undefined,
      to: periodEndIso || undefined,
    }),
    [periodStartIso, periodEndIso],
  );

  const { data: ledgerData, isLoading: ledgerLoading } = useMerchantLedger(storeId, ledgerParams, {
    enabled: !!storeId && !!periodStartIso && !!periodEndIso,
  });
  const {
    data: settlementData,
    isLoading: settlementLoading,
    error: settlementQueryError,
  } = usePayoutSettlement(storeId, periodStart, periodEnd, {
    enabled: !!storeId && ((!!periodStart && !!periodEnd) || (cycleId != null && cycleId > 0)),
    cycleId: cycleId ?? null,
  });
  const { data: bankAccounts = [] } = useMerchantBankAccounts(storeId, {
    enabled: !!storeId && detailTab === 'summary',
  });

  const settlement = settlementData ?? EMPTY_SETTLEMENT;
  const settlementError = settlementQueryError
    ? settlementQueryError instanceof Error
      ? settlementQueryError.message
      : 'Failed to load settlement'
    : null;
  const ledger = ledgerData?.entries ?? [];
  const tabContentLoading = detailTab === 'summary' ? settlementLoading : ledgerLoading;
  const bank = bankAccounts.find((b) => b.is_primary && !b.is_disabled) ?? bankAccounts[0] ?? null;

  useEffect(() => {
    prefetchCompensationPolicy();
  }, []);

  const periodEntries = useMemo(
    () => entriesInPayoutPeriod(ledger, periodStart, periodEnd, payoutDate),
    [ledger, periodStart, periodEnd, payoutDate],
  );

  const orderEntries = useMemo(
    () => selectPayoutOrderLedgerEntries(periodEntries),
    [periodEntries],
  );

  const orderBreakdowns = useMemo(
    () => orderEntries.map((e) => buildOrderPayoutBreakdown(e, status)),
    [orderEntries, status],
  );

  const filteredOrderBreakdowns = useMemo(
    () => filterPayoutOrderBreakdowns(orderBreakdowns, orderTypeFilter),
    [orderBreakdowns, orderTypeFilter],
  );

  const displayHeroPayout = isCurrentCycle
    ? Math.max(0, settlement.estimatedPayout)
    : Math.max(0, netPayout);

  const settlementSections = buildSettlementDetailSections(settlement);

  const pgTnxId = useMemo(() => {
    if (pgTransactionId?.trim()) return pgTransactionId.trim();
    const ledgerId = payoutId.startsWith('w-') ? Number(payoutId.slice(2)) : NaN;
    const withdrawal = Number.isFinite(ledgerId)
      ? ledger.find((e: LedgerEntry) => e.id === ledgerId && e.category === 'WITHDRAWAL')
      : ledger.find((e: LedgerEntry) => e.category === 'WITHDRAWAL' && e.pg_transaction_id);
    return withdrawal?.pg_transaction_id?.trim() || '—';
  }, [ledger, payoutId, pgTransactionId]);

  const accountMasked = bank?.account_number_masked ?? bank?.account_number?.slice(-6) ?? '—';
  const accountHolder = bank?.account_holder_name?.trim() || '—';
  const bankName = bank?.bank_name?.trim() || '';

  return (
    <>
    <MXLayoutWhite restaurantName={storeName || 'Payout details'} restaurantId={storeId}>
      <PartnerPageHeader
        title="Payout details"
        subtitle={`${formatPeriodRange(periodStart, periodEnd)} · Store ID: ${storePublicId || storeId}`}
      />
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#f8fafc] w-full">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain hide-scrollbar">
          <div className="bg-white border-b border-gray-200">
            <div className="px-4 sm:px-6 lg:px-8 py-3 max-w-7xl mx-auto w-full flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <MobileHamburgerButton />
                <button
                  type="button"
                  onClick={() => router.push(partnerPayoutHistoryHref(pathname))}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-emerald-700 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
                >
                  <ArrowLeft size={16} />
                  Back to payout history
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start xl:self-auto">
                <div
                  className="inline-flex items-center p-0.5 bg-gray-100 rounded-lg border border-gray-200"
                  role="tablist"
                  aria-label="Payout detail view"
                >
                  {(['summary', 'orders'] as const).map((tab) => {
                    const active = detailTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setDetailTab(tab)}
                        className={`px-4 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                          active
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {tab === 'summary' ? 'Summary' : 'Orders'}
                      </button>
                    );
                  })}
                </div>

                {detailTab === 'orders' ? (
                  <div
                    className="inline-flex items-center p-0.5 bg-gray-100 rounded-lg border border-gray-200 overflow-x-auto max-w-full"
                    role="tablist"
                    aria-label="Filter orders"
                  >
                    {PAYOUT_ORDER_TYPE_OPTIONS.map((opt) => {
                      const active = orderTypeFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setOrderTypeFilter(opt.id)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                            active
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto w-full space-y-4 pb-10">
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                <div className="px-5 py-4">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    {isCurrentCycle ? 'Est. payout' : 'Net payout'}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
                    {formatCurrency(displayHeroPayout)}
                  </p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Orders
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
                    {settlement.orderCount || orderCount}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">in this cycle</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Payout period
                  </p>
                  <p className="text-sm font-semibold text-gray-900 mt-2">
                    {formatPeriodRange(periodStart, periodEnd)}
                  </p>
                  {!isCurrentCycle && payoutDate ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Paid {formatShortDate(payoutDate)}
                    </p>
                  ) : null}
                </div>
                <div className="px-5 py-4 flex flex-col justify-center">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Status
                  </p>
                  <PayoutStatusBadge status={status} />
                </div>
              </div>
            </section>

            {tabContentLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              </div>
            ) : settlementError ? (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
                {settlementError}
              </div>
            ) : detailTab === 'summary' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h2 className="text-sm font-semibold text-gray-900">Settlement summary</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Breakdown of earnings, deductions, and estimated payout
                      </p>
                    </div>
                    <div className="p-4 sm:p-5">
                      <div className="rounded-lg border border-gray-100 p-3 mb-3">
                        <ExpandableSettlementSection
                          label="Total orders"
                          amount={settlement.orderCount || orderCount}
                          count
                          items={[
                            {
                              label: 'Delivered orders',
                              amount: settlement.deliveredOrderCount,
                              count: true,
                            },
                            {
                              label: 'Rejected orders',
                              amount: settlement.rejectedOrderCount,
                              count: true,
                            },
                          ]}
                        />
                      </div>

                      <div className="rounded-lg border border-gray-100 p-3 divide-y divide-gray-100">
                        <ExpandableSettlementSection
                          label="Net order value (A)"
                          amount={settlement.netOrderValue}
                          items={[
                            { label: 'Item subtotal', amount: settlement.itemSubtotal },
                            { label: 'Packaging charges', amount: settlement.packagingCharges },
                          ]}
                        />
                        <ExpandableSettlementSection
                          label={PAYOUT_STORE_OFFERS_SECTION_LABEL}
                          amount={settlement.restaurantDiscounts}
                          negative
                          items={PAYOUT_STORE_OFFER_DISCOUNT_LINES.map((line) => ({
                            label: line.label,
                            amount: settlement[line.key],
                            negative: true,
                          }))}
                        />
                        <ExpandableSettlementSection
                          label="Order level deductions (C)"
                          amount={settlement.orderDeductions}
                          negative
                          items={settlementSections.deductionItems}
                        />
                        {settlement.cancellationCompensation > 0 ? (
                          <ExpandableSettlementSection
                            label={PAYOUT_CANCELLATION_COMPENSATION_LABEL}
                            amount={settlement.cancellationCompensation}
                            green
                            items={settlementSections.cancellationCreditItems}
                          />
                        ) : null}
                        {(settlement.otherCredits ?? 0) > 0 ? (
                          <ExpandableSettlementSection
                            label="Other merchant credits"
                            amount={settlement.otherCredits}
                            green
                            items={settlementSections.otherCreditItems}
                          />
                        ) : null}
                        <SettlementRow
                          label={settlementSections.estPayoutLabel}
                          amount={settlement.estimatedPayout}
                          bold
                          green
                        />
                      </div>
                    </div>
                  </section>
                </div>

                <div className="space-y-4">
                  <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h2 className="text-sm font-semibold text-gray-900">Transaction details</h2>
                    </div>
                    <div className="p-4 sm:p-5 text-sm space-y-0">
                      <div className="flex justify-between gap-4 py-2.5 border-b border-gray-100">
                        <span className="text-gray-500 shrink-0">PG TNX ID</span>
                        <span className="font-medium text-gray-900 text-right truncate max-w-[60%]">
                          {pgTnxId}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 py-2.5 border-b border-gray-100">
                        <span className="text-gray-500 shrink-0">Account no.</span>
                        <span className="font-medium text-gray-900 tabular-nums">{accountMasked}</span>
                      </div>
                      <div className="flex justify-between gap-4 py-2.5 border-b border-gray-100">
                        <span className="text-gray-500 shrink-0">Account holder</span>
                        <span className="font-medium text-gray-900 text-right">{accountHolder}</span>
                      </div>
                      {bankName ? (
                        <div className="flex justify-between gap-4 py-2.5">
                          <span className="text-gray-500 shrink-0">Bank</span>
                          <span className="font-medium text-gray-900 text-right">{bankName}</span>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h2 className="text-sm font-semibold text-gray-900">Store</h2>
                    </div>
                    <div className="p-4 sm:p-5 text-sm text-gray-700 space-y-1">
                      <p className="font-medium text-gray-900">{storeName}</p>
                      {storePublicId ? (
                        <p className="text-xs text-gray-500">Store ID: {storePublicId}</p>
                      ) : null}
                      {storeLocation ? (
                        <p className="text-xs text-gray-500">{storeLocation}</p>
                      ) : null}
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Orders in this payout</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {filteredOrderBreakdowns.length}{' '}
                      {filteredOrderBreakdowns.length === 1 ? 'order' : 'orders'}
                      {orderTypeFilter !== 'all'
                        ? ` · ${payoutOrderTypeFilterLabel(orderTypeFilter)}`
                        : ''}
                    </p>
                  </div>
                </div>

                {filteredOrderBreakdowns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-sm text-gray-500">
                    {orderBreakdowns.length === 0
                      ? 'No orders in this payout period.'
                      : `No ${orderTypeFilter === 'all' ? '' : `${orderTypeFilter} `}orders in this payout period.`}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[960px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-left">
                          <th className="py-3 px-5 font-semibold text-gray-700 text-xs">Order ID</th>
                          <th className="py-3 px-5 font-semibold text-gray-700 text-xs">Fulfillment</th>
                          <th className="py-3 px-5 font-semibold text-gray-700 text-xs">Settlement</th>
                          <th className="py-3 px-5 font-semibold text-gray-700 text-xs">Date &amp; payment</th>
                          <th className="py-3 px-5 font-semibold text-gray-700 text-xs text-right">
                            {MERCHANT_GROSS_REVENUE_LABEL}
                          </th>
                          <th className="py-3 px-5 font-semibold text-gray-700 text-xs text-right">
                            Net receivable
                          </th>
                          <th className="py-3 px-5 font-semibold text-gray-700 text-xs text-right">
                            Unsettled
                          </th>
                          <th className="py-3 px-5 font-semibold text-gray-700 text-xs text-right">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredOrderBreakdowns.map((item) => (
                          <OrderPayoutTableRow
                            key={item.entry.id}
                            item={item}
                            payoutStatus={status}
                            onOpen={() => openOrderSheet(item)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </MXLayoutWhite>

    <PayoutOrderDetailSheet
      open={orderSheetTarget != null}
      onClose={closeOrderSheet}
      storeId={storeId}
      store={storeRecord ?? null}
      ordersCoreId={orderSheetTarget?.ordersCoreId ?? null}
      ordersFoodId={orderSheetTarget?.foodOrderId ?? null}
      formattedOrderId={orderSheetTarget?.formattedOrderId ?? null}
      fallbackOrderId={
        orderSheetTarget?.ordersCoreId ??
        orderSheetTarget?.foodOrderId ??
        orderSheetTarget?.displayOrderId ??
        null
      }
    />
    </>
  );
}
