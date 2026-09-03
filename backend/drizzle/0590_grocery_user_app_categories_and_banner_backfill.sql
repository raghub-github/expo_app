-- Grocery customer-app browse categories + store-card banner backfill.
-- I/O: one existence check, at most one small INSERT, one meta upsert, one
-- filtered UPDATE (only stores with empty banner and a non-empty gallery[1]).
-- Does NOT delete or overwrite Super Admin GROCERY rows.

-- All-tab meta for grocery (no-op if already present).
INSERT INTO public.user_app_category_meta (store_type, all_tab_label, all_tab_image_url, updated_at)
SELECT 'GROCERY'::store_type, 'All', NULL, now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_app_category_meta
  WHERE store_type = 'GROCERY'::store_type
);

-- Seed grocery tiles only when the vertical has zero rows.
INSERT INTO public.user_app_category (name, image_url, store_type, status, display_order)
SELECT v.name, NULL, 'GROCERY'::store_type, 'active', v.display_order
FROM (
  VALUES
    ('Fruits & Vegetables', 1),
    ('Dairy & Bread', 2),
    ('Atta, Rice & Dal', 3),
    ('Oil, Ghee & Masala', 4),
    ('Snacks & Packaged Food', 5),
    ('Beverages', 6),
    ('Personal Care', 7),
    ('Household', 8)
) AS v(name, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_app_category
  WHERE store_type = 'GROCERY'::store_type
);

-- If a store has gallery photos but no banner, use the first gallery image as banner
-- so list cards have a guaranteed primary URI (grocery + other verticals).
UPDATE public.merchant_stores
SET banner_url = NULLIF(btrim(gallery_images[1]), '')
WHERE (banner_url IS NULL OR btrim(banner_url) = '')
  AND gallery_images IS NOT NULL
  AND cardinality(gallery_images) >= 1
  AND NULLIF(btrim(gallery_images[1]), '') IS NOT NULL;
