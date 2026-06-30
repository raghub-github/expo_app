'use client'

import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'
import OpeningHoursModal from '@/components/common/OpeningHoursModal'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'
import { isPanIndiaLocationDisplay } from '@/lib/panIndiaLocation'
import {
  AROUND_YOU_STORE_TYPE_FILTERS,
  formatMerchantStoreTypeLabel,
  parseStoreTypeQueryParam,
  type AroundYouStoreTypeFilterValue,
} from '@/lib/merchantStoreTypes'
import {
  isOperationalClosedStatus,
  isOperationalOpenStatus,
  operationalStatusPillClassName,
} from '@/lib/operationalStatusBadge'
import { normalizeLatLonForStorage, reverseGeocodeSearchParams } from '@/lib/normalizeLatLon'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'
import { buildLocationQueryFromState } from '@/lib/locationQuery'

const GREEN = '#109D4C'

/** Gradient text for store-type chips — distinct, readable on white. */
const STORE_TYPE_TEXT_GRADIENTS = [
  'bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600 bg-clip-text text-transparent',
  'bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent',
  'bg-gradient-to-r from-rose-600 via-pink-600 to-orange-500 bg-clip-text text-transparent',
  'bg-gradient-to-r from-amber-700 via-orange-600 to-red-600 bg-clip-text text-transparent',
  'bg-gradient-to-r from-sky-700 via-blue-600 to-indigo-700 bg-clip-text text-transparent',
  'bg-gradient-to-r from-lime-700 via-green-600 to-emerald-700 bg-clip-text text-transparent',
  'bg-gradient-to-r from-indigo-700 via-violet-600 to-purple-700 bg-clip-text text-transparent',
  'bg-gradient-to-r from-cyan-700 via-teal-600 to-blue-700 bg-clip-text text-transparent',
  'bg-gradient-to-r from-fuchsia-700 via-rose-600 to-orange-600 bg-clip-text text-transparent',
  'bg-gradient-to-r from-blue-800 via-sky-600 to-cyan-600 bg-clip-text text-transparent',
  'bg-gradient-to-r from-green-800 via-lime-600 to-yellow-600 bg-clip-text text-transparent',
  'bg-gradient-to-r from-red-700 via-rose-600 to-pink-600 bg-clip-text text-transparent',
  'bg-gradient-to-r from-slate-800 via-gray-700 to-zinc-600 bg-clip-text text-transparent',
  'bg-gradient-to-r from-teal-800 via-emerald-600 to-green-500 bg-clip-text text-transparent',
  'bg-gradient-to-r from-orange-800 via-amber-600 to-yellow-500 bg-clip-text text-transparent',
] as const

function storeTypeTextGrad(i: number): string {
  return STORE_TYPE_TEXT_GRADIENTS[i % STORE_TYPE_TEXT_GRADIENTS.length]
}

const STORE_TYPE_HEADING_GRADIENT =
  'bg-gradient-to-r from-gray-800 via-[#109D4C] to-teal-700 bg-clip-text text-transparent'

const DISTANCE_RADIUS_KM = [1, 3, 5, 10] as const
type RadiusKm = (typeof DISTANCE_RADIUS_KM)[number]

/** Near Me tab: always use this radius for API + client filter (user’s area within 10 km). */
const NEAR_ME_RADIUS_KM = 10 as const satisfies RadiusKm

/** URL query uses fewer decimals than JS floats — avoid re-sync overwriting a good display name. */
function coordsClose(
  a: number | null | undefined,
  b: number,
  eps = 1e-5
): boolean {
  if (a == null || !Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) < eps
}

/** Primary sort column (distance is separate via `orderDistance`). */
type SortColumn = 'rating' | 'delivery' | 'name'

const SORT_RATING_MINS = [0, 3, 3.5, 4, 4.5] as const
const SORT_DELIVERY_MAXS = [0, 15, 30, 45, 60] as const

/** Open / closed listing; default `all` shows every store. */
type OperationalFilter = 'all' | 'open' | 'closed'

type AroundYouFilters = {
  viewMode: 'all' | 'near'
  radiusKm: RadiusKm
  sortColumn: SortColumn
  /** Nearest first (only when location is set + All tab); URL `order=distance`. */
  orderDistance: boolean
  sortRatingMin: number
  sortDeliveryMax: number
  sortNameOrder: 'az' | 'za'
  storeTypeFilter: AroundYouStoreTypeFilterValue
  vegOnly: boolean
  operationalFilter: OperationalFilter
}

function parseStoreTypeFilterFromUrl(raw: string | null): AroundYouStoreTypeFilterValue {
  const parsed = parseStoreTypeQueryParam(raw)
  if (parsed.mode !== 'eq') return 'ALL'
  const v = parsed.value
  if (v === 'GENERAL' || v === 'FOOD') return 'ALL'
  const allowed = AROUND_YOU_STORE_TYPE_FILTERS.some((f) => f.value === v)
  return allowed ? (v as AroundYouStoreTypeFilterValue) : 'ALL'
}

function parseOperationalFilter(raw: string | null): OperationalFilter {
  const v = (raw || '').trim().toLowerCase()
  if (v === 'open' || v === 'closed') return v
  return 'all'
}

