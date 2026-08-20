'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { OrderPageOverlay } from '@/components/orders/OrderPageOverlay';
import type { OrderPaymentDetail, OrderPaymentRecord } from '@/lib/orders/order-payment-types';
import {
  formatPaymentInstrumentSource,
  formatPaymentModeOnlineOrCash,
} from '@/lib/orders/order-payment-display';
import type { OrderItemsPricing } from '@/lib/orderItemsPayload';
import {
  customerDiscountFromOrderPricing,
  customerDeliveryFromOrderPricing,
} from '@/lib/orderItemsPayload';
import type { OrderDiscountOfferSource } from '@/lib/merchant-billing-discount';
import {
  classifyRefund,
  isRefundSettled,
  isRefundFailed,
  settledRefundTotal,
} from '@/lib/orders/refund-status';
import { resolveRefundLogIds, refundInitiatedByLabel } from '@/lib/orders/refund-log-ids';
import {
  resolveCustomerCtcPaidAmount,
  resolveRefundCoinCashSplit,
} from '@/lib/orders/customer-ctc';
import { CustomerCtcIconSplit } from '@/components/orders/CustomerCtcIconSplit';
import { formatInrWithGap } from '@/lib/format-inr';

interface OrderForPaymentCard {
  id: number;
  orderType: string;
  orderSource: string | null;
  paymentStatus: string | null;
  paymentMethod?: string | null;
  fareAmount?: number | null;
  totalAmount?: number | null;
  itemTotal?: number | null;
  addonTotal?: number | null;
  grandTotal?: number | null;
  tipAmount?: number | null;
}

interface OrderRefundForDisplay {
  id: number;
  refundReason: string;
  refundAmount: string;
  refundStatus: string | null;
  /** Executor state — decides whether money actually moved. */
  executionStatus?: string | null;
  executionRoute?: string | null;
  failureReason?: string | null;
  /** Customer-facing unique RRN (RRN-{UUID}). */
  refundReference?: string | null;
  /** Original GatiCash payment transaction id (GC-{UUID}). */
  originalGatiCashTxnId?: string | null;
  /** Razorpay refund id (rfnd_…) — preferred over ordinal labels. */
  razorpayRefundId?: string | null;
  pgRefundId?: string | null;
  /** Wallet credit ledger id for GatiCash / wallet refunds. */
  customerWalletLedgerId?: number | null;
  splitWalletAmount?: number | null;
  splitRazorpayAmount?: number | null;
  refundInitiatedBy?: string | null;
  initiatedByEmail: string | null;
  createdAt: string;
  refundType?: string | null;
  refundMetadata?: Record<string, unknown> | null;
}

type RefundItemLine = {
  id: number;
  name: string;
  amount: number | null;
  refundPercentage: number | null;
};

function refundItemLines(r: OrderRefundForDisplay): RefundItemLine[] {
  const meta = r.refundMetadata;
  const raw = meta && Array.isArray(meta.refundItems) ? meta.refundItems : [];
  const out: RefundItemLine[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const name =
      String(row.name ?? row.itemName ?? row.item_name ?? "").trim() || `Item #${id}`;
    const amountRaw = Number(row.amount);
    const pctRaw = Number(row.refundPercentage);
    out.push({
      id,
      name,
      amount: Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null,
      refundPercentage: Number.isFinite(pctRaw) && pctRaw > 0 ? pctRaw : null,
    });
  }
  return out;
}

function refundMethodsLabel(r: OrderRefundForDisplay): string {
  const wallet = Number(r.splitWalletAmount ?? 0);
  const gateway = Number(r.splitRazorpayAmount ?? 0);
  const parts: string[] = [];
  if (wallet > 0.005) parts.push(`GatiCash ${formatInrWithGap(wallet)}`);
  if (gateway > 0.005) parts.push(`Gateway ${formatInrWithGap(gateway)}`);
  if (parts.length > 0) return parts.join(' + ');
  const route = String(r.executionRoute ?? '').toUpperCase();
  if (route === 'WALLET') return 'GatiCash';
  if (route === 'RAZORPAY') return 'Gateway';
  if (route === 'MIXED') return 'GatiCash + Gateway';
  if (r.customerWalletLedgerId) return 'GatiCash';
  if (r.razorpayRefundId) return 'Gateway';
  return '—';
}

interface OrderRecoveryRecordForDisplay {
  id: string;
  party: 'rider' | 'merchant';
  partyLabel: string;
  kind: string;
  reason: string | null;
  amount: number;
  impact: 'debit' | 'credit' | 'info';
  /** Whether the debit was partial or full. */
  debitScope?: 'partial' | 'full' | null;
  status: string | null;
  createdAt: string | null;
}

interface PaymentDetailsProps {
  order: OrderForPaymentCard;
  displayId: string;
  orderRefunds?: OrderRefundForDisplay[];
  recoveryRecords?: OrderRecoveryRecordForDisplay[];
  paymentDetail?: OrderPaymentDetail | null;
  orderItemsPricing?: OrderItemsPricing | null;
  onPrefetchOrderItems?: () => void;
}

const formatCurrency = (value?: number | null) => formatInrWithGap(value);

const paymentDetailRowClass =
  'text-[12px] flex flex-nowrap items-center gap-x-1.5 whitespace-nowrap min-w-0 overflow-x-auto';

const formatPlain = (value?: string | number | boolean | null) => {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const formatNum = (value?: number | null) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(2);
};

