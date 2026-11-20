'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'
import LocationPopup from '@/components/location-search/LocationPopup'
import type { LocationItem } from '@/components/location-search/LocationPopup'
import LocationSheet from '@/components/location-search/LocationSheet'
import LocationWelcomeModal from '@/components/location-search/LocationWelcomeModal'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'
import { getMagicpinPathAfterLocationSelect, mergeLocationNavigationUrl } from '@/lib/magicpinLocationUrl'
import { detectCurrentLocation } from '@/lib/detectCurrentLocation'
import { locationAutoDetectErrorMessage } from '@/lib/locationAutoDetect'
import { resolveHeaderLocationLabel } from '@/lib/webLocationPermission'
import { isLandingHeroRoute } from '@/lib/landingHeroRoute'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import AppDownloadModal from '@/components/common/AppDownloadModal'
import AppLinkSentToast from '@/components/common/AppLinkSentToast'
import GetAppNavControl from '@/components/common/GetAppNavControl'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'
import StoreInnerLink from '@/components/order/StoreInnerLink'
import { buildLocationQueryFromState, mergeLocationQuery } from '@/lib/locationQuery'
import { useLocationPromptAutoOpen } from '@/lib/hooks/useLocationPromptAutoOpen'

type LandingNavItem = {
  href: string
  label: string
  icon: string
  /** Open in a new tab (e.g. corporates landing keeps main site in place). */
  openInNewTab?: boolean
}

/** Home: top row links (desktop) + flat list for mobile drawer */
const LANDING_TOP_NAV: LandingNavItem[] = [
  { href: '/', label: 'Home', icon: 'fa-home' },
  { href: '/about', label: 'About', icon: 'fa-info-circle' },
  { href: '/india/All/Stores', label: 'Around You', icon: 'fa-map-marker-alt' },
]

/** Shown inside Business dropdown (desktop) + mobile menu (flat) */
const LANDING_BUSINESS_ITEMS: LandingNavItem[] = [
  { href: 'https://partner.gatimitra.com', label: 'Register as Merchant', icon: 'fa-store' },
  { href: 'https://partner.gatimitra.com', label: 'Register as Brand', icon: 'fa-tag' },
  { href: '/corporates', label: 'For Corporates', icon: 'fa-building', openInNewTab: true },
]

function queryFromLocation(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  try {
    return new URLSearchParams(window.location.search)
  } catch {
    return new URLSearchParams()
  }
}

const LANDING_GET_APP: LandingNavItem = {
  href: '#',
  label: 'Get App',
  icon: 'fa-mobile-alt',
}

const LANDING_MOBILE_LINKS: LandingNavItem[] = [
  ...LANDING_TOP_NAV,
  ...LANDING_BUSINESS_ITEMS,
  LANDING_GET_APP,
]

