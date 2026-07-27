-- Rollback 0459: restore rider DL/RC policies to manual (provider cleared).

UPDATE public.verification_policies
SET
  mode = 'manual'::verification_policy_mode,
  provider = NULL,
  notes = COALESCE(notes, '') || ' | 0459 rollback: DL/RC back to manual',
  updated_at = NOW()
WHERE subject_type = 'rider'::verification_subject_kind
  AND document_kind IN (
    'driving_licence'::verification_document_kind,
    'vehicle_rc'::verification_document_kind
  )
  AND effective_to IS NULL;
