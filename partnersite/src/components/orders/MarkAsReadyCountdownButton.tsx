'use client';

import React from 'react';
import {
  prepReadyCountdownLabel,
  prepReadyTimeRemainingRatio,
  type PrepCountdownOrder,
} from '@/lib/order-prep-time';

export type MarkAsReadyCountdownButtonProps = {
  order: PrepCountdownOrder;
  nowMs: number | null | undefined;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  fullWidth?: boolean;
};

export function MarkAsReadyCountdownButton({
  order,
  nowMs,
  onClick,
  disabled,
  className = '',
  compact,
  fullWidth,
}: MarkAsReadyCountdownButtonProps) {
  const { label } =
    nowMs != null
      ? prepReadyCountdownLabel(order, nowMs, {
          prefix: 'Mark as ready',
          expiredLabel: 'Mark as ready',
        })
      : { label: 'Mark as ready', disabled: false, secondsLeft: 0 };

  const fillRatio = nowMs != null ? prepReadyTimeRemainingRatio(order, nowMs) : 1;
  const fillPct = `${Math.round(fillRatio * 100)}%`;

  const sizeClass = compact
    ? 'px-2.5 py-1.5 text-xs'
    : fullWidth
      ? 'w-full px-4 py-2.5 text-sm font-semibold'
      : 'px-4 py-2 text-sm';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden rounded-xl font-semibold text-white shadow-sm border border-orange-700/25 disabled:opacity-50 min-w-0 transition-all duration-200 active:scale-[0.98] bg-slate-800 hover:bg-slate-900 ${sizeClass} ${className}`}
    >
      <span
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 via-orange-500 to-orange-600 transition-[width] duration-1000 ease-linear"
        style={{ width: fillPct }}
        aria-hidden
      />
      <span
        className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10 pointer-events-none"
        aria-hidden
      />
      <span className="relative z-10 drop-shadow-sm">{label}</span>
    </button>
  );
}
