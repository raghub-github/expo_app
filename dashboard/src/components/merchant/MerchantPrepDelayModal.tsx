'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PREP_DELAY_OPTIONS } from '@/lib/order-prep-time';

export function MerchantPrepDelayModal({
  open,
  loading,
  onClose,
  onSelectMinutes,
}: {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSelectMinutes: (minutes: number) => void;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prep-delay-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 id="prep-delay-title" className="text-base font-semibold text-gray-900">
            Mark delay in this order
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="px-4 py-5">
          <div className="mb-5 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold text-red-600">Hurry!</p>
              <p className="mt-0.5 text-sm text-gray-600">Customer is waiting</p>
            </div>
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-amber-50 text-2xl"
              aria-hidden
            >
              🍱
            </div>
          </div>
          <p className="text-sm font-medium text-gray-900">How much more time do you need?</p>
          <p className="mt-1 text-xs text-gray-500">The same will be shown to the customer.</p>

          <div className="mt-5 flex gap-3">
            {PREP_DELAY_OPTIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                disabled={loading}
                onClick={() => onSelectMinutes(mins)}
                className="flex-1 rounded-xl border-2 border-blue-500 bg-white py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50"
              >
                {mins} mins
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
