-- Public SEO slug for customer-facing restaurant URLs (/restaurant/{public_slug}).
-- Internal store_id (e.g. GMMC1026) remains unchanged for backend relationships.

ALTER TABLE merchant_stores
  ADD COLUMN IF NOT EXISTS public_slug TEXT;

COMMENT ON COLUMN merchant_stores.public_slug IS
  'Stable public URL slug for customer-facing pages. Separate from internal store_id.';

CREATE UNIQUE INDEX IF NOT EXISTS merchant_stores_public_slug_unique_idx
  ON merchant_stores (public_slug)
  WHERE public_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_stores_public_slug_lookup_idx
  ON merchant_stores (public_slug)
  WHERE public_slug IS NOT NULL AND deleted_at IS NULL;
