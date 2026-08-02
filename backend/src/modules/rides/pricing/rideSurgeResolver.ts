/**
 * Customer-side Ride Surge resolver.
 *
 * Phase 3 wires the existing `resolveStateSurges` into the customer quote +
 * billing paths and splits the resulting amount by each surge's configured
 * funding mode (CUSTOMER_100 / COMPANY_100 / SHARED — see migration 0465).
 *
 * The customer sees ONLY `customerShareTotal` added to their bill. The full
 * `surgeTotal` (customer + company) is paid to the rider by the settlement
 * engine; the company subsidises the difference via `surgeCompanyShare` on
 * `RideBillComponents`.
 *
 * Reuses the state surge tables + settings loaders — no new DB reads beyond
 * what the rider payout resolver already does.
 */

import type { RideVehiclePricingType } from "../../rider-payout-pricing/types.js";
import {
  loadStateSurgeConfigs,
  loadStateSurgeTimeSlots,
  loadStateSurgeSettings,
} from "../../ride-state-config/rideStateConfig.repository.js";
import {
  resolveStateSurges,
  type AppliedStateSurge,
} from "../../ride-state-config/stateSurge.service.js";
import { cachedRideQuoteValue } from "../../ride-state-config/rideQuoteConfigCache.js";

export type RideSurgeResolution = {
  surgeTotal: number;
  customerShareTotal: number;
  companyShareTotal: number;
  appliedSurges: AppliedStateSurge[];
  surgeCapped: boolean;
};

const EMPTY: RideSurgeResolution = {
  surgeTotal: 0,
  customerShareTotal: 0,
  companyShareTotal: 0,
  appliedSurges: [],
  surgeCapped: false,
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(num(n) * 100) / 100;
}

/**
 * Merge a resolved surge into a ride billing_snapshot in-place.
 * These fields are the contract read by `billingToComponents.ts` at settlement
 * time — writing them at bill time is what makes company-funded surge flow to
 * the rider through settlement without inflating the customer bill.
 */
export function attachRideSurgeToSnapshot(
  snapshot: Record<string, unknown>,
  resolution: RideSurgeResolution
): Record<string, unknown> {
  snapshot.surge_total = resolution.surgeTotal;
  snapshot.surge_customer_share = resolution.customerShareTotal;
  snapshot.surge_company_share = resolution.companyShareTotal;
  snapshot.applied_surges = resolution.appliedSurges.map((a) => ({
    surge_id: a.surgeId,
    name: a.name,
    applied_amount: a.appliedAmount,
    funding_mode: a.fundingMode,
    customer_share_amount: a.customerShareAmount,
    company_share_amount: a.companyShareAmount,
  }));
  return snapshot;
}

export async function resolveCustomerRideSurge(args: {
  stateId: string | null;
  pricingVehicle: RideVehiclePricingType | null;
  baseFareForPct: number;
  now?: Date;
}): Promise<RideSurgeResolution> {
  const { stateId, pricingVehicle, baseFareForPct } = args;
  if (!stateId || !pricingVehicle || baseFareForPct <= 0) {
    return EMPTY;
  }

  try {
    const [configs, allSlots, settings] = await Promise.all([
      cachedRideQuoteValue(`surge-configs:${stateId}`, () =>
        loadStateSurgeConfigs(stateId)
      ),
      cachedRideQuoteValue(`surge-slots:${stateId}`, () =>
        loadStateSurgeTimeSlots()
      ),
      cachedRideQuoteValue(`surge-settings:${stateId}`, () =>
        loadStateSurgeSettings(stateId)
      ),
    ]);
    if (configs.length === 0) return EMPTY;

    const timeSlotsBySurgeId = new Map<number, typeof allSlots>();
    for (const s of allSlots) {
      const list = timeSlotsBySurgeId.get(s.stateSurgeId) ?? [];
      list.push(s);
      timeSlotsBySurgeId.set(s.stateSurgeId, list);
    }

    // Quote is customer-side — we don't know the rider yet, so treat the ride
    // as a non-max-only quote. Max-only surges are silently excluded from the
    // customer bill (they're rider-side bonuses paid by company at settlement).
    const res = resolveStateSurges({
      configs,
      timeSlotsBySurgeId,
      service: "ride",
      pricingVehicle,
      riderHasGmitraMax: false,
      surgeWaitMaxOnly: false,
      baseFareForPct,
      maxTotalSurgeAmount: settings.maxTotalSurgeAmount,
      now: args.now,
    });

    return {
      surgeTotal: round2(res.surgeTotal),
      customerShareTotal: round2(res.customerShareTotal),
      companyShareTotal: round2(res.companyShareTotal),
      appliedSurges: res.appliedSurges,
      surgeCapped: res.surgeCapped,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ride-surge-resolver] falling back to zero surge", err);
    return EMPTY;
  }
}
