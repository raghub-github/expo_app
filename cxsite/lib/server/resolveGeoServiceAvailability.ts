import { getSql, isCustomersDbConfigured } from '@/lib/db'

export type GeoServiceAvailabilityPayload = {
  ok: true
  found: boolean
  food: boolean
  parcel: boolean
  ride: boolean
  pincode: string | null
  stateName: string | null
  resolvedLevel: string | null
}

type RpcPayload = {
  found?: boolean
  available?: boolean
}

type ServiceFlagRow = {
  is_food_enabled: boolean
  is_parcel_enabled: boolean
  is_ride_enabled: boolean
}

async function resolveFromPincodeRpc(args: {
  pincode: string
  lat?: number | null
  lng?: number | null
}): Promise<GeoServiceAvailabilityPayload | null> {
  const sql = getSql()
  if (!sql) return null

  const services = ['food', 'parcel', 'ride'] as const
  const results = await Promise.all(
    services.map(async (service) => {
      const rows = await sql<{ geo_resolve_pincode: RpcPayload | string }[]>`
        SELECT geo_resolve_pincode(
          ${args.pincode.trim()},
          ${service},
          ${args.lat ?? null},
          ${args.lng ?? null}
        ) AS geo_resolve_pincode
      `
      const raw = rows[0]?.geo_resolve_pincode
      if (raw == null) return { found: false } as RpcPayload
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as RpcPayload
        } catch {
          return { found: false } as RpcPayload
        }
      }
      return raw
    })
  )

  if (!results.some((r) => r.found === true)) return null

  return {
    ok: true,
    found: true,
    food: results[0]?.available === true,
    parcel: results[1]?.available === true,
    ride: results[2]?.available === true,
    pincode: args.pincode.trim(),
    stateName: null,
    resolvedLevel: 'pincode',
  }
}

async function resolveFromStateName(stateName: string): Promise<GeoServiceAvailabilityPayload | null> {
  const sql = getSql()
  if (!sql) return null

  const rows = await sql<ServiceFlagRow[]>`
    SELECT is_food_enabled, is_parcel_enabled, is_ride_enabled
    FROM states
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(${stateName}))
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null

  return {
    ok: true,
    found: true,
    food: row.is_food_enabled,
    parcel: row.is_parcel_enabled,
    ride: row.is_ride_enabled,
    pincode: null,
    stateName: stateName.trim(),
    resolvedLevel: 'state',
  }
}

async function resolveStateNameFromCoords(
  lat: number,
  lng: number
): Promise<string | null> {
  const sql = getSql()
  if (!sql) return null
  try {
    // pincodes has no state_id — walk post_office → division → district → region → state
    // (same chain as backend geoRefFromPincode).
    const rows = await sql<{ state_name: string }[]>`
      SELECT s.name AS state_name
      FROM pincodes p
      LEFT JOIN LATERAL (
        SELECT ppo.post_office_id
        FROM pincode_post_offices ppo
        WHERE ppo.pincode_id = p.id
        ORDER BY ppo.post_office_id
        LIMIT 1
      ) pick ON true
      LEFT JOIN post_offices po ON po.id = pick.post_office_id
      LEFT JOIN divisions dv ON dv.id = po.division_id
      LEFT JOIN districts d ON d.id = dv.district_id
      LEFT JOIN regions r ON r.id = d.region_id
      INNER JOIN states s ON s.id = r.state_id
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
      ORDER BY
        ((p.latitude::float8 - ${lat}) * (p.latitude::float8 - ${lat})
         + (p.longitude::float8 - ${lng}) * (p.longitude::float8 - ${lng}))
      LIMIT 1
    `
    return rows[0]?.state_name?.trim() || null
  } catch (err) {
    console.warn('[resolveGeoServiceAvailability] coords→state failed:', err)
    return null
  }
}

/** Resolve FOOD / RIDE / PARCEL from Postgres (same RPC as backend). */
export async function resolveGeoServiceAvailabilityFromDb(args: {
  pincode?: string | null
  state?: string | null
  lat?: number | null
  lng?: number | null
}): Promise<GeoServiceAvailabilityPayload | null> {
  if (!isCustomersDbConfigured()) return null

  const pincode = args.pincode?.trim() || ''
  const state = args.state?.trim() || ''
  const lat = args.lat != null && Number.isFinite(args.lat) ? args.lat : null
  const lng = args.lng != null && Number.isFinite(args.lng) ? args.lng : null

  if (pincode) {
    const fromPincode = await resolveFromPincodeRpc({
      pincode,
      lat,
      lng,
    })
    if (fromPincode) return fromPincode
  }

  if (state) {
    const fromState = await resolveFromStateName(state)
    if (fromState) return fromState
  }

  // Truncated display names (e.g. "Hisua Nawada Bi...") may miss the state token —
  // fall back to nearest pincode → state when coords are present.
  if (lat != null && lng != null) {
    const inferred = await resolveStateNameFromCoords(lat, lng)
    if (inferred) {
      const fromCoords = await resolveFromStateName(inferred)
      if (fromCoords) return fromCoords
    }
  }

  return null
}

export const GEO_SERVICES_OPEN_FALLBACK: GeoServiceAvailabilityPayload = {
  ok: true,
  found: false,
  food: true,
  ride: true,
  parcel: false,
  pincode: null,
  stateName: null,
  resolvedLevel: null,
}
