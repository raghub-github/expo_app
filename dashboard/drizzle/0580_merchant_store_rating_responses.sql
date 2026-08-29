-- Multiple merchant replies per store rating, stored as JSON.
-- merchant_response stays the latest reply so customer/cx surfaces need no extra I/O.

ALTER TABLE public.merchant_store_ratings
  ADD COLUMN IF NOT EXISTS merchant_responses jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.merchant_store_ratings
SET merchant_responses = jsonb_build_array(
  jsonb_build_object(
    'text', merchant_response,
    'at', to_char(
      timezone('UTC', COALESCE(merchant_responded_at, updated_at, created_at)),
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
  )
)
WHERE merchant_response IS NOT NULL
  AND btrim(merchant_response) <> ''
  AND (
    merchant_responses IS NULL
    OR merchant_responses = '[]'::jsonb
  );

COMMENT ON COLUMN public.merchant_store_ratings.merchant_responses IS
  'Chronological merchant replies: [{ "text": string, "at": iso, "images"?: string[] }]. merchant_response is the latest text for legacy readers.';
