'use client'

import { Suspense, useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { prefetchLocationListsForCustomer } from '@/lib/locationListCache'
import { isLandingHeroRoute } from '@/lib/landingHeroRoute'

function buildDisplayName(
  addressLine1?: string,
  city?: string,
  state?: string
): string {
  const parts = [addressLine1, city, state]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
  return parts.join(', ')
}

function AuthLocationSyncInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, isAuthenticated } = useAppSelector((state) => state.auth)
  const { location, setLocation, hydrated } = useLocationContext()
  const lastPrefetchedCustomerId = useRef<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      lastPrefetchedCustomerId.current = null
      return
    }
    const customerId = Number(user.id)
    if (!Number.isFinite(customerId)) return
    if (lastPrefetchedCustomerId.current === customerId) return
    lastPrefetchedCustomerId.current = customerId
    prefetchLocationListsForCustomer(customerId)
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    if (!hydrated || !isAuthenticated || !user) return
    // If URL explicitly carries location context, don't override it from profile.
    const urlLocation = searchParams?.get('location')
    const urlLat = searchParams?.get('lat')
    const urlLon = searchParams?.get('lon')
    if ((urlLocation && urlLocation.trim() !== '') || (urlLat && urlLon)) {
      return
    }
    // Respect user-selected location already committed in context.
    if (location.locationCommittedByUser === true) {
      return
    }
    // Landing / pan‑India browse — wait for an explicit location pick in the sheet.
    if (isLandingHeroRoute(pathname)) {
      return
    }
    // Around You / location-path pages own the location from URL + explicit user picks.
    // Avoid overriding those with profile address; this can create ping-pong update loops.
    if (
      pathname === '/order' ||
      pathname === '/around-you' ||
      pathname === '/india/All/Stores' ||
      (pathname?.startsWith('/india/') ?? false)
    ) {
      return
    }
    const displayName = buildDisplayName(user.addressLine1, user.city, user.state)
    if (!displayName) return
    if (location.displayName === displayName) return
    setLocation(displayName, user.latitude ?? undefined, user.longitude ?? undefined, {
      userInitiated: true,
      source: 'selected',
    })
  }, [hydrated, isAuthenticated, user, location.displayName, location.locationCommittedByUser, setLocation, pathname, searchParams])

  return null
}

export default function AuthLocationSync() {
  return (
    <Suspense fallback={null}>
      <AuthLocationSyncInner />
    </Suspense>
  )
}