function getDefaultAroundYouFilters(): AroundYouFilters {
  return {
    viewMode: 'all',
    radiusKm: 10,
    sortColumn: 'rating',
    orderDistance: false,
    sortRatingMin: 0,
    sortDeliveryMax: 0,
    sortNameOrder: 'az',
    storeTypeFilter: 'ALL',
    vegOnly: false,
    operationalFilter: 'all',
  }
}

/** `hydrated` avoids treating geo as missing before LocationProvider loads localStorage (would drop URL-backed order). */
function parseAroundYouFilters(
  searchParams: URLSearchParams,
  hasGeo: boolean,
  hydrated: boolean
): AroundYouFilters {
  const viewMode = searchParams.get('view') === 'near' ? 'near' : 'all'
  const kmRaw = Number(searchParams.get('km'))
  let radiusKm: RadiusKm = DISTANCE_RADIUS_KM.includes(kmRaw as RadiusKm)
    ? (kmRaw as RadiusKm)
    : 10
  if (searchParams.get('view') === 'near') {
    radiusKm = NEAR_ME_RADIUS_KM
  }
  const vegOnly = searchParams.get('veg') === '1' || searchParams.get('veg') === 'true'
  const storeTypeFilter = parseStoreTypeFilterFromUrl(searchParams.get('store_type'))
  const operationalFilter = parseOperationalFilter(searchParams.get('ops'))

  const rawSort = (searchParams.get('sort') || 'rating').toLowerCase()
  let sortColumn: SortColumn = 'rating'
  if (rawSort === 'delivery') sortColumn = 'delivery'
  else if (rawSort === 'name') sortColumn = 'name'
  else sortColumn = 'rating'

  const sminRaw = Number(searchParams.get('smin'))
  const sortRatingMin = SORT_RATING_MINS.includes(sminRaw as (typeof SORT_RATING_MINS)[number])
    ? sminRaw
    : 0

  const dmaxRaw = Number(searchParams.get('dmax'))
  const sortDeliveryMax = SORT_DELIVERY_MAXS.includes(dmaxRaw as (typeof SORT_DELIVERY_MAXS)[number])
    ? dmaxRaw
    : 0

  const sortNameOrder = searchParams.get('sn') === 'za' ? 'za' : 'az'

  const pendingOrderDistance =
    viewMode === 'all' && (searchParams.get('order') === 'distance' || rawSort === 'distance')

  let orderDistance = pendingOrderDistance && (hasGeo || !hydrated)

  if (viewMode === 'near' && hasGeo) {
    orderDistance = false
  }
  if (hydrated && !hasGeo) {
    orderDistance = false
  }

  return {
    viewMode,
    radiusKm,
    sortColumn,
    orderDistance,
    sortRatingMin,
    sortDeliveryMax,
    sortNameOrder,
    storeTypeFilter,
    vegOnly,
    operationalFilter,
  }
}

/** Omits defaults so URLs stay short; `view=near` implies sort by distance (not stored in query). */
function buildAroundYouQueryString(
  f: AroundYouFilters,
  hasGeo: boolean,
  urlGeo: { lat: number; lon: number } | null,
  locationName?: string
): string {
  const p = new URLSearchParams()
  if (locationName && locationName.trim() !== '') {
    p.set('location', locationName)
  }
  if (urlGeo) {
    p.set('lat', String(urlGeo.lat))
    p.set('lon', String(urlGeo.lon))
  }
  if (f.viewMode === 'near') p.set('view', 'near')
  if (hasGeo && f.radiusKm !== 10) p.set('km', String(f.radiusKm))
  if (f.viewMode === 'all' && f.sortColumn !== 'rating') p.set('sort', f.sortColumn)
  if (hasGeo && f.viewMode === 'all' && f.orderDistance) p.set('order', 'distance')
  if (f.sortRatingMin > 0) p.set('smin', String(f.sortRatingMin))
  if (f.sortDeliveryMax > 0) p.set('dmax', String(f.sortDeliveryMax))
  if (f.sortNameOrder === 'za') p.set('sn', 'za')
  if (f.storeTypeFilter !== 'ALL') p.set('store_type', f.storeTypeFilter)
  if (f.vegOnly) p.set('veg', '1')
  if (f.operationalFilter !== 'all') p.set('ops', f.operationalFilter)
  return p.toString()
}

type StoreCard = {
  id: string
  storeId: string
  /** Numeric merchant_stores.id for opening-hours API. */
  merchantStorePk: string | null
  name: string
  cuisines: string[]
  image: string
  deliveryTime: number
  minOrder?: number
  isVeg: boolean
  operationalStatus: string | null
  isVerified: boolean
  address: string
  distanceKm: number | null
  rating: number
  storeType: string | null
}

