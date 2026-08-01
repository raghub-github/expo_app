-- Migration: 0464_gmmc1026_fssai_reject_reset_for_retest
-- Purpose:
--   Reset FSSAI document rejection for Pratap The Dhabba store (public id GMMC1026)
--   so ops can reject again and verify:
--     1) rejection email is sent to the merchant
--     2) partner site shows Fix / resubmit via store_verification_step_rejections
--
-- Why: An earlier FSSAI reject may have left merchant_store_documents.fssai_rejection_reason
-- set without a clean pending state (and/or without an open step-4 rejection row), so partner
-- All Stores stayed on "Under review" with no resubmit path and the reject email never fired
-- under the new per-document email path.
--
-- Scope: GMMC1026 only (child store_id). Parent GMMP* ids are not modified.
-- After apply: open dashboard Step 4 → Reject FSSAI again → check toast/email + partner Fix CTA.

-- ---------------------------------------------------------------------------
-- 0) Target store(s)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _0464_fssai_reset_targets ON COMMIT DROP AS
SELECT ms.id AS store_db_id, ms.store_id AS store_public_id
FROM merchant_stores ms
WHERE ms.deleted_at IS NULL
  AND ms.store_id = 'GMMC1026';

-- ---------------------------------------------------------------------------
-- 1) Clear FSSAI reject → pending / unverified (re-rejectable in dashboard)
-- ---------------------------------------------------------------------------
UPDATE merchant_store_documents msd
SET
  fssai_is_verified = false,
  fssai_verified_at = NULL,
  fssai_verified_by = NULL,
  fssai_rejection_reason = NULL,
  step4_rejection_details = COALESCE(msd.step4_rejection_details, '{}'::jsonb) - 'fssai',
  step4_resubmission_flags = jsonb_set(
    COALESCE(msd.step4_resubmission_flags, '{}'::jsonb),
    '{fssai}',
    'false'::jsonb,
    true
  ),
  updated_at = now()
FROM _0464_fssai_reset_targets t
WHERE msd.store_id = t.store_db_id;

-- Ensure a documents row exists for the store (noop if already present).
INSERT INTO merchant_store_documents (store_id)
SELECT t.store_db_id
FROM _0464_fssai_reset_targets t
ON CONFLICT (store_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Clear open / stale step-4 rejection so partner Fix banner hides until
--    the next dashboard document reject recreates it (with email).
-- ---------------------------------------------------------------------------
DELETE FROM store_verification_step_rejections r
USING _0464_fssai_reset_targets t
WHERE r.store_id = t.store_db_id
  AND r.step_number = 4;

-- ---------------------------------------------------------------------------
-- 3) Clear agent step-4 verification so overview shows action required again.
-- ---------------------------------------------------------------------------
DELETE FROM store_verification_steps s
USING _0464_fssai_reset_targets t
WHERE s.store_id = t.store_db_id
  AND s.step_number = 4;

-- Optional visibility check (safe in migration runners that print notices):
DO $$
DECLARE
  n int;
BEGIN
  SELECT COUNT(*) INTO n FROM _0464_fssai_reset_targets;
  RAISE NOTICE '0464_gmmc1026_fssai_reject_reset_for_retest: matched % store(s) with store_id=GMMC1026', n;
END $$;
