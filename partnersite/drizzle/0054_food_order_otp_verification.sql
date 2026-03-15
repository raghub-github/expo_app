-- Fraud-resistant Order Verification: Pickup OTP, RTO OTP, audit
-- Pickup OTP auto-generated at order placement; converts to RTO OTP when marked RTO
-- OTP displayed to merchant for rider verification; validation required before pickup
-- Audit prevents reuse and manipulation

-- 1. Add RTO status to orders_food lifecycle
ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS is_rto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rto_at timestamp with time zone;

-- 2. Create food order OTP table (one row per order; PICKUP converts to RTO)
CREATE TABLE IF NOT EXISTS public.order_food_otps (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL UNIQUE REFERENCES public.orders_core(id) ON DELETE CASCADE,
  otp_code text NOT NULL,
  otp_type text NOT NULL CHECK (otp_type IN ('PICKUP', 'RTO')),
  verified_at timestamp with time zone,
  verified_by text,
  attempt_count integer NOT NULL DEFAULT 0,
  locked_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_food_otps_order_id_idx ON public.order_food_otps(order_id);
COMMENT ON TABLE public.order_food_otps IS 'Pickup OTP at placement; converts to RTO when order marked RTO. Single OTP per order.';

-- 3. OTP audit log
CREATE TABLE IF NOT EXISTS public.order_food_otp_audit (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('GENERATE', 'VALIDATE_SUCCESS', 'VALIDATE_FAIL', 'CONVERT_RTO')),
  otp_type text,
  actor text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_food_otp_audit_order_id_idx ON public.order_food_otp_audit(order_id);

-- 4. Generate 6-digit OTP (stored for display; single OTP converts PICKUP->RTO)
CREATE OR REPLACE FUNCTION public.generate_food_order_otp(p_order_id bigint, p_otp_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp text;
BEGIN
  v_otp := lpad(floor(random() * 1000000)::text, 6, '0');
  INSERT INTO public.order_food_otps (order_id, otp_code, otp_type)
  VALUES (p_order_id, v_otp, p_otp_type)
  ON CONFLICT (order_id) DO UPDATE SET
    otp_code = EXCLUDED.otp_code,
    otp_type = EXCLUDED.otp_type,
    attempt_count = 0,
    locked_until = NULL,
    verified_at = NULL,
    updated_at = now();
  INSERT INTO public.order_food_otp_audit (order_id, action, otp_type) VALUES (p_order_id, 'GENERATE', p_otp_type);
  RETURN v_otp;
END;
$$;

-- 5. Convert PICKUP OTP to RTO OTP (same code, type change)
CREATE OR REPLACE FUNCTION public.convert_food_order_otp_to_rto(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.order_food_otps SET otp_type = 'RTO', updated_at = now() WHERE order_id = p_order_id AND otp_type = 'PICKUP';
  INSERT INTO public.order_food_otp_audit (order_id, action, otp_type) VALUES (p_order_id, 'CONVERT_RTO', 'RTO');
END;
$$;

-- 6. Trigger: auto-generate Pickup OTP when orders_food row is inserted
CREATE OR REPLACE FUNCTION public.orders_food_otp_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.generate_food_order_otp(NEW.order_id, 'PICKUP');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_food_otp_generate_trigger ON public.orders_food;
CREATE TRIGGER orders_food_otp_generate_trigger
  AFTER INSERT ON public.orders_food
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_food_otp_trigger();

-- 7. Backfill OTPs for existing orders_food without OTP
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT of_.order_id FROM orders_food of_ LEFT JOIN order_food_otps o ON o.order_id = of_.order_id WHERE o.id IS NULL
  LOOP
    PERFORM public.generate_food_order_otp(r.order_id, 'PICKUP');
  END LOOP;
END;
$$;
