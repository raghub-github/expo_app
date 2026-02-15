-- Safe enhancements for two-slot store timings without breaking existing schema.
-- This migration is additive and compatible with current merchant_store_operating_hours.

CREATE OR REPLACE FUNCTION public.compute_store_day_duration(
  slot1_start time,
  slot1_end time,
  slot2_start time,
  slot2_end time
) RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(
      CASE WHEN slot1_start IS NOT NULL AND slot1_end IS NOT NULL AND slot1_end > slot1_start
        THEN EXTRACT(EPOCH FROM (slot1_end - slot1_start)) / 60
        ELSE 0
      END, 0
    )::integer
    +
    COALESCE(
      CASE WHEN slot2_start IS NOT NULL AND slot2_end IS NOT NULL AND slot2_end > slot2_start
        THEN EXTRACT(EPOCH FROM (slot2_end - slot2_start)) / 60
        ELSE 0
      END, 0
    )::integer;
$$;

CREATE OR REPLACE FUNCTION public.merchant_store_operating_hours_derive_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.monday_open := NEW.monday_slot1_start IS NOT NULL AND NEW.monday_slot1_end IS NOT NULL;
  NEW.tuesday_open := NEW.tuesday_slot1_start IS NOT NULL AND NEW.tuesday_slot1_end IS NOT NULL;
  NEW.wednesday_open := NEW.wednesday_slot1_start IS NOT NULL AND NEW.wednesday_slot1_end IS NOT NULL;
  NEW.thursday_open := NEW.thursday_slot1_start IS NOT NULL AND NEW.thursday_slot1_end IS NOT NULL;
  NEW.friday_open := NEW.friday_slot1_start IS NOT NULL AND NEW.friday_slot1_end IS NOT NULL;
  NEW.saturday_open := NEW.saturday_slot1_start IS NOT NULL AND NEW.saturday_slot1_end IS NOT NULL;
  NEW.sunday_open := NEW.sunday_slot1_start IS NOT NULL AND NEW.sunday_slot1_end IS NOT NULL;

  NEW.monday_total_duration_minutes := public.compute_store_day_duration(
    NEW.monday_slot1_start, NEW.monday_slot1_end, NEW.monday_slot2_start, NEW.monday_slot2_end
  );
  NEW.tuesday_total_duration_minutes := public.compute_store_day_duration(
    NEW.tuesday_slot1_start, NEW.tuesday_slot1_end, NEW.tuesday_slot2_start, NEW.tuesday_slot2_end
  );
  NEW.wednesday_total_duration_minutes := public.compute_store_day_duration(
    NEW.wednesday_slot1_start, NEW.wednesday_slot1_end, NEW.wednesday_slot2_start, NEW.wednesday_slot2_end
  );
  NEW.thursday_total_duration_minutes := public.compute_store_day_duration(
    NEW.thursday_slot1_start, NEW.thursday_slot1_end, NEW.thursday_slot2_start, NEW.thursday_slot2_end
  );
  NEW.friday_total_duration_minutes := public.compute_store_day_duration(
    NEW.friday_slot1_start, NEW.friday_slot1_end, NEW.friday_slot2_start, NEW.friday_slot2_end
  );
  NEW.saturday_total_duration_minutes := public.compute_store_day_duration(
    NEW.saturday_slot1_start, NEW.saturday_slot1_end, NEW.saturday_slot2_start, NEW.saturday_slot2_end
  );
  NEW.sunday_total_duration_minutes := public.compute_store_day_duration(
    NEW.sunday_slot1_start, NEW.sunday_slot1_end, NEW.sunday_slot2_start, NEW.sunday_slot2_end
  );

  NEW.closed_days := array_remove(ARRAY[
    CASE WHEN NOT NEW.monday_open THEN 'monday' END,
    CASE WHEN NOT NEW.tuesday_open THEN 'tuesday' END,
    CASE WHEN NOT NEW.wednesday_open THEN 'wednesday' END,
    CASE WHEN NOT NEW.thursday_open THEN 'thursday' END,
    CASE WHEN NOT NEW.friday_open THEN 'friday' END,
    CASE WHEN NOT NEW.saturday_open THEN 'saturday' END,
    CASE WHEN NOT NEW.sunday_open THEN 'sunday' END
  ], NULL);

  NEW.same_for_all_days :=
    NEW.monday_open = NEW.tuesday_open
    AND NEW.monday_open = NEW.wednesday_open
    AND NEW.monday_open = NEW.thursday_open
    AND NEW.monday_open = NEW.friday_open
    AND NEW.monday_open = NEW.saturday_open
    AND NEW.monday_open = NEW.sunday_open
    AND NEW.monday_slot1_start IS NOT DISTINCT FROM NEW.tuesday_slot1_start
    AND NEW.monday_slot1_start IS NOT DISTINCT FROM NEW.wednesday_slot1_start
    AND NEW.monday_slot1_start IS NOT DISTINCT FROM NEW.thursday_slot1_start
    AND NEW.monday_slot1_start IS NOT DISTINCT FROM NEW.friday_slot1_start
    AND NEW.monday_slot1_start IS NOT DISTINCT FROM NEW.saturday_slot1_start
    AND NEW.monday_slot1_start IS NOT DISTINCT FROM NEW.sunday_slot1_start
    AND NEW.monday_slot1_end IS NOT DISTINCT FROM NEW.tuesday_slot1_end
    AND NEW.monday_slot1_end IS NOT DISTINCT FROM NEW.wednesday_slot1_end
    AND NEW.monday_slot1_end IS NOT DISTINCT FROM NEW.thursday_slot1_end
    AND NEW.monday_slot1_end IS NOT DISTINCT FROM NEW.friday_slot1_end
    AND NEW.monday_slot1_end IS NOT DISTINCT FROM NEW.saturday_slot1_end
    AND NEW.monday_slot1_end IS NOT DISTINCT FROM NEW.sunday_slot1_end
    AND NEW.monday_slot2_start IS NOT DISTINCT FROM NEW.tuesday_slot2_start
    AND NEW.monday_slot2_start IS NOT DISTINCT FROM NEW.wednesday_slot2_start
    AND NEW.monday_slot2_start IS NOT DISTINCT FROM NEW.thursday_slot2_start
    AND NEW.monday_slot2_start IS NOT DISTINCT FROM NEW.friday_slot2_start
    AND NEW.monday_slot2_start IS NOT DISTINCT FROM NEW.saturday_slot2_start
    AND NEW.monday_slot2_start IS NOT DISTINCT FROM NEW.sunday_slot2_start
    AND NEW.monday_slot2_end IS NOT DISTINCT FROM NEW.tuesday_slot2_end
    AND NEW.monday_slot2_end IS NOT DISTINCT FROM NEW.wednesday_slot2_end
    AND NEW.monday_slot2_end IS NOT DISTINCT FROM NEW.thursday_slot2_end
    AND NEW.monday_slot2_end IS NOT DISTINCT FROM NEW.friday_slot2_end
    AND NEW.monday_slot2_end IS NOT DISTINCT FROM NEW.saturday_slot2_end
    AND NEW.monday_slot2_end IS NOT DISTINCT FROM NEW.sunday_slot2_end;

  NEW.is_24_hours :=
    NEW.monday_open AND NEW.tuesday_open AND NEW.wednesday_open AND NEW.thursday_open
    AND NEW.friday_open AND NEW.saturday_open AND NEW.sunday_open
    AND NEW.monday_slot1_start = '00:00'::time AND NEW.monday_slot1_end = '23:59'::time
    AND NEW.tuesday_slot1_start = '00:00'::time AND NEW.tuesday_slot1_end = '23:59'::time
    AND NEW.wednesday_slot1_start = '00:00'::time AND NEW.wednesday_slot1_end = '23:59'::time
    AND NEW.thursday_slot1_start = '00:00'::time AND NEW.thursday_slot1_end = '23:59'::time
    AND NEW.friday_slot1_start = '00:00'::time AND NEW.friday_slot1_end = '23:59'::time
    AND NEW.saturday_slot1_start = '00:00'::time AND NEW.saturday_slot1_end = '23:59'::time
    AND NEW.sunday_slot1_start = '00:00'::time AND NEW.sunday_slot1_end = '23:59'::time
    AND NEW.monday_slot2_start IS NULL AND NEW.monday_slot2_end IS NULL
    AND NEW.tuesday_slot2_start IS NULL AND NEW.tuesday_slot2_end IS NULL
    AND NEW.wednesday_slot2_start IS NULL AND NEW.wednesday_slot2_end IS NULL
    AND NEW.thursday_slot2_start IS NULL AND NEW.thursday_slot2_end IS NULL
    AND NEW.friday_slot2_start IS NULL AND NEW.friday_slot2_end IS NULL
    AND NEW.saturday_slot2_start IS NULL AND NEW.saturday_slot2_end IS NULL
    AND NEW.sunday_slot2_start IS NULL AND NEW.sunday_slot2_end IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_store_operating_hours_derive_fields_trigger
