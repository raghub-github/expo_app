-- 0453 · Document step_rejection_detail v2 shape (fields[] metadata).
-- Existing v1 JSON (rejected_fields[]) remains valid; readers normalize to v2.

COMMENT ON COLUMN public.store_verification_step_rejections.step_rejection_detail IS
  'JSONB rejection metadata. v1: {version:1, rejected_fields:string[], note?}. '
  'v2: {version:2, fields:[{fieldKey,fieldType,label,previousValue,rejectionReason,validationRules?,uploadConfig?,selectOptions?,currentStatus?}], '
  'rejected_fields:string[], note?, last_resubmitted?}. Clients must normalize v1→v2 on read.';

COMMENT ON COLUMN public.store_verification_step_rejection_history.step_rejection_detail IS
  'JSONB rejection metadata snapshot (same v1/v2 shapes as store_verification_step_rejections.step_rejection_detail).';
