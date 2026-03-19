ALTER TABLE public.merchant_store_agreement_acceptances
  ADD COLUMN IF NOT EXISTS digital_signature_confirmed boolean NOT NULL DEFAULT false;

