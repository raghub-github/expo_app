'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import type { LocationItem } from './LocationPopup'
import { useAppSelector } from '@/lib/hooks'
import {
  readRecentHistoryCache,
  readSavedListCache,
  writeRecentHistoryCache,
  writeSavedListCache,
} from '@/lib/locationListCache'
import { RECENT_LOCATIONS_UI_MAX } from '@/lib/recentLocationsLimit'
import { isPanIndiaSavedRow } from '@/lib/panIndiaLocation'
import { normalizeLatLonForStorage, reverseGeocodeSearchParams } from '@/lib/normalizeLatLon'

/** Only show in "Recently used" when there is a real place name (not empty / dash placeholders). */
function hasUsableRecentLocation(item: LocationItem): boolean {
  const line = (item.location_name || '').trim()
  if (!line) return false
  const withoutSeparators = line.replace(/[\s\u2014\u2013\-_,.]+/g, '')
  if (!withoutSeparators.length) return false
  // At least one letter or digit (Latin, Indic scripts, etc.)
  if (!/[0-9A-Za-z\u0900-\u0DFF]/.test(line)) return false
  return true
}

function filterSavedNoIndia<T extends { location_name?: string; city?: string }>(items: T[]): T[] {
  return items.filter((item) => !isPanIndiaSavedRow(item.location_name || '', item.city))
}

/** Arabic comma → Latin; normalize spaces */
function normalizeCommas(s: string): string {
  return s.replace(/\u060C/g, ',').replace(/\s+/g, ' ').trim()
}

function isPlaceholderSegment(seg: string): boolean {
  const t = seg.trim()
  if (!t) return true
  if (/^[\s—–\-_.]+$/u.test(t)) return true
  if (t === '—' || t === '–' || t === '-' || t === '...') return true
  return false
}

function isWeakPostalCode(p: string): boolean {
  const d = p.replace(/\s/g, '')
  return d.length > 0 && /^0+$/.test(d)
}

function normalizeForMatch(s: string): string {
  return normalizeCommas(s).toLowerCase()
}

/** Drop dash-only / empty segments and duplicate tokens (Swiggy-style clean line). */
function cleanCommaSeparatedLine(s: string): string {
  const t = normalizeCommas(s)
  const parts = t
    .split(',')
    .map((p) => p.trim())
    .filter((p) => !isPlaceholderSegment(p))
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out.join(', ')
}

/** Bold heading: main stored address line (address_line1). */
function locationCardTitle(item: LocationItem): string {
  return cleanCommaSeparatedLine(item.location_name || '')
}

/** Subline: city / state / pin only — avoids repeating full line + removes — placeholders. */
function locationCardSubtitle(item: LocationItem): string {
  const postal =
    typeof item.postal_code === 'string' && item.postal_code.trim() && !isWeakPostalCode(item.postal_code)
      ? item.postal_code.trim()
      : ''
  const parts = [item.city, item.state, postal]
    .map((v) => (typeof v === 'string' ? normalizeCommas(v) : ''))
    .filter((v) => v.length > 0 && !isPlaceholderSegment(v))
  if (parts.length === 0) return ''
  let line = cleanCommaSeparatedLine(parts.join(', '))
  if (!line) return ''
  if (!/\bIndia\b/i.test(line)) line = `${line}, India`
  const titleNorm = cleanCommaSeparatedLine(item.location_name || '')
    .toLowerCase()
    .replace(/\s/g, '')
  const subNorm = line.toLowerCase().replace(/\s/g, '')
  if (subNorm && titleNorm.includes(subNorm)) return ''
  return line
}

interface LocationSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelectLocation: (displayName: string, item?: LocationItem) => void
  onPermissionDenied?: () => void
  title?: string
}

