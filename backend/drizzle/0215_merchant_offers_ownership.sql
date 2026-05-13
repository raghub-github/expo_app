-- Migration 0215: Add ownership tracking columns to merchant_offers
-- Tracks who created/edited an offer, from which platform, with which role, and approval state.

ALTER TABLE merchant_offers
  ADD COLUMN IF NOT EXISTS created_source_platform TEXT NOT NULL DEFAULT 'MERCHANT_APP',
  ADD COLUMN IF NOT EXISTS updated_source_platform TEXT,
  ADD COLUMN IF NOT EXISTS created_by_role         TEXT NOT NULL DEFAULT 'MERCHANT',
  ADD COLUMN IF NOT EXISTS updated_by_role         TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id      BIGINT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id      BIGINT NULL,
  ADD COLUMN IF NOT EXISTS created_by_org_id       BIGINT NULL,
  ADD COLUMN IF NOT EXISTS managed_by_agent        BIGINT NULL,
  ADD COLUMN IF NOT EXISTS approved_by_admin       BIGINT NULL,
  ADD COLUMN IF NOT EXISTS approval_status         TEXT NOT NULL DEFAULT 'AUTO_APPROVED',
  ADD COLUMN IF NOT EXISTS approval_note           TEXT;

-- CHECK constraints
ALTER TABLE merchant_offers
  ADD CONSTRAINT merchant_offers_created_source_platform_chk CHECK (
    created_source_platform IN ('MERCHANT_APP','MERCHANT_PORTAL','ADMIN_DASHBOARD','AGENT_DASHBOARD','SYSTEM')
  ),
  ADD CONSTRAINT merchant_offers_updated_source_platform_chk CHECK (
    updated_source_platform IS NULL
    OR updated_source_platform IN ('MERCHANT_APP','MERCHANT_PORTAL','ADMIN_DASHBOARD','AGENT_DASHBOARD','SYSTEM')
  ),
  ADD CONSTRAINT merchant_offers_created_by_role_chk CHECK (
    created_by_role IN ('MERCHANT','AGENT','ADMIN','SYSTEM')
  ),
  ADD CONSTRAINT merchant_offers_updated_by_role_chk CHECK (
    updated_by_role IS NULL
    OR updated_by_role IN ('MERCHANT','AGENT','ADMIN','SYSTEM')
  ),
  ADD CONSTRAINT merchant_offers_approval_status_chk CHECK (
    approval_status IN ('PENDING','AUTO_APPROVED','APPROVED','REJECTED')
  );

-- Indexes for ownership queries and analytics
CREATE INDEX IF NOT EXISTS merchant_offers_created_source_platform_idx
  ON merchant_offers(created_source_platform);

CREATE INDEX IF NOT EXISTS merchant_offers_created_by_role_idx
  ON merchant_offers(created_by_role);

CREATE INDEX IF NOT EXISTS merchant_offers_approval_status_idx
  ON merchant_offers(approval_status);

CREATE INDEX IF NOT EXISTS merchant_offers_managed_by_agent_idx
  ON merchant_offers(managed_by_agent) WHERE managed_by_agent IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_offers_approved_by_admin_idx
  ON merchant_offers(approved_by_admin) WHERE approved_by_admin IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_offers_created_by_user_id_idx
  ON merchant_offers(created_by_user_id) WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_offers_created_by_org_id_idx
  ON merchant_offers(created_by_org_id) WHERE created_by_org_id IS NOT NULL;

-- Backfill existing rows
UPDATE merchant_offers
SET
  created_source_platform = 'MERCHANT_APP',
  created_by_role         = 'MERCHANT',
  approval_status         = 'AUTO_APPROVED'
WHERE created_source_platform IS NULL OR created_source_platform = '';

COMMENT ON COLUMN merchant_offers.created_source_platform IS 'Platform from which this offer was created: MERCHANT_APP | MERCHANT_PORTAL | ADMIN_DASHBOARD | AGENT_DASHBOARD | SYSTEM';
COMMENT ON COLUMN merchant_offers.created_by_role IS 'Role of the actor who created this offer: MERCHANT | AGENT | ADMIN | SYSTEM';
COMMENT ON COLUMN merchant_offers.managed_by_agent IS 'User ID of agent managing this offer on behalf of merchant (set when created_by_role = AGENT)';
COMMENT ON COLUMN merchant_offers.approved_by_admin IS 'User ID of admin who approved this offer (set when approval_status = APPROVED)';
COMMENT ON COLUMN merchant_offers.approval_status IS 'PENDING | AUTO_APPROVED | APPROVED | REJECTED — merchant/system offers are AUTO_APPROVED; agent-created may require APPROVED';
COMMENT ON COLUMN merchant_offers.created_by_user_id IS 'Internal user ID (from auth system) who created this offer';
COMMENT ON COLUMN merchant_offers.updated_by_user_id IS 'Internal user ID who last updated this offer';
COMMENT ON COLUMN merchant_offers.created_by_org_id IS 'Organization ID if created in an org context (e.g. franchise, chain)';
