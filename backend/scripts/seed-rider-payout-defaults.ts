/**
 * Seed DEFAULT rider payout for every state: distance-based, COMPANY-funded pre-pickup
 * (first-mile) + post-pickup (delivery) leg pricing in rider_leg_pricing, and waiting
 * charges in service_payout_rules. This makes rider pay independent of the customer delivery
 * fee (fixing the ₹0-fee → ₹0-payout bug) — the rider is always paid by DISTANCE.
 *
 * IDEMPOTENT: every insert is guarded by NOT EXISTS, so re-running adds nothing and never
 * overwrites an admin's edits or the pre-existing rules. Applied MANUALLY (money data).
 *
 * Engine note: rider_leg_pricing is SINGLE-SLAB-PICK (pay = clamp(base + rate×legKm, min,
 * max) for the one matching distance slab). To keep payout MONOTONIC across slabs (a longer
 * ride never pays less), each higher slab's min_amount is floored to the previous slab's
 * payout at the boundary — computed here.
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1, prepare: false });

type Svc = "food" | "parcel" | "person_ride";
type Veh = "2_wheeler" | "3_wheeler" | "4_wheeler_non_ac" | "4_wheeler_ac";

/** Post-pickup tier: up to maxKm at ratePerKm; first tier may set a flat base. */
type Tier = { maxKm: number | null; base?: number; rate: number };

/** Pre-pickup first-mile ₹/km per (service, vehicle). */
const PRE_RATE: Record<Svc, Partial<Record<Veh, number>>> = {
  food: { "2_wheeler": 4 },
  parcel: { "2_wheeler": 4, "3_wheeler": 6, "4_wheeler_non_ac": 8 },
  person_ride: { "2_wheeler": 4, "3_wheeler": 6, "4_wheeler_non_ac": 9, "4_wheeler_ac": 9 },
};

/** Post-pickup delivery tiers per (service, vehicle). */
const POST_TIERS: Record<Svc, Partial<Record<Veh, Tier[]>>> = {
  food: {
    "2_wheeler": [{ maxKm: 2, base: 22, rate: 0 }, { maxKm: 5, rate: 9 }, { maxKm: 10, rate: 8 }, { maxKm: 15, rate: 7 }, { maxKm: null, rate: 7 }],
  },
  parcel: {
    "2_wheeler": [{ maxKm: 2, base: 22, rate: 0 }, { maxKm: 5, rate: 9 }, { maxKm: 10, rate: 8 }, { maxKm: 15, rate: 7 }, { maxKm: null, rate: 7 }],
    "3_wheeler": [{ maxKm: 2, base: 30, rate: 0 }, { maxKm: 5, rate: 11 }, { maxKm: 10, rate: 10 }, { maxKm: 15, rate: 9 }, { maxKm: null, rate: 9 }],
    "4_wheeler_non_ac": [{ maxKm: 2, base: 40, rate: 0 }, { maxKm: 5, rate: 13 }, { maxKm: 10, rate: 12 }, { maxKm: 15, rate: 11 }, { maxKm: null, rate: 11 }],
  },
  person_ride: {
    "2_wheeler": [{ maxKm: 2, base: 22, rate: 0 }, { maxKm: 5, rate: 9 }, { maxKm: 10, rate: 8 }, { maxKm: 15, rate: 7 }, { maxKm: null, rate: 7 }],
    "3_wheeler": [{ maxKm: 2, base: 30, rate: 0 }, { maxKm: 5, rate: 12 }, { maxKm: 10, rate: 11 }, { maxKm: 15, rate: 10 }, { maxKm: null, rate: 10 }],
    "4_wheeler_non_ac": [{ maxKm: 2, base: 45, rate: 0 }, { maxKm: 5, rate: 15 }, { maxKm: 10, rate: 14 }, { maxKm: 15, rate: 13 }, { maxKm: null, rate: 13 }],
    "4_wheeler_ac": [{ maxKm: 2, base: 45, rate: 0 }, { maxKm: 5, rate: 15 }, { maxKm: 10, rate: 14 }, { maxKm: 15, rate: 13 }, { maxKm: null, rate: 13 }],
  },
};

/** Waiting ₹/min (company-funded) + free minutes per (service, vehicle). */
const WAITING: Record<Svc, { free: number; perVehicle: Partial<Record<Veh, number>> }> = {
  food: { free: 5, perVehicle: { "2_wheeler": 0.25 } },
  parcel: { free: 3, perVehicle: { "2_wheeler": 0.5, "3_wheeler": 0.6, "4_wheeler_non_ac": 0.75 } },
  person_ride: { free: 3, perVehicle: { "2_wheeler": 0.5, "3_wheeler": 0.6, "4_wheeler_non_ac": 0.75, "4_wheeler_ac": 0.75 } },
};

/** Compute per-slab rows with a monotonic min_amount floor (single-slab engine). */
function buildPostSlabs(tiers: Tier[]): Array<{
  minKm: number; maxKm: number | null; base: number | null; rate: number; minAmount: number | null;
}> {
  const out: Array<{ minKm: number; maxKm: number | null; base: number | null; rate: number; minAmount: number | null }> = [];
  let prevMaxKm = 0;
  let prevBoundaryPay = 0; // previous slab's payout at its upper boundary
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    const minKm = prevMaxKm;
    const base = t.base ?? null;
    const minAmount = i === 0 ? null : Math.round(prevBoundaryPay * 100) / 100;
    out.push({ minKm, maxKm: t.maxKm, base, rate: t.rate, minAmount });
    // payout at this slab's upper boundary (or a nominal +5km for the open slab).
    const boundKm = t.maxKm ?? prevMaxKm + 5;
    const raw = (base ?? 0) + t.rate * boundKm;
    prevBoundaryPay = Math.max(raw, minAmount ?? 0);
    prevMaxKm = t.maxKm ?? prevMaxKm;
  }
  return out;
}

