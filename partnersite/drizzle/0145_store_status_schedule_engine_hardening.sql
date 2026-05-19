-- Store status schedule engine hardening (Partner Site + backend parity)
-- - Resync closed_days from per-day _open flags
-- - Default auto_open_from_schedule = true where unset
-- - Close stores that are incorrectly OPEN on a scheduled-closed calendar day

-- 1) Ensure availability rows exist with schedule auto-open enabled by default
INSERT INTO public.merchant_store_availability (
  store_id,
  is_available,
  is_accepting_orders,
  block_auto_open,
  auto_open_from_schedule
)
SELECT ms.id, false, false, false, true
FROM public.merchant_stores ms
WHERE ms.deleted_at IS NULL
  AND ms.id NOT IN (SELECT store_id FROM public.merchant_store_availability)
ON CONFLICT (store_id) DO NOTHING;

UPDATE public.merchant_store_availability
SET auto_open_from_schedule = true
WHERE auto_open_from_schedule IS NULL;

UPDATE public.merchant_store_availability
SET block_auto_open = false
WHERE block_auto_open IS NULL;

-- 2) Resync closed_days[] from *_open flags (matches sync_operating_hours_closed_days trigger)
DO $$
DECLARE
  rec RECORD;
  closed_list text[];
BEGIN
  FOR rec IN SELECT * FROM public.merchant_store_operating_hours
  LOOP
    closed_list := ARRAY[]::text[];
    IF NOT COALESCE(rec.monday_open, false) THEN closed_list := array_append(closed_list, 'monday'); END IF;
    IF NOT COALESCE(rec.tuesday_open, false) THEN closed_list := array_append(closed_list, 'tuesday'); END IF;
    IF NOT COALESCE(rec.wednesday_open, false) THEN closed_list := array_append(closed_list, 'wednesday'); END IF;
    IF NOT COALESCE(rec.thursday_open, false) THEN closed_list := array_append(closed_list, 'thursday'); END IF;
    IF NOT COALESCE(rec.friday_open, false) THEN closed_list := array_append(closed_list, 'friday'); END IF;
    IF NOT COALESCE(rec.saturday_open, false) THEN closed_list := array_append(closed_list, 'saturday'); END IF;
    IF NOT COALESCE(rec.sunday_open, false) THEN closed_list := array_append(closed_list, 'sunday'); END IF;

    UPDATE public.merchant_store_operating_hours
    SET
      closed_days = CASE WHEN array_length(closed_list, 1) > 0 THEN closed_list ELSE NULL END,
      updated_at = NOW()
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 3) Force CLOSED when store is online but today's weekday is scheduled closed
DO $$
DECLARE
  rec RECORD;
  dow int;
  day_names text[] := ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  day_name text;
  is_closed boolean;
BEGIN
  dow := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::int;
  day_name := day_names[dow + 1];

  FOR rec IN
    SELECT ms.id AS store_id, oh.closed_days, oh.same_for_all_days,
           oh.monday_open, oh.tuesday_open, oh.wednesday_open, oh.thursday_open,
           oh.friday_open, oh.saturday_open, oh.sunday_open
    FROM public.merchant_stores ms
    JOIN public.merchant_store_operating_hours oh ON oh.store_id = ms.id
    WHERE ms.deleted_at IS NULL
      AND (
        ms.operational_status = 'OPEN'::store_operational_status
        OR ms.is_active = true
        OR ms.is_accepting_orders = true
        OR ms.is_available = true
      )
  LOOP
    is_closed := false;
    IF rec.closed_days IS NOT NULL AND day_name = ANY(rec.closed_days) THEN
      is_closed := true;
    ELSIF day_name = 'monday' AND NOT COALESCE(rec.monday_open, false) THEN is_closed := true;
    ELSIF day_name = 'tuesday' AND NOT COALESCE(rec.tuesday_open, false) THEN is_closed := true;
    ELSIF day_name = 'wednesday' AND NOT COALESCE(rec.wednesday_open, false) THEN is_closed := true;
    ELSIF day_name = 'thursday' AND NOT COALESCE(rec.thursday_open, false) THEN is_closed := true;
    ELSIF day_name = 'friday' AND NOT COALESCE(rec.friday_open, false) THEN is_closed := true;
    ELSIF day_name = 'saturday' AND NOT COALESCE(rec.saturday_open, false) THEN is_closed := true;
    ELSIF day_name = 'sunday' AND NOT COALESCE(rec.sunday_open, false) THEN is_closed := true;
    END IF;

    IF is_closed THEN
      UPDATE public.merchant_stores
      SET
        operational_status = 'CLOSED'::store_operational_status,
        is_active = false,
        is_accepting_orders = false,
        is_available = false,
        updated_at = NOW()
      WHERE id = rec.store_id;

      UPDATE public.merchant_store_availability
      SET
        is_available = false,
        is_accepting_orders = false,
        unavailable_reason = 'schedule_closed',
        close_reason = 'Today Closed (Scheduled Closed)',
        restriction_type = 'schedule',
        is_manual_override = false,
        manual_override_at = NULL,
        schedule_end_prompted_at = NULL,
        schedule_end_prompt_expires_at = NULL,
        last_toggle_type = 'AUTO_CLOSE',
        last_toggled_at = NOW(),
        updated_at = NOW()
      WHERE store_id = rec.store_id;
    END IF;
  END LOOP;
END $$;
