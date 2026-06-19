-- Store selected rating option tags + typed messages separately (merchant + rider).

ALTER TABLE public.merchant_store_ratings
  ADD COLUMN IF NOT EXISTS store_review_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rider_review_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rider_review_text TEXT;

COMMENT ON COLUMN public.merchant_store_ratings.store_review_tags IS
  'Customer-selected restaurant rating option labels (JSON array of strings).';
COMMENT ON COLUMN public.merchant_store_ratings.rider_review_tags IS
  'Customer-selected delivery partner rating option labels (JSON array of strings).';
COMMENT ON COLUMN public.merchant_store_ratings.rider_review_text IS
  'Customer typed delivery partner review (free text). review_title kept for legacy.';

UPDATE public.merchant_store_ratings
SET rider_review_tags = (
  SELECT COALESCE(jsonb_agg(trim(both from elem)), '[]'::jsonb)
  FROM unnest(string_to_array(review_title, ',')) AS elem
  WHERE trim(both from elem) <> ''
)
WHERE rider_review_tags = '[]'::jsonb
  AND review_title IS NOT NULL
  AND review_title LIKE '%,%';

UPDATE public.merchant_store_ratings
SET rider_review_text = trim(review_title)
WHERE rider_review_text IS NULL
  AND review_title IS NOT NULL
  AND review_title NOT LIKE '%,%';
