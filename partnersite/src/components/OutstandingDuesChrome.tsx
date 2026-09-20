'use client';

import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useOutstandingDuesClear } from '@/hooks/useOutstandingDuesClear';

/** Survives SPA route changes; resets on full browser reload. */
let outstandingDuesMarqueeDismissed = false;

type ClearDuesButtonProps = {
  storeId?: string | number | null;
  className?: string;
  /** compact = payments header next to Withdraw */
  size?: 'sm' | 'md';
};

export function ClearDuesButton({
  storeId,
  className = '',
  size = 'sm',
}: ClearDuesButtonProps) {
  const { hasDues, clearing, clearDues } = useOutstandingDuesClear(storeId);
  if (!hasDues) return null;

  const sizeCls =
    size === 'md'
      ? 'px-3 py-1.5 text-sm gap-1.5'
      : 'px-3 py-1.5 text-xs gap-1';

  return (
    <button
      type="button"
      onClick={() => void clearDues()}
      disabled={clearing}
      className={`inline-flex items-center rounded-lg bg-red-600 font-bold text-white hover:bg-red-700 disabled:opacity-60 transition-colors ${sizeCls} ${className}`}
    >
      {clearing ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Clearing…
        </>
      ) : (
        'Clear Dues'
      )}
    </button>
  );
}

/**
 * Global strip under the partner top bar — visible on every shell page when dues > 0.
 * Dismiss (X) hides until full page reload; SPA navigations keep it closed.
 */
export function OutstandingDuesMarquee({
  storeId,
}: {
  storeId?: string | number | null;
}) {
  const { hasDues, amountLabel } = useOutstandingDuesClear(storeId);
  const [dismissed, setDismissed] = useState(outstandingDuesMarqueeDismissed);

  if (!hasDues || dismissed) return null;

  // Exactly 3 sentences per loop half; equal pr-10 after each → same gap 1→2, 2→3, and at loop join.
  const sentence = `Outstanding dues ${amountLabel} · Clear dues to restore withdrawals`;
  const sentenceClass =
    'shrink-0 whitespace-nowrap pr-10 text-xs font-semibold text-red-800 sm:text-sm';

  return (
    <div
      className="shrink-0 flex items-center border-b border-red-200 bg-red-50"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1 overflow-hidden py-2">
        <div className="flex w-max animate-store-closed-marquee will-change-transform">
          <div className="flex shrink-0">
            <span className={sentenceClass}>{sentence}</span>
            <span className={sentenceClass}>{sentence}</span>
            <span className={sentenceClass}>{sentence}</span>
          </div>
          <div className="flex shrink-0" aria-hidden>
            <span className={sentenceClass}>{sentence}</span>
            <span className={sentenceClass}>{sentence}</span>
            <span className={sentenceClass}>{sentence}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          outstandingDuesMarqueeDismissed = true;
          setDismissed(true);
        }}
        className="shrink-0 mr-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-red-800 hover:bg-red-100"
        aria-label="Dismiss outstanding dues banner"
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
