-- Track which surface set schedule time-off or rush hour (dashboard / partnersite / merchant_app).

ALTER TABLE merchant_store_scheduled_closures
  ADD COLUMN IF NOT EXISTS marked_from TEXT;

ALTER TABLE merchant_store_rush_windows
  ADD COLUMN IF NOT EXISTS marked_from TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_store_scheduled_closures_marked_from_check'
  ) THEN
    ALTER TABLE merchant_store_scheduled_closures
      ADD CONSTRAINT merchant_store_scheduled_closures_marked_from_check
      CHECK (
        marked_from IS NULL
        OR marked_from IN ('dashboard', 'partnersite', 'merchant_app')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_store_rush_windows_marked_from_check'
  ) THEN
    ALTER TABLE merchant_store_rush_windows
      ADD CONSTRAINT merchant_store_rush_windows_marked_from_check
      CHECK (
        marked_from IS NULL
        OR marked_from IN ('dashboard', 'partnersite', 'merchant_app')
      );
  END IF;
END;
$$;
