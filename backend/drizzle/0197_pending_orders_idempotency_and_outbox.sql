-- 0197: Add idempotency key to pending_orders + new order_notifications outbox.
--
-- WHY:
--   1. `pending_orders` has no idempotency protection today. A rapid double-tap on
--      "Place order" or a retried POST /v1/orders/pending can create two separate
--      pending rows -> two Razorpay orders. We attach an Idempotency-Key (derived
--      client-side from the cart signature) to collapse duplicates per customer.
--   2. After placement we must notify merchant, rider pool, and customer. We persist
--      notification intents in the same transaction as the order so delivery is at
--      least-once and safe across crashes; a worker / realtime listener dispatches
--      them later.

BEGIN;

-- --------------------------------------------------------------------------
-- pending_orders: idempotency_key (nullable; unique per customer when set)
-- --------------------------------------------------------------------------
ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique index so legacy rows (NULL) are not forced to be unique.
CREATE UNIQUE INDEX IF NOT EXISTS pending_orders_customer_idem_uidx
  ON public.pending_orders (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- --------------------------------------------------------------------------
-- order_notifications: outbox for post-placement fan-out
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_notifications (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  audience TEXT NOT NULL,         -- 'merchant' | 'customer' | 'rider_dispatch'
  channel TEXT NOT NULL,          -- 'push' | 'realtime' | 'email' | 'sms' | 'internal'
  event_type TEXT NOT NULL,       -- e.g. 'ORDER_PLACED', 'ORDER_READY_FOR_DISPATCH'
  recipient_type TEXT,            -- 'merchant_store' | 'customer' | 'rider_pool'
  recipient_id TEXT,              -- store id / customer id / pool key
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | delivered | failed | skipped
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If this table already existed from an earlier/manual rollout, ensure newer
-- columns required by indexes are present before creating indexes below.
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS order_id TEXT;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS recipient_type TEXT;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS recipient_id TEXT;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS order_notifications_order_id_idx
  ON public.order_notifications (order_id);
CREATE INDEX IF NOT EXISTS order_notifications_status_next_idx
  ON public.order_notifications (status, next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS order_notifications_audience_status_idx
  ON public.order_notifications (audience, status);

COMMIT;
