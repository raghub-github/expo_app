-- Instant push when checkout payment is not completed (Toing-style copy).
-- Push only — not SMS. Upserts body/title for existing installs.
--
-- I/O-safe / idempotent:
--   • INSERT … WHERE NOT EXISTS + targeted UPDATE by unique (code, locale).
--   • No table rewrite, no indexes, no backfill. statement_timeout budget 15s.

SET statement_timeout = '15s';

INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled
)
SELECT
  'CUSTOMER_PAYMENT_FAILED',
  'payment',
  'customer',
  'push',
  'Payment not completed',
  'Your payment for GatiMitra order #{{orderShortId}} was not completed. Any amount if debited from UPI will get refunded within 4-7 days.',
  '/checkout',
  'high',
  '{"orderId":"string","orderShortId":"string","amount":"number","reason":"string"}'::jsonb,
  'en',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates
  WHERE code = 'CUSTOMER_PAYMENT_FAILED' AND locale = 'en'
);

UPDATE public.notification_templates
SET
  channel = 'push',
  title_template = 'Payment not completed',
  body_template = 'Your payment for GatiMitra order #{{orderShortId}} was not completed. Any amount if debited from UPI will get refunded within 4-7 days.',
  deep_link = '/checkout',
  priority = 'high',
  variables_schema = '{"orderId":"string","orderShortId":"string","amount":"number","reason":"string"}'::jsonb,
  enabled = TRUE,
  updated_at = NOW()
WHERE code = 'CUSTOMER_PAYMENT_FAILED'
  AND locale = 'en'
  AND (
    channel IS DISTINCT FROM 'push'
    OR title_template IS DISTINCT FROM 'Payment not completed'
    OR body_template IS DISTINCT FROM 'Your payment for GatiMitra order #{{orderShortId}} was not completed. Any amount if debited from UPI will get refunded within 4-7 days.'
    OR deep_link IS DISTINCT FROM '/checkout'
  );

RESET statement_timeout;
