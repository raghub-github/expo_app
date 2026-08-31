'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  LICENSE_REVIEW_MODAL_EVENT,
  LICENSE_VERIFY_MARQUEE_EVENT,
  buildLicenseVerifyMarqueeText,
  isLicenseVerifyMarqueeMarked,
  readLicenseVerifyMarqueeLabels,
} from '@/lib/licenseVerifyMarquee';

export function LicenseVerificationWaitingMarquee({
  storeId,
}: {
  storeId?: number | string | null;
}) {
  const id =
    storeId != null && String(storeId).trim() !== '' && String(storeId) !== '---'
      ? String(storeId).trim()
      : null;

  const [marked, setMarked] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const sync = useCallback(() => {
    if (!id) {
      setMarked(false);
      setLabels([]);
      return;
    }
    setMarked(isLicenseVerifyMarqueeMarked(id));
    setLabels(readLicenseVerifyMarqueeLabels(id));
  }, [id]);

  useEffect(() => {
    sync();
    const onMarquee = () => sync();
    const onModal = (e: Event) => {
      setModalOpen((e as CustomEvent<{ open?: boolean }>).detail?.open === true);
    };
    window.addEventListener(LICENSE_VERIFY_MARQUEE_EVENT, onMarquee);
    window.addEventListener(LICENSE_REVIEW_MODAL_EVENT, onModal);
    return () => {
      window.removeEventListener(LICENSE_VERIFY_MARQUEE_EVENT, onMarquee);
      window.removeEventListener(LICENSE_REVIEW_MODAL_EVENT, onModal);
    };
  }, [sync]);

  if (!id || !marked || modalOpen) return null;

  const text = buildLicenseVerifyMarqueeText(labels);

  return (
    <div
      className="shrink-0 overflow-hidden whitespace-nowrap border-b border-amber-200 bg-amber-50 py-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-max animate-store-closed-marquee whitespace-nowrap">
        {[0, 1].map((copy) => (
          <span
            key={copy}
            className="shrink-0 px-6 text-xs font-semibold text-amber-950 whitespace-nowrap sm:text-sm"
            aria-hidden={copy === 1}
          >
            {text} · {text} ·{' '}
          </span>
        ))}
      </div>
    </div>
  );
}
