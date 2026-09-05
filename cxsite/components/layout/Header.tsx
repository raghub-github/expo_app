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

  const openAppDownloadModal = useCallback(() => {
    setIsMobileMenuOpen(false)
    setShowAppDownloadModal(true)
  }, [])
  const [searchPlaceholder, setSearchPlaceholder] = useState('Search restaurants or dishes')
  const { user, isAuthenticated } = useAppSelector(state => state.auth)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const landingBusinessRef = useRef<HTMLDivElement>(null)
    const mobileMenuRef = useRef<HTMLDivElement>(null)

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

  return (
    <>
      <div
        className={`relative overflow-visible ${isAboutPage || isCorporatesPage || isAroundYouPage ? 'bg-white' : ''} ${
          isCorporatesPage
            ? 'sticky top-0 z-[220] border-b border-rose-100/40 bg-[#fdfaf9]/98 backdrop-blur-md shadow-none'
            : isAboutPage || isAroundYouPage
            ? 'sticky top-0 z-[220] border-b-0 bg-[#f3f3f3]/98 backdrop-blur-md shadow-none'
            : showLocationSheet
              ? 'z-[100]'
              : showSearchResults && searchQuery
                ? 'z-[50]'
                : ''
        }`}
      >
        {/* Header content */}
        <header
          className={
            showLandingHeaderShell
              ? 'landing-hero-ref relative z-10 px-0 pt-0 pb-0 text-black'
              : 'text-white py-4 px-5 md:px-20 pb-[160px] rounded-b-[90px] relative z-10'
          }
        >
          {/* Navbar — inner pages only (not home / not about); landing-style bar is inside hero card below */}
          {!showLandingHeaderShell && (
          <div className="relative z-[100] max-w-[1400px] mx-auto mb-[24px] bg-[rgba(255,255,255,0.95)] backdrop-blur-[16px] rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.08)] px-4 md:px-[28px] py-3 md:py-[14px]">
            <div className="flex justify-between items-center">
              <Link
                href="/"
                className="flex items-center gap-2 md:gap-3"
              >
                <div className="relative flex-shrink-0 logo-blink">
                  <GatiMitraLogo
                    alt="GatiMitra Logo"
                    className="h-10 md:h-12 w-auto object-contain"
                  />
                </div>
              </Link>

              <nav className="hidden md:flex gap-6 items-center">
                <Link href="/about" className="text-text no-underline font-medium text-[14px] px-3 py-2 rounded-lg transition-all duration-200 relative flex items-center gap-1.5 hover:text-purple hover:bg-[rgba(75,42,212,0.08)]">
                  <i className="fas fa-info-circle text-[13px]"></i> About
                </Link>
                <Link href="#" className="text-text no-underline font-medium text-[14px] px-3 py-2 rounded-lg transition-all duration-200 relative flex items-center gap-1.5 hover:text-purple hover:bg-[rgba(75,42,212,0.08)]">
                  <i className="fas fa-map-marker-alt text-[13px]"></i> Around You
                </Link>
                
                <div className="relative inline-block shrink-0 align-middle" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsBusinessDropdownOpen(!isBusinessDropdownOpen)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-3 py-2 text-[14px] font-semibold text-text no-underline transition-all duration-200 hover:bg-[rgba(75,42,212,0.08)] hover:text-purple"
                    aria-expanded={isBusinessDropdownOpen}
                    aria-haspopup="menu"
                  >
                    <i className="fas fa-briefcase text-[13px]"></i> Business
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
                      console.log('Profile button clicked')
                      setIsProfileModalOpen(true)
                    }}
                    className="bg-gradient-to-br from-purple to-[#6a3aff] text-white px-6 py-2.5 rounded-xl font-semibold text-[14px] transition-all duration-200 shadow-[0_4px_16px_rgba(75,42,212,0.25)] hover:shadow-[0_6px_20px_rgba(75,42,212,0.35)] hover:-translate-y-0.5 relative overflow-hidden z-50"
                    type="button"
                  >
                    <i className="fas fa-user-circle mr-1.5 text-[13px]"></i>
                    {user.name || user.phone}
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      console.log('Auth button clicked, opening modal')
                      setIsAuthModalOpen(true)
                    }}
                    className="bg-gradient-to-br from-purple to-[#6a3aff] text-white px-6 py-2.5 rounded-xl font-semibold text-[14px] transition-all duration-200 shadow-[0_4px_16px_rgba(75,42,212,0.25)] hover:shadow-[0_6px_20px_rgba(75,42,212,0.35)] hover:-translate-y-0.5 relative overflow-hidden cursor-pointer z-50"
                    type="button"
                  >
                    <i className="fas fa-user-circle mr-1.5 text-[13px]"></i> Sign In / Up
                  </button>
                )}
              </nav>

              {/* Mobile hamburger — inner pages only; home menu is in the hero card */}
              <div className="md:hidden relative shrink-0" ref={mobileMenuRef}>
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="text-text p-2 rounded-lg hover:bg-[rgba(75,42,212,0.08)] transition-all"
                  aria-label="Toggle menu"
                >
                  <div className="w-6 h-5 flex flex-col justify-between">
                    <span className={`block h-0.5 w-full bg-text transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
                    <span className={`block h-0.5 w-full bg-text transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`}></span>
                    <span className={`block h-0.5 w-full bg-text transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
                  </div>
                </button>

                {isMobileMenuOpen && (
                  <div className="absolute top-12 right-0 bg-white rounded-[16px] shadow-[0_12px_40px_rgba(0,0,0,0.15)] min-w-[280px] overflow-hidden z-[200] py-3 animate-fadeIn border border-gray-100">
                    <Link 
                      href="/" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-gray-700 no-underline font-medium text-[15px] transition-all hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)] hover:text-purple"
                    >
                      <i className="fas fa-home mr-3 text-[14px] text-purple"></i> Home
                    </Link>
                    <Link 
                      href="/about" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-gray-700 no-underline font-medium text-[15px] transition-all hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)] hover:text-purple"
                    >
                      <i className="fas fa-info-circle mr-3 text-[14px] text-purple"></i> About
                    </Link>
                    <Link 
                      href="#" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-gray-700 no-underline font-medium text-[15px] transition-all hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)] hover:text-purple"
                    >
                      <i className="fas fa-map-marker-alt mr-3 text-[14px] text-purple"></i> Around You
                    </Link>
                    <a
                      href="https://partner.gatimitra.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-gray-700 no-underline font-medium text-[15px] transition-all hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)] hover:text-purple"
                    >
                      <i className="fas fa-store mr-3 text-[14px] text-purple"></i> Register as Merchant
                    </a>
                    <a
                      href="https://partner.gatimitra.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-gray-700 no-underline font-medium text-[15px] transition-all hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)] hover:text-purple"
                    >
                      <i className="fas fa-tag mr-3 text-[14px] text-purple"></i> Register as Brand
                    </a>
                    <a
                      href="/corporates"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-gray-700 no-underline font-medium text-[15px] transition-all hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)] hover:text-purple"
                    >
                      <i className="fas fa-building mr-3 text-[14px] text-purple"></i> GatiMitra for Corporates
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
                        className="w-full px-5 py-3 text-left"
                        type="button"
                      >
                        <div className="text-gray-700 font-medium text-[15px] flex items-center gap-3 hover:text-purple transition-colors">
                          <i className="fas fa-user-circle text-[14px] text-purple"></i>
                          {user.name || user.phone}
                          <i className="fas fa-chevron-right text-[10px] text-gray-400 ml-auto"></i>
                        </div>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setIsMobileMenuOpen(false)
                          setIsAuthModalOpen(true)
                        }}
                        className="w-[calc(100%-2.5rem)] mx-5 mb-3 bg-gradient-to-br from-purple to-[#6a3aff] text-white px-6 py-3 rounded-xl font-semibold text-[15px] transition-all duration-200 shadow-[0_4px_16px_rgba(75,42,212,0.25)] hover:shadow-[0_6px_20px_rgba(75,42,212,0.35)]"
                        type="button"
                      >
                        <i className="fas fa-user-circle mr-2"></i> Sign In / Up
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Landing-style navbar shell (hero is a sibling section on landing pages) */}
          {showLandingHeaderShell && (
              <div className="landing-nav-shell w-full">
                {/* Integrated top bar — overflow-visible so Business dropdown is not clipped */}
                <div
                  className={`relative z-[100] w-full shrink-0 overflow-visible px-3 sm:px-4 md:px-5 lg:px-6 xl:px-8 ${
                    isCorporatesPage
                      ? 'border-b border-rose-100/35 bg-[#fdfaf9] py-2 sm:py-2.5'
                      : `py-3 ${
                          isAboutPage || isAroundYouPage
                            ? 'bg-transparent'
                            : 'border-b border-black/[0.05] bg-transparent'
                        }`
                  }`}
                >
                  {isCorporatesPage ? (
                    <Link
                      href="/"
                      className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-0 no-underline outline-none transition-opacity hover:opacity-90 sm:gap-4 sm:px-1"
                      aria-label="GatiMitra for Corporates — home"
                    >
                      <div className="flex h-9 shrink-0 items-center md:h-10">
                        <GatiMitraLogo
                          alt=""
                          className="h-full w-auto max-w-[min(46vw,200px)] object-contain object-left sm:max-w-[220px]"
                        />
                      </div>
                      <span
                        className="h-9 w-px shrink-0 self-center bg-neutral-300/90 md:h-10"
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
                        <span className="text-[0.65rem] font-medium lowercase leading-tight tracking-wide text-neutral-500 sm:text-[11px]">
                          gatimitra for
                        </span>
                        <span className="text-base font-bold italic leading-none tracking-tight text-neutral-900 sm:text-lg md:text-xl">
                          Corporates
                        </span>
                        <span className="line-clamp-2 text-[10px] leading-snug text-neutral-500 sm:line-clamp-none sm:text-[11px] sm:leading-relaxed md:text-xs">
                          Workplace meals, events and billing—hyperlocal, GST-ready, one partner.
                        </span>
                      </div>
                    </Link>
                  ) : (
                  <div className="flex w-full items-center justify-between gap-2 overflow-visible md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-3 md:overflow-visible lg:gap-4">
                    <Link
                      href="/"
                      className="flex w-max max-w-[min(100%,calc(100vw-8rem))] shrink-0 items-center gap-3 pr-2 no-underline md:justify-self-start"
                    >
                      <div className="relative flex h-10 shrink-0 items-center justify-center md:h-12">
                        <GatiMitraLogo
                          alt="GatiMitra Logo"
                          className="h-full w-auto max-w-[200px] object-contain md:max-w-[230px]"
                        />
                      </div>
                    </Link>

                    <nav
                      className="hidden min-w-0 w-full flex-wrap items-center justify-center gap-x-5 gap-y-1 overflow-visible md:flex md:gap-x-6 md:px-2 lg:gap-x-7 xl:gap-x-8"
                      aria-label="Primary"
                    >
                      {LANDING_TOP_NAV.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          className={`text-center text-[11px] font-medium leading-tight tracking-tight no-underline transition-colors sm:text-[12px] lg:text-[13px] xl:text-[14px] ${
                            isLandingNavItemActive(item.href)
                              ? 'font-semibold text-[#109D4C]'
                              : 'text-black hover:text-[#109D4C]'
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}

                      <div
                        className="relative z-[210] inline-block shrink-0 align-middle"
                        ref={landingBusinessRef}
                      >
                        <button
                          type="button"
                          onClick={() => setIsLandingBusinessOpen((o) => !o)}
                          className={`flex items-center gap-1 text-[11px] font-medium leading-tight tracking-tight transition-colors sm:text-[12px] lg:text-[13px] xl:text-[14px] ${
                            isLandingBusinessOpen ? 'text-black' : 'text-black hover:text-[#109D4C]'
                          }`}
                          aria-expanded={isLandingBusinessOpen}
                          aria-haspopup="menu"
                        >
                          Business
                          <i
                            className={`fas fa-chevron-down text-[9px] opacity-75 transition-transform duration-200 ${isLandingBusinessOpen ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </button>
                        {isLandingBusinessOpen && (
                          <div
                            className="animate-fadeIn absolute left-1/2 top-full z-[300] mt-1 min-w-[min(100vw-1.5rem,268px)] w-max -translate-x-1/2 pt-1.5"
                            role="menu"
                          >
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
                                onClick={() => setIsLandingBusinessOpen(false)}
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
                                onClick={() => setIsLandingBusinessOpen(false)}
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
                                onClick={() => setIsLandingBusinessOpen(false)}
                                className="flex items-center justify-between gap-2.5 px-3.5 py-2 text-left text-[14px] font-medium text-gray-900 no-underline transition-colors hover:bg-gray-50"
                                role="menuitem"
                              >
                                <span>GatiMitra for Corporates</span>
                                <i className="fas fa-chevron-right text-[10px] text-[#109D4C] opacity-90" aria-hidden />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>

                      <GetAppNavControl onOpen={openAppDownloadModal} tone="landing" />
                    </nav>

                    <div className="flex shrink-0 items-center justify-end gap-3 md:justify-self-end lg:gap-4">
                      {(isLandingHeroPage || isAroundYouPage) && !isAboutPage && !isCorporatesPage && (
                        <div className="relative hidden min-w-[340px] max-w-[520px] flex-1 items-center rounded-full border border-gray-200 bg-white px-2.5 py-2 shadow-sm md:flex" ref={searchRef}>
                          <div className="flex min-w-[160px] max-w-[220px] items-center pr-3">
                            <i className="fas fa-map-marker-alt mr-2 text-sm text-[#109D4C]"></i>
                            <button
                              type="button"
                              onClick={() => {
                                setLocationSearchQuery('')
                                setShowLocationSheet(true)
                              }}
                              className="flex w-full items-center justify-between gap-2 bg-transparent pr-1 text-sm text-gray-700"
                            >
                              <span className="truncate">
                                {isCityAreaRoute && locationState.displayName
                                  ? locationState.displayName
                                  : headerLocationLabel}
                              </span>
                              <i className="fas fa-chevron-down ml-1 shrink-0 text-[10px] text-gray-500"></i>
                            </button>
                          </div>

                          <div className="mx-2 h-6 w-px bg-gray-300" />

                          <i className="fas fa-search ml-2 mr-2 text-xs text-gray-400"></i>
                          <input
                            type="text"
                            placeholder={searchPlaceholder}
                            className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
                            value={searchQuery}
                            onChange={handleLandingSearchInput}
                            onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
                          />
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('')
                                setShowSearchResults(false)
                              }}
                              className="ml-2 text-gray-400 hover:text-gray-600"
                              aria-label="Clear search"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          )}

                          {showSearchResults && searchQuery && (
                            <div
                              ref={searchResultsRef}
                              className="absolute right-0 top-full z-[120] mt-2 w-[min(92vw,560px)]"
                            >
                              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
                                {searchLoading && (
                                  <div className="px-6 py-8 text-center">
                                    <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-purple border-t-transparent"></div>
                                    <div className="text-sm text-gray-500">Searching for &quot;{debouncedSearchQuery || searchQuery}&quot;...</div>
                                  </div>
                                )}
                                {!searchLoading && searchResults.length > 0 && (
                                  <div className="max-h-[420px] overflow-y-auto py-1">
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
                                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                                      >
                                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                                          {item.image_url ? (
                                            <img src={item.image_url} alt={item.item_name || item.restaurant_name || item.name || 'result'} className="h-full w-full object-cover" />
                                          ) : (
                                            <span className="text-gray-400">🍽️</span>
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-sm font-semibold text-gray-900">{item.item_name || item.restaurant_name || item.name}</div>
                                          <div className="truncate text-xs text-gray-500">
                                            {item.type === 'dish' ? 'Dish result' : 'Restaurant result'}
                                          </div>
                                        </div>
                                      </ResultLink>
                                      )
                                    })}
                                  </div>
                                )}
                                {!searchLoading && searchResults.length === 0 && debouncedSearchQuery && (
                                  <div className="px-6 py-8 text-center">
                                    <div className="mb-2 text-sm font-semibold text-gray-600">No results for &quot;{debouncedSearchQuery}&quot;</div>
                                    <button
                                      type="button"
                                      onClick={() => setShowSearchResults(false)}
                                      className="text-xs font-medium text-purple hover:underline"
                                    >
                                      Clear search
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {isAuthenticated && user ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setIsProfileModalOpen(true)
                          }}
                          className="hidden whitespace-nowrap rounded-full border border-gray-200 bg-white px-6 py-2.5 text-[14px] font-bold text-gray-800 shadow-sm transition-all hover:bg-gray-50 md:inline-flex md:items-center md:justify-center"
                          type="button"
                        >
                          {user.name || user.phone}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setIsAuthModalOpen(true)
                          }}
                          className="hidden cursor-pointer whitespace-nowrap rounded-full border border-gray-200 bg-white px-6 py-2.5 text-[14px] font-bold text-gray-800 shadow-sm transition-all hover:bg-gray-50 md:inline-flex md:items-center md:justify-center"
                          type="button"
                        >
                          Sign In / Up
                        </button>
                      )}
                      <div className="relative shrink-0 md:hidden" ref={mobileMenuRef}>
                        <button
                          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                          className="rounded-lg p-2 text-text transition-all hover:bg-[rgba(75,42,212,0.08)]"
                          aria-label="Toggle menu"
                          type="button"
                        >
                          <div className="flex h-5 w-6 flex-col justify-between">
                            <span className={`block h-0.5 w-full bg-text transition-all duration-300 ${isMobileMenuOpen ? 'translate-y-2 rotate-45' : ''}`}></span>
                            <span className={`block h-0.5 w-full bg-text transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`}></span>
                            <span className={`block h-0.5 w-full bg-text transition-all duration-300 ${isMobileMenuOpen ? '-translate-y-2 -rotate-45' : ''}`}></span>
                          </div>
                        </button>

                        {isMobileMenuOpen && (
                          <div className="animate-fadeIn absolute right-0 top-12 z-[200] min-w-[280px] overflow-hidden rounded-[16px] border border-gray-100 bg-white py-3 shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
                            {LANDING_MOBILE_LINKS.map((item) => {
                              const rowClass =
                                'block px-5 py-3 text-[15px] font-medium text-gray-700 no-underline transition-all hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)] hover:text-purple'
                              if (item.label === 'Get App') {
                                return (
                                  <div key={item.label} className="hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)]">
                                    <GetAppNavControl onOpen={openAppDownloadModal} tone="drawer" />
                                  </div>
                                )
                              }
                              const inner = (
                                <>
                                  <i className={`fas ${item.icon} mr-3 text-[14px] text-purple`}></i> {item.label}
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
                            {isAuthenticated && user ? (
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setIsMobileMenuOpen(false)
                                  setIsProfileModalOpen(true)
                                }}
                                className="w-full px-5 py-3 text-left"
                                type="button"
                              >
                                <div className="flex items-center gap-3 text-[15px] font-medium text-gray-700 transition-colors hover:text-purple">
                                  <i className="fas fa-user-circle text-[14px] text-purple"></i>
                                  {user.name || user.phone}
                                  <i className="fas fa-chevron-right ml-auto text-[10px] text-gray-400"></i>
                                </div>
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setIsMobileMenuOpen(false)
                                  setIsAuthModalOpen(true)
                                }}
                                className="mx-5 mb-3 w-[calc(100%-2.5rem)] rounded-xl bg-gradient-to-br from-purple to-[#6a3aff] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_4px_16px_rgba(75,42,212,0.25)] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(75,42,212,0.35)]"
                                type="button"
                              >
                                <i className="fas fa-user-circle mr-2"></i> Sign In / Up
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  )}

                  {(isLandingHeroPage || isAroundYouPage) && !isAboutPage && !isCorporatesPage && (
                    <div className="relative mt-3 md:hidden" ref={mobileSearchRef}>
                      <div className="flex items-center rounded-full border border-gray-200 bg-white px-3 py-2 shadow-sm">
                        <i className="fas fa-search mr-2 text-xs text-gray-400"></i>
                        <input
                          type="text"
                          placeholder={searchPlaceholder}
                          className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
                          value={searchQuery}
                          onChange={handleLandingSearchInput}
                          onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('')
                              setShowSearchResults(false)
                            }}
                            className="ml-2 text-gray-400 hover:text-gray-600"
                            aria-label="Clear search"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        )}
                      </div>

                      {showSearchResults && searchQuery && (
                        <div
                          ref={mobileSearchResultsRef}
                          className="absolute left-0 top-full z-[120] mt-2 w-full"
                        >
                          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
                            {searchLoading && (
                              <div className="px-6 py-8 text-center">
                                <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-purple border-t-transparent"></div>
                                <div className="text-sm text-gray-500">Searching for &quot;{debouncedSearchQuery || searchQuery}&quot;...</div>
                              </div>
                            )}
                            {!searchLoading && searchResults.length > 0 && (
                              <div className="max-h-[360px] overflow-y-auto py-1">
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
                                    key={`mobile-${item.type || 'item'}-${item.id || item.restaurant_id || idx}`}
                                    href={href}
                                    onClick={() => setShowSearchResults(false)}
                                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                                  >
                                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                                      {item.image_url ? (
                                        <img src={item.image_url} alt={item.item_name || item.restaurant_name || item.name || 'result'} className="h-full w-full object-cover" />
                                      ) : (
                                        <span className="text-gray-400">🍽️</span>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-semibold text-gray-900">{item.item_name || item.restaurant_name || item.name}</div>
                                      <div className="truncate text-xs text-gray-500">{item.type === 'dish' ? 'Dish result' : 'Restaurant result'}</div>
                                    </div>
                                  </ResultLink>
                                  )
                                })}
                              </div>
                            )}
                            {!searchLoading && searchResults.length === 0 && debouncedSearchQuery && (
                              <div className="px-6 py-8 text-center">
                                <div className="mb-2 text-sm font-semibold text-gray-600">No results for &quot;{debouncedSearchQuery}&quot;</div>
                                <button
                                  type="button"
                                  onClick={() => setShowSearchResults(false)}
                                  className="text-xs font-medium text-purple hover:underline"
                                >
                                  Clear search
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
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