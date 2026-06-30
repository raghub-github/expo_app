'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import { ServiceCategory, setCurrentService, logout } from '@/lib/slices/authSlice'
import { truncateDisplayName } from '@/lib/truncateDisplayName'

export default function CourierPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const { user, isAuthenticated, currentService } = useAppSelector(state => state.auth)
  const displayUserName = truncateDisplayName(user?.name || user?.phone)
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  
  // Service switch modal states
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('parcel')
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [hasCheckedService, setHasCheckedService] = useState(false)
  const [showProfileSheet, setShowProfileSheet] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // Set current service to 'parcel' when on courier page
  useEffect(() => {
    if (isAuthenticated && user && !hasCheckedService) {
      // All users have access to all 3 services
      // Just show switch modal if coming from different service
      if (currentService !== 'parcel') {
        setTargetService('parcel')
        setShowSwitchModal(true)
      } else {
        dispatch(setCurrentService('parcel'))
      }
      setHasCheckedService(true)
    }
  }, [isAuthenticated, user, dispatch, currentService, hasCheckedService])

  // Handle navigation with service switch check
  const handleNavigation = async (path: string, service: ServiceCategory) => {
    if (!isAuthenticated || !user) {
      router.push(path)
      return
    }

    // All users have access to all 3 services
    if (service === currentService) {
      // Same service, navigate directly
      router.push(path)
    } else {
      // Different service - show switch modal
      setTargetService(service)
      setPendingNavigation(path)
      setShowSwitchModal(true)
    }
  }

  // Handle successful switch
  const handleSwitchComplete = () => {
    setShowSwitchModal(false)
    if (pendingNavigation) {
      router.push(pendingNavigation)
      setPendingNavigation(null)
    }
  }

  const handleLogout = () => {
    dispatch(logout())
    setShowLogoutConfirm(false)
    setShowProfileSheet(false)
    router.push('/')
  }

  return (
    <>
      <header className="bg-white shadow-md sticky top-0 z-[1000] py-4 px-[5%]">
        <div className="max-w-[1200px] mx-auto flex justify-between items-center flex-wrap gap-5">
          <Link href="/" className="text-3xl font-extrabold text-[#FF6B6B] flex items-center gap-3">
            <GatiMitraLogo variant="icon" alt="GatiMitra" className="w-10 h-10 object-contain" />
            GatiMitra
          </Link>
          <nav className="flex gap-8">
            <span className="text-[#FF6B6B] font-medium border-b-2 border-[#FF6B6B] pb-1 cursor-default">Courier</span>
            <button 
              onClick={() => handleNavigation('/ride', 'person')}
              className="text-[#1A1A2E] font-medium transition-colors hover:text-[#FF6B6B] bg-transparent border-none cursor-pointer"
            >
              Ride
            </button>
            <button 
              onClick={() => handleNavigation('/order', 'food')}
              className="text-[#1A1A2E] font-medium transition-colors hover:text-[#FF6B6B] bg-transparent border-none cursor-pointer"
            >
              Food
            </button>
          </nav>
          {isAuthenticated && user ? (
            <button
              onClick={() => setShowProfileSheet(true)}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#16c2a5] to-[#0f9f89] px-4 py-2 text-sm font-semibold text-white transition-all hover:shadow-lg"
            >
              <i className="fas fa-user"></i>
              <span className="truncate max-w-[120px]">{displayUserName}</span>
              <i className="fas fa-chevron-right text-xs"></i>
            </button>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="bg-white text-[#FF6B6B] border-2 border-[#FF6B6B] px-6 py-2.5 rounded-[30px] font-semibold cursor-pointer transition-all hover:bg-[#FF6B6B] hover:text-white"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <section className="bg-gradient-to-br from-[#FF6B6B]/10 to-[#4ECDC4]/5 py-20 px-[5%] text-center">
        <div className="max-w-[800px] mx-auto">
          <h1 className="text-5xl font-extrabold mb-5 text-[#1A1A2E] leading-tight">Courier: for the things you need done now</h1>
          <p className="text-xl text-[#6C757D] mb-10">
            For everyday errands and small business to-dos, including <span className="text-[#FF6B6B] font-bold">same-day delivery</span> and more.
          </p>
        </div>
      </section>

      <section className="max-w-[800px] mx-auto -mt-[60px] mb-20 px-[5%]">
        <div className="bg-white rounded-xl p-10 shadow-xl">
          <h2 className="text-3xl font-bold mb-2.5 text-[#1A1A2E] text-center">Send anything, anywhere</h2>
          
          <form className="space-y-6">
            <div>
              <label className="block font-semibold mb-2.5 text-[#1A1A2E] text-base">Pickup location</label>
              <div className="relative">
                <i className="fas fa-map-marker-alt absolute left-[18px] top-1/2 -translate-y-1/2 text-[#6C757D]"></i>
                <input
                  type="text"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Enter pickup address"
                  className="w-full pl-[50px] pr-5 py-4 rounded-xl border border-[#ddd] text-base transition-all bg-[#f8f9fa] focus:outline-none focus:border-[#4ECDC4] focus:shadow-[0_0_0_3px_rgba(78,205,196,0.2)] focus:bg-white"
                  required
                />
              </div>
            </div>

            <div className="flex justify-center my-4">
              <button
                type="button"
                onClick={() => {
                  const temp = pickup
                  setPickup(dropoff)
                  setDropoff(temp)
                }}
                className="bg-[#E0F7FF] text-[#00B4D8] border-none w-[50px] h-[50px] rounded-full flex items-center justify-center cursor-pointer transition-all hover:bg-[#00B4D8] hover:text-white hover:rotate-180"
              >
                <i className="fas fa-exchange-alt"></i>
              </button>
            </div>

            <div>
              <label className="block font-semibold mb-2.5 text-[#1A1A2E] text-base">Dropoff location</label>
              <div className="relative">
                <i className="fas fa-flag-checkered absolute left-[18px] top-1/2 -translate-y-1/2 text-[#6C757D]"></i>
                <input
                  type="text"
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                  placeholder="Enter delivery address"
                  className="w-full pl-[50px] pr-5 py-4 rounded-xl border border-[#ddd] text-base transition-all bg-[#f8f9fa] focus:outline-none focus:border-[#4ECDC4] focus:shadow-[0_0_0_3px_rgba(78,205,196,0.2)] focus:bg-white"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#FF6B6B] text-white border-none py-4 rounded-xl text-lg font-bold cursor-pointer transition-all hover:bg-[#ff5252] hover:-translate-y-1 hover:shadow-xl"
            >
              <i className="fas fa-paper-plane mr-2"></i> Send item
            </button>
          </form>
        </div>
      </section>

      <section className="py-20 px-[5%] bg-white">
        <h2 className="text-center text-4xl font-extrabold mb-15 text-[#1A1A2E]">Why Choose GatiMitra Courier?</h2>
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
          {[
            { icon: 'fa-bolt', title: 'Fast Delivery', desc: 'Get your items delivered within hours. Same-day delivery available in most areas.' },
            { icon: 'fa-shield-alt', title: 'Secure & Tracked', desc: 'Real-time tracking and secure handling for all your deliveries.' },
            { icon: 'fa-rupee-sign', title: 'Affordable Pricing', desc: 'Transparent pricing with no hidden fees. Pay only for what you need.' },
          ].map((feature, index) => (
            <div key={index} className="text-center p-8">
              <div className="w-20 h-20 bg-[#FFE8E0] rounded-full flex items-center justify-center mx-auto mb-5 text-4xl text-[#FF6B6B]">
                <i className={`fas ${feature.icon}`}></i>
              </div>
              <h3 className="text-2xl font-bold mb-4 text-[#1A1A2E]">{feature.title}</h3>
              <p className="text-[#6C757D] leading-relaxed">{feature.desc}</p>
            </div>
          ))}
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
                <button type="button" onClick={() => setShowProfileSheet(false)} className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30">×</button>
              </div>
            </div>
            <div className="p-4 border-b border-slate-100">
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Active Service</p>
              <div className="flex items-center gap-2 bg-[#e8fbf7] px-3 py-2 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-[#16c2a5] flex items-center justify-center">
                  <i className="fas fa-box text-white text-xs"></i>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">Courier Service</p>
                  <p className="text-[10px] text-emerald-600 font-medium">● Active</p>
                </div>
              </div>
            </div>
            <div className="p-3">
              <button
                onClick={() => {
                  setShowProfileSheet(false)
                  router.push('/orders?filter=parcel&from=%2Fcourier')
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-slate-50 text-left"
              >
                <i className="fas fa-box text-[#16c2a5] w-4"></i>
                <span className="font-medium text-sm">My Parcels</span>
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
      
      {/* Service Switch Modal */}
      <ServiceSwitchModal
        isOpen={showSwitchModal}
        onClose={() => { setShowSwitchModal(false); setPendingNavigation(null); }}
        targetService={targetService}
        onContinue={handleSwitchComplete}
      />
      
      <Footer />
    </>
  )
}

