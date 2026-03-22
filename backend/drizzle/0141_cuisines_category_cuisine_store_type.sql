-- Menu categories: cuisine_id → cuisine_master; store picks cuisines via merchant_store_cuisines.
-- Aligns with partnersite 0114_cuisines.sql (cuisine_master + merchant_store_cuisines).
-- Idempotent. Run after merchant_stores / merchant_parents exist.

-- ---------------------------------------------------------------------------
-- 1) Master list + per-store links (same shape as partnersite/drizzle/0114_cuisines.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cuisine_master (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT TRUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata      JSONB NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.merchant_store_cuisines (
  id          BIGSERIAL PRIMARY KEY,
  store_id    BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  cuisine_id  BIGINT NOT NULL REFERENCES public.cuisine_master(id) ON DELETE RESTRICT,
  custom_name TEXT NULL,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, cuisine_id)
);

CREATE INDEX IF NOT EXISTS merchant_store_cuisines_store_idx
  ON public.merchant_store_cuisines (store_id);

COMMENT ON TABLE public.merchant_store_cuisines IS
  'Store-level cuisine selection (onboarding / settings). Category.cuisine_id references cuisine_master.id; row must exist here for the store.';

-- ---------------------------------------------------------------------------
-- 2) Category: cuisine_id → cuisine_master, soft-delete, plan subcategory cap
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_menu_categories
  ADD COLUMN IF NOT EXISTS cuisine_id BIGINT NULL;

-- Drop previous FK (e.g. draft 0141 pointing at public.cuisines)
ALTER TABLE public.merchant_menu_categories
  DROP CONSTRAINT IF EXISTS merchant_menu_categories_cuisine_id_fkey;

-- Clear values that are not valid cuisine_master ids (e.g. after switching from another table)
UPDATE public.merchant_menu_categories mmc
SET cuisine_id = NULL
WHERE mmc.cuisine_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.cuisine_master cm WHERE cm.id = mmc.cuisine_id);

DO $fk$
BEGIN
  ALTER TABLE public.merchant_menu_categories
    ADD CONSTRAINT merchant_menu_categories_cuisine_id_fkey
    FOREIGN KEY (cuisine_id) REFERENCES public.cuisine_master(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

ALTER TABLE public.merchant_menu_categories
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS merchant_menu_categories_store_not_deleted_idx
  ON public.merchant_menu_categories (store_id)
  WHERE COALESCE(is_deleted, FALSE) = FALSE;

-- ---------------------------------------------------------------------------
-- 3) Plan: optional cap on subcategories (NULL = unlimited)
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_plans
  ADD COLUMN IF NOT EXISTS max_menu_subcategories INTEGER NULL;

-- ---------------------------------------------------------------------------
-- 4) No duplicate live category names per store + parent (case-insensitive)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_merchant_menu_categories_store_parent_name_live
  ON public.merchant_menu_categories (
    store_id,
    COALESCE(parent_category_id, 0::BIGINT),
    lower(trim(category_name))
  )
  WHERE COALESCE(is_deleted, FALSE) = FALSE;

-- ---------------------------------------------------------------------------
-- 5) Seed cuisine_master (by slug) — does not touch existing rows / store links
-- ---------------------------------------------------------------------------
INSERT INTO public.cuisine_master (slug, name, is_default, display_order)
SELECT v.slug, v.name, TRUE, v.ord
FROM (VALUES
  ('north-indian', 'North Indian', 1),
  ('south-indian', 'South Indian', 2),
  ('chinese', 'Chinese', 3),
  ('italian', 'Italian', 4),
  ('mexican', 'Mexican', 5),
  ('thai', 'Thai', 6),
  ('continental', 'Continental', 7),
  ('mughlai', 'Mughlai', 8),
  ('fast-food', 'Fast Food', 9),
  ('street-food', 'Street Food', 10),
  ('cafe', 'Cafe', 11),
  ('bakery', 'Bakery', 12),
  ('desserts', 'Desserts', 13),
  ('beverages', 'Beverages', 14),
  ('multi-cuisine', 'Multi-cuisine', 15)
) AS v(slug, name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.cuisine_master cm WHERE lower(cm.slug) = lower(v.slug));

-- ---------------------------------------------------------------------------
-- 6) Legacy table from an earlier 0141 draft (categories no longer reference it)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.cuisines CASCADE;
