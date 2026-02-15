-- Dynamic merchant agreement templates + per-store digital acceptance.
-- Safe additive migration.

CREATE TABLE IF NOT EXISTS public.merchant_agreement_templates (
  id bigserial PRIMARY KEY,
  template_key text NOT NULL,
  title text NOT NULL,
  version text NOT NULL,
  content_markdown text NOT NULL,
  pdf_url text NULL,
  applies_to jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by integer NULL,
  updated_by integer NULL,
  CONSTRAINT merchant_agreement_templates_key_version_uniq UNIQUE (template_key, version)
);

CREATE INDEX IF NOT EXISTS merchant_agreement_templates_active_idx
  ON public.merchant_agreement_templates (is_active, effective_from DESC);

CREATE INDEX IF NOT EXISTS merchant_agreement_templates_key_idx
  ON public.merchant_agreement_templates (template_key);

CREATE TABLE IF NOT EXISTS public.merchant_store_agreement_acceptances (
  id bigserial PRIMARY KEY,
  store_id bigint NOT NULL UNIQUE,
  template_id bigint NULL,
  template_key text NOT NULL,
  template_version text NOT NULL,
  template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_pdf_url text NULL,
  signer_name text NOT NULL,
  signer_email text NULL,
  signer_phone text NULL,
  signature_data_url text NOT NULL,
  signature_hash text NOT NULL,
  terms_accepted boolean NOT NULL DEFAULT false,
  contract_read_confirmed boolean NOT NULL DEFAULT false,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_ip text NULL,
  user_agent text NULL,
  acceptance_source text NOT NULL DEFAULT 'CHILD_ONBOARDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by integer NULL,
  updated_by integer NULL,
  CONSTRAINT merchant_store_agreement_acceptances_store_id_fkey
    FOREIGN KEY (store_id) REFERENCES public.merchant_stores (id) ON DELETE CASCADE,
  CONSTRAINT merchant_store_agreement_acceptances_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.merchant_agreement_templates (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS merchant_store_agreement_acceptances_template_idx
  ON public.merchant_store_agreement_acceptances (template_id);

CREATE INDEX IF NOT EXISTS merchant_store_agreement_acceptances_store_idx
  ON public.merchant_store_agreement_acceptances (store_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS merchant_store_agreement_acceptances_hash_idx
  ON public.merchant_store_agreement_acceptances (signature_hash);

-- Seed a default agreement template.
INSERT INTO public.merchant_agreement_templates (
  template_key,
  title,
  version,
  content_markdown,
  pdf_url,
  applies_to,
  is_active
)
VALUES (
  'DEFAULT_CHILD_ONBOARDING_AGREEMENT',
  'Merchant Partner Agreement',
  'v1',
  'Terms and Conditions - Partnership Plan\n\n1) Onboarding benefits (if any) are valid only within specified eligibility and timeline.\n2) Merchant is responsible for operational readiness, menu accuracy, pricing, and legal compliance.\n3) Platform charges, commission, and support fees apply as per active commercial terms.\n4) Settlement and payout schedules follow platform policy and applicable law.\n5) Merchant shall avoid discouraged practices including pricing disparity and off-platform diversion.\n6) Contract terms may vary by city, store type, plan, and operational factors.\n7) Merchant agrees to digital acceptance, audit logging, and policy updates communicated by platform.\n\nBy signing digitally, merchant confirms reading and accepting all applicable terms and annexures.',
  NULL,
  '{}'::jsonb,
  true
)
ON CONFLICT (template_key, version) DO NOTHING;
