'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  RiderDeliveryPartnerCard,
  type RiderDeliveryPartnerCardProps,
} from '@/components/orders/RiderDeliveryPartnerCard';
import { ORDER_SHELL_HEADER_OFFSET } from '@/components/orders/OrderRidersHistorySidesheet';

export type OrderRiderSidesheetProps = {
  open: boolean;
  onClose: () => void;
  riderCard: RiderDeliveryPartnerCardProps;
  /** CSS top offset so the sheet sits below the fixed app header. */
  topOffset?: string;
};

/** Right sheet for delivery-partner details (order history “View rider”). */
export function OrderRiderSidesheet({
  open,
  onClose,
  riderCard,
  topOffset = ORDER_SHELL_HEADER_OFFSET,
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
        aria-label="Close rider details"
        onClick={onClose}
      />
      <aside
        className="relative flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        style={{
          marginTop: 'var(--order-sheet-top)',
          height: 'calc(100dvh - var(--order-sheet-top))',
          maxHeight: 'calc(100dvh - var(--order-sheet-top))',
        }}
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
