/**
 * READ-ONLY rider-payout recheck for the last N orders.
 *
 * For each recent order it prints, side by side:
 *   - the STORED rider payout (billing_snapshot.rider_payout_snapshot + ledger fields)
 *   - a fresh RECOMPUTE using the live engine (buildDispatchOfferRiderEarnings), fed the
 *     order's own frozen pickup/trip distances
 *   - the matched service_payout_rule (rider %) and the pre/post rider_leg_pricing rules
 *     (base + rate/km, clamped to [min,max], funding) that produced the number
 *
 * It writes NOTHING. Safe to run on the VPS against prod:
 *     cd /opt/gatimitra/backend   (wherever the backend .env.local lives)
 *     npx tsx scripts/recheck-rider-payouts.ts            # last 10, all services
 *     npx tsx scripts/recheck-rider-payouts.ts 20 food    # last 20 food orders
 *     npx tsx scripts/recheck-rider-payouts.ts 10 person_ride
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
      tip_amount: string | null;
      checkout_metadata: unknown;
      billing_snapshot: unknown;
      created_at: string;
      ride_type: string | null;
      estimated_fare: string | null;
      final_fare: string | null;
      customer_tip_amount: string | null;
      weight_kg: string | null;
      vehicle_category: string | null;
      rider_lat: string | null;
      rider_lon: string | null;
    }[]
  >`
    SELECT c.id, c.formatted_order_id, c.order_type, c.status, c.rider_id,
           c.pickup_lat, c.pickup_lon, c.drop_lat, c.drop_lon, c.distance_km,
           c.fare_amount, c.rider_earning, c.tip_amount,
           c.checkout_metadata, c.billing_snapshot, c.created_at,
           rd.ride_type, rd.estimated_fare, rd.final_fare, rd.customer_tip_amount,
           pc.weight_kg, pc.vehicle_category,
           rr.lat AS rider_lat, rr.lon AS rider_lon
    FROM orders_core c
    LEFT JOIN orders_ride   rd ON rd.order_id = c.id
    LEFT JOIN orders_parcel pc ON pc.order_id = c.id
    LEFT JOIN riders        rr ON rr.id = c.rider_id
    WHERE (${SERVICE_FILTER} = 'all' OR c.order_type = ${SERVICE_FILTER}::order_type)
    ORDER BY c.id DESC
    LIMIT ${LIMIT}
  `;

  console.log(
    `\n=== Rider payout recheck — last ${rows.length} order(s)${
      SERVICE_FILTER === "all" ? "" : ` (${SERVICE_FILTER})`
    } ===\n`
  );

  for (const row of rows) {
    const service = row.order_type;
    const label = row.formatted_order_id || `#${row.id}`;
    const billing = asObj(row.billing_snapshot);
    const snap = readRideRiderPayoutSnapshot(row.billing_snapshot);

    // Distances the payout was frozen with (fall back to order distance / 0).
    const pickupKm = snap?.pickupDistanceKm ?? 0;
    const tripKm = snap?.tripDistanceKm ?? n(row.distance_km);
    const pickupMeters = pickupKm * 1000;

    // Customer basis
    const customerFare =
      service === "person_ride"
        ? n(row.final_fare ?? row.estimated_fare ?? row.fare_amount)
        : resolveCustomerDeliveryFeeFromBilling(billing);

    const vehicle = resolveOrderLegVehicleType({
      service: service === "person_ride" ? "ride" : service,
      rideCatalogCode: row.ride_type,
      parcelVehicleCategory: row.vehicle_category,
    });
    const geoMeta = service === "person_ride" ? rideGeoFromCheckoutMetadata(row.checkout_metadata) : {};
    const geo = {
      pincode: (geoMeta as { pickupPincode?: string }).pickupPincode,
      state: (geoMeta as { pickupState?: string }).pickupState,
      latitude: n(row.pickup_lat),
      longitude: n(row.pickup_lon),
    };

    console.log("────────────────────────────────────────────────────────");
    console.log(
      `${label}  [${service}]  status=${row.status}  rider=${row.rider_id ?? "-"}  ` +
        `${new Date(row.created_at).toLocaleString("en-IN")}`
    );
    console.log(
      `  vehicle=${vehicle ?? "any"}  weight=${row.weight_kg ?? "-"}  ` +
        `pickupKm=${pickupKm}  tripKm=${tripKm}  customerFare(basis)=${money(customerFare)}`
    );

    // ---- STORED ----
    if (snap) {
      const derivedBase = r0(snap.totalEarning - snap.waitingEarning - snap.surgeEarning);
      console.log(
        `  STORED    total=${money(snap.totalEarning)}  base=${money(snap.baseEarning)} ` +
          `(derived fare line=${money(derivedBase)})  waiting=${money(snap.waitingEarning)}  ` +
          `surge=${money(snap.surgeEarning)}  surges=[${snap.appliedSurges
            .map((s) => `${s.name}:${r0(s.amount)}`)
            .join(", ")}]`
      );
    } else {
      console.log(
        `  STORED    (no rider_payout_snapshot)  rider_earning col=${money(row.rider_earning)}`
      );
    }
    const ledgerFare = billing.customer_fare;
    const ledgerRev = billing.platform_revenue;
    const ledgerPct = billing.rider_percentage_effective;
    if (ledgerFare != null || ledgerPct != null) {
      console.log(
        `  LEDGER    customer_fare=${money(ledgerFare)}  platform_revenue=${money(ledgerRev)}  ` +
          `rider%_effective=${n(ledgerPct)}%`
      );
    }

    if (customerFare <= 0) {
      console.log("  RECOMPUTE (skipped — no positive customer fare basis)\n");
      continue;
    }

    // ---- RULE INSPECTION (why the number is what it is) ----
    try {
      const payout = await resolveOrderRiderPayoutBreakdown({
        service: service === "person_ride" ? "ride" : service,
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
          `  %POOL     rider%=${payout.trace?.riderPercentage ?? "?"}  ` +
            `poolBeforeSurge=${money(payout.subtotalBeforeSurge)}  waiting=${money(
              payout.waitingAmount
            )}  surge=${money(payout.surgeTotal)}  ruleId=${payout.trace?.ruleId ?? "-"} ` +
            `@ ${payout.trace?.level ?? "?"}`
        );
      } else {
        console.log("  %POOL     (no service_payout_rule matched)");
      }
    } catch (e) {
      console.log(`  %POOL     (error: ${e instanceof Error ? e.message : e})`);
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
      const fmt = (leg: typeof legs.pre) =>
        `amount=${money(leg.amount)} rate=${leg.ratePerKm}/km funding=${leg.funding} ` +
        `matched=${leg.matched} ruleId=${leg.ruleId ?? "-"}`;
      console.log(`  PRE-leg   ${fmt(legs.pre)}`);
      console.log(`  POST-leg  ${fmt(legs.post)}`);
    } catch (e) {
      console.log(`  LEGS      (error: ${e instanceof Error ? e.message : e})`);
    }

    // ---- RECOMPUTE (full engine, exactly as the offer/accept path) ----
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
          `  RECOMPUTE total=${money(recomputed.totalEarning)}  base=${money(
            recomputed.baseEarning
          )}  waiting=${money(recomputed.waitingEarning)}  surge=${money(
            recomputed.surgeEarning
          )}  firstMileOnTop=${money(recomputed.prePickupCompanyFunded)}  ` +
            `post=${money(recomputed.postPickupEarning)}${flag}`
        );
      } else {
        console.log("  RECOMPUTE (engine returned null — no positive payout)");
      }
    } catch (e) {
      console.log(`  RECOMPUTE (error: ${e instanceof Error ? e.message : e})`);
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
