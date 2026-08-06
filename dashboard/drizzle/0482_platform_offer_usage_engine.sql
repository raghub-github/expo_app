-- Mirror of backend/drizzle/0492_platform_offer_usage_engine.sql
-- Platform offer usage limits, consume modes, and redemption ledger.

ALTER TABLE public.billing_platform_offers
  ADD COLUMN IF NOT EXISTS max_uses_total integer,
  ADD COLUMN IF NOT EXISTS max_uses_per_user integer,
  ADD COLUMN IF NOT EXISTS max_uses_per_day integer,
  ADD COLUMN IF NOT EXISTS max_uses_per_month integer,
  ADD COLUMN IF NOT EXISTS consume_mode text NOT NULL DEFAULT 'ON_PLACED',
  ADD COLUMN IF NOT EXISTS restore_on_cancel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS restore_on_refund boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_platform_offers_consume_mode_chk'
  ) THEN
    ALTER TABLE public.billing_platform_offers
      ADD CONSTRAINT billing_platform_offers_consume_mode_chk
      CHECK (consume_mode IN ('ON_PLACED', 'ON_DELIVERED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_offer_usages (
  id                bigserial PRIMARY KEY,
  platform_offer_id bigint NOT NULL REFERENCES public.billing_platform_offers(id) ON DELETE CASCADE,
  customer_id       bigint NOT NULL,
  order_id          bigint,
  order_id_text     text,
  status            text NOT NULL DEFAULT 'reserved',
  applied_at        timestamptz NOT NULL DEFAULT now(),
  consumed_at       timestamptz,
  cancelled_at      timestamptz,
  refunded_at       timestamptz,
  expired_at        timestamptz,
  discount_amount   numeric(14, 4) NOT NULL DEFAULT 0,
  consumed_budget   numeric(14, 4) NOT NULL DEFAULT 0,
  usage_count       integer NOT NULL DEFAULT 1,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_offer_usages_status_chk
    CHECK (status IN ('reserved', 'consumed', 'cancelled', 'refunded', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_offer_usages_offer_order_uidx
  ON public.platform_offer_usages (platform_offer_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_offer_usages_offer_order_text_uidx
  ON public.platform_offer_usages (platform_offer_id, order_id_text)
  WHERE order_id_text IS NOT NULL AND length(trim(order_id_text)) > 0;

CREATE INDEX IF NOT EXISTS platform_offer_usages_offer_customer_idx
  ON public.platform_offer_usages (platform_offer_id, customer_id);

CREATE INDEX IF NOT EXISTS platform_offer_usages_customer_status_idx
  ON public.platform_offer_usages (customer_id, status);

CREATE INDEX IF NOT EXISTS platform_offer_usages_offer_status_applied_idx
  ON public.platform_offer_usages (platform_offer_id, status, applied_at);

UPDATE public.billing_platform_offers
SET budget_used = GREATEST(0, LEAST(COALESCE(budget_used, 0), COALESCE(budget_total, budget_used)))
WHERE budget_total IS NOT NULL
  AND budget_total::numeric > 0
  AND COALESCE(budget_used, 0) > budget_total::numeric;

UPDATE public.billing_platform_offers
SET budget_used = 0
WHERE COALESCE(budget_used, 0) < 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_platform_offers_budget_used_nonneg_chk'
  ) THEN
    ALTER TABLE public.billing_platform_offers
      ADD CONSTRAINT billing_platform_offers_budget_used_nonneg_chk
      CHECK (budget_used IS NULL OR budget_used::numeric >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_platform_offers_budget_used_cap_chk'
  ) THEN
    ALTER TABLE public.billing_platform_offers
      ADD CONSTRAINT billing_platform_offers_budget_used_cap_chk
      CHECK (
        budget_total IS NULL
        OR budget_total::numeric <= 0
        OR budget_used IS NULL
        OR budget_used::numeric <= budget_total::numeric + 0.0001
      );
  END IF;
END $$;

INSERT INTO public.platform_offer_usages (
  platform_offer_id, customer_id, order_id, order_id_text, status,
  applied_at, consumed_at, discount_amount, consumed_budget, usage_count, metadata
)
SELECT
  oa.platform_offer_id,
  COALESCE(oc.customer_id, 0),
  oa.order_id,
  oc.order_id,
  'consumed',
  oa.created_at,
  oa.created_at,
  COALESCE(oa.discount_amount, 0),
  COALESCE(oa.discount_amount, 0),
  1,
  jsonb_build_object('backfilled_from', 'offer_order_applications', 'application_id', oa.id)
FROM public.offer_order_applications oa
LEFT JOIN public.orders_core oc ON oc.id = oa.order_id
WHERE oa.offer_source = 'PLATFORM'
  AND oa.platform_offer_id IS NOT NULL
  AND COALESCE(oc.customer_id, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.platform_offer_usages u
    WHERE u.platform_offer_id = oa.platform_offer_id
      AND u.order_id IS NOT DISTINCT FROM oa.order_id
  );
