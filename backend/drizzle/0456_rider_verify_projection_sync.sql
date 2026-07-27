-- 0456_rider_verify_projection_sync.sql
-- Keep rider_documents.doc_number + riders.pan_number / aadhaar_number / name / dob
-- in sync with Cashfree / DigiLocker extracted_data_summary (same DB the rider
-- app and rider dashboard both use). Idempotent backfill for rows already
-- projected without doc_number.

-- Ensure enum labels exist (no-op if 0394 already applied).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'auto_verified'
      AND enumtypid = 'document_verification_status'::regtype
  ) THEN
    ALTER TYPE document_verification_status ADD VALUE 'auto_verified';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'expired'
      AND enumtypid = 'document_verification_status'::regtype
  ) THEN
    ALTER TYPE document_verification_status ADD VALUE 'expired';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'consent_denied'
      AND enumtypid = 'document_verification_status'::regtype
  ) THEN
    ALTER TYPE document_verification_status ADD VALUE 'consent_denied';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'timeout'
      AND enumtypid = 'document_verification_status'::regtype
  ) THEN
    ALTER TYPE document_verification_status ADD VALUE 'timeout';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CASHFREE_AUTO'
      AND enumtypid = 'verification_method'::regtype
  ) THEN
    ALTER TYPE verification_method ADD VALUE 'CASHFREE_AUTO';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CASHFREE_ASSISTED'
      AND enumtypid = 'verification_method'::regtype
  ) THEN
    ALTER TYPE verification_method ADD VALUE 'CASHFREE_ASSISTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CASHFREE_MANUAL_FALLBACK'
      AND enumtypid = 'verification_method'::regtype
  ) THEN
    ALTER TYPE verification_method ADD VALUE 'CASHFREE_MANUAL_FALLBACK';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'RAZORPAY_BANK'
      AND enumtypid = 'verification_method'::regtype
  ) THEN
    ALTER TYPE verification_method ADD VALUE 'RAZORPAY_BANK';
  END IF;
END $$;

-- Ensure projection columns exist on rider_documents.
ALTER TABLE public.rider_documents
  ADD COLUMN IF NOT EXISTS last_verification_id text NULL,
  ADD COLUMN IF NOT EXISTS last_provider_reference text NULL,
  ADD COLUMN IF NOT EXISTS extracted_data_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill PAN doc_number from extracted_data_summary / metadata.
UPDATE public.rider_documents d
SET
  doc_number = upper(
    coalesce(
      nullif(btrim(d.doc_number), ''),
      nullif(btrim(d.extracted_data_summary #>> '{verifiedData,pan}'), ''),
      nullif(btrim(d.extracted_data_summary #>> '{verified_data,pan}'), ''),
      nullif(btrim(d.metadata->>'panNumber'), '')
    )
  ),
  metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
    'panNumber',
    upper(
      coalesce(
        nullif(btrim(d.doc_number), ''),
        nullif(btrim(d.extracted_data_summary #>> '{verifiedData,pan}'), ''),
        nullif(btrim(d.extracted_data_summary #>> '{verified_data,pan}'), ''),
        nullif(btrim(d.metadata->>'panNumber'), '')
      )
    )
  ),
  updated_at = now()
WHERE d.doc_type::text = 'pan'
  AND (
    d.doc_number IS NULL
    OR btrim(d.doc_number) = ''
    OR d.doc_number = '?'
  )
  AND upper(
    coalesce(
      nullif(btrim(d.extracted_data_summary #>> '{verifiedData,pan}'), ''),
      nullif(btrim(d.extracted_data_summary #>> '{verified_data,pan}'), ''),
      nullif(btrim(d.metadata->>'panNumber'), '')
    )
  ) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$';

-- Mirror PAN onto riders.pan_number (+ name/dob from summary when missing).
UPDATE public.riders r
SET
  pan_number = coalesce(r.pan_number, d.doc_number),
  name = coalesce(
    nullif(btrim(r.name), ''),
    nullif(btrim(d.extracted_name), ''),
    nullif(btrim(d.extracted_data_summary #>> '{verifiedData,registered_name}'), ''),
    nullif(btrim(d.extracted_data_summary #>> '{verifiedData,name}'), '')
  ),
  dob = coalesce(
    r.dob,
    d.extracted_dob,
    CASE
      WHEN (d.extracted_data_summary #>> '{verifiedData,dob}') ~ '^\d{4}-\d{2}-\d{2}'
        THEN (d.extracted_data_summary #>> '{verifiedData,dob}')::date
      ELSE NULL
    END
  ),
  updated_at = now()
FROM public.rider_documents d
WHERE d.rider_id = r.id
  AND d.doc_type::text = 'pan'
  AND r.deleted_at IS NULL
  AND d.doc_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
  AND (
    r.pan_number IS NULL
    OR btrim(r.pan_number) = ''
    OR r.name IS NULL
    OR btrim(r.name) = ''
    OR r.dob IS NULL
  )
  -- Skip unique conflicts: only fill empty pan_number, never overwrite another rider's PAN.
  AND NOT EXISTS (
    SELECT 1
    FROM public.riders o
    WHERE o.deleted_at IS NULL
      AND o.id <> r.id
      AND o.pan_number IS NOT NULL
      AND upper(btrim(o.pan_number)) = upper(btrim(d.doc_number))
  );

-- Backfill DL / RC doc_number from summary when empty.
UPDATE public.rider_documents d
SET
  doc_number = coalesce(
    nullif(btrim(d.doc_number), ''),
    nullif(btrim(d.extracted_data_summary #>> '{verifiedData,dl_number}'), ''),
    nullif(btrim(d.metadata->>'dlNumber'), '')
  ),
  updated_at = now()
WHERE d.doc_type::text IN ('dl', 'dl_front', 'dl_back')
  AND (d.doc_number IS NULL OR btrim(d.doc_number) = '')
  AND coalesce(
    nullif(btrim(d.extracted_data_summary #>> '{verifiedData,dl_number}'), ''),
    nullif(btrim(d.metadata->>'dlNumber'), '')
  ) IS NOT NULL;

UPDATE public.rider_documents d
SET
  doc_number = coalesce(
    nullif(btrim(d.doc_number), ''),
    nullif(btrim(d.extracted_data_summary #>> '{verifiedData,reg_no}'), ''),
    nullif(btrim(d.metadata->>'rcNumber'), '')
  ),
  updated_at = now()
WHERE d.doc_type::text = 'rc'
  AND (d.doc_number IS NULL OR btrim(d.doc_number) = '')
  AND coalesce(
    nullif(btrim(d.extracted_data_summary #>> '{verifiedData,reg_no}'), ''),
    nullif(btrim(d.metadata->>'rcNumber'), '')
  ) IS NOT NULL;

-- Relabel agent dashboard Cashfree verifies that were stored as APP_VERIFIED
-- (UI wrongly showed "through app"). Only touch rows with an agent verifier.
UPDATE public.rider_documents
SET
  verification_method = 'CASHFREE_AUTO'::verification_method,
  extracted_data_summary = coalesce(extracted_data_summary, '{}'::jsonb) || jsonb_build_object(
    'method', 'CASHFREE_AUTO',
    'source', 'rider_dashboard_electronic'
  ),
  updated_at = now()
WHERE verification_method = 'APP_VERIFIED'::verification_method
  AND verified = true
  AND verifier_user_id IS NOT NULL
  AND (
    coalesce(extracted_data_summary->>'provider', '') = 'cashfree'
    OR extracted_data_summary #>> '{verifiedData,pan}' IS NOT NULL
    OR last_verification_id IS NOT NULL
  );
