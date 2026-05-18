'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Store } from 'lucide-react';

export const STORE_CLOSED_ACTIVE_TITLE = 'Store is closed for new orders';
export const STORE_CLOSED_ACTIVE_BODY =
  'You still have active orders to complete. Finish preparing and dispatching them below.';
export const STORE_CLOSED_ACTIVE_MARQUEE = `${STORE_CLOSED_ACTIVE_TITLE} · ${STORE_CLOSED_ACTIVE_BODY}`;

function StoreClosedActiveOrdersModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-closed-active-title"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-6 pb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <Store className="h-6 w-6 text-amber-700" aria-hidden />
          </div>
          <h2 id="store-closed-active-title" className="text-base font-semibold text-gray-900">
            {STORE_CLOSED_ACTIVE_TITLE}
          </h2>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">{STORE_CLOSED_ACTIVE_BODY}</p>
        </div>
        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            Okay
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function StoreClosedActiveOrdersMarquee() {
  const text = STORE_CLOSED_ACTIVE_MARQUEE;
  return (
    <div
      className="shrink-0 overflow-hidden border-b border-amber-200 bg-amber-50 py-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-max animate-store-closed-marquee">
        {[0, 1].map((copy) => (
          <span
            key={copy}
            className="shrink-0 px-6 text-xs sm:text-sm font-medium text-amber-900 whitespace-nowrap"
            aria-hidden={copy === 1}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Popup when store is closed but active orders exist; marquee after dismiss until orders finish. */
export function StoreClosedActiveOrdersNotice({ visible }: { visible: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!visible) setDismissed(false);
  }, [visible]);

  const showModal = visible && !dismissed;
  const showMarquee = visible && dismissed;

  return (
    <>
      <StoreClosedActiveOrdersModal open={showModal} onClose={() => setDismissed(true)} />
      {showMarquee ? <StoreClosedActiveOrdersMarquee /> : null}
    </>
  );
}
