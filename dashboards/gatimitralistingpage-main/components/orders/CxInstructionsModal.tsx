"use client";

interface CxInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
  customerName?: string;
  deliveryAddress?: string;
  customerInstructions?: string;
}

export default function CxInstructionsModal({
  isOpen,
  onClose,
  orderId,
  customerName,
  deliveryAddress,
  customerInstructions,
}: CxInstructionsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#d0d0d0] min-w-[420px] max-w-[650px] w-full max-h-[85vh] overflow-hidden transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 pb-3 border-b-2 border-emerald-500 bg-gradient-to-r from-emerald-50 to-white">
          <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <i className="bi bi-chat-left-text-fill text-emerald-600"></i>
            CX Instructions
          </div>

          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-lg p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[60vh] space-y-4">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <div className="text-gray-500 mb-0.5">Order ID</div>
              <div className="text-gray-800 font-semibold">
                {orderId || "N/A"}
              </div>
            </div>

            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <div className="text-gray-500 mb-0.5">Customer</div>
              <div className="text-gray-800 font-semibold">
                {customerName || "N/A"}
              </div>
            </div>
          </div>

          {/* Address */}
          {deliveryAddress && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="text-sm font-semibold text-blue-800 mb-1 flex items-center gap-1.5">
                <i className="bi bi-geo-alt-fill"></i>
                Delivery Address
              </h4>
              <p className="text-sm text-gray-700 leading-relaxed">
                {deliveryAddress}
              </p>
            </div>
          )}

          {/* CX Instructions */}
          <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
            <h4 className="text-sm font-semibold text-emerald-800 mb-2 flex items-center gap-1.5">
              <i className="bi bi-info-circle-fill"></i>
              Customer Instructions
            </h4>

            {customerInstructions ? (
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">
                {customerInstructions}
              </p>
            ) : (
              <p className="text-sm text-gray-600 italic">
                No special instructions provided by the customer.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 min-w-[120px] justify-center"
          >
            <i className="bi bi-check-lg"></i>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
