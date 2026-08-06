'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import AppDownloadModal from '@/components/common/AppDownloadModal'
import AppLinkSentToast from '@/components/common/AppLinkSentToast'
import AppAssetImage from '@/components/common/AppAssetImage'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import Footer from '@/components/layout/Footer'
import { useAppAssetUrl } from '@/components/providers/AppAssetsProvider'
import { CX } from '@/lib/appAssetKeys'
import {
  PARCEL_HERO_FALLBACK_IMG,
  resolveAndroidDownloadUrl,
  resolveIosDownloadUrl,
} from '@/lib/appDownload'
import { AppleStoreIcon, GooglePlayIcon } from '@/components/common/StoreBrandIcons'
import { ServiceCategory, setCurrentService } from '@/lib/slices/authSlice'

const PARCEL_VEHICLES = [
  {
    id: '2_wheeler',
    name: '2 Wheeler',
    subtitle: 'Documents & daily essentials',
    tag: 'FASTEST' as const,
    assetKey: CX.ride.bike,
    blurb: 'Up to 20 kg · 0.4 × 0.4 × 0.4 m — quick city courier on bike.',
  },
  {
    id: '3_wheeler',
    name: '3 Wheeler',
    subtitle: 'Bulk fruit & supplies',
    assetKey: CX.ride.auto,
    blurb: 'Up to 100 kg · roomy auto / cargo auto for medium parcels.',
  },
  {
    id: '4_wheeler',
    name: '4 Wheeler',
    subtitle: 'Furniture & commercial goods',
    assetKey: CX.ride.cab,
    blurb: 'Up to 200 kg · Ace, pickup, or van for larger loads.',
  },
] as const

const HERO_FEATURES = [
  { icon: 'fa-location-dot', label: 'Live tracking' },
  { icon: 'fa-shield-halved', label: 'OTP handoff' },
  { icon: 'fa-truck-fast', label: '2W · 3W · 4W' },
] as const

const HERO_STATS = [
  { value: '20–200 kg', label: 'Load range', icon: 'fa-weight-hanging' },
  { value: 'Same day', label: 'Fast pickup', icon: 'fa-bolt' },
  { value: '100%', label: 'OTP verified', icon: 'fa-circle-check' },
] as const

const HERO_FLOW = [
  { icon: 'fa-map-pin', label: 'Set pickup & drop' },
  { icon: 'fa-route', label: 'Track live' },
  { icon: 'fa-box-open', label: 'OTP delivery' },
] as const

const HERO_TRUST = [
  'Verified captains',
  'Insured trips',
  'Real-time GPS',
  'App-only booking',
] as const

