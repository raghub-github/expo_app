'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import Link from 'next/link'
import AppDownloadModal from '@/components/common/AppDownloadModal'

export default function RideConfirmPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isAuthenticated } = useAppSelector(state => state.auth)
  
  const [bookingData, setBookingData] = useState<any>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)
  
  // Editable fields
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [originalPickup, setOriginalPickup] = useState('')
  const [originalDropoff, setOriginalDropoff] = useState('')
  const [isEditingPickup, setIsEditingPickup] = useState(false)
  const [isEditingDropoff, setIsEditingDropoff] = useState(false)
  const [showLocationChangeConfirm, setShowLocationChangeConfirm] = useState(false)
  const [pendingLocationChange, setPendingLocationChange] = useState<'pickup' | 'dropoff' | null>(null)

  useEffect(() => {
    // Get booking data from session
    const rideData = sessionStorage.getItem('rideBookingData')
    if (rideData) {
      try {
        const parsedData = JSON.parse(rideData)
        setBookingData(parsedData.bookingData)
        setPickup(parsedData.bookingData.pickupLocation.address)
        setDropoff(parsedData.bookingData.dropoffLocation.address)
        setOriginalPickup(parsedData.bookingData.pickupLocation.address)
        setOriginalDropoff(parsedData.bookingData.dropoffLocation.address)
      } catch (e) {
        console.error('Error parsing ride data:', e)
        router.push('/ride')
      }
    } else {
      router.push('/ride')
    }
    setIsLoading(false)
  }, [router])

  const handlePickupChange = () => {
    if (pickup !== originalPickup) {
      setPendingLocationChange('pickup')
      setShowLocationChangeConfirm(true)
    } else {
      setIsEditingPickup(false)
    }
  }

  const handleDropoffChange = () => {
    if (dropoff !== originalDropoff) {
      setPendingLocationChange('dropoff')
      setShowLocationChangeConfirm(true)
    } else {
      setIsEditingDropoff(false)
    }
  }

  const handleConfirmLocationChange = () => {
    setShowLocationChangeConfirm(false)
    setPendingLocationChange(null)
    if (pendingLocationChange === 'pickup') {
      setIsEditingPickup(false)
      setOriginalPickup(pickup)
    } else {
      setIsEditingDropoff(false)
      setOriginalDropoff(dropoff)
    }
  }

  const handleCancelLocationChange = () => {
    setShowLocationChangeConfirm(false)
    if (pendingLocationChange === 'pickup') {
      setPickup(originalPickup)
    } else {
      setDropoff(originalDropoff)
    }
    setPendingLocationChange(null)
  }

  const handleConfirmBooking = async () => {
    // Validation: Check if pickup and dropoff are properly entered
    if (!pickup || pickup.trim().length === 0) {
      alert('Please enter pickup location')
      return
    }
    if (!dropoff || dropoff.trim().length === 0) {
      alert('Please enter dropoff location')
      return
    }

    if (!bookingData || !user) return
    setShowAppDownloadModal(true)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#16c2a5] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading booking details...</p>
        </div>
      </div>
    )
  }

  if (bookingId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-check-circle text-green-500 text-4xl animate-bounce"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ride Confirmed! 🎉</h2>
          <p className="text-gray-600 mb-4">Your ride has been booked successfully</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase">Booking ID</p>
              <p className="font-bold text-gray-900">{bookingId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Vehicle</p>
              <p className="font-bold text-gray-900">{bookingData.vehicleName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Payment</p>
              <p className="font-bold text-gray-900">Pay ₹{bookingData.totalAmount} with {bookingData.paymentMethod === 'razorpay' ? 'Online' : 'Cash'}</p>
            </div>
          </div>

          <p className="text-sm text-gray-500 mb-4">Redirecting to your bookings...</p>
        </div>
      </div>
    )
  }

  if (!bookingData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No booking data found</p>
          <Link href="/ride" className="text-[#16c2a5] mt-4 inline-block hover:underline">
            Go back to ride selection
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link href="/ride/select" className="text-[#16c2a5] hover:text-[#14a892] flex items-center gap-2 mb-4">
            <i className="fas fa-arrow-left"></i>
            Back
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Confirm Your Ride</h1>
          <p className="text-gray-600 mt-2">Review and edit the details before confirming</p>
        </div>

        {/* Ride Details Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
          {/* Vehicle Info */}
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-blue-100 text-sm">Selected Vehicle</p>
                <h2 className="text-2xl font-bold">{bookingData.vehicleName}</h2>
              </div>
              <i className="fas fa-car text-5xl opacity-20"></i>
            </div>
          </div>

          {/* Editable Pickup & Dropoff */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">Trip Location</h3>
            <div className="space-y-4">
              {/* Pickup */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-4 h-4 rounded-full bg-green-500 mb-2"></div>
                  <div className="w-0.5 h-16 bg-gray-300"></div>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Pickup Location</p>
                  {isEditingPickup ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={pickup}
                        onChange={(e) => setPickup(e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-[#16c2a5] rounded-lg focus:outline-none"
                        placeholder="Enter pickup address"
                        autoFocus
                      />
                      <button
                        onClick={handlePickupChange}
                        className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      >
                        <i className="fas fa-check"></i>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                      <p className="text-gray-900 font-medium">{pickup}</p>
                      <button
                        onClick={() => setIsEditingPickup(true)}
                        className="text-[#16c2a5] hover:text-[#14a892] transition-colors"
                      >
                        <i className="fas fa-edit text-sm"></i>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Dropoff */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-4 h-4 rounded-full bg-red-500"></div>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Dropoff Location</p>
                  {isEditingDropoff ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={dropoff}
                        onChange={(e) => setDropoff(e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-[#16c2a5] rounded-lg focus:outline-none"
                        placeholder="Enter dropoff address"
                        autoFocus
                      />
                      <button
                        onClick={handleDropoffChange}
                        className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      >
                        <i className="fas fa-check"></i>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                      <p className="text-gray-900 font-medium">{dropoff}</p>
                      <button
                        onClick={() => setIsEditingDropoff(true)}
                        className="text-[#16c2a5] hover:text-[#14a892] transition-colors"
                      >
                        <i className="fas fa-edit text-sm"></i>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="p-6 bg-gray-50">
            <h3 className="font-bold text-gray-900 mb-4">Price Breakdown</h3>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Base Fare</span>
                <span>₹{bookingData.baseFare}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Distance ({bookingData.distanceKm} km)</span>
                <span>₹{bookingData.distanceFare}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Taxes & Fees</span>
                <span>₹{bookingData.taxes}</span>
              </div>
            </div>
            <div className="flex justify-between font-bold text-lg text-gray-900 pt-4 border-t border-gray-300">
              <span>Total Amount</span>
              <span className="text-[#16c2a5]">₹{bookingData.totalAmount}</span>
            </div>
          </div>

          {/* Estimated Info */}
          <div className="p-6 grid grid-cols-2 gap-4 border-t border-gray-200">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Estimated Time</p>
              <p className="text-lg font-bold text-gray-900">{bookingData.estimatedRideDuration}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Arrival Time</p>
              <p className="text-lg font-bold text-gray-900">{bookingData.estimatedArrivalTime}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleConfirmBooking}
            disabled={isConfirming || !pickup.trim() || !dropoff.trim()}
            className="w-full bg-[#16c2a5] text-white py-4 rounded-xl font-bold hover:bg-[#14a892] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Confirming...
              </span>
            ) : (
              'Continue in App'
            )}
          </button>
          <button
            onClick={() => router.back()}
            disabled={isConfirming}
            className="w-full text-gray-600 py-4 rounded-xl font-bold hover:bg-gray-100 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Location Change Confirmation Modal */}
      {showLocationChangeConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Change Location?</h2>
              <p className="text-gray-600 text-sm">
                You're switching from your original {pendingLocationChange === 'pickup' ? 'pickup' : 'dropoff'} location. Continue?
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-3 max-h-24 overflow-y-auto">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Original</p>
                <p className="text-gray-900 font-medium text-sm">
                  {pendingLocationChange === 'pickup' ? originalPickup : originalDropoff}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <i className="fas fa-arrow-down text-[#16c2a5]"></i>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">New</p>
                <p className="text-gray-900 font-medium text-sm">
                  {pendingLocationChange === 'pickup' ? pickup : dropoff}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelLocationChange}
                className="flex-1 px-4 py-3 text-gray-600 font-semibold rounded-xl border-2 border-gray-200 hover:bg-gray-50 transition-all"
              >
                Keep Original
              </button>
              <button
                onClick={handleConfirmLocationChange}
                className="flex-1 px-4 py-3 bg-[#16c2a5] text-white font-semibold rounded-xl hover:bg-[#14a892] transition-all"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}

      <AppDownloadModal
        isOpen={showAppDownloadModal}
        onClose={() => setShowAppDownloadModal(false)}
        description="Website ride booking is disabled. Please use the mobile app to confirm this ride."
      />
    </div>
  )
}
