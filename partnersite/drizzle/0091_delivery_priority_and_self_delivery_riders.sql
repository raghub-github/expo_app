-- ============================================================================
-- Delivery priority and self-delivery riders
-- - merchant_store_settings: add delivery_priority for explicit GATIMITRA | SELF
-- - merchant_store_self_delivery_riders: store rider details when store uses own delivery
-- ============================================================================

-- 1. Optional column: delivery_priority (can derive from self_delivery; useful for audit/display)
ALTER TABLE public.merchant_store_settings
  ADD COLUMN IF NOT EXISTS delivery_priority TEXT DEFAULT 'GATIMITRA';

COMMENT ON COLUMN public.merchant_store_settings.delivery_priority IS 'GATIMITRA = platform riders, SELF = merchant own riders';

-- 2. Self-delivery riders: when delivery_priority = SELF, merchant can add rider details
CREATE TABLE IF NOT EXISTS public.merchant_store_self_delivery_riders (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,

  rider_name TEXT NOT NULL,
  rider_mobile TEXT NOT NULL,
  rider_email TEXT,
  vehicle_number TEXT,

  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_self_delivery_riders_store_id_idx
  ON public.merchant_store_self_delivery_riders(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_self_delivery_riders_is_active_idx
  ON public.merchant_store_self_delivery_riders(store_id, is_active) WHERE is_active = TRUE;

COMMENT ON TABLE public.merchant_store_self_delivery_riders IS 'Rider details for stores using self-delivery (delivery_priority = SELF).';
