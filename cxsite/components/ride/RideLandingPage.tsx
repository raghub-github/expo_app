'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import AppDownloadModal from '@/components/common/AppDownloadModal'
import AppAssetImage from '@/components/common/AppAssetImage'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import ParcelServiceControl from '@/components/common/ParcelServiceControl'
import Footer from '@/components/layout/Footer'
import { CX } from '@/lib/appAssetKeys'
import { ServiceCategory, setCurrentService } from '@/lib/slices/authSlice'

const RIDE_SERVICES = [
  {
    id: 'bike',
    name: 'Bike',
    subtitle: 'Quick Bike rides',
    tag: 'FASTEST' as const,
    assetKey: CX.ride.bike,
    blurb: 'Beat the traffic. Reach in minutes.',
  },
  {
    id: 'bike-lite',
    name: 'Bike Lite',
    subtitle: 'Budget bike rides',
    tag: 'SAVE' as const,
    assetKey: CX.ride.bike,
    blurb: 'Everyday trips at a lighter fare.',
  },
  {
    id: 'auto',
    name: 'Auto',
    subtitle: 'Hassle-free Auto rides',
    assetKey: CX.ride.auto,
    blurb: 'Comfortable city hops when you need space.',
  },
  {
    id: 'cab-economy',
    name: 'Cab Economy',
    subtitle: 'Affordable cab rides',
    assetKey: CX.ride.cab,
    blurb: 'AC comfort for daily and longer trips.',
  },
  {
    id: 'cab-premium',
    name: 'Cab Premium',
    subtitle: 'Premium comfort rides',
    assetKey: CX.ride.cabPremium,
    blurb: 'Extra comfort when the journey matters more.',
  },
] as const

const HOW_STEPS = [
  {
    step: '01',
    title: 'Open the GatiMitra app',
    body: 'Ride booking starts in the mobile app — not on the website.',
  },
  {
    step: '02',
    title: 'Choose Bike, Auto, or Cab',
    body: 'Compare options, pick what fits, and set pickup & drop.',
  },
  {
    step: '03',
    title: 'Ride with a trusted Captain',
    body: 'Insured trips. Share your live trip with family anytime.',
  },
] as const

