-- Persist customer Terms + Privacy consent so it survives reinstall / new device login.
-- App compares legal_consent_pack_version to LEGAL_PACK_VERSION; re-prompt when bumped.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS legal_consent_pack_version TEXT,
  ADD COLUMN IF NOT EXISTS legal_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.customers.legal_consent_pack_version IS
  'Legal pack version accepted by the customer (e.g. 2026-06-21-v2.0).';

COMMENT ON COLUMN public.customers.legal_consent_at IS
  'Timestamp when the customer last accepted Terms + Privacy for legal_consent_pack_version.';

CREATE INDEX IF NOT EXISTS customers_legal_consent_pack_version_idx
  ON public.customers (legal_consent_pack_version)
  WHERE legal_consent_pack_version IS NOT NULL;