ON public.merchant_store_operating_hours;

CREATE TRIGGER merchant_store_operating_hours_derive_fields_trigger
BEFORE INSERT OR UPDATE
ON public.merchant_store_operating_hours
FOR EACH ROW
EXECUTE FUNCTION public.merchant_store_operating_hours_derive_fields();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_store_operating_hours_slot_pair_chk'
  ) THEN
    ALTER TABLE public.merchant_store_operating_hours
    ADD CONSTRAINT merchant_store_operating_hours_slot_pair_chk
    CHECK (
      (monday_slot2_start IS NULL) = (monday_slot2_end IS NULL)
      AND (tuesday_slot2_start IS NULL) = (tuesday_slot2_end IS NULL)
      AND (wednesday_slot2_start IS NULL) = (wednesday_slot2_end IS NULL)
      AND (thursday_slot2_start IS NULL) = (thursday_slot2_end IS NULL)
      AND (friday_slot2_start IS NULL) = (friday_slot2_end IS NULL)
      AND (saturday_slot2_start IS NULL) = (saturday_slot2_end IS NULL)
      AND (sunday_slot2_start IS NULL) = (sunday_slot2_end IS NULL)
    ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_store_operating_hours_slot_order_chk'
  ) THEN
    ALTER TABLE public.merchant_store_operating_hours
    ADD CONSTRAINT merchant_store_operating_hours_slot_order_chk
    CHECK (
      (monday_slot1_start IS NULL OR monday_slot1_end IS NULL OR monday_slot1_end > monday_slot1_start)
      AND (tuesday_slot1_start IS NULL OR tuesday_slot1_end IS NULL OR tuesday_slot1_end > tuesday_slot1_start)
      AND (wednesday_slot1_start IS NULL OR wednesday_slot1_end IS NULL OR wednesday_slot1_end > wednesday_slot1_start)
      AND (thursday_slot1_start IS NULL OR thursday_slot1_end IS NULL OR thursday_slot1_end > thursday_slot1_start)
      AND (friday_slot1_start IS NULL OR friday_slot1_end IS NULL OR friday_slot1_end > friday_slot1_start)
      AND (saturday_slot1_start IS NULL OR saturday_slot1_end IS NULL OR saturday_slot1_end > saturday_slot1_start)
      AND (sunday_slot1_start IS NULL OR sunday_slot1_end IS NULL OR sunday_slot1_end > sunday_slot1_start)
      AND (monday_slot2_start IS NULL OR monday_slot2_end IS NULL OR monday_slot2_end > monday_slot2_start)
      AND (tuesday_slot2_start IS NULL OR tuesday_slot2_end IS NULL OR tuesday_slot2_end > tuesday_slot2_start)
      AND (wednesday_slot2_start IS NULL OR wednesday_slot2_end IS NULL OR wednesday_slot2_end > wednesday_slot2_start)
      AND (thursday_slot2_start IS NULL OR thursday_slot2_end IS NULL OR thursday_slot2_end > thursday_slot2_start)
      AND (friday_slot2_start IS NULL OR friday_slot2_end IS NULL OR friday_slot2_end > friday_slot2_start)
      AND (saturday_slot2_start IS NULL OR saturday_slot2_end IS NULL OR saturday_slot2_end > saturday_slot2_start)
      AND (sunday_slot2_start IS NULL OR sunday_slot2_end IS NULL OR sunday_slot2_end > sunday_slot2_start)
    ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_store_operating_hours_slot_overlap_chk'
  ) THEN
    ALTER TABLE public.merchant_store_operating_hours
    ADD CONSTRAINT merchant_store_operating_hours_slot_overlap_chk
    CHECK (
      (monday_slot2_start IS NULL OR monday_slot1_end IS NULL OR monday_slot2_start > monday_slot1_end)
      AND (tuesday_slot2_start IS NULL OR tuesday_slot1_end IS NULL OR tuesday_slot2_start > tuesday_slot1_end)
      AND (wednesday_slot2_start IS NULL OR wednesday_slot1_end IS NULL OR wednesday_slot2_start > wednesday_slot1_end)
      AND (thursday_slot2_start IS NULL OR thursday_slot1_end IS NULL OR thursday_slot2_start > thursday_slot1_end)
      AND (friday_slot2_start IS NULL OR friday_slot1_end IS NULL OR friday_slot2_start > friday_slot1_end)
      AND (saturday_slot2_start IS NULL OR saturday_slot1_end IS NULL OR saturday_slot2_start > saturday_slot1_end)
      AND (sunday_slot2_start IS NULL OR sunday_slot1_end IS NULL OR sunday_slot2_start > sunday_slot1_end)
    ) NOT VALID;
  END IF;
END $$;
