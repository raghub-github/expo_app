'use client';

import { createPortal } from 'react-dom';
import { Bike, X } from 'lucide-react';

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

function fmtTime(s: string | null) {
  return s
    ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function resolveAssignedAt(r: RiderLogEntry): string | null {
  return r.assigned_at ?? r.accepted_at ?? null;
}

function resolveCancelledAt(r: RiderLogEntry): string | null {
  return r.cancelled_at ?? r.unassigned_at ?? r.rejected_at ?? null;
}

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
          <h3 id="riders-history-title" className="pr-2 font-semibold text-gray-900">
            Past riders
            {orderLabel ? (
              <span className="ml-1.5 font-medium text-gray-500">({orderLabel})</span>
            ) : null}
          </h3>
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
          {loading ? (
            <p className="text-sm text-gray-500">Loading rider history…</p>
          ) : riders.length === 0 ? (
            <p className="text-sm text-gray-500">No riders have been assigned to this order yet.</p>
          ) : (
            <ul className="space-y-3">
              {riders.map((r, idx) => (
                <li
                  key={`${r.rider_id}-${idx}`}
                  className="rounded-xl border border-gray-200 bg-gray-50/60 p-3"
                >
                  <div className="flex items-start gap-3">
                    {r.selfie_url ? (
                      <button
                        type="button"
                        onClick={() => onRiderPhotoClick?.(r.selfie_url!)}
                        className="h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-purple-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                      >
                        <img
                          src={r.selfie_url}
                          alt={r.rider_name || 'Rider'}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100">
                        <Bike size={20} className="text-purple-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-gray-900">
                        {r.rider_name || `Rider #${r.rider_id}`}
                      </p>
                      {r.rider_mobile ? (
                        <a
                          href={`tel:${r.rider_mobile}`}
                          className="text-purple-600 hover:underline"
                        >
                          {r.rider_mobile}
                        </a>
                      ) : null}
                      <div className="mt-2.5 space-y-1 text-xs text-gray-600">
                        <p>
                          <span className="font-medium text-gray-700">Assigned at:</span>{' '}
                          {fmtTime(resolveAssignedAt(r))}
                        </p>
                        {resolveCancelledAt(r) ? (
                          <p>
                            <span className="font-medium text-gray-700">Cancelled at:</span>{' '}
                            {fmtTime(resolveCancelledAt(r))}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
