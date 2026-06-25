import { getSql } from "../db/client.js";
import { stateNameFromPincode } from "../modules/billing/pincodePrefixToState.js";

const STATE_VARIANTS: Record<string, string[]> = {
  Bihar: ["Bihar", "BR"],
  Haryana: ["Haryana", "HR"],
  "West Bengal": ["West Bengal", "Paschim Banga", "WB"],
  Delhi: ["Delhi", "NCT of Delhi", "DL"],
  Punjab: ["Punjab", "PB"],
  "Uttar Pradesh": ["Uttar Pradesh", "UP"],
  Maharashtra: ["Maharashtra", "MH"],
  Karnataka: ["Karnataka", "KA"],
  Rajasthan: ["Rajasthan", "RJ"],
  Gujarat: ["Gujarat", "GJ"],
  "Tamil Nadu": ["Tamil Nadu", "TN"],
  Kerala: ["Kerala", "KL"],
  Odisha: ["Odisha", "Orissa", "OD"],
  Jharkhand: ["Jharkhand", "JH"],
  "Madhya Pradesh": ["Madhya Pradesh", "MP"],
  "Himachal Pradesh": ["Himachal Pradesh", "HP"],
  Assam: ["Assam", "AS"],
  Telangana: ["Telangana", "TG", "TS"],
  "Andhra Pradesh": ["Andhra Pradesh", "AP"],
  Chhattisgarh: ["Chhattisgarh", "CG"],
  Uttarakhand: ["Uttarakhand", "UK"],
};

function variantsFor(name: string): string[] {
  const trimmed = name.trim();
  for (const [canonical, variants] of Object.entries(STATE_VARIANTS)) {
    if (canonical.toLowerCase() === trimmed.toLowerCase()) return variants;
  }
  return [trimmed];
}

export async function resolveStateIdByName(stateName: string): Promise<string | null> {
  const sql = getSql();
  for (const variant of variantsFor(stateName)) {
    const exact = await sql<{ id: string }[]>`
      SELECT id FROM states
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(${variant}))
      LIMIT 1
    `;
    if (exact[0]?.id) return exact[0].id;

    if (variant.length <= 3) {
      try {
        const byCode = await sql<{ id: string }[]>`
          SELECT id FROM states
          WHERE UPPER(TRIM(code)) = UPPER(TRIM(${variant}))
          LIMIT 1
        `;
        if (byCode[0]?.id) return byCode[0].id;
      } catch {
        /* code column may not exist */
      }
    }

    if (variant.length >= 4) {
      const byLike = await sql<{ id: string }[]>`
        SELECT id FROM states
        WHERE LOWER(name) LIKE ${`%${variant.toLowerCase()}%`}
        LIMIT 1
      `;
      if (byLike[0]?.id) return byLike[0].id;
    }
  }
  return null;
}

export async function resolveRiderStateRef(
  riderId: number,
): Promise<{ stateId: string | null; stateName: string | null; pincode: string | null }> {
  const sql = getSql();
  const rows = await sql<{ state: string | null; pincode: string | null }[]>`
    SELECT state, pincode FROM riders WHERE id = ${riderId} LIMIT 1
  `;
  const row = rows[0];
  let stateName = row?.state?.trim() || null;
  const pincode = row?.pincode?.trim() || null;

  if (!stateName && pincode) {
    stateName = stateNameFromPincode(pincode);
  }

  const stateId = stateName ? await resolveStateIdByName(stateName) : null;
  return { stateId, stateName, pincode };
}

export async function programMatchesRiderGeo(args: {
  programId: string;
  geoScopeMode: string;
  stateId: string | null;
  stateName: string | null;
}): Promise<boolean> {
  if (args.geoScopeMode === "all_india") return true;

  const sql = getSql();

  if (args.stateId) {
    const byId = await sql<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM incentive_program_geo_scopes g
        WHERE g.program_id = ${args.programId}::uuid
          AND g.is_active = true
          AND (
            g.scope_type = 'all_india'
            OR (g.scope_type IN ('state', 'ut') AND g.state_id = ${args.stateId}::uuid)
          )
      ) AS ok
    `;
    if (byId[0]?.ok) return true;
  }

  if (args.stateName?.trim()) {
    for (const variant of variantsFor(args.stateName)) {
      const byName = await sql<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM incentive_program_geo_scopes g
          JOIN states s ON s.id = g.state_id
          WHERE g.program_id = ${args.programId}::uuid
            AND g.is_active = true
            AND g.scope_type IN ('state', 'ut')
            AND LOWER(TRIM(s.name)) = LOWER(TRIM(${variant}))
        ) AS ok
      `;
      if (byName[0]?.ok) return true;
    }
  }

  return false;
}
