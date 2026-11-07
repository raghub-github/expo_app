-- Rollback 0648_parcel_pickup_drop_proof.sql

DROP INDEX IF EXISTS public.orders_parcel_delivery_proof_at_idx;
DROP INDEX IF EXISTS public.orders_parcel_pickup_proof_at_idx;

ALTER TABLE public.orders_parcel
  DROP COLUMN IF EXISTS delivery_proof_at,
  DROP COLUMN IF EXISTS delivery_proof_r2_key,
  DROP COLUMN IF EXISTS delivery_proof_image_url,
  DROP COLUMN IF EXISTS pickup_proof_at,
  DROP COLUMN IF EXISTS pickup_proof_r2_key,
  DROP COLUMN IF EXISTS pickup_proof_image_url;
