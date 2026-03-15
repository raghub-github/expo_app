-- ============================================================================
-- Agreement acceptances: store commission % and effective/expiry dates
-- So we can display and query what was agreed at signing (onboarding).
-- ============================================================================

ALTER TABLE public.merchant_store_agreement_acceptances
  ADD COLUMN IF NOT EXISTS commission_first_month_pct NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_from_second_month_pct NUMERIC(5, 2) DEFAULT 15,
  ADD COLUMN IF NOT EXISTS agreement_effective_from TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS agreement_effective_to TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN public.merchant_store_agreement_acceptances.commission_first_month_pct IS 'Commission % (on order value) for first month from go-live, as per contract at signing.';
COMMENT ON COLUMN public.merchant_store_agreement_acceptances.commission_from_second_month_pct IS 'Commission % (on order value) from second month onwards, as per contract at signing.';
COMMENT ON COLUMN public.merchant_store_agreement_acceptances.agreement_effective_from IS 'Date from which the agreement is effective (at signing).';
COMMENT ON COLUMN public.merchant_store_agreement_acceptances.agreement_effective_to IS 'Optional expiry/end date of the agreement terms.';
