'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  RiderDeliveryPartnerCard,
  type RiderDeliveryPartnerCardProps,
} from '@/components/orders/RiderDeliveryPartnerCard';

export type OrderRiderSidesheetProps = {
  open: boolean;
  onClose: () => void;
  riderCard: RiderDeliveryPartnerCardProps;
  /** @deprecated Ignored — sheet matches Store status (covers header, inset-0). */
  topOffset?: string;
};

/** Right sheet for delivery-partner details (order history “View rider”). */
export function OrderRiderSidesheet({
  open,
  onClose,
  riderCard,
}: OrderRiderSidesheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  // Same shell as Store status / notifications: full viewport, over the top bar.
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Close rider details"
        onClick={onClose}
      />
      <aside
        className="relative flex h-dvh min-h-0 w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-rider-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="order-rider-sheet-title" className="text-lg font-bold text-gray-900">
            Delivery partner
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar p-5">
          <RiderDeliveryPartnerCard {...riderCard} showHeader={false} className="shadow-none" />
        </div>
      </aside>
    </div>,
    document.body
  );
}
