/**
 * Server-side Prevent Services check for cxsite (uses Postgres RPC when available).
 */

import { getSql, isCustomersDbConfigured } from '@/lib/db'

export const PREVENT_SERVICE_USER_MESSAGE =
  'This service is temporarily unavailable in your current location. Please try again later or choose another nearby location.'

export const PREVENT_SERVICE_ERROR_CODE = 'SERVICE_BLOCKED_IN_LOCATION' as const

export async function checkPreventServicesFromDb(args: {
  lat: number | null | undefined
  lng: number | null | undefined
  service?: string | null
}): Promise<{
  blocked: boolean
  code: typeof PREVENT_SERVICE_ERROR_CODE | null
  message: string | null
  title: string | null
}> {
  if (
    args.lat == null ||
    args.lng == null ||
    !Number.isFinite(args.lat) ||
    !Number.isFinite(args.lng) ||
    !isCustomersDbConfigured()
  ) {
    return { blocked: false, code: null, message: null, title: null }
  }

  const sql = getSql()
  if (!sql) return { blocked: false, code: null, message: null, title: null }

  const service =
    args.service?.trim().toLowerCase() === 'person_ride'
      ? 'ride'
      : args.service?.trim().toLowerCase() || null

  try {
    const rows = await sql<{ rule_id: string }[]>`
      SELECT rule_id
      FROM public.prevent_services_check_point(
        ${Number(args.lat)},
        ${Number(args.lng)},
        ${service}
      )
      LIMIT 1
    `
    if (!rows?.length) {
      return { blocked: false, code: null, message: null, title: null }
    }
    return {
      blocked: true,
      code: PREVENT_SERVICE_ERROR_CODE,
      message: PREVENT_SERVICE_USER_MESSAGE,
      title: 'Service Temporarily Unavailable',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/prevent_services_check_point|prevent_service_/i.test(msg)) {
      return { blocked: false, code: null, message: null, title: null }
    }
    console.warn('[prevent-services] cxsite check failed:', msg.slice(0, 200))
    return { blocked: false, code: null, message: null, title: null }
  }
}

/** AND Prevent Services into geo food/parcel/ride flags. */
export async function applyPreventToGeoFlags(args: {
  food: boolean
  parcel: boolean
  ride: boolean
  lat?: number | null
  lng?: number | null
}): Promise<{ food: boolean; parcel: boolean; ride: boolean }> {
  if (args.lat == null || args.lng == null) {
    return { food: args.food, parcel: args.parcel, ride: args.ride }
  }
  // One RPC (no service filter) then map codes — avoids 6 serial round-trips.
  if (
    args.lat == null ||
    args.lng == null ||
    !Number.isFinite(args.lat) ||
    !Number.isFinite(args.lng) ||
    !isCustomersDbConfigured()
  ) {
    return { food: args.food, parcel: args.parcel, ride: args.ride }
  }
  const sql = getSql()
  if (!sql) return { food: args.food, parcel: args.parcel, ride: args.ride }

  try {
    const rows = await sql<{ blocked_services: string[] | null }[]>`
      SELECT blocked_services
      FROM public.prevent_services_check_point(
        ${Number(args.lat)},
        ${Number(args.lng)},
        ${null}
      )
      LIMIT 8
    `
    const blocked = new Set<string>()
    for (const row of rows ?? []) {
      for (const code of row.blocked_services ?? []) blocked.add(String(code).toLowerCase())
    }
    const foodBlocked =
      blocked.has('food') || blocked.has('grocery') || blocked.has('pharmacy')
    const parcelBlocked = blocked.has('parcel') || blocked.has('courier')
    const rideBlocked = blocked.has('ride')
    return {
      food: args.food && !foodBlocked,
      parcel: args.parcel && !parcelBlocked,
      ride: args.ride && !rideBlocked,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/prevent_services_check_point|prevent_service_/i.test(msg)) {
      return { food: args.food, parcel: args.parcel, ride: args.ride }
    }
    console.warn('[prevent-services] applyPreventToGeoFlags failed:', msg.slice(0, 200))
    return { food: args.food, parcel: args.parcel, ride: args.ride }
  }
}
