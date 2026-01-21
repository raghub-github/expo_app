"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle, Clock } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";

interface StatusChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    reason: string;
    isTemporary?: boolean;
    expiresAt?: Date;
  }) => void;
  currentStatus: string;
  newStatus: string;
  userName: string;
  isLoading?: boolean;
}

export function StatusChangeModal({
  isOpen,
  onClose,
  onConfirm,
  currentStatus,
  newStatus,
  userName,
  isLoading = false,
}: StatusChangeModalProps) {
  const [reason, setReason] = useState("");
  const [isTemporary, setIsTemporary] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; expiry?: string }>({});

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setReason("");
      setIsTemporary(false);
      setExpiryDate("");
      setExpiryTime("");
      setErrors({});
    }
  }, [isOpen]);

  // Auto-fill current date/time when temporary suspension is enabled
  useEffect(() => {
    if (isOpen && isTemporary) {
      const now = new Date();
      // Get current date in local timezone (YYYY-MM-DD format)
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      // Get current time in local timezone (HH:MM format)
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      
      // Always set to current date/time when checkbox is checked
      setExpiryDate(dateStr);
      setExpiryTime(timeStr);
    }
  }, [isOpen, isTemporary]);

  if (!isOpen) return null;

  const statusLabels: Record<string, string> = {
    ACTIVE: "Active",
    SUSPENDED: "Suspend",
    DISABLED: "Disabled",
    PENDING_ACTIVATION: "Pending",
    LOCKED: "Locked",
  };

  const currentLabel = statusLabels[currentStatus] || currentStatus;
  const newLabel = statusLabels[newStatus] || newStatus;
  const isChangingFromActive = currentStatus === "ACTIVE";
  const isChangingToSuspend = newStatus === "SUSPENDED";
  const showTemporaryOption = isChangingFromActive && isChangingToSuspend;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate reason
    if (isChangingFromActive && !reason.trim()) {
      setErrors({ reason: "A reason is required when changing from Active status" });
      return;
    }

    // Validate temporary suspension
    if (isTemporary) {
      if (!expiryDate || !expiryTime) {
        setErrors({ expiry: "Please select both date and time for temporary suspension" });
        return;
      }

      const expiryDateTime = new Date(`${expiryDate}T${expiryTime}`);
      const now = new Date();

      if (expiryDateTime <= now) {
        setErrors({ expiry: "Expiry date and time must be in the future" });
        return;
      }

      onConfirm({
        reason: reason.trim(),
        isTemporary: true,
        expiresAt: expiryDateTime,
      });
    } else {
      onConfirm({
        reason: reason.trim() || null,
        isTemporary: false,
      });
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setReason("");
      setIsTemporary(false);
      setExpiryDate("");
      setExpiryTime("");
      setErrors({});
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          handleClose();
        }
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header - Fixed */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <AlertCircle className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Change User Status</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-white/90 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <form id="status-change-form" onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* User Info */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">User</p>
              <p className="font-semibold text-gray-900">{userName}</p>
              <div className="flex items-center gap-4 mt-2 text-sm">
                <div>
                  <span className="text-gray-600">From: </span>
                  <span className="font-medium text-gray-900">{currentLabel}</span>
                </div>
                <span className="text-gray-400">→</span>
                <div>
                  <span className="text-gray-600">To: </span>
                  <span className="font-medium text-blue-600">{newLabel}</span>
                </div>
              </div>
            </div>

            {/* Reason Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason {isChangingFromActive && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  isChangingFromActive
                    ? "Please provide a reason for this status change..."
                    : "Optional: Add a reason for this status change..."
                }
                required={isChangingFromActive}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 resize-none text-sm"
              />
              {errors.reason && (
                <p className="mt-1 text-sm text-red-600">{errors.reason}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                This reason will be recorded in the audit log.
              </p>
            </div>

            {/* Temporary Suspension Option */}
            {showTemporaryOption && (
              <div className="border-t border-gray-200 pt-4">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={isTemporary}
                    onChange={(e) => setIsTemporary(e.target.checked)}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-600 group-hover:text-blue-600" />
                    <span className="text-sm font-medium text-gray-700">
                      Temporary Suspension
                    </span>
                  </div>
                </label>
                <p className="text-xs text-gray-500 ml-8 mt-1">
                  User will be automatically reactivated after the specified time
                </p>

                {isTemporary && (
                  <div className="mt-4 space-y-3 ml-8 bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Expiry Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                          min={(() => {
                            const now = new Date();
                            const year = now.getFullYear();
                            const month = String(now.getMonth() + 1).padStart(2, '0');
                            const day = String(now.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          })()}
                          required={isTemporary}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Expiry Time <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="time"
                          value={expiryTime}
                          onChange={(e) => setExpiryTime(e.target.value)}
                          required={isTemporary}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm"
                        />
                      </div>
                    </div>
                    {errors.expiry && (
                      <p className="text-sm text-red-600">{errors.expiry}</p>
                    )}
                    {expiryDate && expiryTime && !errors.expiry && (
                      <p className="text-xs text-blue-700 font-medium mt-2">
                        User will be reactivated on{" "}
                        {new Date(`${expiryDate}T${expiryTime}`).toLocaleString()}
                      </p>
                    )}
                  </div>
              )}
            </div>
          )}
          </form>
        </div>

        {/* Footer - Fixed */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-white transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Cancel
            </button>
            <LoadingButton
              type="submit"
              form="status-change-form"
              loading={isLoading}
              loadingText="Updating..."
              variant="primary"
              size="md"
            >
              Confirm Change
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );
}
