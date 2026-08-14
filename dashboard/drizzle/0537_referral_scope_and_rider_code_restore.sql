-- =============================================================================
-- 0537 — Merchant qualification scope (catalog only)
-- Depends on 0470 + 0471. 0536 merchant enum optional.
-- Idempotent. No table rewrite. No rider/customer/merchant row backfill.
--
-- I/O impact:
--   * ADD COLUMN ... DEFAULT on referral_settings (1-row singleton) — PG 11+
--     constant defaults do not rewrite the table
--   * CHECK constraint — catalog only
-- =============================================================================

ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS merchant_qualification_scope TEXT NOT NULL DEFAULT 'ALL_CHILD_STORES';

ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS merchant_qualification_store_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[];

ALTER TABLE referral_settings
  DROP CONSTRAINT IF EXISTS referral_settings_merchant_qual_scope_check;

ALTER TABLE referral_settings
  ADD CONSTRAINT referral_settings_merchant_qual_scope_check
  CHECK (merchant_qualification_scope IN ('ALL_CHILD_STORES', 'SINGLE_STORE', 'SELECTED_STORES'));

COMMENT ON COLUMN referral_settings.merchant_qualification_scope IS
  'How child-store activity aggregates to a referred parent merchant. Default ALL_CHILD_STORES.';
