-- One feedback submission per email (idempotent / I/O-safe).
-- Normalizes existing emails to lowercase, then unique index on lower(email).

BEGIN;

UPDATE public.customer_reviews
SET email = lower(btrim(email))
WHERE email IS NOT NULL
  AND email <> lower(btrim(email));

-- Keep the earliest row per email; clear email on later duplicates so the unique index can apply.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(btrim(email))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.customer_reviews
  WHERE email IS NOT NULL AND btrim(email) <> ''
)
UPDATE public.customer_reviews cr
SET email = NULL
FROM ranked r
WHERE cr.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS customer_reviews_email_lower_uidx
  ON public.customer_reviews (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

COMMIT;
