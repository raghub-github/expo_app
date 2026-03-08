'use client';

import { useMemo, useRef, useEffect, useState } from 'react';

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

interface PaymentDetailsProps {
  order: OrderForPaymentCard;
  displayId: string;
  /** Refunds for this order; when present, show Refunded tag and refund details. */
  orderRefunds?: OrderRefundForDisplay[];
}

interface PaymentRecord {
  paymentId: string;
  transactionId?: string;
  mpTransactionId?: string;
  paymentStatus: string;
  redemptionType?: string;
  productType?: string;
  refunded: boolean;
  partialRefunded: boolean;
  amount?: number;
  deliveryFee?: number;
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

interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: PaymentRecord[];
  orderRefunds?: OrderRefundForDisplay[];
}

function PaymentDetailsModal({ isOpen, onClose, records, orderRefunds = [] }: PaymentDetailsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const totalAmount = records.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const refundedCount = records.filter((r) => r.refunded).length;
  const totalDeliveryFee = records.reduce((sum, r) => sum + (r.deliveryFee ?? 0), 0);
  const totalRefundAmount = orderRefunds.reduce((sum, r) => sum + Number(r.refundAmount) || 0, 0);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-lg max-w-5xl w-full p-5 text-[12px] text-slate-800 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900">Payment Details</h2>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Payment Id
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Transaction Id
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    MP TransactionId
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Payment Status
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Redemption Type
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Product Type
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Refunded
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Partial Refunded
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Amount
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                    Delivery Fee
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map((record, index) => (
                  <tr
                    key={`${record.paymentId}-${index}`}
                    className={`hover:bg-gray-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">
                      {record.paymentId}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {record.transactionId || '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-mono">
                      {record.mpTransactionId || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          record.paymentStatus.toLowerCase().includes('refund')
                            ? 'bg-red-100 text-red-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        <i
                          className={`bi ${
                            record.paymentStatus.toLowerCase().includes('refund')
                              ? 'bi-arrow-clockwise'
                              : 'bi-check-circle'
                          }`}
                        />
                        {record.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">
                      {record.redemptionType || '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {record.productType || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {record.refunded ? (
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium">
                          <i className="bi bi-check-circle" /> Yes
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {record.partialRefunded ? (
                        <span className="inline-flex items-center gap-1 text-sm text-amber-600 font-medium">
                          <i className="bi bi-check-circle" /> Yes
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">
                      {formatCurrency(record.amount)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {formatCurrency(record.deliveryFee)}
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td
                      className="py-4 px-4 text-sm text-gray-500 text-center"
                      colSpan={10}
                    >
                      No payment records found for this order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-[12px]">
          <h4 className="text-xs font-semibold text-slate-800 mb-3">Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-md border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-gray-600">Total Transactions</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">{records.length}</p>
                </div>
                <div className="p-2 bg-gray-100 rounded-md">
                  <i className="bi bi-list-ol text-gray-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-md border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-gray-600">Total Amount</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {formatCurrency(totalAmount)}
                  </p>
                </div>
                <div className="p-2 bg-emerald-100 rounded-md">
                  <i className="bi bi-currency-rupee text-emerald-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-red-50 p-3 rounded-md border border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-red-600">Refunded Items</p>
                  <p className="text-lg font-bold text-red-900 mt-1">{refundedCount}</p>
                </div>
                <div className="p-2 bg-red-100 rounded-md">
                  <i className="bi bi-arrow-clockwise text-red-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-md border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-gray-600">Delivery Charges</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {formatCurrency(totalDeliveryFee)}
                  </p>
                </div>
                <div className="p-2 bg-blue-100 rounded-md">
                  <i className="bi bi-truck text-blue-600 text-base" />
                </div>
              </div>
            </div>
          </div>
          {orderRefunds.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Refund records</h3>
              <div className="space-y-2">
                {orderRefunds.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-[12px]">
                    <p className="font-medium text-slate-800">{r.refundReason}</p>
                    <p className="text-slate-600 mt-0.5">
                      Amount: {formatCurrency(Number(r.refundAmount))}
                      {r.refundStatus && ` · Status: ${r.refundStatus}`}
                    </p>
                    <p className="text-slate-500 text-[11px] mt-1">
                      {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      {r.initiatedByEmail && ` · By: ${r.initiatedByEmail}`}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-slate-700">
                Total refunded: {formatCurrency(totalRefundAmount)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentDetails({ order, displayId, orderRefunds = [] }: PaymentDetailsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const paymentStatus = order.paymentStatus ?? '—';
  const hasRefundRecords = orderRefunds.length > 0;
  const isRefunded =
    hasRefundRecords ||
    paymentStatus.toLowerCase().includes('refund') ||
    order.orderType.toLowerCase() === 'refund';
  const totalRefundAmount = orderRefunds.reduce((sum, r) => sum + (Number(r.refundAmount) || 0), 0);

  const sourceLabel = order.orderSource ? order.orderSource.toString() : '—';
  const records: PaymentRecord[] = useMemo(
    () => [
      {
        paymentId: displayId || `ORDER-${order.id}`,
        transactionId: undefined,
        mpTransactionId: undefined,
        paymentStatus,
        redemptionType: order.orderSource ?? undefined,
        productType: order.orderType ?? undefined,
        refunded: isRefunded,
        partialRefunded: false,
        amount:
          (order.totalAmount as number | null | undefined) ??
          (order.fareAmount as number | null | undefined) ??
          undefined,
        deliveryFee: undefined,
      },
    ],
    [displayId, order.totalAmount, order.fareAmount, order.id, order.orderSource, order.orderType, isRefunded, paymentStatus]
  );

  const totalAmount =
    (order.grandTotal as number | null | undefined) ??
    (order.totalAmount as number | null | undefined) ??
    (order.fareAmount as number | null | undefined) ??
    null;

  const deliveryFee =
    totalAmount != null &&
    order.itemTotal != null &&
    order.addonTotal != null &&
    order.tipAmount != null
      ? totalAmount - order.itemTotal - order.addonTotal - order.tipAmount
      : null;

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
          {isRefunded && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">
              <i className="bi bi-check-circle-fill text-[12px]" />
              Refunded
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Total Amount:</span>{' '}
            <span className="text-gati-text-primary font-semibold">
              {formatCurrency(totalAmount)}
            </span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Total CTM:</span>{' '}
            <span className="text-gati-text-primary font-medium">—</span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">
              Total Cashback Earned:
            </span>{' '}
            <span className="text-gati-text-primary font-medium">—</span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Delivery Fee:</span>{' '}
            <span className="text-gati-text-primary font-medium">
              {deliveryFee != null ? formatCurrency(deliveryFee) : '—'}
            </span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Source:</span>{' '}
            <span className="text-gati-text-primary font-medium">{sourceLabel}</span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">PaymentMode:</span>{' '}
            <span className="text-gati-text-primary font-medium">
              {order.paymentMethod
                ? order.paymentMethod.toString().toUpperCase()
                : '—'}
            </span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">
              Partial Refunded:
            </span>{' '}
            <span className="text-gati-text-primary font-medium">
              {isRefunded ? 'True' : 'False'}
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="ml-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              (view details)
            </button>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Refund Amount:</span>{' '}
            <span className="text-gati-text-primary font-medium">
              {isRefunded ? formatCurrency(hasRefundRecords ? totalRefundAmount : totalAmount ?? null) : '—'}
            </span>
          </p>
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
        records={records}
        orderRefunds={orderRefunds}
      />
    </>
  );
}

