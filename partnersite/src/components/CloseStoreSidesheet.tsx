'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

export type CloseStoreClosureType = 'temporary' | 'today' | 'manual_hold';

export type CloseStoreSidesheetProps = {
  open: boolean;
  title?: string;
  subtitle?: string;
  /** Tailwind z-index classes for the sheet root (default sits above partner chrome). */
  zClassName?: string;
  toggleClosureType: CloseStoreClosureType | null;
  setToggleClosureType: (v: CloseStoreClosureType) => void;
  closureDate: string;
  setClosureDate: (v: string) => void;
  closureTime: string;
  setClosureTime: (v: string) => void;
  closeReason: string;
  setCloseReason: (v: string) => void;
  closeReasonOther: string;
  setCloseReasonOther: (v: string) => void;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Right sidesheet for store close options — avoids a centered modal covering the partner header.
 */
export function CloseStoreSidesheet({
  open,
  title = 'How would you like to close your store?',
  subtitle,
  zClassName = 'z-[1100]',
  toggleClosureType,
  setToggleClosureType,
  closureDate,
  setClosureDate,
  closureTime,
  setClosureTime,
  closeReason,
  setCloseReason,
  closeReasonOther,
  setCloseReasonOther,
  loading = false,
  onCancel,
  onConfirm,
}: CloseStoreSidesheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  const confirmDisabled =
    !toggleClosureType ||
    !closeReason?.trim() ||
    (closeReason === 'Other' && !closeReasonOther?.trim()) ||
    (toggleClosureType === 'temporary' && (!closureDate || !closureTime)) ||
    loading;

  const minDate = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${(n.getMonth() + 1).toString().padStart(2, '0')}-${n.getDate().toString().padStart(2, '0')}`;
  })();

  return createPortal(
    <div className={`fixed inset-0 ${zClassName} flex justify-end`} role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={() => !loading && onCancel()}
      />
      <aside
        className="relative flex h-dvh w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-store-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="close-store-sheet-title" className="text-lg font-bold text-gray-900 leading-snug">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => !loading && onCancel()}
            disabled={loading}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${
                toggleClosureType === 'temporary'
                  ? 'bg-orange-50 border-orange-400'
                  : 'border-gray-200 hover:border-orange-200'
              }`}
            >
              <input
                type="radio"
                name="closureTypeSheet"
                checked={toggleClosureType === 'temporary'}
                onChange={() => setToggleClosureType('temporary')}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Temporary Closed</p>
                <p className="text-xs text-gray-600">
                  Close until a specific date and time. Reopens automatically then, or turn ON manually anytime.
                </p>
              </div>
            </label>
            {toggleClosureType === 'temporary' && (
              <div className="ml-7 space-y-3 p-3 rounded-lg bg-orange-50/50 border border-orange-200">
                <p className="text-xs font-semibold text-gray-700">Reopen on (date and time):</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 block mb-1">Date</label>
                    <input
                      type="date"
                      value={closureDate}
                      onChange={(e) => setClosureDate(e.target.value)}
                      min={minDate}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 block mb-1">Time</label>
                    <input
                      type="time"
                      value={closureTime}
                      onChange={(e) => setClosureTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-600">
                  Store stays closed until this date & time, or until you turn it ON manually.
                </p>
              </div>
            )}
            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${
                toggleClosureType === 'today' ? 'bg-red-50 border-red-400' : 'border-gray-200 hover:border-red-200'
              }`}
            >
              <input
                type="radio"
                name="closureTypeSheet"
                checked={toggleClosureType === 'today'}
                onChange={() => setToggleClosureType('today')}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Close for Today</p>
                <p className="text-xs text-gray-600">
                  Closed until end of today (India time). Schedule can resume tomorrow.
                </p>
              </div>
            </label>
            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${
                toggleClosureType === 'manual_hold'
                  ? 'bg-amber-50 border-amber-400'
                  : 'border-gray-200 hover:border-amber-200'
              }`}
            >
              <input
                type="radio"
                name="closureTypeSheet"
                checked={toggleClosureType === 'manual_hold'}
                onChange={() => setToggleClosureType('manual_hold')}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Until I manually turn it ON</p>
                <p className="text-xs text-gray-600">
                  Store stays OFF even during operating hours until you turn it ON
                </p>
              </div>
            </label>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-xs font-semibold text-gray-700 block">
              Reason for closing <span className="text-red-500">*</span>
            </label>
            <select
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
            >
              <option value="">Select reason</option>
              <option value="Staff shortage">Staff shortage</option>
              <option value="Inventory restock">Inventory restock</option>
              <option value="Device issue / electricity">Device issue / electricity</option>
              <option value="Run out of Gas">Run out of Gas</option>
              <option value="Payment issue">Payment issue</option>
              <option value="Rush of offline orders">Rush of offline orders</option>
              <option value="Equipment issue">Equipment issue</option>
              <option value="Holiday / Off">Holiday / Off</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Personal / Emergency">Personal / Emergency</option>
              <option value="Kitchen / Prep area issue">Kitchen / Prep area issue</option>
              <option value="Supplier delay">Supplier delay</option>
              <option value="Other">Other</option>
            </select>
            {closeReason === 'Other' && (
              <input
                type="text"
                value={closeReasonOther}
                onChange={(e) => setCloseReasonOther(e.target.value)}
                placeholder="Enter reason"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-100 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Confirming...
              </>
            ) : (
              'Confirm'
            )}
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}
