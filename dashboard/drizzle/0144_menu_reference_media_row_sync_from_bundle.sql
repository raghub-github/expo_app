-- Sync merchant_store_media_files.verification_status with per-image JSONB bundle (menu_reference_image_urls).
-- Fixes rows left as REJECTED while some bundle entries remain VERIFIED (e.g. after step-3 rejection backfill).
-- Aggregate rules match application logic: REUPLOADED counts as pending; all VERIFIED => row VERIFIED;
-- any REJECTED => row REJECTED; else PENDING. Clears verified_at / verified_by when row is not fully VERIFIED.

UPDATE public.merchant_store_media_files AS m
SET
  verification_status = v.new_status,
  verified_at = CASE WHEN v.new_status = 'VERIFIED' THEN m.verified_at ELSE NULL END,
  verified_by = CASE WHEN v.new_status = 'VERIFIED' THEN m.verified_by ELSE NULL END,
  updated_at = now()
FROM (
  SELECT
    m2.id,
    CASE
      WHEN BOOL_AND(
        (
          CASE
            WHEN jsonb_typeof(elem) = 'string' THEN 'PENDING'
            WHEN upper(coalesce(elem->>'verification_status', 'PENDING')) = 'REUPLOADED' THEN 'PENDING'
            ELSE upper(coalesce(elem->>'verification_status', 'PENDING'))
          END
        ) = 'VERIFIED'
      ) THEN 'VERIFIED'
      WHEN BOOL_OR(
        (
          CASE
            WHEN jsonb_typeof(elem) = 'string' THEN 'PENDING'
            WHEN upper(coalesce(elem->>'verification_status', 'PENDING')) = 'REUPLOADED' THEN 'PENDING'
            ELSE upper(coalesce(elem->>'verification_status', 'PENDING'))
          END
        ) = 'REJECTED'
      ) THEN 'REJECTED'
      ELSE 'PENDING'
    END AS new_status
  FROM public.merchant_store_media_files m2
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(m2.menu_reference_image_urls, '[]'::jsonb)) AS elem
  WHERE m2.media_scope = 'MENU_REFERENCE'
    AND m2.source_entity = 'ONBOARDING_MENU_IMAGE'
    AND m2.is_active = true
    AND m2.deleted_at IS NULL
    AND jsonb_typeof(coalesce(m2.menu_reference_image_urls, '[]'::jsonb)) = 'array'
    AND jsonb_array_length(coalesce(m2.menu_reference_image_urls, '[]'::jsonb)) > 0
  GROUP BY m2.id
) AS v
WHERE m.id = v.id
  AND (
    m.verification_status IS DISTINCT FROM v.new_status
    OR (
      v.new_status <> 'VERIFIED'
      AND (m.verified_at IS NOT NULL OR m.verified_by IS NOT NULL)
    )
  );

COMMENT ON COLUMN public.merchant_store_media_files.verification_status IS
  'Row-level aggregate for MENU_REFERENCE. For ONBOARDING_MENU_IMAGE with menu_reference_image_urls, should match bundle: all entries VERIFIED => VERIFIED; any REJECTED => REJECTED; else PENDING. Per-image truth lives in JSONB.';
