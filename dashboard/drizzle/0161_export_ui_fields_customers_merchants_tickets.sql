-- ============================================================================
-- Align database with dashboard ticket export field checklist (ticket / contact /
-- company). All new columns are nullable so existing rows stay valid.
-- Run after 0160_unified_tickets_export_columns.sql (or any env with unified_tickets).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. unified_tickets — fields shown in export UI (beyond 0020 / 0160)
-- ----------------------------------------------------------------------------
ALTER TABLE public.unified_tickets ADD COLUMN IF NOT EXISTS association_type TEXT;
ALTER TABLE public.unified_tickets ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE public.unified_tickets ADD COLUMN IF NOT EXISTS agent_interaction_count INTEGER;
ALTER TABLE public.unified_tickets ADD COLUMN IF NOT EXISTS customer_interaction_count INTEGER;

COMMENT ON COLUMN public.unified_tickets.association_type IS 'Optional label for export (Association type); can mirror ticket_type/source or custom value.';
COMMENT ON COLUMN public.unified_tickets.internal_notes IS 'Agent-only / internal notes for export (Internal notes column).';
COMMENT ON COLUMN public.unified_tickets.agent_interaction_count IS 'Optional cache of agent-side message/interaction count for export.';
COMMENT ON COLUMN public.unified_tickets.customer_interaction_count IS 'Optional cache of customer-side message/interaction count for export.';

-- ----------------------------------------------------------------------------
-- 2. customers — contact export columns (CRM-style; map UI labels)
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS work_phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS facebook_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS twitter_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS time_zone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contact_tags TEXT[];
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS unique_external_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS twitter_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS twitter_follower_count INTEGER;

COMMENT ON COLUMN public.customers.work_phone IS 'Work phone for ticket export (Contact: Work phone).';
COMMENT ON COLUMN public.customers.facebook_id IS 'Facebook profile/page id for export.';
COMMENT ON COLUMN public.customers.twitter_id IS 'Twitter/X handle or id for export.';
COMMENT ON COLUMN public.customers.time_zone IS 'IANA or display time zone for export.';
COMMENT ON COLUMN public.customers.contact_tags IS 'Contact-level tags (distinct from ticket tags).';
COMMENT ON COLUMN public.customers.job_title IS 'Contact job title (export "Title").';
COMMENT ON COLUMN public.customers.unique_external_id IS 'Third-party unique id for export.';
COMMENT ON COLUMN public.customers.twitter_verified IS 'Twitter verified flag for export.';
COMMENT ON COLUMN public.customers.twitter_follower_count IS 'Twitter follower count for export.';

CREATE INDEX IF NOT EXISTS customers_contact_tags_gin_idx
  ON public.customers USING GIN (contact_tags)
  WHERE contact_tags IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_unique_external_id_active_uidx
  ON public.customers (unique_external_id)
  WHERE unique_external_id IS NOT NULL AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. merchant_parents — company domains for export (Company: Company Domains)
-- ----------------------------------------------------------------------------
ALTER TABLE public.merchant_parents ADD COLUMN IF NOT EXISTS company_domains TEXT[];

COMMENT ON COLUMN public.merchant_parents.company_domains IS 'Business domains for ticket export when ticket is tied to this parent (e.g. example.com, shop.example.com).';

CREATE INDEX IF NOT EXISTS merchant_parents_company_domains_gin_idx
  ON public.merchant_parents USING GIN (company_domains)
  WHERE company_domains IS NOT NULL;
