'use client';

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { TimelineActorDetail } from '@/lib/merchantVisibleTimeline';

function buildRows(detail: TimelineActorDetail): { label: string; value: string }[] {
  if (detail.variant === 'admin') {
    return [
      { label: 'Accepted By', value: detail.acceptedBy },
      { label: 'Source', value: detail.source },
    ];
  }
  const rows: { label: string; value: string }[] = [];
  if (detail.name) rows.push({ label: 'Name', value: detail.name });
  if (detail.phone) rows.push({ label: 'Phone number', value: detail.phone });
  if (detail.email) rows.push({ label: 'Email', value: detail.email });
  rows.push({ label: 'Role', value: detail.role });
  rows.push({ label: 'Source', value: detail.source });
  if (detail.acceptedThrough) {
    rows.push({ label: 'Accepted Through', value: detail.acceptedThrough });
  }
  return rows;
}

export function TimelineActorDetailModal({
  open,
  detail,
  onClose,
}: {
  open: boolean;
  detail: TimelineActorDetail | null;
  onClose: () => void;
}) {
  const rows = useMemo(() => (detail ? buildRows(detail) : []), [detail]);

  if (!open || !detail || rows.length === 0 || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[2600] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full max-w-xs rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 space-y-2.5 max-h-[70vh] overflow-y-auto">
          {rows.map((row) => (
            <div key={row.label} className="text-center">
              <p className="text-xs text-gray-500">{row.label}</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5 break-words">{row.value}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            Okay
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
