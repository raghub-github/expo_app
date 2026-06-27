'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/hooks/useCart'
import { useAppSelector } from '@/lib/hooks'

// Dummy addresses for demo
const savedAddresses = [
  {
    id: '1',
    type: 'Home',
    icon: 'fas fa-home',
    address: '123 Main Street, Apartment 4B',
    city: 'Mumbai',
    pincode: '400001',
    isDefault: true,
  },
  {
    id: '2',
    type: 'Work',
    icon: 'fas fa-building',
    address: '456 Business Park, Floor 7',
    city: 'Mumbai',
    pincode: '400051',
    isDefault: false,
  },
]

export default function CheckoutPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAppSelector(state => state.auth)
  const { 
    items, 
    total, 
    getItemsGroupedByRestaurant,
    clearCartItems
  } = useCart()
  
  const [selectedAddress, setSelectedAddress] = useState<string | null>(savedAddresses[0]?.id || null)
  const [showAddAddress, setShowAddAddress] = useState(false)
  const [newAddress, setNewAddress] = useState({ address: '', city: '', pincode: '', type: 'Home' })
  const [checkoutRestaurantIds, setCheckoutRestaurantIds] = useState<string[]>([])
  
  // Get checkout restaurants from session storage
  useEffect(() => {
    const stored = sessionStorage.getItem('checkoutRestaurants')
    if (stored) {
      setCheckoutRestaurantIds(JSON.parse(stored))
    }
  }, [])

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/cart')
    }
  }, [isAuthenticated, router])

  // Get restaurant groups
  const allGroups = getItemsGroupedByRestaurant()
  
  // Filter to only checkout restaurants
  const checkoutGroups = checkoutRestaurantIds.length > 0
    ? allGroups.filter(g => checkoutRestaurantIds.includes(g.restaurantId))
    : allGroups

  // Calculate checkout total
  const checkoutTotal = checkoutGroups.reduce(
    (sum, g) => sum + g.items.reduce((s, item) => s + item.price * item.quantity, 0), 
    0
  )

  // Delivery fee per restaurant
  const deliveryFee = 40
  const totalDeliveryFee = checkoutGroups.length * deliveryFee
  
  // Grand total
  const grandTotal = checkoutTotal + totalDeliveryFee

  const handleProceedToPayment = () => {
    if (!selectedAddress) return
    
    // Get the selected address details
    const selectedAddressData = savedAddresses.find(a => a.id === selectedAddress)
    
    // Store checkout data for payment page
    sessionStorage.setItem('checkoutData', JSON.stringify({
      restaurantIds: checkoutRestaurantIds.length > 0 ? checkoutRestaurantIds : allGroups.map(g => g.restaurantId),
      addressId: selectedAddress,
      addressData: selectedAddressData ? {
        address: selectedAddressData.address,
        city: selectedAddressData.city,
        pincode: selectedAddressData.pincode,
        type: selectedAddressData.type,
      } : null,
      subtotal: checkoutTotal,
      deliveryFee: totalDeliveryFee,
      total: grandTotal,
    }))
    
    router.push('/payment')
  }

  const handleAddNewAddress = () => {
    if (newAddress.address && newAddress.city && newAddress.pincode) {
      // In a real app, this would save to the database
      const newId = Date.now().toString()
      savedAddresses.push({
        id: newId,
        type: newAddress.type,
        icon: newAddress.type === 'Work' ? 'fas fa-building' : 'fas fa-home',
        address: newAddress.address,
        city: newAddress.city,
        pincode: newAddress.pincode,
        isDefault: false,
      })
      setSelectedAddress(newId)
      setShowAddAddress(false)
      setNewAddress({ address: '', city: '', pincode: '', type: 'Home' })
    }
  }

  if (items.length === 0 || checkoutGroups.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-shopping-bag text-gray-400 text-2xl"></i>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">No Items to Checkout</h1>
            <p className="text-gray-600 mb-6">Add items to your cart first</p>
            <button
              onClick={() => router.push('/restaurants')}
              className="px-6 py-3 bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white font-bold rounded-lg hover:shadow-lg transition-all"
            >
              Browse Restaurants
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
            onClick={() => router.push('/cart')}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg font-semibold text-sm text-gray-700 hover:bg-gray-100 shadow-sm border border-gray-200 mb-4"
          >
            <i className="fas fa-arrow-left"></i>
            Back to Cart
          </button>
          
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">
                <i className="fas fa-check text-xs"></i>
              </div>
              <span className="text-sm font-medium text-green-600">Cart</span>
            </div>
            <div className="w-12 h-0.5 bg-[#FF6B35]"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#FF6B35] text-white flex items-center justify-center text-sm font-bold">
                2
              </div>
              <span className="text-sm font-medium text-[#FF6B35]">Checkout</span>
            </div>
            <div className="w-12 h-0.5 bg-gray-300"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center text-sm font-bold">
                3
              </div>
              <span className="text-sm font-medium text-gray-500">Payment</span>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 text-center">Checkout</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Address & Order Summary */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address Section */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="fas fa-map-marker-alt text-[#FF6B35]"></i>
                Delivery Address
              </h2>
              
              {/* Saved Addresses */}
              <div className="space-y-3 mb-4">
                {savedAddresses.map((addr) => (
                  <label
                    key={addr.id}
                    className={`flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all ${
                      selectedAddress === addr.id
                        ? 'bg-orange-50 border-2 border-[#FF6B35]'
                        : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={addr.id}
                      checked={selectedAddress === addr.id}
                      onChange={() => setSelectedAddress(addr.id)}
                      className="mt-1 w-5 h-5 text-[#FF6B35] focus:ring-[#FF6B35]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <i className={`${addr.icon} text-gray-500`}></i>
                        <span className="font-semibold text-gray-900">{addr.type}</span>
                        {addr.isDefault && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm">{addr.address}</p>
                      <p className="text-gray-500 text-sm">{addr.city} - {addr.pincode}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Add New Address */}
              {!showAddAddress ? (
                <button
                  onClick={() => setShowAddAddress(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-[#FF6B35] hover:text-[#FF6B35] transition-all flex items-center justify-center gap-2"
                >
                  <i className="fas fa-plus"></i>
                  Add New Address
                </button>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex gap-2 mb-3">
                    {['Home', 'Work', 'Other'].map((type) => (
                      <button
                        key={type}
                        onClick={() => setNewAddress({ ...newAddress, type })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          newAddress.type === type
                            ? 'bg-[#FF6B35] text-white'
                            : 'bg-white text-gray-600 border border-gray-200'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Full Address"
                    value={newAddress.address}
                    onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B35]"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="City"
                      value={newAddress.city}
                      onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                      className="px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B35]"
                    />
                    <input
                      type="text"
                      placeholder="Pincode"
                      value={newAddress.pincode}
                      onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value })}
                      className="px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B35]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowAddAddress(false)}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddNewAddress}
                      className="flex-1 py-2 bg-[#FF6B35] text-white rounded-lg font-medium"
                    >
                      Save Address
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="fas fa-receipt text-[#FF6B35]"></i>
                Order Summary
              </h2>
              
              {checkoutGroups.map((group) => (
                <div key={group.restaurantId} className="mb-4 pb-4 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                      <i className="fas fa-store text-[#FF6B35] text-sm"></i>
                    </div>
                    <span className="font-semibold text-gray-900">{group.restaurantName}</span>
                  </div>
                  
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 pl-10">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">{item.quantity}x</span>
                        <span className="text-gray-800">{item.name}</span>
                      </div>
                      <span className="font-medium text-gray-900">₹{item.price * item.quantity}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Payment Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Summary</h2>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>₹{checkoutTotal}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee ({checkoutGroups.length} restaurant{checkoutGroups.length > 1 ? 's' : ''})</span>
                  <span>₹{totalDeliveryFee}</span>
                </div>
                <div className="h-px bg-gray-200"></div>
                <div className="flex justify-between text-lg font-bold text-gray-900">
                  <span>Total</span>
                  <span>₹{grandTotal}</span>
                </div>
              </div>

              {/* User Info */}
              {user && (
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <i className="fas fa-user text-white"></i>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{user.name || 'User'}</p>
                      <p className="text-sm text-gray-500">+91 {user.phone}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleProceedToPayment}
                disabled={!selectedAddress}
                className={`w-full py-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  selectedAddress
                    ? 'bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white hover:shadow-lg'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                <i className="fas fa-credit-card"></i>
                Proceed to Payment
              </button>
              
              {!selectedAddress && (
                <p className="text-center text-sm text-red-500 mt-2">
                  Please select a delivery address
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