function discountOfferPillClass(source: OrderDiscountOfferSource): string {
  if (source === 'Platform') {
    return 'bg-violet-50 text-violet-700 border-violet-100';
  }
  if (source === 'Store') {
    return 'bg-amber-50 text-amber-800 border-amber-100';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

const TH =
  'text-left py-2.5 px-3 text-[10px] font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap align-middle';
const TD = 'py-3 px-3 text-[11px] text-gray-900 whitespace-nowrap align-middle';

interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: OrderPaymentRecord[];
  orderRefunds?: OrderRefundForDisplay[];
  recoveryRecords?: OrderRecoveryRecordForDisplay[];
  summary: {
    totalAmount: number | null;
    totalCtm: number | null;
    deliveryFee: number | null;
    deliveryFeeQuoted?: number | null;
    deliveryFeeWaived?: boolean;
    taxes?: number | null;
    gatiCashUsed?: number | null;
  };
}

function formatSignedCurrency(amount: number, impact: 'debit' | 'credit' | 'info') {
  const abs = Math.abs(amount);
  const value = formatInrWithGap(abs);
  if (impact === 'debit') return `-${value}`;
  if (impact === 'credit') return `+${value}`;
  return value;
}

function impactBadge(impact: 'debit' | 'credit' | 'info'): {
  label: string;
  className: string;
} {
  if (impact === 'debit') {
    return { label: 'Debited', className: 'bg-red-100 text-red-800' };
  }
  if (impact === 'credit') {
    return { label: 'Credited', className: 'bg-emerald-100 text-emerald-800' };
  }
  return { label: 'No credit', className: 'bg-slate-100 text-slate-600' };
}

function RefundLogIdsCell({ r }: { r: OrderRefundForDisplay }) {
  const [copiedSource, setCopiedSource] = useState<string | null>(null);
  const lines = resolveRefundLogIds(r);
  if (lines.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  const copyId = (source: string, id: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(id).then(() => {
      setCopiedSource(source);
      window.setTimeout(() => {
        setCopiedSource((cur) => (cur === source ? null : cur));
      }, 1400);
    });
  };

  return (
    <ul className="space-y-1">
      {lines.map((line) => (
        <li key={line.source} className="whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              {line.label}
            </span>
            <span
              className={`font-mono text-[10px] font-semibold whitespace-nowrap ${
                line.pending ? 'text-amber-800' : 'text-red-700'
              }`}
            >
              {line.id}
            </span>
            {!line.pending ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center opacity-80 hover:opacity-100"
                onClick={() => copyId(line.source, line.id)}
                aria-label={`Copy ${line.label} refund id`}
                title="Copy ID"
              >
                {copiedSource === line.source ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gati-primary" />
                )}
                <span className="sr-only">Copy</span>
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DeliveryFeeAmount({
  charged,
  quoted,
  waived,
  className = '',
}: {
  charged: number | null | undefined;
  quoted?: number | null;
  waived?: boolean;
  className?: string;
}) {
  const quotedNum =
    quoted != null && Number.isFinite(Number(quoted)) && Number(quoted) > 0
      ? Number(quoted)
      : null;
  const chargedNum =
    charged != null && Number.isFinite(Number(charged)) ? Number(charged) : null;
  const paidDisplay = waived ? 0 : chargedNum;
  /** Strike only for membership: waived to ₹0, or quoted (pre-benefit) > what the customer paid. */
  const showStrike =
    quotedNum != null &&
    (Boolean(waived) ||
      (paidDisplay != null && quotedNum > paidDisplay + 0.009));

  if (showStrike) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <span className="line-through text-slate-400 decoration-slate-400 orders-num">
          {formatCurrency(quotedNum)}
        </span>
        <span className="orders-num">{formatCurrency(paidDisplay ?? 0)}</span>
      </span>
    );
  }

  return <span className={`orders-num ${className}`}>{formatCurrency(paidDisplay ?? chargedNum)}</span>;
}

function debitScopeBadge(scope: 'partial' | 'full' | null | undefined): {
  label: string;
  className: string;
} | null {
  if (scope === 'partial') {
    return { label: 'Partial', className: 'bg-amber-100 text-amber-800' };
  }
  if (scope === 'full') {
    return { label: 'Full', className: 'bg-indigo-100 text-indigo-800' };
  }
  return null;
}

function PaymentDetailsModal({
  isOpen,
  onClose,
  records,
  orderRefunds = [],
  recoveryRecords = [],
  summary,
}: PaymentDetailsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'payment' | 'refund' | 'penalty'>(
    'payment'
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setActiveView('payment');
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const settledRefunds = orderRefunds.filter(isRefundSettled);
  const totalAmount = summary.totalAmount ?? records.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const totalDeliveryFee =
    summary.deliveryFee ?? records.reduce((sum, r) => sum + (r.deliveryFee ?? 0), 0);
  const totalGatiCash =
    summary.gatiCashUsed ??
    records.reduce((sum, r) => sum + (r.gatiCashUsed ?? 0), 0);
  const totalRefundAmount = settledRefunds.reduce(
    (sum, r) => sum + (Number(r.refundAmount) || 0),
    0
  );
  const refundIconSplit = resolveRefundCoinCashSplit({
    refundAmount: totalRefundAmount,
    originalCashin: Math.max(0, (Number(totalAmount) || 0) - (Number(totalGatiCash) || 0)),
    originalGatiCash: Number(totalGatiCash) || 0,
    refunds: settledRefunds,
  });
  const receivedCount = records.length;
  const refundTxnCount = settledRefunds.length;
  const totalTransactions = receivedCount + refundTxnCount;
  const refundedCount = records.filter((r) => r.refunded || r.partialRefunded).length;
  const showGatiCash = totalGatiCash > 0;
  const totalRiderPenalty = recoveryRecords
    .filter((r) => r.party === 'rider' && r.impact === 'debit')
    .reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);
  const totalMerchantDebit = recoveryRecords
    .filter((r) => r.party === 'merchant' && r.impact === 'debit')
    .reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);
  const totalMerchantCredit = recoveryRecords
    .filter((r) => r.party === 'merchant' && r.impact === 'credit')
    .reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);

  return (
    <OrderPageOverlay
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Payment Details"
        className="bg-white rounded-lg shadow-lg max-w-[min(96vw,1100px)] w-full p-5 text-[12px] text-slate-800 max-h-[90vh] overflow-auto"
      >
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-base font-semibold text-slate-900">Payment Details</h2>
          <div className="flex items-center gap-2">
            <select
              value={activeView}
              onChange={(e) =>
                setActiveView(e.target.value as 'payment' | 'refund' | 'penalty')
              }
              className="text-[12px] font-medium text-slate-700 border border-gray-300 rounded-md px-2 py-1 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="payment">Payment Details</option>
              <option value="refund">Refund Records</option>
              <option value="penalty">Penalty &amp; Recovery Records</option>
            </select>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {activeView === 'payment' && (
        <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className={TH}>Payment Id</th>
                <th className={TH}>Transaction Id</th>
                <th className={TH}>GM Transaction Id</th>
                <th className={TH}>Payment Status</th>
                <th className={TH}>Payment Mode</th>
                <th className={TH}>Source</th>
                <th className={TH}>Amount (CTC)</th>
                <th className={TH}>Cashin</th>
                <th className={TH}>GatiCash Used</th>
                <th className={TH}>CTM</th>
                <th className={TH}>Delivery Fee</th>
                <th className={TH}>Taxes</th>
                <th className={TH}>PG Name</th>
                <th className={TH}>PG Transaction Id</th>
                <th className={TH}>Refunded</th>
                <th className={TH}>Partial Refund Amt</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((record, index) => {
                const ctc = record.ctc ?? record.amount;
                const gati =
                  record.gatiCashUsed != null && record.gatiCashUsed > 0
                    ? record.gatiCashUsed
                    : null;
                const cashin =
                  record.cashin != null && Number.isFinite(record.cashin)
                    ? record.cashin
                    : ctc != null && Number.isFinite(ctc)
                      ? Math.round((Number(ctc) - (gati ?? 0)) * 100) / 100
                      : null;
                const refundedLabel = record.partialRefunded
                  ? 'Partial'
                  : record.refunded
                    ? 'Yes'
                    : '—';
                return (
                <tr
                  key={`${record.paymentId}-${index}`}
                  className={`hover:bg-gray-50 transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  <td className={`${TD} font-medium orders-num`}>{record.paymentId}</td>
                  <td className={`${TD} font-mono`}>{formatPlain(record.transactionId)}</td>
                  <td className={`${TD} font-mono`}>{formatPlain(record.mpTransactionId)}</td>
                  <td className={TD}>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        record.paymentStatus.toLowerCase().includes('refund') ||
                        record.refunded ||
                        record.partialRefunded
                          ? 'bg-red-100 text-red-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {record.paymentStatus}
                    </span>
                  </td>
                  <td className={TD}>{formatPlain(record.paymentMode)}</td>
                  <td className={`${TD} font-medium`}>{formatPlain(record.source)}</td>
                  <td className={`${TD} tabular-nums font-medium`}>{formatNum(ctc)}</td>
                  <td className={`${TD} tabular-nums`}>{formatNum(cashin)}</td>
                  <td className={`${TD} tabular-nums font-medium text-teal-800`}>
                    {formatNum(gati)}
                  </td>
                  <td className={`${TD} tabular-nums font-medium text-emerald-800`}>
                    {formatNum(record.ctm)}
                  </td>
                  <td className={`${TD} tabular-nums`}>
                    <DeliveryFeeAmount
                      charged={record.deliveryFee}
                      quoted={summary.deliveryFeeQuoted}
                      waived={summary.deliveryFeeWaived}
                      className="text-[11px] text-gray-900"
                    />
                  </td>
                  <td className={`${TD} tabular-nums`}>
                    {formatNum(record.taxes ?? summary.taxes)}
                  </td>
                  <td className={TD}>{formatPlain(record.pgName)}</td>
                  <td className={`${TD} font-mono`}>
                    {formatPlain(record.pgTransactionId)}
                  </td>
                  <td className={TD}>
                    {refundedLabel === '—' ? (
                      '—'
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          record.partialRefunded
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {refundedLabel}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} tabular-nums font-medium ${record.partialRefunded ? 'text-red-700' : ''}`}>
                    {record.partialRefunded
                      ? formatNum(record.partiallyRefundedAmount)
                      : '—'}
                  </td>
                </tr>
                );
              })}
              {records.length === 0 && (
                <tr>
                  <td className="py-4 px-4 text-sm text-gray-500 text-center" colSpan={16}>
                    No payment records found for this order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}

        {activeView === 'payment' && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-[12px]">
          <h4 className="text-xs font-semibold text-slate-800 mb-3">Summary</h4>
          <div
            className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${
              showGatiCash ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
            }`}
          >
            <div className="bg-white p-3 rounded-md border border-gray-200">
              <p className="text-[11px] font-medium text-gray-600">Total Transactions</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{totalTransactions}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Received {receivedCount}
                {refundTxnCount > 0 ? ` · Refund ${refundTxnCount}` : ''}
              </p>
            </div>
            <div className="bg-white p-3 rounded-md border border-gray-200 min-w-0 overflow-hidden">
              <p className="text-[11px] font-medium text-gray-600">Total amount (CTC)</p>
              <p className="text-lg font-bold text-gray-900 orders-num mt-1">
                {formatCurrency(totalAmount)}
              </p>
              <div className="mt-1.5 min-w-0">
                <CustomerCtcIconSplit
                  cashin={Math.max(
                    0,
                    (Number(totalAmount) || 0) - (Number(totalGatiCash) || 0)
                  )}
                  gatiCashUsed={Number(totalGatiCash) || 0}
                  formatCurrency={formatCurrency}
                  className="max-w-full"
                />
              </div>
            </div>
            <div className="bg-white p-3 rounded-md border border-emerald-200">
              <p className="text-[11px] font-medium text-emerald-800">Merchant amount (CTM)</p>
              <p className="text-lg font-bold text-emerald-900 mt-1">
                {formatCurrency(summary.totalCtm)}
              </p>
            </div>
            {showGatiCash ? (
              <div className="bg-white p-3 rounded-md border border-teal-200">
                <p className="text-[11px] font-medium text-teal-800">GatiCash used</p>
                <p className="text-lg font-bold text-teal-900 mt-1">
                  {formatCurrency(totalGatiCash)}
                </p>
              </div>
            ) : null}
            <div className="bg-red-50 p-3 rounded-md border border-red-200">
              <p className="text-[11px] font-medium text-red-600">
                {refundTxnCount > 0 ? 'Refunded amount' : 'Refunded Items'}
              </p>
              <p className="text-lg font-bold text-red-900 mt-1">
                {refundTxnCount > 0
                  ? formatCurrency(totalRefundAmount)
                  : refundedCount}
              </p>
              {refundTxnCount > 0 ? (
                <>
                  <p className="mt-0.5 text-[10px] text-red-600/80">
                    {refundTxnCount} refund{refundTxnCount === 1 ? '' : 's'}
                  </p>
                  <div className="mt-1.5">
                    <CustomerCtcIconSplit
                      cashin={refundIconSplit.cashin}
                      gatiCashUsed={refundIconSplit.gatiCashUsed}
                      formatCurrency={formatCurrency}
                      className="max-w-full text-red-800"
                    />
                  </div>
                </>
              ) : null}
            </div>
            <div className="bg-white p-3 rounded-md border border-gray-200">
              <p className="text-[11px] font-medium text-gray-600">Delivery charges</p>
              <p className="text-lg font-bold text-gray-900 mt-1">
                <DeliveryFeeAmount
                  charged={totalDeliveryFee}
                  quoted={summary.deliveryFeeQuoted}
                  waived={summary.deliveryFeeWaived}
                />
              </p>
            </div>
          </div>
        </div>
        )}

        {activeView === 'refund' && (
          <div>
            {orderRefunds.length > 0 ? (
              <>
                <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 [-webkit-overflow-scrolling:touch]">
                  <table className="w-full min-w-[1100px] border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={TH}>Refund ID(s)</th>
                        <th className={TH}>Reason</th>
                        <th className={TH}>Item(s)</th>
                        <th className={TH}>Amount</th>
                        <th className={TH}>Method(s)</th>
                        <th className={TH}>Status</th>
                        <th className={TH}>Initiated By</th>
                        <th className={TH}>Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {orderRefunds.map((r) => {
                        const amt = Number(r.refundAmount);
                        const outcome = classifyRefund(r);
                        const statusLabel =
                          outcome === 'settled'
                            ? r.refundStatus?.trim() || 'completed'
                            : outcome === 'failed'
                              ? 'failed'
                              : 'pending';
                        const statusClass =
                          outcome === 'settled'
                            ? 'bg-emerald-100 text-emerald-800'
                            : outcome === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-900';
                        const itemLines = refundItemLines(r);
                        return (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className={TD}>
                              <RefundLogIdsCell r={r} />
                            </td>
                            <td className={TD}>{formatPlain(r.refundReason)}</td>
                            <td className={`${TD} max-w-[220px]`}>
                              {itemLines.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <ul className="space-y-0.5">
                                  {itemLines.map((line) => (
                                    <li key={`${r.id}-${line.id}`} className="text-[10px] leading-snug text-slate-700">
                                      <span className="font-medium text-slate-800">{line.name}</span>
                                      {line.refundPercentage != null ? (
                                        <span className="text-slate-500"> · {line.refundPercentage}%</span>
                                      ) : null}
                                      {line.amount != null ? (
                                        <span className="tabular-nums text-red-700">
                                          {" "}
                                          · {formatInrWithGap(line.amount)}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td className={`${TD} tabular-nums font-semibold text-red-700`}>
                              {Number.isFinite(amt) ? `-${formatInrWithGap(amt)}` : '—'}
                            </td>
                            <td className={`${TD} text-[10px] text-slate-700`}>
                              {refundMethodsLabel(r)}
                            </td>
                            <td className={TD}>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${statusClass}`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                            <td className={TD}>{refundInitiatedByLabel(r)}</td>
                            <td className={TD}>
                              {new Date(r.createdAt).toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-slate-700">
                  Total refunded: {formatCurrency(totalRefundAmount)}
                </p>
              </>
            ) : (
              <div className="py-10 text-center text-sm text-gray-500 rounded-lg border border-dashed border-gray-200">
                No refund records for this order.
              </div>
            )}
          </div>
        )}

        {activeView === 'penalty' && (
          <div>
            {recoveryRecords.length > 0 ? (
              <>
                <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 [-webkit-overflow-scrolling:touch]">
                  <table className="w-full min-w-[960px] border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={TH}>Charged To</th>
                        <th className={TH}>Type</th>
                        <th className={TH}>Reason</th>
                        <th className={TH}>Amount</th>
                        <th className={TH}>Debit Scope</th>
                        <th className={TH}>Wallet Impact</th>
                        <th className={TH}>Status</th>
                        <th className={TH}>Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {recoveryRecords.map((rec) => {
                        const isRider = rec.party === 'rider';
                        const amountClass =
                          rec.impact === 'credit'
                            ? 'text-emerald-700'
                            : rec.impact === 'debit'
                              ? 'text-red-700'
                              : 'text-slate-600';
                        const scope = debitScopeBadge(rec.debitScope);
                        return (
                          <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                            <td className={`${TD} font-medium`}>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isRider
                                    ? 'bg-sky-100 text-sky-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {rec.partyLabel}
                              </span>
                            </td>
                            <td className={TD}>{formatPlain(rec.kind)}</td>
                            <td className="py-3 px-3 text-[11px] text-gray-900 align-middle min-w-[200px] max-w-[280px]">
                              <p className="whitespace-normal break-words leading-snug">
                                {formatPlain(rec.reason)}
                              </p>
                            </td>
                            <td className={`${TD} tabular-nums font-semibold ${amountClass}`}>
                              {formatSignedCurrency(rec.amount, rec.impact)}
                            </td>
                            <td className={TD}>
                              {scope ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${scope.className}`}
                                >
                                  {scope.label}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className={TD}>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${impactBadge(rec.impact).className}`}
                              >
                                {impactBadge(rec.impact).label}
                              </span>
                            </td>
                            <td className={TD}>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 capitalize">
                                {rec.status?.trim() || '—'}
                              </span>
                            </td>
                            <td className={TD}>
                              {rec.createdAt
                                ? new Date(rec.createdAt).toLocaleString('en-IN', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-700">
                  {totalRiderPenalty > 0 && (
                    <span>Rider penalty: -{formatCurrency(totalRiderPenalty)}</span>
                  )}
                  {totalMerchantDebit > 0 && (
                    <span>Merchant debited: -{formatCurrency(totalMerchantDebit)}</span>
                  )}
                  {totalMerchantCredit > 0 && (
                    <span>Merchant credited: +{formatCurrency(totalMerchantCredit)}</span>
                  )}
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-sm text-gray-500 rounded-lg border border-dashed border-gray-200">
                No penalty or recovery records for this order.
              </div>
            )}
          </div>
        )}
      </div>
    </OrderPageOverlay>
  );
}

export default function PaymentDetails({
  order,
  displayId,
  orderRefunds = [],
  recoveryRecords = [],
  paymentDetail = null,
  orderItemsPricing = null,
  onPrefetchOrderItems,
}: PaymentDetailsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    onPrefetchOrderItems?.();
  }, [onPrefetchOrderItems]);

  // Only refunds that actually moved money count towards "Refunded" / totals —
  // a FAILED or never-executed row must not make the order look refunded.
  const hasRefundRecords = orderRefunds.some(isRefundSettled);
  const hasFailedRefundOnly =
    !hasRefundRecords && orderRefunds.some(isRefundFailed);
  const totalRefundFromRefunds = settledRefundTotal(orderRefunds);

  const resolved = useMemo(() => {
    const customerFromItems = orderItemsPricing?.customer?.totalOrderAmount;
    const merchantFromItems = orderItemsPricing?.totalOrderAmount;
    const itemsDiscount = customerDiscountFromOrderPricing(orderItemsPricing);
    const itemsDelivery = customerDeliveryFromOrderPricing(orderItemsPricing);
    const taxesFromItems =
      orderItemsPricing?.customer?.gst ?? orderItemsPricing?.gst ?? null;

    const pickMerchantAmount = (
      apiCtm: number | null | undefined,
      customerTotal: number | null | undefined
    ): number | null => {
      if (merchantFromItems != null && merchantFromItems > 0) {
        if (customerTotal == null || merchantFromItems < customerTotal - 0.01) {
          return merchantFromItems;
        }
      }
      if (
        apiCtm != null &&
        apiCtm > 0 &&
        (customerTotal == null || apiCtm < customerTotal - 0.01)
      ) {
        return apiCtm;
      }
      return merchantFromItems ?? apiCtm ?? null;
    };

    const pickDiscount = (
      apiCustomer: number | null | undefined,
      apiMerchant: number | null | undefined,
      apiSource: OrderDiscountOfferSource | null | undefined
    ) => {
      const fromItems =
        itemsDiscount.amount != null && itemsDiscount.amount > 0 ? itemsDiscount.amount : 0;
      const fromMerchantLines = (orderItemsPricing?.lines ?? [])
        .filter((l) => l.key === 'store_offer')
        .reduce((s, l) => s + Math.abs(l.amount), 0);
      const fromApiCustomer = apiCustomer != null && apiCustomer > 0 ? apiCustomer : 0;
      const fromApiMerchant = apiMerchant != null && apiMerchant > 0 ? apiMerchant : 0;
      const customerAmount = Math.max(fromItems, fromApiCustomer);
      const merchantAmount = Math.max(fromMerchantLines, fromApiMerchant);
      const offerSource =
        merchantAmount > 0.005 || customerAmount > 0.005
          ? apiSource ?? itemsDiscount.offerSource ?? (merchantAmount > 0.005 ? 'Store' : null)
          : apiSource ?? itemsDiscount.offerSource ?? null;
      return { customerAmount, merchantAmount, offerSource };
    };

    const pickDelivery = (
      apiFee: number | null | undefined,
      apiQuoted: number | null | undefined,
      apiWaived: boolean | undefined
    ) => {
      if (itemsDelivery.amount != null || itemsDelivery.waived) {
        return {
          amount: itemsDelivery.amount,
          quoted: itemsDelivery.quoted,
          waived: itemsDelivery.waived,
        };
      }
      const waived = Boolean(apiWaived);
      const quoted = apiQuoted ?? null;
      const amount =
        waived && quoted != null && quoted > 0
          ? quoted
          : apiFee ?? (quoted != null && quoted > 0 ? quoted : null);
      return { amount, quoted, waived };
    };

    if (paymentDetail) {
      const isRefunded =
        hasRefundRecords ||
        paymentDetail.records.some((r) => r.refunded) ||
        (paymentDetail.refundAmount != null && paymentDetail.refundAmount > 0);
      const totalCtc =
        paymentDetail.totalAmount ??
        (customerFromItems != null && customerFromItems > 0 ? customerFromItems : null);
      const totalCtm = pickMerchantAmount(paymentDetail.totalCtm, totalCtc);
      const discount = pickDiscount(
        paymentDetail.totalDiscountGranted,
        paymentDetail.merchantStoreOfferDiscount,
        paymentDetail.discountOfferSource
      );
      const delivery = pickDelivery(
        paymentDetail.deliveryFee,
        paymentDetail.deliveryFeeQuoted,
        paymentDetail.deliveryFeeWaived
      );
      const paymentMode =
        paymentDetail.paymentMode ??
        formatPaymentModeOnlineOrCash(order.paymentMethod);
      const source =
        paymentDetail.source ??
        formatPaymentInstrumentSource(order.paymentMethod) ??
        (paymentMode === 'Cash' ? 'Cash' : null);

      const rowDeliveryFee = delivery.waived
        ? 0
        : delivery.amount != null
          ? delivery.amount
          : null;
      const gatiForRows = paymentDetail.gatiCashUsed ?? null;
      const taxesResolved =
        paymentDetail.taxes != null && paymentDetail.taxes > 0
          ? paymentDetail.taxes
          : taxesFromItems != null && taxesFromItems > 0
            ? taxesFromItems
            : null;

      const refundAmtResolved =
        paymentDetail.refundAmount != null && paymentDetail.refundAmount > 0
          ? paymentDetail.refundAmount
          : hasRefundRecords
            ? totalRefundFromRefunds
            : null;
      const isPartialResolved =
        Boolean(paymentDetail.partialRefunded) ||
        (refundAmtResolved != null &&
          totalCtc != null &&
          refundAmtResolved > 0 &&
          refundAmtResolved < totalCtc - 0.01);
      const isFullRefundResolved =
        (Boolean(isRefunded) || (refundAmtResolved != null && refundAmtResolved > 0)) &&
        !isPartialResolved &&
        refundAmtResolved != null &&
        refundAmtResolved > 0;

      // Keep table CTM / delivery fee / cashin / refund flags in sync with summary cards.
      const records = paymentDetail.records.map((r) => {
        const ctc = r.ctc ?? r.amount ?? totalCtc;
        const gati = r.gatiCashUsed ?? gatiForRows;
        const cashin =
          r.cashin != null && Number.isFinite(r.cashin)
            ? r.cashin
            : ctc != null && Number.isFinite(ctc)
              ? Math.round((Number(ctc) - (gati != null && gati > 0 ? gati : 0)) * 100) / 100
              : null;
        const rowRefundAmt =
          refundAmtResolved != null && refundAmtResolved > 0
            ? refundAmtResolved
            : r.partiallyRefundedAmount;
        return {
          ...r,
          ctm: totalCtm,
          deliveryFee: rowDeliveryFee ?? r.deliveryFee,
          taxes: r.taxes ?? taxesResolved,
          paymentMode: r.paymentMode ?? paymentMode,
          source: r.source ?? source,
          gatiCashUsed: gati != null && gati > 0 ? gati : null,
          cashin,
          ctc,
          pgTransactionId: r.pgTransactionId,
          refunded: isFullRefundResolved || (r.refunded && !isPartialResolved),
          partialRefunded: isPartialResolved || Boolean(r.partialRefunded),
          partiallyRefundedAmount: isPartialResolved ? rowRefundAmt : null,
        };
      });

      return {
        totalAmount: totalCtc,
        totalCtm,
        totalCashbackEarned: paymentDetail.totalCashbackEarned,
        gatiCashUsed: paymentDetail.gatiCashUsed ?? null,
        totalDiscountGranted: discount.customerAmount > 0.005 ? discount.customerAmount : 0,
        merchantStoreOfferDiscount: discount.merchantAmount > 0.005 ? discount.merchantAmount : 0,
        discountOfferSource: discount.offerSource,
        deliveryFee: delivery.amount,
        deliveryFeeQuoted: delivery.quoted,
        deliveryFeeWaived: delivery.waived,
        taxes: taxesResolved,
        source,
        paymentMode,
        partialRefunded: isPartialResolved,
        refundAmount: refundAmtResolved,
        isRefunded: Boolean(isRefunded) || isFullRefundResolved || isPartialResolved,
        records,
      };
    }

    const paymentStatus = order.paymentStatus ?? '—';
    const isRefunded =
      hasRefundRecords ||
      paymentStatus.toLowerCase().includes('refund') ||
      order.orderType.toLowerCase() === 'refund';
    const totalCtc =
      (order.grandTotal as number | null | undefined) ??
      (order.totalAmount as number | null | undefined) ??
      (order.fareAmount as number | null | undefined) ??
      (customerFromItems != null && customerFromItems > 0 ? customerFromItems : null) ??
      null;

    const discount = pickDiscount(null, null, null);
    const delivery = pickDelivery(null, null, false);
    const paymentMode = formatPaymentModeOnlineOrCash(order.paymentMethod);
    const source =
      formatPaymentInstrumentSource(order.paymentMethod) ??
      (paymentMode === 'Cash' ? 'Cash' : null);
    const totalCtm = pickMerchantAmount(null, totalCtc);

    return {
      totalAmount: totalCtc,
      totalCtm,
      totalCashbackEarned: null,
      gatiCashUsed: null,
      totalDiscountGranted: discount.customerAmount > 0.005 ? discount.customerAmount : 0,
      merchantStoreOfferDiscount: discount.merchantAmount > 0.005 ? discount.merchantAmount : 0,
      discountOfferSource: discount.offerSource,
      deliveryFee: delivery.amount,
      deliveryFeeQuoted: delivery.quoted,
      deliveryFeeWaived: delivery.waived,
      taxes: taxesFromItems != null && taxesFromItems > 0 ? taxesFromItems : null,
      source,
      paymentMode,
      partialRefunded: false,
      refundAmount: hasRefundRecords ? totalRefundFromRefunds : null,
      isRefunded,
      records: [
        {
          paymentId: displayId || `ORDER-${order.id}`,
          transactionId: null,
          mpTransactionId: null,
          paymentStatus,
          paymentMode,
          source,
          refunded: isRefunded,
          partialRefunded: false,
          partiallyRefundedAmount: null,
          amount: totalCtc,
          ctc: totalCtc,
          cashin:
            totalCtc != null && Number.isFinite(totalCtc)
              ? Math.round(Number(totalCtc) * 100) / 100
              : null,
          gatiCashUsed: null,
          ctm: totalCtm,
          deliveryFee: delivery.amount,
          taxes: taxesFromItems != null && taxesFromItems > 0 ? taxesFromItems : null,
          pgName: null,
          pgTransactionId: null,
        },
      ] as OrderPaymentRecord[],
    };
  }, [paymentDetail, order, displayId, hasRefundRecords, totalRefundFromRefunds, orderItemsPricing]);

  const refundCardSplit = resolveRefundCoinCashSplit({
    refundAmount: Number(resolved.refundAmount) || 0,
    originalCashin: Math.max(
      0,
      (Number(resolved.totalAmount) || 0) - (Number(resolved.gatiCashUsed) || 0)
    ),
    originalGatiCash: Number(resolved.gatiCashUsed) || 0,
    refunds: orderRefunds,
  });

  return (
    <>
      <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5] transition-all hover:shadow-md hover:border-gati-primary/20 h-full flex flex-col">
        <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-[#e5e5e5]">
          <span className="text-[13px] font-semibold text-gati-text-primary flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-700 text-xs font-semibold">
                P
              </span>
              <span>Payment details</span>
            </span>
          </span>
          {resolved.isRefunded ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">
              <i className="bi bi-check-circle-fill text-[12px]" />
              Refunded
            </span>
          ) : hasFailedRefundOnly ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-100"
              title="A refund was attempted but the payment gateway rejected it. No money has been returned."
            >
              <i className="bi bi-exclamation-triangle-fill text-[12px]" />
              Refund failed
            </span>
          ) : null}
        </div>
        <div className="space-y-1.5 flex-1">
          {(() => {
            const gati = Number(resolved.gatiCashUsed ?? 0) || 0;
            const { ctc, cashin } = resolveCustomerCtcPaidAmount({
              netPayable: Math.max(
                0,
                (Number(resolved.totalAmount ?? 0) || 0) - Math.max(0, gati)
              ),
              gatiCashUsed: gati,
              capturedAmount: resolved.totalAmount,
            });
            return (
              <div className="text-[12px] min-w-0">
                <div className="flex flex-nowrap items-center gap-x-1.5 overflow-x-auto whitespace-nowrap">
                  <span className="text-gati-text-secondary font-medium shrink-0">
                    Total Amount (CTC):
                  </span>
                  <span className="text-gati-text-primary font-semibold orders-num shrink-0">
                    {formatCurrency(ctc > 0 ? ctc : resolved.totalAmount)}
                  </span>
                  <CustomerCtcIconSplit
                    cashin={cashin}
                    gatiCashUsed={gati}
                    formatCurrency={formatCurrency}
                    nowrap
                    className="shrink-0"
                  />
                </div>
              </div>
            );
          })()}
          <p className={paymentDetailRowClass}>
            <span className="text-gati-text-secondary font-medium shrink-0">Merchant amount (CTM):</span>
            <span className="text-gati-text-primary font-semibold orders-num shrink-0">
              {formatCurrency(resolved.totalCtm)}
            </span>
          </p>
          {(() => {
            const merchOffer = Number(resolved.merchantStoreOfferDiscount ?? 0) || 0;
            const customerOffer = Number(resolved.totalDiscountGranted ?? 0) || 0;
            const showMerchant = merchOffer > 0.005;
            const showCustomerVsList =
              showMerchant && customerOffer > 0.005 && Math.abs(customerOffer - merchOffer) > 0.01;
            const offerPill = resolved.discountOfferSource ? (
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[9px] font-semibold leading-none ${discountOfferPillClass(resolved.discountOfferSource)}`}
              >
                {resolved.discountOfferSource}
              </span>
            ) : null;
            return (
              <>
                {showMerchant ? (
                  <p className={paymentDetailRowClass}>
                    <span className="text-gati-text-secondary font-medium shrink-0">
                      Restaurant store offer (CTM):
                    </span>
                    <span className="text-gati-text-primary font-medium orders-num shrink-0">
                      {formatCurrency(merchOffer)}
                    </span>
                    {offerPill}
                  </p>
                ) : (
                  <p className={paymentDetailRowClass}>
                    <span className="text-gati-text-secondary font-medium shrink-0">
                      Total Discount Granted on Ord:
                    </span>
                    <span className="text-gati-text-primary font-medium orders-num shrink-0">
                      {formatCurrency(customerOffer)}
                    </span>
                    {offerPill}
                  </p>
                )}
                {showCustomerVsList ? (
                  <p className={paymentDetailRowClass}>
                    <span className="text-gati-text-secondary font-medium shrink-0">
                      Customer discount vs list (CTC):
                    </span>
                    <span className="text-gati-text-primary font-medium orders-num shrink-0">
                      {formatCurrency(customerOffer)}
                    </span>
                  </p>
                ) : null}
              </>
            );
          })()}
          <p className={paymentDetailRowClass}>
            <span className="text-gati-text-secondary font-medium shrink-0">Delivery Fee:</span>
            <span className="text-gati-text-primary font-medium inline-flex shrink-0 items-center">
              <DeliveryFeeAmount
                charged={resolved.deliveryFeeWaived ? 0 : resolved.deliveryFee}
                quoted={resolved.deliveryFeeQuoted}
                waived={resolved.deliveryFeeWaived}
              />
            </span>
          </p>
          <p className={paymentDetailRowClass}>
            <span className="text-gati-text-secondary font-medium shrink-0">Source:</span>
            <span className="text-gati-text-primary font-medium shrink-0">{resolved.source ?? '—'}</span>
            <span className="text-gati-text-secondary shrink-0" aria-hidden>
              |
            </span>
            <span className="text-gati-text-secondary font-medium shrink-0">PaymentMode:</span>
            <span className="text-gati-text-primary font-medium shrink-0">
              {resolved.paymentMode ?? '—'}
            </span>
          </p>
          <p className={paymentDetailRowClass}>
            <span className="text-gati-text-secondary font-medium shrink-0">Partial Refunded:</span>
            <span className="text-gati-text-primary font-medium shrink-0">
              {resolved.partialRefunded ? 'True' : 'False'}
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="shrink-0 ml-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              (view details)
            </button>
          </p>
          {resolved.isRefunded &&
          resolved.refundAmount != null &&
          Number.isFinite(resolved.refundAmount) &&
          resolved.refundAmount > 0 ? (
            <div className="text-[12px] min-w-0">
              <div className="flex flex-nowrap items-center gap-x-1.5 overflow-x-auto whitespace-nowrap">
                <span className="text-gati-text-secondary font-medium shrink-0">Refund Amount:</span>
                <span className="text-gati-text-primary font-medium orders-num shrink-0">
                  {formatCurrency(resolved.refundAmount)}
                </span>
                <CustomerCtcIconSplit
                  cashin={refundCardSplit.cashin}
                  gatiCashUsed={refundCardSplit.gatiCashUsed}
                  formatCurrency={formatCurrency}
                  nowrap
                  className="shrink-0"
                />
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-auto flex h-7 shrink-0 items-center justify-end gap-2 border-t border-transparent pt-1">
          <button
            type="button"
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap py-0.5"
            onClick={() => setIsModalOpen(true)}
          >
            <span>Explore More</span>
            <i className="bi bi-chevron-right text-[10px]" />
          </button>
        </div>
      </div>

      <PaymentDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        records={resolved.records}
        orderRefunds={orderRefunds}
        recoveryRecords={recoveryRecords}
        summary={{
          totalAmount: resolved.totalAmount,
          totalCtm: resolved.totalCtm,
          deliveryFee: resolved.deliveryFeeWaived ? 0 : resolved.deliveryFee,
          deliveryFeeQuoted: resolved.deliveryFeeQuoted,
          deliveryFeeWaived: resolved.deliveryFeeWaived,
          taxes: resolved.taxes,
          gatiCashUsed: resolved.gatiCashUsed,
        }}
      />
    </>
  );
}
