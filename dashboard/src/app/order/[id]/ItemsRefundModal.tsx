'use client';
import { useAppPathname } from "@/hooks/useAppSearchParams";

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePermission } from '@/hooks/usePermission';

import { getDashboardTypeFromPath } from '@/lib/permissions/path-mapping';
import type { DashboardType } from '@/lib/db/schema';
import { Package, X, Image, Truck, RotateCcw, CheckCircle, AlertTriangle, Loader2, Shield, User, ChevronDown, Info, FileText, ShieldCheck, IndianRupee } from 'lucide-react';

import { DELIVERY_FEE_ITEM_ID } from '@/lib/foodOrderItems';
import { CustomerCtcIconSplit } from '@/components/orders/CustomerCtcIconSplit';
import { formatInrWithGap } from '@/lib/format-inr';
import {
  fetchOrderItemsCached,
  getCachedOrderItems,
  invalidateOrderItemsCache,
  preloadOrderItemImages,
  type OrderItemApiRow,
  type OrderItemLineAmounts,
  type OrderItemsPayload,
  type OrderItemsPricing,
  type OrderPricingLine,
  type OrderGstBreakdown,
} from '@/lib/orderItemsPayload';
import {
  formatCustomisationLine,
  type OrderItemCustomisationDetail,
} from '@/lib/order-item-customisation';
import { useCancellationReasonCatalog } from '@/hooks/useCancellationReasonCatalog';
import {
  catalogReasonOptionValue,
  findCancelledWithoutRefundReason,
  findCatalogReasonBySelectValue,
  normalizeCatalogReasonId,
  reasonsForAttribute,
} from '@/lib/orders/orderRejectionOptions';
import {
  formatEnginePreviewError,
  formatEnginePreviewStatus,
  type EnginePreviewDisplay,
} from '@gatimitra/financial-rules';
import { resolveMerchantOfferBadge } from '@/lib/merchant-offer-display';
import { OrderMixedText, OrderNum } from '@/components/orders/orders-typography';
import { itemRefundBalances } from '@/lib/orders/item-refund-balances';
import { resolveAttachmentProxyUrl } from '@/lib/attachments/resolve-attachment-proxy-url';
import { ITEM_PLACEHOLDER_SVG } from '@/app/dashboard/merchants/stores/[id]/menu/menu-types';
import { OrderPageOverlay } from '@/components/orders/OrderPageOverlay';
import { syncServerSessionCookies } from '@/lib/auth/sync-server-session';

type RiderPenaltyPreviewRider = {
  riderId: number;
  riderName: string | null;
  riderMobile: string | null;
  assignmentStatus: string | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  isCurrentOnOrder: boolean;
  label: string;
};

type RiderPenaltyPreviewData = {
  appliesPenalty: boolean;
  penaltyAmount: number;
  scenarioCode: string | null;
  scenarioLabel: string | null;
  ledgerTitle: string;
  ledgerDescription: string;
  skipped?: string;
  skippedLabel?: string;
};

interface ItemsRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (message: string) => void;
  /** Order id (orders_core.id / orders.id) for creating refund record. */
  orderId?: number | null;
  /** Preloaded on order page — modal shows items immediately without spinner. */
  prefetchedOrderItems?: OrderItemsPayload | null;
  /** Dashboard context for permission checks (e.g. ORDER_FOOD). Defaults from path or ORDER_FOOD. */
  dashboardType?: DashboardType;
  /** Called after a refund is successfully created so parent can refetch refund list. */
  onRefundCreated?: () => void;
  /** Order progress timeline already recorded cancellation — blocks refund+cancel type. */
  orderCancelledOnTimeline?: boolean;
  /** Sum of non-failed refunds already covers the grand total — blocks all refund types. */
  orderFullyRefunded?: boolean;
  /**
   * Same lock as the sidebar "Create refund" button (cancelled + fully refunded).
   * When true, hide the Create refund UI entirely in this items modal.
   */
  refundActionsDisabled?: boolean;
  /** Remaining amount that can still be refunded (grand total − already refunded). */
  refundRemainingRefundable?: number;
  /** Per-item already-refunded CTC amounts from prior partial refunds. */
  itemRefundTotals?: Record<string, { alreadyRefunded: number }> | null;
}

/** Payment gateways (Razorpay) reject refunds below ₹1. */
const MIN_GATEWAY_REFUND = 1;

function discountTagLabel(tag?: OrderPricingLine['discountTag']): string | null {
  if (tag === 'platform') return 'Platform discount';
  if (tag === 'store') return 'Store discount';
  if (tag === 'mixed') return 'Platform + Store';
  return null;
}

function DiscountTagBadge({ tag }: { tag?: OrderPricingLine['discountTag'] }) {
  const label = discountTagLabel(tag);
  if (!label) return null;
  const styles =
    tag === 'store'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : tag === 'mixed'
        ? 'bg-violet-50 text-violet-800 border-violet-200'
        : 'bg-sky-50 text-sky-800 border-sky-200';
  return (
    <span className={`ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold border ${styles}`}>
      {label}
    </span>
  );
}

function OrderItemImagePanel({
  url,
  alt,
  onReady,
}: {
  url: string;
  alt: string;
  onReady: () => void;
}) {
  const src = resolveAttachmentProxyUrl(url) || url;
  const readyOnce = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const markReady = useCallback(() => {
    if (readyOnce.current) return;
    readyOnce.current = true;
    onReadyRef.current();
  }, []);

  useEffect(() => {
    readyOnce.current = false;
    const el = imgRef.current;
    if (!el?.complete) return;
    const id = window.requestAnimationFrame(() => markReady());
    return () => window.cancelAnimationFrame(id);
  }, [src, markReady]);

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading="eager"
      decoding="async"
      className="w-full h-auto object-cover max-h-[400px]"
      onLoad={markReady}
      onError={(e) => {
        markReady();
        const t = e.currentTarget;
        if (t.src !== ITEM_PLACEHOLDER_SVG) {
          t.src = ITEM_PLACEHOLDER_SVG;
        }
      }}
    />
  );
}

function MembershipBadge() {
  return (
    <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold border bg-emerald-50 text-emerald-800 border-emerald-200">
      Membership
    </span>
  );
}

