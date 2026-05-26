'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RejectPickItem } from '@/lib/rejectOrderPickItems';

export type MenuOosMode = 'HOURS' | 'NEXT_OPEN' | 'CUSTOM' | 'MANUAL';

export type MenuOosPayload =
  | { mode: 'HOURS'; hours: number }
  | { mode: 'NEXT_OPEN' }
  | { mode: 'CUSTOM'; until: string }
  | { mode: 'MANUAL' };

export function MenuItemOutOfStockSidesheet({
  open,
  items,
  storeId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  items: RejectPickItem[];
  storeId: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [oosChoice, setOosChoice] = useState<MenuOosMode>('MANUAL');
  const [oosHours, setOosHours] = useState(5);
  const [oosDate, setOosDate] = useState('');
  const [oosTime, setOosTime] = useState('12:00');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOosChoice('MANUAL');
    setOosHours(5);
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    setOosDate(`${y}-${m}-${d}`);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    setOosTime(
      `${in1h.getHours().toString().padStart(2, '0')}:${in1h.getMinutes().toString().padStart(2, '0')}`
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open || items.length === 0 || typeof document === 'undefined') return null;

  const confirm = async () => {
    if (!storeId || items.length === 0) return;
    setBusy(true);
    try {
      const mode = oosChoice;
      const untilIso =
        oosChoice === 'CUSTOM' ? new Date(`${oosDate}T${oosTime}:00`).toISOString() : undefined;

      for (const item of items) {
        const body = {
          storeId,
          targetType: 'item' as const,
          id: item.menuItemId,
          mode,
          hours: oosChoice === 'HOURS' ? oosHours : undefined,
          until: untilIso,
        };
        const res = await fetch('/api/merchant/menu-out-of-stock', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { error?: string })?.error || `Failed for ${item.name}`);
        }
      }

      toast.success(
        items.length === 1
          ? `${items[0].name} marked out of stock`
          : `${items.length} items marked out of stock`
      );
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark items out of stock');
    } finally {
      setBusy(false);
    }
  };

  const title =
    items.length === 1 ? items[0].name : `${items.length} items selected`;

  return createPortal(
    <div className="fixed inset-0 z-[2450] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={() => !busy && onClose()}
      />
      <aside
        className="relative flex h-dvh w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="min-w-0 pr-3">
            <h2 className="text-lg font-bold text-gray-900">Mark out of stock</h2>
            <p className="text-sm text-gray-500 truncate mt-0.5">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {items.length > 1 ? (
            <ul className="mb-4 rounded-xl border border-gray-200 divide-y divide-gray-100">
              {items.map((it) => (
                <li key={it.menuItemId} className="px-4 py-2.5 text-sm text-gray-800">
                  {it.quantity > 1 ? `${it.quantity} × ` : ''}
                  {it.name}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-sm text-gray-600 mb-3">
            Customers won&apos;t be able to order these items until you mark them back in stock.
          </p>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-white hover:bg-gray-50">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="rejectOos"
                    checked={oosChoice === 'HOURS'}
                    onChange={() => setOosChoice('HOURS')}
                    disabled={busy}
                  />
                  <span className="text-sm font-semibold text-gray-900">For specific time</span>
                </span>
                <span className={`flex items-center gap-2 ${oosChoice !== 'HOURS' ? 'opacity-50' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setOosHours((h) => Math.max(1, h - 1))}
                    className="h-7 w-7 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
                    disabled={busy || oosChoice !== 'HOURS'}
                  >
                    −
                  </button>
                  <span className="text-sm font-bold text-gray-900">{oosHours} hour</span>
                  <button
                    type="button"
                    onClick={() => setOosHours((h) => Math.min(24 * 14, h + 1))}
                    className="h-7 w-7 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
                    disabled={busy || oosChoice !== 'HOURS'}
                  >
                    +
                  </button>
                </span>
              </label>
            </div>
            <div className="h-px bg-gray-200" />
            <label className="block px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer">
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="rejectOos"
                  checked={oosChoice === 'NEXT_OPEN'}
                  onChange={() => setOosChoice('NEXT_OPEN')}
                  disabled={busy}
                />
                <span className="text-sm font-semibold text-gray-900">Next business day · Opening time</span>
              </span>
            </label>
            <div className="h-px bg-gray-200" />
            <label className="block px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer">
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="rejectOos"
                  checked={oosChoice === 'CUSTOM'}
                  onChange={() => setOosChoice('CUSTOM')}
                  disabled={busy}
                />
                <span className="text-sm font-semibold text-gray-900">Custom date &amp; time</span>
              </span>
            </label>
            <div className={`px-4 pb-3 bg-white ${oosChoice !== 'CUSTOM' ? 'opacity-60' : ''}`}>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={oosDate}
                  onChange={(e) => {
                    setOosChoice('CUSTOM');
                    setOosDate(e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  disabled={busy}
                />
                <input
                  type="time"
                  value={oosTime}
                  onChange={(e) => {
                    setOosChoice('CUSTOM');
                    setOosTime(e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="h-px bg-gray-200" />
            <label className="block px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer">
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="rejectOos"
                  checked={oosChoice === 'MANUAL'}
                  onChange={() => setOosChoice('MANUAL')}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-gray-900 block">I will turn it on manually</span>
                  <span className="text-xs text-gray-500 block mt-0.5">
                    Item won&apos;t be visible to customers until you mark it back in stock
                  </span>
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 px-5 py-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
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
