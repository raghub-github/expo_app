'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/lib/types/food-orders';

function ordinalLabel(n: number | null | undefined): string | null {
  if (n == null || n < 1) return null;
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

export type OrderCustomerSidesheetProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
};

export function OrderCustomerSidesheet({ open, onClose, order }: OrderCustomerSidesheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !order || typeof document === 'undefined') return null;

  const storeOrdinal = order.customer_store_order_ordinal;
  const storeTotal = order.customer_order_count;
  const platformTotal = order.customer_platform_order_count;
  const storeOrdText = ordinalLabel(storeOrdinal);
  const platformOrdText = ordinalLabel(order.customer_platform_order_ordinal);

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
        aria-labelledby="order-customer-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="order-customer-sheet-title" className="text-lg font-bold text-gray-900">
            Customer details
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

        <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar px-5 py-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <User className="w-10 h-10 text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="text-xl font-bold text-gray-900">{order.customer_name || 'Customer'}</p>
            <p className="mt-1 text-sm text-gray-500">Order from your restaurant</p>

            <div className="mt-6 w-full max-w-xs space-y-3 text-left">
              {storeOrdText != null && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                    At your store
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-900">
                    {storeOrdText} order at this store
                  </p>
                  {storeTotal != null && storeTotal > 0 && (
                    <p className="mt-0.5 text-xs text-gray-600">
                      {storeTotal} total order{storeTotal === 1 ? '' : 's'} with you on GatiMitra
                    </p>
                  )}
                </div>
              )}

              {platformTotal != null && platformTotal > 0 && (
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                    On GatiMitra
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-900">
                    {platformOrdText
                      ? `${platformOrdText} order on GatiMitra`
                      : `${platformTotal} order${platformTotal === 1 ? '' : 's'} on GatiMitra`}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {platformTotal} total order{platformTotal === 1 ? '' : 's'} on the platform
                  </p>
                </div>
              )}

              {order.customer_phone && (
                <p className="text-center text-sm text-gray-700 pt-2">
                  <span className="text-gray-500">Phone: </span>
                  <span className="font-semibold tabular-nums">{order.customer_phone}</span>
                </p>
              )}

              {(order.drop_address_normalized || order.drop_address_raw) && (
                <p className="text-xs text-gray-600 leading-relaxed text-center pt-1">
                  {order.drop_address_normalized || order.drop_address_raw}
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}


