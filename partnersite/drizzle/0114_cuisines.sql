-- 0114_cuisines.sql
-- Master cuisine list + per-store cuisine mapping.
-- Safe to run multiple times (CREATE TABLE/INDEX IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.cuisine_master (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT TRUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata      JSONB NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_store_cuisines (
  id          BIGSERIAL PRIMARY KEY,
  store_id    BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  cuisine_id  BIGINT NOT NULL REFERENCES public.cuisine_master(id) ON DELETE RESTRICT,
  custom_name TEXT NULL,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, cuisine_id)
);

CREATE INDEX IF NOT EXISTS merchant_store_cuisines_store_idx
  ON public.merchant_store_cuisines (store_id);

