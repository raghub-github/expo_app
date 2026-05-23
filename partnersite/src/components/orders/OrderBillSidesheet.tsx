'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import {
  normalizeOrderItems,
  type OrderPricingBreakdown,
  type NormalizedOrderLineItem,
} from '@/lib/orderLineItems';
import {
  formatOrderRs,
  merchantBillPartsFromItems,
  merchantItemLineParts,
  merchantLineTotalForItem,
  orderItemCustomizationRows,
  orderItemDisplayName,
  orderItemHasBreakdown,
} from '@/lib/merchant-order-item-display';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';

const AMOUNT_COL = 'w-[5.5rem] shrink-0 text-right tabular-nums';

function VegMark({ vegNonveg }: { vegNonveg?: string | null }) {
  const t = (vegNonveg ?? '').toLowerCase();
  const isVeg = t.includes('veg') && !t.includes('non');
  const isNonVeg = t.includes('non') || t === 'non_veg';
  if (!isVeg && !isNonVeg) {
    return <span className="inline-block w-3 h-3 rounded border border-gray-300 shrink-0" aria-hidden />;
  }
  return (
    <span
      className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded border ${
        isVeg ? 'border-green-600' : 'border-red-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
    </span>
  );
}

function AmountCell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`${AMOUNT_COL} ${className}`.trim()}>{children}</span>;
}

function SummaryRow({
  label,
  amount,
  discount,
  bold,
}: {
  label: string;
  amount: number;
  discount?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_5.5rem] gap-x-2 ${discount ? 'text-emerald-700' : 'text-gray-700'} ${bold ? 'text-base font-bold text-gray-900' : ''}`}
    >
      <span>{label}</span>
      <span className={`${AMOUNT_COL} font-medium`}>
        {discount ? `−${formatOrderRs(amount, 2)}` : formatOrderRs(amount, 2)}
      </span>
    </div>
  );
}

function ItemRows({ items }: { items: NormalizedOrderLineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 py-2">No line items</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => {
        const qty = Math.max(1, item.quantity || 1);
        const lineTotal = merchantLineTotalForItem(item);
        const displayName = orderItemDisplayName(item);
        const parts = merchantItemLineParts(item);
        const custRows = orderItemCustomizationRows(item);
        const showValueSplit = orderItemHasBreakdown(item) && parts.hasCustomizations;
        return (
          <li
            key={idx}
            className="border-b border-gray-100 pb-2 text-sm last:border-0 last:pb-0"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-x-2">
              <div className="flex min-w-0 items-start gap-2">
                <VegMark vegNonveg={item.vegNonveg} />
                <span className="min-w-0 font-bold leading-snug text-gray-900">
                  {qty} × {displayName}
                </span>
              </div>
              <AmountCell className="font-bold text-gray-900">
                {formatOrderRs(lineTotal, 2)}
              </AmountCell>

              {showValueSplit ? (
                <>
                  <span className="pl-5 text-[11px] text-gray-600">Item value</span>
                  <AmountCell className="text-[11px] font-medium text-gray-800">
                    {formatOrderRs(parts.base, 2)}
                  </AmountCell>
                  <span className="pl-5 text-[11px] text-gray-600">Customization value</span>
                  <AmountCell className="text-[11px] font-medium text-teal-800">
                    {formatOrderRs(parts.customizations, 2)}
                  </AmountCell>
                </>
              ) : null}

              {custRows.map((row, j) => (
                <React.Fragment key={j}>
                  <span className="min-w-0 pl-5 text-[11px] leading-snug text-gray-600">
                    <span className="border-l border-teal-200 pl-2">↳ {row.label}</span>
                  </span>
                  {row.amount != null ? (
                    <AmountCell className="text-[11px] text-gray-700">
                      {formatOrderRs(row.amount, 2)}
                    </AmountCell>
                  ) : (
                    <span className={AMOUNT_COL} aria-hidden />
                  )}
                </React.Fragment>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export type OrderBillSidesheetProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
  pricing: OrderPricingBreakdown;
  lineSum: number;
  allItemsOnly?: boolean;
};

export function OrderBillSidesheet({
  open,
  onClose,
  order,
  pricing,
  lineSum: _lineSum,
  allItemsOnly = false,
}: OrderBillSidesheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !order || typeof document === 'undefined') return null;

  const items = normalizeOrderItems(order.items);
  const bill = merchantBillPartsFromItems(items, pricing);
  const itemQtyCount = computeOrderItemQuantityCount(order);
  const title = allItemsOnly ? 'All items' : 'Bill details';

  return createPortal(
    <div className="fixed inset-0 z-[2400] flex justify-end" role="presentation">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-hidden
      />
      <aside
        className="relative flex h-dvh w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-bill-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="order-bill-sheet-title" className="text-lg font-bold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar px-5 py-4">
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Items ({itemQtyCount > 0 ? itemQtyCount : items.length})
            </p>
            <ItemRows items={items} />
          </section>

          {!allItemsOnly ? (
            <section className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Bill summary
              </p>
              <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-sm">
                <SummaryRow label="All items subtotal" amount={bill.itemsSubtotal} bold />
                {bill.packaging > 0 ? (
                  <SummaryRow label="Packaging charges" amount={bill.packaging} />
                ) : null}
                {bill.discount > 0 ? (
                  <SummaryRow label="Restaurant discount" amount={bill.discount} discount />
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Restaurant discount — none. Platform (GatiMitra) offers are not deducted from
                    your bill.
                  </p>
                )}
                <div className="space-y-1 border-t border-gray-200 pt-2.5">
                  <SummaryRow label="Total bill" amount={bill.total} bold />
                </div>
                <span className="inline-flex items-center rounded-md border border-teal-100 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                  PAID
                </span>
              </div>
            </section>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <div className="grid grid-cols-[1fr_5.5rem] gap-x-2 items-center">
            <span className="text-base font-bold text-gray-900">Total bill</span>
            <span className={`${AMOUNT_COL} text-lg font-bold text-gray-900`}>
              {formatOrderRs(bill.total, 2)}
            </span>
          </div>
          {allItemsOnly ? (
            <p className="mt-1 text-[11px] text-gray-500">
              {bill.packaging > 0 ? 'Includes packaging · ' : ''}
              {bill.discount > 0 ? 'After restaurant discount' : 'Amount paid by customer'}
            </p>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body
  );
}
