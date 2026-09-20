/**
 * READ-ONLY billing + rider-payout recheck for the last N orders.
 *
 * For each recent order it prints:
 *   - CUSTOMER BILL: every money field stored in billing_snapshot (how the order was
 *     actually billed) + the resolved net delivery fee / ride fare.
 *   - STORED rider payout (billing_snapshot.rider_payout_snapshot + ledger fields).
 *   - RECOMPUTE using the live engine (buildDispatchOfferRiderEarnings), fed the order's
 *     own frozen pickup/trip distances — flags a MISMATCH vs the stored value.
 *   - The matched service_payout_rule (rider %) and pre/post rider_leg_pricing rules
 *     (amount, rate/km, funding) that produced the rider number.
 *
 * Writes NOTHING. Safe on prod:
 *     cd /opt/gatimitra && git fetch -q origin diag/rider-payout-recheck \
 *       && git checkout origin/diag/rider-payout-recheck -- backend/scripts/recheck-rider-payouts.ts \
 *       && cd backend && npx tsx scripts/recheck-rider-payouts.ts 10
 *   args: [limit=10] [service=all|food|parcel|person_ride]
 */

import { loadEnv } from "../src/config/loadEnv.js";
loadEnv();

import { getSql } from "../src/db/client.js";
import { buildDispatchOfferRiderEarnings } from "../src/lib/build-dispatch-offer-rider-earnings.js";
import {
  resolveRiderLegsForOrder,
  resolveOrderLegVehicleType,
} from "../src/lib/resolve-rider-legs-for-order.js";
import { resolveOrderRiderPayoutBreakdown } from "../src/lib/resolve-order-rider-payout.js";
import { readRideRiderPayoutSnapshot } from "../src/lib/ride-rider-payout-snapshot.js";
import { rideGeoFromCheckoutMetadata } from "../src/lib/ride-address-display.js";
import { resolveCustomerDeliveryFeeFromBilling } from "../src/lib/customer-delivery-fee.js";
import type { DispatchServiceType } from "../src/lib/order-assignment-engine.js";

type ServiceArg = DispatchServiceType | "all";