function ParcelHeroVisual() {
  const cmsUrl = useAppAssetUrl(CX.home.serviceParcel)
  const src = cmsUrl ?? PARCEL_HERO_FALLBACK_IMG

  return (
    <div className="ride-landing__hero-visual relative mx-auto flex w-full max-w-md justify-center lg:max-w-xl">
      <div className="parcel-landing__hero-art relative w-full">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[min(420px,70vw)] w-[min(420px,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#16c2a5]/15 blur-3xl"
          aria-hidden
        />
        <div className="parcel-landing__hero-image-slot">
          {/* eslint-disable-next-line @next/next/no-img-element -- CMS or local hero art */}
          <img
            src={src}
            alt="GatiMitra parcel delivery van"
            width={520}
            height={520}
            decoding="async"
            fetchPriority="high"
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}

const HOW_STEPS = [
  {
    step: '01',
    title: 'Open the GatiMitra app',
    body: 'Parcel booking starts in the mobile app — not on the website.',
  },
  {
    step: '02',
    title: 'Set pickup, drop & vehicle',
    body: 'Choose 2W, 3W, or 4W, add receiver details, and confirm fare.',
  },
  {
    step: '03',
    title: 'Hand off to a trusted Captain',
    body: 'OTP pickup & delivery. Track live until your parcel arrives.',
  },
] as const

export default function ParcelLandingPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user, isAuthenticated, currentService } = useAppSelector((state) => state.auth)

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('parcel')
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)
  const [showAppLinkToast, setShowAppLinkToast] = useState(false)

  const androidUrl = resolveAndroidDownloadUrl()
  const iosUrl = resolveIosDownloadUrl()

  useEffect(() => {
    if (isAuthenticated && currentService !== 'parcel') {
      dispatch(setCurrentService('parcel'))
    }
  }, [isAuthenticated, currentService, dispatch])

  const openDownload = () => setShowAppDownloadModal(true)

  const handleNavigation = (path: string, service: ServiceCategory) => {
    if (!isAuthenticated || !user) {
      router.push(path)
      return
    }
    if (service === currentService) {
      router.push(path)
      return
    }
    setTargetService(service)
    setPendingNavigation(path)
    setShowSwitchModal(true)
  }

  const handleSwitchComplete = () => {
    setShowSwitchModal(false)
    dispatch(setCurrentService(targetService))
    if (pendingNavigation) {
      router.push(pendingNavigation)
      setPendingNavigation(null)
    }
  }

  return (
    <div className="parcel-landing ride-landing min-h-screen bg-[#0a0f0e] text-white">
      <header className="ride-landing__header sticky top-0 z-[1000] border-b border-white/10 bg-[#0a0f0e]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <GatiMitraLogo
              variant="withName"
              alt="GatiMitra"
              className="h-10 w-auto object-contain sm:h-12"
              height={48}
            />
          </Link>

          <nav className="flex gap-4 sm:gap-8" aria-label="Services">
            <button
              type="button"
              onClick={() => handleNavigation('/ride', 'person')}
              className="text-sm font-medium text-[#9ca8a5] transition-colors hover:text-[#16c2a5] sm:text-base"
            >
              Ride
            </button>
            <button
              type="button"
              onClick={() => handleNavigation('/order', 'food')}
              className="text-sm font-medium text-[#9ca8a5] transition-colors hover:text-[#16c2a5] sm:text-base"
            >
              Food
            </button>
            <span className="border-b-2 border-[#16c2a5] pb-0.5 text-sm font-medium text-[#16c2a5] sm:text-base">
              Parcel
            </span>
          </nav>

          {isAuthenticated && user ? (
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              className="max-w-[100px] truncate rounded-full px-3 py-1.5 text-sm font-semibold text-[#16c2a5] transition-colors hover:text-white sm:max-w-none sm:text-base"
            >
              {user.name || user.phone}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="rounded-full bg-[#16c2a5] px-4 py-2 text-sm font-semibold text-[#0a0f0e] transition-opacity hover:opacity-90 sm:px-6 sm:text-base"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <section className="ride-landing__hero relative overflow-hidden" aria-label="Send a parcel in the app">
        <div className="ride-landing__hero-glow ride-landing__hero-glow--a" aria-hidden />
        <div className="ride-landing__hero-glow ride-landing__hero-glow--b" aria-hidden />
        <div className="ride-landing__hero-grid" aria-hidden />

        <div className="parcel-landing__hero-inner relative z-10 mx-auto grid max-w-7xl items-start gap-8 px-4 pt-4 pb-10 sm:px-6 sm:pt-5 sm:pb-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:px-8 lg:pt-6 lg:pb-14">
          <div className="parcel-landing__hero-copy">
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#16c2a5]/30 bg-[#16c2a5]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#6ee7d6] sm:text-xs">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#16c2a5]" aria-hidden />
              Courier &amp; parcel delivery · App only
            </span>
            <h1 className="font-[family-name:var(--font-montserrat)] text-3xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.85rem]">
              Send a{' '}
              <span className="bg-gradient-to-r from-[#5eead4] to-[#fde047] bg-clip-text text-transparent">
                Parcel
              </span>
              <br className="hidden sm:block" />
              <span className="text-white/90"> anywhere in the city</span>
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-[#b8c4c0] sm:text-lg">
              Documents to cargo — book in the GatiMitra app. Fast pickup, trusted captains, and
              secure OTP handoff at every step.
            </p>

            <ul className="mt-5 grid grid-cols-3 gap-2">
              {HERO_STATS.map((stat) => (
                <li
                  key={stat.label}
                  className="parcel-landing__stat flex flex-col items-center rounded-lg px-1.5 py-2 text-center sm:px-2"
                >
                  <i className={`fas ${stat.icon} mb-0.5 text-xs text-[#16c2a5] sm:text-sm`} aria-hidden />
                  <span className="text-[11px] font-bold leading-tight text-white sm:text-xs">{stat.value}</span>
                  <span className="mt-0.5 text-[9px] leading-tight text-[#8a9a96] sm:text-[10px]">{stat.label}</span>
                </li>
              ))}
            </ul>

            <ul className="mt-5 flex flex-wrap gap-2">
              {HERO_FEATURES.map((item) => (
                <li
                  key={item.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-[#d1eae4] sm:text-xs"
                >
                  <i className={`fas ${item.icon} text-[#16c2a5]`} aria-hidden />
                  {item.label}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-center gap-1.5 sm:gap-2" aria-label="How parcel delivery works">
              {HERO_FLOW.map((step, index) => (
                <div key={step.label} className="flex items-center gap-1.5 sm:gap-2">
                  <div className="parcel-landing__flow-step flex items-center gap-1.5 rounded-lg px-2.5 py-2 sm:px-3">
                    <i className={`fas ${step.icon} text-[10px] text-[#16c2a5] sm:text-xs`} aria-hidden />
                    <span className="text-[10px] font-medium text-[#c8ddd8] sm:text-xs">{step.label}</span>
                  </div>
                  {index < HERO_FLOW.length - 1 ? (
                    <i className="fas fa-chevron-right parcel-landing__flow-arrow text-[8px] sm:text-[10px]" aria-hidden />
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={openDownload}
                className="parcel-landing__cta inline-flex items-center justify-center gap-2 rounded-full bg-[#16c2a5] px-7 py-3.5 text-sm font-bold text-[#04201a] sm:text-base"
              >
                Download the App
                <i className="fas fa-arrow-right text-xs" aria-hidden />
              </button>
              <a
                href={androidUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:border-[#16c2a5]/60 hover:bg-white/10"
              >
                <GooglePlayIcon className="h-4 w-4" />
                Google Play
              </a>
              <a
                href={iosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:border-[#16c2a5]/60 hover:bg-white/10"
              >
                <AppleStoreIcon className="h-4 w-4" />
                App Store
              </a>
            </div>

            <p className="mt-5 text-xs text-[#7a8a86] sm:text-sm">
              Web parcel booking is unavailable. Use the app to get fares and request a Captain.
            </p>

            <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/8 pt-4">
              {HERO_TRUST.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5 text-[10px] text-[#7a8a86] sm:text-xs">
                  <i className="fas fa-check text-[9px] text-[#16c2a5]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <ParcelHeroVisual />
        </div>
      </section>

      <section className="bg-[#F8FAF9] py-16 text-gray-900 sm:py-20" aria-labelledby="parcel-vehicles-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="parcel-vehicles-heading"
              className="font-[family-name:var(--font-montserrat)] text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Choose your courier
            </h2>
            <p className="mt-3 text-base text-gray-600 sm:text-lg">
              Same vehicle options as the GatiMitra app. Open the app to book in seconds.
            </p>
          </div>

          <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {PARCEL_VEHICLES.map((vehicle) => (
              <li key={vehicle.id}>
                <button
                  type="button"
                  onClick={openDownload}
                  className="ride-landing__service group flex h-full w-full flex-col rounded-2xl border border-emerald-100 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#16c2a5]/40 hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex h-16 w-16 items-center justify-center sm:h-[4.5rem] sm:w-[4.5rem]">
                      <AppAssetImage
                        assetKey={vehicle.assetKey}
                        alt=""
                        className="h-full w-full object-contain drop-shadow-sm"
                        width={72}
                        height={72}
                      />
                    </div>
                    {'tag' in vehicle && vehicle.tag ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                        {vehicle.tag}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="font-[family-name:var(--font-montserrat)] text-xl font-bold text-gray-900">
                    {vehicle.name}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-[#16A34A]">{vehicle.subtitle}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-600">{vehicle.blurb}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#16c2a5]">
                    Book in app
                    <i
                      className="fas fa-arrow-right text-xs transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="ride-landing__offers relative overflow-hidden bg-[#ECFDF5] py-14 sm:py-16"
        aria-labelledby="parcel-offers-heading"
      >
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <h2
              id="parcel-offers-heading"
              className="font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              Send More, <span className="text-[#16A34A]">Save More!</span>
            </h2>
            <p className="mt-3 text-base text-gray-600 sm:text-lg">
              Get exciting offers on every parcel — unlock them when you book in the app.
            </p>
          </div>
          <button
            type="button"
            onClick={openDownload}
            className="parcel-landing__cta shrink-0 rounded-full bg-[#16A34A] px-7 py-3.5 text-sm font-bold text-white sm:text-base"
          >
            Book Now in App
          </button>
        </div>
      </section>

      <section className="bg-white py-16 text-gray-900 sm:py-20" aria-labelledby="parcel-how-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="parcel-how-heading"
              className="font-[family-name:var(--font-montserrat)] text-3xl font-bold tracking-tight sm:text-4xl"
            >
              How it works
            </h2>
            <p className="mt-3 text-base text-gray-600 sm:text-lg">Three steps — all inside the mobile app.</p>
          </div>

          <ol className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {HOW_STEPS.map((item) => (
              <li key={item.step} className="relative text-center md:text-left">
                <span className="font-[family-name:var(--font-montserrat)] text-4xl font-black text-[#d1fae5]">
                  {item.step}
                </span>
                <h3 className="mt-2 font-[family-name:var(--font-montserrat)] text-xl font-bold text-gray-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[#F0FDF4] py-16 sm:py-20" aria-labelledby="parcel-safety-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="ride-landing__safety mx-auto flex max-w-4xl flex-col items-start gap-6 overflow-hidden rounded-2xl border border-emerald-200/80 bg-white p-8 sm:flex-row sm:items-center sm:gap-8 sm:p-10">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#16A34A] text-white"
              aria-hidden
            >
              <i className="fas fa-shield-halved text-2xl" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="parcel-safety-heading"
                className="font-[family-name:var(--font-montserrat)] text-2xl font-bold text-gray-900 sm:text-3xl"
              >
                Secure handoff. Clear tracking.
              </h2>
              <p className="mt-2 text-base leading-relaxed text-gray-600">
                OTP at pickup and delivery. Live status with trusted Captains. Send with peace of mind.
              </p>
            </div>
            <AppAssetImage
              assetKey={CX.home.serviceParcel}
              alt=""
              className="hidden h-24 w-32 shrink-0 object-contain sm:block"
              width={128}
              height={96}
            />
          </div>
        </div>
      </section>

      <section
        className="ride-landing__final relative overflow-hidden py-16 sm:py-20"
        aria-labelledby="parcel-download-heading"
      >
        <div className="ride-landing__hero-glow ride-landing__hero-glow--a opacity-60" aria-hidden />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2
            id="parcel-download-heading"
            className="font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
          >
            Ready to send?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-[#b8c4c0] sm:text-lg">
            Download GatiMitra and book parcel delivery from anywhere — website booking is not available.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={openDownload}
              className="parcel-landing__cta inline-flex items-center gap-2 rounded-full bg-[#16c2a5] px-8 py-3.5 text-sm font-bold text-[#04201a] sm:text-base"
            >
              Get the App
            </button>
            <a
              href={androidUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3.5 text-sm font-semibold text-white hover:border-[#16c2a5]/50"
            >
              <GooglePlayIcon className="h-4 w-4" />
              Play Store
            </a>
            <a
              href={iosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3.5 text-sm font-semibold text-white hover:border-[#16c2a5]/50"
            >
              <AppleStoreIcon className="h-4 w-4" />
              App Store
            </a>
          </div>
        </div>
      </section>

      <Footer />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <UserProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      <ServiceSwitchModal
        isOpen={showSwitchModal}
        onClose={() => {
          setShowSwitchModal(false)
          setPendingNavigation(null)
        }}
        onContinue={handleSwitchComplete}
        targetService={targetService}
      />
      <AppDownloadModal
        isOpen={showAppDownloadModal}
        onClose={() => setShowAppDownloadModal(false)}
        variant="parcel"
        title="Send parcels in the GatiMitra App"
        description="Parcel booking is available only on the mobile app. Download GatiMitra to set pickup & drop, choose a vehicle, and hand off to a trusted Captain."
        onLinkSent={() => setShowAppLinkToast(true)}
      />
      <AppLinkSentToast open={showAppLinkToast} onClose={() => setShowAppLinkToast(false)} />
    </div>
  )
}
