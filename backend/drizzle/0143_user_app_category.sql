-- NOTE: 0145_user_app_category_minimal.sql DROPs this table and recreates a slimmer schema.
-- Customer app discovery: browse rail + bottom sheet tiles per merchant store vertical (store_type).
-- Scoped by public.store_type (FOOD, PHARMA, GROCERY, FASHION, …) so each vertical has its own slugs/images.
-- Optional cuisine_id → cuisine_master for food/cuisine filtering.
-- Idempotent. Requires cuisine_master (0141) and store_type enum (0032/0035).

-- ---------------------------------------------------------------------------
-- 1) Extend store_type for app verticals not yet in enum (fashion, etc.)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) Table (fresh installs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_app_category (
  id             BIGSERIAL PRIMARY KEY,
  store_type     store_type NOT NULL DEFAULT 'FOOD',
  slug           TEXT NOT NULL,
  name           TEXT NOT NULL,
  image_url      TEXT NULL,
  category_type  TEXT NOT NULL,
  cuisine_id     BIGINT NULL REFERENCES public.cuisine_master (id) ON DELETE SET NULL,
  display_order  INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  metadata       JSONB NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_app_category_type_check CHECK (
    category_type IN (
      'browse_rail',
      'cuisines_sheet'
    )
  ),
  CONSTRAINT user_app_category_slug_type_store_unique UNIQUE (store_type, slug, category_type)
);

COMMENT ON TABLE public.user_app_category IS
  'User app tiles: browse_rail (chips) and cuisines_sheet (All grid). Partitioned by store_type (FOOD, PHARMA, GROCERY, FASHION, …).';

COMMENT ON COLUMN public.user_app_category.store_type IS
  'Same vertical as merchant_stores.store_type; app loads rows for the active home vertical.';

COMMENT ON COLUMN public.user_app_category.category_type IS
  'browse_rail = horizontal chips; cuisines_sheet = bottom sheet grid (works for any vertical; label in UI may differ).';

COMMENT ON COLUMN public.user_app_category.cuisine_id IS
  'Optional link to cuisine_master for FOOD/RESTAURANT-style filtering; NULL for non-food tiles.';

CREATE INDEX IF NOT EXISTS user_app_category_store_type_kind_order_idx
  ON public.user_app_category (store_type, category_type, display_order, id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS user_app_category_cuisine_idx
  ON public.user_app_category (cuisine_id)
  WHERE cuisine_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Seed FOOD + cuisines_sheet from cuisine_master (images filled later / CMS)
-- ---------------------------------------------------------------------------
INSERT INTO public.user_app_category (
  store_type,
  slug,
  name,
  image_url,
  category_type,
  cuisine_id,
  display_order
)
SELECT
  'FOOD'::store_type,
  cm.slug,
  cm.name,
  NULL::TEXT,
  'cuisines_sheet'::TEXT,
  cm.id,
  cm.display_order
FROM public.cuisine_master cm
WHERE cm.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_app_category u
    WHERE u.store_type = 'FOOD'::store_type
      AND u.slug = cm.slug
      AND u.category_type = 'cuisines_sheet'
  );
