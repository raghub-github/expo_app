-- Merchant (Mx) onboarding agreement templates — table + seed full partnership terms.
-- Partnersite onboarding reads the active row (no hardcoded agreement text).

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

-- Deactivate any legacy short seed so only v2 is active for onboarding.
UPDATE public.merchant_agreement_templates
SET is_active = false, effective_to = now(), updated_at = now()
WHERE template_key = 'DEFAULT_CHILD_ONBOARDING_AGREEMENT'
  AND version = 'v1'
  AND length(content_markdown) < 500;

INSERT INTO public.merchant_agreement_templates (
  template_key,
  title,
  version,
  content_markdown,
  pdf_url,
  applies_to,
  is_active,
  effective_from
)
VALUES (
  'DEFAULT_CHILD_ONBOARDING_AGREEMENT',
  'Merchant Partner Agreement',
  'v2',
  $agreement$
Terms and Conditions
Partnership Plan

You hereby agree and acknowledge that as part of the Plan and in consideration of the agreed onboarding fees, the Platform will provide onboarding services in accordance with the following terms and conditions:

(a) The one-time photoshoot service of up to thirty (30) images of your menu dishes through authorised third-party service providers will be valid for a period of ninety (90) days from the date your restaurant goes live on the Platform for food ordering and delivery services. You will not be able to avail this photoshoot service if the same is not availed within the said ninety (90) days period.

(b) For the photoshoot services, the designated photoshoot personnel will be available at your restaurant location at the date and time as communicated by you for a maximum duration of three (3) hours. It will be your responsibility to ensure all dishes are prepared and ready for the shoot prior to or immediately upon the arrival of the photoshoot personnel for the photoshoot personnel to complete the photoshoot within the stipulated timeframe.

(c) You acknowledge and agree that rescheduling the photoshoot is allowed/permissible only once.

(d) You acknowledge and agree that the one-time ads credit worth up to INR 1,500/- that you receive under the Plan is subject to an eligibility criteria which will be communicated to you by the Platform from time to time. If your restaurant meets this criteria you will be able to claim this discount. The discount must be utilized within thirty (30) days from the date your restaurant goes live under this plan.

(e) The Plan only offers additional benefits for your restaurant page and the Platform does not provide any warranty or guarantee towards the reach, engagement and/or performance for your restaurant.

(f) You agree and acknowledge that in the event your service fee is revised or reduced from the agreed service fee, the Platform reserves the right to void the unclaimed benefits as a part of the Plan.

(g) The offering with respect to partner discounts shall be governed by separate terms and conditions as may be communicated to you from time to time.

(h) You have an option to make an upfront payment of the onboarding fee at time of onboarding or reduction from your weekly payouts for food ordering and delivery services in five (5) equal installments.

1) In case you make an upfront payment of the onboarding fee at the time of onboarding, in the event of a payment failure on the platform, the amount of the onboarding fee will be refunded to your source account within three (3) business days. Additionally, if your restaurant is not successfully onboarded on the Platform within fifteen (15) days from the date of receipt of payment of the onboarding fee, due to reasons not attributable to you, the onboarding fee will be refunded to you.

2) In case you choose a post-paid model of payment of onboarding fee, i.e., by way of reduction from your weekly payouts, the onboarding fee will reflect separately and identifiable in your statement of account.

3) For clarity, the onboarding fee payable for the onboarding services is independent of the fee payable by you to the Platform under the terms and conditions for the food ordering and delivery services.

4) The Platform shall raise tax invoice as per GST laws for such onboarding fee. If as per the applicable tax laws, You are liable to deduct taxes at source ("TDS") on the Onboarding Fees payable to the Platform, then You shall deposit the applicable TDS from your own pocket and shall claim a refund of such TDS from the Platform upon submission of TDS certificate within time stipulated under the applicable law.

5) If you already have an existing restaurant on the Platform and are adding a new restaurant, a reduced onboarding fee will be applicable.
$agreement$,
  NULL,
  '{}'::jsonb,
  true,
  now()
)
ON CONFLICT (template_key, version) DO UPDATE SET
  title = EXCLUDED.title,
  content_markdown = EXCLUDED.content_markdown,
  is_active = true,
  effective_to = NULL,
  effective_from = now(),
  updated_at = now();

-- Ensure only one active template for the default key.
UPDATE public.merchant_agreement_templates
SET is_active = false, effective_to = COALESCE(effective_to, now()), updated_at = now()
WHERE template_key = 'DEFAULT_CHILD_ONBOARDING_AGREEMENT'
  AND version <> 'v2'
  AND is_active = true;

COMMENT ON TABLE public.merchant_agreement_templates IS 'Editable Mx onboarding agreement templates (super-admin CRUD).';
