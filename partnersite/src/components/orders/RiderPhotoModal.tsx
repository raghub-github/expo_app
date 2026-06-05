'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type RiderPhotoModalProps = {
  open: boolean;
  imageUrl: string | null;
  riderName?: string | null;
  onClose: () => void;
};

export function RiderPhotoModal({ open, imageUrl, riderName, onClose }: RiderPhotoModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !imageUrl?.trim() || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2600] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative max-h-[92vh] max-w-lg w-full"
        role="dialog"
        aria-modal="true"
        aria-label={riderName ? `Photo of ${riderName}` : 'Rider photo'}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 z-10 rounded-full bg-white p-2 shadow-lg hover:bg-gray-50"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-700" />
        </button>
        {riderName ? (
          <p className="mb-2 text-center text-sm font-semibold text-white drop-shadow">
            {riderName}
          </p>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={riderName ?? 'Rider'}
          className="max-h-[85vh] w-full rounded-2xl object-contain shadow-2xl ring-2 ring-white/20"
        />
      </div>
    </div>,
    document.body
  );
}
