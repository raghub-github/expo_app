'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'
import LocationPopup from '@/components/location-search/LocationPopup'
import type { LocationItem } from '@/components/location-search/LocationPopup'
import LocationSheet from '@/components/location-search/LocationSheet'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'
import {
  LandingHeroArcProvider,
  LandingHeroDynamicCopy,
  LandingHeroGreenContent,
  LandingHeroExploreButton,
} from '@/components/home/LandingHeroArc'
import { getMagicpinPathAfterLocationSelect, mergeLocationNavigationUrl } from '@/lib/magicpinLocationUrl'
import { normalizeLatLonForStorage, reverseGeocodeSearchParams } from '@/lib/normalizeLatLon'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'
import { buildLocationQueryFromState, mergeLocationQuery } from '@/lib/locationQuery'

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
    const searchParams = useSearchParams()
    const isLandingHome = pathname === '/'
    const isAboutPage = pathname === '/about'
    const isCorporatesPage = pathname === '/corporates'
    const isAroundYouPage =
      pathname === '/india/All/Stores' ||
      pathname === '/around-you' ||
      (pathname != null && /^\/india\/[^/]+\/[^/]+\/All\/Stores$/.test(pathname))
    const isCityAreaRoute = Boolean(pathname && pathname.split('/').filter(Boolean).length >= 2)
    /** Home + city/area pages — exclude Around You (`/india/All/Stores`) so the Food Delivery hero is hidden there. */
    const isLandingHeroPage = isLandingHome || (isCityAreaRoute && !isAroundYouPage)
    /** Same landing-style header shell as home (nav + optional hero body). */
    const showLandingHeaderShell =
      isLandingHeroPage || isAboutPage || isCorporatesPage || isAroundYouPage
    /** Inner pages use the big gradient + hero + search (not home, not about). */
    const showInnerHeroShell = false
    const { location: locationState, setLocation: setGlobalLocation } = useLocationContext()
    const locationCommitted = locationState.locationCommittedByUser === true
    const restaurantGeoQs = useMemo(
      () => getRestaurantGeoQueryString(locationState, locationCommitted),
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

    // Location states
    const [location, setLocation] = useState('📍 Detecting location...')
    const [isLocationManual, setIsLocationManual] = useState(false)
    const [showLocationModal, setShowLocationModal] = useState(false)
    const [isLocationLoading, setIsLocationLoading] = useState(true)
    const [showLocationSheet, setShowLocationSheet] = useState(false)
    const [showLocationPopup, setShowLocationPopup] = useState(false)
    const [locationSearchQuery, setLocationSearchQuery] = useState('')
    const locationTriggerRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      const q = restaurantGeoQs ? `?${restaurantGeoQs}` : ''
      fetch(`/api/restaurants${q}`)
        .then((res) => res.json())
        .then((data) => setRestaurantList(data || []))
        .catch(() => setRestaurantList([]))
    }, [restaurantGeoQs])

    // Get user's location on mount (skip if we're on city/area page – URL will drive display)
    useEffect(() => {
      // Don't re-detect on every page switch if we already have a selected location.
      if (!isCityAreaRoute && !locationState.displayName) getLocation()
    }, [isCityAreaRoute, locationState.displayName])

    // When on city/area page, mark location as manual from URL context.
    // Avoid writing local `location` here; it can create update loops.
    useEffect(() => {
      if (!isCityAreaRoute || !locationState.displayName) return
      if (!isLocationManual) setIsLocationManual(true)
    }, [isCityAreaRoute, locationState.displayName, isLocationManual])

    // Get user's current location (uses server reverse-geocode API for exact address)
    const getLocation = () => {
      setIsLocationLoading(true);
      if (!navigator.geolocation) {
        setLocation('📍 Location not supported');
        setIsLocationLoading(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        // Success: use fresh coords, no cache (maximumAge: 0)
        async (position) => {
          try {
            const { latitude, longitude } = position.coords
            const { lat, lon } = normalizeLatLonForStorage(latitude, longitude)
            const res = await fetch(`/api/locations/reverse-geocode?${reverseGeocodeSearchParams(latitude, longitude)}`)
            const data = await res.json()
            const displayName = data?.displayName || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
            setLocation(`📍 ${displayName}`)
            setIsLocationManual(false)
            setGlobalLocation(displayName, lat, lon, { userInitiated: true })
          } catch {
            setLocation('📍 Your Location');
          } finally {
            setIsLocationLoading(false);
          }
        },
        (error) => {
          if (error.code === 1) {
            setShowLocationModal(true);
            setLocation('📍 Location access denied');
          } else if (error.code === 3) {
            setLocation('📍 Location request timed out');
          } else {
            setLocation('📍 Unable to detect location');
          }
          setIsLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };

    const handleSelectLocation = (displayName: string, item?: LocationItem) => {
      const label = displayName.startsWith('📍') ? displayName : `📍 ${displayName}`
      const nextPath = getMagicpinPathAfterLocationSelect(pathname ?? '', displayName, item)
      if (nextPath) {
        const merged = mergeLocationQuery(
          new URLSearchParams(searchParams?.toString() ?? ''),
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
      setLocation(label)
      setIsLocationManual(true)
      setLocationSearchQuery('')
      setShowLocationPopup(false)
      setShowLocationSheet(false)
      setGlobalLocation(displayName, item?.latitude ?? undefined, item?.longitude ?? undefined, {
        userInitiated: true,
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
        {showInnerHeroShell && (
        <div className="absolute inset-0 rounded-b-[90px] overflow-hidden z-0">
          <div 
            className="absolute inset-0"
            style={{ 
             background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.60), rgba(59, 130, 246, 0.55), rgba(168, 85, 247, 0.45)), url("/img/bg.png") center/cover no-repeat'
            }}
          ></div>
          {/* Pattern overlay */}
          <div className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: 'url(https://www.transparenttextures.com/patterns/light-sketch.png)' }}></div>
        </div>
        )}
        
        {/* Header content */}
        <header
          className={
            showLandingHeaderShell
              ? `landing-hero-ref relative z-10 px-0 pt-0 text-black ${isAboutPage || isCorporatesPage || isAroundYouPage ? 'pb-0' : 'pb-6 md:pb-8'}`
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
                  <img
                    src="/img/logoo.png"
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

                <Link href="#" className="text-text no-underline font-medium text-[14px] px-3 py-2 rounded-lg transition-all duration-200 relative flex items-center gap-1.5 hover:text-purple hover:bg-[rgba(75,42,212,0.08)]">
                  <i className="fas fa-mobile-alt text-[13px]"></i> Get App
                </Link>

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
                    <Link 
                      href="#" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-5 py-3 text-gray-700 no-underline font-medium text-[15px] transition-all hover:bg-gradient-to-r hover:from-[rgba(22,194,165,0.08)] hover:to-[rgba(75,42,212,0.05)] hover:text-purple"
                    >
                      <i className="fas fa-mobile-alt mr-3 text-[14px] text-purple"></i> Get App
                    </Link>
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

          {/* Landing-style shell: full hero on home; top bar only on About (same design as home nav) */}
          {showLandingHeaderShell && (
            <LandingHeroArcProvider>
              <div
                className={`landing-hero-split flex w-full max-w-full flex-col rounded-none border-x-0 border-t-0 border-b-0 shadow-none ${
                  isLandingHome
                    ? 'mb-0 min-h-[min(72vh,680px)] lg:mb-0 lg:min-h-[min(72vh,680px)]'
                    : 'mb-0 min-h-0'
                }`}
              >
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
                        <img
                          src="/img/logoo.png"
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
                        <img
                          src="/img/logoo.png"
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

                      <Link
                        href={LANDING_GET_APP.href}
                        className="text-center text-[11px] font-medium leading-tight tracking-tight text-black no-underline transition-colors hover:text-[#109D4C] sm:text-[12px] lg:text-[13px] xl:text-[14px]"
                      >
                        {LANDING_GET_APP.label}
                      </Link>
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
                                {locationState.displayName || (location || '').replace(/^📍\s*/, '') || (isLocationLoading ? 'Detecting location' : 'Select location')}
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
                                    {searchResults.map((item: any, idx: number) => (
                                      <Link
                                        key={`${item.type || 'item'}-${item.id || item.restaurant_id || idx}`}
                                        href={
                                          item.type === 'dish'
                                            ? `/order?restaurant=${item.restaurant_id}`
                                            : restaurantDetailHref(
                                                String(item.restaurant_id),
                                                'search',
                                                mergeLocationQuery(
                                                  new URLSearchParams(searchParams?.toString() ?? ''),
                                                  buildLocationQueryFromState(locationState)
                                                )
                                              )
                                        }
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
                                      </Link>
                                    ))}
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
                                {searchResults.map((item: any, idx: number) => (
                                  <Link
                                    key={`mobile-${item.type || 'item'}-${item.id || item.restaurant_id || idx}`}
                                    href={
                                      item.type === 'dish'
                                        ? `/order?restaurant=${item.restaurant_id}`
                                        : restaurantDetailHref(
                                            String(item.restaurant_id),
                                            'search',
                                            mergeLocationQuery(
                                              new URLSearchParams(searchParams?.toString() ?? ''),
                                              buildLocationQueryFromState(locationState)
                                            )
                                          )
                                    }
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
                                  </Link>
                                ))}
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

                {isLandingHeroPage && (
                  <div className="landing-hero-main relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col gap-0 px-3 pt-3 sm:px-4 sm:pt-4 lg:min-h-0 lg:flex-row lg:items-center lg:gap-8 lg:px-6 lg:pt-5 xl:gap-10 xl:px-8 xl:pt-6">
                    <div className="flex min-h-0 flex-1 flex-col justify-center px-0 pb-6 pt-2 text-left sm:pb-7 sm:pt-3 lg:basis-[52%] lg:justify-center lg:pb-6 lg:pl-[6%] lg:pr-2 lg:pt-2 xl:pl-[5%]">
                      <div className="w-full max-w-[42rem] mx-auto lg:mx-0">
                        <LandingHeroDynamicCopy />
                        <LandingHeroExploreButton />
                      </div>
                    </div>

                    <div className="relative flex min-h-[min(260px,40vh)] flex-1 flex-col items-center justify-center px-0 pb-6 pt-0 sm:min-h-[min(320px,46vh)] sm:pb-7 lg:min-h-0 lg:basis-[48%] lg:justify-center lg:self-stretch lg:px-2 lg:pb-6 lg:pt-2 xl:px-4">
                      <LandingHeroGreenContent />
                    </div>
                  </div>
                )}
              </div>
            </LandingHeroArcProvider>
          )}

          {false && (
          <div className={isLandingHome ? 'relative' : 'hero-section relative'}>
            {!isLandingHome && (
            <>
            {/* Left Arrow - Higher Position */}
            <svg className="absolute pointer-events-none arrow-blink" width="200" height="300" viewBox="0 0 200 300" style={{left: '-50px', top: '70px', filter: 'drop-shadow(0 0 12px #00e5ff)', animationDelay: '0s'}}>
              <defs>
                <linearGradient id="arrowGradLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00e5ff" />
                  <stop offset="100%" stopColor="#0099ff" />
                </linearGradient>
              </defs>
              <path d="M 40 50 L 80 100 L 40 150" stroke="url(#arrowGradLeft)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 100 80 L 140 130 L 100 180" stroke="url(#arrowGradLeft)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            </svg>
            
            {/* Right Arrow - Higher Position */}
            <svg className="absolute pointer-events-none arrow-blink" width="200" height="300" viewBox="0 0 200 300" style={{right: '-50px', top: '70px', filter: 'drop-shadow(0 0 12px #00e5ff)', animationDelay: '0.5s'}}>
              <defs>
                <linearGradient id="arrowGradRight" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00e5ff" />
                  <stop offset="100%" stopColor="#0099ff" />
                </linearGradient>
              </defs>
              <path d="M 160 50 L 120 100 L 160 150" stroke="url(#arrowGradRight)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 100 80 L 60 130 L 100 180" stroke="url(#arrowGradRight)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            </svg>

            {/* Blinking Background Logos */}
            <div className="absolute inset-0 pointer-events-none opacity-25 flex items-center justify-around px-10" style={{zIndex: 1}}>
              <div className="hero-logo-blink" style={{animationDelay: '0s'}}>
                <img src="/img/logoo.png" alt="logo" className="h-24 w-auto opacity-50" />
              </div>
              <div className="hero-logo-blink" style={{animationDelay: '0.4s'}}>
                <img src="/img/logoo.png" alt="logo" className="h-20 w-auto opacity-40" />
              </div>
              <div className="hero-logo-blink" style={{animationDelay: '0.8s'}}>
                <img src="/img/logoo.png" alt="logo" className="h-28 w-auto opacity-45" />
              </div>
              <div className="hero-logo-blink" style={{animationDelay: '1.2s'}}>
                <img src="/img/logoo.png" alt="logo" className="h-22 w-auto opacity-35" />
              </div>
            </div>

            <h1 className="hero-title relative z-10">
              India&apos;s <span className="hero-title-accent">Lowest Commission</span>
              <br />Delivery Platform
            </h1>
            <p className="hero-subtitle relative z-10">
              Food • Parcel • Person Delivery
            </p>
            </>
            )}

            {/* Parallel Location & Search Bar – higher z when suggestion modal open so it stays above quick cards (z-30) */}
            <div className={`relative mx-auto max-w-[800px] ${isLandingHome ? 'mt-2 px-3 sm:px-4 lg:px-6' : ''} ${showSearchResults && searchQuery ? 'z-[50]' : ''}`} ref={searchRef}>
              <div className="flex flex-row gap-3 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden h-[60px] transition-all duration-300 hover:shadow-3xl items-center px-4 py-2 flex-wrap md:flex-nowrap">
                {/* Location: same editable input – typing shows live results in same modal, no second dropdown */}
                <div className="flex items-center min-w-[180px] max-w-[260px] flex-shrink-0 relative">
                  <input
                    ref={locationTriggerRef}
                    type="text"
                    value={showLocationPopup ? locationSearchQuery : (isCityAreaRoute && locationState.displayName ? locationState.displayName : (location || '').replace(/^📍\s*/, ''))}
                    onChange={(e) => {
                      setShowLocationPopup(true)
                      setLocationSearchQuery(e.target.value)
                    }}
                    onFocus={() => {
                      setLocationSearchQuery('')
                      setShowLocationPopup(true)
                    }}
                    placeholder={isLocationLoading ? 'Detecting...' : 'Search location'}
                    aria-expanded={showLocationPopup}
                    aria-haspopup="dialog"
                    title="Change location"
                    className="flex-1 min-w-0 text-gray-500 text-sm bg-transparent border-none outline-none placeholder:text-gray-400"
                  />
                  {isLocationManual && !showLocationPopup && (
                    <span className="text-xs bg-purple-light text-purple px-2 py-0.5 rounded-full ml-1 flex-shrink-0">
                      Manual
                    </span>
                  )}
                  <button
                    onClick={getLocation}
                    className="text-xs text-purple hover:text-purple-dark font-medium px-2 py-1 rounded hover:bg-purple-light transition-colors flex items-center gap-1 ml-1 flex-shrink-0"
                    title="Refresh location"
                  >
                    <i className="fas fa-sync-alt text-[10px]"></i>
                  </button>
                  {showLocationPopup && locationSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLocationSearchQuery('')}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-1"
                      aria-label="Clear"
                    >
                      <i className="fas fa-times text-[10px]"></i>
                    </button>
                  )}
                </div>
                {/* Search input */}
                <div className="flex items-center flex-1 min-w-[180px] ml-2">
                  <i className="fas fa-search text-gray-400 mr-3 text-sm"></i>
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
                    value={searchQuery}
                    onChange={handleLandingSearchInput}
                    onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setShowSearchResults(false);
                      }}
                      className="text-gray-400 hover:text-gray-600 ml-2"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              </div>
              {/* Location modal: absolute only (no fixed) so it scrolls with search section */}
              <div className="absolute left-0 right-0 top-full z-50" style={{ position: 'absolute' }}>
                <LocationPopup
                  isOpen={showLocationPopup}
                  onClose={() => {
                    setShowLocationPopup(false)
                    setLocationSearchQuery('')
                  }}
                  onSelectLocation={handleSelectLocation}
                  onPermissionDenied={() => setShowLocationModal(true)}
                  searchQuery={locationSearchQuery}
                  triggerRef={locationTriggerRef}
                  anchorRef={searchRef}
                />
              </div>
              {/* Search Results – absolute so it scrolls with the page */}
              {showSearchResults && searchQuery && (
                <div
                  ref={searchResultsRef}
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-2.5 w-full max-w-[560px] z-[100]"
                >
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              {searchLoading && (
                <div className="px-6 py-8 text-center">
                  <div className="inline-block w-8 h-8 border-2 border-purple border-t-transparent rounded-full animate-spin mb-3"></div>
                  <div className="text-gray-500 text-sm">Searching for &quot;{debouncedSearchQuery || searchQuery}&quot;...</div>
                </div>
              )}
              {!searchLoading && searchResults.length > 0 && (() => {
                const dishes = searchResults.filter((r: { type?: string }) => r.type === 'dish')
                const restaurants = searchResults.filter((r: { type?: string }) => r.type === 'restaurant')
                return (
                  <div className="max-h-[440px] overflow-y-auto">
                    <div className="px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-800">
                          Results for &quot;{debouncedSearchQuery}&quot;
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                          {searchResults.length} found
                        </span>
                      </div>
                    </div>
                    <div className="py-1">
                      {dishes.map((item: any, idx: number) => {
                        const restaurant = restaurantList.find((r: any) => r.restaurant_id === item.restaurant_id || r.id === item.restaurant_id)
                        const restaurantName = restaurant ? (restaurant.restaurant_name || restaurant.name) : 'Restaurant'
                        const secondary = [restaurantName, item.category, item.price != null ? `₹${item.price}` : ''].filter(Boolean).join(' • ')
                        return (
                          <Link
                            key={`dish-${item.id}-${idx}`}
                            href={`/order?restaurant=${item.restaurant_id}`}
                            onClick={() => setShowSearchResults(false)}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                          >
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center ring-1 ring-gray-100">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.item_name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-lg text-gray-400">🍽️</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-900 text-sm truncate group-hover:text-purple">{item.item_name}</div>
                              <div className="text-xs text-gray-500 truncate mt-0.5">{secondary}</div>
                            </div>
                          </Link>
                        )
                      })}
                      {restaurants.map((item: any, idx: number) => {
                        const secondary = item.address ? item.address : 'View menu'
                        return (
                          <Link
                            key={`rest-${item.restaurant_id}-${idx}`}
                            href={restaurantDetailHref(
                              String(item.restaurant_id),
                              'search',
                              mergeLocationQuery(
                                new URLSearchParams(searchParams?.toString() ?? ''),
                                buildLocationQueryFromState(locationState)
                              )
                            )}
                            onClick={() => setShowSearchResults(false)}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                          >
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center ring-1 ring-gray-100">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.restaurant_name || item.name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-lg text-gray-400">🏪</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-900 text-sm truncate group-hover:text-purple">{item.restaurant_name || item.name}</div>
                              <div className="text-xs text-gray-500 truncate mt-0.5">{secondary}</div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              {!searchLoading && searchResults.length === 0 && debouncedSearchQuery && (
                <div className="px-6 py-8 text-center">
                  <div className="text-4xl mb-3 text-gray-300">🔍</div>
                  <div className="text-gray-600 font-semibold text-sm mb-1">No results for &quot;{debouncedSearchQuery}&quot;</div>
                  <div className="text-gray-400 text-xs max-w-xs mx-auto">Try different keywords or check spelling</div>
                  <button onClick={() => setShowSearchResults(false)} className="mt-3 text-purple font-medium text-xs hover:underline">Clear search</button>
                </div>
              )}
            </div>
          </div>
              )}
            </div>
          </div>
          )}
        </header>
      </div>

      <LocationSheet
        isOpen={showLocationSheet}
        onClose={() => setShowLocationSheet(false)}
        onSelectLocation={handleSelectLocation}
        onPermissionDenied={() => setShowLocationModal(true)}
      />

      {/* Location Permission Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-scaleIn">
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-text">Enable Location Access</h3>
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
              <p className="text-gray-600 text-sm mt-1">
                Location access is required for better delivery experience
              </p>
            </div>
            
            <div className="px-6 py-5">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-purple-light text-purple w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium text-text text-sm">Click the lock icon</h4>
                    <p className="text-gray-500 text-xs mt-0.5">
                      In your browser&apos;s address bar, click the lock or info icon
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="bg-purple-light text-purple w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium text-text text-sm">Open Site Settings</h4>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Click on &quot;Site settings&quot; or &quot;Permissions&quot;
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="bg-purple-light text-purple w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium text-text text-sm">Allow Location Access</h4>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Change location permission from &quot;Block&quot; to &quot;Allow&quot;
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="bg-purple-light text-purple w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <h4 className="font-medium text-text text-sm">Refresh the Page</h4>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Refresh this page after changing the settings
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 pt-5 border-t border-gray-200">
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowLocationModal(false)
                      setShowLocationPopup(true)
                    }}
                    className="flex-1 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
                  >
                    Enter Location Manually
                  </button>
                  <button
                    onClick={() => {
                      getLocation();
                      setShowLocationModal(false);
                    }}
                    className="flex-1 bg-gradient-to-r from-purple to-[#6a3aff] text-white px-4 py-2.5 rounded-lg font-medium text-sm hover:shadow-lg transition-all"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <UserProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />

      <style jsx>{`
        .search-box-responsive {
          height: 60px !important;
          min-height: 60px;
        }
        
        .search-input-responsive {
          height: 100%;
          padding: 0 16px;
          font-size: 14px;
        }
        
        .location-input-responsive {
          height: 100%;
          padding: 0 16px;
          font-size: 13px;
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-slideDown {
          animation: slideDown 0.2s ease-out;
        }
        
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
        
        .shadow-3xl {
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.1);
        }
        
        .hero-title {
          font-size: 2.5rem;
          font-weight: 800;
          text-align: center;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, #ffffff 0%, #e0e7ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .hero-title-accent {
          background: linear-gradient(135deg, #0a0600 0%, #ff0400 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .hero-subtitle {
          font-size: 1.1rem;
          text-align: center;
          margin-bottom: 2rem;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 500;
        }
        
        @media (max-width: 768px) {
          .hero-title {
            font-size: 1.8rem;
          }
          
          .hero-subtitle {
            font-size: 0.95rem;
          }
          
          .search-box-responsive {
            height: 55px !important;
            min-height: 55px;
          }
        }
      `}</style>
    </>
  )
}