import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";
import { loadRiderEligibilityAttributes } from "../src/modules/rider-eligibility/riderEligibility.service.js";
import { resolveRiderAllServiceEligibilityAtLocation } from "../src/modules/rider-eligibility/riderEligibility.service.js";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1, connect_timeout: 20 });
const riderId = Number(process.argv[2] || 1008);

async function main() {
  const riders = await sql`
    SELECT id, name, state, city, pincode, lat, lon, active_vehicle_id, status
    FROM riders WHERE id = ${riderId} LIMIT 1
  `;
  console.log("RIDER", JSON.stringify(riders[0] ?? null, null, 2));

  const vehicles = await sql`
    SELECT id, registration_number, vehicle_type, vehicle_category, fuel_type,
           is_commercial, ownership_type, verified, vehicle_active_status,
           is_active, deleted_at
    FROM rider_vehicles
    WHERE rider_id = ${riderId}
    ORDER BY id DESC
    LIMIT 5
  `;
  console.log("VEHICLES", JSON.stringify(vehicles, null, 2));

  const docs = await sql`
    SELECT doc_type, verified, verification_status, requires_manual_review, expiry_date
    FROM rider_documents
    WHERE rider_id = ${riderId}
    ORDER BY created_at DESC
    LIMIT 20
  `;
  console.log("DOCS", JSON.stringify(docs, null, 2));

  const attrs = await loadRiderEligibilityAttributes(riderId);
  console.log("ATTRS", JSON.stringify(attrs, null, 2));

  const r = riders[0] as
    | { state?: string | null; pincode?: string | null; lat?: number | null; lon?: number | null }
    | undefined;
  const all = await resolveRiderAllServiceEligibilityAtLocation({
    riderId,
    lat: r?.lat ?? null,
    lng: r?.lon ?? null,
    pincode: r?.pincode ?? null,
    state: r?.state ?? null,
  });
  for (const [svc, d] of Object.entries(all.services as Record<string, any>)) {
    console.log(
      "SERVICE",
      svc,
      JSON.stringify(
        {
          eligible: d.eligible,
          reasonCode: d.reasonCode,
          blocking: d.blocking,
          commercialRequired: d.commercialRequired,
          matchedRuleId: d.matchedRuleId,
          policySource: d.policySource,
        },
        null,
        2
      )
    );
  }
  console.log("GEO", all.resolvedGeo);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
