'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Loader2, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LocationItem } from './LocationPopup'
import { reverseGeocodeSearchParams } from '@/lib/normalizeLatLon'
import LocationSheet from './LocationSheet'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'
import StoreInnerLink from '@/components/order/StoreInnerLink'

const LOCATION_STORAGE_KEY = 'gatimitra_location_display'
const DEBOUNCE_MS = 300

interface SearchResultItem {
  id?: number
  item_name?: string
  category?: string
  restaurant_id?: number | string
  public_slug?: string | null
  score?: number
}

export default function LocationSearchBar() {
  const [locationDisplay, setLocationDisplay] = useState('Select location')
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'denied' | 'unavailable' | 'ready'>('loading')
  const [locationPopupOpen, setLocationPopupOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // Restore last location from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
      if (saved) setLocationDisplay(saved)
    } catch {}
  }, [])

  // Geolocation on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
      if (saved) {
        setLocationState('ready')
        return
      }
    } catch {}
    if (!navigator.geolocation) {
      setLocationState('unavailable')
      setLocationDisplay('Location not supported')
      return
    }
    setLocationState('loading')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords
          const res = await fetch(
            `/api/locations/reverse-geocode?${reverseGeocodeSearchParams(latitude, longitude)}`
          )
          const data = await res.json()
          if (data?.displayName) {
            setLocationDisplay(data.displayName)
            setLocationState('ready')
            try {
              localStorage.setItem(LOCATION_STORAGE_KEY, data.displayName)
            } catch {}
          } else {
            setLocationDisplay('Your location')
            setLocationState('ready')
          }
        } catch {
          setLocationDisplay('Your location')
          setLocationState('ready')
        }
      },
      (err) => {
        if (err.code === 1) {
          setLocationState('denied')
          setLocationDisplay('Location access denied')
        } else {
          setLocationState('unavailable')
          setLocationDisplay('Unable to detect location')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    )
  }, [])

  const handleSelectLocation = (displayName: string, _item?: LocationItem) => {
    setLocationDisplay(displayName)
    setLocationState('ready')
    setLocationSearchQuery('')
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, displayName)
    } catch {}
    setLocationPopupOpen(false)
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Fetch search results
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults([])
      setSearchDropdownOpen(false)
      return
    }
    setSearchLoading(true)
    setSearchDropdownOpen(true)
    fetch(`/api/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then((res) => res.json())
      .then((data) => setSearchResults(Array.isArray(data) ? data : []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false))
  }, [debouncedSearch])

  // Outside click: close search dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (barRef.current?.contains(target)) return
      setSearchDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={barRef} className="relative w-full max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row w-full bg-white rounded-full shadow-lg border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-purple focus-within:border-purple transition-all">
        {/* Location segment (left) – same editable input, typing shows live results in same modal */}
        <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 min-w-0 flex-1 sm:flex-initial sm:max-w-[280px] border-b sm:border-b-0 sm:border-r border-gray-100">
          <MapPin className="w-5 h-5 text-purple flex-shrink-0" />
          <button
            type="button"
            onClick={() => {
              setLocationPopupOpen(true)
            }}
            className="flex flex-1 min-w-0 items-center justify-between gap-2 bg-transparent text-left"
            aria-haspopup="dialog"
          >
            <span className="truncate text-sm font-medium text-text">
              {locationState === 'loading' ? 'Detecting…' : locationDisplay}
            </span>
            <i className="fas fa-chevron-right text-[10px] text-gray-500"></i>
          </button>
        </div>

        {/* Search input (right) */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-light pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => debouncedSearch && setSearchDropdownOpen(true)}
            placeholder="Search for places, cuisines, and more…"
            aria-label="Search for places and cuisines"
            className="w-full pl-12 pr-4 py-3 sm:py-4 bg-transparent border-none outline-none text-sm text-text placeholder:text-text-light"
          />
        </div>
      </div>

      <LocationSheet
        isOpen={locationPopupOpen}
        onClose={() => setLocationPopupOpen(false)}
        onSelectLocation={handleSelectLocation}
      />

      {/* Search results dropdown */}
      <AnimatePresence>
        {searchDropdownOpen && (searchResults.length > 0 || searchLoading) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full mt-2 z-40 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-h-80 overflow-y-auto"
            style={{ borderRadius: '14px' }}
          >
            {searchLoading && (
              <div className="py-4 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-purple" />
              </div>
            )}
            {!searchLoading &&
              searchResults.map((item, idx) => (
                <StoreInnerLink
                  key={item.id ?? idx}
                  href={
                    item.restaurant_id || item.public_slug
                      ? restaurantDetailHref(
                          {
                            public_slug: item.public_slug,
                            store_id: item.restaurant_id,
                            id: item.id,
                          },
                          'search'
                        )
                      : '/order'
                  }
                  onClick={() => setSearchDropdownOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-purple-light transition-colors border-b border-gray-50 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text truncate">
                      {item.item_name ?? ''}
                    </div>
                    {item.category && (
                      <div className="text-xs text-text-light truncate">
                        {item.category}
                      </div>
                    )}
                  </div>
                </StoreInnerLink>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
      {searchDropdownOpen && !searchLoading && debouncedSearch && searchResults.length === 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-40 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 text-center text-sm text-text-light"
          style={{ borderRadius: '14px' }}
        >
          No results found for &quot;{debouncedSearch}&quot;
        </div>
      )}
    </div>
  )
}
