-- Fix rider payout DOUBLE-PAY (root cause of "high amount for small distance").
--
-- The rider payout combined TWO independent things and ADDED them:
--   (A) the % pool  = rider_percentage × GROSS delivery fee / fare  (service_payout_rules), and
--   (B) company-funded post-pickup distance legs                    (rider_leg_pricing, leg='post').
-- Because the post legs were funding='company', the reconciler paid them ON TOP of the pool.
-- Example (real order GMF100045, 0.3km pickup + 0.3km trip, ₹20 food delivery fee):
--   pool = 90% × ₹20 = ₹18   +   flat company post-leg ₹20   =   ₹38 for ~600 m.
-- Longer trips only got the pool (the post slabs never matched food — see note below), so short
-- trips looked overpaid and pay was inconsistent by distance.
--
-- FIX: make post legs CUSTOMER-funded so they are drawn FROM the pool (a floor within it)
-- instead of stacking on top. The rider then earns:
--     riderPct × gross fee/fare   (distance-, geo-, vehicle-, service-based)
--   + first-mile (pre) leg        (company-funded incentive for far pickups)
--   + surge  (geo × time × vehicle × service)
--   + waiting (Max-gated)
--   + tip    (100% passthrough)
-- No component is double-counted. Same order now pays ₹18 (short) and ~₹67 (7 km) — proportional.
--
-- Idempotent (only flips post legs still on 'company') and reversible (see _rollback.sql).
-- NOTE: this does NOT re-seed the food post distance schedule (it was mistakenly tagged
-- vehicle_type='2_wheeler' while food orders resolve vehicle=NULL). With post legs now drawn
-- from the pool that mismatch no longer affects payout; making the per-vehicle post slab a
-- GUARANTEED minimum floor is a separate, tested follow-up.

UPDATE public.rider_leg_pricing
SET funding = 'customer',
    updated_at = now()
WHERE leg = 'post'
  AND funding = 'company';
