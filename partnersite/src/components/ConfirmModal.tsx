'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

export type ConfirmModalVariant = 'default' | 'danger' | 'warning';

export type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  variant?: ConfirmModalVariant;
};

const VARIANT_STYLES: Record<
  ConfirmModalVariant,
  { iconBg: string; iconColor: string; confirmBtn: string }
> = {
  default: {
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    confirmBtn: 'bg-sky-600 hover:bg-sky-700 text-white',
  },
  warning: {
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBtn: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  danger: {
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    confirmBtn: 'bg-orange-500 hover:bg-orange-600 text-white',
  },
};

/**
 * Centralized confirm dialog for Partner Site — use instead of window.confirm().
 */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onClose,
  onConfirm,
  isLoading = false,
  variant = 'warning',
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const styles = VARIANT_STYLES[variant];

  return createPortal(
    <div
      className="fixed inset-0 z-[100050] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          disabled={isLoading}
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <div className="mb-4 flex justify-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${styles.iconBg}`}>
            <AlertTriangle size={28} className={styles.iconColor} strokeWidth={2} />
          </div>
        </div>
        <h2 id="confirm-modal-title" className="mb-2 text-center text-lg font-bold text-gray-900">
          {title}
        </h2>
        <p className="mb-6 text-center text-sm leading-relaxed text-gray-600">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 ${styles.confirmBtn}`}
          >
            {isLoading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmModal;