async function run() {
  const allStates = (await sql`SELECT id, name FROM states ORDER BY name`) as Array<{ id: string; name: string }>;
  // Skip states that already have seeded leg pricing (the pooler drops long runs; this makes
  // a re-run go straight to the remaining states instead of re-checking finished ones).
  const done = (await sql`SELECT DISTINCT geo_ref_id::text AS id FROM rider_leg_pricing WHERE geo_level='state'`) as Array<{ id: string }>;
  const doneSet = new Set(done.map((d) => d.id));
  const states = allStates.filter((s) => !doneSet.has(s.id));
  console.log(`Total states ${allStates.length}; already seeded ${doneSet.size}; seeding ${states.length} remaining…`);

  let legInserted = 0;
  let waitInserted = 0;

  for (const st of states) {
    const services = Object.keys(PRE_RATE) as Svc[];
    for (const svc of services) {
      const vehicles = Object.keys(PRE_RATE[svc]) as Veh[];

      // ── Pre-pickup: one open first-mile slab per (service, vehicle), company-funded ──
      for (const veh of vehicles) {
        const rate = PRE_RATE[svc][veh]!;
        const r = await sql`
          INSERT INTO rider_leg_pricing (leg, geo_level, geo_ref_id, service_type, vehicle_type, min_km, max_km, base_amount, rate_per_km, min_amount, max_amount, funding, priority, is_active)
          SELECT 'pre', 'state'::geo_pricing_level, ${st.id}::uuid, ${svc}::order_type, ${veh}::ride_vehicle_pricing_type, 0, NULL, NULL, ${rate}, NULL, NULL, 'company', 100, true
          WHERE NOT EXISTS (
            SELECT 1 FROM rider_leg_pricing WHERE leg='pre' AND geo_level='state' AND geo_ref_id=${st.id}::uuid
              AND service_type=${svc}::order_type AND vehicle_type=${veh}::ride_vehicle_pricing_type AND is_active=true
          ) RETURNING id`;
        legInserted += (r as unknown[]).length;
      }

      // ── Post-pickup: distance slabs per (service, vehicle), company-funded, monotonic ──
      for (const veh of vehicles) {
        const tiers = POST_TIERS[svc]?.[veh];
        if (!tiers) continue;
        for (const s of buildPostSlabs(tiers)) {
          const r = await sql`
            INSERT INTO rider_leg_pricing (leg, geo_level, geo_ref_id, service_type, vehicle_type, min_km, max_km, base_amount, rate_per_km, min_amount, max_amount, funding, priority, is_active)
            SELECT 'post', 'state'::geo_pricing_level, ${st.id}::uuid, ${svc}::order_type, ${veh}::ride_vehicle_pricing_type,
                   ${s.minKm}, ${s.maxKm}, ${s.base}, ${s.rate}, ${s.minAmount}, NULL, 'company', 100, true
            WHERE NOT EXISTS (
              SELECT 1 FROM rider_leg_pricing WHERE leg='post' AND geo_level='state' AND geo_ref_id=${st.id}::uuid
                AND service_type=${svc}::order_type AND vehicle_type=${veh}::ride_vehicle_pricing_type
                AND min_km=${s.minKm} AND is_active=true
            ) RETURNING id`;
          legInserted += (r as unknown[]).length;
        }
      }

      // ── Waiting charge per (service, vehicle) in service_payout_rules, COMPANY-funded ──
      const w = WAITING[svc];
      // service_payout_rules.service_type uses 'ride' (CHECK), not 'person_ride'.
      const spSvc = svc === "person_ride" ? "ride" : svc;
      for (const veh of Object.keys(w.perVehicle) as Veh[]) {
        const perMin = w.perVehicle[veh]!;
        const r = await sql`
          INSERT INTO service_payout_rules
            (service_type, geo_level, geo_ref_id, vehicle_type, rider_percentage, platform_percentage,
             waiting_charge_per_min, waiting_free_minutes, waiting_max_charge,
             waiting_funding_mode, waiting_company_share_pct, waiting_customer_share_pct, priority, is_active)
          SELECT ${spSvc}, 'state'::geo_pricing_level, ${st.id}::uuid, ${veh}::ride_vehicle_pricing_type, 90, 10,
                 ${perMin}, ${w.free}, 30, 'COMPANY_100', 100, 0, 100, true
          WHERE NOT EXISTS (
            SELECT 1 FROM service_payout_rules WHERE service_type=${spSvc} AND geo_level='state'
              AND geo_ref_id=${st.id}::uuid AND vehicle_type=${veh}::ride_vehicle_pricing_type AND deleted_at IS NULL
          ) RETURNING id`;
        waitInserted += (r as unknown[]).length;
      }
    }
  }

  console.log(`Done. rider_leg_pricing inserted: ${legInserted}; service_payout_rules (waiting) inserted: ${waitInserted}`);
  await sql.end();
}
run().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
