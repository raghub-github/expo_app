-- Rollback 0454 (optional — leaves policies intact by default; only clears 0454 notes)
-- Prefer flipping Policy Center mode rather than deleting rows.

UPDATE public.verification_policies
SET notes = COALESCE(notes, '')
WHERE subject_type = 'rider'
  AND document_kind = 'aadhaar_digilocker'
  AND notes LIKE '%No Karza/API Setu%';
