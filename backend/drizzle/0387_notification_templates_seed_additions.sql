-- =============================================================================
-- 0387_notification_templates_seed_additions.sql
-- Adds templates for events that already exist in the codebase but were not
-- in the original seed (0386). These map to enqueuePush callers being
-- migrated to NotificationService in Phase 3.
--
-- Idempotent: ON CONFLICT (code, locale) DO NOTHING.
-- =============================================================================

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  -- Prep-delay customer push (was: customer-prep-delay-effects.ts)
  ('ORDER_PREP_DELAY',
   'order', 'customer', 'all',
   'Delivery time updated',
   '{{storeName}} needs {{additionalMinutes}} more min to prepare your order. Updated arrival ~{{etaMinutes}} mins.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","storeName":"string","additionalMinutes":"number","etaMinutes":"number"}'::jsonb),

  -- Ride captain cancelled (was: customer-ride-captain-notify.ts #1)
  ('RIDE_CAPTAIN_CANCELLED',
   'order', 'customer', 'all',
   'Captain unavailable',
   'We are finding you a new captain for order #{{orderShortId}}.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string"}'::jsonb),

  -- Ride captain on the way (was: customer-ride-captain-notify.ts #2)
  ('RIDE_CAPTAIN_ON_THE_WAY',
   'order', 'customer', 'all',
   '{{captainName}} is on the way',
   'Your captain is heading to pickup for order #{{orderShortId}}.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","captainName":"string","riderId":"string"}'::jsonb),

  -- Rider vehicle verified (was: notify-rider-vehicle-verified.ts)
  ('RIDER_VEHICLE_VERIFIED',
   'account', 'rider', 'all',
   'Vehicle verified',
   'Your vehicle is verified. You can go online and start receiving orders.',
   '/(tabs)/orders', 'high',
   '{"riderId":"string"}'::jsonb),

  -- Rider dispatch offer (was: rider-dispatch-notify.ts)
  ('RIDER_DISPATCH_OFFER',
   'order', 'rider', 'all',
   'New {{serviceLabel}} order',
   '{{displayId}} · {{pickupDistance}} from pickup — tap to view',
   '/(tabs)/orders', 'critical',
   '{"orderId":"string","formattedOrderId":"string","serviceLabel":"string","displayId":"string","pickupDistance":"string","serviceType":"string","waveNumber":"number"}'::jsonb),

  -- Rider wait escalation (was: eta.rider-wait-escalation.ts → merchant)
  ('MERCHANT_RIDER_WAIT_ESCALATION',
   'operational', 'merchant', 'all',
   '{{title}}',
   '{{body}}',
   '/orders/{{orderId}}', 'critical',
   '{"orderId":"string","title":"string","body":"string","waitMinutes":"number","escalationLevel":"number"}'::jsonb),

  -- Financial rule approval pending (was: financial-rules.internal.routes.ts)
  ('FINANCIAL_RULE_APPROVAL_PENDING',
   'system', 'admin', 'all',
   'Financial rule approval needed',
   '{{ruleName}} requires admin approval.',
   '/financial-rules/{{ruleId}}', 'high',
   '{"ruleName":"string","ruleId":"string"}'::jsonb),

  -- Financial rule customer-facing (was: financial-rules.internal.routes.ts)
  ('FINANCIAL_RULE_CUSTOMER_NOTIFY',
   'payment', 'customer', 'all',
   '{{title}}',
   '{{body}}',
   '/orders/{{orderId}}', 'normal',
   '{"orderId":"string","title":"string","body":"string"}'::jsonb)

ON CONFLICT (code, locale) DO NOTHING;
