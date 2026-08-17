-- Rider bank: store admin rejection reason + seed push template.
-- Rate limit (2 adds / 24h) uses existing created_at — no extra tables.

ALTER TABLE public.rider_payment_methods
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS rider_payment_methods_rider_created_idx
  ON public.rider_payment_methods (rider_id, created_at DESC);

INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled, retry_count
) VALUES (
  'RIDER_BANK_REJECTED', 'account', 'rider', 'all',
  'Bank account rejected',
  '{{reason}}',
  '/(tabs)/earnings', 'high',
  '{"reason":"string"}'::jsonb, 'en', TRUE, 4
)
ON CONFLICT (code, locale) DO NOTHING;
