'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import ParcelServiceControl from '@/components/common/ParcelServiceControl'
import Footer from '@/components/layout/Footer'
import { ServiceCategory, setCurrentService, logout } from '@/lib/slices/authSlice'
import { truncateDisplayName } from '@/lib/truncateDisplayName'

interface RideType {
  id: string
  name: string
  icon: string
  description: string
  priceRange: string
  image: string
  features: string[]
}

interface BookingFormData {
  pickup: string
  dropoff: string
  passengers: number
  rideType: string
  scheduledDate?: string
  scheduledTime?: string
}

export default function PersonPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const { user, isAuthenticated, currentService } = useAppSelector(state => state.auth)
  const displayUserName = truncateDisplayName(user?.name || user?.phone)
  
  // Form states
  const [formData, setFormData] = useState<BookingFormData>({
    pickup: '',
    dropoff: '',
    passengers: 1,
    rideType: 'go',
  })
  const [showSchedule, setShowSchedule] = useState(false)
  const [isBooking, setIsBooking] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [currentLocation, setCurrentLocation] = useState('Detecting location...')
  const [isDetecting, setIsDetecting] = useState(true)
  const [showProfileSheet, setShowProfileSheet] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  
  // Service switch modal states
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('person')
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [hasCheckedService, setHasCheckedService] = useState(false)

  // Ride types
  const rideTypes: RideType[] = [
    {
      id: 'go',
      name: 'GatiMitra Go',
      icon: 'fa-car',
      description: 'Affordable everyday rides',
      priceRange: '₹80-150',
      image: '/img/ride-go.png',
      features: ['4 seats', 'AC', 'Budget friendly']
    },
    {
      id: 'comfort',
      name: 'GatiMitra Comfort',
      icon: 'fa-car-side',
      description: 'Newer cars with extra legroom',
      priceRange: '₹150-250',
      image: '/img/ride-comfort.png',
      features: ['4 seats', 'AC', 'Premium cars']
    },
    {
      id: 'premier',
      name: 'GatiMitra Premier',
      icon: 'fa-car-alt',
      description: 'Top-rated drivers, luxury cars',
      priceRange: '₹250-400',
      image: '/img/ride-premier.png',
      features: ['4 seats', 'AC', 'Luxury experience']
    },
    {
      id: 'share',
      name: 'GatiMitra Share',
      icon: 'fa-users',
      description: 'Share your ride, split the cost',
      priceRange: '₹50-100',
      image: '/img/ride-share.png',
      features: ['Shared', 'AC', 'Eco-friendly']
    },
    {
      id: 'bike',
      name: 'GatiMitra Bike',
      icon: 'fa-motorcycle',
      description: 'Quick bike rides',
      priceRange: '₹30-80',
      image: '/img/ride-bike.png',
      features: ['1 seat', 'Helmet', 'Fast']
    },
    {
      id: 'auto',
      name: 'GatiMitra Auto',
      icon: 'fa-shuttle-van',
      description: 'Traditional auto rickshaw',
      priceRange: '₹40-100',
      image: '/img/ride-auto.png',
      features: ['3 seats', 'Open-air', 'Local']
    },
  ]

  // Auto-detect location
  useEffect(() => {
    detectLocation()
  }, [])

  // Set current service to 'person' when on this page
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

  const detectLocation = () => {
    setIsDetecting(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            )
            const data = await response.json()
            const address = data.address
            const location = address.suburb || address.neighbourhood || address.city || address.town || 'Unknown'
            const city = address.city || address.town || address.state || ''
            setCurrentLocation(`${location}, ${city}`)
            setFormData(prev => ({ ...prev, pickup: `${location}, ${city}` }))
            setIsDetecting(false)
          } catch {
            setCurrentLocation('Delhi, India')
            setIsDetecting(false)
          }
        },
        () => {
          setCurrentLocation('Delhi, India')
          setIsDetecting(false)
        }
      )
    } else {
      setCurrentLocation('Delhi, India')
      setIsDetecting(false)
    }
  }

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

  const handleLogout = () => {
    dispatch(logout())
    setShowProfileSheet(false)
    setShowLogoutConfirm(false)
    router.push('/')
  }

  const swapLocations = () => {
    setFormData(prev => ({
      ...prev,
      pickup: prev.dropoff,
      dropoff: prev.pickup
    }))
  }

  const handleBookRide = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isAuthenticated) {
      setIsAuthModalOpen(true)
      return
    }

    if (!formData.pickup || !formData.dropoff) {
      alert('Please enter pickup and drop-off locations')
      return
    }

    setIsBooking(true)
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    setIsBooking(false)
    setBookingSuccess(true)
    
    // Reset after 3 seconds
    setTimeout(() => {
      setBookingSuccess(false)
    }, 3000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#E0F7FF] to-white">
      {/* Header */}
      <header className="bg-white shadow-md sticky top-0 z-[1000]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group">
              <GatiMitraLogo variant="icon" alt="GatiMitra" className="h-8 w-8 object-contain group-hover:scale-110 transition-transform" />
              <div className="flex flex-col">
                <div className="flex items-center">
                  <span className="text-sm md:text-lg font-black text-[#00B4D8]">Gati</span>
                  <span className="text-sm md:text-lg font-black text-[#0077B6]">Mitra</span>
                </div>
                <span className="text-[6px] md:text-[8px] font-semibold text-gray-500 uppercase tracking-wider">
                  Person
                </span>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <button
                onClick={() => handleNavigation('/order', 'food')}
                className="text-gray-700 font-medium hover:text-[#00B4D8] transition-colors"
              >
                Food
              </button>
              <span className="text-[#00B4D8] font-bold border-b-2 border-[#00B4D8] pb-1">
                Ride
              </span>
              <ParcelServiceControl
                label="Courier"
                badgePlacement="inline"
                className="text-gray-700 font-medium hover:text-[#00B4D8] transition-colors"
                disabledClassName="cursor-not-allowed opacity-45 hover:text-gray-700"
                onEnabledClick={() => handleNavigation('/parcel', 'parcel')}
              />
            </nav>

            {/* Right Section */}
            <div className="flex items-center gap-3">
              {/* Location */}
              <div className="hidden sm:flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-full text-sm">
                <i className="fas fa-map-marker-alt text-[#00B4D8]"></i>
                <span className="font-medium text-gray-700 truncate max-w-[120px]">
                  {isDetecting ? 'Detecting...' : currentLocation}
                </span>
              </div>

              {/* Auth */}
              {isAuthenticated && user ? (
                <button
                  onClick={() => setShowProfileSheet(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#16c2a5] to-[#0f9f89] text-white px-4 py-2 rounded-full font-semibold text-sm transition-all hover:shadow-lg"
                >
                  <i className="fas fa-user"></i>
                  <span className="hidden sm:inline truncate max-w-[120px]">{displayUserName}</span>
                  <i className="fas fa-chevron-right text-xs"></i>
                </button>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="bg-white text-[#00B4D8] border-2 border-[#00B4D8] px-4 sm:px-6 py-2 rounded-full font-semibold text-sm transition-all hover:bg-[#00B4D8] hover:text-white"
                >
                  Sign In
                </button>
              )}

              {/* Mobile Menu */}
              <button className="md:hidden text-gray-700 p-2">
                <i className="fas fa-bars text-xl"></i>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-10 md:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Content */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-[#00B4D8]/10 text-[#0077B6] px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <i className="fas fa-bolt"></i>
                <span>Fast & Reliable Rides</span>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-4 leading-tight">
                Go anywhere with{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00B4D8] to-[#0077B6]">
                  GatiMitra
                </span>
              </h1>
              <p className="text-lg md:text-xl text-gray-600 mb-6">
                Request a ride, hop in, and go. Safe, reliable, and affordable rides at your fingertips.
              </p>
              
              {/* Promo Banner */}
              <div className="bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white px-6 py-4 rounded-2xl inline-block shadow-lg mb-8">
                <div className="flex items-center gap-3">
                  <i className="fas fa-tag text-2xl"></i>
                  <div>
                    <p className="font-bold text-lg">Up to 50% OFF</p>
                    <p className="text-sm text-white/90">On your first 3 rides!</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Booking Form */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Book Your Ride</h2>
              
              <form onSubmit={handleBookRide} className="space-y-4">
                {/* Pickup */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <i className="fas fa-circle text-green-500 mr-2 text-xs"></i>
                    Pickup Location
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.pickup}
                      onChange={(e) => setFormData(prev => ({ ...prev, pickup: e.target.value }))}
                      placeholder="Enter pickup location"
                      className="w-full px-4 py-3 pl-12 border-2 border-gray-200 rounded-xl focus:border-[#00B4D8] focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                    />
                    <i className="fas fa-map-marker-alt absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <button
                      type="button"
                      onClick={detectLocation}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00B4D8] hover:text-[#0077B6]"
                    >
                      <i className="fas fa-crosshairs"></i>
                    </button>
                  </div>
                </div>

                {/* Swap Button */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={swapLocations}
                    className="w-10 h-10 rounded-full bg-gray-100 hover:bg-[#00B4D8] hover:text-white text-gray-600 flex items-center justify-center transition-all hover:rotate-180 duration-300"
                  >
                    <i className="fas fa-exchange-alt rotate-90"></i>
                  </button>
                </div>

                {/* Dropoff */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <i className="fas fa-circle text-red-500 mr-2 text-xs"></i>
                    Drop-off Location
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.dropoff}
                      onChange={(e) => setFormData(prev => ({ ...prev, dropoff: e.target.value }))}
                      placeholder="Where to?"
                      className="w-full px-4 py-3 pl-12 border-2 border-gray-200 rounded-xl focus:border-[#00B4D8] focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                    />
                    <i className="fas fa-flag-checkered absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  </div>
                </div>

                {/* Passengers */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <i className="fas fa-users text-[#00B4D8] mr-2"></i>
                    Passengers
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, passengers: Math.max(1, prev.passengers - 1) }))}
                      className="w-10 h-10 rounded-lg border-2 border-gray-200 flex items-center justify-center hover:border-[#00B4D8] hover:text-[#00B4D8] transition-colors"
                    >
                      <i className="fas fa-minus"></i>
                    </button>
                    <span className="text-2xl font-bold text-gray-900 w-12 text-center">{formData.passengers}</span>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, passengers: Math.min(6, prev.passengers + 1) }))}
                      className="w-10 h-10 rounded-lg border-2 border-gray-200 flex items-center justify-center hover:border-[#00B4D8] hover:text-[#00B4D8] transition-colors"
                    >
                      <i className="fas fa-plus"></i>
                    </button>
                  </div>
                </div>

                {/* Schedule Toggle */}
                <button
                  type="button"
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="w-full flex items-center justify-between px-4 py-3 border-2 border-gray-200 rounded-xl hover:border-[#00B4D8] transition-colors"
                >
                  <span className="flex items-center gap-2 text-gray-700">
                    <i className="fas fa-calendar-alt text-[#00B4D8]"></i>
                    <span>Schedule for later</span>
                  </span>
                  <i className={`fas fa-chevron-${showSchedule ? 'up' : 'down'} text-gray-400`}></i>
                </button>

                {/* Schedule Fields */}
                {showSchedule && (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Date</label>
                      <input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        value={formData.scheduledDate || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-[#00B4D8] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Time</label>
                      <input
                        type="time"
                        value={formData.scheduledTime || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-[#00B4D8] focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isBooking}
                  className="w-full bg-gradient-to-r from-[#00B4D8] to-[#0077B6] text-white py-4 rounded-xl font-bold text-lg hover:shadow-xl hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBooking ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="fas fa-spinner fa-spin"></i>
                      Finding your ride...
                    </span>
                  ) : bookingSuccess ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="fas fa-check-circle"></i>
                      Ride Booked!
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <i className="fas fa-search"></i>
                      See Prices
                    </span>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Ride Types Section */}
      <section className="py-12 md:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">Choose Your Ride</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From budget-friendly to premium luxury, we have a ride for every need.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rideTypes.map((ride) => (
              <div
                key={ride.id}
                onClick={() => setFormData(prev => ({ ...prev, rideType: ride.id }))}
                className={`relative rounded-2xl p-6 cursor-pointer transition-all duration-300 ${
                  formData.rideType === ride.id
                    ? 'bg-gradient-to-br from-[#00B4D8]/10 to-[#0077B6]/10 border-2 border-[#00B4D8] shadow-xl scale-105'
                    : 'bg-gray-50 border-2 border-transparent hover:border-gray-200 hover:shadow-lg'
                }`}
              >
                {formData.rideType === ride.id && (
                  <div className="absolute top-4 right-4">
                    <div className="w-6 h-6 rounded-full bg-[#00B4D8] flex items-center justify-center">
                      <i className="fas fa-check text-white text-xs"></i>
                    </div>
                  </div>
                )}
                
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl ${
                    formData.rideType === ride.id
                      ? 'bg-[#00B4D8] text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    <i className={`fas ${ride.icon}`}></i>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-lg">{ride.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{ride.description}</p>
                    <p className="text-xl font-black text-[#00B4D8]">{ride.priceRange}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {ride.features.map((feature, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 md:py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#00B4D8]/5 to-[#0077B6]/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">Why Choose GatiMitra Rides?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: 'fa-shield-alt', title: 'Safe & Secure', desc: 'All rides are tracked in real-time with emergency SOS feature.' },
              { icon: 'fa-clock', title: '24/7 Available', desc: 'Book a ride anytime, anywhere. We are always available for you.' },
              { icon: 'fa-wallet', title: 'Best Prices', desc: 'Transparent pricing with no hidden charges. Pay what you see.' },
            ].map((feature, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-8 text-center shadow-lg hover:-translate-y-2 transition-transform">
                <div className="w-16 h-16 rounded-full bg-[#00B4D8]/10 flex items-center justify-center mx-auto mb-4">
                  <i className={`fas ${feature.icon} text-3xl text-[#00B4D8]`}></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety Section */}
      <section className="py-12 md:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-6">Your Safety is Our Priority</h2>
              <div className="space-y-4">
                {[
                  { icon: 'fa-id-card', text: 'Verified drivers with background checks' },
                  { icon: 'fa-route', text: 'Real-time ride tracking for you and your loved ones' },
                  { icon: 'fa-phone-alt', text: '24/7 customer support' },
                  { icon: 'fa-star', text: 'Rate your ride and driver after every trip' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-[#00B4D8] flex items-center justify-center">
                      <i className={`fas ${item.icon} text-white`}></i>
                    </div>
                    <p className="text-gray-700 font-medium">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square bg-gradient-to-br from-[#00B4D8]/20 to-[#0077B6]/20 rounded-3xl flex items-center justify-center">
                <i className="fas fa-car text-9xl text-[#00B4D8]/30"></i>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      {showProfileSheet && (
        <div className="fixed inset-0 z-[1300]">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setShowProfileSheet(false)} aria-label="Close profile sheet" />
          <aside className="absolute right-0 top-0 h-full w-full max-w-[360px] bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="bg-gradient-to-r from-[#16c2a5] to-[#0f9f89] px-5 py-5 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center font-bold">
                    {(user?.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-base truncate max-w-[200px]" title={user?.name || 'User'}>
                      {displayUserName}
                    </p>
                    <p className="text-xs text-white/85">{user?.phone}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowProfileSheet(false)} className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30">
                  ×
                </button>
              </div>
            </div>
            <div className="p-4 border-b border-slate-100">
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Active Service</p>
              <div className="flex items-center gap-2 bg-[#e8fbf7] px-3 py-2 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-[#16c2a5] flex items-center justify-center">
                  <i className="fas fa-car text-white text-xs"></i>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">Ride Service</p>
                  <p className="text-[10px] text-emerald-600 font-medium">● Active</p>
                </div>
              </div>
            </div>
            <div className="p-3">
              <button
                onClick={() => {
                  setShowProfileSheet(false)
                  router.push('/orders?filter=person&from=%2Fride')
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-slate-50 text-left"
              >
                <i className="fas fa-history text-[#16c2a5] w-4"></i>
                <span className="font-medium text-sm">My Rides</span>
              </button>
            </div>
            <div className="mt-auto border-t border-slate-100 p-3">
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100"
              >
                <i className="fas fa-sign-out-alt w-4"></i>
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/45" onClick={() => setShowLogoutConfirm(false)} aria-label="Close logout confirmation" />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h4 className="text-lg font-bold text-slate-900 mb-1">Logout?</h4>
            <p className="text-sm text-slate-500 mb-5">Are you sure you want to logout from GatiMitra?</p>
            <div className="flex gap-2.5">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={handleLogout} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Yes, Logout</button>
            </div>
          </div>
        </div>
      )}
      
      <ServiceSwitchModal
        isOpen={showSwitchModal}
        onClose={() => { setShowSwitchModal(false); setPendingNavigation(null); }}
        targetService={targetService}
        onContinue={handleSwitchComplete}
      />
      
      <Footer />
    </div>
  )
}
