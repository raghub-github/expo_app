-- =============================================================================
-- 0399_merchant_go_online_notification_templates.sql
-- Push templates for outside-delivery-slot + go-online prompts (merchant app).
-- =============================================================================

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('MERCHANT_OUTSIDE_DELIVERY_TIMINGS',
   'operational', 'merchant', 'all',
   '🔴 {{storeName}} is out of delivery timings',
   'Go online now to receive orders',
   '/restaurant-status', 'high',
   '{"storeName":"string"}'::jsonb),

  ('MERCHANT_GO_ONLINE_PROMPT',
   'operational', 'merchant', 'all',
   '🔴 {{storeName}} is out of delivery timings',
   'Go online now to receive orders',
   '/restaurant-status', 'high',
   '{"storeName":"string"}'::jsonb)
ON CONFLICT (code, locale) DO NOTHING;
