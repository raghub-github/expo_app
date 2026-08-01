'use client';

import { createPortal } from 'react-dom';
import { AlertTriangle, Bike, Phone, X } from 'lucide-react';
import { RiderAssignmentHorizontalTimeline } from '@/components/orders/RiderAssignmentHorizontalTimeline';
import { isInactiveRiderLogEntry } from '@/lib/ridersLogCache';

/** Partner / dashboard shell top bar height (matches fixed h-14 headers). */
export const ORDER_SHELL_HEADER_OFFSET = '3.5rem';

export type RiderLogEntry = {
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  selfie_url: string | null;
  assignment_status: string;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  unassigned_at?: string | null;
  is_active?: boolean | null;
};

export type OrderRidersHistorySidesheetProps = {
  open: boolean;
  orderLabel?: string | null;
  riders: RiderLogEntry[];
  loading?: boolean;
  onClose: () => void;
  onRiderPhotoClick?: (url: string) => void;
  /** CSS top offset so the sheet sits below the fixed app header (default: below h-14 bar). */
  topOffset?: string;
};

export function OrderRidersHistorySidesheet({
  open,
  orderLabel,
  riders,
  loading = false,
  onClose,
  onRiderPhotoClick,
  topOffset = ORDER_SHELL_HEADER_OFFSET,
}: OrderRidersHistorySidesheetProps) {
  if (!open || typeof document === 'undefined') return null;

  const showLoading = loading && riders.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex justify-end"
      role="presentation"
      style={{ ['--order-sheet-top' as string]: topOffset }}
    >
      <button
        type="button"
        className="absolute left-0 right-0 bottom-0 bg-black/40 backdrop-blur-[2px]"
        style={{ top: 'var(--order-sheet-top)' }}
        aria-label="Close rider history"
        onClick={onClose}
      />
      <aside
        className="relative flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl"
        style={{
          marginTop: 'var(--order-sheet-top)',
          height: 'calc(100dvh - var(--order-sheet-top))',
          maxHeight: 'calc(100dvh - var(--order-sheet-top))',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="riders-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-4">
          <div className="min-w-0 pr-2">
            <h3 id="riders-history-title" className="text-lg font-extrabold text-gray-900">
              Old rider&apos;s log
              {orderLabel ? (
                <span className="ml-1.5 text-sm font-medium text-gray-500">({orderLabel})</span>
              ) : null}
            </h3>
            <p className="mt-1 text-xs font-medium leading-snug text-gray-600">
              Previously assigned partners for this order (current assignee excluded)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 hide-scrollbar">
          {showLoading ? (
            <p className="text-sm text-gray-500">Loading rider history…</p>
          ) : riders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Bike size={36} className="text-gray-300" aria-hidden />
              <p className="text-sm font-semibold text-gray-500">
                No previous rider assignments yet
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {riders.map((r, idx) => {
                const inactive = isInactiveRiderLogEntry(r);
                const name = (r.rider_name ?? '').trim() || `Rider #${r.rider_id}`;
                return (
                  <li
                    key={`${r.rider_id}-${r.assigned_at ?? r.cancelled_at ?? idx}`}
                    className={`rounded-xl border p-3 ${
                      inactive
                        ? 'border-red-200 bg-gray-50/80'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {r.selfie_url ? (
                        <button
                          type="button"
                          onClick={() => onRiderPhotoClick?.(r.selfie_url!)}
                          className="h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-purple-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                        >
                          <img
                            src={r.selfie_url}
                            alt={name}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100">
                          <Bike size={20} className="text-purple-600" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 text-center">
                        <p className="truncate text-sm font-bold text-gray-900">{name}</p>
                      </div>
                      {r.rider_mobile ? (
                        <a
                          href={`tel:${r.rider_mobile}`}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700"
                          aria-label={`Call ${name}`}
                        >
                          <Phone size={16} aria-hidden />
                        </a>
                      ) : (
                        <span className="h-10 w-10 shrink-0" aria-hidden />
                      )}
                    </div>

                    <RiderAssignmentHorizontalTimeline rider={r} />

                    {inactive ? (
                      <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-center">
                        <AlertTriangle size={14} className="shrink-0 text-red-800" aria-hidden />
                        <p className="text-xs font-semibold leading-snug text-red-800">
                          Do not hand over this order to this rider.
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
