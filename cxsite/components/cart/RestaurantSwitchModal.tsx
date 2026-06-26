'use client'

interface RestaurantSwitchModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (keepBoth: boolean) => void
  currentRestaurantName: string
  newRestaurantName: string
}

export default function RestaurantSwitchModal({
  isOpen,
  onClose,
  onConfirm,
  currentRestaurantName,
  newRestaurantName,
}: RestaurantSwitchModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div 
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
              <i className="fas fa-utensils text-orange-500 text-xl"></i>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Add items from a new restaurant?</h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 mb-4">
            You already have items from <span className="font-semibold text-gray-900">{currentRestaurantName}</span> in your cart.
          </p>
          <p className="text-gray-600 mb-6">
            What would you like to do?
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
              <p className="text-sm text-blue-800">
                You can order from multiple restaurants! Each restaurant&apos;s items will be shown in a separate section in your cart.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => onConfirm(true)}
              className="w-full px-4 py-3 bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <i className="fas fa-plus"></i>
              Keep Both & Add to Cart
            </button>
            <button
              onClick={() => onConfirm(false)}
              className="w-full px-4 py-3 border-2 border-red-300 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-all flex items-center justify-center gap-2"
            >
              <i className="fas fa-exchange-alt"></i>
              Replace Cart with New Items
            </button>
            <button
              onClick={onClose}
              className="w-full px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
