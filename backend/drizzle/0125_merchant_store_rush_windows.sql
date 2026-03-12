-- 0125_merchant_store_rush_windows.sql
-- Track temporary "rush in kitchen" windows per store so that
-- downstream systems can extend preparation / delivery times.

CREATE TABLE IF NOT EXISTS public.merchant_store_rush_windows (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores (id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INTEGER NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_store_rush_windows_duration_positive'
  ) THEN
    ALTER TABLE public.merchant_store_rush_windows
      ADD CONSTRAINT merchant_store_rush_windows_duration_positive
      CHECK (duration_minutes > 0 AND duration_minutes <= 240);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS merchant_store_rush_windows_store_active_idx
  ON public.merchant_store_rush_windows (store_id, is_active, ends_at);

