-- 0459: Enable Cashfree hybrid instant verification for rider DL + RC.
--
-- Identity: driving_licence (name/DOB still cross-checked vs Aadhaar).
-- Vehicle: vehicle_rc (authenticity only — no Aadhaar owner match).
-- Mode = hybrid → Cashfree first; photo upload fallback on failure.

UPDATE public.verification_policies
SET
  mode = 'hybrid'::verification_policy_mode,
  provider = 'cashfree'::verification_provider_kind,
  auto_approve = TRUE,
  fallback_to_manual = TRUE,
  timeout_ms = COALESCE(timeout_ms, 15000),
  retry_limit = COALESCE(retry_limit, 2),
  retry_backoff_seconds = COALESCE(retry_backoff_seconds, 30),
  notes = COALESCE(notes, '') || ' | 0459: rider DL/RC Cashfree hybrid enabled',
  updated_at = NOW()
WHERE subject_type = 'rider'::verification_subject_kind
  AND document_kind IN (
    'driving_licence'::verification_document_kind,
    'vehicle_rc'::verification_document_kind
  )
  AND effective_to IS NULL;

-- Snapshot so verification_requests can reference the new policy version.
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
  '0459: enable Cashfree hybrid for rider driving_licence / vehicle_rc'
FROM public.verification_policies p
WHERE p.subject_type = 'rider'::verification_subject_kind
  AND p.document_kind IN (
    'driving_licence'::verification_document_kind,
    'vehicle_rc'::verification_document_kind
  )
  AND p.effective_to IS NULL;
