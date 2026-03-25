-- Upgrade path: older user_app_category without store_type or with UNIQUE (slug, category_type) only.
-- On DBs that already have the final 0143 shape, this is mostly idempotent (DROP/ADD unique, index).

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_app_category'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_app_category'
        AND column_name = 'store_type'
    ) THEN
      ALTER TABLE public.user_app_category
        ADD COLUMN store_type store_type NOT NULL DEFAULT 'FOOD';
    END IF;

    ALTER TABLE public.user_app_category DROP CONSTRAINT IF EXISTS user_app_category_slug_type_unique;
    ALTER TABLE public.user_app_category DROP CONSTRAINT IF EXISTS user_app_category_slug_type_store_unique;

    BEGIN
      ALTER TABLE public.user_app_category
        ADD CONSTRAINT user_app_category_slug_type_store_unique UNIQUE (store_type, slug, category_type);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$mig$;

DROP INDEX IF EXISTS user_app_category_type_order_idx;

CREATE INDEX IF NOT EXISTS user_app_category_store_type_kind_order_idx
  ON public.user_app_category (store_type, category_type, display_order, id)
  WHERE is_active = TRUE;