const LIMIT = Math.max(1, Math.min(100, Number(process.argv[2]) || 10));
const SERVICE_FILTER = (process.argv[3] as ServiceArg) || "all";
// null → no enum cast is ever attempted (fixes "invalid input value for enum order_type: all").
const SERVICE_SQL: DispatchServiceType | null =
  SERVICE_FILTER === "all" ? null : SERVICE_FILTER;

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}
function r0(v: unknown): number {
  return Math.round(n(v));
}
function money(v: unknown): string {
  return `₹${r0(v).toLocaleString("en-IN")}`;
}
function asObj(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Print every top-level scalar money/number/bool/string field in billing_snapshot. */
function dumpBillingScalars(billing: Record<string, unknown>): void {
  const keys = Object.keys(billing).sort();
  const scalars: string[] = [];
  const nested: string[] = [];
  for (const k of keys) {
    const v = billing[k];
    if (v == null) continue;
    if (typeof v === "object") {
      nested.push(`${k}{${Array.isArray(v) ? `[${v.length}]` : "obj"}}`);
    } else {
      scalars.push(`${k}=${typeof v === "number" ? v : JSON.stringify(v)}`);
    }
  }
  // Chunk scalars so long lines wrap readably.
  for (let i = 0; i < scalars.length; i += 4) {
    console.log(`    ${scalars.slice(i, i + 4).join("  |  ")}`);
  }
  if (nested.length) console.log(`    nested: ${nested.join("  ")}`);
}

async function run() {
  const sql = getSql();

  const rows = await sql<
    {
      id: number;
      formatted_order_id: string | null;
      order_type: DispatchServiceType;
      status: string;
      rider_id: number | null;
      pickup_lat: string | null;
      pickup_lon: string | null;
      drop_lat: string | null;
      drop_lon: string | null;
      distance_km: string | null;
      fare_amount: string | null;
      rider_earning: string | null;
      grand_total: string | null;
      tip_amount: string | null;
      checkout_metadata: unknown;
      billing_snapshot: unknown;
      created_at: string;
      ride_type: string | null;
      estimated_fare: string | null;
      final_fare: string | null;
      weight_kg: string | null;
      vehicle_category: string | null;
      rider_lat: string | null;
      rider_lon: string | null;
    }[]
  >`
    SELECT c.id, c.formatted_order_id, c.order_type, c.status, c.rider_id,
           c.pickup_lat, c.pickup_lon, c.drop_lat, c.drop_lon, c.distance_km,
           c.fare_amount, c.rider_earning, c.grand_total, c.tip_amount,
           c.checkout_metadata, c.billing_snapshot, c.created_at,
           rd.ride_type, rd.estimated_fare, rd.final_fare,
           pc.weight_kg, pc.vehicle_category,
           rr.lat AS rider_lat, rr.lon AS rider_lon
    FROM orders_core c
    LEFT JOIN orders_ride   rd ON rd.order_id = c.id
    LEFT JOIN orders_parcel pc ON pc.order_id = c.id
    LEFT JOIN riders        rr ON rr.id = c.rider_id
    WHERE (${SERVICE_SQL}::order_type IS NULL OR c.order_type = ${SERVICE_SQL}::order_type)
    ORDER BY c.id DESC
    LIMIT ${LIMIT}
  `;

  console.log(
    `\n=== Billing + rider payout recheck — last ${rows.length} order(s)${
      SERVICE_FILTER === "all" ? "" : ` (${SERVICE_FILTER})`
    } ===\n`
  );

  for (const row of rows) {
    const service = row.order_type;
    const label = row.formatted_order_id || `#${row.id}`;
    const billing = asObj(row.billing_snapshot);
    const snap = readRideRiderPayoutSnapshot(row.billing_snapshot);

    const pickupKm = snap?.pickupDistanceKm ?? 0;
    const tripKm = snap?.tripDistanceKm ?? n(row.distance_km);
    const pickupMeters = pickupKm * 1000;

    const isRide = service === "person_ride";
    const customerFare = isRide
      ? n(row.final_fare ?? row.estimated_fare ?? row.fare_amount)
      : resolveCustomerDeliveryFeeFromBilling(billing);

    const vehicle = resolveOrderLegVehicleType({
      service: isRide ? "ride" : service,
      rideCatalogCode: row.ride_type,
      parcelVehicleCategory: row.vehicle_category,
    });
    const geoMeta = isRide ? rideGeoFromCheckoutMetadata(row.checkout_metadata) : {};
    const geo = {
      pincode: (geoMeta as { pickupPincode?: string }).pickupPincode,
      state: (geoMeta as { pickupState?: string }).pickupState,
      latitude: n(row.pickup_lat),
      longitude: n(row.pickup_lon),
    };

    console.log("════════════════════════════════════════════════════════════");
    console.log(
      `${label}  [${service}]  status=${row.status}  rider=${row.rider_id ?? "-"}  ` +
        `${new Date(row.created_at).toLocaleString("en-IN")}`
    );
    console.log(
      `  vehicle=${vehicle ?? "any"}  weight=${row.weight_kg ?? "-"}  ` +
        `pickupKm=${pickupKm}  tripKm=${tripKm}  grand_total=${money(row.grand_total)}`
    );

    // ---- CUSTOMER BILL (how the order was actually billed) ----
    console.log(`  CUSTOMER BILL  net_${isRide ? "fare" : "deliveryFee"}(basis)=${money(customerFare)}`);
    if (Object.keys(billing).length) {
      dumpBillingScalars(billing);
    } else {
      console.log("    (billing_snapshot empty)");
    }

    // ---- STORED rider payout ----
    if (snap) {
      const derivedFareLine = r0(snap.totalEarning - snap.waitingEarning - snap.surgeEarning);
      console.log(
        `  RIDER STORED  total=${money(snap.totalEarning)}  base=${money(snap.baseEarning)} ` +
          `(fare line=${money(derivedFareLine)})  waiting=${money(snap.waitingEarning)}  ` +
          `surge=${money(snap.surgeEarning)}  surges=[${snap.appliedSurges
            .map((s) => `${s.name}:${r0(s.amount)}`)
            .join(", ")}]`
      );
    } else {
      console.log(
        `  RIDER STORED  (no rider_payout_snapshot)  rider_earning col=${money(row.rider_earning)}`
      );
    }
    if (billing.customer_fare != null || billing.rider_percentage_effective != null) {
      console.log(
        `  RIDER LEDGER  customer_fare=${money(billing.customer_fare)}  ` +
          `platform_revenue=${money(billing.platform_revenue)}  ` +
          `rider%_effective=${n(billing.rider_percentage_effective)}%`
      );
    }

    if (customerFare <= 0) {
      console.log("  RIDER RECOMPUTE (skipped — no positive fare basis)\n");
      continue;
    }

    // ---- WHY: the rules behind the number ----
    try {
      const payout = await resolveOrderRiderPayoutBreakdown({
        service: isRide ? "ride" : service,
        customerFare,
        pickupLat: geo.latitude,
        pickupLng: geo.longitude,
        dropLat: n(row.drop_lat),
        dropLng: n(row.drop_lon),
        pickupKm,
        dropKm: tripKm,
        riderId: row.rider_id ?? undefined,
        rideCatalogCode: row.ride_type,
        vehicleType: vehicle,
        pincode: geo.pincode,
        state: geo.state,
      });
      if (payout) {
        console.log(
          `  RIDER %POOL   rider%=${payout.trace?.riderPercentage ?? "?"}  ` +
            `poolBeforeSurge=${money(payout.subtotalBeforeSurge)}  waiting=${money(
              payout.waitingAmount
            )}  surge=${money(payout.surgeTotal)}  ruleId=${payout.trace?.ruleId ?? "-"} @ ${
              payout.trace?.level ?? "?"
            }`
        );
      } else {
        console.log("  RIDER %POOL   (no service_payout_rule matched)");
      }
    } catch (e) {
      console.log(`  RIDER %POOL   (error: ${e instanceof Error ? e.message : e})`);
    }

    try {
      const legs = await resolveRiderLegsForOrder({
        serviceType: service,
        vehicleType: vehicle,
        weightKg: n(row.weight_kg) || null,
        pickupKm,
        dropKm: tripKm,
        geo,
      });
      const fmt = (leg: typeof legs.pre, km: number) =>
        `amount=${money(leg.amount)}  rate=${leg.ratePerKm}/km×${km}km=${money(
          leg.ratePerKm * km
        )}  funding=${leg.funding}  matched=${leg.matched}  ruleId=${leg.ruleId ?? "-"}`;
      console.log(`  RIDER PRE-leg   ${fmt(legs.pre, pickupKm)}`);
      console.log(`  RIDER POST-leg  ${fmt(legs.post, tripKm)}`);
    } catch (e) {
      console.log(`  RIDER LEGS      (error: ${e instanceof Error ? e.message : e})`);
    }

    // ---- RECOMPUTE (full engine) ----
    try {
      const recomputed = await buildDispatchOfferRiderEarnings({
        orderCoreId: row.id,
        serviceType: service,
        riderId: row.rider_id ?? 0,
        riderLat: n(row.rider_lat),
        riderLng: n(row.rider_lon),
        pickupDistanceMeters: pickupMeters,
      });
      if (recomputed) {
        const stored = snap?.totalEarning ?? 0;
        const diff = r0(recomputed.totalEarning) - r0(stored);
        const flag = snap && Math.abs(diff) > 1 ? `  <<< MISMATCH (Δ ${diff > 0 ? "+" : ""}${diff})` : "";
        console.log(
          `  RIDER RECOMPUTE total=${money(recomputed.totalEarning)}  base=${money(
            recomputed.baseEarning
          )}  waiting=${money(recomputed.waitingEarning)}  surge=${money(
            recomputed.surgeEarning
          )}  firstMileOnTop=${money(recomputed.prePickupCompanyFunded)}  post=${money(
            recomputed.postPickupEarning
          )}${flag}`
        );
      } else {
        console.log("  RIDER RECOMPUTE (engine returned null — no positive payout)");
      }
    } catch (e) {
      console.log(`  RIDER RECOMPUTE (error: ${e instanceof Error ? e.message : e})`);
    }
    console.log("");
  }

  console.log("=== done ===\n");
  await sql.end({ timeout: 3 }).catch(() => undefined);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
