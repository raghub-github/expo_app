import { getSql } from "@/lib/db/client";
import {
  mapPool,
  normalizeIndiaStateLabel,
  reverseGeocodeStateFromCoords,
} from "@/lib/geo/reverse-geocode-state";

export type CustomerUsersByStateRow = {
  id: string;
  name: string;
  userCount: number;
};

export type CustomerUsersByStateResult = {
  states: CustomerUsersByStateRow[];
  totalUsers: number;
  usersWithState: number;
  usersWithoutState: number;
  /** How many missing-state rows were filled from lat/lon this request. */
  resolvedFromCoords: number;
};

type CustomerGeoRow = {
  id: number;
  state_raw: string | null;
  latitude: number | null;
  longitude: number | null;
};

type StateRow = { id: string; name: string };

function statesMatch(raw: string, stateName: string): boolean {
  const a = normalizeIndiaStateLabel(raw)?.toLowerCase() ?? "";
  const b = normalizeIndiaStateLabel(stateName)?.toLowerCase() ?? "";
  if (!a || !b) return false;
  if (a === b) return true;
  if (a === `${b} ut`) return true;
  const a2 = a.replace(/&/g, "and");
  const b2 = b.replace(/&/g, "and");
  return a2 === b2;
}

function pickStateId(raw: string, states: StateRow[]): string | null {
  let best: { id: string; len: number } | null = null;
  for (const s of states) {
    if (!statesMatch(raw, s.name)) continue;
    const len = s.name.length;
    if (!best || len > best.len) best = { id: s.id, len };
  }
  return best?.id ?? null;
}

/**
 * All active States/UTs with platform customer join counts.
 * Priority: customers.state → default address state → reverse-geocode lat/lon (then persist).
 */
export async function getCustomerUsersByState(): Promise<CustomerUsersByStateResult> {
  const sql = getSql();

  const stateRows = (await sql`
    SELECT id::text AS id, name
    FROM public.states
    WHERE is_active = true
    ORDER BY lower(name)
  `) as StateRow[];

  const customers = (await sql`
    SELECT
      c.id,
      COALESCE(
        NULLIF(btrim(c.state), ''),
        (
          SELECT NULLIF(btrim(ca.state), '')
          FROM public.customer_addresses ca
          WHERE ca.customer_id = c.id
            AND ca.deleted_at IS NULL
            AND COALESCE(ca.is_active, TRUE) = TRUE
            AND NULLIF(btrim(ca.state), '') IS NOT NULL
            AND lower(btrim(ca.state)) NOT IN ('—', '-', 'n/a', 'na', 'null', 'none', 'unknown')
          ORDER BY ca.is_default DESC NULLS LAST, ca.id ASC
          LIMIT 1
        )
      ) AS state_raw,
      COALESCE(
        NULLIF(c.latitude, 0)::float8,
        (
          SELECT NULLIF(ca.latitude, 0)::float8
          FROM public.customer_addresses ca
          WHERE ca.customer_id = c.id
            AND ca.deleted_at IS NULL
            AND COALESCE(ca.is_active, TRUE) = TRUE
            AND ca.latitude IS NOT NULL
            AND ca.longitude IS NOT NULL
          ORDER BY ca.is_default DESC NULLS LAST, ca.id ASC
          LIMIT 1
        )
      ) AS latitude,
      COALESCE(
        NULLIF(c.longitude, 0)::float8,
        (
          SELECT NULLIF(ca.longitude, 0)::float8
          FROM public.customer_addresses ca
          WHERE ca.customer_id = c.id
            AND ca.deleted_at IS NULL
            AND COALESCE(ca.is_active, TRUE) = TRUE
            AND ca.latitude IS NOT NULL
            AND ca.longitude IS NOT NULL
          ORDER BY ca.is_default DESC NULLS LAST, ca.id ASC
          LIMIT 1
        )
      ) AS longitude
    FROM public.customers c
    WHERE c.deleted_at IS NULL
  `) as CustomerGeoRow[];

  const countByStateId = new Map<string, number>();
  for (const s of stateRows) countByStateId.set(s.id, 0);

  let usersWithState = 0;
  let usersWithoutState = 0;
  let resolvedFromCoords = 0;

  const needsGeocode: CustomerGeoRow[] = [];

  for (const row of customers) {
    const raw = row.state_raw?.trim() || null;
    if (raw) {
      const sid = pickStateId(raw, stateRows);
      if (sid) {
        countByStateId.set(sid, (countByStateId.get(sid) ?? 0) + 1);
        usersWithState += 1;
        continue;
      }
      // Unmatched free-text state — still count as "has state text" for summary,
      // but not attributed to a master state row.
      usersWithState += 1;
      continue;
    }

    const lat = row.latitude != null ? Number(row.latitude) : NaN;
    const lon = row.longitude != null ? Number(row.longitude) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      needsGeocode.push(row);
    } else {
      usersWithoutState += 1;
    }
  }

  // Cap burst reverse-geocode work per request so the page stays responsive.
  const GEOCODE_LIMIT = 80;
  const toGeocode = needsGeocode.slice(0, GEOCODE_LIMIT);
  const leftover = needsGeocode.length - toGeocode.length;

  const geocodeResults = await mapPool(toGeocode, 5, async (row) => {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    const rg = await reverseGeocodeStateFromCoords(lat, lon);
    return { row, state: rg?.state ?? null };
  });

  const persistRows: Array<{ id: number; state: string }> = [];

  for (const { row, state } of geocodeResults) {
    if (!state) {
      usersWithoutState += 1;
      continue;
    }
    const sid = pickStateId(state, stateRows);
    if (!sid) {
      usersWithoutState += 1;
      continue;
    }
    countByStateId.set(sid, (countByStateId.get(sid) ?? 0) + 1);
    usersWithState += 1;
    resolvedFromCoords += 1;
    persistRows.push({ id: row.id, state });
  }

  // Persist so next load skips Mapbox for these users.
  if (persistRows.length > 0) {
    try {
      const ids = persistRows.map((r) => r.id);
      const states = persistRows.map((r) => r.state);
      await sql`
        UPDATE public.customers AS c
        SET state = v.state,
            updated_at = NOW()
        FROM (
          SELECT *
          FROM unnest(${ids}::bigint[], ${states}::text[]) AS t(id, state)
        ) AS v
        WHERE c.id = v.id
          AND (c.state IS NULL OR btrim(c.state) = '')
      `;
    } catch (e) {
      console.warn("[getCustomerUsersByState] batch persist state failed:", e);
    }
  }

  usersWithoutState += leftover;

  const states: CustomerUsersByStateRow[] = stateRows
    .map((s) => ({
      id: s.id,
      name: s.name,
      userCount: countByStateId.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.userCount - a.userCount || a.name.localeCompare(b.name));

  return {
    states,
    totalUsers: customers.length,
    usersWithState,
    usersWithoutState,
    resolvedFromCoords,
  };
}
