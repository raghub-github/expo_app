/**
 * Rider Payout Composition — Geo Delivery Pricing v3.1 (pre-pickup WITHIN the pool).
 *
 * The implementation lives in the shared @gatimitra/slab-pricing package so the backend
 * (dispatch OFFER estimate + wallet CREDIT) and the dashboard SIMULATOR run the EXACT
 * same pure function — the number the rider is offered, paid, and the number the
 * simulator prints are all produced by one shared engine. This module simply re-exports
 * it under the path the backend already imports, and keeps the unit tests local.
 *
 * ── The correction ──────────────────────────────────────────────────────────────
 * BEFORE (v3.0): the first-mile allowance was ALWAYS added on top of the % payout:
 *     total = (deliveryFee × rider%) + surge + waiting + prePickup      // exceeds 100%
 * NOW (v3.1): the rider % of the GROSS eligible delivery fee is the "rider base pool".
 * The first-mile is allocated FIRST out of that pool; the remainder is post-pickup.
 * Two money pools are tracked separately:
 *   (A) delivery-fee-funded  = the customer-collected (or GatiMitra-Plus gross) pool
 *   (B) company-funded       = surge/incentives + any company-funded first-mile top-up
 *
 * Funding source (per service, admin-configurable):
 *   • "company"  → first-mile is a COMPANY top-up ON TOP of the pool (default: FOOD).
 *   • "customer" → first-mile is consumed FROM the pool, capped at the pool
 *                  (default: PARCEL + PERSON RIDE — collected from the customer).
 *   • "shared"   → consumed from the pool up to the pool; the overflow is company-funded.
 */

export {
  composeRiderPayout,
  normalizePrePickupFunding,
  defaultPrePickupFunding,
  type PrePickupFunding,
  type RiderPayoutCompositionInput,
  type RiderPayoutComposition,
} from "@gatimitra/slab-pricing";