function mapApiToCard(r: Record<string, unknown>): StoreCard {
  const pk = r.id != null && String(r.id).trim() !== '' ? String(r.id) : null
  const sid = (r.store_id ?? r.restaurant_id ?? pk ?? '') as string
  const cuisineRaw = r.cuisine_type as string | undefined
  const cuisines = cuisineRaw
    ? cuisineRaw.split(',').map((c) => c.trim()).filter(Boolean)
    : []
  const st = r.store_type != null && String(r.store_type).trim() !== '' ? String(r.store_type) : null
  return {
    id: String(r.id ?? sid),
    storeId: String(sid),
    merchantStorePk: pk,
    name: String(r.restaurant_name ?? r.name ?? 'Store'),
    cuisines,
    image: String(r.store_img ?? r.image_url ?? ''),
    deliveryTime: r.delivery_time_minutes != null ? Number(r.delivery_time_minutes) : 0,
    minOrder: r.min_order_amount != null ? Number(r.min_order_amount) : undefined,
    isVeg: Boolean(r.is_veg ?? r.is_pure_veg),
    operationalStatus:
      r.operational_status != null && String(r.operational_status).trim() !== ''
        ? String(r.operational_status)
        : null,
    isVerified: r.approval_status === 'APPROVED',
    address: String(r.address ?? r.full_address ?? ''),
    distanceKm: r.distance_km != null ? Number(r.distance_km) : null,
    rating: r.avg_rating != null ? Number(r.avg_rating) : 0,
    storeType: st,
  }
}

