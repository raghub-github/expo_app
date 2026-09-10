-- Abandoned cart push: Zomato-style reminder when user leaves with items in cart.
-- Template + queue table. Poller sends after delay; client schedules/cancels.

CREATE TABLE IF NOT EXISTS public.customer_abandoned_cart_reminders (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  store_id text NOT NULL,
  store_name text NOT NULL,
  send_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_abandoned_cart_reminders_pending_user_uidx
  ON public.customer_abandoned_cart_reminders (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS customer_abandoned_cart_reminders_due_idx
  ON public.customer_abandoned_cart_reminders (send_after)
  WHERE status = 'pending';

INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled
)
SELECT
  'CUSTOMER_ABANDONED_CART',
  'marketing',
  'customer',
  'push',
  'All set, {{firstName}}?',
  'Because {{storeName}} is all set to accept your order, tap now',
  '/home/merchant/{{storeId}}',
  'normal',
  '{"firstName":"string","storeName":"string","storeId":"string"}'::jsonb,
  'en',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates
  WHERE code = 'CUSTOMER_ABANDONED_CART' AND locale = 'en'
);

INSERT INTO public.notification_settings (key, value, description)
VALUES
  (
    'abandoned_cart_delay_min',
    '15'::jsonb,
    'Minutes after app background before abandoned-cart push'
  )
ON CONFLICT (key) DO NOTHING;
