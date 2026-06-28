import { toSlug } from '@/lib/slug'
import { isPanIndiaLocationDisplay } from '@/lib/panIndiaLocation'

/** Long address lines made path segments huge and slowed client navigation; keep URLs short. */
const MAX_SLUG_SEGMENT_LEN = 48

function clampSlugSegment(raw: string): string {
  const s = toSlug(raw)
  if (!s) return ''
  if (s.length <= MAX_SLUG_SEGMENT_LEN) return s
  return s.slice(0, MAX_SLUG_SEGMENT_LEN).replace(/-+$/g, '') || s.slice(0, MAX_SLUG_SEGMENT_LEN)
}

export function shouldSyncLocationToMagicpinUrl(pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname === '/' || pathname === '/about') return true
  if (pathname === '/india/All/Stores') return true
  if (/^\/india\/[^/]+\/[^/]+\/All$/.test(pathname)) return true
  if (/^\/india\/[^/]+\/[^/]+\/All\/Stores$/.test(pathname)) return true
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length === 2 && segs[0] !== 'india') return true
  return false
}

export type LocationPick = {
  city?: string
  location_name?: string
  latitude?: number
  longitude?: number
}

/**
 * Merge next navigation target with the current query string.
 * Drops stale `lat`/`lon` when navigating to a path that does not carry geo in `nextPath`.
 */
export function mergeLocationNavigationUrl(nextPath: string, currentSearch: URLSearchParams): string {
  const [base, incomingQs] = nextPath.split('?')
  const merged = new URLSearchParams(currentSearch.toString())
  const incomingHasGeo = Boolean(incomingQs && /(^|&)lat=/.test(incomingQs))
  if (!incomingHasGeo) {
    merged.delete('lat')
    merged.delete('lon')
  }
  if (incomingQs) {
    const incoming = new URLSearchParams(incomingQs)
    incoming.forEach((v, k) => merged.set(k, v))
  }
  const out = merged.toString()
  return out ? `${base}?${out}` : base
}

/** When `item.city` is missing, infer slugs only in unambiguous cases. */
function deriveSlugsWhenMissingCity(displayName: string, item?: LocationPick): { citySlug: string; areaSlug: string } | null {
  const cleaned = displayName.replace(/^📍\s*/, '').trim()
  if (!cleaned) return null
  const parts = cleaned.split(',').map((s) => s.trim()).filter(Boolean)
  const ln = item?.location_name?.trim()

  // Reverse-geocode label is the full string: "city, area" (city first).
  if (parts.length >= 2 && ln && ln === cleaned) {
    const citySlug = clampSlugSegment(parts[0])
    const areaSlug = clampSlugSegment(parts.slice(1).join(', ')) || citySlug
    if (citySlug) return { citySlug, areaSlug }
  }

  // Search rows: location_name matches first segment; city is last segment (3+ parts).
  if (parts.length >= 3 && ln && parts[0] === ln) {
    const cityPart = parts[parts.length - 1]
    const areaPart = parts.slice(0, -1).join(', ')
    const citySlug = clampSlugSegment(cityPart)
    const areaSlug = clampSlugSegment(areaPart) || citySlug
    if (citySlug) return { citySlug, areaSlug }
  }

  if (parts.length === 1) {
    const slug = clampSlugSegment(parts[0])
    if (slug) return { citySlug: slug, areaSlug: slug }
  }
  return null
}

/**
 * Returns next path for Magicpin-style URLs, or null if the URL should not change.
 * Around You: when lat/lon exist, prefer short `/india/All/Stores?lat=&lon=` for instant navigation.
 */
export function getMagicpinPathAfterLocationSelect(
  pathname: string,
  displayName: string,
  item?: LocationPick
): string | null {
  const pathnameOnly = pathname.split('?')[0]
  if (!shouldSyncLocationToMagicpinUrl(pathnameOnly)) return null
  if (isPanIndiaLocationDisplay(displayName)) {
    if (pathnameOnly === '/india/All/Stores' || /^\/india\/[^/]+\/[^/]+\/All\/Stores$/.test(pathnameOnly)) {
      return '/india/All/Stores'
    }
    return '/'
  }

  const onStores =
    pathnameOnly === '/india/All/Stores' || /^\/india\/[^/]+\/[^/]+\/All\/Stores$/.test(pathnameOnly)

  // Short geo URL — avoids megabyte-long address slugs and keeps router.replace snappy (~instant).
  if (
    onStores &&
    item?.latitude != null &&
    item?.longitude != null &&
    Number.isFinite(item.latitude) &&
    Number.isFinite(item.longitude) &&
    !(item.latitude === 0 && item.longitude === 0)
  ) {
    const p = new URLSearchParams()
    p.set('lat', String(item.latitude))
    p.set('lon', String(item.longitude))
    return `/india/All/Stores?${p.toString()}`
  }

  let citySlug: string
  let areaSlug: string

  if (item?.city) {
    citySlug = clampSlugSegment(item.city)
    areaSlug = clampSlugSegment(item.location_name || item.city) || citySlug
  } else {
    const derived = deriveSlugsWhenMissingCity(displayName, item)
    if (derived) {
      citySlug = derived.citySlug
      areaSlug = derived.areaSlug
    } else {
      return null
    }
  }

  if (!citySlug) return null
  return onStores ? `/india/${citySlug}/${areaSlug}/All/Stores` : `/india/${citySlug}/${areaSlug}/All`
}
