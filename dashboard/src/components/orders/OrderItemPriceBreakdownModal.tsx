'use client';

import { X } from 'lucide-react';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import {
  formatOrderRs,
  orderItemCustomizationRows,
  orderItemVariantLabel,
} from '@/lib/merchant-order-item-display';

type Props = {
  item: NormalizedOrderLineItem | null;
  onClose: () => void;
};

export function OrderItemPriceBreakdownModal({ item, onClose }: Props) {
  if (!item) return null;

  const qty = Math.max(1, item.quantity || 1);
  const lineTotal = Number(item.total) || 0;
  const variantLabel = orderItemVariantLabel(item);
  const structured = orderItemCustomizationRows(item);
  const baseAmount =
    item.baseAmount != null && item.baseAmount > 0
      ? item.baseAmount
      : Math.max(0, lineTotal - (item.customizationsTotal ?? 0));
  const custTotal =
    item.customizationsTotal ??
    structured.reduce((s, l) => s + (l.amount || 0), 0);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-breakdown-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 id="item-breakdown-title" className="text-base font-bold text-gray-900">
            Item price breakdown
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[min(70vh,420px)] overflow-y-auto px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">
            {qty} × {item.name}
          </p>
          {variantLabel ? (
            <span className="mb-4 mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-emerald-800">
              {variantLabel}
            </span>
          ) : (
            <div className="mb-4" />
          )}

          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-600">Base item price</span>
              <span className="font-semibold tabular-nums text-gray-900">
                {formatOrderRs(baseAmount, 2)}
              </span>
            </div>

            {structured.length > 0 ? (
              <div className="mt-3 border-l-2 border-teal-300 pl-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-teal-700">
                  Customizations
                </p>
                {structured.map((row, i) => (
                  <div key={i} className="mb-1.5 flex justify-between gap-3">
                    <span className="text-gray-600">{row.label}</span>
                    <span className="shrink-0 tabular-nums text-gray-900">
                      {row.amount != null ? formatOrderRs(row.amount, 2) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {custTotal > 0 ? (
              <div className="flex justify-between gap-3 pt-1 font-semibold text-teal-700">
                <span>Customizations total</span>
                <span className="tabular-nums">{formatOrderRs(custTotal, 2)}</span>
              </div>
            ) : null}

            <div className="my-2 border-t border-gray-200" />
            <div className="flex justify-between gap-3">
              <span className="font-bold text-gray-900">
                Line total ({qty} item{qty > 1 ? 's' : ''})
              </span>
              <span className="text-lg font-bold tabular-nums text-emerald-600">
                {formatOrderRs(lineTotal, 2)}
              </span>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-snug text-gray-500">
            Merchant-facing amounts for this order line.
          </p>
        </div>
      </div>
    </div>
  );
}
