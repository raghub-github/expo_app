'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import Search from '@/components/common/Search'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'
import type { LocationItem } from '@/components/location-search/LocationPopup'
import { useLocationContext } from '@/components/providers/LocationProvider'
import LocationSheet from '@/components/location-search/LocationSheet'
import { truncateDisplayName } from '@/lib/truncateDisplayName'
import { getMagicpinPathAfterLocationSelect, mergeLocationNavigationUrl } from '@/lib/magicpinLocationUrl'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import { resolveOrderPageLocationLabel } from '@/lib/panIndiaLocation'

interface OrderHeaderProps {
  logoHref?: string
  showBackButton?: boolean
  onFilterClick?: () => void
  showFilterButton?: boolean
  searchPlaceholder?: string
}

export default function OrderHeader({
  logoHref = '/',
  showBackButton = true,
  onFilterClick,
  showFilterButton = false,
  searchPlaceholder = 'Search restaurants, cuisines, dishes...',
}: OrderHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showLocationSheet, setShowLocationSheet] = useState(false)
  const [showProfileSheet, setShowProfileSheet] = useState(false)
  const { user, isAuthenticated } = useAppSelector(state => state.auth)
  const { location: locationState, setLocation: setGlobalLocation } = useLocationContext()
  const locationCommitted = locationState.locationCommittedByUser === true
  const resolvedLocation = useMemo(
    () =>
      resolveOrderPageLocationLabel({
        locationCommittedByUser: locationCommitted,
        displayName: locationState.displayName,
      }),
    [locationCommitted, locationState.displayName]
  )
  const displayUserName = truncateDisplayName(user?.name || user?.phone)

  const handleSelectLocation = (displayName: string, item?: LocationItem) => {
    const nextPath = getMagicpinPathAfterLocationSelect(pathname ?? '', displayName, item)
    if (nextPath) {
      const url = mergeLocationNavigationUrl(
        nextPath,
        new URLSearchParams(searchParams?.toString() ?? '')
      )
      router.replace(url, { scroll: false })
    }
    setGlobalLocation(displayName, item?.latitude ?? undefined, item?.longitude ?? undefined, {
      userInitiated: true,
    })
    setShowLocationSheet(false)
  }

  return (
    <>
      {/* Main Header branding */}
      <header className="sticky top-0 z-[1000] border-b border-[#e9ecef] bg-white/95 backdrop-blur-md">
        {/* Navbar Bar */}
        <div className="px-2 md:px-3 lg:px-4">
          <div className="mr-auto ml-0 max-w-full">
            <div className="flex min-h-[64px] items-center gap-2 md:gap-2.5">
              {/* Logo Section - Matching Landing Page */}
              <Link href={logoHref} className="flex shrink-0 items-center gap-2 md:gap-2.5 group -ml-0.5">
                <GatiMitraLogo alt="GatiMitra" className="h-8 md:h-9 w-auto flex-shrink-0 object-contain" />
              </Link>

              {/* Back Button */}
              {showBackButton && (
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs md:text-sm transition-all"
                >
                  <i className="fas fa-arrow-left text-xs md:text-sm"></i>
                  <span className="hidden sm:inline">Back</span>
                </button>
              )}

              {/* Center: Hero-like Location + Search */}
              <div className="hidden md:flex flex-1 justify-center px-1 lg:px-2">
                <div className="flex h-10 w-full max-w-[640px] items-center rounded-full border border-[#e2e8f0] bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setShowLocationSheet(true)}
                    className="flex h-full min-w-[170px] max-w-[220px] items-center gap-1.5 px-3 text-xs font-semibold text-[#1A1A2E]"
                  >
                    <span className="truncate">{resolvedLocation}</span>
                    <i className="fas fa-chevron-down w-3 text-[9px] text-gray-500 text-center"></i>
                  </button>
                  <div className="h-5 w-px bg-[#e2e8f0]" />
                  <i className="fas fa-search ml-3 mr-2 text-[11px] text-gray-400"></i>
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    className="h-full w-full rounded-r-full bg-transparent pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Right Section */}
              <div className="ml-auto mr-1 lg:mr-2 flex items-center gap-2.5 md:gap-3">
                {/* User/Auth with Dropdown */}
                {isAuthenticated && user ? (
                  <button
                    onClick={() => setShowProfileSheet(true)}
                    className="hidden sm:flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#16c2a5] to-[#0f9f89] px-3 text-xs font-semibold text-white transition-all hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <i className="fas fa-user w-3.5 text-[11px] text-center"></i>
                    <span className="truncate max-w-[115px]">{displayUserName}</span>
                    <i className="fas fa-chevron-right w-3 text-[8px] text-center"></i>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsAuthModalOpen(true)
                    }}
                    className="hidden sm:flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff6b35] to-[#ff8451] px-3 text-xs font-semibold text-white transition-all hover:shadow-lg hover:-translate-y-0.5 z-50"
                    type="button"
                  >
                    <i className="fas fa-user w-3.5 text-[11px] text-center"></i>
                    Sign In
                  </button>
                )}

                {showFilterButton && (
                  <button
                    type="button"
                    onClick={onFilterClick}
                    className="hidden lg:flex h-9 min-w-[132px] items-center rounded-xl border border-slate-200 bg-white px-2.5 text-left hover:bg-slate-50 transition-all"
                  >
                    <span className="leading-tight">
                      <span className="block text-[11px] font-bold text-slate-800">Filters</span>
                      <span className="block text-[10px] text-slate-500">Refine your search</span>
                    </span>
                  </button>
                )}

                {/* Mobile Menu Button */}
                <button 
                  onClick={() => setShowMenu(!showMenu)}
                  className="md:hidden flex flex-col gap-0.5 p-1 hover:bg-[#f0f0f0] rounded-lg transition-all"
                >
                  <span className={`w-3.5 h-0.5 bg-[#1A1A2E] transition-all duration-300 ${showMenu ? 'rotate-45 translate-y-1' : ''}`}></span>
                  <span className={`w-3.5 h-0.5 bg-[#1A1A2E] transition-all duration-300 ${showMenu ? 'opacity-0' : ''}`}></span>
                  <span className={`w-3.5 h-0.5 bg-[#1A1A2E] transition-all duration-300 ${showMenu ? '-rotate-45 -translate-y-1' : ''}`}></span>
                </button>
              </div>
            </div>

            {/* Mobile Search */}
            <div className="lg:hidden relative mt-1.5 mb-2">
              <Search
                placeholder={searchPlaceholder}
                className="w-full rounded-full border border-[#e9ecef] text-[11px] bg-white transition-all focus-within:border-[#16c2a5]"
                inputClassName="px-4 py-2.5 text-sm placeholder:text-gray-400"
              />
            </div>

            {/* Mobile Menu */}
            {showMenu && (
              <div className="md:hidden bg-white border-t border-[#e9ecef] mt-1 pt-1.5 pb-1.5 -mx-4 px-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1.5">
                  <div className="w-full rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1.5 text-[10px] font-semibold text-[#1A1A2E]">
                    {resolvedLocation}
                  </div>
                  {!isAuthenticated && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsAuthModalOpen(true)
                        setShowMenu(false)
                      }}
                      className="w-full bg-gradient-to-r from-[#ff6b35] to-[#ff8451] text-white px-2.5 py-1.5 rounded-full font-semibold text-[10px] transition-all hover:shadow-lg"
                      type="button"
                    >
                      Sign In
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <LocationSheet
        isOpen={showLocationSheet}
        onClose={() => setShowLocationSheet(false)}
        onSelectLocation={handleSelectLocation}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <UserProfileModal isOpen={showProfileSheet} onClose={() => setShowProfileSheet(false)} />
    </>
  )
}