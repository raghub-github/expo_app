import { getSql } from "../../db/client.js";
import type { DropGeoRefByLevel } from "./types.js";

/**
 * Treat em-dash, dash, and common "no value" placeholders as null.
 * The customer app stores "—" in customer_addresses when reverse-geocoding fails,
 * because the columns are NOT NULL — without sanitizing these here, geo lookups
 * would try to match "—" against real pincodes/states.
 */
function sanitizeGeoText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  // U+2014 em-dash, U+2013 en-dash, regular hyphen, common "empty" tokens
  if (t === "—" || t === "–" || t === "-" || t === "--" || t === "---") return null;
  const lower = t.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "null" || lower === "none" || lower === "unknown") return null;
  return t;
}

/**
 * Resolve geo hierarchy UUIDs from a delivery postal code (matches `pincodes.pincode` text).
 * Returns null when pincode is missing or unknown in geo tables.
 *
 * Pass `stateName` (e.g. "West Bengal") as fallback: when the pincode→post_office chain in
 * `pincode_post_offices` is incomplete, the state UUID is resolved by name so that state-bound
 * platform offers are still matched.
 *
 * Em-dash and similar placeholder strings are treated as null (sanitizeGeoText).
 */
export async function resolveDropGeoRefsFromPincode(
  pincode: string | null,
  stateName?: string | null,
): Promise<DropGeoRefByLevel | null> {
  const pc = sanitizeGeoText(pincode);
  if (!pc) {
    // No usable pincode. Try state-only fallback so state-bound offers still work
    // when the address was saved with placeholder pincode but a real state name.
    const sn = sanitizeGeoText(stateName);
    if (!sn) return null;
    const sql = getSql();
    try {
      const [stateRow] = await sql<{ id: string }[]>`
        SELECT id FROM states WHERE LOWER(TRIM(name)) = LOWER(${sn}) LIMIT 1
      `;
      if (stateRow?.id) return { state: stateRow.id } as DropGeoRefByLevel;
    } catch {
      // best-effort
    }
    return null;
  }

  const sql = getSql();
  // IMPORTANT: do not require the full hierarchy to be present.
  // A pincode may exist but not yet be linked to a post office; in that case we still must return pincode uuid
  // so delivery slabs bound directly to that pincode work (and distance-based pricing changes).
  const rows = await sql<{
    pincode_id: string;
    post_office_id: string | null;
    division_id: string | null;
    district_id: string | null;
    region_id: string | null;
    state_id: string | null;
  }[]>`
    SELECT
      p.id AS pincode_id,
      po.id AS post_office_id,
      dv.id AS division_id,
      d.id AS district_id,
      r.id AS region_id,
      s.id AS state_id
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
    LEFT JOIN states s ON s.id = r.state_id
    WHERE p.pincode = ${pc}
    LIMIT 1
  `;

  const x = rows[0];

  // When pincode lookup yields nothing OR chain is incomplete (state_id null),
  // try state-name fallback so state-bound offers still resolve.
  let stateId: string | null = x?.state_id ?? null;
  if (stateId == null) {
    const sn = sanitizeGeoText(stateName);
    if (sn) {
      try {
        const [stateRow] = await sql<{ id: string }[]>`
          SELECT id FROM states WHERE LOWER(TRIM(name)) = LOWER(${sn}) LIMIT 1
        `;
        stateId = stateRow?.id ?? null;
      } catch {
        // ignore — state fallback is best-effort
      }
    }
  }

  // No pincode row AND no state via name fallback → nothing to return
  if (!x?.pincode_id) {
    return stateId ? ({ state: stateId } as DropGeoRefByLevel) : null;
  }

  return {
    pincode: x.pincode_id,
    ...(x.post_office_id ? { post_office: x.post_office_id } : {}),
    ...(x.division_id ? { division: x.division_id } : {}),
    ...(x.district_id ? { district: x.district_id } : {}),
    ...(x.region_id ? { region: x.region_id } : {}),
    ...(stateId ? { state: stateId } : {}),
  };
}

/**
 * IDs of active platform offers bound anywhere on the geo chain for the drop location.
 *
 * Queries the DB function for both the pincode level (which walks the full chain when
 * pincode_post_offices is complete) AND the state level directly (so state-bound offers
 * are found even when the chain is broken and state was resolved via name fallback).
 */
export async function resolvePlatformOfferGeoBindingEffectiveIds(
  refs: DropGeoRefByLevel | null
): Promise<ReadonlySet<number>> {
  if (refs == null) return new Set();

  const pinId = refs.pincode;
  const stateId = refs.state;
  if (!pinId && !stateId) return new Set();

  const sql = getSql();
  const queries: Promise<{ ids: unknown }[]>[] = [];

  if (pinId && String(pinId).trim()) {
    queries.push(
      sql<{ ids: unknown }[]>`
        SELECT geo_platform_offer_ids_effective_for_location('pincode'::geo_pricing_level, ${pinId}::uuid) AS ids
      `
    );
  }
  // Query state level directly: ensures state-bound offers are found even when the
  // pincode→post_office chain in pincode_post_offices is incomplete.
  if (stateId && String(stateId).trim()) {
    queries.push(
      sql<{ ids: unknown }[]>`
        SELECT geo_platform_offer_ids_effective_for_location('state'::geo_pricing_level, ${stateId}::uuid) AS ids
      `
    );
  }

  const out = new Set<number>();
  try {
    const results = await Promise.allSettled(queries);
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const raw = result.value[0]?.ids;
      if (!Array.isArray(raw)) continue;
      for (const x of raw) {
        const n = typeof x === "bigint" ? Number(x) : typeof x === "number" ? x : parseInt(String(x), 10);
        if (Number.isInteger(n) && n > 0) out.add(n);
      }
    }
  } catch {
    // ignore errors, return partial set
  }

  return out;
}