export default function RideLandingPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user, isAuthenticated, currentService } = useAppSelector((state) => state.auth)

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('person')
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)

  const androidUrl = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || 'https://play.google.com/store'
  const iosUrl = process.env.NEXT_PUBLIC_IOS_APP_DOWNLOAD_URL || 'https://www.apple.com/app-store/'

  useEffect(() => {
    if (isAuthenticated && currentService !== 'person') {
      dispatch(setCurrentService('person'))
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
    <div className="ride-landing min-h-screen bg-[#0a0f0e] text-white">
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
            <span className="border-b-2 border-[#16c2a5] pb-0.5 text-sm font-medium text-[#16c2a5] sm:text-base">
              Ride
            </span>
            <button
              type="button"
              onClick={() => handleNavigation('/order', 'food')}
              className="text-sm font-medium text-[#9ca8a5] transition-colors hover:text-[#16c2a5] sm:text-base"
            >
              Food
            </button>
            <ParcelServiceControl
              label="Parcel"
              badgePlacement="inline"
              className="text-sm font-medium text-[#9ca8a5] transition-colors hover:text-[#16c2a5] sm:text-base"
              disabledClassName="cursor-not-allowed opacity-45 hover:text-[#9ca8a5]"
              onEnabledClick={() => handleNavigation('/courier', 'parcel')}
            />
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

      {/* Hero — one composition, brand-first, no booking form */}
      <section className="ride-landing__hero relative overflow-hidden" aria-label="Book a Ride in the app">
        <div className="ride-landing__hero-glow ride-landing__hero-glow--a" aria-hidden />
        <div className="ride-landing__hero-glow ride-landing__hero-glow--b" aria-hidden />
        <div className="ride-landing__hero-grid" aria-hidden />

        <div className="relative z-10 mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-8 lg:py-16">
          <div className="ride-landing__hero-copy">
            <GatiMitraLogo
              variant="withName"
              alt="GatiMitra"
              className="mb-5 h-12 w-auto object-contain sm:h-14 lg:h-16"
              height={64}
              fetchPriority="high"
            />
            <h1 className="font-[family-name:var(--font-montserrat)] text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              Book a Ride
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[#b8c4c0] sm:text-lg">
              Bike, Auto, or Cab — book only in the GatiMitra mobile app. Safe, fast, and ready when you are.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={openDownload}
                className="ride-landing__cta-primary inline-flex items-center justify-center gap-2 rounded-full bg-[#16c2a5] px-7 py-3.5 text-sm font-bold text-[#04201a] sm:text-base"
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
                <i className="fab fa-google-play" aria-hidden />
                Google Play
              </a>
              <a
                href={iosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:border-[#16c2a5]/60 hover:bg-white/10"
              >
                <i className="fab fa-apple" aria-hidden />
                App Store
              </a>
            </div>

            <p className="mt-5 text-xs text-[#7a8a86] sm:text-sm">
              Web ride booking is unavailable. Use the app to get fares and request a Captain.
            </p>
          </div>

          <div className="ride-landing__hero-visual relative mx-auto flex w-full max-w-md justify-center lg:max-w-lg">
            <div className="ride-landing__hero-art relative w-full">
              <Image
                src="/img/ride.png"
                alt="GatiMitra ride app screens — Bike, Auto, or Cab"
                width={480}
                height={640}
                className="mx-auto h-auto max-h-[420px] w-auto object-contain sm:max-h-[480px]"
                sizes="(max-width: 1024px) 70vw, 400px"
                priority
                unoptimized
              />
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="bg-[#F8FAF9] py-16 text-gray-900 sm:py-20" aria-labelledby="ride-services-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="ride-services-heading"
              className="font-[family-name:var(--font-montserrat)] text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Choose your ride
            </h2>
            <p className="mt-3 text-base text-gray-600 sm:text-lg">
              Same options as the GatiMitra app. Open the app to book in seconds.
            </p>
          </div>

          <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {RIDE_SERVICES.map((service) => (
              <li key={service.id}>
                <button
                  type="button"
                  onClick={openDownload}
                  className="ride-landing__service group flex h-full w-full flex-col rounded-2xl border border-emerald-100 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#16c2a5]/40 hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#ECFDF5] p-2 sm:h-[4.5rem] sm:w-[4.5rem]">
                      <AppAssetImage
                        assetKey={service.assetKey}
                        alt=""
                        className="h-full w-full object-contain"
                        width={72}
                        height={72}
                      />
                    </div>
                    {'tag' in service && service.tag ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          service.tag === 'FASTEST'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {service.tag}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="font-[family-name:var(--font-montserrat)] text-xl font-bold text-gray-900">
                    {service.name}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-[#16A34A]">{service.subtitle}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-600">{service.blurb}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#16c2a5]">
                    Book in app
                    <i className="fas fa-arrow-right text-xs transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Offers */}
      <section className="ride-landing__offers relative overflow-hidden bg-[#ECFDF5] py-14 sm:py-16" aria-labelledby="ride-offers-heading">
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <h2
              id="ride-offers-heading"
              className="font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              Go More, <span className="text-[#16A34A]">Save More!</span>
            </h2>
            <p className="mt-3 text-base text-gray-600 sm:text-lg">
              Get exciting offers on every ride — unlock them when you book in the app.
            </p>
          </div>
          <button
            type="button"
            onClick={openDownload}
            className="ride-landing__cta-primary shrink-0 rounded-full bg-[#16A34A] px-7 py-3.5 text-sm font-bold text-white sm:text-base"
          >
            Book Now in App
          </button>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-16 text-gray-900 sm:py-20" aria-labelledby="ride-how-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="ride-how-heading"
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

      {/* Safety */}
      <section className="bg-[#F0FDF4] py-16 sm:py-20" aria-labelledby="ride-safety-heading">
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
                id="ride-safety-heading"
                className="font-[family-name:var(--font-montserrat)] text-2xl font-bold text-gray-900 sm:text-3xl"
              >
                Your Safety. Our Priority.
              </h2>
              <p className="mt-2 text-base leading-relaxed text-gray-600">
                All rides are insured. Share trip details with your loved ones. Ride safe, ride smart with trusted
                Captains.
              </p>
            </div>
            <AppAssetImage
              assetKey={CX.ride.bottomBanner}
              alt=""
              className="hidden h-24 w-32 shrink-0 object-contain sm:block"
              width={128}
              height={96}
            />
          </div>
        </div>
      </section>

      {/* Final download */}
      <section className="ride-landing__final relative overflow-hidden py-16 sm:py-20" aria-labelledby="ride-download-heading">
        <div className="ride-landing__hero-glow ride-landing__hero-glow--a opacity-60" aria-hidden />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2
            id="ride-download-heading"
            className="font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
          >
            Ready to ride?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-[#b8c4c0] sm:text-lg">
            Download GatiMitra and book Bike, Auto, or Cab from anywhere — website booking is not available.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={openDownload}
              className="ride-landing__cta-primary inline-flex items-center gap-2 rounded-full bg-[#16c2a5] px-8 py-3.5 text-sm font-bold text-[#04201a] sm:text-base"
            >
              Get the App
            </button>
            <a
              href={androidUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3.5 text-sm font-semibold text-white hover:border-[#16c2a5]/50"
            >
              <i className="fab fa-google-play" aria-hidden />
              Play Store
            </a>
            <a
              href={iosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3.5 text-sm font-semibold text-white hover:border-[#16c2a5]/50"
            >
              <i className="fab fa-apple" aria-hidden />
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
        title="Book rides in the GatiMitra App"
        description="Ride booking is available only on the mobile app. Download GatiMitra to get fares, choose Bike, Auto, or Cab, and ride with a trusted Captain."
      />
    </div>
  )
}
