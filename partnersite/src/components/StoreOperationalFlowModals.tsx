'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { clientStoreOpsDebugLog } from '@/lib/store-ops-client-debug';
import {
  isLicenseBlockedStoreOpsError,
  isOutsideOperatingHoursStoreOpsError,
  toastStoreOperationsPostFailure,
} from '@/lib/storeOperationsPostFeedback';
import { OutsideOperatingHoursModal } from '@/components/OutsideOperatingHoursModal';
import { CloseStoreSidesheet } from '@/components/CloseStoreSidesheet';

export type StoreOperationalTarget = { storeId: string; storeName: string };

function formatTimeHMS(t: string): string {
  if (!t) return '00:00:00';
  const parts = t.split(':');
  if (parts.length === 2) return `${t}:00`;
  return t;
}

/**
 * Same store open/close UX as the dashboard “Store status” card: full close dialog
 * (temporary / today / manual hold + reason) and “Turn store ON?” warning.
 * Rendered via portal so it stacks above partner sheets.
 */
export function StoreOperationalFlowModals({
  closeTarget,
  openTarget,
  onDismissClose,
  onDismissOpen,
  onSuccess,
  initialClosureType = null,
}: {
  closeTarget: StoreOperationalTarget | null;
  openTarget: StoreOperationalTarget | null;
  onDismissClose: () => void;
  onDismissOpen: () => void;
  onSuccess: (result?: { operational_status?: 'OPEN' | 'CLOSED' }) => void | Promise<void>;
  /** Pre-select closure type when opening (e.g. after reject with "Not operational today"). */
  initialClosureType?: 'temporary' | 'today' | 'manual_hold' | null;
}) {
  const [openingTime, setOpeningTime] = useState('09:00');
  const [toggleClosureType, setToggleClosureType] = useState<'temporary' | 'today' | 'manual_hold' | null>(null);
  const [closureDate, setClosureDate] = useState('');
  const [closureTime, setClosureTime] = useState('12:00');
  const [closeReason, setCloseReason] = useState('');
  const [closeReasonOther, setCloseReasonOther] = useState('');
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false);
  const [toggleOnLoading, setToggleOnLoading] = useState(false);
  const [outsideHoursOpen, setOutsideHoursOpen] = useState(false);

  const activeCloseStoreId = closeTarget?.storeId ?? null;

  useEffect(() => {
    if (!activeCloseStoreId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(activeCloseStoreId)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const slots = (data as { today_slots?: { start?: string }[] }).today_slots;
        if (Array.isArray(slots) && slots.length > 0 && slots[0]?.start) {
          setOpeningTime(slots[0].start);
        } else {
          setOpeningTime('09:00');
        }
      } catch {
        if (!cancelled) setOpeningTime('09:00');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCloseStoreId]);

  useEffect(() => {
    if (!closeTarget) {
      setToggleClosureType(null);
      setCloseReason('');
      setCloseReasonOther('');
      return;
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    setClosureDate(`${y}-${m}-${d}`);
    const in10 = new Date(now.getTime() + 10 * 60 * 1000);
    setClosureTime(
      `${in10.getHours().toString().padStart(2, '0')}:${in10.getMinutes().toString().padStart(2, '0')}`
    );
    setToggleClosureType(initialClosureType ?? null);
    setCloseReason('');
    setCloseReasonOther('');
  }, [closeTarget, initialClosureType]);

  const handleClosePopupConfirm = () => {
    if (!toggleClosureType) {
      toast.error('Please select closure type');
      return;
    }
    if (toggleClosureType === 'temporary') {
      if (!closureDate || !closureTime) {
        toast.error('Please select date and time for reopening');
        return;
      }
      const timeNorm = /^\d{2}:\d{2}:\d{2}$/.test(closureTime) ? closureTime : `${closureTime}:00`;
      const closedUntil = new Date(`${closureDate}T${timeNorm}+05:30`);
      if (Number.isNaN(closedUntil.getTime()) || closedUntil.getTime() <= Date.now()) {
        toast.error('Reopening date and time must be in the future');
        return;
      }
    }
    if (!closeReason?.trim()) {
      toast.error('Please select a reason for closing');
      return;
    }
    if (closeReason === 'Other' && !closeReasonOther?.trim()) {
      toast.error('Please enter the reason in "Other"');
      return;
    }
    void handleFinalCloseConfirm();
  };

  const handleFinalCloseConfirm = async () => {
    const storeId = closeTarget?.storeId;
    if (!storeId || !toggleClosureType) return;
    setCloseConfirmLoading(true);

    let manualCloseUntilIso: string | undefined;
    if (toggleClosureType === 'temporary') {
      const timeNorm = /^\d{2}:\d{2}:\d{2}$/.test(closureTime) ? closureTime : `${closureTime}:00`;
      manualCloseUntilIso = `${closureDate}T${timeNorm}`;
    }

    const reasonText = closeReason === 'Other' ? (closeReasonOther?.trim() || 'Other') : closeReason;
    const body: {
      store_id: string;
      action: string;
      closure_type: string;
      manual_close_until?: string;
      close_reason?: string;
    } = {
      store_id: storeId,
      action: 'manual_close',
      closure_type: toggleClosureType,
      close_reason: reasonText,
    };
    if (manualCloseUntilIso) body.manual_close_until = manualCloseUntilIso;

    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as { success?: boolean }).success) {
        onDismissClose();
        setToggleClosureType(null);
        setCloseReason('');
        setCloseReasonOther('');
        if (toggleClosureType === 'manual_hold') {
          toast.success('Store closed. It will only open when you turn it ON.');
        } else if (toggleClosureType === 'temporary') {
          const until = new Date(`${closureDate}T${closureTime}:00`);
          toast.success(
            `Store closed until ${until.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. You can also turn it ON manually anytime.`
          );
        } else {
          toast.success('Store closed for the rest of today (IST). You can turn it ON anytime.');
        }
        await onSuccess({ operational_status: 'CLOSED' });
      } else {
        toast.error((data as { error?: string }).error || 'Failed to close store');
      }
    } catch {
      toast.error('Failed to close store');
    } finally {
      setCloseConfirmLoading(false);
    }
  };

  const handleCancelClosePopup = () => {
    if (closeConfirmLoading) return;
    onDismissClose();
    setToggleClosureType(null);
    setClosureDate('');
    setClosureTime('12:00');
    setCloseReason('');
    setCloseReasonOther('');
  };

  const handleConfirmToggleOn = async () => {
    const storeId = openTarget?.storeId;
    if (!storeId) return;
    setToggleOnLoading(true);
    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, action: 'manual_open' }),
      });
      const data = await res.json().catch(() => ({}));
      clientStoreOpsDebugLog('POST manual_open response', {
        storeId,
        httpStatus: res.status,
        ok: res.ok,
        body: data,
      });
      if (res.ok && (data as { success?: boolean }).success) {
        onDismissOpen();
        toast.success('Store is now OPEN. Orders are being accepted!');
        await onSuccess({ operational_status: 'OPEN' });
      } else {
        if (isOutsideOperatingHoursStoreOpsError(data)) {
          onDismissOpen();
          setOutsideHoursOpen(true);
        } else {
          toastStoreOperationsPostFailure(res, data, 'Failed to open store');
          if (isLicenseBlockedStoreOpsError(data)) {
            onDismissOpen();
          }
        }
        await onSuccess();
      }
    } catch {
      toast.error('Failed to open store');
      await onSuccess();
    } finally {
      setToggleOnLoading(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <CloseStoreSidesheet
        open={!!closeTarget}
        zClassName="z-[2400]"
        title={closeTarget ? `Close outlet: ${closeTarget.storeName}` : undefined}
        subtitle={closeTarget ? closeTarget.storeId : undefined}
        toggleClosureType={toggleClosureType}
        setToggleClosureType={setToggleClosureType}
        closureDate={closureDate}
        setClosureDate={setClosureDate}
        closureTime={closureTime}
        setClosureTime={setClosureTime}
        closeReason={closeReason}
        setCloseReason={setCloseReason}
        closeReasonOther={closeReasonOther}
        setCloseReasonOther={setCloseReasonOther}
        loading={closeConfirmLoading}
        onCancel={handleCancelClosePopup}
        onConfirm={handleClosePopupConfirm}
      />

      {openTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[2400] p-4">
          <div className="backdrop-blur-md bg-white/95 rounded-2xl shadow-2xl max-w-sm w-full p-6 border-2 border-emerald-200">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-50 flex items-center justify-center">
                <Power size={28} className="text-emerald-600" />
              </div>
            </div>
            <div className="text-center space-y-2 mb-2">
              <h3 className="text-lg font-bold text-gray-900">Turn outlet ON?</h3>
              <p className="text-xs font-medium text-gray-500">{openTarget.storeName}</p>
              <p className="text-sm text-gray-600">
                <strong>{openTarget.storeId}</strong> will be OPEN and customers can place orders. Make sure you&apos;re
                ready to accept orders!
              </p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 mb-6">
              <p className="text-xs text-amber-800 font-medium">
                ⚠️ <strong>Orders may start coming immediately!</strong> Be prepared to receive and process them.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => !toggleOnLoading && onDismissOpen()}
                disabled={toggleOnLoading}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-50/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmToggleOn()}
                disabled={toggleOnLoading}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md hover:shadow-lg disabled:opacity-80 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {toggleOnLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Turning ON...
                  </>
                ) : (
                  'Yes, Turn ON'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <OutsideOperatingHoursModal
        open={outsideHoursOpen}
        onClose={() => setOutsideHoursOpen(false)}
        storeId={openTarget?.storeId ?? null}
      />
    </>,
    document.body
  );
}
