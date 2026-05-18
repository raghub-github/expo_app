'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { FormattedOrderId } from '@/components/FormattedOrderId';
import {
  MERCHANT_CANCELLATION_REASONS,
  type MerchantCancellationReason,
} from '@/lib/merchantCancellationReasons';

export type RejectOrderSidesheetProps = {
  open: boolean;
  order: OrdersFoodRow | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: MerchantCancellationReason) => void | Promise<void>;
};

export function RejectOrderSidesheet({
  open,
  order,
  loading = false,
  onClose,
  onConfirm,
}: RejectOrderSidesheetProps) {
  const [selected, setSelected] = useState<MerchantCancellationReason | null>(null);

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open || !order || typeof document === 'undefined') return null;

  return createPortal(
    <RejectOrderSheetPanel order={order} selected={selected} setSelected={setSelected} loading={loading} onClose={onClose} onConfirm={onConfirm} />,
    document.body
  );
}

function RejectOrderSheetPanel({
  order,
  selected,
  setSelected,
  loading,
  onClose,
  onConfirm,
}: {
  order: OrdersFoodRow;
  selected: MerchantCancellationReason | null;
  setSelected: (r: MerchantCancellationReason) => void;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: MerchantCancellationReason) => void | Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[2400] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={() => !loading && onClose()}
      />
      <aside
        className="relative flex h-dvh w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-order-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="reject-order-sheet-title" className="text-lg font-bold text-gray-900">
              Cancel order
            </h2>
            <div className="mt-0.5 text-sm text-gray-500">
              {order.formatted_order_id ? (
                <FormattedOrderId
                  formattedOrderId={order.formatted_order_id}
                  fallbackOrderId={order.order_id}
                  size="sm"
                />
              ) : (
                <>#{order.order_id}</>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <RejectOrderSheetBody selected={selected} setSelected={setSelected} loading={loading} />

        <div className="shrink-0 border-t border-gray-200 px-5 py-4 flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={loading || !selected}
            onClick={() => selected && void onConfirm(selected)}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Cancelling…' : 'Confirm reject'}
          </button>
        </div>
      </aside>
    </div>
  );
}

function RejectOrderSheetBody({
  selected,
  setSelected,
  loading,
}: {
  selected: MerchantCancellationReason | null;
  setSelected: (r: MerchantCancellationReason) => void;
  loading: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar px-5 py-4">
      <p className="text-sm text-gray-600 mb-4">Select a cancellation reason:</p>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
        {MERCHANT_CANCELLATION_REASONS.map((reason) => {
          const active = selected === reason;
          return (
            <li key={reason}>
              <button
                type="button"
                disabled={loading}
                onClick={() => setSelected(reason)}
                className={`w-full text-left px-4 py-3.5 text-sm font-medium transition-colors ${
                  active ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                {reason}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
