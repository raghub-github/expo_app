-- 0458: Separate vehicle RC verification from Aadhaar identity matching.
--
-- RC is a vehicle ownership document; registered owner may legitimately differ
-- from the rider (family / fleet / rental). Prior onboarding logic marked RC
-- rows as Aadhaar name mismatch — heal those so riders are not stuck.
--
-- No schema drop: keep extracted_name / metadata.rcOwnerName for future
-- relationship / NOC / fleet authorization without redesign.

-- Clear identity-mismatch flags on RC docs that failed only after provider success.
UPDATE public.rider_documents
SET
  verified = TRUE,
  verification_status = 'auto_verified'::document_verification_status,
  verification_method = 'APP_VERIFIED'::verification_method,
  requires_manual_review = FALSE,
  rejected_reason = NULL,
  verified_at = COALESCE(verified_at, NOW()),
  metadata =
    (
      COALESCE(metadata, '{}'::jsonb)
      - 'crossCheckFailed'
    )
    || jsonb_build_object(
      'vehicleVerificationOnly', TRUE,
      'healedFromRcAadhaarMismatch', TRUE,
      'healedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
    || CASE
         WHEN COALESCE(NULLIF(trim(extracted_name), ''), '') <> ''
           THEN jsonb_build_object('rcOwnerName', trim(extracted_name))
         WHEN COALESCE(
           NULLIF(trim(metadata #>> '{autoVerification,extracted,name}'), ''),
           ''
         ) <> ''
           THEN jsonb_build_object(
             'rcOwnerName',
             trim(metadata #>> '{autoVerification,extracted,name}')
           )
         ELSE '{}'::jsonb
       END,
  extracted_name = COALESCE(
    NULLIF(trim(extracted_name), ''),
    NULLIF(trim(metadata #>> '{autoVerification,extracted,name}'), ''),
    extracted_name
  ),
  updated_at = NOW()
WHERE doc_type = 'rc'
  AND (
    COALESCE((metadata->>'crossCheckFailed')::boolean, FALSE) = TRUE
    OR lower(COALESCE(metadata #>> '{autoVerification,status}', '')) = 'mismatch'
  )
  AND (
    metadata->'autoVerification'->'providerVerifiedData' IS NOT NULL
    OR last_verification_id IS NOT NULL
    OR COALESCE(file_url, '') IN ('electronic_verified', 'pending_manual_after_mismatch')
  );

COMMENT ON COLUMN public.rider_documents.extracted_name IS
  'Person name from identity docs (Aadhaar/PAN/DL). For RC rows this is the registered vehicle owner (may differ from the rider) — vehicle verification only.';
