-- Replace user_app_category with a minimal app-browse table (name, image, store vertical, status).
-- Drops the previous shape (cuisine_id, category_type, slug, …). Requires public.store_type enum.

DO $enum$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_type') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'store_type'
        AND e.enumlabel = 'FASHION'
    ) THEN
      ALTER TYPE store_type ADD VALUE IF NOT EXISTS 'FASHION';
    END IF;
  END IF;
END
$enum$;

DROP TABLE IF EXISTS public.user_app_category CASCADE;

CREATE TABLE public.user_app_category (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  image_url      TEXT NULL,
  store_type     store_type NOT NULL DEFAULT 'FOOD',
  status         TEXT NOT NULL DEFAULT 'active',
  display_order  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT user_app_category_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS user_app_category_store_active_idx
  ON public.user_app_category (store_type, display_order, id)
  WHERE status = 'active';

COMMENT ON TABLE public.user_app_category IS
  'Customer app category tiles: display name, optional image, merchant vertical (store_type), active/inactive.';

COMMENT ON COLUMN public.user_app_category.status IS 'active = shown in app; inactive = hidden.';
