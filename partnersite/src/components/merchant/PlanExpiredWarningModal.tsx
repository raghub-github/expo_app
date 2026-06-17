'use client';

import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';
import Link from 'next/link';
import { markPlanExpiredWarningShown } from '@/lib/plan-expired-warning';

type Props = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  subscriptionId?: number | string | null;
  planName?: string;
  expiredAt?: string | null;
};

export function PlanExpiredWarningModal({
  open,
  onClose,
  storeId,
  subscriptionId,
  planName,
  expiredAt,
}: Props) {
  if (!open || typeof document === 'undefined') return null;

  const expiredLabel = expiredAt
    ? new Date(expiredAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const handleClose = () => {
    markPlanExpiredWarningShown(storeId, subscriptionId);
    onClose();
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50"
        onClick={handleClose}
        style={{
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
        }}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none" style={{ zIndex: 10000 }}>
        <div className="bg-white rounded-xl max-w-md w-full pointer-events-auto shadow-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Plan expired</h2>
            <button type="button" onClick={handleClose} className="text-gray-500 hover:text-gray-900">
              <X size={20} />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {planName ? `${planName} has expired` : 'Your subscription plan has expired'}
                </p>
                <p className="text-sm text-gray-700">
                  {expiredLabel
                    ? `This plan expired on ${expiredLabel}. Auto renew is off, so your wallet was not charged.`
                    : 'Auto renew is off, so your wallet was not charged for renewal.'}{' '}
                  Renew now to keep premium features active.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Link
                href="/partners/store-settings?tab=plans"
                onClick={handleClose}
                className="block w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold transition-colors text-center"
              >
                Renew plan
              </Link>
              <button
                type="button"
                onClick={handleClose}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
              >
                Remind me later
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
