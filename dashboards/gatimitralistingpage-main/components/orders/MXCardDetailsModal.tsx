"use client";

interface MXCardDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: string;
}

export default function MXCardDetailsModal({ isOpen, onClose, details }: MXCardDetailsModalProps) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[300px] max-w-full" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-bold mb-2">MX Card – More Details</div>
        <div className="text-gray-700 mb-4">{details}</div>
        <button
          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
