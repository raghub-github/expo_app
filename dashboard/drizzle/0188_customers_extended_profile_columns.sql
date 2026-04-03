-- Align customers table with extended profile / geo / permissions (additive, idempotent)

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS age_group text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS location_permission boolean DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contacts_permission boolean DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sessions_invalid_before timestamp with time zone;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pincode text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS latitude numeric(10, 7);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS longitude numeric(10, 7);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email_verified_at timestamp with time zone;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_global_active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'customer_uuid'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN customer_uuid uuid;
    UPDATE public.customers SET customer_uuid = gen_random_uuid() WHERE customer_uuid IS NULL;
    ALTER TABLE public.customers ALTER COLUMN customer_uuid SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_uuid_key ON public.customers (customer_uuid);
  END IF;
END $$;