function PricingBreakdownPanel({
  title,
  lines,
  totalLabel,
  totalAmount,
  cashinAmount,
  gatiCashUsed,
  accent = 'emerald',
  gstBreakdown = null,
}: {
  title: string;
  lines: OrderPricingLine[];
  totalLabel: string;
  totalAmount: number;
  cashinAmount?: number;
  gatiCashUsed?: number;
  accent?: 'emerald' | 'blue';
  gstBreakdown?: OrderGstBreakdown | null;
}) {
  const [gstModalOpen, setGstModalOpen] = useState(false);
  const totalClass = accent === 'blue' ? 'text-blue-600' : 'text-emerald-600';
  const borderClass = accent === 'blue' ? 'border-blue-100' : 'border-slate-200';
  const bgClass = accent === 'blue' ? 'bg-blue-50/60' : 'bg-slate-50';
  const gati = Number(gatiCashUsed ?? 0) || 0;
  const cashin =
    cashinAmount != null && Number.isFinite(cashinAmount)
      ? Number(cashinAmount)
      : Math.max(0, totalAmount - Math.max(0, gati));
  const showSplit = accent === 'blue';
  const canOpenGst =
    accent === 'blue' &&
    gstBreakdown != null &&
    gstBreakdown.totalGst > 0.005;

  useEffect(() => {
    if (!gstModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGstModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gstModalOpen]);

  return (
    <>
      <div className={`rounded-md border ${borderClass} ${bgClass} p-3`}>
        <p className="text-[11px] font-semibold text-slate-700">{title}</p>
        <div className="mt-2 space-y-1">
          {lines.map((line, idx) => {
            const isGst = line.key === 'gst' && line.kind === 'tax';
            const amountText = `${line.kind === 'discount' ? '−' : ''}${line.amount.toFixed(2)}`;
            return (
              <div
                key={`${line.key}-${idx}`}
                className="flex justify-between items-start gap-2 py-0.5 text-[11px] border-b border-slate-200/80 last:border-0"
              >
                <span className="text-slate-600 min-w-0">
                  {line.label}
                  {line.kind === 'discount' ? <DiscountTagBadge tag={line.discountTag} /> : null}
                  {line.rowBadge === 'membership' ? <MembershipBadge /> : null}
                </span>
                {isGst && canOpenGst ? (
                  <button
                    type="button"
                    onClick={() => setGstModalOpen(true)}
                    className="cursor-pointer font-medium tabular-nums shrink-0 text-blue-700 hover:text-blue-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded-sm"
                    aria-label={`GST ${amountText}, open breakdown`}
                  >
                    <span className="border-b border-dashed border-blue-600/80 pb-px">
                      {amountText}
                    </span>
                  </button>
                ) : (
                  <span
                    className={`font-medium tabular-nums shrink-0 ${
                      line.kind === 'discount' ? 'text-red-600' : 'text-slate-800'
                    }`}
                  >
                    {amountText}
                  </span>
                )}
              </div>
            );
          })}
          <div className="flex justify-between items-start gap-2 pt-1.5 mt-1 border-t border-slate-200 font-semibold text-slate-800 text-xs">
            <span>{totalLabel}</span>
            <span className={`tabular-nums text-right ${totalClass}`}>
              ₹{totalAmount.toFixed(2)}
              {showSplit ? (
                <span className="block mt-1 font-medium">
                  <CustomerCtcIconSplit
                    cashin={cashin}
                    gatiCashUsed={gati}
                    formatCurrency={(n) => `₹${Number(n ?? 0).toFixed(2)}`}
                  />
                </span>
              ) : null}
            </span>
          </div>
        </div>
      </div>

      {gstModalOpen && gstBreakdown ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4"
          role="presentation"
          onClick={() => setGstModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gst-breakdown-title"
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 id="gst-breakdown-title" className="text-sm font-semibold text-slate-800">
                GST Breakdown
              </h3>
              <button
                type="button"
                onClick={() => setGstModalOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close GST breakdown"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 px-4 py-3 text-[12px]">
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">Taxable Amount</span>
                <span className="font-medium tabular-nums text-slate-900">
                  ₹{gstBreakdown.taxableAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">GST Rate</span>
                <span className="font-medium tabular-nums text-slate-900">
                  {gstBreakdown.gstRatePct != null
                    ? `${gstBreakdown.gstRatePct.toFixed(
                        Number.isInteger(gstBreakdown.gstRatePct) ? 0 : 2
                      )}%`
                    : gstBreakdown.taxLines.length > 1
                      ? "Mixed"
                      : "—"}
                </span>
              </div>
              {gstBreakdown.taxLines.length > 0 ? (
                <div className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5 space-y-1">
                  {gstBreakdown.taxLines.map((line, i) => (
                    <div
                      key={`${line.label}-${i}`}
                      className="flex justify-between gap-3 text-[11px]"
                    >
                      <span className="text-slate-600 min-w-0 truncate">
                        {line.label}
                        {line.ratePct != null
                          ? ` (${line.ratePct.toFixed(
                              Number.isInteger(line.ratePct) ? 0 : 2
                            )}%)`
                          : ""}
                      </span>
                      <span className="font-medium tabular-nums text-slate-900 shrink-0">
                        ₹{line.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">CGST</span>
                <span className="font-medium tabular-nums text-slate-900">
                  ₹{gstBreakdown.cgst.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">SGST</span>
                <span className="font-medium tabular-nums text-slate-900">
                  ₹{gstBreakdown.sgst.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">IGST</span>
                <span className="font-medium tabular-nums text-slate-900">
                  ₹{gstBreakdown.igst.toFixed(2)}
                </span>
              </div>
              <div className="mt-1 flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold text-slate-900">
                <span>Total GST</span>
                <span className="tabular-nums">₹{gstBreakdown.totalGst.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function lineAmountsForView(
  row: OrderItemApiRow,
  view: 'customer' | 'merchant'
): OrderItemLineAmounts {
  if (view === 'customer' && row.customer) return row.customer;
  return {
    amountPerQuantity: row.amountPerQuantity,
    taxPerQuantity: row.taxPerQuantity,
    chargesPerQuantity: row.chargesPerQuantity,
    totalPerQuantity: row.totalPerQuantity,
  };
}

function mapApiItemToRefundItemForView(
  row: OrderItemApiRow,
  view: 'customer' | 'merchant'
): RefundItem {
  const amounts = lineAmountsForView(row, view);
  const delivery = row.id === DELIVERY_FEE_ITEM_ID;
  return {
    id: row.id,
    name: row.name,
    customisation: row.customisation,
    customisationDetail: row.customisationDetail ?? null,
    quantity: row.quantity,
    amountPerQuantity: amounts.amountPerQuantity,
    taxPerQuantity: amounts.taxPerQuantity,
    chargesPerQuantity: amounts.chargesPerQuantity,
    totalPerQuantity: amounts.totalPerQuantity,
    refundType: 'NONE',
    selectedQuantity: 0,
    remark: '',
    showDropdown: false,
    customAmount: amounts.amountPerQuantity,
    isSelected: false,
    hasImage: row.hasImage && Boolean(row.imageUrl),
    imageUrl: row.imageUrl ?? undefined,
    refundPercentage: 0,
    isDeliveryFee: delivery,
    appliedOfferType: row.appliedOfferType ?? null,
    offerLabel: row.offerLabel ?? null,
    catalogAmountPerQuantity: row.catalogAmountPerQuantity,
    netAmountPerQuantity: row.netAmountPerQuantity,
  };
}

function syncRefundItemAmounts(
  items: RefundItem[],
  source: OrderItemApiRow[],
  view: 'customer' | 'merchant'
): RefundItem[] {
  const byId = new Map(source.map((r) => [r.id, r]));
  return items.map((item) => {
    const row = byId.get(item.id);
    if (!row) return item;
    const amounts = lineAmountsForView(row, view);
    return {
      ...item,
      amountPerQuantity: amounts.amountPerQuantity,
      taxPerQuantity: amounts.taxPerQuantity,
      chargesPerQuantity: amounts.chargesPerQuantity,
      totalPerQuantity: amounts.totalPerQuantity,
      customAmount: amounts.amountPerQuantity,
      appliedOfferType: row.appliedOfferType ?? item.appliedOfferType ?? null,
      offerLabel: row.offerLabel ?? item.offerLabel ?? null,
      catalogAmountPerQuantity: row.catalogAmountPerQuantity,
      netAmountPerQuantity: row.netAmountPerQuantity,
    };
  });
}

function BillBreakdownSwitcher({
  pricing,
  billView,
  onBillViewChange,
}: {
  pricing: OrderItemsPricing;
  billView: 'customer' | 'merchant';
  onBillViewChange: (view: 'customer' | 'merchant') => void;
}) {
  const hasMerchantBill = Boolean(pricing.customer);
  const customerBill = pricing.customer ?? pricing;
  const merchantBill = pricing;

  const active =
    billView === 'merchant' && hasMerchantBill
      ? {
          title: 'Merchant bill - Amount payable to merchant (CTM)',
          lines: merchantBill.lines,
          totalLabel: 'Merchant amount (CTM)',
          totalAmount: merchantBill.totalOrderAmount,
          accent: 'emerald' as const,
          gstBreakdown: null as OrderGstBreakdown | null | undefined,
        }
      : {
          title: 'Customer bill - Full amount paid by customer (CTC)',
          lines: customerBill.lines,
          totalLabel: 'Total amount (CTC)',
          totalAmount: customerBill.totalOrderAmount,
          cashinAmount: customerBill.cashinAmount,
          gatiCashUsed: customerBill.gatiCashUsed,
          accent: 'blue' as const,
          gstBreakdown: customerBill.gstBreakdown ?? null,
        };

  return (
    <div className="mt-3 w-full max-w-md ml-auto min-w-[240px]">
      <div className="mb-2 flex items-center justify-end gap-2">
        <label htmlFor="bill-view-select" className="text-[11px] font-medium text-slate-600">
          Bill view
        </label>
        <select
          id="bill-view-select"
          value={billView}
          onChange={(e) => onBillViewChange(e.target.value as 'customer' | 'merchant')}
          className="h-8 min-w-[150px] rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
        >
          <option value="customer">Customer bill</option>
          {hasMerchantBill ? <option value="merchant">Merchant bill</option> : null}
        </select>
      </div>
      <PricingBreakdownPanel
        key={billView}
        title={active.title}
        lines={active.lines?.length ? active.lines : []}
        totalLabel={active.totalLabel}
        totalAmount={active.totalAmount}
        cashinAmount={'cashinAmount' in active ? active.cashinAmount : undefined}
        gatiCashUsed={'gatiCashUsed' in active ? active.gatiCashUsed : undefined}
        accent={active.accent}
        gstBreakdown={active.gstBreakdown}
      />
    </div>
  );
}

function refundPercentOptions(): number[] {
  const options: number[] = [];
  for (let i = 10; i <= 100; i += 10) options.push(i);
  return options;
}

function RefundCustomerPreviewPanel({
  refundType,
  ctcTotal,
  refundPercent,
  refundAmount,
  itemRefundTotal,
  onPercentChange,
  onAmountChange,
  selectedItemCount,
  totalItemCount,
}: {
  refundType: string;
  ctcTotal: number;
  refundPercent: number;
  refundAmount: number;
  itemRefundTotal: number;
  onPercentChange: (pct: number) => void;
  onAmountChange: (amount: number) => void;
  selectedItemCount: number;
  totalItemCount: number;
}) {
  const isCancelWithoutRefund = refundType === 'cancel_without_refund';
  const isFullCancelRefund = refundType === 'refund_with_cancellation';
  const isFullCtcRefund = refundType === 'refund_full_ctc';
  const isPartialRefund = refundType === 'refund_without_cancellation';
  const showCtcControls = isFullCancelRefund || isFullCtcRefund;
  const allItemsSelected =
    totalItemCount > 0 && selectedItemCount >= totalItemCount;

  const displayAmount = isPartialRefund
    ? itemRefundTotal
    : isCancelWithoutRefund
      ? 0
      : refundAmount;

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3 w-full">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
        Customer refund preview
      </p>
      <p className="mt-0.5 text-[10px] text-slate-500">
        {isCancelWithoutRefund
          ? 'No amount will be refunded to the customer.'
          : isPartialRefund
            ? 'Based on selected item refund percentages.'
            : isFullCtcRefund
              ? 'Based on remaining refundable customer bill (CTC).'
              : allItemsSelected
                ? 'Based on customer bill total (CTC).'
                : 'Based on selected items’ share of customer bill (CTC).'}
      </p>

      {showCtcControls ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-nowrap items-center justify-between gap-2 text-[11px] whitespace-nowrap min-w-0">
            <span className="text-slate-600 shrink-0">
              {isFullCtcRefund ? 'Remaining refundable (CTC)' : 'Order total (CTC)'}
            </span>
            <span className="font-semibold tabular-nums text-slate-800 orders-num shrink-0">
              {formatInrWithGap(ctcTotal)}
            </span>
          </div>
          {ctcTotal > 0 ? (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Refund %</label>
              <select
                value={refundPercent}
                onChange={(e) => onPercentChange(Number(e.target.value))}
                className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {refundPercentOptions().map((pct) => (
                  <option key={pct} value={pct}>
                    {pct}%
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 pt-2 border-t border-blue-200/80">
        <label className="block text-[11px] font-medium text-slate-600 mb-1">
          Amount refunded to customer
        </label>
        {showCtcControls ? (
          <div className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 h-9">
            <span className="text-slate-500 text-sm">₹</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={Number.isFinite(refundAmount) ? refundAmount : 0}
              onChange={(e) => onAmountChange(Number(e.target.value))}
              className="flex-1 min-w-0 border-0 bg-transparent text-sm font-semibold tabular-nums text-blue-700 focus:outline-none focus:ring-0"
            />
          </div>
        ) : (
          <p
            className={`text-lg font-bold tabular-nums orders-num ${
              displayAmount > 0 ? 'text-blue-700' : 'text-slate-400'
            }`}
          >
            {formatInrWithGap(displayAmount)}
          </p>
        )}
        {showCtcControls && ctcTotal > 0 && refundAmount > ctcTotal ? (
          <p className="mt-1 text-[10px] text-amber-700">
            <OrderMixedText>{`Exceeds CTC (${formatInrWithGap(ctcTotal)}). Adjust before submit.`}</OrderMixedText>
          </p>
        ) : null}
        {isFullCancelRefund && selectedItemCount === 0 ? (
          <p className="mt-1 text-[10px] text-amber-700">
            Select at least one item to calculate CTC.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CustomisationCell({
  detail,
  fallback,
  compact = false,
}: {
  detail?: OrderItemCustomisationDetail | null;
  fallback: string;
  compact?: boolean;
}) {
  const lines = detail?.lines?.length ? detail.lines : [];

  if (lines.length === 0) {
    const text = fallback?.trim();
    if (!text || text === '-') {
      return <span className="text-slate-400">—</span>;
    }
    return (
      <span
        className={`text-left whitespace-normal break-words text-slate-800 ${compact ? 'text-[10px]' : 'text-[11px]'}`}
      >
        {text}
      </span>
    );
  }

  return (
    <div
      className={`text-left align-top space-y-1 min-w-[200px] max-w-[340px] whitespace-normal break-words text-slate-800 leading-snug ${compact ? 'text-[10px]' : 'text-[11px]'}`}
    >
      {lines.map((line, i) => (
        <p key={i}>{formatCustomisationLine(line)}</p>
      ))}
    </div>
  );
}

interface RefundItem {
  id: number;
  name: string;
  customisation: string;
  customisationDetail?: OrderItemCustomisationDetail | null;
  quantity: number;
  amountPerQuantity: number;
  taxPerQuantity: number;
  chargesPerQuantity: number;
  totalPerQuantity: number;
  refundType: 'NONE' | 'FULL' | 'PARTIAL';
  selectedQuantity: number;
  remark: string;
  showDropdown: boolean;
  customAmount: number;
  isSelected: boolean;
  hasImage: boolean;
  imageUrl?: string;
  refundPercentage: number;
  isDeliveryFee: boolean;
  appliedOfferType?: string | null;
  offerLabel?: string | null;
  catalogAmountPerQuantity?: number;
  netAmountPerQuantity?: number;
}

function payloadToRefundState(
  payload: OrderItemsPayload,
  view: 'customer' | 'merchant'
): {
  items: RefundItem[];
  pricing: OrderItemsPricing;
} {
  return {
    items: payload.items.map((row) => mapApiItemToRefundItemForView(row, view)),
    pricing: payload.pricing,
  };
}

function resolveOrderItemsPayload(
  orderId: number | null | undefined,
  prefetched: OrderItemsPayload | null | undefined
): OrderItemsPayload | null {
  if (prefetched?.items?.length) return prefetched;
  if (orderId != null) {
    const cached = getCachedOrderItems(orderId);
    if (cached?.items?.length) return cached;
  }
  return null;
}

/** Keep checkbox / refund row choices when items list is refreshed from prefetch or API. */
function preserveRefundItemUserState(prev: RefundItem[], next: RefundItem[]): RefundItem[] {
  if (prev.length === 0) return next;
  const prevById = new Map(prev.map((item) => [item.id, item]));
  return next.map((item) => {
    const old = prevById.get(item.id);
    if (!old) return item;
    return {
      ...item,
      isSelected: old.isSelected,
      refundType: old.refundType,
      selectedQuantity: old.selectedQuantity,
      remark: old.remark,
      showDropdown: old.showDropdown,
      customAmount: old.customAmount,
      refundPercentage: old.refundPercentage,
    };
  });
}

function isDeliveryFeeRow(item: { id: number; isDeliveryFee?: boolean }): boolean {
  return item.isDeliveryFee === true || item.id === DELIVERY_FEE_ITEM_ID;
}

function customerItemLineTotal(row: OrderItemApiRow): number {
  const amounts = lineAmountsForView(row, 'customer');
  const qty = isDeliveryFeeRow({ id: row.id }) ? 1 : row.quantity;
  return roundMoney(amounts.totalPerQuantity * qty);
}

/**
 * Customer CTC for currently selected items — item share of customer lines scaled to
 * full order CTC (fees, tax, discounts, rounding allocated proportionally).
 */
function calculateSelectedCustomerCtcTotal(
  refundItems: RefundItem[],
  itemSource: OrderItemApiRow[],
  fullCustomerCtc: number
): number {
  if (fullCustomerCtc <= 0 || refundItems.length === 0) return 0;

  const selectedIds = new Set(
    refundItems.filter((item) => item.isSelected).map((item) => item.id)
  );
  if (selectedIds.size === 0) return 0;

  const rows =
    itemSource.length > 0
      ? itemSource
      : refundItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          amountPerQuantity: item.amountPerQuantity,
          taxPerQuantity: item.taxPerQuantity,
          chargesPerQuantity: item.chargesPerQuantity,
          totalPerQuantity: item.totalPerQuantity,
        })) as OrderItemApiRow[];

  let selectedTotal = 0;
  let fullTotal = 0;
  for (const row of rows) {
    const lineTotal = customerItemLineTotal(row);
    fullTotal += lineTotal;
    if (selectedIds.has(row.id)) selectedTotal += lineTotal;
  }

  if (fullTotal <= 0) return 0;
  if (selectedTotal >= fullTotal - 0.009) return roundMoney(fullCustomerCtc);
  return roundMoney((selectedTotal / fullTotal) * fullCustomerCtc);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function refundApiErrorMessage(
  status: number,
  data: Record<string, unknown>,
  fallback: string
): string {
  if (status === 503 || data?.code === 'SERVICE_UNAVAILABLE') {
    return 'Server is busy — please wait a few seconds and try again.';
  }
  return typeof data?.error === 'string' ? data.error : fallback;
}

async function postOrderRefundWithRetry(
  orderId: number,
  body: Record<string, unknown>
): Promise<{ res: Response; data: Record<string, unknown> }> {
  const url = `/api/orders/${orderId}/refunds`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body),
  };

  const parse = async (res: Response) =>
    (await res.json().catch(() => ({}))) as Record<string, unknown>;

  let res = await fetch(url, init);
  let data = await parse(res);

  if (res.status === 401) {
    const synced = await syncServerSessionCookies();
    if (synced) {
      res = await fetch(url, init);
      data = await parse(res);
    }
  }

  for (
    let attempt = 0;
    attempt < 3 && (res.status === 503 || data?.code === 'SERVICE_UNAVAILABLE');
    attempt++
  ) {
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    res = await fetch(url, init);
    data = await parse(res);
    if (res.status === 401) {
      const synced = await syncServerSessionCookies();
      if (synced) {
        res = await fetch(url, init);
        data = await parse(res);
      }
    }
  }

  return { res, data };
}

/** Full original line total (CTC) for remaining-refund math. */
function originalItemCtcTotal(item: RefundItem): number {
  const qty = isDeliveryFeeRow(item) ? 1 : Math.max(1, item.quantity);
  return roundMoney(item.totalPerQuantity * qty);
}

/** Menu / item subtotal for display — excludes tax, fees, and CTC allocation. */
function catalogLineTotalForRefundDisplay(item: RefundItem): number {
  const qty = isDeliveryFeeRow(item) ? 1 : Math.max(1, item.quantity);
  if (item.amountPerQuantity > 0.005) {
    return roundMoney(item.amountPerQuantity * qty);
  }
  if (item.netAmountPerQuantity != null && item.netAmountPerQuantity > 0.005) {
    return roundMoney(item.netAmountPerQuantity * qty);
  }
  if (item.catalogAmountPerQuantity != null && item.catalogAmountPerQuantity > 0.005) {
    return roundMoney(item.catalogAmountPerQuantity * qty);
  }
  return roundMoney(item.totalPerQuantity * qty);
}

/**
 * Per-item CTC cap including proportional share of delivery, platform fee, tax
 * residual, etc. so item caps sum to the full customer bill (CTC).
 */
function computeCustomerCtcItemCaps(
  items: RefundItem[],
  fullCustomerCtc: number
): Map<number, number> {
  const caps = new Map<number, number>();
  if (fullCustomerCtc <= 0 || items.length === 0) return caps;

  const rows = items.filter((item) => originalItemCtcTotal(item) > 0);
  const lineSum = rows.reduce((s, item) => s + originalItemCtcTotal(item), 0);
  if (lineSum <= 0) return caps;

  let allocated = 0;
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const raw = originalItemCtcTotal(item);
    const cap =
      i === rows.length - 1
        ? roundMoney(fullCustomerCtc - allocated)
        : roundMoney(fullCustomerCtc * (raw / lineSum));
    if (i < rows.length - 1) allocated = roundMoney(allocated + cap);
    caps.set(item.id, cap);
  }
  return caps;
}

type FullCtcRefundCatalogLine = {
  id: number;
  name: string;
  quantity: number;
  lineTotal: number;
  refundPercentage: number;
};

/** Menu-line catalog for display only — full CTC is order-level, not split per item. */
function buildFullCtcRefundCatalog(
  items: RefundItem[],
  alreadyById: Map<number, number> | undefined
): FullCtcRefundCatalogLine[] {
  void alreadyById;
  return items
    .filter((item) => !isDeliveryFeeRow(item))
    .map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      lineTotal: catalogLineTotalForRefundDisplay(item),
      refundPercentage: 100,
    }));
}

export default function ItemsRefundModal({
  isOpen,
  onClose,
  onToast,
  orderId: orderIdProp,
  prefetchedOrderItems,
  dashboardType: dashboardTypeProp,
  onRefundCreated,
  orderCancelledOnTimeline = false,
  orderFullyRefunded = false,
  refundActionsDisabled = false,
  refundRemainingRefundable,
  itemRefundTotals: itemRefundTotalsProp,
}: ItemsRefundModalProps) {
  const pathname = useAppPathname();
  const resolvedDashboard = dashboardTypeProp ?? getDashboardTypeFromPath(pathname ?? '') ?? 'ORDER_FOOD';
  const { canPerformAction, isSuperAdmin } = usePermission();

  const hasRefundPermission = isSuperAdmin || (resolvedDashboard && canPerformAction(resolvedDashboard, 'REFUND', { access_point_group: 'ORDER_REFUND' }));
  const hasCancellationPermission = isSuperAdmin || (resolvedDashboard && canPerformAction(resolvedDashboard, 'CANCEL', { access_point_group: 'ORDER_CANCEL' }));
  // Match sidebar: if Create refund CTA is blocked, don't show refund UI in items view either.
  const canCreateRefund =
    hasRefundPermission && hasCancellationPermission && !refundActionsDisabled;
  const blockRefundWithCancellation = orderCancelledOnTimeline;
  // Once the order is fully refunded, every refund-moving action is blocked.
  const blockAllRefunds = orderFullyRefunded;
  // Already-cancelled orders cannot be cancelled again (with or without refund).

  const [itemAlreadyRefunded, setItemAlreadyRefunded] = useState<Map<number, number>>(
    () => new Map()
  );
  const blockCancellation = orderCancelledOnTimeline;

  const [modalOpen, setModalOpen] = useState(false);

  const syncItemRefundTotals = useCallback(
    (totals: Record<string, { alreadyRefunded: number }> | null | undefined) => {
      const m = new Map<number, number>();
      if (totals) {
        for (const [k, v] of Object.entries(totals)) {
          const id = Number(k);
          const amt = Number(v?.alreadyRefunded);
          if (Number.isFinite(id) && id > 0 && Number.isFinite(amt) && amt > 0) {
            m.set(id, amt);
          }
        }
      }
      setItemAlreadyRefunded(m);
    },
    []
  );

  useEffect(() => {
    if (itemRefundTotalsProp) {
      syncItemRefundTotals(itemRefundTotalsProp);
    }
  }, [itemRefundTotalsProp, syncItemRefundTotals]);

  useEffect(() => {
    if (!modalOpen || orderIdProp == null) return;
    let cancelled = false;
    void fetch(`/api/orders/${orderIdProp}/refunds`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        syncItemRefundTotals(
          (body?.itemRefundTotals as Record<string, { alreadyRefunded: number }>) ?? null
        );
      })
      .catch(() => {
        if (!cancelled && !itemRefundTotalsProp) setItemAlreadyRefunded(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, orderIdProp, syncItemRefundTotals, itemRefundTotalsProp]);

  const {
    attributes: catalogAttributes,
    grouped: catalogGrouped,
    loading: catalogLoading,
    error: catalogError,
  } = useCancellationReasonCatalog({ enabled: modalOpen });

  const [refundAttribute, setRefundAttribute] = useState('');
  const [catalogReasonId, setCatalogReasonId] = useState<number | null>(null);
  const [refundRejection, setRefundRejection] = useState('');
  const [refundType, setRefundType] = useState('');
  const [fault, setFault] = useState('');
  const [merchantDebit, setMerchantDebit] = useState('');
  const [customerRefundPercent, setCustomerRefundPercent] = useState(100);
  const [customerRefundAmount, setCustomerRefundAmount] = useState(0);
  const [showRefundType, setShowRefundType] = useState(false);
  const [showFault, setShowFault] = useState(false);
  const [showMerchantDebit, setShowMerchantDebit] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [enginePreview, setEnginePreview] = useState<EnginePreviewDisplay | null>(null);
  const [riderPenaltyPreview, setRiderPenaltyPreview] = useState<RiderPenaltyPreviewData | null>(null);
  const [penaltyRiders, setPenaltyRiders] = useState<RiderPenaltyPreviewRider[]>([]);
  const [penaltyRiderId, setPenaltyRiderId] = useState<number | null>(null);
  const [penaltyPreviewsByRiderId, setPenaltyPreviewsByRiderId] = useState<
    Record<number, RiderPenaltyPreviewData>
  >({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedItemImage, setSelectedItemImage] = useState<{ id: number; name: string; imageUrl: string } | null>(null);
  const [loadedImageUrls, setLoadedImageUrls] = useState<Set<string>>(() => new Set());
  const [imagePanelLoading, setImagePanelLoading] = useState(false);

  const isThreePlFaultSelected = fault === '3pl_fault' || fault === '3pl';
  const isMerchantOrCustomerFault =
    fault === 'merchant_fault' || fault === 'customer_fault';
  const isExceptionalFault = fault === 'exceptional';
  const isCompactConfirmModal = isMerchantOrCustomerFault || isExceptionalFault;
  const showEnginePreviewInConfirm =
    !isThreePlFaultSelected && !isMerchantOrCustomerFault && !isExceptionalFault;

  const fetchRiderPenaltyPreview = useCallback(
    async (orderId: number, riderId?: number | null) => {
      const res = await fetch(`/api/orders/${orderId}/rider-penalty-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(riderId != null ? { riderId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setRiderPenaltyPreview({
          appliesPenalty: false,
          penaltyAmount: 0,
          scenarioCode: null,
          scenarioLabel: null,
          ledgerTitle: '',
          ledgerDescription: '',
          skipped: 'preview_failed',
          skippedLabel: typeof data.error === 'string' ? data.error : 'Could not load rider penalty preview.',
        });
        return;
      }
      setPenaltyRiders((data.riders as RiderPenaltyPreviewRider[]) ?? []);
      const previewsRaw = (data.previewsByRiderId as Record<number, RiderPenaltyPreviewData>) ?? {};
      setPenaltyPreviewsByRiderId(previewsRaw);
      const selectedId =
        typeof data.selectedRiderId === 'number' ? data.selectedRiderId : null;
      setPenaltyRiderId(selectedId);
      setRiderPenaltyPreview(
        (selectedId != null ? previewsRaw[selectedId] : null) ??
          (data.preview as RiderPenaltyPreviewData) ??
          null
      );
    },
    []
  );

  const handlePenaltyRiderChange = (riderId: number) => {
    setPenaltyRiderId(riderId);
    const cached = penaltyPreviewsByRiderId[riderId];
    if (cached) setRiderPenaltyPreview(cached);
  };
  const refundTypeRef = useRef<HTMLDivElement>(null);
  const faultRef = useRef<HTMLDivElement>(null);
  const merchantDebitRef = useRef<HTMLDivElement>(null);
  const refundItemsRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const imageModalRef = useRef<HTMLDivElement>(null);
  const itemsSourceRef = useRef<OrderItemApiRow[]>([]);
  const [billView, setBillView] = useState<'customer' | 'merchant'>('customer');

  const initialPayload = resolveOrderItemsPayload(orderIdProp, prefetchedOrderItems);
  const initialFromPrefetch = initialPayload
    ? payloadToRefundState(initialPayload, 'customer')
    : null;

  const handleBillViewChange = (view: 'customer' | 'merchant') => {
    setBillView(view);
    if (itemsSourceRef.current.length > 0) {
      setRefundItems((prev) => syncRefundItemAmounts(prev, itemsSourceRef.current, view));
    }
  };

  const [refundItems, setRefundItems] = useState<RefundItem[]>(
    () => initialFromPrefetch?.items ?? []
  );
  const [itemsFetchSettled, setItemsFetchSettled] = useState(
    () => Boolean(initialFromPrefetch?.items?.length)
  );
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<OrderItemsPricing | null>(
    () => initialFromPrefetch?.pricing ?? null
  );

  const applyItemsPayload = useCallback((payload: OrderItemsPayload) => {
    itemsSourceRef.current = payload.items;
    const next = payloadToRefundState(payload, billView);
    setRefundItems((prev) => preserveRefundItemUserState(prev, next.items));
    setPricing(next.pricing);
    setItemsError(null);
    setItemsFetchSettled(true);
  }, [billView]);

  useEffect(() => {
    setModalOpen(isOpen);
  }, [isOpen]);

  useEffect(() => {
    if (!blockRefundWithCancellation || refundType !== 'refund_with_cancellation') return;
    setRefundType('');
    setShowFault(false);
    setShowMerchantDebit(false);
    setShowSubmit(false);
    setFault('');
    setMerchantDebit('');
  }, [blockRefundWithCancellation, refundType]);

  useEffect(() => {
    if (modalOpen && typeof window !== 'undefined') {
      const formState = {
        refundAttribute,
        catalogReasonId,
        refundRejection,
        refundType,
        fault,
        merchantDebit,
        showRefundType,
        showFault,
        showMerchantDebit,
        showSubmit,
        refundItems,
        selectAll
      };
      localStorage.setItem('refundFormState', JSON.stringify(formState));
    }
  }, [
    modalOpen, refundAttribute, catalogReasonId, refundRejection, refundType, fault, merchantDebit,
    showRefundType, showFault, showMerchantDebit, showSubmit, refundItems, selectAll
  ]);

  useEffect(() => {
    if (modalOpen && typeof window !== 'undefined') {
      const savedFormState = localStorage.getItem('refundFormState');
      if (savedFormState) {
        try {
          const parsedState = JSON.parse(savedFormState);
          setRefundAttribute(parsedState.refundAttribute || '');
          setCatalogReasonId(
            typeof parsedState.catalogReasonId === 'number' ? parsedState.catalogReasonId : null
          );
          setRefundRejection(parsedState.refundRejection || '');
          setRefundType(parsedState.refundType || '');
          setFault(parsedState.fault || '');
          setMerchantDebit(parsedState.merchantDebit || '');
          setShowRefundType(parsedState.showRefundType || false);
          setShowFault(parsedState.showFault || false);
          setShowMerchantDebit(parsedState.showMerchantDebit || false);
          setShowSubmit(parsedState.showSubmit || false);
          if (parsedState.selectAll !== undefined) setSelectAll(parsedState.selectAll);
          if (Array.isArray(parsedState.refundItems) && parsedState.refundItems.length > 0) {
            setRefundItems(parsedState.refundItems);
          }
        } catch {
          localStorage.removeItem('refundFormState');
        }
      }
    }
  }, [modalOpen]);

  const loadOrderItems = useCallback(
    async (opts?: { bustCache?: boolean }) => {
      if (orderIdProp == null) return;
      if (opts?.bustCache) invalidateOrderItemsCache(orderIdProp);

      const cached = opts?.bustCache ? null : resolveOrderItemsPayload(orderIdProp, prefetchedOrderItems);
      if (cached) {
        applyItemsPayload(cached);
        return;
      }

      setItemsError(null);
      if (!getCachedOrderItems(orderIdProp)) {
        setItemsFetchSettled(false);
      }

      const parsed = await fetchOrderItemsCached(orderIdProp);
      if (parsed?.items?.length) {
        applyItemsPayload(parsed);
        return;
      }

      setItemsError('Could not load order items — server may be busy.');
      setRefundItems([]);
      setPricing(null);
      setItemsFetchSettled(true);
    },
    [orderIdProp, prefetchedOrderItems, applyItemsPayload]
  );

  useEffect(() => {
    const payload = resolveOrderItemsPayload(orderIdProp, prefetchedOrderItems);
    if (payload) applyItemsPayload(payload);
  }, [prefetchedOrderItems, orderIdProp, applyItemsPayload]);

  useEffect(() => {
    if (!modalOpen || orderIdProp == null) return;
    void loadOrderItems();
  }, [modalOpen, orderIdProp, loadOrderItems]);

  useEffect(() => {
    const urls = refundItems
      .filter((i) => i.hasImage && i.imageUrl)
      .map((i) => resolveAttachmentProxyUrl(i.imageUrl as string) || (i.imageUrl as string));
    preloadOrderItemImages(urls);
    urls.forEach((url) => {
      if (loadedImageUrls.has(url)) return;
      const img = new window.Image();
      img.decoding = 'async';
      img.onload = () => {
        setLoadedImageUrls((prev) => {
          if (prev.has(url)) return prev;
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.onerror = () => {
        // Still mark as "attempted" so modal does not spin forever.
        setLoadedImageUrls((prev) => {
          if (prev.has(url)) return prev;
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.src = url;
    });
  }, [refundItems]);

  // Never leave the Item Image modal spinning if the network hangs.
  useEffect(() => {
    if (!showImageModal || !imagePanelLoading) return;
    const t = window.setTimeout(() => setImagePanelLoading(false), 4000);
    return () => window.clearTimeout(t);
  }, [showImageModal, imagePanelLoading, selectedItemImage?.imageUrl]);

  useEffect(() => {
    const allItemsSelected = refundItems.every(item => item.isSelected);
    setSelectAll(allItemsSelected);
  }, [refundItems]);

  useEffect(() => {
    if (!modalOpen) return;
    const scrollToSection = () => {
      if (showSubmit && submitButtonRef.current) {
        setTimeout(() => {
          submitButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      } else {
        const targetRef = showMerchantDebit ? merchantDebitRef.current : showFault ? faultRef.current : showRefundType ? refundTypeRef.current : refundType === 'refund_without_cancellation' ? refundItemsRef.current : null;
        if (targetRef) {
          setTimeout(() => targetRef?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
      }
    };
    scrollToSection();
  }, [showRefundType, showFault, showMerchantDebit, showSubmit, refundType, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    if (refundType === 'cancel_without_refund') return;
    if (fault && showFault && !showMerchantDebit) {
      const timer = setTimeout(() => setShowMerchantDebit(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [fault, showFault, showMerchantDebit, modalOpen, refundType]);

  const checkItemSelectionForCancellation = () => {
    return refundItems.some(item => item.isSelected);
  };

  const attributeRejectionOptions = reasonsForAttribute(catalogGrouped, refundAttribute);

  const customerCtcTotal = useMemo(() => {
    const customerBill = pricing?.customer ?? pricing;
    return roundMoney(Math.max(0, customerBill?.totalOrderAmount ?? 0));
  }, [pricing]);

  const remainingCtcRefundable = useMemo(() => {
    if (
      typeof refundRemainingRefundable === 'number' &&
      Number.isFinite(refundRemainingRefundable)
    ) {
      return roundMoney(Math.max(0, refundRemainingRefundable));
    }
    return customerCtcTotal;
  }, [refundRemainingRefundable, customerCtcTotal]);

  const customerCtcItemCaps = useMemo(
    () => computeCustomerCtcItemCaps(refundItems, customerCtcTotal),
    [refundItems, customerCtcTotal, itemsFetchSettled]
  );

  const selectedCustomerCtcTotal = useMemo(
    () =>
      calculateSelectedCustomerCtcTotal(
        refundItems,
        itemsSourceRef.current,
        customerCtcTotal
      ),
    [refundItems, customerCtcTotal, itemsFetchSettled]
  );

  const selectedRefundItemCount = useMemo(
    () => refundItems.filter((item) => item.isSelected).length,
    [refundItems]
  );

  const applyCancelWithoutRefundCatalogReason = useCallback(() => {
    const row = findCancelledWithoutRefundReason(catalogGrouped);
    if (!row) return;
    setRefundAttribute(row.attribute);
    setCatalogReasonId(normalizeCatalogReasonId(row.id));
    setRefundRejection(row.label);
  }, [catalogGrouped]);

  useEffect(() => {
    if (refundType !== 'refund_with_cancellation' && refundType !== 'refund_full_ctc') return;
    const base =
      refundType === 'refund_full_ctc' ? remainingCtcRefundable : selectedCustomerCtcTotal;
    if (base <= 0) {
      setCustomerRefundAmount(0);
      return;
    }
    setCustomerRefundAmount(roundMoney((base * customerRefundPercent) / 100));
  }, [selectedCustomerCtcTotal, remainingCtcRefundable, customerRefundPercent, refundType]);

  useEffect(() => {
    if (!showRefundType || refundType) return;
    // Default to the first action still allowed for this order. A cancelled
    // order can still be refunded further (until 100%), so when cancellation
    // is no longer available we default to a plain refund instead of leaving
    // the agent on the now-disabled "cancel without refund" option.
    if (!blockCancellation) {
      setRefundType('cancel_without_refund');
      setShowFault(false);
      setShowMerchantDebit(false);
      setShowSubmit(true);
    } else if (!blockAllRefunds) {
      setRefundType('refund_full_ctc');
      setCustomerRefundPercent(100);
      setCustomerRefundAmount(remainingCtcRefundable);
      setShowFault(true);
      setShowMerchantDebit(false);
      setShowSubmit(false);
    }
    // else: nothing is allowed (cancelled + fully refunded) — leave unselected;
    // the banner + disabled Submit explain why.
  }, [showRefundType, refundType, blockCancellation, blockAllRefunds, remainingCtcRefundable]);

  useEffect(() => {
    if (refundType !== 'cancel_without_refund') return;
    applyCancelWithoutRefundCatalogReason();
    setShowFault(false);
    setShowMerchantDebit(false);
    setShowSubmit(true);
  }, [refundType, applyCancelWithoutRefundCatalogReason]);

  const handleCustomerRefundPercentChange = (pct: number) => {
    const next = Math.min(100, Math.max(10, pct));
    setCustomerRefundPercent(next);
    const base =
      refundType === 'refund_full_ctc' ? remainingCtcRefundable : selectedCustomerCtcTotal;
    if (base > 0) {
      setCustomerRefundAmount(roundMoney((base * next) / 100));
    }
  };

  const handleCustomerRefundAmountChange = (amount: number) => {
    const next = roundMoney(Math.max(0, amount));
    setCustomerRefundAmount(next);
    const base =
      refundType === 'refund_full_ctc' ? remainingCtcRefundable : selectedCustomerCtcTotal;
    if (base > 0) {
      const pct = Math.round((next / base) * 100);
      const snapped = Math.min(100, Math.max(10, Math.round(pct / 10) * 10));
      setCustomerRefundPercent(snapped);
    }
  };

  const handleAttributeChange = (value: string) => {
    if (refundAttribute === value) {
      setRefundAttribute('');
      setCatalogReasonId(null);
      setRefundRejection('');
      setShowRefundType(false);
      setFault('');
      return;
    }
    setRefundAttribute(value);
    setCatalogReasonId(null);
    setRefundRejection('');
    setShowRefundType(false);
    const attrRow = catalogAttributes.find((a) => a.code === value);
    setFault(attrRow?.defaultFault ?? '');
  };

  const handleRejectionChange = (value: string) => {
    const id = Number(value);
    const row = attributeRejectionOptions.find((r) => r.id === id);
    if (!row) {
      setCatalogReasonId(null);
      setRefundRejection('');
      setShowRefundType(false);
      return;
    }
    if (catalogReasonId === row.id) {
      setCatalogReasonId(null);
      setRefundRejection('');
      setShowRefundType(false);
      return;
    }
    setCatalogReasonId(row.id);
    setRefundRejection(row.label);
    setShowRefundType(true);
  };

  const handleRefundTypeChange = (value: string) => {
    // Cancel actions are one-time — block them once the order is cancelled.
    if (value === 'cancel_without_refund' && blockCancellation) {
      onToast?.('This order is already cancelled.');
      return;
    }
    if (value === 'refund_with_cancellation' && blockRefundWithCancellation) {
      onToast?.('This order is already cancelled. Refund with cancellation is not available.');
      return;
    }
    // Refund actions are allowed repeatedly until 100% is refunded.
    if (
      (value === 'refund_with_cancellation' ||
        value === 'refund_without_cancellation' ||
        value === 'refund_full_ctc') &&
      blockAllRefunds
    ) {
      onToast?.('This order is already fully refunded — no further refund is allowed.');
      return;
    }
    if (refundType === value) {
      setRefundType('');
      setShowFault(false);
      setShowMerchantDebit(false);
      setShowSubmit(false);
      return;
    }
    setRefundType(value);
    if (value === 'cancel_without_refund') {
      applyCancelWithoutRefundCatalogReason();
      setShowFault(false);
      setShowMerchantDebit(false);
      setFault('');
      setMerchantDebit('');
      setShowSubmit(true);
    } else {
      setShowFault(true);
      setShowMerchantDebit(false);
      setShowSubmit(false);
      setFault('');
      setMerchantDebit('');
      if (value === 'refund_with_cancellation' && selectedCustomerCtcTotal > 0) {
        setCustomerRefundPercent(100);
        setCustomerRefundAmount(selectedCustomerCtcTotal);
      }
      if (value === 'refund_full_ctc' && remainingCtcRefundable > 0) {
        setCustomerRefundPercent(100);
        setCustomerRefundAmount(remainingCtcRefundable);
      }
    }
    if (value === 'refund_without_cancellation') {
      setRefundItems(prev => prev.map(item => ({
        ...item,
        selectedQuantity: !isDeliveryFeeRow(item) ? 1 : 0
      })));
    }
  };

  const handleFaultChange = (value: string) => {
    if (fault === value) {
      setFault('');
      setShowMerchantDebit(false);
      return;
    }
    setFault(value);
    setTimeout(() => setShowMerchantDebit(true), 1000);
  };

  const handleMerchantDebitChange = (value: string) => {
    if (merchantDebit === value) {
      setMerchantDebit('');
      setShowSubmit(false);
      return;
    }
    setMerchantDebit(value);
    setShowSubmit(true);
  };

  const toggleItemSelection = (itemId: number) => {
    setRefundItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, isSelected: !item.isSelected } : item
    ));
  };

  const handleSelectAll = () => {
    const newSelectAllState = !selectAll;
    setSelectAll(newSelectAllState);
    setRefundItems(prev => prev.map(item => ({ ...item, isSelected: newSelectAllState })));
  };

  const handleRefundItemTypeChange = (itemId: number, type: 'NONE' | 'FULL' | 'PARTIAL') => {
    setRefundItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updatedItem = { ...item, refundType: type, showDropdown: false };
      if (type === 'NONE') {
        updatedItem.selectedQuantity = 0;
        updatedItem.customAmount = item.amountPerQuantity;
      } else if (type === 'FULL') {
        updatedItem.selectedQuantity = item.quantity;
        updatedItem.customAmount = item.amountPerQuantity;
      } else if (type === 'PARTIAL' && item.selectedQuantity === 0) {
        updatedItem.selectedQuantity = 1;
      }
      return updatedItem;
    }));
  };

  const handleQuantityChange = (itemId: number, quantity: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newQuantity = Math.min(Math.max(0, quantity), item.quantity);
      const updatedItem = { ...item, selectedQuantity: newQuantity };
      if (newQuantity === 0) {
        updatedItem.refundType = 'NONE';
        updatedItem.customAmount = item.amountPerQuantity;
      } else if (newQuantity === item.quantity) {
        updatedItem.refundType = 'FULL';
        updatedItem.customAmount = item.amountPerQuantity;
      } else {
        updatedItem.refundType = 'PARTIAL';
      }
      return updatedItem;
    }));
  };

  const handleCustomAmountChange = (itemId: number, amount: number) => {
    setRefundItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, customAmount: Math.max(0, amount) } : item
    ));
  };

  const handleRemarkChange = (itemId: number, remark: string) => {
    setRefundItems(prev => prev.map(item => item.id === itemId ? { ...item, remark } : item));
  };

  const getItemBalances = useCallback(
    (item: RefundItem) =>
      itemRefundBalances({
        itemId: item.id,
        originalTotal: customerCtcItemCaps.get(item.id) ?? originalItemCtcTotal(item),
        alreadyById: itemAlreadyRefunded,
      }),
    [itemAlreadyRefunded, customerCtcItemCaps]
  );

  /** Remaining for selected qty (proportional share of line remaining). */
  const remainingForSelectedQty = useCallback(
    (item: RefundItem) => {
      const bal = getItemBalances(item);
      if (bal.fullyRefunded) return 0;
      const fullQty = Math.max(1, item.quantity);
      const selQty = item.selectedQuantity > 0 ? item.selectedQuantity : fullQty;
      return roundMoney(bal.remainingRefundable * (selQty / fullQty));
    },
    [getItemBalances]
  );

  const handlePercentageChange = (itemId: number, percentage: number) => {
    setRefundItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const cap = customerCtcItemCaps.get(item.id) ?? originalItemCtcTotal(item);
        const bal = itemRefundBalances({
          itemId: item.id,
          originalTotal: cap,
          alreadyById: itemAlreadyRefunded,
        });
        if (bal.fullyRefunded) {
          return {
            ...item,
            refundPercentage: 0,
            customAmount: 0,
            refundType: 'NONE' as const,
            selectedQuantity: 0,
          };
        }
        const currentQuantity = item.selectedQuantity > 0 ? item.selectedQuantity : item.quantity;
        const remainingShare = roundMoney(
          bal.remainingRefundable * (Math.max(1, currentQuantity) / Math.max(1, item.quantity))
        );
        return {
          ...item,
          refundPercentage: percentage,
          customAmount: roundMoney((remainingShare * percentage) / 100),
          refundType: percentage > 0 ? 'PARTIAL' : 'NONE',
          selectedQuantity: percentage > 0 ? Math.max(1, item.selectedQuantity || item.quantity) : 0,
        };
      })
    );
  };

  const generatePercentageOptions = () => {
    const options = [0];
    for (let i = 10; i <= 100; i += 10) options.push(i);
    return options;
  };

  const calculatePercentageRefundAmount = (item: RefundItem) => {
    if (item.refundPercentage === 0) return 0;
    const bal = getItemBalances(item);
    if (bal.fullyRefunded) return 0;
    const remainingShare = remainingForSelectedQty(item);
    return roundMoney((remainingShare * item.refundPercentage) / 100);
  };

  const calculateTotalPercentageRefundAmount = () => {
    return refundItems
      .filter((item) => !isDeliveryFeeRow(item))
      .reduce((total, item) => total + calculatePercentageRefundAmount(item), 0);
  };

  const handleImageClick = (item: RefundItem) => {
    if (!item.hasImage || !item.imageUrl) return;
    const url = resolveAttachmentProxyUrl(item.imageUrl) || item.imageUrl;
    const alreadyReady = loadedImageUrls.has(url);
    setSelectedItemImage({ id: item.id, name: item.name, imageUrl: url });
    setImagePanelLoading(!alreadyReady);
    setShowImageModal(true);
  };

  const handleImageHover = (item: RefundItem) => {
    if (!item.imageUrl) return;
    const url = resolveAttachmentProxyUrl(item.imageUrl) || item.imageUrl;
    preloadOrderItemImages([url]);
    // Warm decode so modal opens without spinner when possible.
    if (typeof window === 'undefined' || loadedImageUrls.has(url)) return;
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => {
      setLoadedImageUrls((prev) => {
        if (prev.has(url)) return prev;
        const next = new Set(prev);
        next.add(url);
        return next;
      });
    };
    img.src = url;
  };

  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedItemImage(null);
  };

  const generateQuantityOptionsFrom1 = (maxQuantity: number) => {
    const options = [];
    for (let i = 1; i <= maxQuantity; i++) options.push(i);
    return options;
  };

  const handleRefundQuantityChange = (itemId: number, quantity: number) => {
    setRefundItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const cap = customerCtcItemCaps.get(item.id) ?? originalItemCtcTotal(item);
        const bal = itemRefundBalances({
          itemId: item.id,
          originalTotal: cap,
          alreadyById: itemAlreadyRefunded,
        });
        if (bal.fullyRefunded) return item;
        const updatedItem = { ...item, selectedQuantity: quantity };
        if (item.refundPercentage > 0) {
          const remainingShare = roundMoney(
            bal.remainingRefundable * (quantity / Math.max(1, item.quantity))
          );
          updatedItem.customAmount = roundMoney((remainingShare * item.refundPercentage) / 100);
        }
        return updatedItem;
      })
    );
  };

  const calculateTotalRefundAmount = () => {
    return refundItems.reduce((total, item) => {
      if (item.refundType !== 'NONE') {
        if (refundType === 'refund_without_cancellation' && item.refundPercentage > 0) {
          return total + calculatePercentageRefundAmount(item);
        }
        const amount = item.refundType === 'PARTIAL' ? item.customAmount : item.amountPerQuantity;
        return total + (item.selectedQuantity * amount);
      }
      return total;
    }, 0);
  };

  /** Merchant CTM amount to debit from wallet (uses frozen merchant line amounts, not customer CTC). */
  /**
   * Customer refund for partial path = sum of remaining-based CTC amounts
   * (already in customer CTC space — no second ratio scale).
   */
  const calculateCustomerPayableRefund = (): number => {
    if (refundType === 'refund_without_cancellation') {
      return roundMoney(calculateTotalPercentageRefundAmount());
    }
    const selected = calculateTotalRefundAmount();
    const itemBillTotal = refundItems.reduce(
      (sum, i) => sum + i.amountPerQuantity * (isDeliveryFeeRow(i) ? 1 : i.quantity),
      0
    );
    if (itemBillTotal <= 0 || customerCtcTotal <= 0) return roundMoney(selected);
    return roundMoney((selected / itemBillTotal) * customerCtcTotal);
  };

  const calculateMerchantDebitAmount = (): number => {
    if (merchantDebit === 'no_debit' || !merchantDebit) return 0;
    const merchantTotal = pricing?.totalOrderAmount ?? 0;
    if (refundType === 'refund_full_ctc') {
      if (merchantDebit === 'full_debit') {
        return roundMoney(Math.max(0, merchantTotal));
      }
      if (merchantDebit === 'partial_debit') {
        const ratio = Math.min(1, Math.max(0, customerRefundPercent / 100));
        return roundMoney(Math.min(merchantTotal, merchantTotal * ratio));
      }
      return 0;
    }
    if (merchantDebit === 'full_debit') {
      return roundMoney(Math.max(0, merchantTotal));
    }
    if (merchantDebit !== 'partial_debit') return 0;

    const source = itemsSourceRef.current;
    let total = 0;
    for (const item of refundItems) {
      const row = source.find((r) => r.id === item.id);
      const unitMerchant = row?.amountPerQuantity ?? item.amountPerQuantity;

      if (refundType === 'refund_without_cancellation') {
        if (item.refundPercentage <= 0) continue;
        const qty = item.selectedQuantity > 0 ? item.selectedQuantity : 1;
        total += (unitMerchant * item.refundPercentage * qty) / 100;
        continue;
      }

      if (item.refundType === 'NONE') continue;
      const qty = isDeliveryFeeRow(item)
        ? 1
        : item.selectedQuantity > 0
          ? item.selectedQuantity
          : item.quantity;
      if (item.refundType === 'PARTIAL') {
        const customerUnit = item.amountPerQuantity > 0 ? item.amountPerQuantity : unitMerchant;
        const ratio = customerUnit > 0 ? unitMerchant / customerUnit : 1;
        total += roundMoney(item.customAmount * ratio);
      } else {
        total += roundMoney(unitMerchant * qty);
      }
    }

    if (total <= 0 && merchantTotal > 0) {
      return roundMoney(merchantTotal);
    }
    return roundMoney(Math.min(Math.max(0, total), merchantTotal));
  };

  const handleSubmit = async () => {
    const requiresFaultAndDebit = refundType !== 'cancel_without_refund';
    if (!refundAttribute || !catalogReasonId || !refundRejection || !refundType) {
      onToast?.('Please complete all refund options');
      return;
    }
    if (refundType === 'refund_with_cancellation' && blockRefundWithCancellation) {
      onToast?.('This order is already cancelled. Refund with cancellation is not available.');
      return;
    }
    if (requiresFaultAndDebit && (!fault || !merchantDebit)) {
      onToast?.('Please complete fault and merchant debit options');
      return;
    }
    if (refundType === 'refund_without_cancellation') {
      const hasRefundItems = refundItems.some(
        (item) => !isDeliveryFeeRow(item) && item.refundPercentage > 0
      );
      if (!hasRefundItems) {
        onToast?.('Please select at least one item and refund % in the partial CTC refund table');
        return;
      }
    } else if (refundType !== 'cancel_without_refund') {
      if (!checkItemSelectionForCancellation()) {
        onToast?.('Please select at least one item (including delivery fee if applicable)');
        return;
      }
    }
    if (refundType === 'refund_with_cancellation' || refundType === 'refund_full_ctc') {
      if (!(customerRefundAmount > 0)) {
        onToast?.('Customer refund amount must be greater than 0.');
        return;
      }
    }
    setEnginePreview(null);
    setRiderPenaltyPreview(null);
    setPenaltyRiders([]);
    setPenaltyRiderId(null);
    setPenaltyPreviewsByRiderId({});

    const orderId = orderIdProp ?? null;
    if (orderId != null) {
      setPreviewLoading(true);
      try {
        if (isThreePlFaultSelected) {
          await fetchRiderPenaltyPreview(orderId);
        } else if (showEnginePreviewInConfirm) {
          const totalAmount = calculateTotalRefundAmount();
          const previewAmount =
            refundType === 'refund_with_cancellation' || refundType === 'refund_full_ctc'
              ? customerRefundAmount
              : refundType === 'refund_without_cancellation'
                ? calculateCustomerPayableRefund()
                : totalAmount;
          const fullCtcRefundCatalog =
            refundType === 'refund_full_ctc'
              ? buildFullCtcRefundCatalog(refundItems, itemAlreadyRefunded)
              : [];
          const res = await fetch(`/api/orders/${orderId}/refunds/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              refundType,
              refundAmount: previewAmount,
              catalogReasonId,
              attribute: refundAttribute,
              rejection: refundRejection,
              refundMetadata:
                refundType === 'refund_without_cancellation'
                  ? {
                      refundItems: refundItems
                        .filter((i) => i.refundPercentage > 0 && calculatePercentageRefundAmount(i) > 0)
                        .map((i) => {
                          const bal = getItemBalances(i);
                          const amount = calculatePercentageRefundAmount(i);
                          return {
                            id: i.id,
                            refundPercentage: i.refundPercentage,
                            amount,
                            originalTotal: bal.originalTotal,
                            alreadyRefundedBefore: bal.alreadyRefunded,
                            remainingBefore: bal.remainingRefundable,
                          };
                        }),
                    }
                  : refundType === 'refund_with_cancellation'
                    ? {
                        refundPercentage: customerRefundPercent,
                        ctcTotal: selectedCustomerCtcTotal,
                        customerRefundAmount: customerRefundAmount,
                      }
                    : refundType === 'refund_full_ctc'
                      ? {
                          refundPercentage: customerRefundPercent,
                          ctcTotal: remainingCtcRefundable,
                          customerRefundAmount: customerRefundAmount,
                          fullCtcRefund: true,
                          refundItemsCatalog: fullCtcRefundCatalog,
                        }
                      : undefined,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success) {
            setEnginePreview((data.preview as EnginePreviewDisplay) ?? null);
          } else {
            setEnginePreview({
              ok: false,
              rule_code: null,
              execution_status: 'UNAVAILABLE',
              amounts: null,
              error: typeof data.error === 'string' ? data.error : 'Preview failed',
              simulated: false,
            });
          }
        }
      } catch {
        /* preview is best-effort */
      } finally {
        setPreviewLoading(false);
      }
    }

    setShowWarning(true);
  };

  const resetFormAndClose = () => {
    setRefundAttribute('');
    setCatalogReasonId(null);
    setRefundRejection('');
    setRefundType('');
    setFault('');
    setMerchantDebit('');
    setCustomerRefundPercent(100);
    setCustomerRefundAmount(0);
    setShowRefundType(false);
    setShowFault(false);
    setShowMerchantDebit(false);
    setShowSubmit(false);
    setShowWarning(false);
    setEnginePreview(null);
    setRiderPenaltyPreview(null);
    setPenaltyRiders([]);
    setPenaltyRiderId(null);
    setPenaltyPreviewsByRiderId({});
    setSelectAll(false);
    setRefundItems(prev => prev.map(item => ({
      ...item,
      refundType: 'NONE',
      selectedQuantity: 0,
      remark: '',
      showDropdown: false,
      customAmount: item.amountPerQuantity,
      isSelected: false,
      refundPercentage: 0
    })));
    if (typeof window !== 'undefined') {
      localStorage.removeItem('refundFormState');
    }
    setModalOpen(false);
    onClose?.();
  };

  const confirmRefund = async () => {
    const orderId = orderIdProp ?? null;
    const totalAmount =
      refundType === 'refund_without_cancellation'
        ? calculateCustomerPayableRefund()
        : refundType === 'refund_full_ctc' || refundType === 'refund_with_cancellation'
          ? customerRefundAmount
          : calculateTotalRefundAmount();
    const mxDebitAmount = calculateMerchantDebitAmount();

    // ── Client-side mirror of the server money-safety guard ──────────────
    // The server (POST /api/orders/[orderId]/refunds) is authoritative and
    // returns 409, but blocking here avoids a pointless round trip and gives
    // instant feedback.
    const cancelsOrder =
      refundType === 'cancel_without_refund' || refundType === 'refund_with_cancellation';
    const movesRefund =
      refundType === 'refund_with_cancellation' ||
      refundType === 'refund_without_cancellation' ||
      refundType === 'refund_full_ctc';
    if (cancelsOrder && blockCancellation) {
      onToast?.('This order is already cancelled — it cannot be cancelled again.');
      return;
    }
    if (movesRefund && blockAllRefunds) {
      onToast?.('This order is already fully refunded — no further refund is allowed.');
      return;
    }
    if (
      movesRefund &&
      typeof refundRemainingRefundable === 'number' &&
      Number.isFinite(refundRemainingRefundable) &&
      totalAmount - refundRemainingRefundable > 0.01
    ) {
      onToast?.(
        `Refund of ₹${totalAmount.toFixed(2)} exceeds the remaining refundable amount ₹${refundRemainingRefundable.toFixed(2)}.`
      );
      return;
    }

    // Per-item remaining check (partial path).
    if (refundType === 'refund_without_cancellation') {
      for (const item of refundItems) {
        if (item.refundType === 'NONE' || item.refundPercentage <= 0) continue;
        const bal = getItemBalances(item);
        const amt = calculatePercentageRefundAmount(item);
        if (bal.fullyRefunded) {
          onToast?.(`Item #${item.id} is already fully refunded.`);
          return;
        }
        if (amt - bal.remainingRefundable > 0.01) {
          onToast?.(
            `Item #${item.id}: ₹${amt.toFixed(2)} exceeds this item's remaining CTC share ₹${bal.remainingRefundable.toFixed(2)}.`
          );
          return;
        }
      }
    }

    const notificationMessages: Record<string, string> = {
      cancel_without_refund: 'Order has been cancelled successfully without refund.',
      refund_with_cancellation: 'Order has been cancelled and refund processed successfully.',
      refund_without_cancellation: `Refund of ₹${totalAmount.toFixed(2)} has been processed successfully.`,
      refund_full_ctc: `CTC refund of ₹${totalAmount.toFixed(2)} has been processed successfully.`,
    };

    if (refundType === 'cancel_without_refund') {
      if (orderId != null) {
        try {
          setIsSubmitting(true);
          const { res, data } = await postOrderRefundWithRetry(orderId, {
            refundType: 'cancel_without_refund',
            refundReason: `${refundAttribute} - ${refundRejection}`,
            refundDescription: refundRejection,
            attribute: refundAttribute,
            rejection: refundRejection,
            catalogReasonId,
            fault,
            penaltyRiderId: isThreePlFaultSelected ? penaltyRiderId : null,
            mxDebitAmount: 0,
          });
          if (!res.ok) {
            onToast?.(refundApiErrorMessage(res.status, data, 'Failed to record cancellation'));
            return;
          }
        } catch (e) {
          onToast?.(e instanceof Error ? e.message : 'Failed to submit');
          return;
        } finally {
          setIsSubmitting(false);
        }
      }
      onToast?.(notificationMessages.cancel_without_refund);
      onRefundCreated?.();
      resetFormAndClose();
      return;
    }

    if (orderId == null) {
      onToast?.('Order id is required to create a refund.');
      return;
    }
    if (refundType === 'refund_without_cancellation' && totalAmount <= 0) {
      onToast?.('Refund amount must be greater than 0.');
      return;
    }
    const refundAmount =
      refundType === 'refund_with_cancellation' || refundType === 'refund_full_ctc'
        ? customerRefundAmount
        : roundMoney(calculateCustomerPayableRefund());

    // Razorpay rejects refunds below ₹1 — lift to the minimum, but never beyond
    // what is still refundable on this order.
    const remainingRefundable =
      typeof refundRemainingRefundable === 'number' && Number.isFinite(refundRemainingRefundable)
        ? refundRemainingRefundable
        : refundAmount;
    let amountToSend = roundMoney(refundAmount);
    if (amountToSend > 0 && amountToSend < MIN_GATEWAY_REFUND) {
      const lifted = roundMoney(Math.min(MIN_GATEWAY_REFUND, Math.max(remainingRefundable, 0)));
      if (lifted < MIN_GATEWAY_REFUND) {
        onToast?.(
          `Refund must be at least ₹${MIN_GATEWAY_REFUND} (payment gateway minimum) — only ₹${Math.max(remainingRefundable, 0).toFixed(2)} is still refundable on this order.`
        );
        return;
      }
      amountToSend = lifted;
    }
    if (amountToSend <= 0) {
      onToast?.('Refund amount must be greater than 0.');
      return;
    }

    const fullCtcRefundCatalog =
      refundType === 'refund_full_ctc'
        ? buildFullCtcRefundCatalog(refundItems, itemAlreadyRefunded)
        : [];

    try {
      setIsSubmitting(true);
      const { res, data } = await postOrderRefundWithRetry(orderId, {
        refundType,
        refundReason: `${refundAttribute} - ${refundRejection}`,
        refundDescription: `Fault: ${fault}, Merchant debit: ${merchantDebit}`,
        refundAmount: amountToSend,
        mxDebitAmount,
        mxDebitReason: merchantDebit,
        attribute: refundAttribute,
        rejection: refundRejection,
        catalogReasonId,
        fault,
        penaltyRiderId: isThreePlFaultSelected ? penaltyRiderId : null,
        merchantDebit,
        refundMetadata:
          refundType === 'refund_without_cancellation'
            ? {
                refundItems: refundItems
                  .filter((i) => i.refundPercentage > 0 && calculatePercentageRefundAmount(i) > 0)
                  .map((i) => {
                    const bal = getItemBalances(i);
                    const amount = calculatePercentageRefundAmount(i);
                    return {
                      id: i.id,
                      name: i.name,
                      refundPercentage: i.refundPercentage,
                      selectedQuantity: i.selectedQuantity,
                      amount,
                      originalTotal: bal.originalTotal,
                      alreadyRefundedBefore: bal.alreadyRefunded,
                      remainingBefore: bal.remainingRefundable,
                    };
                  }),
              }
            : refundType === 'refund_with_cancellation'
              ? {
                  refundPercentage: customerRefundPercent,
                  ctcTotal: customerCtcTotal,
                  customerRefundAmount: customerRefundAmount,
                }
              : refundType === 'refund_full_ctc'
                ? {
                    refundPercentage: customerRefundPercent,
                    ctcTotal: remainingCtcRefundable,
                    customerRefundAmount: customerRefundAmount,
                    fullCtcRefund: true,
                    refundItemsCatalog: fullCtcRefundCatalog,
                  }
                : undefined,
      });
      if (!res.ok) {
        onToast?.(refundApiErrorMessage(res.status, data, 'Failed to create refund'));
        return;
      }
      onToast?.(notificationMessages[refundType] ?? 'Refund created.');
      onRefundCreated?.();
      resetFormAndClose();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Failed to submit refund');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelRefund = () => {
    setShowWarning(false);
    onToast?.('Refund creation cancelled');
  };

  const handleModalClose = () => {
    setModalOpen(false);
    onClose?.();
  };

  if (!modalOpen) return null;

  return (
    <>
      {showWarning && (
        <OrderPageOverlay
          zClass="z-[210]"
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm p-5"
        >
          <div
            className={`bg-white rounded-xl w-full shadow-[0_20px_40px_rgba(0,0,0,0.3)] animate-[fadeIn_0.3s_ease] overflow-hidden ${
              isCompactConfirmModal ? 'max-w-md' : 'max-w-[min(1000px,94vw)]'
            }`}
          >
            <div
              className={`flex items-center justify-between ${
                isCompactConfirmModal ? 'px-4 pt-4 pb-1' : 'px-5 pt-5 pb-1'
              }`}
            >
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2.5 m-0">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" strokeWidth={2.25} />
                Confirm Refund
              </h3>
              <button
                type="button"
                onClick={cancelRefund}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={isCompactConfirmModal ? 'px-4 pb-4' : 'px-5 pb-5'}>
              {isExceptionalFault ? (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-3 mb-4">
                  <p className="text-sm text-violet-950 leading-relaxed m-0">
                    This resolution will charge the compensation or refund from GatiMitra&apos;s
                    account, not from the customer, rider, or merchant. Please verify all case
                    details before proceeding.
                  </p>
                </div>
              ) : isMerchantOrCustomerFault ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 mb-4">
                  <p className="text-sm text-slate-600 leading-relaxed m-0">
                    You are about to create a refund. Once submitted, this action cannot be undone.
                    You will be responsible for this refund.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500 leading-relaxed mb-3 m-0">
                  You are about to create a refund. Once submitted, this action cannot be undone.{' '}
                  You will be responsible for this refund.
                </p>
              )}

              {previewLoading && showEnginePreviewInConfirm && (
                <p className="mb-4 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating rule engine outcome…
                </p>
              )}

              {isThreePlFaultSelected && previewLoading && (
                <div className="mb-3 rounded-lg border border-amber-200/80 bg-[#FFF8F0] px-3 py-2.5 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  Loading rider penalty preview…
                </div>
              )}

              {isThreePlFaultSelected && !previewLoading && (
                <div className="rounded-lg border border-amber-200/80 bg-[#FFF8F0] px-3 py-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <Shield className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-amber-950 m-0 leading-tight">3PL Fault — Rider penalty</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 leading-snug m-0">
                        Penalty will be debited from the selected rider&apos;s wallet when you confirm.
                      </p>
                    </div>
                  </div>

                  {penaltyRiders.length === 0 ? (
                    <p className="mt-2.5 text-sm text-amber-800">
                      No riders were assigned to this order. Penalty cannot be applied.
                    </p>
                  ) : (
                    <>
                      <div className="mt-2.5 flex justify-end">
                        <div className="w-[50%] min-w-0">
                          <label className="block text-[11px] font-medium text-slate-500 mb-1 text-right">
                            Select rider for penalty
                          </label>
                          <div className="relative w-full">
                            <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <select
                              value={penaltyRiderId ?? ''}
                              onChange={(e) => handlePenaltyRiderChange(Number(e.target.value))}
                              className="w-full appearance-none rounded-md border border-slate-200 bg-white py-2 pl-8 pr-8 text-sm font-medium text-slate-800 shadow-none focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
                            >
                              {penaltyRiders.map((r) => (
                                <option key={r.riderId} value={r.riderId}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400 leading-snug text-right">
                            You may change the rider if you know which rider actually marked the order as picked up.
                          </p>
                        </div>
                      </div>

                      {riderPenaltyPreview?.appliesPenalty ? (
                        <div className="mt-2.5 overflow-hidden rounded-md border border-amber-100/90 bg-white/70 divide-y divide-slate-100">
                          <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                                <IndianRupee className="h-3.5 w-3.5" strokeWidth={2.25} />
                              </div>
                              <span className="text-sm text-slate-600">Penalty Amount</span>
                            </div>
                            <span className="text-sm font-bold text-red-600 tabular-nums shrink-0">
                              ₹{riderPenaltyPreview.penaltyAmount.toFixed(2)}
                            </span>
                          </div>
                          {riderPenaltyPreview.scenarioLabel ? (
                            <div className="flex items-center justify-between gap-3 px-3 py-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                                  <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
                                </div>
                                <span className="text-sm text-slate-600">Reason</span>
                              </div>
                              <span className="text-xs text-slate-700 text-right max-w-[55%] leading-snug">
                                {riderPenaltyPreview.scenarioLabel}
                              </span>
                            </div>
                          ) : null}
                          {riderPenaltyPreview.ledgerTitle ? (
                            <div className="flex items-center justify-between gap-3 px-3 py-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                                  <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                                </div>
                                <span className="text-sm text-slate-600">Ledger</span>
                              </div>
                              <span className="text-xs text-slate-700 text-right max-w-[55%] leading-snug">
                                {riderPenaltyPreview.ledgerTitle}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2.5 text-sm text-amber-800">
                          {riderPenaltyPreview?.skippedLabel ?? 'No rider penalty will be applied.'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {showEnginePreviewInConfirm && enginePreview && !previewLoading && (
                <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-slate-700">
                  <p className="font-semibold text-indigo-900">Financial Rule Engine preview</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Shows which configured financial rule would run and the refund amount the engine calculates before you confirm.
                  </p>
                  {enginePreview.error ? (
                    <p className="mt-2 text-amber-800">{formatEnginePreviewError(enginePreview.error)}</p>
                  ) : null}
                  <p className="mt-2">
                    Rule:{' '}
                    <span className="font-medium">{enginePreview.rule_code ?? '—'}</span>
                    {' · '}
                    Status:{' '}
                    <span className="font-medium">
                      {formatEnginePreviewStatus(enginePreview.execution_status)}
                    </span>
                  </p>
                  {enginePreview.scenario ? (
                    <p className="mt-1 text-slate-500">
                      Scenario: {enginePreview.scenario}
                      {enginePreview.order_milestone ? ` · Stage: ${enginePreview.order_milestone}` : null}
                    </p>
                  ) : null}
                  {enginePreview.amounts && typeof enginePreview.amounts.refund === 'number' ? (
                    <p className="mt-1">
                      <OrderMixedText>{`Engine refund: ₹${Number(enginePreview.amounts.refund).toFixed(2)}`}</OrderMixedText>
                    </p>
                  ) : null}
                  {enginePreview.execution_status === 'APPROVAL_REQUIRED' && (
                    <p className="mt-1 text-amber-800">This refund will require super-admin approval before settlement.</p>
                  )}
                </div>
              )}

              {isThreePlFaultSelected && !previewLoading && penaltyRiders.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                  <Info className="h-3.5 w-3.5 shrink-0 text-blue-600 mt-0.5" strokeWidth={2.25} />
                  <p className="text-[11px] text-blue-800 leading-snug m-0">
                    Please review the details above before confirming the refund.
                  </p>
                </div>
              )}

              <div className={`flex justify-end gap-3 ${isCompactConfirmModal ? 'mt-2' : 'mt-4'}`}>
                <button
                  type="button"
                  onClick={cancelRefund}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border-none rounded-lg font-medium cursor-pointer transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRefund}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white border-none rounded-lg font-medium cursor-pointer transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                      Confirm Refund
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </OrderPageOverlay>
      )}

      {showImageModal && selectedItemImage && (
        <OrderPageOverlay
          zClass="z-[220]"
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 backdrop-blur-sm p-5"
          onBackdropClick={closeImageModal}
        >
          <div ref={imageModalRef} className="bg-white rounded-xl w-full max-w-[500px] shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-50 to-white px-5 py-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Image className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800">Item Image</h3>
                  <p className="text-xs text-gray-500 mt-0.5">ID: {selectedItemImage.id}</p>
                </div>
              </div>
              <button type="button" onClick={closeImageModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <h4 className="text-lg font-semibold text-gray-800 text-center mb-4">{selectedItemImage.name}</h4>
              <div className="rounded-xl overflow-hidden border border-gray-200 shadow-lg min-h-[200px] flex items-center justify-center bg-gray-50 relative">
                {imagePanelLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 absolute z-10" aria-hidden />
                ) : null}
                <OrderItemImagePanel
                  url={selectedItemImage.imageUrl}
                  alt={selectedItemImage.name}
                  onReady={() => {
                    const url = selectedItemImage.imageUrl;
                    setLoadedImageUrls((prev) => {
                      if (prev.has(url)) return prev;
                      const next = new Set(prev);
                      next.add(url);
                      return next;
                    });
                    setImagePanelLoading(false);
                  }}
                />
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-200">
              <button type="button" onClick={closeImageModal} className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </OrderPageOverlay>
      )}

      <OrderPageOverlay
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-5"
        onBackdropClick={(e) => {
          if (e.target === e.currentTarget) handleModalClose();
        }}
      >
        <div className="bg-white rounded-lg w-full max-w-[min(1100px,96vw)] max-h-[85vh] overflow-y-auto shadow-[0_20px_40px_rgba(0,0,0,0.2)] animate-[fadeIn_0.3s_ease]" onClick={(e) => e.stopPropagation()}>
          <div className="bg-emerald-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center rounded-t-lg sticky top-0 z-10">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 m-0">
              <span className="flex items-center justify-center w-8 h-8 rounded-md bg-emerald-100 text-emerald-600 shrink-0" aria-hidden>
                <Package className="w-5 h-5" strokeWidth={2} />
              </span>
              <span className="truncate">Items details</span>
            </h3>
            <button type="button" onClick={handleModalClose} className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded-full transition-colors cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-4">
            {canCreateRefund && refundType !== 'refund_without_cancellation' ? (
            <div className="mb-3 px-3 py-2 bg-emerald-50/80 border border-slate-200 rounded-md flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="checkbox-circle text-emerald-600 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                />
                <span className="text-sm font-medium text-slate-800 group-hover:text-emerald-600">Select All Items</span>
              </label>
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-slate-200">
                <div className={`w-2 h-2 rounded-full ${selectAll ? 'bg-green-500' : 'bg-emerald-500'}`} />
                <span className="text-xs font-medium text-slate-700">
                  <span className="font-semibold text-emerald-600">{refundItems.filter(item => item.isSelected).length}</span>
                  <span className="text-slate-500 mx-0.5">/</span>
                  <span className="font-semibold text-slate-800">{refundItems.length}</span>
                  <span className="text-slate-500 ml-0.5">selected</span>
                </span>
              </div>
              <div className="w-full min-w-[120px] max-w-[180px] h-1 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${refundItems.length > 0 ? (refundItems.filter(item => item.isSelected).length / refundItems.length) * 100 : 0}%` }} />
              </div>
            </div>
            ) : null}

            {itemsError && refundItems.length === 0 ? (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 flex flex-wrap items-center justify-between gap-2">
                <span>{itemsError}</span>
                <button
                  type="button"
                  onClick={() => void loadOrderItems({ bustCache: true })}
                  className="shrink-0 px-3 py-1 rounded border border-red-300 bg-white text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : itemsFetchSettled && refundItems.length === 0 ? (
              <div className="mb-3 px-3 py-4 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-md">
                No items found for this order.
              </div>
            ) : null}

            {!itemsFetchSettled && refundItems.length === 0 && !itemsError ? (
              <div className="mb-3 border border-slate-200 rounded-md overflow-hidden">
                <div className="px-3 py-8 flex flex-col items-center justify-center gap-2 bg-slate-50/80">
                  <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" aria-hidden />
                  <p className="text-xs text-slate-500">Loading order items…</p>
                </div>
              </div>
            ) : null}

            {refundItems.length > 0 ? (
            <div className="overflow-x-auto -mx-1 px-1">
            <table className={`w-full border-collapse text-xs mb-3 ${canCreateRefund && refundType !== 'refund_without_cancellation' ? 'min-w-[960px]' : 'min-w-[880px]'}`}>
              <thead>
                <tr>
                  {canCreateRefund && refundType !== 'refund_without_cancellation' ? (
                    <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Select</th>
                  ) : null}
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Id</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Status</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Name</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-left bg-emerald-50 font-semibold text-slate-800 min-w-[200px]">Customisation</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Qty</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Amount</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Tax</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Charges</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Total</th>
                </tr>
              </thead>
              <tbody>
                {refundItems.map((item) => (
                  <tr key={item.id} className={canCreateRefund && refundType !== 'refund_without_cancellation' && item.isSelected ? 'bg-emerald-50/50' : ''}>
                    {canCreateRefund && refundType !== 'refund_without_cancellation' ? (
                    <td className="px-2 py-1.5 border border-slate-200 text-center">
                      <input type="checkbox" checked={item.isSelected} onChange={() => toggleItemSelection(item.id)} className="checkbox-circle text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0" />
                    </td>
                    ) : null}
                    <td className="px-2 py-1.5 border border-slate-200 text-center">
                      <div className="font-mono text-[11px] font-medium">
                        {item.hasImage && !isDeliveryFeeRow(item) && (
                          <span
                            onClick={() => handleImageClick(item)}
                            onMouseEnter={() => handleImageHover(item)}
                            className="text-emerald-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 inline-flex items-center gap-1 cursor-pointer hover:bg-blue-100"
                            title="View image"
                          >
                            <Image className="w-3 h-3 text-blue-500 shrink-0" /> {item.id}
                          </span>
                        )}
                        {!item.hasImage && !isDeliveryFeeRow(item) && (
                          <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 inline-block">{item.id}</span>
                        )}
                        {isDeliveryFeeRow(item) && (
                          <span className="text-slate-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 inline-block">
                            DEL-FEE <span className="text-gray-400 inline-flex"><Truck className="w-3 h-3" /></span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600">{isDeliveryFeeRow(item) ? 'FIXED' : 'AVAILABLE'}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600">
                      <div className="inline-flex flex-col items-center gap-1 max-w-[220px]">
                        {(() => {
                          const { kind, badge } = resolveMerchantOfferBadge({
                            offerType: item.appliedOfferType,
                            offerLabel: item.offerLabel,
                          });
                          if (!badge) return null;
                          const isBogo = kind === 'bogo';
                          return (
                            <span
                              className={`inline-flex max-w-full truncate rounded-full border px-1.5 py-px text-[9px] font-bold leading-none ${
                                isBogo
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-amber-200 bg-amber-50 text-amber-900'
                              }`}
                              title={badge}
                            >
                              {badge}
                            </span>
                          );
                        })()}
                        <span className="whitespace-normal break-words leading-snug">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border border-slate-200 text-left align-top text-slate-600 min-w-[200px]">
                      <CustomisationCell
                        detail={item.customisationDetail}
                        fallback={item.customisation}
                      />
                    </td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 orders-num">{isDeliveryFeeRow(item) ? '-' : item.quantity}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 tabular-nums">
                      {isDeliveryFeeRow(item) ? (
                        item.amountPerQuantity.toFixed(2)
                      ) : billView === 'merchant' &&
                        item.catalogAmountPerQuantity != null &&
                        item.netAmountPerQuantity != null &&
                        item.netAmountPerQuantity < item.catalogAmountPerQuantity - 0.005 ? (
                        <span className="inline-flex flex-col items-center leading-tight">
                          <span className="text-slate-400 line-through text-[10px]">
                            {item.catalogAmountPerQuantity.toFixed(2)}
                          </span>
                          <span>{item.netAmountPerQuantity.toFixed(2)}</span>
                        </span>
                      ) : (
                        item.amountPerQuantity
                      )}
                    </td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 tabular-nums">{item.taxPerQuantity.toFixed(2)}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 tabular-nums">{item.chargesPerQuantity.toFixed(2)}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 tabular-nums">
                      {billView === 'merchant' &&
                      !isDeliveryFeeRow(item) &&
                      item.catalogAmountPerQuantity != null &&
                      item.netAmountPerQuantity != null &&
                      item.netAmountPerQuantity < item.catalogAmountPerQuantity - 0.005
                        ? (item.netAmountPerQuantity * Math.max(1, item.quantity)).toFixed(2)
                        : originalItemCtcTotal(item).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            ) : null}

            {pricing ? (
              <div className="mt-3 flex justify-end">
                <BillBreakdownSwitcher
                  pricing={pricing}
                  billView={billView}
                  onBillViewChange={handleBillViewChange}
                />
              </div>
            ) : null}

            {canCreateRefund && (
              <div className="mt-4 flex flex-col lg:flex-row gap-4 items-start">
                <div className="flex-1 min-w-0 w-full">
                <h4 className="mb-2 text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-emerald-600 shrink-0" /> Create refund
                </h4>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Refund reason</label>
                  <select value={refundAttribute} onChange={(e) => handleAttributeChange(e.target.value)} disabled={catalogLoading || refundType === 'cancel_without_refund'} className="h-8 px-2 border border-slate-200 rounded text-xs text-slate-800 bg-white min-w-[140px] focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer disabled:opacity-60">
                    <option value="">Select Attribute</option>
                    {catalogAttributes.map((attr) => (
                      <option key={attr.code} value={attr.code}>
                        {attr.displayLabel || attr.code}
                      </option>
                    ))}
                  </select>
                  <select
                    value={catalogReasonId != null ? String(catalogReasonId) : ''}
                    onChange={(e) => handleRejectionChange(e.target.value)}
                    disabled={
                      !refundAttribute ||
                      refundType === 'cancel_without_refund' ||
                      (catalogLoading && attributeRejectionOptions.length === 0)
                    }
                    className={`h-8 px-2 border rounded text-xs bg-white min-w-[160px] focus:outline-none focus:ring-1 focus:ring-emerald-500 ${refundAttribute ? 'border-emerald-500 text-slate-800 cursor-pointer' : 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'}`}
                  >
                    <option value="">Rejection option</option>
                    {attributeRejectionOptions.map((row) => (
                      <option key={catalogReasonOptionValue(row)} value={catalogReasonOptionValue(row)}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                  {catalogError ? (
                    <span className="text-[11px] text-red-600">{catalogError}</span>
                  ) : null}
                </div>

                {showRefundType && (
                  <div ref={refundTypeRef} className="mb-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Refund type</label>
                    {blockCancellation && !blockAllRefunds ? (
                      <p className="mb-2 text-[11px] text-slate-600">
                        Order is already cancelled — refund the remaining customer bill (CTC) below.
                        {remainingCtcRefundable > 0 ? (
                          <span className="ml-1 font-semibold text-emerald-700">
                            Remaining: {formatInrWithGap(remainingCtcRefundable)}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    <div className="flex gap-2 flex-wrap">
                      {!blockCancellation ? (
                        <>
                      <label
                        className={`flex items-center gap-1.5 border px-2 py-1.5 rounded bg-white min-w-[140px] text-[11px] ${
                          blockCancellation
                            ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
                            : `cursor-pointer hover:bg-emerald-50 ${refundType === 'cancel_without_refund' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`
                        }`}
                        title={blockCancellation ? 'Order is already cancelled' : undefined}
                      >
                        <input type="radio" name="refundType" value="cancel_without_refund" checked={refundType === 'cancel_without_refund'} disabled={blockCancellation} onChange={(e) => handleRefundTypeChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer disabled:cursor-not-allowed" />
                        Cancel without refund
                      </label>
                      <label
                        className={`flex items-center gap-1.5 border px-2 py-1.5 rounded bg-white min-w-[140px] text-[11px] ${
                          blockRefundWithCancellation || blockAllRefunds
                            ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
                            : `cursor-pointer hover:bg-emerald-50 ${refundType === 'refund_with_cancellation' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`
                        }`}
                        title={
                          blockAllRefunds
                            ? 'Order is already fully refunded'
                            : blockRefundWithCancellation
                              ? 'Order is already cancelled on the progress timeline'
                              : undefined
                        }
                      >
                        <input
                          type="radio"
                          name="refundType"
                          value="refund_with_cancellation"
                          checked={refundType === 'refund_with_cancellation'}
                          disabled={blockRefundWithCancellation || blockAllRefunds}
                          onChange={(e) => handleRefundTypeChange(e.target.value)}
                          className="w-3 h-3 text-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                        />
                        Refund with cancellation
                      </label>
                        </>
                      ) : null}
                      {blockCancellation ? (
                        <label
                          className={`flex items-center gap-1.5 border px-2 py-1.5 rounded bg-white min-w-[140px] text-[11px] ${
                            blockAllRefunds
                              ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
                              : `cursor-pointer hover:bg-emerald-50 ${refundType === 'refund_full_ctc' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`
                          }`}
                          title={blockAllRefunds ? 'Order is already fully refunded' : undefined}
                        >
                          <input
                            type="radio"
                            name="refundType"
                            value="refund_full_ctc"
                            checked={refundType === 'refund_full_ctc'}
                            disabled={blockAllRefunds}
                            onChange={(e) => handleRefundTypeChange(e.target.value)}
                            className="w-3 h-3 text-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                          />
                          Full CTC refund
                        </label>
                      ) : null}
                      <label
                        className={`flex items-center gap-1.5 border px-2 py-1.5 rounded bg-white min-w-[140px] text-[11px] ${
                          blockAllRefunds
                            ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
                            : `cursor-pointer hover:bg-emerald-50 ${refundType === 'refund_without_cancellation' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`
                        }`}
                        title={blockAllRefunds ? 'Order is already fully refunded' : undefined}
                      >
                        <input type="radio" name="refundType" value="refund_without_cancellation" checked={refundType === 'refund_without_cancellation'} disabled={blockAllRefunds} onChange={(e) => handleRefundTypeChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer disabled:cursor-not-allowed" />
                        {blockCancellation ? 'Partial CTC refund' : 'Refund without cancellation'}
                      </label>
                    </div>

                    {refundType === 'refund_without_cancellation' && (
                      <div ref={refundItemsRef} className="mt-3 p-3 border border-slate-200 rounded-md bg-white">
                        <h5 className="text-xs font-medium text-slate-700 mb-2">
                          {blockCancellation ? 'Partial CTC refund — select items' : 'Refund debit'}
                        </h5>
                        <table className="w-full border-collapse text-[11px]">
                          <thead>
                            <tr>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Name</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Cust.</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Remark</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Qty</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Original</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Already</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Remaining</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Refund %</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Refund ₹</th>
                            </tr>
                          </thead>
                          <tbody>
                            {refundItems.filter(item => !isDeliveryFeeRow(item)).map((item) => {
                              const bal = getItemBalances(item);
                              const disabled = bal.fullyRefunded;
                              const refundAmt = calculatePercentageRefundAmount(item);
                              return (
                              <tr
                                key={item.id}
                                className={
                                  disabled
                                    ? 'bg-slate-100/80 opacity-70'
                                    : item.refundPercentage > 0
                                      ? 'bg-green-50/50'
                                      : ''
                                }
                              >
                                <td className="px-1.5 py-1 border border-slate-200 text-slate-600">
                                  ({item.id}) {item.name}
                                  {disabled ? (
                                    <span className="ml-1 inline-flex rounded bg-slate-200 px-1 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
                                      Fully refunded
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-left align-top text-slate-600 min-w-[120px]">
                                  <CustomisationCell
                                    detail={item.customisationDetail}
                                    fallback={item.customisation}
                                    compact
                                  />
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200">
                                  <input
                                    type="text"
                                    value={item.remark}
                                    disabled={disabled}
                                    onChange={(e) => handleRemarkChange(item.id, e.target.value)}
                                    placeholder="Remark"
                                    className="w-full h-6 px-1.5 border border-slate-200 rounded text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                                  />
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center">
                                  <select
                                    value={item.selectedQuantity || 1}
                                    disabled={disabled}
                                    onChange={(e) => handleRefundQuantityChange(item.id, parseInt(e.target.value, 10))}
                                    className="w-full h-6 px-1 border border-slate-200 rounded text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50"
                                  >
                                    {generateQuantityOptionsFrom1(item.quantity).map((qty) => <option key={qty} value={qty}>{qty}</option>)}
                                  </select>
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center text-slate-700 orders-num">
                                  ₹{bal.originalTotal.toFixed(2)}
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center text-slate-600 orders-num">
                                  {bal.alreadyRefunded > 0
                                    ? `${bal.alreadyRefundedPct.toFixed(0)}% · ₹${bal.alreadyRefunded.toFixed(2)}`
                                    : '—'}
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center font-medium text-slate-800 orders-num">
                                  ₹{bal.remainingRefundable.toFixed(2)}
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center">
                                  <select
                                    value={disabled ? 0 : item.refundPercentage}
                                    disabled={disabled}
                                    onChange={(e) => handlePercentageChange(item.id, parseInt(e.target.value, 10))}
                                    className="w-full h-6 px-1 border border-slate-200 rounded text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50"
                                  >
                                    {generatePercentageOptions().map((pct) => <option key={pct} value={pct}>{pct}%</option>)}
                                  </select>
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center">
                                  <OrderNum className={!disabled && item.refundPercentage > 0 ? 'font-semibold text-green-600' : 'text-slate-400'}>
                                    {!disabled && item.refundPercentage > 0 ? `₹${refundAmt.toFixed(2)}` : '0'}
                                  </OrderNum>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div className="mt-2 flex flex-col items-end gap-1">
                          <div className={`px-3 py-1.5 rounded border text-xs ${calculateTotalPercentageRefundAmount() > 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                            <span className="font-medium text-slate-700">Items selected: </span>
                            <OrderNum className={calculateTotalPercentageRefundAmount() > 0 ? 'font-bold text-green-600' : 'text-slate-400'}>
                              ₹{calculateTotalPercentageRefundAmount().toFixed(2)}
                            </OrderNum>
                          </div>
                          {calculateCustomerPayableRefund() > 0 ? (
                            <div className="px-3 py-1.5 rounded border border-emerald-300 bg-emerald-50 text-xs">
                              <span className="font-medium text-slate-700">Customer refund: </span>
                              <OrderNum className="font-bold text-emerald-700">
                                ₹{calculateCustomerPayableRefund().toFixed(2)}
                              </OrderNum>
                              <OrderMixedText className="ml-1 text-[10px] text-slate-500">
                                (from remaining refundable balance)
                              </OrderMixedText>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {showFault && refundType !== 'cancel_without_refund' && (
                  <div ref={faultRef} className="mb-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fault</label>
                    <div className="flex gap-2 flex-wrap">
                      {['merchant_fault', '3pl_fault', 'customer_fault', 'exceptional'].map((f) => (
                        <label key={f} className={`flex items-center gap-1.5 border px-2 py-1.5 rounded cursor-pointer bg-white text-[11px] hover:bg-emerald-50 ${fault === f ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                          <input type="radio" name="fault" value={f} checked={fault === f} onChange={(e) => handleFaultChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer" />
                          {f === 'merchant_fault' && 'Merchant'}
                          {f === '3pl_fault' && '3PL'}
                          {f === 'customer_fault' && 'Customer'}
                          {f === 'exceptional' && 'Exceptional'}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {showMerchantDebit && refundType !== 'cancel_without_refund' && (
                  <div ref={merchantDebitRef} className="mb-4">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Merchant debit</label>
                    <div className="flex gap-2 flex-wrap">
                      {['full_debit', 'partial_debit', 'no_debit'].map((d) => (
                        <label key={d} className={`flex items-center gap-1.5 border px-2 py-1.5 rounded cursor-pointer bg-white text-[11px] hover:bg-emerald-50 ${merchantDebit === d ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                          <input type="radio" name="merchantDebit" value={d} checked={merchantDebit === d} onChange={(e) => handleMerchantDebitChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer" />
                          {d === 'full_debit' && 'Full'}
                          {d === 'partial_debit' && 'Partial'}
                          {d === 'no_debit' && 'No debit'}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                </div>
                {showRefundType &&
                (refundType === 'refund_with_cancellation' || refundType === 'refund_full_ctc') ? (
                  <div className="w-full lg:w-[300px] shrink-0 lg:sticky lg:top-20">
                    <RefundCustomerPreviewPanel
                      refundType={refundType}
                      ctcTotal={
                        refundType === 'refund_full_ctc'
                          ? remainingCtcRefundable
                          : selectedCustomerCtcTotal
                      }
                      refundPercent={customerRefundPercent}
                      refundAmount={customerRefundAmount}
                      itemRefundTotal={calculateTotalPercentageRefundAmount()}
                      onPercentChange={handleCustomerRefundPercentChange}
                      onAmountChange={handleCustomerRefundAmountChange}
                      selectedItemCount={selectedRefundItemCount}
                      totalItemCount={refundItems.length}
                    />
                  </div>
                ) : null}
              </div>
            )}

            {(() => {
              const cancels =
                refundType === 'cancel_without_refund' || refundType === 'refund_with_cancellation';
              const refunds =
                refundType === 'refund_with_cancellation' ||
                refundType === 'refund_without_cancellation' ||
                refundType === 'refund_full_ctc';
              const blockedReason =
                cancels && blockCancellation
                  ? 'This order is already cancelled — it cannot be cancelled again.'
                  : refunds && blockAllRefunds
                    ? 'This order is already fully refunded — no further refund is allowed.'
                    : null;
              return (
                <>
                  {blockedReason && (
                    <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                      <i className="bi bi-exclamation-triangle-fill mt-0.5" />
                      <span>{blockedReason}</span>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200">
                    <button type="button" onClick={handleModalClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 border-none rounded font-medium text-xs flex items-center gap-1.5 cursor-pointer">
                      <X className="w-4 h-4" /> Close
                    </button>
                    {canCreateRefund && showSubmit && (
                      <button
                        type="button"
                        ref={submitButtonRef}
                        onClick={handleSubmit}
                        disabled={Boolean(blockedReason)}
                        title={blockedReason ?? undefined}
                        className={`px-4 py-2 text-white border-none rounded font-semibold text-xs flex items-center gap-1.5 ${
                          blockedReason
                            ? 'bg-slate-300 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-600 cursor-pointer'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" /> Submit Refund
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </OrderPageOverlay>
    </>
  );
}

