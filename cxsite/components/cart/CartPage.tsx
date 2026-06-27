'use client'

import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/hooks/useCart'
import CustomizeModal from '@/components/cart/CustomizeModal'
import AuthModal from '@/components/auth/AuthModal'
import { useState } from 'react'
import { useAppSelector } from '@/lib/hooks'

// Multi-restaurant checkout confirmation modal
function MultiRestaurantCheckoutModal({ 
  isOpen, 
  onClose, 
  restaurantCount, 
  restaurantGroups,
  onPlaceAllOrders, 
  onPlaceSingleOrder 
}: {
  isOpen: boolean
  onClose: () => void
  restaurantCount: number
  restaurantGroups: { restaurantId: string; restaurantName: string }[]
  onPlaceAllOrders: () => void
  onPlaceSingleOrder: (restaurantId: string) => void
}) {
  const [selectingRestaurant, setSelectingRestaurant] = useState(false)
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null)

  if (!isOpen) return null

  const handlePlaceSingleOrder = () => {
    if (selectingRestaurant && selectedRestaurantId) {
      onPlaceSingleOrder(selectedRestaurantId)
    } else {
      setSelectingRestaurant(true)
    }
  }

  const handleClose = () => {
    setSelectingRestaurant(false)
    setSelectedRestaurantId(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      ></div>
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
        >
          <i className="fas fa-times"></i>
        </button>

        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-store text-[#FF6B35] text-2xl"></i>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
          Multiple Restaurants Selected
        </h2>

        {/* Restaurant count badge */}
        <div className="flex justify-center mb-4">
          <span className="px-4 py-1.5 bg-orange-100 text-[#FF6B35] font-bold rounded-full text-sm">
            {restaurantCount} Restaurants
          </span>
        </div>

        {/* Message */}
        <p className="text-gray-600 text-center mb-6 leading-relaxed">
          Your orders will be placed separately for each restaurant, and delivery times may vary. 
          <span className="block mt-2 text-sm text-gray-500">Kindly bear with us.</span>
        </p>

        {/* Restaurant selection (shown when "Place Order from One Restaurant Only" is clicked) */}
        {selectingRestaurant && (
          <div className="mb-6 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm font-semibold text-gray-700 mb-3">Select a restaurant:</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {restaurantGroups.map((group) => (
                <label 
                  key={group.restaurantId}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                    selectedRestaurantId === group.restaurantId 
                      ? 'bg-orange-100 border-2 border-[#FF6B35]' 
                      : 'bg-white border-2 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="restaurant"
                    value={group.restaurantId}
                    checked={selectedRestaurantId === group.restaurantId}
                    onChange={() => setSelectedRestaurantId(group.restaurantId)}
                    className="w-4 h-4 text-[#FF6B35] focus:ring-[#FF6B35]"
                  />
                  <span className="font-medium text-gray-900">{group.restaurantName}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {!selectingRestaurant && (
            <button
              onClick={onPlaceAllOrders}
              className="w-full px-4 py-3 bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <i className="fas fa-check-double"></i>
              Place All Orders
            </button>
          )}
          
          <button
            onClick={handlePlaceSingleOrder}
            disabled={selectingRestaurant && !selectedRestaurantId}
            className={`w-full px-4 py-3 border-2 font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              selectingRestaurant 
                ? selectedRestaurantId
                  ? 'border-green-500 bg-green-500 text-white hover:bg-green-600'
                  : 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
            }`}
          >
            <i className="fas fa-check"></i>
            {selectingRestaurant 
              ? 'Confirm Selection' 
              : 'Place Order from One Restaurant Only'
            }
          </button>

          {selectingRestaurant && (
            <button
              onClick={() => { setSelectingRestaurant(false); setSelectedRestaurantId(null) }}
              className="w-full px-4 py-2 text-gray-500 font-medium hover:text-gray-700 transition-colors"
            >
              ← Back to options
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Order success confirmation modal
function OrderSuccessModal({ 
  isOpen, 
  onClose, 
  orderCount 
}: {
  isOpen: boolean
  onClose: () => void
  orderCount: number
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
        {/* Success animation */}
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-check-circle text-green-500 text-4xl"></i>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
          Order Placed Successfully!
        </h2>

        {/* Message */}
        <p className="text-gray-600 text-center mb-6">
          {orderCount > 1 
            ? 'All orders have been placed successfully.' 
            : 'You have successfully placed 1 order.'
          }
        </p>

        {/* Order count badge */}
        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 bg-green-100 text-green-700 font-bold rounded-full">
            {orderCount} {orderCount > 1 ? 'Orders' : 'Order'} Placed
          </span>
        </div>

        {/* Action button */}
        <button
          onClick={onClose}
          className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-xl hover:shadow-lg transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

export default function CartPage() {
  const router = useRouter()
  const { isAuthenticated } = useAppSelector(state => state.auth)
  const { 
    items, 
    total, 
    removeFromCart, 
    updateItemQuantity, 
    restaurantName, 
    clearCartItems, 
    updateItemOptions,
    getItemsGroupedByRestaurant,
    lastActiveRestaurantId 
  } = useCart()
  const [customOpen, setCustomOpen] = useState(false)
  const [customCartEntry, setCustomCartEntry] = useState<any | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [selectedRestaurants, setSelectedRestaurants] = useState<Set<string>>(new Set())
  const [pendingCheckoutRestaurant, setPendingCheckoutRestaurant] = useState<string | null>(null)
  
  // Multi-restaurant checkout modal states
  const [showMultiRestaurantModal, setShowMultiRestaurantModal] = useState(false)
  const [showOrderSuccessModal, setShowOrderSuccessModal] = useState(false)
  const [successOrderCount, setSuccessOrderCount] = useState(0)
  const [pendingOrderType, setPendingOrderType] = useState<'all' | 'single' | null>(null)
  const [pendingSingleRestaurantId, setPendingSingleRestaurantId] = useState<string | null>(null)

  // Basic options map for context-aware add-ons / sizes per productId
  const optionsMap: Record<string, any> = {
    '1': { basePrice: 280, sizes: [{ id: 's', name: 'Small', price: 0 }, { id: 'm', name: 'Regular', price: 40 }, { id: 'l', name: 'Large', price: 80 }], addons: [{ id: 'a1', name: 'Extra Paneer', price: 60 }, { id: 'a2', name: 'Extra Gravy', price: 40 }] },
    '2': { basePrice: 320, sizes: [{ id: 'r', name: 'Regular', price: 0 }, { id: 'h', name: 'Half', price: -80 }, { id: 'f', name: 'Family', price: 200 }], addons: [{ id: 'a3', name: 'Boiled Egg', price: 20 }, { id: 'a4', name: 'Cold Drink', price: 50 }] },
  }

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(itemId)
    } else {
      updateItemQuantity(itemId, newQuantity)
    }
  }

  // Get all restaurant groups
  const restaurantGroups = getItemsGroupedByRestaurant()

  // Toggle restaurant selection
  const toggleRestaurantSelection = (restaurantId: string) => {
    setSelectedRestaurants(prev => {
      const newSet = new Set(prev)
      if (newSet.has(restaurantId)) {
        newSet.delete(restaurantId)
      } else {
        newSet.add(restaurantId)
      }
      return newSet
    })
  }

  // Select/Deselect all restaurants
  const toggleSelectAll = () => {
    if (selectedRestaurants.size === restaurantGroups.length) {
      setSelectedRestaurants(new Set())
    } else {
      setSelectedRestaurants(new Set(restaurantGroups.map(g => g.restaurantId)))
    }
  }

  // Calculate selected items total
  const getSelectedTotal = () => {
    if (selectedRestaurants.size === 0) return total
    return restaurantGroups
      .filter(g => selectedRestaurants.has(g.restaurantId))
      .reduce((sum, g) => sum + g.items.reduce((s, item) => s + item.price * item.quantity, 0), 0)
  }

  // Handle checkout - show multi-restaurant modal first (no auth check yet)
  const handleProceedToCheckout = (restaurantId?: string) => {
    // Check if multiple restaurants are being checked out
    const checkoutRestaurantCount = restaurantId 
      ? 1 
      : (selectedRestaurants.size > 0 ? selectedRestaurants.size : restaurantGroups.length)
    
    if (checkoutRestaurantCount > 1) {
      // Show multi-restaurant confirmation modal first
      setShowMultiRestaurantModal(true)
      return
    }
    
    // Single restaurant - check auth then proceed
    if (!isAuthenticated) {
      setPendingCheckoutRestaurant(restaurantId || 'all')
      setShowAuthModal(true)
      return
    }
    
    // Authenticated, proceed directly to payment
    proceedToCheckoutPage(restaurantId)
  }

  // Handle placing all orders (from modal) - check auth after modal
  const handlePlaceAllOrders = () => {
    setShowMultiRestaurantModal(false)
    
    // Check authentication after modal confirmation
    if (!isAuthenticated) {
      setPendingOrderType('all')
      setShowAuthModal(true)
      return
    }
    
    // User is authenticated, proceed to checkout page
    proceedWithAllOrders()
  }

  // Actually proceed with all orders (after auth confirmed) - GO TO CHECKOUT PAGE
  const proceedWithAllOrders = () => {
    // Store selected restaurants in sessionStorage for checkout page
    if (selectedRestaurants.size > 0) {
      sessionStorage.setItem('checkoutRestaurants', JSON.stringify(Array.from(selectedRestaurants)))
    } else {
      sessionStorage.setItem('checkoutRestaurants', JSON.stringify(restaurantGroups.map(g => g.restaurantId)))
    }
    
    // Navigate to checkout page (NOT place order directly)
    router.push('/checkout')
  }

  // Handle placing single order (from modal) - check auth after modal
  const handlePlaceSingleOrder = (restaurantId: string) => {
    setShowMultiRestaurantModal(false)
    
    // Check authentication after modal confirmation
    if (!isAuthenticated) {
      setPendingOrderType('single')
      setPendingSingleRestaurantId(restaurantId)
      setShowAuthModal(true)
      return
    }
    
    // User is authenticated, proceed to checkout page
    proceedWithSingleOrder(restaurantId)
  }

  // Actually proceed with single order (after auth confirmed) - GO TO CHECKOUT PAGE
  const proceedWithSingleOrder = (restaurantId: string) => {
    sessionStorage.setItem('checkoutRestaurants', JSON.stringify([restaurantId]))
    
    // Navigate to checkout page (NOT place order directly)
    router.push('/checkout')
  }

  // Handle order success modal close - No longer needed but keep for cleanup
  const handleOrderSuccessClose = () => {
    setShowOrderSuccessModal(false)
    router.push('/orders?filter=food&from=%2Forder')
  }

  // Actually navigate to checkout
  const proceedToCheckoutPage = (restaurantId?: string) => {
    // Store selected restaurants in sessionStorage for checkout page
    if (restaurantId && restaurantId !== 'all') {
      sessionStorage.setItem('checkoutRestaurants', JSON.stringify([restaurantId]))
    } else if (selectedRestaurants.size > 0) {
      sessionStorage.setItem('checkoutRestaurants', JSON.stringify(Array.from(selectedRestaurants)))
    } else {
      sessionStorage.setItem('checkoutRestaurants', JSON.stringify(restaurantGroups.map(g => g.restaurantId)))
    }
    router.push('/checkout')
  }

  // Handle auth modal close - check if we need to proceed with checkout
  const handleAuthModalClose = () => {
    setShowAuthModal(false)
    
    // If user just authenticated, proceed with pending action
    if (isAuthenticated) {
      // Check for pending multi-restaurant order
      if (pendingOrderType === 'all') {
        setPendingOrderType(null)
        proceedWithAllOrders()
        return
      }
      
      // Check for pending single restaurant order (from modal)
      if (pendingOrderType === 'single' && pendingSingleRestaurantId) {
        const restaurantId = pendingSingleRestaurantId
        setPendingOrderType(null)
        setPendingSingleRestaurantId(null)
        proceedWithSingleOrder(restaurantId)
        return
      }
      
      // Check for pending direct checkout
      if (pendingCheckoutRestaurant) {
        proceedToCheckoutPage(pendingCheckoutRestaurant === 'all' ? undefined : pendingCheckoutRestaurant)
        setPendingCheckoutRestaurant(null)
        return
      }
    }
    
    // Clear pending states if not authenticated
    setPendingOrderType(null)
    setPendingSingleRestaurantId(null)
    setPendingCheckoutRestaurant(null)
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg font-semibold text-sm text-gray-700 hover:bg-gray-100 mb-6 shadow-sm border border-gray-200"
          >
            <i className="fas fa-arrow-left"></i>
            Back
          </button>

          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-shopping-cart text-gray-400 text-2xl"></i>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Cart is Empty</h1>
            <p className="text-gray-600 mb-6">Add some delicious items to get started!</p>
            <button
              onClick={() => router.push('/restaurants')}
              className="px-6 py-3 bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white font-bold rounded-lg hover:shadow-lg transition-all"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-6 py-5">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg font-semibold text-sm text-gray-700 hover:bg-gray-100 shadow-sm border border-gray-200 mb-4"
          >
            <i className="fas fa-arrow-left"></i>
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Your Cart</h1>
              <p className="text-gray-600 text-sm">
                {restaurantGroups.length > 1 
                  ? `${restaurantGroups.length} restaurants` 
                  : restaurantName}
              </p>
            </div>
            {/* Select All - Only show if multiple restaurants */}
            {restaurantGroups.length > 1 && (
              <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200">
                <input
                  type="checkbox"
                  checked={selectedRestaurants.size === restaurantGroups.length}
                  onChange={toggleSelectAll}
                  className="w-5 h-5 rounded border-gray-300 text-[#FF6B35] focus:ring-[#FF6B35]"
                />
                <span className="text-sm font-semibold text-gray-700">Select All</span>
              </label>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cart Items - Grouped by Restaurant */}
          <div className="lg:col-span-2 space-y-6">
            {restaurantGroups.map((group, groupIndex) => (
              <div 
                key={group.restaurantId} 
                className={`bg-white rounded-2xl shadow-lg overflow-hidden ${
                  group.restaurantId === lastActiveRestaurantId 
                    ? 'ring-2 ring-[#FF6B35] ring-offset-2' 
                    : ''
                } ${selectedRestaurants.has(group.restaurantId) ? 'ring-2 ring-green-500' : ''}`}
              >
                {/* Restaurant Header */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Selection Checkbox - Only show if multiple restaurants */}
                      {restaurantGroups.length > 1 && (
                        <input
                          type="checkbox"
                          checked={selectedRestaurants.has(group.restaurantId)}
                          onChange={() => toggleRestaurantSelection(group.restaurantId)}
                          className="w-5 h-5 rounded border-gray-300 text-[#FF6B35] focus:ring-[#FF6B35] cursor-pointer"
                        />
                      )}
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF6B35] to-orange-500 flex items-center justify-center">
                        <i className="fas fa-store text-white"></i>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{group.restaurantName}</h3>
                        <p className="text-xs text-gray-500">{group.items.length} item{group.items.length > 1 ? 's' : ''} • ₹{group.items.reduce((s, i) => s + i.price * i.quantity, 0)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {group.restaurantId === lastActiveRestaurantId && (
                        <span className="text-xs font-semibold text-[#FF6B35] bg-orange-50 px-2 py-1 rounded-full">
                          Most Recent
                        </span>
                      )}
                      {/* Checkout this restaurant button */}
                      <button
                        onClick={() => handleProceedToCheckout(group.restaurantId)}
                        className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs font-semibold rounded-lg hover:shadow-md transition-all"
                      >
                        Checkout
                      </button>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="divide-y">
                  {group.items.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex gap-4">
                        {/* Product Image */}
                        <div className="w-20 h-20 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                          {item.image ? (
                            <img 
                              src={item.image} 
                              alt={item.name} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <i className="fas fa-utensils text-gray-400 text-xl"></i>
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-gray-900">{item.name}</h3>
                              {item.size && <p className="text-sm text-gray-600">Size: {item.size.name}</p>}
                              {item.addons && item.addons.length > 0 && (
                                <p className="text-sm text-gray-600">Add-ons: {item.addons.map(a => a.name).join(', ')}</p>
                              )}
                              <p className="text-sm text-gray-600">Unit: ₹{item.price}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-700"
                              >
                                −
                              </button>
                              <span className="w-6 text-center font-bold text-gray-900">{item.quantity}</span>
                              <button
                                onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-700"
                              >
                                +
                              </button>
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="ml-4 text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <i className="fas fa-trash text-sm"></i>
                              </button>
                              {optionsMap[item.productId] && (
                                <button
                                  onClick={() => { setCustomCartEntry(item); setCustomOpen(true) }}
                                  className="ml-3 px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                                >
                                  Customize
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-5 sticky top-6 h-fit">
              <h2 className="font-bold text-lg text-gray-900 mb-4">Order Summary</h2>
              
              {/* Show selected restaurants info */}
              {restaurantGroups.length > 1 && selectedRestaurants.size > 0 && (
                <div className="mb-4 p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-700">
                    <i className="fas fa-check-circle mr-2"></i>
                    {selectedRestaurants.size} of {restaurantGroups.length} restaurants selected
                  </p>
                </div>
              )}
              
              <div className="space-y-3 mb-4 pb-4 border-b border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-semibold text-gray-900">₹{getSelectedTotal()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery Fee</span>
                  <span className="font-semibold text-gray-900">₹{selectedRestaurants.size > 0 ? selectedRestaurants.size * 35 : 35}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax & Charges</span>
                  <span className="font-semibold text-gray-900">₹{(getSelectedTotal() * 0.05).toFixed(0)}</span>
                </div>
              </div>
              <div className="flex justify-between font-bold text-lg text-gray-900 mb-6">
                <span>Total</span>
                <span>₹{(getSelectedTotal() + (selectedRestaurants.size > 0 ? selectedRestaurants.size * 35 : 35) + Math.round(getSelectedTotal() * 0.05)).toFixed(0)}</span>
              </div>
              <button 
                onClick={() => handleProceedToCheckout()}
                disabled={restaurantGroups.length > 1 && selectedRestaurants.size === 0}
                className={`w-full px-4 py-3 bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white font-bold rounded-lg hover:shadow-lg transition-all mb-3 ${
                  restaurantGroups.length > 1 && selectedRestaurants.size === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {restaurantGroups.length > 1 && selectedRestaurants.size === 0 
                  ? 'Select restaurants to checkout' 
                  : `Proceed to Checkout${selectedRestaurants.size > 1 ? ` (${selectedRestaurants.size} orders)` : ''}`
                }
              </button>
              <button
                onClick={() => router.back()}
                className="w-full px-4 py-3 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-all"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Customize modal mount inside top-level container */}
      <_RenderCartCustomize
        open={customOpen}
        entry={customCartEntry}
        onClose={() => { setCustomOpen(false); setCustomCartEntry(null) }}
        optionsMap={optionsMap}
        onConfirm={(selection: any) => {
          if (!customCartEntry) return
          updateItemOptions(customCartEntry.id, optionsMap[customCartEntry.productId].basePrice, { size: selection.size, addons: selection.addons }, selection.quantity)
          setCustomOpen(false)
          setCustomCartEntry(null)
        }}
      />
      
      {/* Auth Modal for checkout */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={handleAuthModalClose} 
      />
      
      {/* Multi-restaurant checkout confirmation modal */}
      <MultiRestaurantCheckoutModal
        isOpen={showMultiRestaurantModal}
        onClose={() => setShowMultiRestaurantModal(false)}
        restaurantCount={selectedRestaurants.size > 0 ? selectedRestaurants.size : restaurantGroups.length}
        restaurantGroups={selectedRestaurants.size > 0 
          ? restaurantGroups.filter(g => selectedRestaurants.has(g.restaurantId))
          : restaurantGroups
        }
        onPlaceAllOrders={handlePlaceAllOrders}
        onPlaceSingleOrder={handlePlaceSingleOrder}
      />
      
      {/* Order success confirmation modal */}
      <OrderSuccessModal
        isOpen={showOrderSuccessModal}
        onClose={handleOrderSuccessClose}
        orderCount={successOrderCount}
      />
    </div>
  )
}

// Render the customize modal using component state
export function _RenderCartCustomize({ open, entry, onClose, optionsMap, onConfirm }: any) {
  if (!open || !entry) return null
  const opts = optionsMap[entry.productId]
  if (!opts) return null

  const modalItem = {
    id: entry.productId,
    name: entry.name,
    basePrice: opts.basePrice,
    sizes: opts.sizes,
    addons: opts.addons,
    image: undefined,
  }

  return (
    <CustomizeModal
      open={open}
      onClose={onClose}
      item={modalItem}
      onConfirm={(selection: any) => onConfirm(selection)}
    />
  )
}

// Customize modal (Cart page) - opens for cart entry edits
function CartCustomizeWrapper({ open, entry, onClose, onConfirm, optionsMap }: any) {
  if (!open || !entry) return null
  const opts = optionsMap[entry.productId]
  if (!opts) return null

  const modalItem = {
    id: entry.productId,
    name: entry.name,
    basePrice: opts.basePrice,
    sizes: opts.sizes,
    addons: opts.addons,
    image: undefined,
  }

  return (
    <CustomizeModal
      open={open}
      onClose={onClose}
      item={modalItem}
      onConfirm={(selection: any) => onConfirm(selection)}
    />
  )
}

// Render wrapper modal at module level to avoid hooks in loops
// Render modal from inside component
/* Modal insertion handled in main component via state: */
