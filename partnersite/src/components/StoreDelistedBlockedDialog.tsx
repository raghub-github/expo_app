'use client';

import { openMxNeedHelp } from '@/lib/openMxNeedHelp';

export const STORE_DELISTED_POPUP_TITLE = 'Store delisted';
export const STORE_DELISTED_POPUP_BODY =
  'This store is delisted. You cannot turn it online until GatiMitra relists it. Please contact support.';

export function StoreDelistedBlockedDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-red-100">
        <p className="text-base font-semibold text-red-800">{STORE_DELISTED_POPUP_TITLE}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{STORE_DELISTED_POPUP_BODY}</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              onClose();
              openMxNeedHelp({
                prefillSubject: 'Store delisted',
                prefillDescription:
                  'This store is delisted. Please assist with reactivation.',
              });
            }}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Contact support
          </button>
        </div>
      </div>
    </div>
  );
}
