'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import type { RejectPickItem } from '@/lib/rejectOrderPickItems';

type Row = {
  key: string;
  name: string;
  quantity: number;
  menuItemId: number | null;
  pickable: boolean;
};

function buildRows(items: NormalizedOrderLineItem[]): Row[] {
  const rows: Row[] = [];
  const seenIds = new Set<number>();
  let idx = 0;
  for (const it of items) {
    const name = String(it.name ?? 'Item').trim() || 'Item';
    const quantity = Math.max(1, Number(it.quantity) || 1);
    const id = it.menuItemId;
    if (id != null && Number.isFinite(Number(id))) {
      const menuItemId = Number(id);
      if (seenIds.has(menuItemId)) continue;
      seenIds.add(menuItemId);
      rows.push({ key: `id-${menuItemId}`, name, quantity, menuItemId, pickable: true });
    } else {
      rows.push({ key: `row-${idx++}`, name, quantity, menuItemId: null, pickable: false });
    }
  }
  return rows;
}

export function RejectOrderItemsPickSidesheet({
  open,
  lineItems,
  onClose,
  onContinue,
}: {
  open: boolean;
  lineItems: NormalizedOrderLineItem[];
  onClose: () => void;
  onContinue: (selected: RejectPickItem[]) => void;
}) {
  const rows = useMemo(() => buildRows(lineItems), [lineItems]);
  const pickableRows = rows.filter((r) => r.pickable);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set());
  }, [open, lineItems]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const toggle = (menuItemId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuItemId)) next.delete(menuItemId);
      else next.add(menuItemId);
      return next;
    });
  };

  const allPickableSelected =
    pickableRows.length > 0 &&
    pickableRows.every((r) => r.menuItemId != null && selectedIds.has(r.menuItemId));

  const toggleSelectAll = () => {
    if (allPickableSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(pickableRows.map((r) => r.menuItemId!)));
  };

  const handleContinue = () => {
    const selected: RejectPickItem[] = pickableRows
      .filter((r) => r.menuItemId != null && selectedIds.has(r.menuItemId))
      .map((r) => ({
        menuItemId: r.menuItemId!,
        name: r.name,
        quantity: r.quantity,
      }));
    onContinue(selected);
  };

  return createPortal(
    <div className="fixed inset-0 z-[2440] flex justify-end" role="presentation">
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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="text-lg font-bold text-gray-900">Which items are out of stock?</h2>
            <p className="text-sm text-gray-500 mt-0.5 whitespace-nowrap">
              Select items from this order to mark unavailable.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">No line items found on this order.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
              {pickableRows.length > 0 ? (
                <li>
                  <label className="flex cursor-pointer items-center gap-3 bg-gray-50 px-4 py-3 hover:bg-gray-100">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={allPickableSelected}
                      onChange={toggleSelectAll}
                    />
                    <span className="text-sm font-semibold text-gray-900">Select all</span>
                  </label>
                </li>
              ) : null}
              {rows.map((row) => {
                const checked = row.menuItemId != null && selectedIds.has(row.menuItemId);
                return (
                  <li key={row.key}>
                    <label
                      className={`flex items-start gap-3 px-4 py-3.5 ${
                        row.pickable ? 'cursor-pointer hover:bg-gray-50' : 'opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                        checked={checked}
                        disabled={!row.pickable}
                        onChange={() => row.menuItemId != null && toggle(row.menuItemId)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-900 block">
                          {row.quantity > 1 ? `${row.quantity} × ` : ''}
                          {row.name}
                        </span>
                        {!row.pickable ? (
                          <span className="text-xs text-gray-500 block mt-0.5">
                            Cannot mark unavailable — menu link missing
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 px-5 py-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={pickableRows.length > 0 && selectedIds.size === 0}
            className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}