export default function AroundYouPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { location: locationState, hydrated, setLocation } = useLocationContext()
  /** Nearby listing only after the user picks a specific place (not pan‑India). */
  const restaurantGeoQs = useMemo(() => {
    if (isPanIndiaLocationDisplay(locationState.displayName)) return ''
    if (locationState.locationCommittedByUser !== true) return ''
    if (locationState.lat == null || locationState.lon == null) return ''
    return getRestaurantGeoQueryString(locationState)
  }, [locationState])

  const hasGeo = Boolean(restaurantGeoQs)

  /** Lat/lon written to the page URL when the user has a committed pin (GPS or manual). */
  const urlGeo = useMemo((): { lat: number; lon: number } | null => {
    if (locationState.locationCommittedByUser !== true) return null
    if (locationState.lat == null || locationState.lon == null) return null
    if (locationState.lat === 0 && locationState.lon === 0) return null
    if (isPanIndiaLocationDisplay(locationState.displayName)) return null
    return { lat: locationState.lat, lon: locationState.lon }
  }, [locationState])

  const filters = useMemo(
    () =>
      parseAroundYouFilters(new URLSearchParams(searchParams?.toString() ?? ''), hasGeo, hydrated),
    [searchParams, hasGeo, hydrated]
  )

  const {
    viewMode,
    storeTypeFilter,
    radiusKm,
    sortColumn,
    orderDistance,
    sortRatingMin,
    sortDeliveryMax,
    sortNameOrder,
    vegOnly,
    operationalFilter,
  } = filters

  const setFilters = useCallback(
    (patch: Partial<AroundYouFilters>) => {
      const next: AroundYouFilters = { ...filters, ...patch }
      if (patch.sortColumn != null && patch.sortColumn !== filters.sortColumn) {
        next.sortRatingMin = 0
        next.sortDeliveryMax = 0
        next.sortNameOrder = 'az'
      }
      if (patch.viewMode === 'near' || next.viewMode === 'near') {
        next.radiusKm = NEAR_ME_RADIUS_KM
      }
      if (next.viewMode === 'near' && hasGeo) {
        next.orderDistance = false
      }
      if (!hasGeo) {
        next.orderDistance = false
      }
      const qs = buildAroundYouQueryString(next, hasGeo, urlGeo, locationState.displayName)
      const base = pathname ?? '/'
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false })
    },
    [filters, hasGeo, urlGeo, pathname, router, locationState.displayName]
  )

  const clearAllFilters = useCallback(() => {
    /** Pan‑India browse: drop `lat`/`lon`/`view=near` from URL and align header location. */
    setLocation('India', null, null, { userInitiated: false, clearLocationCommit: true })
    const qs = buildAroundYouQueryString(getDefaultAroundYouFilters(), false, null, 'India')
    const base = pathname ?? '/'
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false })
  }, [pathname, router, setLocation])

  const [stores, setStores] = useState<StoreCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingHoursStoreId, setOpeningHoursStoreId] = useState<string | null>(null)
  const [nearMeLocating, setNearMeLocating] = useState(false)
  /** Ignore responses from superseded fetches (layout resets location → two loadStores in one navigation). */
  const storesFetchSeqRef = useRef(0)

  /** Requests GPS, then reverse‑geocodes label, updates location + URL with `view=near` + lat/lon. */
  const activateNearMeWithGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not supported in this browser.')
      return
    }
    setNearMeLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { lat, lon } = normalizeLatLonForStorage(pos.coords.latitude, pos.coords.longitude)
        let displayName = 'My current location'
        try {
          const res = await fetch(`/api/locations/reverse-geocode?${reverseGeocodeSearchParams(lat, lon)}`)
          const data = await res.json()
          if (data?.displayName && String(data.displayName).trim()) {
            displayName = String(data.displayName).trim()
          }
        } catch {
          // keep default label
        }
        setLocation(displayName, lat, lon, { userInitiated: true })
        const next: AroundYouFilters = {
          ...filters,
          viewMode: 'near',
          radiusKm: NEAR_ME_RADIUS_KM,
          orderDistance: false,
        }
        const qs = buildAroundYouQueryString(next, true, { lat, lon }, displayName)
        const base = pathname ?? '/'
        router.replace(qs ? `${base}?${qs}` : base, { scroll: false })
        setNearMeLocating(false)
      },
      (err) => {
        setNearMeLocating(false)
        setError(
          err.code === 1
            ? 'Location permission denied. Allow location access to use Near Me.'
            : 'Could not detect your location. Try again.'
        )
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    )
  }, [filters, pathname, router, setLocation])

  /** Drop `order=distance` when geo is unavailable (after location has hydrated). */
  useEffect(() => {
    if (!hydrated) return
    if (hasGeo) return
    if (!searchParams || searchParams.get('order') !== 'distance') return
    const p = new URLSearchParams(searchParams.toString())
    p.delete('order')
    const qs = p.toString()
    const base = pathname ?? '/'
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false })
  }, [hydrated, hasGeo, searchParams, pathname, router])

  const fetchUrl = useMemo(() => {
    if (viewMode === 'near' && !restaurantGeoQs) {
      return null
    }
    const params = new URLSearchParams()
    if (restaurantGeoQs) {
      new URLSearchParams(restaurantGeoQs).forEach((v, k) => {
        params.set(k, v)
      })
      const effectiveRadius =
        viewMode === 'near' ? NEAR_ME_RADIUS_KM : radiusKm
      params.set('radius_km', String(effectiveRadius))
    }
    if (storeTypeFilter !== 'ALL') {
      params.set('store_type', storeTypeFilter)
    }
    const qs = params.toString()
    return qs ? `/api/restaurants?${qs}` : '/api/restaurants'
  }, [restaurantGeoQs, storeTypeFilter, radiusKm, viewMode])

  const loadStores = useCallback(() => {
    const seq = ++storesFetchSeqRef.current
    setLoading(true)
    setError(null)
    if (fetchUrl == null) {
      setStores([])
      setLoading(false)
      return
    }
    fetch(fetchUrl, { cache: 'no-store' })
      .then((res) =>
        res.json().then((data) => {
          if (seq !== storesFetchSeqRef.current) return
          if (!res.ok) {
            setError(typeof data?.error === 'string' ? data.error : 'Failed to load stores')
            setStores([])
            return
          }
          const list = Array.isArray(data) ? data : []
          setStores(list.map((r: Record<string, unknown>) => mapApiToCard(r)))
        })
      )
      .catch(() => {
        if (seq !== storesFetchSeqRef.current) return
        setError('Failed to load stores')
        setStores([])
      })
      .finally(() => {
        if (seq !== storesFetchSeqRef.current) return
        setLoading(false)
      })
  }, [fetchUrl])

  /**
   * Flat `/india/All/Stores` = pan‑India browse in the URL.
   * Sync context before paint so the first fetch matches the URL (not stale localStorage).
   * - With `?lat=&lon=`: apply geo from the query (bookmarks).
   * - Without geo query: reset to India + full catalog when a specific place was persisted.
   * - `view=near`: do **not** clear committed coords — Near Me needs lat/lon from the user’s area.
   */
  useLayoutEffect(() => {
    if (!hydrated) return
    if (pathname !== '/india/All/Stores') return

    const latStr = searchParams?.get('lat') ?? null
    const lonStr = searchParams?.get('lon') ?? null
    if (latStr != null && lonStr != null) {
      const lat = Number(latStr)
      const lon = Number(lonStr)
      if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
        if (coordsClose(locationState.lat, lat) && coordsClose(locationState.lon, lon)) {
          return
        }
        const label =
          isPanIndiaLocationDisplay(locationState.displayName) ||
          !String(locationState.displayName || '').trim()
            ? 'My current location'
            : locationState.displayName
        setLocation(label, lat, lon, { userInitiated: true })
        return
      }
    }

    if (searchParams?.get('view') === 'near') {
      return
    }

    const needsReset =
      !isPanIndiaLocationDisplay(locationState.displayName) ||
      locationState.lat != null ||
      locationState.lon != null ||
      locationState.locationCommittedByUser === true

    if (needsReset) {
      setLocation('India', null, null, { userInitiated: false, clearLocationCommit: true })
    }
  }, [
    hydrated,
    pathname,
    searchParams,
    locationState.displayName,
    locationState.lat,
    locationState.lon,
    locationState.locationCommittedByUser,
    setLocation,
  ])

  /**
   * When the URL has lat/lon but the header would still show a generic label (e.g. after URL↔float
   * sync or first paint with India), resolve a readable name via reverse‑geocode.
   */
  const reverseGeoInFlight = useRef(false)
  useEffect(() => {
    if (!hydrated) return
    if (pathname !== '/india/All/Stores') return
    const latStr = searchParams?.get('lat')
    const lonStr = searchParams?.get('lon')
    if (!latStr || !lonStr) return
    const lat = Number(latStr)
    const lon = Number(lonStr)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return
    if (!coordsClose(locationState.lat, lat) || !coordsClose(locationState.lon, lon)) return

    const dn = (locationState.displayName || '').trim()
    const needsRichLabel =
      !dn ||
      dn === 'Selected location' ||
      dn === 'My current location' ||
      isPanIndiaLocationDisplay(dn)

    if (!needsRichLabel) return
    if (reverseGeoInFlight.current) return
    reverseGeoInFlight.current = true

    fetch(`/api/locations/reverse-geocode?${reverseGeocodeSearchParams(lat, lon)}`)
      .then((r) => r.json())
      .then((data) => {
        const name = data?.displayName && String(data.displayName).trim()
        if (name) {
          setLocation(name, lat, lon, { userInitiated: true })
        }
      })
      .catch(() => {})
      .finally(() => {
        reverseGeoInFlight.current = false
      })
  }, [
    hydrated,
    pathname,
    searchParams,
    locationState.displayName,
    locationState.lat,
    locationState.lon,
    setLocation,
  ])

  /** Wait for localStorage hydration; location for flat URL is aligned in useLayoutEffect above. */
  useEffect(() => {
    if (!hydrated) return
    loadStores()
  }, [hydrated, loadStores])

  const filtered = useMemo(() => {
    let list = stores
    if (viewMode === 'near' && !hasGeo) {
      return []
    }
    if (viewMode === 'near' && hasGeo) {
      list = list.filter(
        (s) =>
          s.distanceKm != null &&
          Number.isFinite(s.distanceKm) &&
          s.distanceKm <= NEAR_ME_RADIUS_KM + 0.001
      )
    }
    if (vegOnly) list = list.filter((s) => s.isVeg)
    if (operationalFilter === 'open') {
      list = list.filter(
        (s) => s.operationalStatus != null && isOperationalOpenStatus(s.operationalStatus)
      )
    } else if (operationalFilter === 'closed') {
      list = list.filter(
        (s) => s.operationalStatus != null && isOperationalClosedStatus(s.operationalStatus)
      )
    }
    if (sortColumn === 'rating' && sortRatingMin > 0) {
      list = list.filter((s) => s.rating >= sortRatingMin - 0.001)
    }
    if (sortColumn === 'delivery' && sortDeliveryMax > 0) {
      list = list.filter((s) => s.deliveryTime > 0 && s.deliveryTime <= sortDeliveryMax)
    }
    return list
  }, [
    stores,
    viewMode,
    hasGeo,
    vegOnly,
    operationalFilter,
    sortColumn,
    sortRatingMin,
    sortDeliveryMax,
  ])

  const isNearTab = viewMode === 'near'

  /** How many filter dimensions differ from defaults (row 1 + store type); shown on Clear filters. */
  const appliedAroundYouFilterCount = useMemo(() => {
    const d = getDefaultAroundYouFilters()
    let n = 0
    if (viewMode !== d.viewMode) n += 1
    if (hasGeo && radiusKm !== d.radiusKm) n += 1
    if (hasGeo && viewMode === 'all' && orderDistance) n += 1
    if (sortColumn !== d.sortColumn) n += 1
    if (sortRatingMin > 0) n += 1
    if (sortDeliveryMax > 0) n += 1
    if (sortNameOrder !== d.sortNameOrder) n += 1
    if (storeTypeFilter !== d.storeTypeFilter) n += 1
    if (vegOnly) n += 1
    if (operationalFilter !== d.operationalFilter) n += 1
    return n
  }, [
    viewMode,
    hasGeo,
    radiusKm,
    orderDistance,
    sortColumn,
    sortRatingMin,
    sortDeliveryMax,
    sortNameOrder,
    storeTypeFilter,
    vegOnly,
    operationalFilter,
  ])

  const sorted = useMemo(() => {
    const list = [...filtered]
    const byDistance = (a: StoreCard, b: StoreCard) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
      if (a.distanceKm != null) return -1
      if (b.distanceKm != null) return 1
      return a.name.localeCompare(b.name)
    }
    const cmp = (a: StoreCard, b: StoreCard) => {
      if (isNearTab && hasGeo) return byDistance(a, b)
      if (orderDistance && hasGeo && viewMode === 'all') return byDistance(a, b)
      switch (sortColumn) {
        case 'delivery':
          return a.deliveryTime - b.deliveryTime
        case 'name': {
          const c = a.name.localeCompare(b.name)
          return sortNameOrder === 'za' ? -c : c
        }
        case 'rating':
        default:
          return b.rating - a.rating
      }
    }
    list.sort(cmp)
    return list
  }, [
    filtered,
    sortColumn,
    sortNameOrder,
    orderDistance,
    hasGeo,
    viewMode,
    isNearTab,
  ])

  return (
    <div className="min-h-screen bg-[#f3f3f3] pb-16 pt-2">
      <OpeningHoursModal
        isOpen={openingHoursStoreId != null}
        onClose={() => setOpeningHoursStoreId(null)}
        storeId={openingHoursStoreId}
      />
      <div className="mx-auto max-w-[1400px] px-3 sm:px-4 md:px-6">
        <header className="mb-4 flex flex-col gap-3 pt-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 md:mb-5 md:pt-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">
              Stores{' '}
              <span className="font-extrabold text-[#109D4C]">Around You</span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 md:text-[15px]">
              Discover trusted stores around you, ready to deliver fresh and fast.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadStores()}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-gray-50 sm:mt-0.5"
          >
            <i className="fas fa-sync-alt text-[13px] text-gray-400" aria-hidden />
            <span className="font-semibold text-gray-800">Refresh</span>
          </button>
        </header>

        {/* Store type (DB enum) */}
        <div className="mb-3 rounded-xl border border-gray-200/90 bg-white px-2 py-2 shadow-sm md:px-3">
          <p
            className={`mb-2 px-1 text-[11px] font-bold uppercase tracking-wide ${STORE_TYPE_HEADING_GRADIENT}`}
          >
            Store type
          </p>
          <div className="-mx-0.5 flex max-h-[220px] flex-wrap gap-2 overflow-y-auto pr-0.5 md:max-h-none md:overflow-visible">
            {AROUND_YOU_STORE_TYPE_FILTERS.map((opt, chipIdx) => {
              const active = storeTypeFilter === opt.value
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setFilters({ storeTypeFilter: opt.value })}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-left text-[11px] font-semibold leading-snug transition-all md:text-xs ${
                    active
                      ? 'border-[#109D4C] bg-[rgba(16,157,76,0.12)] shadow-sm'
                      : 'border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className={`inline-block ${storeTypeTextGrad(chipIdx)}`}>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* All / Near Me + distance + sort + veg — one bar, same rounded-xl as store type */}
        <div className="mb-3 rounded-xl border border-gray-200/90 bg-white px-2 py-2 shadow-sm md:px-3">
          <div className="flex w-full flex-nowrap items-center gap-1.5 md:gap-2">
            <div className="flex min-h-0 min-w-0 flex-1 flex-nowrap items-center gap-x-1.5 gap-y-0 overflow-x-auto pr-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] md:gap-x-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300/80">
            {(
              [
                { key: 'all' as const, label: 'All' },
                { key: 'near' as const, label: 'Near Me' },
              ] as const
            ).map((tab) => {
              const active = tab.key === 'all' ? viewMode === 'all' : viewMode === 'near'
              return (
                <button
                  key={tab.key}
                  type="button"
                  disabled={tab.key === 'near' && nearMeLocating}
                  onClick={() => {
                    if (tab.key === 'near') void activateNearMeWithGps()
                    else setFilters({ viewMode: 'all' })
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors md:px-2.5 md:text-[13px] ${
                    active
                      ? 'bg-[rgba(16,157,76,0.12)] text-[#109D4C] ring-1 ring-[#109D4C]/35'
                      : 'text-gray-800 hover:bg-gray-50'
                  } ${tab.key === 'near' && nearMeLocating ? 'cursor-wait opacity-80' : ''}`}
                >
                  {tab.key === 'near' && nearMeLocating ? (
                    <i className="fas fa-circle-notch fa-spin text-[11px]" aria-hidden />
                  ) : null}
                  {tab.label}
                </button>
              )
            })}

            <span className="h-5 w-px shrink-0 bg-gray-200" aria-hidden />

            {hasGeo && viewMode === 'all' && (
              <label className="flex shrink-0 flex-nowrap items-center gap-1 md:gap-1.5">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-600 md:text-[11px]">
                  Distance
                </span>
                <select
                  value={radiusKm}
                  title="Stores within this radius that can deliver to your pin"
                  onChange={(e) => setFilters({ radiusKm: Number(e.target.value) as RadiusKm })}
                  className="w-[min(5.75rem,22vw)] min-w-0 max-w-[6.5rem] cursor-pointer rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-gray-900 shadow-sm outline-none transition focus:border-[#109D4C] focus:ring-2 focus:ring-[#109D4C]/20 md:w-auto md:max-w-none md:min-w-[5.5rem] md:px-2 md:py-1.5 md:text-xs"
                  aria-label="Maximum distance from your location"
                >
                  {DISTANCE_RADIUS_KM.map((km) => (
                    <option key={km} value={km}>
                      Upto {km} km
                    </option>
                  ))}
                </select>
              </label>
            )}

            {hasGeo && viewMode === 'near' && (
              <div
                className="flex shrink-0 flex-nowrap items-center gap-1 md:gap-1.5"
                title="Near Me lists stores within 10 km of your GPS pin"
              >
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-600 md:text-[11px]">
                  Radius
                </span>
                <span className="rounded-md border border-[#109D4C]/35 bg-[rgba(16,157,76,0.08)] px-1.5 py-1 text-[11px] font-semibold text-[#109D4C] md:px-2 md:py-1.5">
                  {NEAR_ME_RADIUS_KM} km
                </span>
              </div>
            )}

            {hasGeo && viewMode === 'all' && (
              <>
                <span className="h-5 w-px shrink-0 bg-gray-200" aria-hidden />
                <label className="flex shrink-0 flex-nowrap items-center gap-1 md:gap-1.5">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-600 md:text-[11px]">
                    Order
                  </span>
                  <select
                    value={orderDistance ? 'nearest' : 'default'}
                    onChange={(e) =>
                      setFilters({ orderDistance: e.target.value === 'nearest' })
                    }
                    className="w-[min(6.5rem,28vw)] min-w-0 max-w-[8rem] cursor-pointer rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-gray-900 shadow-sm outline-none transition focus:border-[#109D4C] focus:ring-2 focus:ring-[#109D4C]/20 md:w-auto md:max-w-none md:min-w-[6.75rem] md:px-2 md:py-1.5 md:text-xs"
                    aria-label="Order stores by distance or default sort"
                  >
                    <option value="default">Default sort</option>
                    <option value="nearest">Nearest first</option>
                  </select>
                </label>
              </>
            )}

            {hasGeo && <span className="h-5 w-px shrink-0 bg-gray-200" aria-hidden />}

            <label className="flex shrink-0 flex-nowrap items-center gap-1 md:gap-1.5">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-600 md:text-[11px]">
                Sort
              </span>
              <select
                value={sortColumn}
                disabled={isNearTab && hasGeo}
                onChange={(e) => setFilters({ sortColumn: e.target.value as SortColumn })}
                className="w-[min(5.5rem,20vw)] min-w-0 max-w-[6.5rem] cursor-pointer rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-gray-900 shadow-sm outline-none transition focus:border-[#109D4C] focus:ring-2 focus:ring-[#109D4C]/20 md:w-auto md:max-w-none md:min-w-[5.75rem] md:px-2 md:py-1.5 md:text-xs disabled:cursor-not-allowed disabled:opacity-70"
                aria-label="Sort stores"
              >
                <option value="rating">Rating</option>
                <option value="delivery">Delivery time</option>
                <option value="name">Name</option>
              </select>
              {!(isNearTab && hasGeo) && sortColumn === 'rating' && (
                <select
                  value={String(sortRatingMin)}
                  onChange={(e) =>
                    setFilters({ sortRatingMin: Number(e.target.value) as (typeof SORT_RATING_MINS)[number] })
                  }
                  className="w-[min(5.5rem,20vw)] min-w-0 max-w-[6.5rem] cursor-pointer rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-gray-900 shadow-sm outline-none transition focus:border-[#109D4C] focus:ring-2 focus:ring-[#109D4C]/20 md:w-auto md:max-w-none md:min-w-[5.75rem] md:px-2 md:py-1.5 md:text-xs"
                  aria-label="Minimum rating"
                >
                  <option value="0">All ratings</option>
                  <option value="3">3+ stars</option>
                  <option value="3.5">3.5+ stars</option>
                  <option value="4">4+ stars</option>
                  <option value="4.5">4.5+ stars</option>
                </select>
              )}
              {!(isNearTab && hasGeo) && sortColumn === 'delivery' && (
                <select
                  value={String(sortDeliveryMax)}
                  onChange={(e) =>
                    setFilters({
                      sortDeliveryMax: Number(e.target.value) as (typeof SORT_DELIVERY_MAXS)[number],
                    })
                  }
                  className="w-[min(5.25rem,18vw)] min-w-0 max-w-[6rem] cursor-pointer rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-gray-900 shadow-sm outline-none transition focus:border-[#109D4C] focus:ring-2 focus:ring-[#109D4C]/20 md:w-auto md:max-w-none md:min-w-[5.25rem] md:px-2 md:py-1.5 md:text-xs"
                  aria-label="Maximum delivery time"
                >
                  <option value="0">All</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                </select>
              )}
              {!(isNearTab && hasGeo) && sortColumn === 'name' && (
                <select
                  value={sortNameOrder}
                  onChange={(e) =>
                    setFilters({ sortNameOrder: e.target.value === 'za' ? 'za' : 'az' })
                  }
                  className="w-[min(4rem,14vw)] min-w-0 max-w-[4.5rem] cursor-pointer rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-gray-900 shadow-sm outline-none transition focus:border-[#109D4C] focus:ring-2 focus:ring-[#109D4C]/20 md:w-auto md:max-w-none md:min-w-[4rem] md:px-2 md:py-1.5 md:text-xs"
                  aria-label="Name order"
                >
                  <option value="az">A–Z</option>
                  <option value="za">Z–A</option>
                </select>
              )}
            </label>

            <span className="h-5 w-px shrink-0 bg-gray-200" aria-hidden />

            <button
              type="button"
              onClick={() => setFilters({ vegOnly: !vegOnly })}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition-all md:gap-1.5 md:px-2.5 md:py-1.5 md:text-xs ${
                vegOnly
                  ? 'border-[#109D4C] bg-[rgba(16,157,76,0.12)] text-[#109D4C]'
                  : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
              }`}
            >
              <i className="fas fa-leaf text-[11px] text-emerald-600" aria-hidden />
              Pure veg
            </button>

            <span className="h-5 w-px shrink-0 bg-gray-200" aria-hidden />

            <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-1 md:gap-1.5">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-600 md:text-[11px]">
                Status
              </span>
              <div
                className="inline-flex shrink-0 rounded-md border border-gray-200 bg-gray-50/90 p-0.5 shadow-sm"
                role="group"
                aria-label="Filter by open or closed"
              >
                {(
                  [
                    { key: 'all' as const, label: 'All' },
                    { key: 'open' as const, label: 'Open' },
                    { key: 'closed' as const, label: 'Closed' },
                  ] as const
                ).map(({ key, label }) => {
                  const active = operationalFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilters({ operationalFilter: key })}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors md:rounded-md md:px-2.5 md:py-1 md:text-[11px] ${
                        active
                          ? 'bg-white text-[#109D4C] shadow-sm ring-1 ring-[#109D4C]/30'
                          : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            </div>
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={appliedAroundYouFilterCount === 0}
              className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 md:px-2.5 md:py-1 md:text-[11px]"
              aria-label={
                appliedAroundYouFilterCount === 0
                  ? 'Clear all filters'
                  : `Clear all filters, ${appliedAroundYouFilterCount} applied`
              }
            >
              Clear filters
              {appliedAroundYouFilterCount > 0 ? ` (${appliedAroundYouFilterCount})` : ''}
            </button>
          </div>
        </div>

        {isNearTab && hasGeo && (
          <p className="mb-3 text-xs text-gray-600 md:text-sm">
            <i className="fas fa-map-marker-alt mr-1" style={{ color: GREEN }} aria-hidden />
            Explore Top-Rated Stores Near You.
          </p>
        )}

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <GatiMitraSpinner message="Loading stores around you…" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-800">{error}</p>
            <button
              type="button"
              onClick={() => loadStores()}
              className="mt-4 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#109D4C] shadow-sm transition hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-gray-800">No stores match right now</p>
            <p className="mt-2 text-sm text-gray-600">
              Not finding what you need? Try another store type or clear filters.
            </p>
          </div>
        ) : (
          <p className="mb-3 text-xs font-medium text-gray-500">
            {sorted.length} {sorted.length === 1 ? 'store' : 'stores'} available
          </p>
        )}

        {!loading && !error && sorted.length > 0 && (
          <div className="grid grid-cols-1 gap-3.5 min-[640px]:grid-cols-2 min-[1100px]:grid-cols-3 min-[1400px]:grid-cols-4 md:gap-4">
            {sorted.map((store) => {
              const bannerSrc = store.image || '/img/thali.png'
              const bannerRemote = /^https?:\/\//i.test(bannerSrc)
              const isClosed =
                store.operationalStatus != null &&
                isOperationalClosedStatus(store.operationalStatus)
              return (
              <Link
                key={store.id}
                href={restaurantDetailHref(
                  String(store.storeId),
                  'around-you',
                  buildLocationQueryFromState(locationState)
                )}
                className="group block no-underline"
              >
                <article
                  className={`flex h-full min-h-[360px] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#109D4C]/40 hover:shadow-md ${
                    isClosed ? 'opacity-[0.88] saturate-[0.55] grayscale-[0.35]' : ''
                  }`}
                >
                  <div className="relative h-44 w-full shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 sm:h-48">
                    <Image
                      src={bannerSrc}
                      alt=""
                      fill
                      unoptimized={bannerRemote}
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 25vw"
                    />
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                      {store.storeType && (
                        <span className="rounded-full border border-white/80 bg-black/45 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                          {formatMerchantStoreTypeLabel(store.storeType)}
                        </span>
                      )}
                      {store.isVeg && (
                        <span className="rounded-full border border-green-300 bg-white px-2.5 py-1 text-[11px] font-bold text-green-700 shadow-sm">
                          Pure veg
                        </span>
                      )}
                      {store.operationalStatus && (
                        <button
                          type="button"
                          title="Opening hours"
                          aria-label={`View opening hours — ${store.operationalStatus}`}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setOpeningHoursStoreId(store.merchantStorePk || store.storeId)
                          }}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow transition hover:opacity-90 active:scale-[0.98] ${operationalStatusPillClassName(store.operationalStatus)}`}
                        >
                          <span>{store.operationalStatus}</span>
                          <i className="fas fa-chevron-down text-[9px] opacity-90" aria-hidden />
                        </button>
                      )}
                    </div>
                    {store.distanceKm != null && (
                      <div className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                        {store.distanceKm} km
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3.5">
                    <h2 className="line-clamp-2 text-[15px] font-bold leading-snug text-gray-900 transition-colors group-hover:text-[#109D4C]">
                      {store.name}
                    </h2>
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                      {store.cuisines.length ? store.cuisines.join(', ') : 'GatiMitra partner'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      {store.deliveryTime > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <i className="fas fa-motorcycle text-gray-400" aria-hidden />
                          ~{store.deliveryTime} min
                        </span>
                      )}
                      {store.minOrder != null && store.minOrder > 0 && (
                        <span>Min ₹{store.minOrder}</span>
                      )}
                      {store.isVerified && (
                        <span className="text-[11px] font-semibold text-emerald-700">
                          <i className="fas fa-check-circle mr-0.5" aria-hidden />
                          Verified
                        </span>
                      )}
                    </div>
                    {store.address ? (
                      <p className="mt-2 line-clamp-2 text-[11px] text-gray-500">
                        <i className="fas fa-map-marker-alt mr-1 text-gray-400" aria-hidden />
                        {store.address}
                      </p>
                    ) : null}
                    <div className="mt-auto pt-3">
                      <span className="inline-flex w-full items-center justify-center rounded-xl bg-[#109D4C] py-2.5 text-center text-sm font-bold text-white shadow-sm transition group-hover:bg-[#0d8a42]">
                        Explore Store
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
