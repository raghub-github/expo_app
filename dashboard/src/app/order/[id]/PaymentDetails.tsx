'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
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
  initiatedByEmail: string | null;
  createdAt: string;
}

interface OrderRecoveryRecordForDisplay {
  id: string;
  party: 'rider' | 'merchant';
  partyLabel: string;
  kind: string;
  reason: string | null;
  amount: number;
  impact: 'debit' | 'credit' | 'info';
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

const formatCurrency = (value?: number | null) => {
  if (value == null) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

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
  'text-left py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap';
const TD = 'py-2 px-3 text-[11px] text-gray-900 whitespace-nowrap';

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
    gatiCashUsed?: number | null;
  };
}

function formatSignedCurrency(amount: number, impact: 'debit' | 'credit' | 'info') {
  const abs = Math.abs(amount);
  const value = `₹${abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

  const totalAmount = summary.totalAmount ?? records.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const totalDeliveryFee =
    summary.deliveryFee ?? records.reduce((sum, r) => sum + (r.deliveryFee ?? 0), 0);
  const totalGatiCash =
    summary.gatiCashUsed ??
    records.reduce((sum, r) => sum + (r.gatiCashUsed ?? 0), 0);
  const totalRefundAmount = orderRefunds.reduce((sum, r) => sum + Number(r.refundAmount) || 0, 0);
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
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
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
                return (
                <tr
                  key={`${record.paymentId}-${index}`}
                  className={`hover:bg-gray-50 transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  <td className={`${TD} font-medium`}>{record.paymentId}</td>
                  <td className={`${TD} font-mono`}>{formatPlain(record.transactionId)}</td>
                  <td className={`${TD} font-mono`}>{formatPlain(record.mpTransactionId)}</td>
                  <td className={TD}>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        record.paymentStatus.toLowerCase().includes('refund')
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
                  <td className={`${TD} tabular-nums`}>{formatNum(record.deliveryFee)}</td>
                  <td className={TD}>{formatPlain(record.pgName)}</td>
                  <td className={`${TD} font-mono`}>
                    {formatPlain(record.pgTransactionId ?? record.transactionId)}
                  </td>
                  <td className={TD}>{record.refunded ? 'Yes' : '—'}</td>
                  <td className={`${TD} tabular-nums`}>{formatNum(record.partiallyRefundedAmount)}</td>
                </tr>
                );
              })}
              {records.length === 0 && (
                <tr>
                  <td className="py-4 px-4 text-sm text-gray-500 text-center" colSpan={15}>
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
              <p className="text-lg font-bold text-gray-900 mt-1">{records.length}</p>
            </div>
            <div className="bg-white p-3 rounded-md border border-gray-200">
              <p className="text-[11px] font-medium text-gray-600">Total amount (CTC)</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(totalAmount)}</p>
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
              <p className="text-[11px] font-medium text-red-600">Refunded Items</p>
              <p className="text-lg font-bold text-red-900 mt-1">{refundedCount}</p>
            </div>
            <div className="bg-white p-3 rounded-md border border-gray-200">
              <p className="text-[11px] font-medium text-gray-600">Delivery charges</p>
              <p className="text-lg font-bold text-gray-900 mt-1">
                {formatCurrency(totalDeliveryFee)}
              </p>
            </div>
          </div>
        </div>
        )}

        {activeView === 'refund' && (
          <div>
            {orderRefunds.length > 0 ? (
              <>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Refund records</h3>
                <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 [-webkit-overflow-scrolling:touch]">
                  <table className="w-full min-w-[720px] border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={TH}>#</th>
                        <th className={TH}>Reason</th>
                        <th className={TH}>Amount</th>
                        <th className={TH}>Status</th>
                        <th className={TH}>Initiated By</th>
                        <th className={TH}>Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {orderRefunds.map((r, index) => {
                        const amt = Number(r.refundAmount);
                        return (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className={`${TD} font-semibold text-red-700`}>
                              Refund #{index + 1}
                            </td>
                            <td className={TD}>{formatPlain(r.refundReason)}</td>
                            <td className={`${TD} tabular-nums font-semibold text-red-700`}>
                              {Number.isFinite(amt) ? `-₹${amt.toFixed(2)}` : '—'}
                            </td>
                            <td className={TD}>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800 capitalize">
                                {r.refundStatus?.trim() || 'initiated'}
                              </span>
                            </td>
                            <td className={TD}>{formatPlain(r.initiatedByEmail)}</td>
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
                <h3 className="text-sm font-semibold text-slate-800 mb-2">
                  Penalty &amp; recovery records
                </h3>
                <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 [-webkit-overflow-scrolling:touch]">
                  <table className="w-full min-w-[880px] border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={TH}>Charged To</th>
                        <th className={TH}>Type</th>
                        <th className={TH}>Reason</th>
                        <th className={TH}>Amount</th>
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
                            <td className={TD}>{formatPlain(rec.reason)}</td>
                            <td className={`${TD} tabular-nums font-semibold ${amountClass}`}>
                              {formatSignedCurrency(rec.amount, rec.impact)}
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
    </div>
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

  const hasRefundRecords = orderRefunds.length > 0;
  const totalRefundFromRefunds = orderRefunds.reduce(
    (sum, r) => sum + (Number(r.refundAmount) || 0),
    0
  );

  const resolved = useMemo(() => {
    const customerFromItems = orderItemsPricing?.customer?.totalOrderAmount;
    const merchantFromItems = orderItemsPricing?.totalOrderAmount;
    const itemsDiscount = customerDiscountFromOrderPricing(orderItemsPricing);
    const itemsDelivery = customerDeliveryFromOrderPricing(orderItemsPricing);

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
      apiAmount: number | null | undefined,
      apiSource: OrderDiscountOfferSource | null | undefined
    ) => {
      if (itemsDiscount.amount != null && itemsDiscount.amount > 0) {
        return {
          amount: itemsDiscount.amount,
          offerSource: itemsDiscount.offerSource ?? apiSource ?? null,
        };
      }
      return {
        amount: apiAmount ?? null,
        offerSource: apiSource ?? null,
      };
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

      const rowDeliveryFee = delivery.waived ? 0 : delivery.amount;
      const gatiForRows = paymentDetail.gatiCashUsed ?? null;

      // Keep table CTM / delivery fee / cashin in sync with summary cards.
      const records = paymentDetail.records.map((r) => {
        const ctc = r.ctc ?? r.amount ?? totalCtc;
        const gati = r.gatiCashUsed ?? gatiForRows;
        const cashin =
          r.cashin != null && Number.isFinite(r.cashin)
            ? r.cashin
            : ctc != null && Number.isFinite(ctc)
              ? Math.round((Number(ctc) - (gati != null && gati > 0 ? gati : 0)) * 100) / 100
              : null;
        return {
          ...r,
          ctm: totalCtm,
          deliveryFee: rowDeliveryFee ?? r.deliveryFee,
          paymentMode: r.paymentMode ?? paymentMode,
          source: r.source ?? source,
          gatiCashUsed: gati != null && gati > 0 ? gati : null,
          cashin,
          ctc,
          pgTransactionId: r.pgTransactionId ?? r.transactionId,
        };
      });

      return {
        totalAmount: totalCtc,
        totalCtm,
        totalCashbackEarned: paymentDetail.totalCashbackEarned,
        gatiCashUsed: paymentDetail.gatiCashUsed ?? null,
        totalDiscountGranted: discount.amount,
        discountOfferSource: discount.offerSource,
        deliveryFee: delivery.amount,
        deliveryFeeQuoted: delivery.quoted,
        deliveryFeeWaived: delivery.waived,
        source,
        paymentMode,
        partialRefunded: paymentDetail.partialRefunded,
        refundAmount:
          paymentDetail.refundAmount ??
          (hasRefundRecords ? totalRefundFromRefunds : null),
        isRefunded,
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

    const discount = pickDiscount(null, null);
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
      totalDiscountGranted: discount.amount,
      discountOfferSource: discount.offerSource,
      deliveryFee: delivery.amount,
      deliveryFeeQuoted: delivery.quoted,
      deliveryFeeWaived: delivery.waived,
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
          pgName: null,
          pgTransactionId: null,
        },
      ] as OrderPaymentRecord[],
    };
  }, [paymentDetail, order, displayId, hasRefundRecords, totalRefundFromRefunds, orderItemsPricing]);

  return (
    <>
      <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5] transition-all hover:shadow-md hover:border-gati-primary/20">
        <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-[#e5e5e5]">
          <span className="text-[13px] font-semibold text-gati-text-primary flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-700 text-xs font-semibold">
                P
              </span>
              <span>Payment details</span>
            </span>
          </span>
          {resolved.isRefunded && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">
              <i className="bi bi-check-circle-fill text-[12px]" />
              Refunded
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Total Amount (CTC):</span>{' '}
            <span className="text-gati-text-primary font-semibold">
              {formatCurrency(resolved.totalAmount)}
            </span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Merchant amount (CTM):</span>{' '}
            <span className="text-gati-text-primary font-semibold">
              {formatCurrency(resolved.totalCtm)}
            </span>
          </p>
          {resolved.gatiCashUsed != null &&
          Number.isFinite(resolved.gatiCashUsed) &&
          resolved.gatiCashUsed > 0 ? (
            <p className="text-[12px]">
              <span className="text-gati-text-secondary font-medium">GatiCash used:</span>{' '}
              <span className="text-gati-text-primary font-semibold">
                {formatCurrency(resolved.gatiCashUsed)}
              </span>
            </p>
          ) : null}
          <p className="text-[12px] flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-gati-text-secondary font-medium">
              Total Discount Granted on Ord:
            </span>{' '}
            <span className="text-gati-text-primary font-medium">
              {formatCurrency(resolved.totalDiscountGranted)}
            </span>
            {resolved.discountOfferSource ? (
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold leading-none ${discountOfferPillClass(resolved.discountOfferSource)}`}
              >
                {resolved.discountOfferSource}
              </span>
            ) : null}
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Delivery Fee:</span>{' '}
            {resolved.deliveryFeeWaived &&
            resolved.deliveryFeeQuoted != null &&
            resolved.deliveryFeeQuoted > 0 ? (
              <span className="text-gati-text-primary font-medium inline-flex items-center gap-1.5">
                <span className="line-through text-slate-400 decoration-slate-400">
                  {formatCurrency(resolved.deliveryFeeQuoted)}
                </span>
                <span>₹0.00</span>
              </span>
            ) : (
              <span className="text-gati-text-primary font-medium">
                {formatCurrency(resolved.deliveryFee)}
              </span>
            )}
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Source:</span>{' '}
            <span className="text-gati-text-primary font-medium">{resolved.source ?? '—'}</span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">PaymentMode:</span>{' '}
            <span className="text-gati-text-primary font-medium">
              {resolved.paymentMode ?? '—'}
            </span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Partial Refunded:</span>{' '}
            <span className="text-gati-text-primary font-medium">
              {resolved.partialRefunded ? 'True' : 'False'}
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="ml-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              (view details)
            </button>
          </p>
          {resolved.isRefunded &&
          resolved.refundAmount != null &&
          Number.isFinite(resolved.refundAmount) &&
          resolved.refundAmount > 0 ? (
            <p className="text-[12px]">
              <span className="text-gati-text-secondary font-medium">Refund Amount:</span>{' '}
              <span className="text-gati-text-primary font-medium">
                {formatCurrency(resolved.refundAmount)}
              </span>
            </p>
          ) : null}
        </div>
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer inline-flex items-center gap-1"
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
          gatiCashUsed: resolved.gatiCashUsed,
        }}
      />
    </>
  );
}
