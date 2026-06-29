'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import { setCurrentService } from '@/lib/slices/authSlice'
import AppDownloadModal from '@/components/common/AppDownloadModal'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'

// ============================================================================
// COMPONENT: Map Section (Left Column - Map Only)
// ============================================================================
function MapSection() {
  return (
    <div className="w-full h-full bg-[#0a0a14] relative overflow-hidden flex items-center justify-center">
      {/* Dark overlay for better contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a14] via-[#1a1a2e]/80 to-[#0a0a14]"></div>
      
      {/* Map with dark theme filter */}
      <iframe
        src={`https://www.google.com/maps/embed?pb=!1m10!1m8!1m3!1d3151.835434509374!2d144.95373!3d-37.81627!3m2!1i1024!2i768!4f13.1!3e0!3m2!1sen!2sau!4v1234567890`}
        width="100%"
        height="100%"
        style={{ 
          border: 0,
          filter: 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(1.1)'
        }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="w-full h-full relative z-10"
      ></iframe>
      
      {/* Dark corner accent */}
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-[#16c2a5]/10 to-transparent blur-3xl z-0"></div>
    </div>
  )
}

// ============================================================================
// COMPONENT: Vehicle Selection Section (Middle Column - Vehicles Only)
// ============================================================================
function VehicleSelectionSection({ 
  serviceCategories, 
  selectedVehicle, 
  onSelectVehicle, 
  calculatePrice 
}: any) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[#2a2a4e] bg-gradient-to-r from-[#16c2a5]/10 to-transparent">
        <h2 className="text-2xl font-bold text-white mb-1">Choose a ride</h2>
        <p className="text-[#b0b0d0] text-sm">Rides we think you'll like</p>
      </div>

      {/* Vehicles List - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {serviceCategories.map((vehicle: any) => {
            const totalPrice = calculatePrice(vehicle.basePrice, vehicle.pricePerKm)
            const discount = Math.round(totalPrice * 0.15)
            const originalPrice = Math.round(totalPrice / 0.85)
            const isSelected = selectedVehicle === vehicle.id
            
            return (
              <div
                key={vehicle.id}
                onClick={() => onSelectVehicle(vehicle.id)}
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all duration-300 ${
                  isSelected
                    ? 'border-[#16c2a5] bg-gradient-to-r from-[#16c2a5]/15 to-transparent shadow-lg shadow-[#16c2a5]/30'
                    : 'border-[#2a2a4e] hover:border-[#16c2a5]/50 bg-[#0f0f1e] hover:bg-[#0f0f1e]/80'
                }`}
              >
                <div className="flex gap-4">
                  {/* Vehicle Icon */}
                  <div className="flex-shrink-0">
                    <div 
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold shadow-md transition-all"
                      style={{ 
                        backgroundColor: isSelected ? `${vehicle.color}30` : `${vehicle.color}20`,
                      }}
                    >
                      {vehicle.icon}
                    </div>
                  </div>

                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-base">{vehicle.name}</h4>
                    <p className="text-xs text-[#b0b0d0]">{vehicle.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-xs text-[#7a7a9e] flex items-center gap-1">
                        <i className="fas fa-clock text-[#16c2a5]"></i>
                        {vehicle.estimatedAway}
                      </p>
                      <div className="w-0.5 h-3 bg-[#2a2a4e]"></div>
                      <p className="text-xs text-[#16c2a5] font-semibold flex items-center gap-1">
                        <i className="fas fa-users text-[#16c2a5]"></i>
                        {vehicle.capacity} {vehicle.capacity === 1 ? 'person' : 'people'}
                      </p>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-white">₹{totalPrice}</p>
                    <p className="text-xs text-[#7a7a9e] line-through">₹{originalPrice}</p>
                    <p className="text-xs text-[#16c2a5] font-semibold mt-1">Save ₹{discount}</p>
                  </div>
                </div>

                {/* Active Indicator */}
                {isSelected && (
                  <div className="mt-3 pt-3 border-t border-[#16c2a5]/30 flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#16c2a5] rounded-full animate-pulse"></div>
                    <span className="text-xs text-[#16c2a5] font-semibold">
                      <i className="fas fa-check-circle mr-1"></i>Selected
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT: Trip Details Section (Right Column - Editable Details + Actions)
// ============================================================================
function TripDetailsSection({
  selectedVehicle,
  serviceCategories,
  estimatedDistance,
  pickup,
  dropoff,
  editPickup,
  editDropoff,
  isEditingPickup,
  isEditingDropoff,
  onPickupEdit,
  onDropoffEdit,
  onPickupChange,
  onDropoffChange,
  paymentMethod,
  onPaymentChange,
  isLoading,
  onBookRide,
  calculatePrice
}: any) {
  const vehicle = selectedVehicle ? serviceCategories.find((v: any) => v.id === selectedVehicle) : null
  const totalPrice = vehicle ? calculatePrice(vehicle.basePrice, vehicle.pricePerKm) : 0

  return (
    <div className="flex flex-col h-full bg-[#1a1a2e] overflow-hidden">
      {/* Header - Trip Details Title */}
      <div className="p-4 bg-gradient-to-r from-[#16c2a5]/10 to-transparent border-b border-[#2a2a4e]">
        <h3 className="text-lg font-bold text-white mb-4">Trip Details</h3>
        
        <div className="space-y-3">
          {/* Pickup Location - Editable */}
          <div>
            <label className="text-xs text-[#b0b0d0] uppercase font-semibold mb-1.5 block tracking-wide">
              <i className="fas fa-location-dot mr-2 text-[#16c2a5]"></i>Pickup Location
            </label>
            {isEditingPickup ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editPickup}
                  onChange={(e) => onPickupEdit(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16c2a5] placeholder-gray-500 font-medium text-sm"
                  placeholder="Enter pickup address"
                  autoFocus
                />
                <button
                  onClick={onPickupChange}
                  className="px-3 py-2 bg-[#16c2a5] text-white rounded-lg hover:bg-[#14a892] transition-colors font-semibold text-sm"
                >
                  <i className="fas fa-check"></i>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-[#0f0f1e] p-3 rounded-lg border border-[#2a2a4e] hover:border-[#16c2a5]/50 transition-colors group">
                <p className="text-white font-medium truncate text-sm">{editPickup || 'Not specified'}</p>
                <button
                  onClick={() => onPickupEdit(editPickup)}
                  className="text-[#16c2a5] hover:text-[#14a892] transition-colors ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 text-xs"
                >
                  <i className="fas fa-pen-to-square"></i>
                </button>
              </div>
            )}
          </div>

          {/* Dropoff Location - Editable */}
          <div>
            <label className="text-xs text-[#b0b0d0] uppercase font-semibold mb-1.5 block tracking-wide">
              <i className="fas fa-map-pin mr-2 text-red-500"></i>Dropoff Location
            </label>
            {isEditingDropoff ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editDropoff}
                  onChange={(e) => onDropoffEdit(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16c2a5] placeholder-gray-500 font-medium text-sm"
                  placeholder="Enter dropoff address"
                  autoFocus
                />
                <button
                  onClick={onDropoffChange}
                  className="px-3 py-2 bg-[#16c2a5] text-white rounded-lg hover:bg-[#14a892] transition-colors font-semibold text-sm"
                >
                  <i className="fas fa-check"></i>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-[#0f0f1e] p-3 rounded-lg border border-[#2a2a4e] hover:border-[#16c2a5]/50 transition-colors group">
                <p className="text-white font-medium truncate text-sm">{editDropoff || 'Not specified'}</p>
                <button
                  onClick={() => onDropoffEdit(editDropoff)}
                  className="text-[#16c2a5] hover:text-[#14a892] transition-colors ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 text-xs"
                >
                  <i className="fas fa-pen-to-square"></i>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedVehicle && vehicle ? (
          <div className="space-y-3">
            {/* Selected Vehicle Card */}
            <div className="bg-[#0f0f1e] border border-[#2a2a4e] rounded-xl p-3 hover:border-[#16c2a5]/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold shadow-md"
                  style={{ backgroundColor: `${vehicle.color}25` }}
                >
                  {vehicle.icon}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">{vehicle.name}</h4>
                  <p className="text-[#b0b0d0] text-xs">{vehicle.description}</p>
                </div>
              </div>

              {/* Fare Summary Box */}
              <div className="bg-gradient-to-r from-[#16c2a5]/10 to-transparent border border-[#16c2a5]/30 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[#b0b0d0] text-xs">Fare</span>
                  <span className="font-bold text-white text-base">₹{totalPrice}</span>
                </div>
                <div className="border-t border-[#2a2a4e] pt-1.5">
                  <div className="flex items-center gap-1.5">
                    <i className="fas fa-tag text-[#16c2a5] text-xs"></i>
                    <span className="text-[#16c2a5] font-semibold text-xs">15% Discount</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Journey Information */}
            <div>
              <h4 className="font-bold text-white mb-2 text-xs flex items-center gap-2 uppercase tracking-wide">
                <i className="fas fa-map text-[#16c2a5] text-xs"></i>Journey Info
              </h4>
              <div className="space-y-2 text-xs bg-[#0f0f1e] rounded-lg p-3 border border-[#2a2a4e]">
                <div className="flex justify-between items-center pb-1.5 border-b border-[#2a2a4e]/50">
                  <span className="text-[#b0b0d0] flex items-center gap-1.5">
                    <i className="fas fa-road w-3 text-[#16c2a5]"></i>Distance
                  </span>
                  <span className="font-semibold text-white">~{estimatedDistance} km</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-[#2a2a4e]/50">
                  <span className="text-[#b0b0d0] flex items-center gap-1.5">
                    <i className="fas fa-hourglass-end w-3 text-[#16c2a5]"></i>Duration
                  </span>
                  <span className="font-semibold text-white">{Math.round(estimatedDistance * 3)} min</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#b0b0d0] flex items-center gap-1.5">
                    <i className="fas fa-car w-3 text-[#16c2a5]"></i>ETA
                  </span>
                  <span className="font-semibold text-white text-xs">{vehicle.estimatedTime}</span>
                </div>
              </div>
            </div>

            {/* Vehicle Features */}
            <div>
              <h4 className="font-bold text-white mb-2 text-xs flex items-center gap-2 uppercase tracking-wide">
                <i className="fas fa-star text-[#16c2a5] text-xs"></i>Features
              </h4>
              <div className="space-y-1">
                {vehicle.features.map((feature: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-[#b0b0d0] text-xs">
                    <div className="w-1.5 h-1.5 bg-[#16c2a5] rounded-full flex-shrink-0"></div>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <div className="text-5xl mb-2 opacity-20">🚗</div>
              <p className="text-[#b0b0d0] text-xs font-semibold">Select a vehicle</p>
              <p className="text-[#7a7a9e] text-xs mt-1">from the middle section to view trip details</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Payment & Book Button */}
      <div className="p-3 bg-[#0f0f1e] border-t border-[#2a2a4e] space-y-2">
        {/* Payment Method + Book Button - Same Row */}
        <div className="flex gap-2 items-end">
          {/* Payment Method Selector */}
          <div className="flex-1 min-w-0">
            <label className="text-xs text-[#b0b0d0] uppercase font-semibold mb-1 block tracking-wide">
              <i className="fas fa-wallet mr-1 text-[#16c2a5]"></i>Payment
            </label>
            <div className="relative">
              <select
                value={paymentMethod}
                onChange={(e) => onPaymentChange(e.target.value as 'cash' | 'online')}
                className="w-full px-3 py-2 bg-white text-gray-900 rounded-lg font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-[#16c2a5] appearance-none cursor-pointer border-2 border-transparent hover:border-gray-300 transition-colors"
              >
                <option value="cash">💵 Cash</option>
                <option value="online">💳 Online</option>
              </select>
              <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none text-xs"></i>
            </div>
          </div>

          {/* Book Ride Button */}
          <button
            onClick={() => selectedVehicle && onBookRide(selectedVehicle)}
            disabled={!selectedVehicle || isLoading}
            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all duration-300 flex items-center justify-center gap-1 flex-shrink-0 ${
              selectedVehicle && !isLoading
                ? 'bg-gradient-to-r from-[#16c2a5] to-[#14a892] text-white hover:shadow-lg hover:shadow-[#16c2a5]/50'
                : 'bg-[#2a2a4e] text-[#7a7a9e] cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner animate-spin text-xs"></i>
                <span className="hidden sm:inline">Booking</span>
              </>
            ) : (
              <>
                <i className="fas fa-check-circle text-xs"></i>
                <span className="hidden sm:inline">Book</span>
              </>
            )}
          </button>
        </div>

        {!selectedVehicle && (
          <p className="text-xs text-[#7a7a9e] text-center italic">
            Select vehicle first
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export default function RideSelectPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const searchParams = useSearchParams()
  const { user, isAuthenticated } = useAppSelector(state => state.auth)

  const pickup = searchParams.get('pickup') || ''
  const dropoff = searchParams.get('dropoff') || ''

  const [estimatedDistance] = useState(5) // Default 5km
  const [isLoading, setIsLoading] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('cash')

  // Editable trip details
  const [editPickup, setEditPickup] = useState(pickup)
  const [editDropoff, setEditDropoff] = useState(dropoff)
  const [originalPickup, setOriginalPickup] = useState(pickup)
  const [originalDropoff, setOriginalDropoff] = useState(dropoff)
  const [isEditingPickup, setIsEditingPickup] = useState(false)
  const [isEditingDropoff, setIsEditingDropoff] = useState(false)
  const [showLocationChangeConfirm, setShowLocationChangeConfirm] = useState(false)
  const [pendingLocationChange, setPendingLocationChange] = useState<'pickup' | 'dropoff' | null>(null)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)

  // Service Categories with pricing
  const serviceCategories = [
    {
      id: 'bike',
      name: 'Bike Ride',
      icon: '🏍️',
      description: 'Quick & affordable',
      basePrice: 20,
      pricePerKm: 8,
      estimatedTime: '5-10 min',
      estimatedAway: '2 mins away',
      capacity: 1,
      features: ['Quick pickup', 'Cost effective', 'One person'],
      color: '#3b82f6'
    },
    {
      id: 'auto',
      name: 'Auto Rickshaw',
      icon: '🛺',
      description: 'Comfortable for short trips',
      basePrice: 30,
      pricePerKm: 12,
      estimatedTime: '5-15 min',
      estimatedAway: '4 mins away',
      capacity: 3,
      features: ['AC available', 'Comfortable seating', 'Local routes'],
      color: '#10b981'
    },
    {
      id: 'cab-mini',
      name: 'Cab Mini',
      icon: '🚗',
      description: 'Compact & economical',
      basePrice: 50,
      pricePerKm: 14,
      estimatedTime: '5-10 min',
      estimatedAway: '3 mins away',
      capacity: 4,
      features: ['Air conditioned', 'Professional driver', 'Clean car'],
      color: '#f59e0b'
    },
    {
      id: 'cab-sedan',
      name: 'Cab Sedan',
      icon: '🚙',
      description: 'Premium comfort',
      basePrice: 80,
      pricePerKm: 18,
      estimatedTime: '5-10 min',
      estimatedAway: '6 mins away',
      capacity: 4,
      features: ['Premium experience', 'Rated drivers', 'Extra comfort'],
      color: '#8b5cf6'
    },
    {
      id: 'cab-suv',
      name: 'Cab SUV',
      icon: '🚐',
      description: 'Spacious for groups',
      basePrice: 120,
      pricePerKm: 22,
      estimatedTime: '8-15 min',
      estimatedAway: '8 mins away',
      capacity: 6,
      features: ['Extra spacious', 'Great for groups', 'Luggage friendly'],
      color: '#ef4444'
    }
  ]

  useEffect(() => {
    dispatch(setCurrentService('person'))
    setEditPickup(pickup)
    setEditDropoff(dropoff)
    setOriginalPickup(pickup)
    setOriginalDropoff(dropoff)
  }, [dispatch, pickup, dropoff])

  const handlePickupChange = () => {
    if (editPickup !== originalPickup) {
      setPendingLocationChange('pickup')
      setShowLocationChangeConfirm(true)
    } else {
      setIsEditingPickup(false)
    }
  }

  const handleDropoffChange = () => {
    if (editDropoff !== originalDropoff) {
      setPendingLocationChange('dropoff')
      setShowLocationChangeConfirm(true)
    } else {
      setIsEditingDropoff(false)
    }
  }

  const handleConfirmLocationChange = () => {
    setShowLocationChangeConfirm(false)
    if (pendingLocationChange === 'pickup') {
      setOriginalPickup(editPickup)
      setIsEditingPickup(false)
    } else {
      setOriginalDropoff(editDropoff)
      setIsEditingDropoff(false)
    }
    setPendingLocationChange(null)
  }

  const handleCancelLocationChange = () => {
    if (pendingLocationChange === 'pickup') {
      setEditPickup(originalPickup)
    } else {
      setEditDropoff(originalDropoff)
    }
    setShowLocationChangeConfirm(false)
    setPendingLocationChange(null)
  }

  const calculatePrice = (basePrice: number, pricePerKm: number) => {
    const baseFare = basePrice
    const distanceFare = pricePerKm * estimatedDistance
    const taxes = Math.round((baseFare + distanceFare) * 0.05)
    return baseFare + distanceFare + taxes
  }

  const handleBookRide = async (vehicleId: string) => {
    if (!vehicleId) return
    setShowAppDownloadModal(true)
  }

  return (
    <>
      <style>{`
        /* Custom Scrollbar Styling */
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(22, 194, 165, 0.4);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(22, 194, 165, 0.7);
        }
      `}</style>

      {/* Header */}
      <header className="bg-gradient-to-r from-[#0c0c1a] via-[#1a1a2e] to-[#0c0c1a] shadow-lg sticky top-0 z-[1000] border-b border-[#2a2a4e]">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/ride" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <GatiMitraLogo variant="icon" alt="GatiMitra" className="w-12 h-12 sm:w-14 sm:h-14 rounded-full" />
              <div className="flex items-center">
                <span className="text-2xl sm:text-3xl font-black text-[#16c2a5]">Gati</span>
                <span className="text-2xl sm:text-3xl font-black text-[#ff6b35]">Mitra</span>
              </div>
            </Link>

            {isAuthenticated && user && (
              <div className="text-[#16c2a5] font-semibold text-sm sm:text-base">
                <i className="fas fa-user-circle mr-2"></i>{user.name || user.phone}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main 3-Column Layout Container */}
      <div className="flex h-[calc(100vh-64px)] bg-gradient-to-br from-[#0c0c1a] via-[#1a1a3e] to-[#121230] overflow-hidden">
        
        {/* LEFT COLUMN: MAP ONLY (Hidden on tablets/mobile) */}
        <div className="hidden lg:flex lg:w-1/3 flex-shrink-0 bg-[#0f0f1e] border-r border-[#2a2a4e]">
          <MapSection />
        </div>

        {/* MIDDLE COLUMN: VEHICLE SELECTION (Full width on mobile, 1/3 on desktop) */}
        <div className="w-full lg:w-1/3 flex-shrink-0 bg-[#1a1a2e] border-r border-[#2a2a4e] flex flex-col">
          <VehicleSelectionSection
            serviceCategories={serviceCategories}
            selectedVehicle={selectedVehicle}
            onSelectVehicle={setSelectedVehicle}
            calculatePrice={calculatePrice}
          />
        </div>

        {/* RIGHT COLUMN: TRIP DETAILS (Hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/3 flex-shrink-0 bg-[#1a1a2e] flex flex-col">
          <TripDetailsSection
            selectedVehicle={selectedVehicle}
            serviceCategories={serviceCategories}
            estimatedDistance={estimatedDistance}
            pickup={pickup}
            dropoff={dropoff}
            editPickup={editPickup}
            editDropoff={editDropoff}
            isEditingPickup={isEditingPickup}
            isEditingDropoff={isEditingDropoff}
            onPickupEdit={setEditPickup}
            onDropoffEdit={setEditDropoff}
            onPickupChange={handlePickupChange}
            onDropoffChange={handleDropoffChange}
            paymentMethod={paymentMethod}
            onPaymentChange={setPaymentMethod}
            isLoading={isLoading}
            onBookRide={handleBookRide}
            calculatePrice={calculatePrice}
          />
        </div>
      </div>

      {/* Location Change Confirmation Modal */}
      {showLocationChangeConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              <i className="fas fa-map-pin mr-2 text-[#16c2a5]"></i>Change Location?
            </h2>
            <p className="text-gray-600 mb-6 text-sm">
              {pendingLocationChange === 'pickup' 
                ? `You've selected a different pickup location from your original choice.`
                : `You've selected a different dropoff location from your original choice.`
              }
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-700">
                <i className="fas fa-info-circle mr-2"></i>
                Do you want to continue with the new location?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelLocationChange}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLocationChange}
                className="flex-1 px-4 py-3 bg-[#16c2a5] text-white rounded-lg hover:bg-[#14a892] transition-colors font-semibold"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <AppDownloadModal
        isOpen={showAppDownloadModal}
        onClose={() => setShowAppDownloadModal(false)}
        description="Ride booking is not available on website right now. Please download the app to continue."
      />
    </>
  )
}
