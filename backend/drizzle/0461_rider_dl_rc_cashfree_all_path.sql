-- 0461: Ensure rider DL/RC always hit Cashfree API (same as PAN).
--
-- Fixes:
-- 1) subject_filter must be {} — a non-empty filter without subjectFacts
--    silently skips Cashfree and returns policy manual (no Secure ID "All" row).
-- 2) Keep mode=hybrid + provider=cashfree (idempotent with 0459/0460).
--
-- Note: Cashfree merchant UI "Batch" tab only shows CSV uploads.
-- Individual API verifies appear under the "All" tab (same as PAN).

UPDATE public.verification_policies
SET
  mode = 'hybrid'::verification_policy_mode,
  provider = 'cashfree'::verification_provider_kind,
  auto_approve = TRUE,
  fallback_to_manual = TRUE,
  subject_filter = '{}'::jsonb,
  timeout_ms = COALESCE(timeout_ms, 15000),
  retry_limit = COALESCE(retry_limit, 2),
  retry_backoff_seconds = COALESCE(retry_backoff_seconds, 30),
  notes = COALESCE(notes, '') || ' | 0461: clear subject_filter so DL/RC always call Cashfree',
  updated_at = NOW()
WHERE subject_type = 'rider'::verification_subject_kind
  AND document_kind IN (
    'driving_licence'::verification_document_kind,
    'vehicle_rc'::verification_document_kind
  )
  AND effective_to IS NULL;

INSERT INTO public.verification_policy_versions
  (policy_id, version_number, policy_snapshot, changed_by, change_reason)
SELECT
  p.id,
  COALESCE(
    (
      SELECT MAX(v.version_number)
      FROM public.verification_policy_versions v
      WHERE v.policy_id = p.id
    ),
    0
  ) + 1,
  to_jsonb(p),
  NULL,
  '0461: rider DL/RC Cashfree path — empty subject_filter + hybrid'
FROM public.verification_policies p
WHERE p.subject_type = 'rider'::verification_subject_kind
  AND p.document_kind IN (
    'driving_licence'::verification_document_kind,
    'vehicle_rc'::verification_document_kind
  )
  AND p.effective_to IS NULL;
