'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { OrderPaymentDetail, OrderPaymentRecord } from '@/lib/orders/order-payment-detail';
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

interface PaymentDetailsProps {
  order: OrderForPaymentCard;
  displayId: string;
  orderRefunds?: OrderRefundForDisplay[];
  paymentDetail?: OrderPaymentDetail | null;
  /** Loaded from items API — used to correct merchant amount when payment detail is stale. */
  orderItemsPricing?: OrderItemsPricing | null;
  /** Kick items fetch so discount / delivery appear without waiting on slow paymentDetail. */
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
  summary: {
    totalAmount: number | null;
    totalCtm: number | null;
    deliveryFee: number | null;
    totalCashbackEarned?: number | null;
  };
}

function PaymentDetailsModal({
  isOpen,
  onClose,
  records,
  orderRefunds = [],
  summary,
}: PaymentDetailsModalProps) {
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

  const totalAmount = summary.totalAmount ?? records.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const refundedCount = records.filter((r) => r.refunded || r.partialRefunded).length;
  const totalDeliveryFee =
    summary.deliveryFee ?? records.reduce((sum, r) => sum + (r.deliveryFee ?? 0), 0);
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
        className="bg-white rounded-lg shadow-lg max-w-[min(96vw,1400px)] w-full p-5 text-[12px] text-slate-800 max-h-[90vh] overflow-auto"
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
            <table className="w-full min-w-[1200px] border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className={TH}>Payment Id</th>
                  <th className={TH}>Transaction Id</th>
                  <th className={TH}>MP TransactionId</th>
                  <th className={TH}>Payment Status</th>
                  <th className={TH}>Redemption Type</th>
                  <th className={TH}>Product Type</th>
                  <th className={TH}>Refunded</th>
                  <th className={TH}>Partial Refunded</th>
                  <th className={TH}>Partially Refunded Amount</th>
                  <th className={TH}>Amount</th>
                  <th className={TH}>Delivery Fee</th>
                  <th className={TH}>CTC</th>
                  <th className={TH}>Cashin</th>
                  <th className={TH}>Points Used</th>
                  <th className={TH}>CTM</th>
                  <th className={TH}>Cashback Earned</th>
                  <th className={TH}>PG Name</th>
                  <th className={TH}>PG TransactionId</th>
                  <th className={TH}>Coupon Code</th>
                  <th className={TH}>Coupon Usage Count</th>
                  <th className={TH}>Coupon Expiry</th>
                  <th className={TH}>Coupon Value</th>
                  <th className={TH}>Coupon Max Discount</th>
                  <th className={TH}>Coupon Max Usage</th>
                  <th className={TH}>Coupon Max Redemption</th>
                  <th className={TH}>Coupon Type</th>
                  <th className={TH}>Coupon User Eligible</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map((record, index) => (
                  <tr
                    key={`${record.paymentId}-${record.productType}-${index}`}
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
                    <td className={TD}>{formatPlain(record.redemptionType)}</td>
                    <td className={`${TD} font-medium`}>{formatPlain(record.productType)}</td>
                    <td className={TD}>{record.refunded ? 'Yes' : '—'}</td>
                    <td className={TD}>{record.partialRefunded ? 'Yes' : 'False'}</td>
                    <td className={`${TD} tabular-nums`}>{formatNum(record.partiallyRefundedAmount)}</td>
                    <td className={`${TD} tabular-nums font-medium`}>{formatNum(record.amount)}</td>
                    <td className={`${TD} tabular-nums`}>{formatNum(record.deliveryFee)}</td>
                    <td className={`${TD} tabular-nums`}>{formatNum(record.ctc)}</td>
                    <td className={`${TD} tabular-nums`}>{formatNum(record.cashin)}</td>
                    <td className={`${TD} tabular-nums`}>{formatNum(record.pointsUsed)}</td>
                    <td className={`${TD} tabular-nums font-medium text-emerald-800`}>{formatNum(record.ctm)}</td>
                    <td className={`${TD} tabular-nums`}>{formatNum(record.cashbackEarned)}</td>
                    <td className={TD}>{formatPlain(record.pgName)}</td>
                    <td className={`${TD} font-mono`}>{formatPlain(record.pgTransactionId)}</td>
                    <td className={TD}>{formatPlain(record.couponCode)}</td>
                    <td className={`${TD} tabular-nums`}>{formatPlain(record.couponUserUsageCount)}</td>
                    <td className={TD}>{formatPlain(record.couponExpiryDate)}</td>
                    <td className={`${TD} tabular-nums`}>{formatNum(record.couponValue)}</td>
                    <td className={`${TD} tabular-nums`}>{formatNum(record.couponMaxDiscount)}</td>
                    <td className={`${TD} tabular-nums`}>{formatPlain(record.couponMaxUsage)}</td>
                    <td className={`${TD} tabular-nums`}>{formatPlain(record.couponMaxRedemption)}</td>
                    <td className={TD}>{formatPlain(record.couponType)}</td>
                    <td className={TD}>{formatPlain(record.couponUserEligible)}</td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td
                      className="py-4 px-4 text-sm text-gray-500 text-center"
                      colSpan={27}
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                  <p className="text-[11px] font-medium text-gray-600">Total amount (CTC)</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {formatCurrency(totalAmount)}
                  </p>
                </div>
                <div className="p-2 bg-emerald-100 rounded-md">
                  <i className="bi bi-currency-rupee text-emerald-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-md border border-emerald-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-emerald-800">Merchant amount (CTM)</p>
                  <p className="text-lg font-bold text-emerald-900 mt-1">
                    {formatCurrency(summary.totalCtm)}
                  </p>
                </div>
                <div className="p-2 bg-emerald-50 rounded-md">
                  <i className="bi bi-shop text-emerald-700 text-base" />
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
                  <i className="bi bi-arrow-counterclockwise text-red-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-md border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-gray-600">Delivery charges</p>
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

export default function PaymentDetails({
  order,
  displayId,
  orderRefunds = [],
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
      // Prefer items billing_snapshot path — available as soon as items prefetch lands.
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
      return {
        totalAmount: totalCtc,
        totalCtm,
        totalCashbackEarned: paymentDetail.totalCashbackEarned,
        totalDiscountGranted: discount.amount,
        discountOfferSource: discount.offerSource,
        deliveryFee: delivery.amount,
        deliveryFeeQuoted: delivery.quoted,
        deliveryFeeWaived: delivery.waived,
        source: paymentDetail.source,
        paymentMode: paymentDetail.paymentMode,
        partialRefunded: paymentDetail.partialRefunded,
        refundAmount:
          paymentDetail.refundAmount ??
          (hasRefundRecords ? totalRefundFromRefunds : null),
        isRefunded,
        records: paymentDetail.records,
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

    return {
      totalAmount: totalCtc,
      totalCtm: pickMerchantAmount(null, totalCtc),
      totalCashbackEarned: null,
      totalDiscountGranted: discount.amount,
      discountOfferSource: discount.offerSource,
      deliveryFee: delivery.amount,
      deliveryFeeQuoted: delivery.quoted,
      deliveryFeeWaived: delivery.waived,
      source: order.orderSource ? order.orderSource.toString() : '—',
      paymentMode: order.paymentMethod ? order.paymentMethod.toString().toUpperCase() : '—',
      partialRefunded: false,
      refundAmount: hasRefundRecords ? totalRefundFromRefunds : null,
      isRefunded,
      records: [
        {
          paymentId: displayId || `ORDER-${order.id}`,
          transactionId: null,
          mpTransactionId: null,
          paymentStatus,
          redemptionType: order.orderSource ?? undefined,
          productType: order.orderType ?? undefined,
          refunded: isRefunded,
          partialRefunded: false,
          partiallyRefundedAmount: null,
          amount: totalCtc,
          ctc: totalCtc,
          cashin: null,
          pointsUsed: null,
          ctm: pickMerchantAmount(null, totalCtc),
          cashbackEarned: null,
          deliveryFee: delivery.amount,
          pgName: null,
          pgTransactionId: null,
          couponCode: null,
          couponUserUsageCount: null,
          couponExpiryDate: null,
          couponValue: null,
          couponMaxDiscount: null,
          couponMaxUsage: null,
          couponMaxRedemption: null,
          couponType: null,
          couponUserEligible: null,
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
              {resolved.paymentMode
                ? resolved.paymentMode.toString().toUpperCase()
                : '—'}
            </span>
          </p>
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">
              Partial Refunded:
            </span>{' '}
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
          <p className="text-[12px]">
            <span className="text-gati-text-secondary font-medium">Refund Amount:</span>{' '}
            <span className="text-gati-text-primary font-medium">
              {resolved.isRefunded
                ? formatCurrency(resolved.refundAmount)
                : '—'}
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
        records={resolved.records}
        orderRefunds={orderRefunds}
        summary={{
          totalAmount: resolved.totalAmount,
          totalCtm: resolved.totalCtm,
          deliveryFee: resolved.deliveryFeeWaived ? 0 : resolved.deliveryFee,
          totalCashbackEarned: resolved.totalCashbackEarned,
        }}
      />
    </>
  );
}