export default function LocationSheet({
  isOpen,
  onClose,
  onSelectLocation,
  onPermissionDenied,
  title = 'Select Location',
}: LocationSheetProps) {
  const CURRENT_LOCATION_KEY = 'gatimitra_location_v1'
  const SAVED_LOCATIONS_KEY = 'gatimitra_saved_locations_v1'
  const RECENT_GUEST_KEY = 'gatimitra_recent_locations_v1'
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [popularLocations, setPopularLocations] = useState<LocationItem[]>([])
  const [savedLocations, setSavedLocations] = useState<LocationItem[]>([])
  const [recentLocations, setRecentLocations] = useState<LocationItem[]>([])
  const [searchResults, setSearchResults] = useState<LocationItem[]>([])
  const [popularLoading, setPopularLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [autoDetectLoading, setAutoDetectLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'saved' | 'popular'>('saved')
  const { user, isAuthenticated } = useAppSelector((state) => state.auth)

  const toLocationLabel = (item: LocationItem) => `${item.location_name}${item.city ? `, ${item.city}` : ''}`

  const getAddressLabel = (item: LocationItem) => {
    const custom = typeof item.custom_label === 'string' ? item.custom_label.trim() : ''
    if (custom) return custom
    const label = typeof item.label === 'string' ? item.label.trim() : ''
    return label
  }

  /** Badge colors: HOME green, WORK blue, OTHER slate; custom_label gets a distinct violet tint. */
  const loadGuestRecent = (): LocationItem[] => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(RECENT_GUEST_KEY) : null
      const parsed = raw ? (JSON.parse(raw) as LocationItem[]) : []
      return Array.isArray(parsed) ? parsed.slice(0, RECENT_LOCATIONS_UI_MAX) : []
    } catch {
      return []
    }
  }

  const pushGuestRecent = (item: LocationItem) => {
    try {
      const list = loadGuestRecent()
      const key = `${item.location_name}|${item.city || ''}`.toLowerCase()
      const filtered = list.filter((l) => `${l.location_name}|${l.city || ''}`.toLowerCase() !== key)
      const next = [item, ...filtered].slice(0, RECENT_LOCATIONS_UI_MAX)
      window.localStorage.setItem(RECENT_GUEST_KEY, JSON.stringify(next))
      setRecentLocations(next)
    } catch {
      // ignore
    }
  }

  /** Recently used on the website is device-local only (not the address book in Postgres). */
  const pushAuthenticatedRecent = (customerId: number, item: LocationItem) => {
    try {
      const existing = readRecentHistoryCache(customerId) ?? []
      const key = `${item.location_name}|${item.city || ''}`.toLowerCase()
      const filtered = existing.filter((l) => `${l.location_name}|${l.city || ''}`.toLowerCase() !== key)
      const next = [item, ...filtered].slice(0, RECENT_LOCATIONS_UI_MAX)
      writeRecentHistoryCache(customerId, next)
      setRecentLocations(next)
    } catch {
      // ignore
    }
  }

  const getLabelBadgeClassName = (item: LocationItem) => {
    const custom = typeof item.custom_label === 'string' ? item.custom_label.trim() : ''
    if (custom) {
      return 'bg-violet-50 text-violet-700'
    }
    const raw = typeof item.label === 'string' ? item.label.trim().toUpperCase() : ''
    if (raw === 'HOME') return 'bg-emerald-50 text-emerald-700'
    if (raw === 'WORK') return 'bg-blue-50 text-blue-700'
    return 'bg-slate-100 text-slate-600'
  }

  /** After a pick: update “Recently used” locally. Saved addresses in DB are only added from the native app (see POST /api/locations/saved). */
  const recordLocationPick = (item: LocationItem) => {
    const customerId = Number(user?.id)
    if (isAuthenticated && Number.isFinite(customerId)) {
      pushAuthenticatedRecent(customerId, item)
      return
    }
    pushGuestRecent(item)
  }

  const clearRecentUsed = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    try {
      const customerId = Number(user?.id)
      if (isAuthenticated && Number.isFinite(customerId)) {
        writeRecentHistoryCache(customerId, [])
      } else if (typeof window !== 'undefined') {
        window.localStorage.removeItem(RECENT_GUEST_KEY)
      }
      setRecentLocations([])
    } catch {
      setRecentLocations([])
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 280)
    return () => clearTimeout(t)
  }, [searchQuery, isOpen])

  useEffect(() => {
    if (!isOpen) return
    setActiveTab('saved')

    try {
      const customerId = Number(user?.id)
      if (isAuthenticated && Number.isFinite(customerId)) {
        const cachedSaved = readSavedListCache(customerId)
        const cachedRecent = readRecentHistoryCache(customerId)
        if (cachedSaved?.length) setSavedLocations(filterSavedNoIndia(cachedSaved))
        if (cachedRecent?.length) setRecentLocations(cachedRecent.slice(0, RECENT_LOCATIONS_UI_MAX))

        setPopularLoading(true)
        Promise.all([
          fetch(`/api/locations/saved?customerId=${customerId}`).then((r) => r.json()),
          fetch('/api/locations/popular?limit=20').then((r) => r.json()),
        ])
          .then(([savedRows, popularRows]) => {
            if (Array.isArray(savedRows)) {
              const filteredSaved = filterSavedNoIndia(savedRows)
              setSavedLocations(filteredSaved)
              writeSavedListCache(customerId, filteredSaved)
            } else {
              setSavedLocations([])
            }
            setPopularLocations(Array.isArray(popularRows) ? popularRows : [])
          })
          .catch(() => {
            setSavedLocations([])
            setPopularLocations([])
          })
          .finally(() => setPopularLoading(false))
        return
      }

      const rawSaved = window.localStorage.getItem(SAVED_LOCATIONS_KEY)
      const saved = rawSaved ? (JSON.parse(rawSaved) as LocationItem[]) : []
      const list = filterSavedNoIndia(Array.isArray(saved) ? saved : [])

      const rawCurrent = window.localStorage.getItem(CURRENT_LOCATION_KEY)
      const current = rawCurrent ? (JSON.parse(rawCurrent) as { displayName?: string; lat?: number | null; lon?: number | null }) : null
      if (current?.displayName) {
        const [location_name, city = ''] = current.displayName.split(',').map((v) => v.trim())
        const currentItem: LocationItem = {
          id: -1,
          location_name: location_name || current.displayName,
          city,
          latitude: typeof current.lat === 'number' ? current.lat : 0,
          longitude: typeof current.lon === 'number' ? current.lon : 0,
        }
        const skipPanIndia = isPanIndiaSavedRow(currentItem.location_name, currentItem.city)
        const exists = list.some(
          (l) =>
            l.location_name.toLowerCase() === currentItem.location_name.toLowerCase() &&
            (l.city || '').toLowerCase() === (currentItem.city || '').toLowerCase()
        )
        const merged = skipPanIndia ? list : exists ? list : [currentItem, ...list]
        setSavedLocations(merged.slice(0, 8))
      } else {
        setSavedLocations(list.slice(0, 8))
      }
      setRecentLocations(loadGuestRecent())

      setPopularLoading(true)
      fetch('/api/locations/popular?limit=20')
        .then((r) => r.json())
        .then((popularRows) => {
          setPopularLocations(Array.isArray(popularRows) ? popularRows : [])
        })
        .catch(() => {
          setPopularLocations([])
        })
        .finally(() => setPopularLoading(false))
    } catch {
      setSavedLocations([])
    }
  }, [isOpen, isAuthenticated, user?.id])

  useEffect(() => {
    if (!isOpen) return
    if (!debouncedQuery) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    fetch(`/api/locations/search?q=${encodeURIComponent(debouncedQuery)}&limit=15`)
      .then((res) => res.json())
      .then((data) => setSearchResults(Array.isArray(data) ? data : []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false))
  }, [isOpen, debouncedQuery])

  const selectLocationAndClose = (item: LocationItem) => {
    onSelectLocation(toLocationLabel(item), item)
    recordLocationPick(item)
    setSearchQuery('')
    onClose()
  }

  const selectTypedLocationOnEnter = () => {
    const typed = searchQuery.trim()
    if (!typed) return
    if (searchResults.length > 0) {
      const typedNorm = normalizeForMatch(typed)
      const exact = searchResults.find((item) => normalizeForMatch(toLocationLabel(item)) === typedNorm)
      const startsWith = searchResults.find((item) =>
        normalizeForMatch(toLocationLabel(item)).startsWith(typedNorm)
      )
      const best = exact ?? startsWith ?? searchResults[0]
      if (best) {
        selectLocationAndClose(best)
        return
      }
    }
    // Fallback: honor typed address even if API has no suggestions yet.
    const parts = typed.split(',').map((p) => p.trim()).filter(Boolean)
    const item: LocationItem = {
      id: Date.now(),
      location_name: parts[0] || typed,
      city: parts.length > 1 ? parts[parts.length - 1] : '',
      latitude: 0,
      longitude: 0,
    }
    selectLocationAndClose(item)
  }

  const handleAutoDetect = () => {
    if (!navigator.geolocation) return
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
          await selectLocationAndClose(item)
        } finally {
          setAutoDetectLoading(false)
        }
      },
      (error) => {
        setAutoDetectLoading(false)
        if (error.code === 1) onPermissionDenied?.()
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const recentToShow = recentLocations
    .filter((r) => hasUsableRecentLocation(r))
    .slice(0, RECENT_LOCATIONS_UI_MAX)

  const handleSheetClose = () => {
    setSearchQuery('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1300]">
      <button type="button" className="absolute inset-0 bg-black/35" onClick={handleSheetClose} aria-label="Close location sheet" />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[430px] bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={handleSheetClose} className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Close sheet">
            ×
          </button>
        </div>

        <div className="border-b border-slate-100 p-4">
          <button
            type="button"
            onClick={handleAutoDetect}
            disabled={autoDetectLoading}
            className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-70"
          >
            {autoDetectLoading ? 'Detecting location...' : 'Auto-detect current location'}
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${activeTab === 'saved' ? 'bg-white text-[#0f9f89] shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              Saved Location
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('popular')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${activeTab === 'popular' ? 'bg-white text-[#0f9f89] shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              Popular Location
            </button>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                selectTypedLocationOnEnter()
              }
            }}
            placeholder="Search locality, city, area..."
            className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#16c2a5] focus:shadow-[0_0_0_3px_rgba(22,194,165,0.08)]"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {debouncedQuery ? (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search results</p>
              {searchLoading ? (
                <p className="text-sm text-slate-500">Searching...</p>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-slate-500">No locations found.</p>
              ) : (
                <div className="space-y-1.5">
                  {searchResults.map((item) => (
                    <button
                      key={`${item.id}-${item.location_name}`}
                      type="button"
                      onClick={() => void selectLocationAndClose(item)}
                      className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {item.location_name}{item.city ? `, ${item.city}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {activeTab === 'saved' ? (
                recentToShow.length === 0 && savedLocations.length === 0 ? (
                  <p className="text-sm text-slate-500">No saved location yet.</p>
                ) : (
                  <div className="space-y-6">
                    {recentToShow.length > 0 ? (
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Recently used
                          </p>
                          <button
                            type="button"
                            onClick={clearRecentUsed}
                            className="shrink-0 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                            aria-label="Clear recently used addresses"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="divide-y divide-dashed divide-slate-200">
                          {recentToShow.map((item) => {
                            const sub = locationCardSubtitle(item)
                            return (
                              <button
                                key={`recent-${item.id}-${item.location_name}-${item.city}`}
                                type="button"
                                onClick={() => void selectLocationAndClose(item)}
                                className="group flex w-full items-start gap-3 py-3 text-left first:pt-0 transition-colors hover:bg-slate-50/90"
                              >
                                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 group-hover:bg-slate-200/80">
                                  <i className="fas fa-history text-xs" aria-hidden />
                                </span>
                                <div className="min-w-0 flex-1">
                                  {getAddressLabel(item) ? (
                                    <span
                                      className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getLabelBadgeClassName(item)}`}
                                    >
                                      {getAddressLabel(item)}
                                    </span>
                                  ) : (
                                    <span className="mb-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                      Recent
                                    </span>
                                  )}
                                  <p className="text-base font-bold leading-snug text-slate-900 break-words">
                                    {locationCardTitle(item)}
                                  </p>
                                  {sub ? (
                                    <p className="mt-1 text-sm font-normal leading-relaxed text-slate-500 break-words">
                                      {sub}
                                    </p>
                                  ) : null}
                                </div>
                                <i className="fas fa-chevron-right mt-2 shrink-0 text-[10px] text-slate-400" aria-hidden />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                    {savedLocations.length > 0 ? (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Saved locations
                        </p>
                        <div className="space-y-2">
                          {savedLocations.map((item) => {
                            const sub = locationCardSubtitle(item)
                            return (
                              <button
                                key={`saved-${item.id}-${item.location_name}-${item.city}`}
                                type="button"
                                onClick={() => void selectLocationAndClose(item)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition-all hover:border-[#16c2a5]/40 hover:shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    {getAddressLabel(item) ? (
                                      <span
                                        className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getLabelBadgeClassName(item)}`}
                                      >
                                        {getAddressLabel(item)}
                                      </span>
                                    ) : null}
                                    <p className="text-base font-bold leading-snug text-slate-900 break-words">
                                      {locationCardTitle(item)}
                                    </p>
                                    {sub ? (
                                      <p className="mt-1 text-sm font-normal leading-relaxed text-slate-500 break-words">
                                        {sub}
                                      </p>
                                    ) : null}
                                  </div>
                                  <i className="fas fa-chevron-right mt-2 shrink-0 text-[10px] text-slate-400" aria-hidden />
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              ) : (
                <>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Popular localities</p>
                  {popularLoading ? (
                    <p className="text-sm text-slate-500">Loading localities...</p>
                  ) : popularLocations.length === 0 ? (
                    <p className="text-sm text-slate-500">No popular localities configured.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {popularLocations.map((item) => (
                        <button
                          key={`${item.id}-${item.location_name}`}
                          type="button"
                          onClick={() => void selectLocationAndClose(item)}
                          className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {toLocationLabel(item)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

