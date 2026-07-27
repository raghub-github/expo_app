-- 0455: Unique rider onboarding documents (Aadhaar / PAN / DL / RC)
-- Prevents the same identity document from being reused across riders.
-- Idempotent — safe to re-run.

-- 1) Backfill doc_number from metadata where missing
UPDATE public.rider_documents
SET doc_number = regexp_replace(coalesce(metadata->>'aadhaarNumber', ''), '\D', '', 'g')
WHERE doc_type = 'aadhaar'
  AND (doc_number IS NULL OR btrim(doc_number) = '')
  AND regexp_replace(coalesce(metadata->>'aadhaarNumber', ''), '\D', '', 'g') ~ '^\d{12}$';

UPDATE public.rider_documents
SET doc_number = upper(regexp_replace(coalesce(metadata->>'panNumber', ''), '[^A-Za-z0-9]', '', 'g'))
WHERE doc_type = 'pan'
  AND (doc_number IS NULL OR btrim(doc_number) = '')
  AND upper(regexp_replace(coalesce(metadata->>'panNumber', ''), '[^A-Za-z0-9]', '', 'g')) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$';

UPDATE public.rider_documents
SET doc_number = upper(regexp_replace(coalesce(metadata->>'dlNumber', ''), '[^A-Za-z0-9]', '', 'g'))
WHERE doc_type = 'dl'
  AND (doc_number IS NULL OR btrim(doc_number) = '')
  AND length(upper(regexp_replace(coalesce(metadata->>'dlNumber', ''), '[^A-Za-z0-9]', '', 'g'))) >= 4;

UPDATE public.rider_documents
SET doc_number = upper(regexp_replace(coalesce(metadata->>'rcNumber', ''), '[^A-Za-z0-9]', '', 'g'))
WHERE doc_type = 'rc'
  AND (doc_number IS NULL OR btrim(doc_number) = '')
  AND length(upper(regexp_replace(coalesce(metadata->>'rcNumber', ''), '[^A-Za-z0-9]', '', 'g'))) >= 4;

-- Normalize riders.aadhaar_number / pan_number to canonical form
UPDATE public.riders
SET aadhaar_number = regexp_replace(aadhaar_number, '\D', '', 'g')
WHERE aadhaar_number IS NOT NULL
  AND aadhaar_number !~ '^\d{12}$'
  AND regexp_replace(aadhaar_number, '\D', '', 'g') ~ '^\d{12}$';

UPDATE public.riders
SET pan_number = upper(regexp_replace(pan_number, '[^A-Za-z0-9]', '', 'g'))
WHERE pan_number IS NOT NULL
  AND pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
  AND upper(regexp_replace(pan_number, '[^A-Za-z0-9]', '', 'g')) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$';

-- Soft-deleted riders must not block uniqueness
UPDATE public.riders
SET aadhaar_number = NULL
WHERE deleted_at IS NOT NULL
  AND aadhaar_number IS NOT NULL;

UPDATE public.riders
SET pan_number = NULL
WHERE deleted_at IS NOT NULL
  AND pan_number IS NOT NULL;

-- Active duplicate Aadhaar on riders: keep oldest row, clear others
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY regexp_replace(coalesce(aadhaar_number, ''), '\D', '', 'g')
           ORDER BY id
         ) AS rn
  FROM public.riders
  WHERE deleted_at IS NULL
    AND regexp_replace(coalesce(aadhaar_number, ''), '\D', '', 'g') ~ '^\d{12}$'
)
UPDATE public.riders r
SET aadhaar_number = NULL
FROM dups d
WHERE r.id = d.id
  AND d.rn > 1;

-- Active duplicate PAN on riders: keep oldest row, clear others
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY upper(regexp_replace(coalesce(pan_number, ''), '[^A-Za-z0-9]', '', 'g'))
           ORDER BY id
         ) AS rn
  FROM public.riders
  WHERE deleted_at IS NULL
    AND upper(regexp_replace(coalesce(pan_number, ''), '[^A-Za-z0-9]', '', 'g')) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
)
UPDATE public.riders r
SET pan_number = NULL
FROM dups d
WHERE r.id = d.id
  AND d.rn > 1;

-- Duplicate identity docs across riders: keep oldest document, clear doc_number on newer ones
WITH ranked AS (
  SELECT rd.id,
         ROW_NUMBER() OVER (
           PARTITION BY rd.doc_type, upper(btrim(rd.doc_number))
           ORDER BY rd.id
         ) AS rn
  FROM public.rider_documents rd
  INNER JOIN public.riders r ON r.id = rd.rider_id
  WHERE r.deleted_at IS NULL
    AND rd.doc_type IN ('aadhaar', 'pan', 'dl', 'rc')
    AND rd.doc_number IS NOT NULL
    AND btrim(rd.doc_number) <> ''
)
UPDATE public.rider_documents d
SET doc_number = NULL
FROM ranked rk
WHERE d.id = rk.id
  AND rk.rn > 1;

-- Unique: one active rider per Aadhaar
CREATE UNIQUE INDEX IF NOT EXISTS riders_aadhaar_number_uidx
  ON public.riders (aadhaar_number)
  WHERE deleted_at IS NULL
    AND aadhaar_number IS NOT NULL
    AND aadhaar_number ~ '^\d{12}$';

-- Unique: one active rider per PAN
CREATE UNIQUE INDEX IF NOT EXISTS riders_pan_number_uidx
  ON public.riders (upper(pan_number))
  WHERE deleted_at IS NULL
    AND pan_number IS NOT NULL
    AND btrim(pan_number) <> '';

-- Unique: one document number per identity doc type (across all riders)
CREATE UNIQUE INDEX IF NOT EXISTS rider_documents_doc_type_number_uidx
  ON public.rider_documents (doc_type, upper(doc_number))
  WHERE doc_type IN ('aadhaar', 'pan', 'dl', 'rc')
    AND doc_number IS NOT NULL
    AND btrim(doc_number) <> '';

COMMENT ON INDEX public.riders_aadhaar_number_uidx IS
  'One active rider per Aadhaar number (migration 0455).';
COMMENT ON INDEX public.riders_pan_number_uidx IS
  'One active rider per PAN (migration 0455).';
COMMENT ON INDEX public.rider_documents_doc_type_number_uidx IS
  'Identity docs (aadhaar/pan/dl/rc) must be unique by doc_number (migration 0455).';
