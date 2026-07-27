-- 0454: Rider Aadhaar Step 1 — Cashfree DigiLocker + Manual hybrid (no Karza/Setu)
--
-- Ensures rider `aadhaar_digilocker` policy + Cashfree switch rows exist.
-- Super Admin Policy Center controls mode:
--   auto    → DigiLocker only (fail blocks)
--   hybrid  → DigiLocker first, photo upload fallback
--   manual  → photo upload only
--
-- Idempotent — safe to re-run.

-- Rider Aadhaar DigiLocker policy (default manual until ops flips in Policy Center)
INSERT INTO public.verification_policies (
  subject_type, document_kind, mode, provider, auto_approve,
  confidence_threshold, retry_limit, retry_backoff_seconds, timeout_ms,
  fallback_to_manual, subject_filter, effective_from, notes
)
SELECT
  'rider'::verification_subject_kind,
  'aadhaar_digilocker'::verification_document_kind,
  'manual'::verification_policy_mode,
  NULL,
  TRUE,
  NULL,
  2,
  30,
  15000,
  TRUE,
  '{}'::jsonb,
  NOW(),
  'Rider Step 1 Aadhaar — Cashfree DigiLocker (auto/hybrid) or manual photo upload. No Karza/API Setu.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.verification_policies vp
  WHERE vp.subject_type = 'rider'
    AND vp.document_kind = 'aadhaar_digilocker'
    AND vp.effective_to IS NULL
);

-- Snapshot for the rider aadhaar_digilocker policy if missing
INSERT INTO public.verification_policy_versions
  (policy_id, version_number, policy_snapshot, changed_by, change_reason)
SELECT
  p.id,
  1,
  to_jsonb(p),
  NULL,
  '0454 rider aadhaar digilocker hybrid seed'
FROM public.verification_policies p
WHERE p.subject_type = 'rider'
  AND p.document_kind = 'aadhaar_digilocker'
  AND p.effective_to IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.verification_policy_versions v
    WHERE v.policy_id = p.id AND v.version_number = 1
  );

-- Ensure Cashfree kill-switch row for aadhaar_digilocker is enabled
INSERT INTO public.verification_switches
  (provider, document_kind, state, reason, tripped_by)
SELECT
  'cashfree'::verification_provider_kind,
  'aadhaar_digilocker'::verification_document_kind,
  'enabled'::verification_switch_state,
  '0454 — DigiLocker available for rider hybrid onboarding',
  'seed'
WHERE NOT EXISTS (
  SELECT 1 FROM public.verification_switches vs
  WHERE vs.provider = 'cashfree'
    AND vs.document_kind = 'aadhaar_digilocker'
    AND vs.restored_at IS NULL
);

COMMENT ON COLUMN public.verification_policies.document_kind IS
  'Includes aadhaar_digilocker for Cashfree DigiLocker Aadhaar (rider + merchant). Manual photo path uses classic document upload when policy mode=manual or hybrid fallback.';
