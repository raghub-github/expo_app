/**
 * Per-service rider wallet breakdown (single source of truth for app + dashboard).
 * Earnings + penalties come from the authoritative rider_wallet columns; penalty
 * reverts and offer/incentive credits are aggregated from wallet_ledger (which
 * carries service_type). The main wallet balance stays the one number shown
 * everywhere — this only explains WHERE it came from.
 */
import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { riderWallet } from "../db/schema.js";
import { getRiderSubscriptionDebitedTotal } from "./rider-wallet-ledger-app.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function num(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? round2(x) : 0;
}
function svcKey(raw: unknown): "food" | "parcel" | "ride" | null {
  const s = String(raw ?? "").toLowerCase();
  if (s === "food") return "food";
  if (s === "parcel") return "parcel";
  if (s === "ride" || s === "person_ride") return "ride";
  return null;
}

export type ServiceBreakdown = {
  earnings: number;
  penalties: number;
  penaltyReverts: number;
  offers: number;
  /** earnings − penalties + reverts + offers (per-service net contribution). */
  net: number;
};

export type RiderWalletBreakdown = {
  food: ServiceBreakdown;
  parcel: ServiceBreakdown;
  ride: ServiceBreakdown;
  common: {
    subscriptionDebited: number;
    otherOffers: number;
    otherPenaltyReverts: number;
  };
};

export async function getRiderWalletBreakdown(riderId: number): Promise<RiderWalletBreakdown> {
  const db = getDb();
  const [w] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);

  const mk = (earn: unknown, pen: unknown): ServiceBreakdown => ({
    earnings: num(earn),
    penalties: num(pen),
    penaltyReverts: 0,
    offers: 0,
    net: 0,
  });
  const food = mk(w?.earningsFood, w?.penaltiesFood);
  const parcel = mk(w?.earningsParcel, w?.penaltiesParcel);
  const ride = mk(w?.earningsPersonRide, w?.penaltiesPersonRide);
  const common = { subscriptionDebited: 0, otherOffers: 0, otherPenaltyReverts: 0 };

  // Ledger-derived reverts + offers per service. Tolerant of enum variants.
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT
        LOWER(COALESCE(NULLIF(service_type, ''), metadata->>'serviceType', metadata->>'service_type', '')) AS svc,
        LOWER(entry_type::text) AS et,
        COALESCE(SUM(amount::numeric), 0) AS total
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
        AND LOWER(entry_type::text) IN ('penalty_reversal', 'cancellation_payout', 'bonus', 'referral_bonus')
      GROUP BY 1, 2
    `) as unknown as Array<{ svc: string | null; et: string; total: unknown }>;

    for (const r of rows) {
      const amt = num(r.total);
      if (amt <= 0) continue;
      const key = svcKey(r.svc);
      const bucket = key === "food" ? food : key === "parcel" ? parcel : key === "ride" ? ride : null;
      if (r.et === "penalty_reversal") {
        if (bucket) bucket.penaltyReverts += amt;
        else common.otherPenaltyReverts += amt;
      } else {
        // bonus | referral_bonus | cancellation_payout → offers/incentives
        if (bucket) bucket.offers += amt;
        else common.otherOffers += amt;
      }
    }
  } catch {
    // ledger aggregation is best-effort; earnings/penalties from columns still stand
  }

  for (const b of [food, parcel, ride]) {
    b.penaltyReverts = round2(b.penaltyReverts);
    b.offers = round2(b.offers);
    b.net = round2(b.earnings - b.penalties + b.penaltyReverts + b.offers);
  }
  common.otherOffers = round2(common.otherOffers);
  common.otherPenaltyReverts = round2(common.otherPenaltyReverts);
  common.subscriptionDebited = await getRiderSubscriptionDebitedTotal(riderId);

  return { food, parcel, ride, common };
}
