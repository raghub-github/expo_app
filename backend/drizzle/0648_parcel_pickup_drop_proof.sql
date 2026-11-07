-- Parcel pickup + drop proof photos (I/O-safe denormalized columns + image_type allowlist).
-- Safe to re-run.

-- 1) Drop legacy CHECK on order_delivery_images.image_type if it blocks 'pickup'.
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'order_delivery_images'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%image_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.order_delivery_images DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

-- Soft allowlist (not a hard CHECK) documented via comment; app writes pickup|delivery|delivery_proof|rto.
COMMENT ON COLUMN public.order_delivery_images.image_type IS
  'pickup | delivery | delivery_proof | rto — parcel requires pickup + delivery proofs';

-- 2) Denormalized proof pointers on orders_parcel for fast gate checks (no image-table scan).
ALTER TABLE public.orders_parcel
  ADD COLUMN IF NOT EXISTS pickup_proof_image_url TEXT,
  ADD COLUMN IF NOT EXISTS pickup_proof_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS pickup_proof_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_proof_image_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_proof_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS delivery_proof_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS orders_parcel_pickup_proof_at_idx
  ON public.orders_parcel (pickup_proof_at)
  WHERE pickup_proof_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_parcel_delivery_proof_at_idx
  ON public.orders_parcel (delivery_proof_at)
  WHERE delivery_proof_at IS NOT NULL;
