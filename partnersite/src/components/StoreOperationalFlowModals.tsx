'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from '@headlessui/react';
import { Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { clientStoreOpsDebugLog } from '@/lib/store-ops-client-debug';

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
}: {
  closeTarget: StoreOperationalTarget | null;
  openTarget: StoreOperationalTarget | null;
  onDismissClose: () => void;
  onDismissOpen: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [openingTime, setOpeningTime] = useState('09:00');
  const [toggleClosureType, setToggleClosureType] = useState<'temporary' | 'today' | 'manual_hold' | null>(null);
  const [closureDate, setClosureDate] = useState('');
  const [closureTime, setClosureTime] = useState('12:00');
  const [closeReason, setCloseReason] = useState('');
  const [closeReasonOther, setCloseReasonOther] = useState('');
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false);
  const [toggleOnLoading, setToggleOnLoading] = useState(false);

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
    setToggleClosureType(null);
    setCloseReason('');
    setCloseReasonOther('');
  }, [closeTarget]);

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
      const closedUntil = new Date(`${closureDate}T${closureTime}:00`);
      if (closedUntil.getTime() <= Date.now()) {
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
      const closedUntil = new Date(`${closureDate}T${closureTime}:00`);
      manualCloseUntilIso = closedUntil.toISOString();
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
        await onSuccess();
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
        await onSuccess();
      } else {
        toast.error((data as { error?: string }).error || 'Failed to open store');
      }
    } catch {
      toast.error('Failed to open store');
    } finally {
      setToggleOnLoading(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {closeTarget && (
        <Dialog open onClose={handleCancelClosePopup} className="relative z-[200]">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
              <Dialog.Title className="text-lg font-bold text-gray-900 mb-1">
                Close outlet: {closeTarget.storeName}
              </Dialog.Title>
              <p className="text-xs text-gray-500 mb-4">{closeTarget.storeId}</p>
              <p className="text-sm text-gray-600 mb-3">How would you like to close this store?</p>
              <div className="space-y-3">
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${
                    toggleClosureType === 'temporary' ? 'bg-orange-50 border-orange-400' : 'border-gray-200 hover:border-orange-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="closureTypeMx"
                    checked={toggleClosureType === 'temporary'}
                    onChange={() => setToggleClosureType('temporary')}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Temporary Closed</p>
                    <p className="text-xs text-gray-600">
                      Close until a specific date and time. Reopens automatically then, or turn ON manually anytime.
                    </p>
                  </div>
                </label>
                {toggleClosureType === 'temporary' && (
                  <div className="ml-7 space-y-3 p-3 rounded-lg bg-orange-50/50 border border-orange-200">
                    <p className="text-xs font-semibold text-gray-700">Reopen on (date and time):</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 block mb-1">Date</label>
                        <input
                          type="date"
                          value={closureDate}
                          onChange={(e) => setClosureDate(e.target.value)}
                          min={(() => {
                            const n = new Date();
                            return `${n.getFullYear()}-${(n.getMonth() + 1).toString().padStart(2, '0')}-${n.getDate().toString().padStart(2, '0')}`;
                          })()}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 block mb-1">Time</label>
                        <input
                          type="time"
                          value={closureTime}
                          onChange={(e) => setClosureTime(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-600">
                      Store stays closed until this date & time, or until you turn it ON manually.
                    </p>
                  </div>
                )}
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${
                    toggleClosureType === 'today' ? 'bg-red-50 border-red-400' : 'border-gray-200 hover:border-red-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="closureTypeMx"
                    checked={toggleClosureType === 'today'}
                    onChange={() => setToggleClosureType('today')}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Close for Today</p>
                    <p className="text-xs text-gray-600">Closed until end of today (India time). Schedule can resume tomorrow.</p>
                  </div>
                </label>
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${
                    toggleClosureType === 'manual_hold' ? 'bg-amber-50 border-amber-400' : 'border-gray-200 hover:border-amber-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="closureTypeMx"
                    checked={toggleClosureType === 'manual_hold'}
                    onChange={() => setToggleClosureType('manual_hold')}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Until I manually turn it ON</p>
                    <p className="text-xs text-gray-600">
                      Store stays OFF even during operating hours until you turn it ON
                    </p>
                  </div>
                </label>
              </div>
              <div className="mt-4 space-y-2">
                <label className="text-xs font-semibold text-gray-700 block">
                  Reason for closing <span className="text-red-500">*</span>
                </label>
                <select
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                >
                  <option value="">Select reason</option>
                  <option value="Staff shortage">Staff shortage</option>
                  <option value="Inventory restock">Inventory restock</option>
                  <option value="Device issue / electricity">Device issue / electricity</option>
                  <option value="Run out of Gas">Run out of Gas</option>
                  <option value="Payment issue">Payment issue</option>
                  <option value="Rush of offline orders">Rush of offline orders</option>
                  <option value="Equipment issue">Equipment issue</option>
                  <option value="Holiday / Off">Holiday / Off</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Personal / Emergency">Personal / Emergency</option>
                  <option value="Kitchen / Prep area issue">Kitchen / Prep area issue</option>
                  <option value="Supplier delay">Supplier delay</option>
                  <option value="Other">Other</option>
                </select>
                {closeReason === 'Other' && (
                  <input
                    type="text"
                    value={closeReasonOther}
                    onChange={(e) => setCloseReasonOther(e.target.value)}
                    placeholder="Enter reason"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                )}
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={handleCancelClosePopup}
                  disabled={closeConfirmLoading}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClosePopupConfirm}
                  disabled={
                    !toggleClosureType ||
                    !closeReason?.trim() ||
                    (closeReason === 'Other' && !closeReasonOther?.trim()) ||
                    (toggleClosureType === 'temporary' && (!closureDate || !closureTime)) ||
                    closeConfirmLoading
                  }
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {closeConfirmLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Confirming...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      )}

      {openTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[200] p-4">
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
    </>,
    document.body
  );
}
