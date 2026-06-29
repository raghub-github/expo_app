'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import AppDownloadModal from '@/components/common/AppDownloadModal'
import { useLocationContext } from '@/components/providers/LocationProvider'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import Footer from '@/components/layout/Footer'
import { ServiceCategory, setCurrentService } from '@/lib/slices/authSlice'

// Service Categories for Person/Ride
const serviceCategories = [
  {
    id: 'bike',
    name: 'Bike Ride',
    icon: '🏍️',
    image: '/img/bikeride.png',
    description: 'Quick & affordable',
    basePrice: 20,
    pricePerKm: 8,
    estimatedTime: '5-10 min',
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'auto',
    name: 'Auto Rickshaw',
    icon: '🛺',
    image: '/img/auto.png',
    description: 'Comfortable for short trips',
    basePrice: 30,
    pricePerKm: 12,
    estimatedTime: '5-15 min',
    color: 'from-green-500 to-emerald-500'
  },
  {
    id: 'cab-mini',
    name: 'Cab Mini',
    icon: '🚗',
    image: '/img/cabmini.png',
    description: 'Compact & economical',
    basePrice: 50,
    pricePerKm: 14,
    estimatedTime: '5-10 min',
    color: 'from-yellow-500 to-orange-500'
  },
  {
    id: 'cab-sedan',
    name: 'Cab Sedan',
    icon: '🚙',
    image: '/img/cabsedan.png',
    description: 'Premium comfort',
    basePrice: 80,
    pricePerKm: 18,
    estimatedTime: '5-10 min',
    color: 'from-purple-500 to-pink-500'
  },
  {
    id: 'cab-suv',
    name: 'Cab SUV',
    icon: '🚐',
    image: '/img/cabsuv.png',
    description: 'Spacious for groups',
    basePrice: 120,
    pricePerKm: 22,
    estimatedTime: '8-15 min',
    color: 'from-red-500 to-rose-500'
  },
  {
    id: 'rental',
    name: 'Hourly Rental',
    icon: '⏰',
    image: '/img/rental.png',
    description: 'Flexible hourly booking',
    basePrice: 200,
    pricePerKm: 0,
    estimatedTime: '10-20 min',
    color: 'from-indigo-500 to-violet-500'
  }
]

// Popular Destinations
const popularDestinations = [
  { id: 1, name: 'Airport', icon: '✈️', distance: '25 km' },
  { id: 2, name: 'Railway Station', icon: '🚂', distance: '8 km' },
  { id: 3, name: 'Bus Stand', icon: '🚌', distance: '5 km' },
  { id: 4, name: 'Hospital', icon: '🏥', distance: '3 km' },
  { id: 5, name: 'Mall', icon: '🛒', distance: '6 km' },
  { id: 6, name: 'Office Hub', icon: '🏢', distance: '10 km' },
]

interface BookingDetails {
  vehicleType: string
  pickup: string
  dropoff: string
  distance: number
  estimatedPrice: number
  estimatedTime: string
  scheduledTime?: string
}

