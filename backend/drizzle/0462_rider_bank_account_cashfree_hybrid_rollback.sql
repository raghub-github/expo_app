-- Rollback 0462: rider bank_account Cashfree hybrid

UPDATE public.verification_policies
SET
  mode = 'manual'::verification_policy_mode,
  provider = NULL,
  notes = REPLACE(
    REPLACE(notes, ' | 0462: rider bank_account Cashfree hybrid (account + IFSC)', ''),
    '0462: rider Step 4 bank — Cashfree hybrid (account + IFSC)',
    'Rider bank_account — manual'
  ),
  updated_at = NOW()
WHERE subject_type = 'rider'::verification_subject_kind
  AND document_kind = 'bank_account'::verification_document_kind
  AND effective_to IS NULL;

UPDATE public.verification_switches
SET
  reason = REPLACE(reason, ' | 0462 enabled', '')
WHERE provider = 'cashfree'::verification_provider_kind
  AND document_kind = 'bank_account'::verification_document_kind;
