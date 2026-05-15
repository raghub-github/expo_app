'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';

export type OrderLineItem = NonNullable<OrdersFoodRow['items']>[number];

function VegMark({ vegNonveg }: { vegNonveg?: string | null }) {
  const t = (vegNonveg ?? '').toLowerCase();
  const isVeg = t.includes('veg') && !t.includes('non');
  const isNonVeg = t.includes('non') || t === 'non_veg';
  if (!isVeg && !isNonVeg) {
    return <span className="inline-block w-4 h-4 rounded border border-gray-300 shrink-0" aria-hidden />;
  }
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        isVeg ? 'border-green-600' : 'border-red-600'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
    </span>
  );
}

function formatMoney(n: number) {
  return `₹${n.toFixed(2)}`;
}

export type OrderItemDetailModalProps = {
  open: boolean;
  onClose: () => void;
  item: OrderLineItem | null;
};

export function OrderItemDetailModal({ open, onClose, item }: OrderItemDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !item || typeof document === 'undefined') return null;

  const qty = item.quantity || 1;
  const unitPrice = Number(item.price || 0);
  const amount = Number(item.total || unitPrice * qty);

  return createPortal(
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-item-modal-title"
        className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-2 min-w-0">
            <VegMark vegNonveg={item.vegNonveg} />
            <h2 id="order-item-modal-title" className="text-lg font-bold text-gray-900 leading-snug">
              {item.name || 'Item'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              className="w-full max-h-48 object-cover rounded-lg border border-gray-100"
            />
          ) : null}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Quantity</p>
              <p className="mt-0.5 font-semibold text-gray-900">{qty}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Line total</p>
              <p className="mt-0.5 font-bold text-gray-900 tabular-nums">{formatMoney(amount)}</p>
            </div>
            {unitPrice > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Unit price</p>
                <p className="mt-0.5 font-medium text-gray-800 tabular-nums">{formatMoney(unitPrice)}</p>
              </div>
            )}
            {item.variantName ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Variant</p>
                <p className="mt-0.5 font-medium text-gray-800">{item.variantName}</p>
              </div>
            ) : null}
            {item.categoryName ? (
              <div className="col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Category</p>
                <p className="mt-0.5 font-medium text-gray-800">{item.categoryName}</p>
              </div>
            ) : null}
          </div>

          {item.customizations && item.customizations.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Customizations
              </p>
              <ul className="text-sm text-gray-700 space-y-1">
                {item.customizations.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-gray-400">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.description ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700 leading-relaxed">{item.description}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
