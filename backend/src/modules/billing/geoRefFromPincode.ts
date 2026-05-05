import { getSql } from "../../db/client.js";
import type { DropGeoRefByLevel } from "./types.js";

/**
 * Resolve geo hierarchy UUIDs from a delivery postal code (matches `pincodes.pincode` text).
 * Returns null when pincode is missing or unknown in geo tables.
 */
export async function resolveDropGeoRefsFromPincode(pincode: string | null): Promise<DropGeoRefByLevel | null> {
  if (pincode == null) return null;
  const pc = String(pincode).trim();
  if (!pc) return null;

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
  if (!x?.pincode_id) return null;

  return {
    pincode: x.pincode_id,
    ...(x.post_office_id ? { post_office: x.post_office_id } : {}),
    ...(x.division_id ? { division: x.division_id } : {}),
    ...(x.district_id ? { district: x.district_id } : {}),
    ...(x.region_id ? { region: x.region_id } : {}),
    ...(x.state_id ? { state: x.state_id } : {}),
  };
}

/**
 * IDs of active platform offers bound anywhere on the geo chain for the drop pincode (closest wins per id).
 * Returns empty set when pincode UUID is missing or the SQL helper is unavailable.
 */
export async function resolvePlatformOfferGeoBindingEffectiveIds(
  refs: DropGeoRefByLevel | null
): Promise<ReadonlySet<number>> {
  const pinId = refs?.pincode;
  if (pinId == null || String(pinId).trim() === "") return new Set();

  const sql = getSql();
  try {
    const [row] = await sql<{ ids: unknown }[]>`
      SELECT geo_platform_offer_ids_effective_for_location('pincode'::geo_pricing_level, ${pinId}::uuid) AS ids
    `;
    const raw = row?.ids;
    if (raw == null) return new Set();
    if (!Array.isArray(raw)) return new Set();
    const out = new Set<number>();
    for (const x of raw) {
      const n = typeof x === "bigint" ? Number(x) : typeof x === "number" ? x : parseInt(String(x), 10);
      if (Number.isInteger(n) && n > 0) out.add(n);
    }
    return out;
  } catch {
    return new Set();
  }
}
