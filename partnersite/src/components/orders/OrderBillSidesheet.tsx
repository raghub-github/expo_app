'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import type { OrderPricingBreakdown, NormalizedOrderLineItem } from '@/lib/orderLineItems';

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

function formatMoney(n: number) {
  return `₹${n.toFixed(2)}`;
}

function ItemRows({ items }: { items: NormalizedOrderLineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 py-2">No line items</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, idx) => {
        const qty = item.quantity || 1;
        const amount = Number(item.total || (item.price || 0) * qty);
        return (
          <li key={idx} className="flex items-start justify-between gap-3 text-sm">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <VegMark vegNonveg={item.vegNonveg} />
              <span className="text-gray-900">
                <span className="font-medium">{qty} × </span>
                {item.name}
                {item.customizations?.length ? (
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {item.customizations.join(', ')}
                  </span>
                ) : null}
              </span>
            </div>
            <span className="font-semibold text-gray-900 tabular-nums shrink-0">
              {formatMoney(amount)}
            </span>
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
  lineSum,
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

  const items = order.items ?? [];
  const subtotal = pricing.subtotal > 0 ? pricing.subtotal : lineSum;
  const title = allItemsOnly ? 'All items' : 'Bill details';

  return createPortal(
    <div className="fixed inset-0 z-[2400] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
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

        <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar px-5 py-4 space-y-5">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Items ({items.length})
            </p>
            <ItemRows items={items} />
          </section>

          {!allItemsOnly && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Bill summary
              </p>
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-2.5 text-sm">
                <div className="flex justify-between text-gray-700">
                  <span>Item total</span>
                  <span className="font-medium tabular-nums">{formatMoney(subtotal)}</span>
                </div>
                {pricing.packaging > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>Packaging</span>
                    <span className="font-medium tabular-nums">{formatMoney(pricing.packaging)}</span>
                  </div>
                )}
                {pricing.taxes > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>Taxes</span>
                    <span className="font-medium tabular-nums">{formatMoney(pricing.taxes)}</span>
                  </div>
                )}
                {pricing.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span className="font-medium tabular-nums">−{formatMoney(pricing.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-2.5 text-base font-bold text-gray-900">
                  <span>Total bill</span>
                  <span className="tabular-nums">{formatMoney(pricing.total)}</span>
                </div>
                <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-100">
                  PAID
                </span>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