export default function Header() {
    const pathname = usePathname()
    const router = useRouter()
    const isAboutPage = pathname === '/about'
    const isCorporatesPage = pathname === '/corporates'
    const isAroundYouPage =
      pathname === '/india/All/Stores' ||
      pathname === '/around-you' ||
      (pathname != null && /^\/india\/[^/]+\/[^/]+\/All\/Stores$/.test(pathname))
    const isCityAreaRoute = Boolean(pathname && pathname.split('/').filter(Boolean).length >= 2)
    /** Home + city/area pages — exclude Around You (`/india/All/Stores`) so the Food Delivery hero is hidden there. */
    const isLandingHeroPage = isLandingHeroRoute(pathname)
    /** Same landing-style header shell as home (nav + optional hero body). */
    const showLandingHeaderShell =
      isLandingHeroPage || isAboutPage || isCorporatesPage || isAroundYouPage
    const {
      location: locationState,
      setLocation: setGlobalLocation,
      permissionStatus,
      locationLoading,
      markAutoDetectInFlight,
      hydrated,
    } = useLocationContext()
    const locationCommitted = locationState.locationCommittedByUser === true
    const restaurantGeoQs = useMemo(
      () => getRestaurantGeoQueryString(locationState),
      [locationState, locationCommitted]
    )
    // Search logic for landing page
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searchLoading, setSearchLoading] = useState(false)
    const [showSearchResults, setShowSearchResults] = useState(false)
    const [restaurantList, setRestaurantList] = useState<any[]>([])
    const searchRef = useRef<HTMLDivElement>(null)
    const searchResultsRef = useRef<HTMLDivElement>(null)
    const mobileSearchRef = useRef<HTMLDivElement>(null)
    const mobileSearchResultsRef = useRef<HTMLDivElement>(null)

    // Location states — header label derived from context (customer-app pattern)
    const [showLocationWelcomeModal, setShowLocationWelcomeModal] = useState(false)
    const [showLocationSheet, setShowLocationSheet] = useState(false)
    const [showLocationPopup, setShowLocationPopup] = useState(false)
    const [autoDetecting, setAutoDetecting] = useState(false)
    const [welcomeDetectError, setWelcomeDetectError] = useState<string | null>(null)
    const [locationSearchQuery, setLocationSearchQuery] = useState('')
    const locationTriggerRef = useRef<HTMLInputElement>(null)

    const headerLocationLabel = resolveHeaderLocationLabel({
      displayName: locationState.displayName,
      locationSource: locationState.locationSource,
      permissionStatus,
      loading: locationLoading || autoDetecting,
    })

    const openLocationWelcomeModal = useCallback(() => setShowLocationWelcomeModal(true), [])
    const { handlePromptDismiss: markLocationPromptDismissed, markSelected: markLocationSelected } =
      useLocationPromptAutoOpen({
        enabled: showLandingHeaderShell,
        hydrated,
        locationCommitted,
        promptOpen: showLocationWelcomeModal,
        openPrompt: openLocationWelcomeModal,
        permissionStatus,
        locationLoading: locationLoading || autoDetecting,
      })

    const closeLocationWelcomeModal = useCallback(() => {
      setShowLocationWelcomeModal(false)
      setWelcomeDetectError(null)
      markLocationPromptDismissed()
    }, [markLocationPromptDismissed])

    const closeLocationSheet = useCallback(() => {
      setShowLocationSheet(false)
    }, [])

    useEffect(() => {
      if (!hydrated) return
      const listing =
        pathname?.startsWith('/grocery')
          ? 'grocery'
          : pathname?.startsWith('/order') || pathname?.startsWith('/restaurants')
            ? 'food'
            : ''
      const params = new URLSearchParams(restaurantGeoQs || '')
      if (listing) params.set('listing', listing)
      const q = params.toString() ? `?${params.toString()}` : ''
      fetch(`/api/restaurants${q}`)
        .then((res) => res.json())
        .then((data) => setRestaurantList(Array.isArray(data) ? data : []))
        .catch(() => setRestaurantList([]))
    }, [restaurantGeoQs, hydrated, pathname])

    // When on city/area page, location comes from URL sync — no auto GPS override.

    const getLocation = () => {
      openAutoDetectCurrentLocation()
    }

    const openManualLocationEntry = () => {
      setShowLocationWelcomeModal(false)
      setWelcomeDetectError(null)
      setShowLocationPopup(false)
      window.requestAnimationFrame(() => {
        setShowLocationSheet(true)
      })
    }

    const openAutoDetectCurrentLocation = () => {
      setWelcomeDetectError(null)
      setShowLocationPopup(false)
      setAutoDetecting(true)
      markAutoDetectInFlight(true)

      const pending = detectCurrentLocation()
      void pending
        .then((result) => {
          if (result.ok) {
            const area =
              (result.area && result.area.trim()) ||
              result.displayName.split(',')[0]?.trim() ||
              result.displayName
            handleSelectLocation(result.displayName, {
              id: 0,
              location_name: area,
              city: result.city || '',
              latitude: result.lat,
              longitude: result.lon,
              label: 'CURRENT LOCATION',
            })
            return
          }
          setWelcomeDetectError(locationAutoDetectErrorMessage(result))
        })
        .finally(() => {
          setAutoDetecting(false)
          markAutoDetectInFlight(false)
        })
    }

    const handleSelectLocation = (displayName: string, item?: LocationItem) => {
      markLocationSelected()
      const nextPath = getMagicpinPathAfterLocationSelect(pathname ?? '', displayName, item)
      if (nextPath) {
        const merged = mergeLocationQuery(
          queryFromLocation(),
          new URLSearchParams(
            (() => {
              const p = new URLSearchParams()
              p.set('location', displayName)
              if (item?.latitude != null && item?.longitude != null) {
                p.set('lat', String(item.latitude))
                p.set('lon', String(item.longitude))
              }
              return p.toString()
            })()
          )
        )
        const url = mergeLocationNavigationUrl(
          nextPath,
          merged
        )
        router.replace(url, { scroll: false })
      }
      setLocationSearchQuery('')
      setShowLocationPopup(false)
      setShowLocationSheet(false)
      setShowLocationWelcomeModal(false)
      setWelcomeDetectError(null)
      setGlobalLocation(displayName, item?.latitude ?? undefined, item?.longitude ?? undefined, {
        userInitiated: true,
        source: 'selected',
      })
    }


    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
    useEffect(() => {
      const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300)
      return () => clearTimeout(t)
    }, [searchQuery])

    const handleLandingSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setSearchQuery(value)
      if (!value.trim()) {
        setSearchResults([])
        setSearchLoading(false)
        setShowSearchResults(false)
        return
      }
      setShowSearchResults(true)
    }

    useEffect(() => {
      if (!debouncedSearchQuery.trim()) {
        setSearchResults([])
        setSearchLoading(false)
        return
      }
      setSearchLoading(true)
      fetch(`/api/search?q=${encodeURIComponent(debouncedSearchQuery)}`)
        .then(res => res.json())
        .then((data: unknown) => {
          const hasError = typeof data === 'object' && data !== null && 'error' in data
          const list = Array.isArray(data) && !hasError ? data : []
          setSearchResults(list)
          setSearchLoading(false)
        })
        .catch(() => {
          setSearchResults([])
          setSearchLoading(false)
        })
    }, [debouncedSearchQuery])

    // Close search results when clicking outside (search bar or suggestions modal)
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node
        const inSearch = searchRef.current?.contains(target)
        const inResults = searchResultsRef.current?.contains(target)
        const inMobileSearch = mobileSearchRef.current?.contains(target)
        const inMobileResults = mobileSearchResultsRef.current?.contains(target)
        if (!inSearch && !inResults && !inMobileSearch && !inMobileResults) setShowSearchResults(false)
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isBusinessDropdownOpen, setIsBusinessDropdownOpen] = useState(false)
  const [isLandingBusinessOpen, setIsLandingBusinessOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)
  const [showAppLinkToast, setShowAppLinkToast] = useState(false)
  const [headerScrolled, setHeaderScrolled] = useState(false)

  const openAppDownloadModal = useCallback(() => {
    setIsMobileMenuOpen(false)
    setShowAppDownloadModal(true)
  }, [])
  const [searchPlaceholder, setSearchPlaceholder] = useState('Search restaurants or dishes')
  const { user, isAuthenticated } = useAppSelector(state => state.auth)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const landingBusinessRef = useRef<HTMLDivElement>(null)
    const mobileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isLandingNavItemActive = (href: string) => {
    if (href === '#') return false
    if (href === '/') return pathname === '/'
    if (href === '/india/All/Stores') {
      return (
        pathname === '/india/All/Stores' ||
        (pathname != null && /^\/india\/[^/]+\/[^/]+\/All\/Stores$/.test(pathname))
      )
    }
    return pathname === href
  }

  useEffect(() => {
    setSearchPlaceholder('Search restaurants or dishes')
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsBusinessDropdownOpen(false)
      }
      if (landingBusinessRef.current && !landingBusinessRef.current.contains(event.target as Node)) {
        setIsLandingBusinessOpen(false)
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false)
      }
    }

    if (isBusinessDropdownOpen || isLandingBusinessOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isBusinessDropdownOpen, isLandingBusinessOpen, isMobileMenuOpen])

  const authCtaClass =
    'font-lora inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-[#109D4C] px-5 text-[14px] font-bold tracking-wide text-white shadow-none transition hover:bg-[#0d8a42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/45'
  const authGhostClass =
    'font-lora inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-4 text-[14px] font-bold text-neutral-900 shadow-none transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C]/35'

  return (
    <>
      <div
        className={`overflow-visible ${
          showLandingHeaderShell
            ? 'pointer-events-none fixed inset-x-0 top-0 z-[220] border-0 bg-transparent'
            : `relative ${
                showLocationSheet
                  ? 'z-[100]'
                  : showSearchResults && searchQuery
                    ? 'z-[50]'
                    : ''
              }`
        }`}
      >
        {/* Header content */}
        <header
          className={
            showLandingHeaderShell
              ? 'landing-hero-ref relative z-10 px-0 pt-0 pb-0 text-neutral-900'
              : 'text-white py-4 px-5 md:px-20 pb-[160px] rounded-b-[90px] relative z-10'
          }
        >
          {/* Navbar — inner pages only (not home / not about); landing-style bar is inside hero card below */}
          {!showLandingHeaderShell && (
          <div className="relative z-[100] mx-auto mb-6 max-w-[1400px] rounded-2xl border border-black/[0.06] bg-white/95 px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:px-5 md:px-6 md:py-3">
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/"
                className="flex shrink-0 items-center no-underline"
                aria-label="GatiMitra home"
              >
                <div className="relative flex h-9 items-center sm:h-10 md:h-11">
                  <GatiMitraLogo
                    alt="GatiMitra"
                    className="h-full w-auto max-w-[168px] object-contain sm:max-w-[190px]"
                  />
                </div>
              </Link>

              <nav className="hidden md:flex gap-2 items-center">
                <Link href="/about" className="font-lora rounded-full px-3 py-2 text-[14.5px] font-semibold text-neutral-800 no-underline transition hover:bg-[#109D4C]/08 hover:text-[#0d8a42]">
                  About
                </Link>
                <Link href="/india/All/Stores" className="font-lora rounded-full px-3 py-2 text-[14.5px] font-semibold text-neutral-800 no-underline transition hover:bg-[#109D4C]/08 hover:text-[#0d8a42]">
                  Around You
                </Link>
                
                <div className="relative inline-block shrink-0 align-middle" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsBusinessDropdownOpen(!isBusinessDropdownOpen)}
                    className="font-lora flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-transparent px-3 py-2 text-[14.5px] font-semibold text-neutral-800 no-underline transition hover:bg-[#109D4C]/08 hover:text-[#0d8a42]"
                    aria-expanded={isBusinessDropdownOpen}
                    aria-haspopup="menu"
                  >
                    Business
                    <i
                      className={`fas fa-chevron-down text-[10px] opacity-80 transition-transform duration-200 ${isBusinessDropdownOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {isBusinessDropdownOpen && (
                    <div
                      className="animate-fadeIn absolute left-1/2 top-full z-[200] mt-1 min-w-[min(100vw-1.5rem,268px)] w-max -translate-x-1/2 pt-1.5"
                      role="menu"
                    >
                      {/* Upward caret (beak) toward trigger */}
                      <div
                        className="pointer-events-none absolute left-1/2 top-1 z-[2] h-0 w-0 -translate-x-1/2 border-x-[9px] border-x-transparent border-b-[10px] border-b-white drop-shadow-[0_-1px_0_rgba(0,0,0,0.04)]"
                        aria-hidden
                      />
                      <div
                        className="pointer-events-none absolute left-1/2 top-[5px] z-[1] h-0 w-0 -translate-x-1/2 border-x-[10px] border-x-transparent border-b-[11px] border-b-gray-200/90"
                        aria-hidden
                      />
                      <div className="relative z-[3] overflow-hidden rounded-[10px] border border-gray-200/95 bg-white py-0.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)]">
                        <a
                          href="https://partner.gatimitra.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsBusinessDropdownOpen(false)}
                          className="flex items-center justify-between gap-2.5 px-3.5 py-2 text-left text-[14px] font-medium text-gray-900 no-underline transition-colors hover:bg-gray-50"
                          role="menuitem"
                        >
                          <span>Register as Merchant</span>
                          <i className="fas fa-chevron-right text-[10px] text-[#109D4C] opacity-90" aria-hidden />
                        </a>
                        <div className="mx-3 h-px bg-gray-100" aria-hidden />
                        <a
                          href="https://partner.gatimitra.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsBusinessDropdownOpen(false)}
                          className="flex items-center justify-between gap-2.5 px-3.5 py-2 text-left text-[14px] font-medium text-gray-900 no-underline transition-colors hover:bg-gray-50"
                          role="menuitem"
                        >
                          <span>Register as Brand</span>
                          <i className="fas fa-chevron-right text-[10px] text-[#109D4C] opacity-90" aria-hidden />
                        </a>
                        <div className="mx-3 h-px bg-gray-100" aria-hidden />
                        <a
                          href="/corporates"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsBusinessDropdownOpen(false)}
                          className="flex items-center justify-between gap-2.5 px-3.5 py-2 text-left text-[14px] font-medium text-gray-900 no-underline transition-colors hover:bg-gray-50"
                          role="menuitem"
                        >
                          <span>For Corporates</span>
                          <i className="fas fa-chevron-right text-[10px] text-[#109D4C] opacity-90" aria-hidden />
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                <GetAppNavControl onOpen={openAppDownloadModal} tone="nav" />

                {isAuthenticated && user ? (
                  <button 
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsProfileModalOpen(true)
                    }}
                    className={authGhostClass}
                    type="button"
                  >
                    <i className="fas fa-user text-[11px] text-[#109D4C]" aria-hidden />
                    {user.name || user.phone}
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsAuthModalOpen(true)
                    }}
                    className={authCtaClass}
                    type="button"
                  >
                    Sign in
                  </button>
                )}
              </nav>

              {/* Mobile hamburger — inner pages only; home menu is in the hero card */}
              <div className="md:hidden relative shrink-0" ref={mobileMenuRef}>
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 shadow-sm transition hover:border-[#109D4C]/40"
                  aria-label="Toggle menu"
                >
                  <div className="flex h-3.5 w-4 flex-col justify-between">
                    <span className={`block h-0.5 w-full rounded bg-neutral-800 transition-all duration-300 ${isMobileMenuOpen ? 'translate-y-[6px] rotate-45' : ''}`} />
                    <span className={`block h-0.5 w-full rounded bg-neutral-800 transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
                    <span className={`block h-0.5 w-full rounded bg-neutral-800 transition-all duration-300 ${isMobileMenuOpen ? '-translate-y-[6px] -rotate-45' : ''}`} />
                  </div>
                </button>

                {isMobileMenuOpen && (
                  <div className="absolute top-12 right-0 bg-white rounded-[16px] shadow-[0_12px_40px_rgba(0,0,0,0.15)] min-w-[280px] overflow-hidden z-[200] py-3 animate-fadeIn border border-gray-100">
                    <Link 
                      href="/" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-[15px] font-medium text-neutral-800 no-underline transition hover:bg-[#109D4C]/06 hover:text-[#0d8a42]"
                    >
                      Home
                    </Link>
                    <Link 
                      href="/about" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-[15px] font-medium text-neutral-800 no-underline transition hover:bg-[#109D4C]/06 hover:text-[#0d8a42]"
                    >
                      About
                    </Link>
                    <Link 
                      href="/india/All/Stores" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-[15px] font-medium text-neutral-800 no-underline transition hover:bg-[#109D4C]/06 hover:text-[#0d8a42]"
                    >
                      Around You
                    </Link>
                    <a
                      href="https://partner.gatimitra.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-[15px] font-medium text-neutral-800 no-underline transition hover:bg-[#109D4C]/06 hover:text-[#0d8a42]"
                    >
                      Register as Merchant
                    </a>
                    <a
                      href="https://partner.gatimitra.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-[15px] font-medium text-neutral-800 no-underline transition hover:bg-[#109D4C]/06 hover:text-[#0d8a42]"
                    >
                      Register as Brand
                    </a>
                    <a
                      href="/corporates"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-[15px] font-medium text-neutral-800 no-underline transition hover:bg-[#109D4C]/06 hover:text-[#0d8a42]"
                    >
                      For Corporates
                    </a>
                    <GetAppNavControl onOpen={openAppDownloadModal} tone="drawer" />
                    {isAuthenticated && user ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setIsMobileMenuOpen(false)
                          setIsProfileModalOpen(true)
                        }}
                        className="mx-5 mb-3 mt-1 w-[calc(100%-2.5rem)]"
                        type="button"
                      >
                        <span className={`w-full ${authGhostClass}`}>{user.name || user.phone}</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setIsMobileMenuOpen(false)
                          setIsAuthModalOpen(true)
                        }}
                        className={`mx-5 mb-3 mt-1 w-[calc(100%-2.5rem)] ${authCtaClass}`}
                        type="button"
                      >
                        Sign in
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Professional landing navbar */}
          {showLandingHeaderShell && (
            <div className="landing-nav-shell w-full">
              <div className="pointer-events-auto relative z-[100] mx-auto w-full overflow-visible pl-0 pr-3 pt-0 sm:pr-4 lg:pr-5">
                {isCorporatesPage ? (
                  <Link
                    href="/"
                    className="landing-logo-island flex w-full max-w-md items-center gap-3 no-underline outline-none transition-opacity hover:opacity-90 sm:gap-4"
                    aria-label="GatiMitra for Corporates — home"
                  >
                    <div className="flex h-9 shrink-0 items-center md:h-10">
                      <GatiMitraLogo
                        alt=""
                        className="h-full w-auto max-w-[min(46vw,200px)] object-contain object-left sm:max-w-[220px]"
                      />
                    </div>
                    <span className="h-9 w-px shrink-0 self-center bg-neutral-300/90 md:h-10" aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
                      <span className="text-[0.65rem] font-medium lowercase leading-tight tracking-wide text-neutral-500 sm:text-[11px]">
                        gatimitra for
                      </span>
                      <span className="font-lora text-base font-bold italic leading-none tracking-tight text-neutral-900 sm:text-lg md:text-xl">
                        Corporates
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div className="flex w-full flex-nowrap items-start gap-3 overflow-visible sm:gap-3.5">
                    {/* CoLabs-style logo TAB — flush top-left + bottom-right curve */}
                    <Link
                      href="/"
                      className="landing-logo-island shrink-0 no-underline"
                      aria-label="GatiMitra home"
                    >
                      <GatiMitraLogo
                        alt="GatiMitra"
                        className="relative z-[1] h-9 w-auto max-w-[148px] object-contain sm:h-10 sm:max-w-[180px] lg:max-w-[200px]"
                      />
                    </Link>

                    {/* Glass nav pill — fills remaining right width */}
                    <div className="landing-nav-pill min-w-0 flex-1 flex-nowrap overflow-visible">
                      <nav
                        className="hidden shrink-0 items-center gap-1 overflow-visible xl:flex"
                        aria-label="Primary"
                      >
                        {LANDING_TOP_NAV.map((item) => {
                          const active = isLandingNavItemActive(item.href)
                          return (
                            <Link
                              key={item.label}
                              href={item.href}
                              className={`font-lora relative whitespace-nowrap rounded-full px-3 py-2 text-[14px] no-underline transition-colors ${
                                active
                                  ? 'font-bold text-neutral-950'
                                  : 'font-semibold text-neutral-800 hover:bg-black/[0.05] hover:text-neutral-950'
                              }`}
                            >
                              {item.label}
                              {active ? (
                                <span
                                  className="absolute inset-x-3 -bottom-0.5 h-[2px] rounded-full bg-[#109D4C]"
                                  aria-hidden
                                />
                              ) : null}
                            </Link>
                          )
                        })}

                        <div className="relative z-[210]" ref={landingBusinessRef}>
                          <button
                            type="button"
                            onClick={() => setIsLandingBusinessOpen((o) => !o)}
                            className={`font-lora inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[14px] transition-colors ${
                              isLandingBusinessOpen
                                ? 'bg-black/[0.06] font-bold text-neutral-950'
                                : 'font-semibold text-neutral-800 hover:bg-black/[0.05] hover:text-neutral-950'
                            }`}
                            aria-expanded={isLandingBusinessOpen}
                            aria-haspopup="menu"
                          >
                            Business
                            <i
                              className={`fas fa-chevron-down text-[10px] opacity-70 transition-transform duration-200 ${isLandingBusinessOpen ? 'rotate-180' : ''}`}
                              aria-hidden
                            />
                          </button>
                          {isLandingBusinessOpen && (
                            <div
                              className="animate-fadeIn absolute left-1/2 top-full z-[300] mt-2 min-w-[260px] -translate-x-1/2"
                              role="menu"
                            >
                              <div className="overflow-hidden rounded-2xl border border-black/10 bg-white py-1.5 shadow-none">
                                {LANDING_BUSINESS_ITEMS.map((item, i) => (
                                  <a
                                    key={item.label}
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setIsLandingBusinessOpen(false)}
                                    className={`font-lora flex items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] font-semibold text-neutral-900 no-underline transition-colors hover:bg-[#109D4C]/06 ${
                                      i > 0 ? 'border-t border-neutral-100' : ''
                                    }`}
                                    role="menuitem"
                                  >
                                    <span className="inline-flex items-center gap-2.5">
                                      <i className={`fas ${item.icon} text-[12px] text-[#109D4C]`} aria-hidden />
                                      {item.label}
                                    </span>
                                    <i className="fas fa-arrow-up-right-from-square text-[10px] text-neutral-400" aria-hidden />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </nav>

                      {(isLandingHeroPage || isAroundYouPage) && !isAboutPage && !isCorporatesPage && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setLocationSearchQuery('')
                              setShowLocationSheet(true)
                            }}
                            className="inline-flex h-9 max-w-[200px] shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-2.5 text-left shadow-none transition hover:bg-white sm:max-w-[240px] sm:px-3"
                          >
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#109D4C]/12 text-[#109D4C]">
                              <i className="fas fa-location-dot text-[11px]" aria-hidden />
                            </span>
                            <span className="font-lora min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-900">
                              <span className="text-neutral-500">Deliver to </span>
                              {isCityAreaRoute && locationState.displayName
                                ? locationState.displayName
                                : headerLocationLabel}
                            </span>
                            <i className="fas fa-chevron-down shrink-0 text-[9px] text-neutral-500" aria-hidden />
                          </button>

                          <div className="relative min-w-[10rem] flex-1 basis-[12rem]" ref={searchRef}>
                            <div className="flex h-9 w-full items-center rounded-full bg-white/90 px-2.5 shadow-none transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#109D4C]/20 sm:px-3">
                              <i className="fas fa-magnifying-glass mr-1.5 shrink-0 text-[12px] text-neutral-500 sm:mr-2" aria-hidden />
                              <input
                                type="search"
                                placeholder={searchPlaceholder}
                                className="font-lora w-full min-w-0 bg-transparent text-[13px] font-medium text-neutral-900 placeholder:truncate placeholder:text-neutral-500 focus:outline-none"
                                value={searchQuery}
                                onChange={handleLandingSearchInput}
                                onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
                                aria-label="Search restaurants or dishes"
                              />
                              {searchQuery ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSearchQuery('')
                                    setShowSearchResults(false)
                                  }}
                                  className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-neutral-800"
                                  aria-label="Clear search"
                                >
                                  <i className="fas fa-xmark text-[11px]" aria-hidden />
                                </button>
                              ) : null}
                            </div>

                            {showSearchResults && searchQuery ? (
                              <div
                                ref={searchResultsRef}
                                className="absolute left-0 right-0 top-full z-[120] mt-2 min-w-[min(100%,360px)]"
                              >
                                <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-none">
                                  {searchLoading && (
                                    <div className="px-6 py-8 text-center">
                                      <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#109D4C] border-t-transparent" />
                                      <div className="text-sm text-neutral-500">
                                        Searching for &quot;{debouncedSearchQuery || searchQuery}&quot;...
                                      </div>
                                    </div>
                                  )}
                                  {!searchLoading && searchResults.length > 0 && (
                                    <div className="max-h-[420px] overflow-y-auto py-1" ref={mobileSearchResultsRef}>
                                      {searchResults.map((item: any, idx: number) => {
                                        const href =
                                          item.type === 'dish'
                                            ? `/order?restaurant=${item.restaurant_id}`
                                            : restaurantDetailHref(
                                                {
                                                  public_slug: item.public_slug,
                                                  store_id: item.restaurant_id,
                                                  id: item.restaurant_id,
                                                },
                                                'search',
                                                mergeLocationQuery(
                                                  queryFromLocation(),
                                                  buildLocationQueryFromState(locationState)
                                                )
                                              )
                                        const ResultLink = item.type === 'dish' ? Link : StoreInnerLink
                                        return (
                                          <ResultLink
                                            key={`${item.type || 'item'}-${item.id || item.restaurant_id || idx}`}
                                            href={href}
                                            onClick={() => setShowSearchResults(false)}
                                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50"
                                          >
                                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-neutral-100">
                                              {item.image_url ? (
                                                <img
                                                  src={item.image_url}
                                                  alt={item.item_name || item.restaurant_name || item.name || 'result'}
                                                  className="h-full w-full object-cover"
                                                />
                                              ) : (
                                                <i className="fas fa-utensils text-neutral-400" aria-hidden />
                                              )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="truncate text-sm font-semibold text-neutral-900">
                                                {item.item_name || item.restaurant_name || item.name}
                                              </div>
                                              <div className="truncate text-xs text-neutral-500">
                                                {item.type === 'dish' ? 'Dish' : 'Restaurant'} · available on GatiMitra
                                              </div>
                                            </div>
                                          </ResultLink>
                                        )
                                      })}
                                    </div>
                                  )}
                                  {!searchLoading && searchResults.length === 0 && debouncedSearchQuery && (
                                    <div className="px-6 py-8 text-center">
                                      <div className="mb-2 text-sm font-semibold text-neutral-600">
                                        No results for &quot;{debouncedSearchQuery}&quot;
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setShowSearchResults(false)}
                                        className="text-xs font-semibold text-[#109D4C] hover:underline"
                                      >
                                        Clear search
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </>
                      )}

                      <div className="flex shrink-0 flex-nowrap items-center gap-2 pl-1">
                        <div className="hidden sm:block">
                          <GetAppNavControl onOpen={openAppDownloadModal} tone="landing" />
                        </div>

                        {isAuthenticated && user ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setIsProfileModalOpen(true)
                            }}
                            className={`hidden sm:inline-flex ${authGhostClass}`}
                          >
                            <i className="fas fa-user text-[11px] text-[#109D4C]" aria-hidden />
                            <span className="max-w-[100px] truncate">{user.name || user.phone}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setIsAuthModalOpen(true)
                            }}
                            className={`hidden sm:inline-flex ${authCtaClass}`}
                          >
                            Sign in
                          </button>
                        )}

                        <div className="relative shrink-0 xl:hidden" ref={mobileMenuRef}>
                          <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-neutral-900 shadow-none transition hover:bg-white"
                            aria-label="Toggle menu"
                            aria-expanded={isMobileMenuOpen}
                          >
                            <div className="flex h-3.5 w-4 flex-col justify-between">
                              <span className={`block h-0.5 w-full rounded bg-neutral-900 transition-all duration-300 ${isMobileMenuOpen ? 'translate-y-[6px] rotate-45' : ''}`} />
                              <span className={`block h-0.5 w-full rounded bg-neutral-900 transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
                              <span className={`block h-0.5 w-full rounded bg-neutral-900 transition-all duration-300 ${isMobileMenuOpen ? '-translate-y-[6px] -rotate-45' : ''}`} />
                            </div>
                          </button>

                          {isMobileMenuOpen && (
                            <div className="animate-fadeIn absolute right-0 top-12 z-[200] w-[min(92vw,300px)] overflow-hidden rounded-2xl border border-black/10 bg-white py-2 shadow-none">
                              {LANDING_MOBILE_LINKS.map((item) => {
                                const rowClass =
                                  'font-lora flex items-center gap-3 px-4 py-2.5 text-[15px] font-semibold text-neutral-800 no-underline transition-colors hover:bg-[#109D4C]/06 hover:text-[#0d8a42]'
                                if (item.label === 'Get App') {
                                  return (
                                    <div key={item.label} className="border-t border-neutral-100 sm:hidden">
                                      <GetAppNavControl onOpen={openAppDownloadModal} tone="drawer" />
                                    </div>
                                  )
                                }
                                const inner = (
                                  <>
                                    <i className={`fas ${item.icon} w-4 text-center text-[13px] text-[#109D4C]`} aria-hidden />
                                    {item.label}
                                  </>
                                )
                                if (item.href.startsWith('http') || item.openInNewTab) {
                                  return (
                                    <a
                                      key={item.label}
                                      href={item.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => setIsMobileMenuOpen(false)}
                                      className={rowClass}
                                    >
                                      {inner}
                                    </a>
                                  )
                                }
                                return (
                                  <Link
                                    key={item.label}
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={rowClass}
                                  >
                                    {inner}
                                  </Link>
                                )
                              })}
                              <div className="border-t border-neutral-100 px-4 pb-3 pt-2 sm:hidden">
                                {isAuthenticated && user ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      setIsMobileMenuOpen(false)
                                      setIsProfileModalOpen(true)
                                    }}
                                    className={`w-full ${authGhostClass}`}
                                  >
                                    {user.name || user.phone}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      setIsMobileMenuOpen(false)
                                      setIsAuthModalOpen(true)
                                    }}
                                    className={`w-full ${authCtaClass}`}
                                  >
                                    Sign in
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </header>
      </div>

      <LocationWelcomeModal
        isOpen={showLocationWelcomeModal}
        onClose={closeLocationWelcomeModal}
        onAutoDetect={openAutoDetectCurrentLocation}
        onManualEntry={openManualLocationEntry}
        detecting={autoDetecting}
        errorMessage={welcomeDetectError}
      />

      <LocationSheet
        isOpen={showLocationSheet}
        onClose={closeLocationSheet}
        onSelectLocation={handleSelectLocation}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <UserProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      <AppDownloadModal
        isOpen={showAppDownloadModal}
        onClose={() => setShowAppDownloadModal(false)}
        variant="customer"
        title="Get the GatiMitra App"
        description="For a better experience, please order through our mobile app."
        onLinkSent={() => setShowAppLinkToast(true)}
      />
      <AppLinkSentToast open={showAppLinkToast} onClose={() => setShowAppLinkToast(false)} />
    </>
  )
}