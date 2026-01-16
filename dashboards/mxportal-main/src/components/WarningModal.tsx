import React from 'react';

interface WarningModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}

export default function WarningModal({ open, onClose, onConfirm, children }: WarningModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full flex flex-col items-center relative">
        <div className="mb-4">{children}</div>
        <h2 className="text-xl font-bold text-red-600 mb-2">Are you sure you want to logout?</h2>
        <p className="text-gray-700 mb-6 text-center">You will be logged out and redirected to the home page.</p>
        <div className="flex gap-4 w-full justify-center">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700">Logout</button>
        </div>
      </div>
    </div>
  );
}