export default function PersonServicePage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user, isAuthenticated, currentService } = useAppSelector(state => state.auth)
  const { location, setLocation: setGlobalLocation, hydrated } = useLocationContext()
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('person')
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [hasCheckedService, setHasCheckedService] = useState(false)
  
  // Location states
  const [isDetecting, setIsDetecting] = useState(true)
  const [pickup, setPickup] = useState('')
  const [hasUserEditedPickup, setHasUserEditedPickup] = useState(false)
  const [dropoff, setDropoff] = useState('')
  
  // Booking states
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [estimatedDistance, setEstimatedDistance] = useState(5) // Default 5km
  const [isBooking, setIsBooking] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null)
  
  // Scroll ref for categories
  const categoriesRef = useRef<HTMLDivElement>(null)

  // Set current service to 'person' when on page
  useEffect(() => {
    if (isAuthenticated && user && !hasCheckedService) {
      if (currentService !== 'person') {
        setTargetService('person')
        setShowSwitchModal(true)
      } else {
        dispatch(setCurrentService('person'))
      }
      setHasCheckedService(true)
    }
  }, [isAuthenticated, user, dispatch, currentService, hasCheckedService])

  // Keep ride pickup synced with globally selected location.
  useEffect(() => {
    if (!hydrated) return
    if (location.displayName && !hasUserEditedPickup) {
      setPickup(location.displayName)
      setIsDetecting(false)
    }
  }, [hydrated, location.displayName, hasUserEditedPickup])

  const detectLocation = () => {
    setIsDetecting(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords
            const response = await fetch(`/api/locations/reverse-geocode?lat=${latitude}&lon=${longitude}`)
            const data = await response.json()
            const detectedLocation = typeof data?.displayName === 'string' && data.displayName.trim() !== ''
              ? data.displayName
              : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
            setPickup(detectedLocation)
            setHasUserEditedPickup(false)
            setGlobalLocation(detectedLocation, latitude, longitude, { userInitiated: true })
            setIsDetecting(false)
          } catch {
            const fallback = location.displayName || 'India'
            setPickup(fallback)
            setHasUserEditedPickup(false)
            setIsDetecting(false)
          }
        },
        () => {
          const fallback = location.displayName || 'India'
          setPickup(fallback)
          setHasUserEditedPickup(false)
          setIsDetecting(false)
        }
      )
    } else {
      setPickup(location.displayName || 'India')
      setHasUserEditedPickup(false)
      setIsDetecting(false)
    }
  }

  // Handle navigation with service switch
  const handleNavigation = async (path: string, service: ServiceCategory) => {
    if (!isAuthenticated || !user) {
      router.push(path)
      return
    }

    if (service === currentService) {
      router.push(path)
    } else {
      setTargetService(service)
      setPendingNavigation(path)
      setShowSwitchModal(true)
    }
  }

  const handleSwitchComplete = () => {
    setShowSwitchModal(false)
    if (pendingNavigation) {
      router.push(pendingNavigation)
      setPendingNavigation(null)
    }
  }

  // Calculate estimated price
  const calculatePrice = (vehicleId: string, distance: number) => {
    const vehicle = serviceCategories.find(v => v.id === vehicleId)
    if (!vehicle) return 0
    return vehicle.basePrice + (vehicle.pricePerKm * distance)
  }

  // Handle vehicle selection
  const handleVehicleSelect = (vehicleId: string) => {
    setSelectedVehicle(vehicleId)
    if (pickup && dropoff) {
      setShowBookingModal(true)
    }
  }

  // Handle booking
  const handleBookRide = async (scheduled?: boolean) => {
    if (!pickup || !dropoff || !selectedVehicle) return
    setShowBookingModal(false)
    setShowScheduleModal(false)
    setShowAppDownloadModal(true)
    void scheduled
  }

  // Scroll categories
  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoriesRef.current) {
      const scrollAmount = 300
      categoriesRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  return (
    <>
      {/* Header */}
      <header className="bg-gradient-to-br from-[#0c0c1a] to-[#121230] shadow-lg sticky top-0 z-[1000] border-b border-[#16c2a5]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-3">
              <GatiMitraLogo variant="icon" alt="GatiMitra" className="w-12 h-12 sm:w-14 sm:h-14" />
              <div className="flex items-center">
                <span className="text-2xl sm:text-3xl font-black text-[#16c2a5]">Gati</span>
                <span className="text-2xl sm:text-3xl font-black text-[#ff6b35]">Mitra</span>
              </div>
            </Link>
            
            <nav className="flex gap-4 sm:gap-8">
              <button 
                onClick={() => handleNavigation('/courier', 'parcel')}
                className="text-[#b0b0d0] font-medium transition-colors hover:text-[#16c2a5] text-sm sm:text-base"
              >
                Parcel
              </button>
              <span className="text-[#16c2a5] font-medium border-b-2 border-[#16c2a5] pb-1 text-sm sm:text-base">Ride</span>
              <button 
                onClick={() => handleNavigation('/order', 'food')}
                className="text-[#b0b0d0] font-medium transition-colors hover:text-[#16c2a5] text-sm sm:text-base"
              >
                Food
              </button>
            </nav>

            {isAuthenticated && user ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="text-[#16c2a5] font-semibold text-sm sm:text-base truncate max-w-[100px] sm:max-w-none hover:text-white px-3 py-1.5 rounded-full transition-colors"
                >
                  {user.name || user.phone}
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsAuthModalOpen(true)
                }}
                className="bg-gradient-to-r from-[#16c2a5] to-[#4b2ad4] text-white px-4 sm:px-6 py-2 rounded-full font-semibold text-sm sm:text-base hover:from-[#4b2ad4] hover:to-[#16c2a5] transition-all z-50"
                type="button"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section with Image and Form */}
      <section className="bg-gradient-to-br from-[#0c0c1a] via-[#1a1a3e] to-[#121230] h-screen flex items-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute top-10 right-10 w-40 h-40 bg-[#16c2a5]/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-10 w-32 h-32 bg-[#4b2ad4]/10 rounded-full blur-3xl"></div>
        <div className="max-w-7xl mx-auto w-full relative z-10 pr-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Side - Image */}
            <div className="order-2 lg:order-1 flex justify-center pl-4 lg:pl-0">
              <div className="w-full h-[350px] sm:h-[420px] lg:h-[500px] relative rounded-2xl overflow-hidden shadow-2xl border border-[#16c2a5]/20">
                <Image
                  src="/img/ride.png"
                  alt="Ride with GatiMitra"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>

            {/* Right Side - Booking Form */}
            <div className="order-1 lg:order-2">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-2">
                Request a ride for <br /> now or later
              </h1>
              
              <p className="text-[#b0b0d0] text-sm mb-6 flex items-center gap-2">
                <i className="fas fa-map-pin text-[#16c2a5]"></i>
                <span>IN</span>
                <button className="text-[#16c2a5] hover:underline font-medium">Change city</button>
              </p>

              <p className="text-[#16c2a5] text-sm font-medium mb-8">
                <i className="fas fa-tag mr-2"></i>
                Up to 50% off your first 5 rides. T&Cs apply.* <br/>
                <span className="text-xs text-[#b0b0d0]">*Valid within 15 days of signup.</span>
              </p>

              {/* Location Input Card */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 space-y-4 border border-white/10">
                {/* Pickup */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#16c2a5] rounded-full"></div>
                  <input
                    type="text"
                    value={pickup}
                    onChange={(e) => {
                      setPickup(e.target.value)
                      setHasUserEditedPickup(true)
                    }}
                    placeholder="Pickup location"
                    className="w-full pl-10 pr-12 py-4 bg-white/5 border border-white/10 rounded-lg text-white placeholder-[#b0b0d0] text-base focus:outline-none focus:ring-2 focus:ring-[#16c2a5]/50 focus:border-transparent transition-all"
                  />
                  <button 
                    onClick={detectLocation}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0b0d0] hover:text-[#16c2a5] transition-colors"
                    title="Use current location"
                  >
                    <i className={`fas fa-arrow-right text-lg ${isDetecting ? 'animate-spin' : ''}`}></i>
                  </button>
                </div>

                {/* Dropoff */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full"></div>
                  <input
                    type="text"
                    value={dropoff}
                    onChange={(e) => setDropoff(e.target.value)}
                    placeholder="Dropoff location"
                    className="w-full pl-10 pr-4 py-4 bg-white/5 border border-white/10 rounded-lg text-white placeholder-[#b0b0d0] text-base focus:outline-none focus:ring-2 focus:ring-[#16c2a5]/50 focus:border-transparent transition-all"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      if (pickup && dropoff) {
                        setShowAppDownloadModal(true)
                      }
                    }}
                    disabled={!pickup || !dropoff}
                    className="flex-1 bg-gradient-to-r from-[#16c2a5] to-[#4b2ad4] text-white py-4 rounded-lg font-bold text-base hover:from-[#4b2ad4] hover:to-[#16c2a5] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Get Fare in App
                  </button>
                  <button
                    onClick={() => setShowAppDownloadModal(true)}
                    className="px-6 py-4 border border-white/20 text-white rounded-lg font-semibold hover:border-[#16c2a5] hover:bg-white/5 transition-all"
                  >
                    Schedule in App
                  </button>
                </div>
                <p className="text-xs text-[#b0b0d0] text-center">
                  Ride booking is available only on the GatiMitra mobile app.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Suggestions Section */}
      <section className="bg-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">Explore Our Ride Services</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Choose the ride that fits your journey — comfort, speed, or flexibility.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Ride Card */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Ride</h3>
                  <p className="text-sm font-semibold text-[#16c2a5]">Quick City Rides</p>
                </div>
                <img src="/img/ride1.png" alt="Ride" className="w-16 h-16 object-contain flex-shrink-0 ml-2" />
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Move across the city effortlessly with reliable rides, instant pickup, and smooth travel powered by GatiMitra.
              </p>
              <button className="text-[#16c2a5] font-semibold hover:underline flex items-center gap-2 group/btn">
                Learn more
                <i className="fas fa-arrow-right text-xs group-hover/btn:translate-x-1 transition-transform"></i>
              </button>
            </div>

            {/* Reserve Card */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Reserve</h3>
                  <p className="text-sm font-semibold text-[#16c2a5]">Plan Ahead</p>
                </div>
                <img src="/img/reserve.png" alt="Reserve" className="w-16 h-16 object-contain flex-shrink-0 ml-2" />
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Schedule your ride in advance and enjoy a stress-free journey exactly when you need it.
              </p>
              <button className="text-[#16c2a5] font-semibold hover:underline flex items-center gap-2 group/btn">
                Learn more
                <i className="fas fa-arrow-right text-xs group-hover/btn:translate-x-1 transition-transform"></i>
              </button>
            </div>

            {/* Intercity Card */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Intercity</h3>
                  <p className="text-sm font-semibold text-[#16c2a5]">Outstation Travel</p>
                </div>
                <img src="/img/intercity.png" alt="Intercity" className="w-16 h-16 object-contain flex-shrink-0 ml-2" />
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Travel between cities with comfortable, affordable cabs designed for long-distance journeys.
              </p>
              <button className="text-[#16c2a5] font-semibold hover:underline flex items-center gap-2 group/btn">
                Learn more
                <i className="fas fa-arrow-right text-xs group-hover/btn:translate-x-1 transition-transform"></i>
              </button>
            </div>

            {/* Rentals Card */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Rentals</h3>
                  <p className="text-sm font-semibold text-[#16c2a5]">Hourly & Multi-Stop Trips</p>
                </div>
                <img src="/img/rentals.png" alt="Rentals" className="w-16 h-16 object-contain flex-shrink-0 ml-2" />
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Book a vehicle for flexible durations and multiple stops — perfect for meetings, shopping, or day-long plans.
              </p>
              <button className="text-[#16c2a5] font-semibold hover:underline flex items-center gap-2 group/btn">
                Learn more
                <i className="fas fa-arrow-right text-xs group-hover/btn:translate-x-1 transition-transform"></i>
              </button>
            </div>

            {/* Bike Card */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Bike</h3>
                  <p className="text-sm font-semibold text-[#16c2a5]">Fast Bike Rides</p>
                </div>
                <img src="/img/bike.png" alt="Bike" className="w-16 h-16 object-contain flex-shrink-0 ml-2" />
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Beat traffic with affordable bike rides that get you to your destination faster.
              </p>
              <button className="text-[#16c2a5] font-semibold hover:underline flex items-center gap-2 group/btn">
                Learn more
                <i className="fas fa-arrow-right text-xs group-hover/btn:translate-x-1 transition-transform"></i>
              </button>
            </div>

            {/* Plus Card */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Plus</h3>
                  <p className="text-sm font-semibold text-[#16c2a5]">Premium Experience</p>
                </div>
                <img src="/img/plus.png" alt="Plus" className="w-16 h-16 object-contain flex-shrink-0 ml-2" />
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Enjoy top-tier rides with professional drivers, priority support, and added comfort.
              </p>
              <button className="text-[#16c2a5] font-semibold hover:underline flex items-center gap-2 group/btn">
                Learn more
                <i className="fas fa-arrow-right text-xs group-hover/btn:translate-x-1 transition-transform"></i>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Destinations - Hidden */}
      <section className="hidden">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Popular Destinations</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4">
            {popularDestinations.map((dest) => (
              <button
                key={dest.id}
                onClick={() => setDropoff(dest.name)}
                className="bg-gray-50 hover:bg-[#00B4D8]/10 border border-gray-200 hover:border-[#00B4D8] rounded-xl p-3 sm:p-4 text-center transition-all group"
              >
                <span className="text-2xl sm:text-3xl mb-2 block">{dest.icon}</span>
                <p className="font-semibold text-gray-800 text-sm sm:text-base group-hover:text-[#00B4D8]">{dest.name}</p>
                <p className="text-xs text-gray-500">{dest.distance}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Vehicle Categories - Hidden */}
      <section id="vehicles-section" className="hidden py-8 sm:py-12 px-4 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Choose Your Ride</h2>
            <div className="flex gap-2">
              <button
                onClick={() => scrollCategories('left')}
                className="bg-white shadow-md hover:shadow-lg w-10 h-10 rounded-full flex items-center justify-center transition-all"
              >
                <i className="fas fa-chevron-left text-gray-600"></i>
              </button>
              <button
                onClick={() => scrollCategories('right')}
                className="bg-white shadow-md hover:shadow-lg w-10 h-10 rounded-full flex items-center justify-center transition-all"
              >
                <i className="fas fa-chevron-right text-gray-600"></i>
              </button>
            </div>
          </div>

          <div 
            ref={categoriesRef}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {serviceCategories.map((vehicle) => (
              <div
                key={vehicle.id}
                onClick={() => handleVehicleSelect(vehicle.id)}
                className={`flex-shrink-0 w-[160px] sm:w-[200px] bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer snap-start ${
                  selectedVehicle === vehicle.id ? 'ring-2 ring-[#00B4D8] scale-105' : ''
                }`}
              >
                <div className={`bg-gradient-to-br ${vehicle.color} p-4 rounded-t-2xl`}>
                  <div className="text-4xl sm:text-5xl text-center">{vehicle.icon}</div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">{vehicle.name}</h3>
                  <p className="text-xs text-gray-500 mb-2">{vehicle.description}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-[#00B4D8] font-bold">₹{vehicle.basePrice}+</span>
                    <span className="text-xs text-gray-400">{vehicle.estimatedTime}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety Features */}
      <section className="py-8 sm:py-12 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 text-center">Your Safety, Our Priority</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: 'fa-shield-alt', title: 'Verified Drivers', desc: 'Background checked' },
              { icon: 'fa-route', title: 'Live Tracking', desc: 'Real-time GPS' },
              { icon: 'fa-phone-alt', title: 'SOS Button', desc: 'Emergency help' },
              { icon: 'fa-star', title: 'Rated Rides', desc: 'Quality assured' },
            ].map((feature, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-5 shadow-md text-center hover:shadow-lg transition-all">
                <div className="w-14 h-14 bg-[#00B4D8]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className={`fas ${feature.icon} text-[#00B4D8] text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900">{feature.title}</h3>
                <p className="text-sm text-gray-500">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Confirmation Modal */}
      {showBookingModal && selectedVehicle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Confirm Booking</h3>
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>

              {/* Vehicle Info */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{serviceCategories.find(v => v.id === selectedVehicle)?.icon}</span>
                  <div>
                    <h4 className="font-bold">{serviceCategories.find(v => v.id === selectedVehicle)?.name}</h4>
                    <p className="text-sm text-gray-500">Arrives in {serviceCategories.find(v => v.id === selectedVehicle)?.estimatedTime}</p>
                  </div>
                </div>
              </div>

              {/* Route */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full mt-1.5"></div>
                  <div>
                    <p className="text-sm text-gray-500">Pickup</p>
                    <p className="font-medium">{pickup}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full mt-1.5"></div>
                  <div>
                    <p className="text-sm text-gray-500">Drop-off</p>
                    <p className="font-medium">{dropoff}</p>
                  </div>
                </div>
              </div>

              {/* Price Estimate */}
              <div className="border-t border-gray-200 pt-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Estimated Fare</span>
                  <span className="text-2xl font-bold text-[#00B4D8]">
                    ₹{calculatePrice(selectedVehicle, estimatedDistance)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Final fare may vary based on traffic & route</p>
              </div>

              {/* Payment Method */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <i className="fas fa-wallet text-[#00B4D8]"></i>
                  <span className="font-medium">Cash Payment</span>
                </div>
                <button className="text-[#00B4D8] text-sm font-medium">Change</button>
              </div>

              {/* Confirm Button */}
              <button
                onClick={() => handleBookRide()}
                disabled={isBooking}
                className="w-full bg-gradient-to-r from-[#00B4D8] to-[#0077B6] text-white py-4 rounded-xl font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isBooking ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="fas fa-spinner animate-spin"></i>
                    Booking...
                  </span>
                ) : (
                  'Confirm Ride'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Schedule Ride</h3>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00B4D8]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00B4D8]"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  if (scheduleDate && scheduleTime && selectedVehicle) {
                    handleBookRide(true)
                  }
                }}
                disabled={!scheduleDate || !scheduleTime || !selectedVehicle}
                className="w-full mt-6 bg-gradient-to-r from-[#00B4D8] to-[#0077B6] text-white py-4 rounded-xl font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50"
              >
                Schedule Ride
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Success Modal */}
      {bookingSuccess && bookingDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-check text-green-500 text-3xl"></i>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Ride Booked!</h3>
            <p className="text-gray-600 mb-6">
              {bookingDetails.scheduledTime 
                ? `Scheduled for ${bookingDetails.scheduledTime}`
                : 'Your driver is on the way'}
            </p>
            
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
              <div className="flex justify-between mb-2">
                <span className="text-gray-500">Vehicle</span>
                <span className="font-medium">{bookingDetails.vehicleType}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-500">Fare</span>
                <span className="font-bold text-[#00B4D8]">₹{bookingDetails.estimatedPrice}</span>
              </div>
            </div>

            <button
              onClick={() => {
                setBookingSuccess(false)
                setBookingDetails(null)
                setSelectedVehicle(null)
                setDropoff('')
              }}
              className="w-full bg-[#00B4D8] text-white py-4 rounded-xl font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <AppDownloadModal
        isOpen={showAppDownloadModal}
        onClose={() => setShowAppDownloadModal(false)}
        description="Web ride booking is currently unavailable. Please download the app to book now or schedule for later."
      />

      {/* Auth Modal */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
        />
      )}

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* Service Switch Modal */}
      {showSwitchModal && (
        <ServiceSwitchModal
          isOpen={showSwitchModal}
          onClose={() => setShowSwitchModal(false)}
          targetService={targetService}
          onContinue={handleSwitchComplete}
        />
      )}

      <Footer />
    </>
  )
}
