-- 0473 rollback: Geo engine (Phase 3)
DROP TABLE IF EXISTS public.tracking_violations;
ALTER TABLE public.tracking_sessions DROP COLUMN IF EXISTS geo_state;
