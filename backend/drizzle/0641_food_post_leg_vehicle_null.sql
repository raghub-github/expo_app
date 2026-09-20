-- Make the FOOD post-pickup distance schedule a real guaranteed floor.
--
-- Food orders resolve vehicle_type=NULL, but the 2–5 / 5–10 / 10–15 / 15+ km food post slabs
-- were seeded as vehicle_type='2_wheeler' — so they NEVER matched a real food order (only the
-- 0–2 km NULL rule did). Re-tag them to NULL so the full per-distance schedule applies. Combined
-- with the guaranteed-floor engine change (reconcile capExcessToPool=false), the rider is paid
-- MAX(% pool, distance slab) — the per-distance food schedule now actually binds on the (rare)
-- orders where the slab beats the pool.
--
-- The 0–2 km slab already exists at NULL (rule 486), so retire the dead 2-wheeler 0–2 duplicate.
-- Idempotent (re-tag only affects rows still tagged 2_wheeler). Reversible (see _rollback.sql).

-- 0–2 km: NULL row already active; deactivate the dead 2-wheeler duplicate.
UPDATE public.rider_leg_pricing
SET is_active = false, updated_at = now()
WHERE leg = 'post' AND service_type = 'food' AND vehicle_type = '2_wheeler' AND min_km = 0;

-- 2 km and beyond: re-tag the dead 2-wheeler food post slabs to NULL so food orders match them.
UPDATE public.rider_leg_pricing
SET vehicle_type = NULL, updated_at = now()
WHERE leg = 'post' AND service_type = 'food' AND vehicle_type = '2_wheeler' AND min_km > 0;
