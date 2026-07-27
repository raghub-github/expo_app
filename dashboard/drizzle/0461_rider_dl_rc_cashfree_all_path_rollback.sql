-- Rollback 0461: no destructive revert of hybrid mode (keep Cashfree on).
-- Only strips the 0461 note suffix if present.

UPDATE public.verification_policies
SET
  notes = REPLACE(notes, ' | 0461: clear subject_filter so DL/RC always call Cashfree', ''),
  updated_at = NOW()
WHERE subject_type = 'rider'::verification_subject_kind
  AND document_kind IN (
    'driving_licence'::verification_document_kind,
    'vehicle_rc'::verification_document_kind
  )
  AND effective_to IS NULL;
