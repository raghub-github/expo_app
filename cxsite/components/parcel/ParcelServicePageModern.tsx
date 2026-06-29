'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppDispatch, useAppSelector } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import AppDownloadModal from '@/components/common/AppDownloadModal'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import Footer from '@/components/layout/Footer'
import { ServiceCategory, setCurrentService } from '@/lib/slices/authSlice'
import { supabase } from '@/lib/supabase'

const formatNumber = (num: number): string => new Intl.NumberFormat('en-IN').format(num)

export default function ParcelServicePageModern() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user, isAuthenticated, currentService } = useAppSelector((state) => state.auth)

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('parcel')
  const [hasCheckedService, setHasCheckedService] = useState(false)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)

  const [trackingType, setTrackingType] = useState<'mobile' | 'gmid' | 'partnerid'>('mobile')
  const [trackingInput, setTrackingInput] = useState('')
  const [isTrackingLoading, setIsTrackingLoading] = useState(false)
  const [trackedParcel, setTrackedParcel] = useState<any>(null)
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [heroGlow, setHeroGlow] = useState({ x: 50, y: 40 })
  const [networkGlow, setNetworkGlow] = useState({ x: 50, y: 50 })

  useEffect(() => {
    if (isAuthenticated && user && !hasCheckedService) {
      if (currentService !== 'parcel') {
        setTargetService('parcel')
        setShowSwitchModal(true)
      } else {
        dispatch(setCurrentService('parcel'))
      }
      setHasCheckedService(true)
    }
  }, [isAuthenticated, user, hasCheckedService, currentService, dispatch])

  const handleNavigation = (path: string, service: ServiceCategory) => {
    if (!isAuthenticated) {
      router.push(path)
      return
    }
    if (service === currentService) {
      router.push(path)
    } else {
      setTargetService(service)
      setShowSwitchModal(true)
    }
  }

  const handleTrackParcel = async () => {
    if (!isAuthenticated || !user) {
      setIsAuthModalOpen(true)
      return
    }
    if (!trackingInput.trim()) return

    setIsTrackingLoading(true)
    setTrackingError(null)

    try {
      let parcelData = null

      if (trackingType === 'gmid') {
        const { data, error } = await supabase
          .from('parcel_orders')
          .select('*')
          .eq('order_number', trackingInput.toUpperCase())
          .single()
        if (!error && data) parcelData = data
      } else if (trackingType === 'partnerid') {
        const { data, error } = await supabase
          .from('parcel_orders')
          .select('*')
          .eq('partner_order_id', trackingInput)
          .single()
        if (!error && data) parcelData = data
      } else {
        const { data, error } = await supabase
          .from('parcel_orders')
          .select('*')
          .eq('sender_phone', trackingInput)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (!error && data) parcelData = data
      }

      if (!parcelData) {
        setTrackingError('No parcel found for this tracking input')
      } else {
        setTrackedParcel({
          orderNumber: parcelData.order_number,
          status: parcelData.status || 'pending',
          senderName: parcelData.sender_name,
          recipientName: parcelData.recipient_name,
          pickupAddress: parcelData.pickup_address?.address || parcelData.pickup_address,
          deliveryAddress: parcelData.delivery_address?.address || parcelData.delivery_address,
          estimatedDelivery: parcelData.estimated_delivery_date,
          currentLocation: parcelData.current_location || 'Hub',
          lastUpdate: parcelData.last_update || new Date().toISOString(),
          amount: parcelData.amount,
        })
        setShowTrackingModal(true)
      }
    } catch {
      setTrackingError('Unable to track parcel right now. Please try again.')
    } finally {
      setIsTrackingLoading(false)
    }
  }

  const updateGlow = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    setter: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  ) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setter({ x, y })
  }

  return (
    <>
      <div className="min-h-screen bg-[#050816] text-white">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#070b1d]/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-3">
              <GatiMitraLogo variant="icon" alt="GatiMitra" className="h-11 w-11 sm:h-12 sm:w-12" />
              <span className="text-xl font-black sm:text-2xl">
                <span className="text-[#16c2a5]">Gati</span>
                <span className="text-[#ff6b35]">Mitra</span>
              </span>
            </Link>

            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
              {[
                { label: 'Food', path: '/order', svc: 'food' as ServiceCategory },
                { label: 'Ride', path: '/ride', svc: 'person' as ServiceCategory },
                { label: 'Parcel', path: '/parcel', svc: 'parcel' as ServiceCategory },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleNavigation(item.path, item.svc)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    item.label === 'Parcel'
                      ? 'bg-gradient-to-r from-[#16c2a5] to-[#0f9f89] text-white'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {isAuthenticated && user ? (
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(true)}
                  className="rounded-full bg-gradient-to-r from-[#16c2a5] to-[#0f9f89] px-4 py-2 text-sm font-semibold text-white"
                >
                  {user.name || user.phone}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="rounded-full border border-[#16c2a5]/50 bg-[#16c2a5]/15 px-4 py-2 text-sm font-semibold text-[#6ff3dd]"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Hero section intentionally retained */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pb-24 pt-16 sm:pb-28 sm:pt-20">
          <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl animate-mesh" />
          <div className="pointer-events-none absolute -right-16 top-28 h-72 w-72 rounded-full bg-purple-500/25 blur-3xl animate-mesh delay-700" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-60 w-60 rounded-full bg-blue-500/20 blur-3xl animate-mesh delay-1000" />
          <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
                  <span className="bg-gradient-to-r from-cyan-300 via-blue-200 to-purple-300 bg-clip-text text-transparent">Fast & Secure</span>
                  <br />
                  Parcel Delivery
                </h1>
                <p className="max-w-xl text-lg text-slate-300 sm:text-xl">
                  Track, send, and manage your parcels seamlessly with GatiMitra. Fast delivery, real-time tracking, and complete peace of mind.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowAppDownloadModal(true)}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-4 font-bold text-white transition-all hover:shadow-2xl"
                >
                  <i className="fas fa-box mr-2" />
                  Send in App
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isAuthenticated || !user) setIsAuthModalOpen(true)
                    else document.getElementById('tracking-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                  className="rounded-xl border-2 border-cyan-400 px-8 py-4 font-bold text-cyan-300 transition-all hover:bg-cyan-400/10"
                >
                  <i className="fas fa-location-dot mr-2" />
                  Track Your Order
                </button>
              </div>
            </div>

            <div
              className="relative"
              onMouseMove={(e) => updateGlow(e, setHeroGlow)}
            >
              <div
                id="tracking-card"
                className="relative rounded-2xl border border-white/20 bg-white/95 p-8 text-gray-900 shadow-2xl"
                style={{
                  backgroundImage: `radial-gradient(circle at ${heroGlow.x}% ${heroGlow.y}%, rgba(59,130,246,0.18), rgba(255,255,255,0.95) 40%)`,
                }}
              >
                <h3 className="mb-6 text-2xl font-bold">Track Your Parcel</h3>
                <div className={`${!isAuthenticated ? 'pointer-events-none select-none blur-[2px] opacity-60' : ''}`}>
                  <div className="mb-6 flex gap-2 rounded-lg bg-gray-100 p-1">
                    {[
                      { id: 'mobile', label: 'Mobile', icon: 'fas fa-mobile-alt' },
                      { id: 'gmid', label: 'GM Order ID', icon: 'fas fa-barcode' },
                      { id: 'partnerid', label: 'Partner ID', icon: 'fas fa-id-card' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTrackingType(tab.id as 'mobile' | 'gmid' | 'partnerid')}
                        className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
                          trackingType === tab.id ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white' : 'bg-white text-gray-600'
                        }`}
                      >
                        <i className={`${tab.icon} mr-1.5`} />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    {trackingType === 'mobile' && 'Enter Mobile Number'}
                    {trackingType === 'gmid' && 'Enter GatiMitra Order ID'}
                    {trackingType === 'partnerid' && 'Enter Partner Order ID'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={trackingInput}
                      onChange={(e) => setTrackingInput(e.target.value)}
                      placeholder={trackingType === 'mobile' ? '+91 XXXXX XXXXX' : trackingType === 'gmid' ? 'GMC0001234' : 'PARTNER-12345'}
                      className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 pr-10 focus:border-purple-600 focus:outline-none"
                    />
                    <i className="fas fa-search absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>

                  <button
                    type="button"
                    onClick={handleTrackParcel}
                    disabled={!trackingInput.trim() || isTrackingLoading}
                    className="mt-5 w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTrackingLoading ? 'Tracking...' : 'Track Now'}
                  </button>
                </div>

                {!isAuthenticated && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 p-4">
                    <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 text-center shadow-lg">
                      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Preview (masked)</p>
                        <div className="space-y-1.5 text-xs text-gray-700">
                          <div className="flex items-center justify-between"><span>Mobile</span><span className="font-semibold">+91 *****1234</span></div>
                          <div className="flex items-center justify-between"><span>GM Order ID</span><span className="font-semibold">GMC******</span></div>
                          <div className="flex items-center justify-between"><span>Partner ID</span><span className="font-semibold">PARTNER-****</span></div>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">Tracking is for logged-in users only</p>
                      <button
                        type="button"
                        onClick={() => setIsAuthModalOpen(true)}
                        className="mt-4 rounded-lg bg-gradient-to-r from-[#16c2a5] to-[#0f9f89] px-4 py-2 text-sm font-semibold text-white"
                      >
                        Sign In to Track
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Completely redesigned body (no booking form, no offers) */}
        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-12 sm:px-6 lg:grid-cols-3">
          {[
            { icon: 'fa-bolt', title: 'Lightning Dispatch', desc: 'Intelligent rider routing with dynamic cluster assignment.' },
            { icon: 'fa-shield', title: 'Trust Layer', desc: 'Tamper events, OTP handoff, and verified pickup checkpoints.' },
            { icon: 'fa-wave-square', title: 'Live Signals', desc: 'Movement heartbeat + event stream for timeline precision.' },
          ].map((item) => (
            <div key={item.title} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-[0_20px_50px_-25px_rgba(34,211,238,0.55)]">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300">
                <i className={`fas ${item.icon}`} />
              </div>
              <h3 className="text-lg font-bold text-white transition-colors group-hover:text-cyan-200">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.desc}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div
            className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0c1331] via-[#101a3f] to-[#0b1230] p-8 sm:p-10"
            onMouseMove={(e) => updateGlow(e, setNetworkGlow)}
            style={{
              backgroundImage: `radial-gradient(circle at ${networkGlow.x}% ${networkGlow.y}%, rgba(45,212,191,0.18), rgba(12,19,49,0.96) 45%)`,
            }}
          >
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Parcel Network 2.0</p>
                <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">Designed for app-first parcel experience</h2>
                <p className="mt-4 max-w-xl text-slate-300">
                  Website shows discovery and tracking access, but parcel booking is fully optimized and available only on the GatiMitra app.
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-black/20 p-6">
                <div className="space-y-4 text-sm text-slate-200">
                  <div className="flex items-center justify-between"><span>Pickup OTP verification</span><span className="text-cyan-300">Enabled</span></div>
                  <div className="flex items-center justify-between"><span>Risk scoring</span><span className="text-cyan-300">Enabled</span></div>
                  <div className="flex items-center justify-between"><span>Proof snapshots</span><span className="text-cyan-300">Enabled</span></div>
                  <div className="flex items-center justify-between"><span>Delivery ETA intelligence</span><span className="text-cyan-300">Enabled</span></div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAppDownloadModal(true)}
                  className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#16c2a5] to-[#4b2ad4] py-3 font-semibold text-white"
                >
                  Download App to Send Parcel
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {showTrackingModal && trackedParcel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowTrackingModal(false)}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 text-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">Tracking Details</h3>
              <button type="button" onClick={() => setShowTrackingModal(false)} className="text-gray-500 hover:text-gray-800">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <p><span className="font-semibold">Order:</span> {trackedParcel.orderNumber}</p>
              <p><span className="font-semibold">Status:</span> {trackedParcel.status}</p>
              <p><span className="font-semibold">Current Location:</span> {trackedParcel.currentLocation}</p>
              <p><span className="font-semibold">Pickup:</span> {trackedParcel.pickupAddress}</p>
              <p><span className="font-semibold">Delivery:</span> {trackedParcel.deliveryAddress}</p>
              {trackedParcel.amount ? <p><span className="font-semibold">Amount:</span> ₹{formatNumber(trackedParcel.amount)}</p> : null}
            </div>
          </div>
        </div>
      )}

      {trackingError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setTrackingError(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center text-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-bold">Parcel Not Found</h3>
            <p className="mt-2 text-sm text-gray-600">{trackingError}</p>
            <button type="button" onClick={() => setTrackingError(null)} className="mt-5 w-full rounded-lg bg-gray-900 py-2.5 font-semibold text-white">
              Try Again
            </button>
          </div>
        </div>
      )}

      <AppDownloadModal
        isOpen={showAppDownloadModal}
        onClose={() => setShowAppDownloadModal(false)}
        title="Send parcels in the GatiMitra App"
        description="Parcel booking is app-only. Download the GatiMitra app to create and manage parcel orders."
      />

      {isAuthModalOpen && <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />}
      <UserProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      {showSwitchModal && (
        <ServiceSwitchModal
          isOpen={showSwitchModal}
          onClose={() => setShowSwitchModal(false)}
          targetService={targetService}
          onContinue={() => {
            setShowSwitchModal(false)
            router.push(targetService === 'food' ? '/order' : targetService === 'person' ? '/ride' : '/parcel')
          }}
        />
      )}

      <Footer />

      <style jsx global>{`
        @keyframes mesh {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(18px, -22px) scale(1.08); }
          66% { transform: translate(-16px, 14px) scale(0.96); }
        }
        .animate-mesh {
          animation: mesh 9s ease-in-out infinite;
        }
      `}</style>
    </>
  )
}

