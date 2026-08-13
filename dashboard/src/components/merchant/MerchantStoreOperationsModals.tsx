"use client";

import { Loader2 } from "lucide-react";
import {
  MERCHANT_PORTAL_CLOSE_REASONS,
  merchantPortalCloseReasonWithSuffix,
} from "@/lib/merchantPortalCloseReasons";

export type MerchantStoreOperationsModalsProps = {
  isDelisted?: boolean;
  showClosePopup: boolean;
  closeConfirmLoading: boolean;
  toggleClosureType: "temporary" | "today" | "manual_hold" | null;
  setToggleClosureType: (v: "temporary" | "today" | "manual_hold" | null) => void;
  closureDate: string;
  setClosureDate: (v: string) => void;
  closureTime: string;
  setClosureTime: (v: string) => void;
  closeReason: string;
  setCloseReason: (v: string) => void;
  closeReasonOther: string;
  setCloseReasonOther: (v: string) => void;
  showToggleOnWarning: boolean;
  setShowToggleOnWarning: (v: boolean) => void;
  toggleOnLoading: boolean;
  handleConfirmToggleOn: (opts?: { isDelisted?: boolean }) => void | Promise<void>;
  handleClosePopupConfirm: () => void;
  handleCancelClosePopup: () => void;
  scheduleEndModal?: {
    open: boolean;
    title: string;
    body: string;
    onStayOnline: () => void;
    onGoOffline: () => void;
  };
};

export function MerchantStoreOperationsModals({
  isDelisted,
  showClosePopup,
  closeConfirmLoading,
  toggleClosureType,
  setToggleClosureType,
  closureDate,
  setClosureDate,
  closureTime,
  setClosureTime,
  closeReason,
  setCloseReason,
  closeReasonOther,
  setCloseReasonOther,
  showToggleOnWarning,
  setShowToggleOnWarning,
  toggleOnLoading,
  handleConfirmToggleOn,
  handleClosePopupConfirm,
  handleCancelClosePopup,
  scheduleEndModal,
}: MerchantStoreOperationsModalsProps) {
  return (
    <>
      {scheduleEndModal?.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
            <p className="text-base font-bold text-gray-900">{scheduleEndModal.title}</p>
            <p className="mt-2 text-sm text-gray-700">{scheduleEndModal.body}</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
                onClick={scheduleEndModal.onStayOnline}
              >
                Stay Online
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
                onClick={scheduleEndModal.onGoOffline}
              >
                Go Offline
              </button>
            </div>
          </div>
        </div>
      )}

      {showClosePopup && (
        <div
          className="fixed inset-0 z-[120] flex justify-end bg-black/40 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-close-store-title"
          onClick={handleCancelClosePopup}
        >
          <div
            className="flex h-dvh w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-100 px-5 py-4">
              <h2 id="dashboard-close-store-title" className="text-lg font-bold text-gray-900">
                How would you like to close your store?
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-3">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${
                  toggleClosureType === "temporary"
                    ? "border-orange-400 bg-orange-50"
                    : "border-gray-200 hover:border-orange-200"
                }`}
              >
                <input
                  type="radio"
                  name="closureType"
                  checked={toggleClosureType === "temporary"}
                  onChange={() => setToggleClosureType("temporary")}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Temporary Closed</p>
                  <p className="text-xs text-gray-600">
                    Close until a specific date and time. Reopens automatically then, or turn ON manually anytime.
                  </p>
                </div>
              </label>
              {toggleClosureType === "temporary" && (
                <div className="ml-7 space-y-3 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                  <p className="text-xs font-semibold text-gray-700">Reopen on (date and time):</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">Date</label>
                      <input
                        type="date"
                        value={closureDate}
                        onChange={(e) => setClosureDate(e.target.value)}
                        min={(() => {
                          const n = new Date();
                          return `${n.getFullYear()}-${(n.getMonth() + 1).toString().padStart(2, "0")}-${n.getDate().toString().padStart(2, "0")}`;
                        })()}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">Time</label>
                      <input
                        type="time"
                        value={closureTime}
                        onChange={(e) => setClosureTime(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600">
                    Store stays closed until this date and time, or until you turn it ON manually.
                  </p>
                </div>
              )}
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${
                  toggleClosureType === "today" ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-red-200"
                }`}
              >
                <input
                  type="radio"
                  name="closureType"
                  checked={toggleClosureType === "today"}
                  onChange={() => setToggleClosureType("today")}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Close for Today</p>
                  <p className="text-xs text-gray-600">
                    Closed until end of today (India time). Schedule can resume tomorrow.
                  </p>
                </div>
              </label>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${
                  toggleClosureType === "manual_hold"
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-200 hover:border-amber-200"
                }`}
              >
                <input
                  type="radio"
                  name="closureType"
                  checked={toggleClosureType === "manual_hold"}
                  onChange={() => setToggleClosureType("manual_hold")}
                  className="h-4 w-4"
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
              <label className="block text-xs font-semibold text-gray-700">
                Reason for closing <span className="text-red-500">*</span>
              </label>
              <select
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Select reason</option>
                {MERCHANT_PORTAL_CLOSE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {merchantPortalCloseReasonWithSuffix(r)}
                  </option>
                ))}
              </select>
              {closeReason === "Other" && (
                <input
                  type="text"
                  value={closeReasonOther}
                  onChange={(e) => setCloseReasonOther(e.target.value)}
                  placeholder="Enter reason"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              )}
            </div>
            </div>
            <div className="shrink-0 border-t border-gray-100 px-5 py-4 flex gap-3">
              <button
                type="button"
                onClick={handleCancelClosePopup}
                disabled={closeConfirmLoading}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClosePopupConfirm}
                disabled={
                  !toggleClosureType ||
                  !closeReason?.trim() ||
                  (closeReason === "Other" && !closeReasonOther?.trim()) ||
                  (toggleClosureType === "temporary" && (!closureDate || !closureTime)) ||
                  closeConfirmLoading
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {closeConfirmLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showToggleOnWarning && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border-2 border-emerald-200 bg-white p-6 shadow-2xl">
            <h3 className="text-center text-lg font-bold text-gray-900">Turn Store ON?</h3>
            <p className="mt-2 text-center text-sm text-gray-600">
              Your store will be OPEN and customers can place orders. Make sure you&apos;re ready to accept orders!
            </p>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-xs font-medium text-amber-800">
                Orders will start coming immediately. Be prepared to receive and process them.
              </p>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => !toggleOnLoading && setShowToggleOnWarning(false)}
                disabled={toggleOnLoading}
                className="flex-1 rounded-lg border-2 border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmToggleOn({ isDelisted })}
                disabled={toggleOnLoading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {toggleOnLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Turning ON...
                  </>
                ) : (
                  "Yes, Turn ON"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
