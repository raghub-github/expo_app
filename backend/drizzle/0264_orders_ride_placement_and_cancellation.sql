-- ============================================================================
-- orders_ride: fare, rider assignment mirror, search window, cancellation audit
-- Migration: 0264_orders_ride_placement_and_cancellation
-- ============================================================================

ALTER TABLE public.orders_ride
  ADD COLUMN IF NOT EXISTS estimated_fare numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_fare numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS amount_collected numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS payment_method text NULL,
  ADD COLUMN IF NOT EXISTS assigned_rider_id integer NULL,
  ADD COLUMN IF NOT EXISTS rider_assigned_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS search_started_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS search_expires_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_type text NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason_text text NULL,
  ADD COLUMN IF NOT EXISTS cancel_mode text NULL;

COMMENT ON COLUMN public.orders_ride.estimated_fare IS
  'Quoted fare shown to customer at booking time (₹).';
COMMENT ON COLUMN public.orders_ride.final_fare IS
  'Final fare after ride completion or adjustment.';
COMMENT ON COLUMN public.orders_ride.amount_collected IS
  'Amount collected from customer for this ride.';
COMMENT ON COLUMN public.orders_ride.assigned_rider_id IS
  'Rider who accepted the ride; mirrors orders_core.rider_id for ride reporting.';
COMMENT ON COLUMN public.orders_ride.search_started_at IS
  'When customer entered rider-search / order was placed.';
COMMENT ON COLUMN public.orders_ride.search_expires_at IS
  'Auto-cancel deadline if no rider is assigned.';
COMMENT ON COLUMN public.orders_ride.cancelled_by_type IS
  'Who cancelled: customer, rider, system, admin.';
COMMENT ON COLUMN public.orders_ride.cancel_mode IS
  'manual | auto | timeout — how the ride search/booking was cancelled.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_ride_assigned_rider_id_fkey'
  ) THEN
    ALTER TABLE public.orders_ride
      ADD CONSTRAINT orders_ride_assigned_rider_id_fkey
      FOREIGN KEY (assigned_rider_id) REFERENCES public.riders (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_ride_cancelled_by_type_check'
  ) THEN
    ALTER TABLE public.orders_ride
      ADD CONSTRAINT orders_ride_cancelled_by_type_check
      CHECK (
        cancelled_by_type IS NULL
        OR cancelled_by_type = ANY (ARRAY['customer', 'rider', 'system', 'admin'])
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_ride_cancel_mode_check'
  ) THEN
    ALTER TABLE public.orders_ride
      ADD CONSTRAINT orders_ride_cancel_mode_check
      CHECK (
        cancel_mode IS NULL
        OR cancel_mode = ANY (ARRAY['manual', 'auto', 'timeout'])
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_ride_assigned_rider_id_idx
  ON public.orders_ride (assigned_rider_id)
  WHERE assigned_rider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_ride_search_expires_idx
  ON public.orders_ride (search_expires_at)
  WHERE search_expires_at IS NOT NULL AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_ride_cancelled_by_type_idx
  ON public.orders_ride (cancelled_by_type, cancelled_at DESC)
  WHERE cancelled_by_type IS NOT NULL;

-- Keep orders_ride.assigned_rider_id in sync when orders_core.rider_id changes.
CREATE OR REPLACE FUNCTION sync_orders_ride_assigned_rider()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_type = 'person_ride'::order_type THEN
    UPDATE public.orders_ride
    SET
      assigned_rider_id = NEW.rider_id,
      rider_assigned_at = CASE
        WHEN NEW.rider_id IS NOT NULL AND (OLD.rider_id IS DISTINCT FROM NEW.rider_id)
          THEN COALESCE(rider_assigned_at, NOW())
        ELSE rider_assigned_at
      END,
      updated_at = NOW()
    WHERE order_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_core_sync_ride_assigned_rider ON public.orders_core;
CREATE TRIGGER orders_core_sync_ride_assigned_rider
  AFTER UPDATE OF rider_id ON public.orders_core
  FOR EACH ROW
  EXECUTE FUNCTION sync_orders_ride_assigned_rider();
