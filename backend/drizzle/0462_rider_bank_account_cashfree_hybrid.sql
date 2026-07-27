-- 0462: Rider onboarding Step 4 — Cashfree bank account hybrid (account + IFSC).
--
-- Mode = hybrid → Cashfree /bank-account/sync first; slim manual form on failure.
-- subject_filter = {} so the call is never silently skipped.
-- Idempotent — safe to re-run.

INSERT INTO public.verification_policies (
  subject_type, document_kind, mode, provider, auto_approve,
  confidence_threshold, retry_limit, retry_backoff_seconds, timeout_ms,
  fallback_to_manual, subject_filter, effective_from, notes
)
SELECT
  'rider'::verification_subject_kind,
  'bank_account'::verification_document_kind,
  'hybrid'::verification_policy_mode,
  'cashfree'::verification_provider_kind,
  TRUE,
  NULL,
  2,
  30,
  15000,
  TRUE,
  '{}'::jsonb,
  NOW(),
  '0462: rider Step 4 bank — Cashfree hybrid (account + IFSC)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.verification_policies vp
  WHERE vp.subject_type = 'rider'::verification_subject_kind
    AND vp.document_kind = 'bank_account'::verification_document_kind
    AND vp.effective_to IS NULL
);

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
  notes = COALESCE(notes, '') || ' | 0462: rider bank_account Cashfree hybrid (account + IFSC)',
  updated_at = NOW()
WHERE subject_type = 'rider'::verification_subject_kind
  AND document_kind = 'bank_account'::verification_document_kind
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
  '0462: rider bank_account Cashfree hybrid — account number + IFSC'
FROM public.verification_policies p
WHERE p.subject_type = 'rider'::verification_subject_kind
  AND p.document_kind = 'bank_account'::verification_document_kind
  AND p.effective_to IS NULL;

-- Ensure Cashfree kill-switch for bank_account is enabled
INSERT INTO public.verification_switches
  (provider, document_kind, state, reason, tripped_by)
SELECT
  'cashfree'::verification_provider_kind,
  'bank_account'::verification_document_kind,
  'enabled'::verification_switch_state,
  '0462: enable Cashfree bank_account for rider onboarding',
  'migration_0462'
WHERE NOT EXISTS (
  SELECT 1 FROM public.verification_switches vs
  WHERE vs.provider = 'cashfree'::verification_provider_kind
    AND vs.document_kind = 'bank_account'::verification_document_kind
    AND vs.restored_at IS NULL
);

UPDATE public.verification_switches
SET
  state = 'enabled'::verification_switch_state,
  reason = COALESCE(reason, '') || ' | 0462 enabled',
  restored_at = NULL
WHERE provider = 'cashfree'::verification_provider_kind
  AND document_kind = 'bank_account'::verification_document_kind
  AND restored_at IS NULL
  AND state IS DISTINCT FROM 'enabled'::verification_switch_state;
