'use client'

import { normalizeLatLonForStorage, reverseGeocodeSearchParams } from '@/lib/normalizeLatLon'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Loader2 } from 'lucide-react'

export interface LocationItem {
  id: number
  location_name: string
  city: string
  latitude: number
  longitude: number
  address?: string
  state?: string
  postal_code?: string
  label?: string
  custom_label?: string
}

interface LocationPopupProps {
  isOpen: boolean
  onClose: () => void
  onSelectLocation: (displayName: string, item?: LocationItem) => void
  /** When user clicks auto-detect but location permission is denied; show enable-location popup */
  onPermissionDenied?: () => void
  searchQuery?: string
  triggerRef: React.RefObject<HTMLElement | null>
  anchorRef?: React.RefObject<HTMLElement | null>
  popupClassName?: string
}

const DEBOUNCE_MS = 300

export default function LocationPopup({
  isOpen,
  onClose,
  onSelectLocation,
  onPermissionDenied,
  searchQuery: searchQueryProp = '',
  triggerRef,
  anchorRef,
  popupClassName = '',
}: LocationPopupProps) {
  const { markAutoDetectInFlight, setShowPermissionModal } = useLocationContext()
  const [autoDetectLoading, setAutoDetectLoading] = useState(false)
  const [popularList, setPopularList] = useState<LocationItem[]>([])
  const [popularLoading, setPopularLoading] = useState(true)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [liveResults, setLiveResults] = useState<LocationItem[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const popupRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Debounce search query from parent (typed in same location input)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQueryProp.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchQueryProp])

  // Fetch popular localities when popup opens
  useEffect(() => {
    if (!isOpen) return
    setPopularLoading(true)
    fetch('/api/locations/popular?limit=20')
      .then((res) => res.json())
      .then((data) => {
        setPopularList(Array.isArray(data) ? data : [])
      })
      .catch(() => setPopularList([]))
      .finally(() => setPopularLoading(false))
  }, [isOpen])

  // Live search API
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setLiveResults([])
      setLiveLoading(false)
      return
    }
    setLiveLoading(true)
    fetch(`/api/locations/search?q=${encodeURIComponent(debouncedQuery)}&limit=15`)
      .then((res) => res.json())
      .then((data) => {
        setLiveResults(Array.isArray(data) ? data : [])
      })
      .catch(() => setLiveResults([]))
      .finally(() => setLiveLoading(false))
  }, [debouncedQuery])

  const handleAutoDetect = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onPermissionDenied?.()
      return
    }

    markAutoDetectInFlight(true)
    setAutoDetectLoading(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords
          const { lat, lon } = normalizeLatLonForStorage(latitude, longitude)
          const res = await fetch(`/api/locations/reverse-geocode?${reverseGeocodeSearchParams(latitude, longitude)}`)
          const data = await res.json()
          const displayName = data?.displayName || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
          const city = typeof data?.city === 'string' ? data.city.trim() : ''
          const area = typeof data?.area === 'string' ? data.area.trim() : ''
          const item: LocationItem = {
            id: 0,
            location_name: area || displayName,
            city,
            latitude: lat,
            longitude: lon,
          }
          onSelectLocation(displayName, item)
          setShowPermissionModal(false)
          onClose()
        } finally {
          setAutoDetectLoading(false)
          markAutoDetectInFlight(false)
        }
      },
      (error) => {
        setAutoDetectLoading(false)
        markAutoDetectInFlight(false)
        if (error.code === 1) {
          onPermissionDenied?.()
          onClose()
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }, [onSelectLocation, onClose, onPermissionDenied, markAutoDetectInFlight])

  const handleSelect = useCallback(
    (item: LocationItem) => {
      const display = item.location_name + (item.city ? `, ${item.city}` : '')
      onSelectLocation(display, item)
      onClose()
    },
    [onSelectLocation, onClose]
  )

  // Outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popupRef.current?.contains(target) ||
        triggerRef.current?.contains(target) ||
        (anchorRef?.current?.contains(target) ?? false)
      )
        return
      onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onClose, triggerRef, anchorRef])

  const showLiveSection = searchQueryProp.trim().length > 0

  // Keyboard: Escape, ArrowUp/Down, Enter (based on visible list)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      const list = showLiveSection ? liveResults : popularList
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => (i < list.length - 1 ? i + 1 : i))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => (i > 0 ? i - 1 : -1))
        return
      }
      if (e.key === 'Enter' && highlightIndex >= 0 && list[highlightIndex]) {
        e.preventDefault()
        handleSelect(list[highlightIndex])
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, highlightIndex, showLiveSection, popularList, liveResults, onClose, handleSelect, searchQueryProp])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        ref={popupRef}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className={`absolute left-0 right-0 top-full mt-2 z-50 bg-white overflow-hidden rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 w-full max-w-[380px] max-h-[280px] flex flex-col ${popupClassName}`}
        role="dialog"
        aria-label="Choose location"
      >
        {/* Auto-detect current location - prominent button at top */}
        <div className="p-3 border-b border-gray-100">
          <button
            type="button"
            onClick={handleAutoDetect}
            disabled={autoDetectLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-purple/50 bg-white text-text font-medium hover:bg-purple-light transition-colors disabled:opacity-70"
          >
            {autoDetectLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-purple" />
            ) : (
              <MapPin className="w-5 h-5 text-purple flex-shrink-0" />
            )}
            <span>{autoDetectLoading ? 'Detecting…' : 'Auto-detect current location'}</span>
          </button>
        </div>

        {/* POPULAR LOCALITIES – only when user is not typing (same modal, content switches) */}
        {!showLiveSection && (
          <div className="p-3 border-b border-gray-100 flex-1 min-h-0 overflow-hidden flex flex-col">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-text-light mb-2.5 px-1">
              Popular localities
            </h3>
            {popularLoading ? (
              <div className="py-4 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-purple" />
              </div>
            ) : (
              <div
                ref={listRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-0.5 pr-1"
                role="list"
                style={{ scrollbarWidth: 'thin' }}
              >
                {popularList.length === 0 && !popularLoading && (
                  <p className="text-sm text-text-light py-2 px-1">
                    No popular localities configured.
                  </p>
                )}
                {popularList.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-left transition-colors ${
                      highlightIndex === idx ? 'bg-purple-light' : 'hover:bg-gray-50'
                    }`}
                    role="listitem"
                  >
                    <MapPin className="w-4 h-4 text-purple flex-shrink-0" />
                    <span className="text-sm font-medium text-text truncate">
                      {item.location_name}
                      {item.city ? `, ${item.city}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live search results – when user types in same location input, replace Popular in same modal */}
        {showLiveSection && (
          <div className="p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-text-light mb-2.5 px-1">
              Search results
            </h3>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-0.5 pr-1" style={{ scrollbarWidth: 'thin' }}>
              {liveLoading && (
                <div className="py-4 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-purple" />
                </div>
              )}
              {!liveLoading && liveResults.length === 0 && (
                <p className="text-sm text-text-light py-2">No locations found.</p>
              )}
              {!liveLoading &&
                liveResults.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-left transition-colors ${
                      highlightIndex === idx ? 'bg-purple-light' : 'hover:bg-gray-50'
                    }`}
                  >
                    <MapPin className="w-4 h-4 text-purple flex-shrink-0" />
                    <span className="text-sm font-medium text-text truncate">
                      {item.location_name}
                      {item.city ? `, ${item.city}` : ''}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
