'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCart } from '@/lib/hooks/useCart'
import { useAppSelector } from '@/lib/hooks'
import { RazorpayPayment } from '@/components/payment/RazorpayPayment'

interface CheckoutData {
  restaurantIds?: string[]
  addressId?: string
  addressData?: {
    address: string
    city: string
    pincode: string
    type: string
  } | null
  subtotal?: number
  deliveryFee?: number
  total: number
}

export default function PaymentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, user } = useAppSelector(state => state.auth)
  const { getItemsGroupedByRestaurant, clearCartItems } = useCart()
  
  const serviceType = searchParams.get('service') || 'food' // food, person, or parcel
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null)
  const [createdOrderId, setCreatedOrderId] = useState<string>('')
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle')
  const [bookingData, setBookingData] = useState<any>(null)

  // Get checkout data from session storage based on service type
  useEffect(() => {
    let stored = null
    let data = null

    if (serviceType === 'food') {
      stored = sessionStorage.getItem('checkoutData')
      if (stored) {
        data = JSON.parse(stored)
        setCheckoutData(data)
      }
    } else if (serviceType === 'person') {
      stored = sessionStorage.getItem('rideBookingData')
      if (stored) {
        data = JSON.parse(stored)
        setCheckoutData({ total: data.totalAmount })
        setBookingData(data.bookingData)
      }
    } else if (serviceType === 'parcel') {
      stored = sessionStorage.getItem('parcelBookingData')
      if (stored) {
        data = JSON.parse(stored)
        setCheckoutData({ total: data.totalAmount })
        setBookingData(data.parcelData)
      }
    }

    if (!stored) {
      // No booking data, redirect back
      if (serviceType === 'food') {
        router.push('/cart')
      } else if (serviceType === 'person') {
        router.push('/ride')
      } else if (serviceType === 'parcel') {
        router.push('/parcel')
      }
    }
  }, [router, serviceType])

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/register')
    }
  }, [isAuthenticated, router])

  // Create order first, then show Razorpay

  const handleCreateOrder = async () => {
    if (!checkoutData || !user) return
    
    try {
      setPaymentStatus('processing')

      let firstOrderId = ''

      if (serviceType === 'food') {
        // Food service
        const allGroups = getItemsGroupedByRestaurant()
        const orderedGroups = allGroups.filter(g => checkoutData.restaurantIds?.includes(g.restaurantId))
        
        if (orderedGroups.length === 0) {
          console.error('No restaurants found for checkout')
          setPaymentStatus('failed')
          return
        }

        for (const group of orderedGroups) {
          const subtotal = group.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
          const deliveryFee = 40
          const taxes = Math.round(subtotal * 0.05)
          const totalAmount = subtotal + deliveryFee + taxes
          
          const orderData = {
            userId: user.user_id || user.id,
            userName: user.name || 'User',
            userPhone: user.phone,
            userEmail: user.email || '',
            restaurantId: group.restaurantId,
            restaurantName: group.restaurantName,
            restaurantImage: group.items[0]?.image || '/img/default-restaurant.png',
            items: group.items.map(item => ({
              id: item.id,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              image: item.image,
            })),
            subtotal: subtotal,
            deliveryFee: deliveryFee,
            taxes: taxes,
            totalAmount: totalAmount,
            deliveryAddress: checkoutData.addressData || {
              address: 'Default Address',
              city: 'Mumbai',
              pincode: '400001',
            },
            paymentMethod: 'razorpay',
          }
          
          const response = await fetch('/api/orders/food', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderData),
          })
          
          const result = await response.json()
          
          if (!response.ok || !result.success) {
            console.error('Failed to create order:', result)
            setPaymentStatus('failed')
            return
          }
          
          if (!firstOrderId && result.order) {
            firstOrderId = result.order.order_number
          }
        }
      } else if (serviceType === 'person' && bookingData) {
        // Ride service
        console.log('Creating ride booking with data:', bookingData)
        const response = await fetch('/api/orders/person', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bookingData),
        })

        const result = await response.json()
        console.log('Ride booking response:', result)

        if (!response.ok || !result.success) {
          console.error('Failed to create ride booking:', result)
          setPaymentStatus('failed')
          return
        }

        if (result.booking) {
          console.log('Booking object:', result.booking)
          // Use booking_number or id
          const bookingId = result.booking.booking_number || result.booking.id
          console.log('Using booking ID:', bookingId)
          firstOrderId = bookingId
        }
      } else if (serviceType === 'parcel' && bookingData) {
        // Parcel service
        console.log('Creating parcel order with data:', bookingData)
        const response = await fetch('/api/orders/parcel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bookingData),
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          console.error('Failed to create parcel order:', result)
          setPaymentStatus('failed')
          return
        }

        if (result.order) {
          console.log('Parcel order object:', result.order)
          const parcelId = result.order.tracking_number || result.order.id
          console.log('Using parcel ID:', parcelId)
          firstOrderId = parcelId
        }
      }

      if (firstOrderId) {
        console.log('Order ID ready for payment:', firstOrderId)
        setCreatedOrderId(firstOrderId)
        setPaymentStatus('idle')
      } else {
        console.error('Failed to get order ID')
        setPaymentStatus('failed')
      }
    } catch (error) {
      console.error('Error creating order:', error)
      setPaymentStatus('failed')
    }
  }

  const handlePaymentSuccess = async () => {
    try {
      // Clear the ordered items from cart (food only)
      if (serviceType === 'food') {
        clearCartItems(checkoutData?.restaurantIds || [])
      }
      
      // Clear session storage based on service type
      sessionStorage.removeItem('checkoutData')
      sessionStorage.removeItem('checkoutRestaurants')
      sessionStorage.removeItem('rideBookingData')
      sessionStorage.removeItem('parcelBookingData')
      
      // Store success data for orders page
      sessionStorage.setItem('orderSuccess', JSON.stringify({
        orderIds: [createdOrderId],
        total: checkoutData?.total,
      }))
      
      // Store last active service and determine redirect URL
      let redirectUrl = '/orders?filter=food&from=%2Forder'
      
      if (serviceType === 'person') {
        sessionStorage.setItem('lastActiveService', 'person')
        redirectUrl = '/orders?filter=person&from=%2Fride'
      } else if (serviceType === 'parcel') {
        sessionStorage.setItem('lastActiveService', 'parcel')
        redirectUrl = '/orders?filter=parcel&from=%2Fparcel'
      } else {
        sessionStorage.setItem('lastActiveService', 'food')
      }
      
      setPaymentStatus('success')
      
      // Redirect to orders page after 2 seconds
      setTimeout(() => {
        router.push(redirectUrl)
      }, 2000)
    } catch (error) {
      console.error('Error handling payment success:', error)
      setPaymentStatus('failed')
    }
  }

  const handlePaymentFailure = () => {
    setPaymentStatus('failed')
  }

  if (!checkoutData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B35]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-6 py-5">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => {
              if (serviceType === 'food') {
                router.push('/checkout')
              } else if (serviceType === 'person') {
                router.push('/ride')
              } else if (serviceType === 'parcel') {
                router.push('/parcel')
              }
            }}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg font-semibold text-sm text-gray-700 hover:bg-gray-100 shadow-sm border border-gray-200 mb-4"
          >
            <i className="fas fa-arrow-left"></i>
            Back
          </button>
          
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">
                <i className="fas fa-check text-xs"></i>
              </div>
              <span className="text-sm font-medium text-green-600">Cart</span>
            </div>
            <div className="w-12 h-0.5 bg-green-500"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">
                <i className="fas fa-check text-xs"></i>
              </div>
              <span className="text-sm font-medium text-green-600">Checkout</span>
            </div>
            <div className="w-12 h-0.5 bg-[#FF6B35]"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#FF6B35] text-white flex items-center justify-center text-sm font-bold">
                3
              </div>
              <span className="text-sm font-medium text-[#FF6B35]">Payment</span>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 text-center">Payment</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Razorpay Payment */}
          <div className="lg:col-span-2 space-y-6">
            {paymentStatus === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className="fas fa-exclamation-circle text-red-600"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-red-900">Payment Failed</p>
                    <p className="text-sm text-red-700 mt-1">
                      There was an issue creating your order. Please try again or contact support.
                    </p>
                    <button
                      onClick={() => setPaymentStatus('idle')}
                      className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            )}
            {paymentStatus === 'success' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className="fas fa-check-circle text-green-600"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-green-900">Payment Successful!</p>
                    <p className="text-sm text-green-700 mt-1">
                      Your order has been placed. Redirecting to orders page...
                    </p>
                  </div>
                </div>
              </div>
            )}
            {!createdOrderId && paymentStatus !== 'success' ? (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="fas fa-wallet text-[#FF6B35]"></i>
                  Payment Method
                </h2>
                
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="fas fa-info text-blue-600 text-sm"></i>
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900">Razorpay Secure Payment</p>
                      <p className="text-sm text-blue-700 mt-1">
                        Pay securely via UPI, Cards, Net Banking, or Wallets
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-orange-50 border-2 border-[#FF6B35]">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                      <i className="fas fa-shield-alt text-[#FF6B35] text-xl"></i>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">Razorpay</p>
                      <p className="text-sm text-gray-600">Secure payment gateway - UPI, Cards, Wallets, Net Banking</p>
                    </div>
                    <div className="w-5 h-5 rounded-full bg-[#FF6B35] flex items-center justify-center">
                      <i className="fas fa-check text-white text-xs"></i>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCreateOrder}
                  disabled={paymentStatus === 'processing'}
                  className={`w-full py-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    paymentStatus === 'processing'
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:shadow-lg'
                  }`}
                >
                  {paymentStatus === 'processing' ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Creating Order...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-credit-card"></i>
                      Pay ₹{checkoutData?.total}
                    </>
                  )}
                </button>
              </div>
            ) : createdOrderId && paymentStatus !== 'success' ? (
              <RazorpayPayment
                amount={checkoutData?.total || 0}
                orderId={createdOrderId}
                serviceType={serviceType as 'food' | 'person' | 'parcel'}
                userEmail={user?.email || ''}
                userName={user?.name || 'User'}
                onPaymentSuccess={handlePaymentSuccess}
                onPaymentFailure={handlePaymentFailure}
              />
            ) : null}


            {/* Security Badge */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <i className="fas fa-shield-alt text-green-600"></i>
              </div>
              <div>
                <p className="font-semibold text-green-800">100% Secure Payment</p>
                <p className="text-sm text-green-600">Your payment information is encrypted and secure</p>
              </div>
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>
              
              <div className="space-y-3 mb-6">
                {checkoutData?.subtotal !== undefined && (
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>₹{checkoutData.subtotal}</span>
                  </div>
                )}
                {checkoutData?.deliveryFee !== undefined && (
                  <div className="flex justify-between text-gray-600">
                    <span>Delivery Fee</span>
                    <span>₹{checkoutData.deliveryFee}</span>
                  </div>
                )}
                {(checkoutData?.subtotal !== undefined || checkoutData?.deliveryFee !== undefined) && (
                  <div className="h-px bg-gray-200"></div>
                )}
                <div className="flex justify-between text-lg font-bold text-gray-900">
                  <span>Total</span>
                  <span>₹{checkoutData?.total}</span>
                </div>
              </div>

              <p className="text-center text-xs text-gray-500 mt-3">
                By proceeding, you agree to our Terms of Service
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
