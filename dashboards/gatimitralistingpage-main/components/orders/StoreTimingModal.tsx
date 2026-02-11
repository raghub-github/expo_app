"use client";

interface StoreDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: string;
}

export default function StoreDetailsModal({ isOpen, onClose, details }: StoreDetailsModalProps) {
  if (!isOpen) return null;
  
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#d0d0d0] min-w-[400px] max-w-[600px] w-full max-h-[85vh] overflow-hidden transform transition-all duration-300 scale-100 opacity-100 hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 pb-3 border-b-2 border-emerald-500 bg-gradient-to-r from-emerald-50 to-white">
          <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <i className="bi bi-info-circle-fill text-emerald-600"></i>
            <span>Store Details</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-lg p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
              {details}
            </div>
          </div>
          
          {/* Additional Info Section */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
              <i className="bi bi-card-checklist text-emerald-600"></i>
              Quick Info
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-emerald-50 p-2.5 rounded border border-emerald-100">
                <div className="text-gray-600 font-medium mb-0.5">Status</div>
                <div className="text-emerald-700 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  Currently Open
                </div>
              </div>
              <div className="bg-blue-50 p-2.5 rounded border border-blue-100">
                <div className="text-gray-600 font-medium mb-0.5">Timings</div>
                <div className="text-blue-700 font-semibold">08:00 - 23:00</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-all duration-300 shadow-md hover:shadow-lg flex items-center gap-2 min-w-[120px] justify-center"
          >
            <i className="bi bi-check-lg"></i>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}