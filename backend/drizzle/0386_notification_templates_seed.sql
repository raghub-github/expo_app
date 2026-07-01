-- =============================================================================
-- 0386_notification_templates_seed.sql
-- Seeds notification_templates with all automatic events from the spec.
--
-- Variables use {{camelCase}} substitution. Super-admin can edit title_template
-- / body_template / image_url / deep_link without touching code.
--
-- Idempotent: ON CONFLICT (code, locale) DO NOTHING so re-runs are safe.
-- =============================================================================

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  -- ---------------------------- CUSTOMER (26) ----------------------------
  ('CUSTOMER_SIGNUP',              'account',     'customer', 'push', 'Welcome to Gatimitra, {{customerName}}!', 'Your account is ready. Explore restaurants nearby and order in seconds.', '/home', 'normal', '{"customerName":"string"}'::jsonb),
  ('CUSTOMER_OTP_SUCCESS',         'account',     'customer', 'in_app', 'Verified', 'Phone number verified successfully.', NULL, 'normal', '{}'::jsonb),
  ('CUSTOMER_PROFILE_UPDATED',     'account',     'customer', 'in_app', 'Profile updated', 'Your profile changes have been saved.', '/profile', 'low', '{}'::jsonb),
  ('CUSTOMER_ADDRESS_ADDED',       'account',     'customer', 'in_app', 'Address added', 'Saved {{addressLabel}} to your addresses.', '/profile/addresses', 'low', '{"addressLabel":"string"}'::jsonb),
  ('ORDER_CREATED',                'order',       'customer', 'all',  'Order placed', 'Order #{{orderShortId}} placed at {{merchantName}}. We''ll keep you posted.', '/orders/{{orderId}}', 'high', '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb),
  ('ORDER_ACCEPTED',               'order',       'customer', 'all',  'Order accepted', '{{merchantName}} accepted your order. Preparing now.', '/orders/{{orderId}}', 'high', '{"orderId":"string","merchantName":"string"}'::jsonb),
  ('ORDER_PREPARING',              'order',       'customer', 'all',  'Preparing your food', '{{merchantName}} is preparing order #{{orderShortId}}.', '/orders/{{orderId}}', 'normal', '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb),
  ('ORDER_FOOD_READY',             'order',       'customer', 'all',  'Food is ready', 'Your order is ready. A rider will pick it up shortly.', '/orders/{{orderId}}', 'high', '{"orderId":"string"}'::jsonb),
  ('ORDER_RIDER_ASSIGNED',         'order',       'customer', 'all',  '{{riderName}} is on the way', '{{riderName}} will pick up your order from {{merchantName}}.', '/orders/{{orderId}}', 'high', '{"orderId":"string","riderName":"string","merchantName":"string"}'::jsonb),
  ('ORDER_RIDER_ARRIVING',         'order',       'customer', 'all',  'Rider arriving', '{{riderName}} is {{etaMinutes}} min away with your order.', '/orders/{{orderId}}', 'high', '{"orderId":"string","riderName":"string","etaMinutes":"number"}'::jsonb),
  ('ORDER_DELIVERED',              'order',       'customer', 'all',  'Delivered', 'Enjoy your meal from {{merchantName}}!', '/orders/{{orderId}}', 'normal', '{"orderId":"string","merchantName":"string"}'::jsonb),
  ('ORDER_CANCELLED',              'order',       'customer', 'all',  'Order cancelled', 'Order #{{orderShortId}} was cancelled. {{reason}}', '/orders/{{orderId}}', 'high', '{"orderId":"string","orderShortId":"string","reason":"string"}'::jsonb),
  ('CUSTOMER_REFUND_INITIATED',    'payment',     'customer', 'all',  'Refund initiated', '₹{{amount}} refund for order #{{orderShortId}} is on the way.', '/orders/{{orderId}}', 'high', '{"orderId":"string","orderShortId":"string","amount":"number"}'::jsonb),
  ('CUSTOMER_WALLET_UPDATED',      'wallet',      'customer', 'in_app', 'Wallet updated', '{{direction}} ₹{{amount}}. Balance ₹{{balance}}.', '/wallet', 'normal', '{"direction":"string","amount":"number","balance":"number"}'::jsonb),
  ('CUSTOMER_PAYMENT_SUCCESS',     'payment',     'customer', 'all',  'Payment successful', '₹{{amount}} for order #{{orderShortId}} paid.', '/orders/{{orderId}}', 'normal', '{"orderId":"string","orderShortId":"string","amount":"number"}'::jsonb),
  ('CUSTOMER_PAYMENT_FAILED',      'payment',     'customer', 'all',  'Payment failed', 'Could not collect ₹{{amount}}. {{reason}}', '/orders/{{orderId}}', 'high', '{"orderId":"string","amount":"number","reason":"string"}'::jsonb),
  ('CUSTOMER_OFFER',               'marketing',   'customer', 'push', '{{offerTitle}}', '{{offerBody}}', '{{offerDeepLink}}', 'normal', '{"offerTitle":"string","offerBody":"string","offerDeepLink":"string"}'::jsonb),
  ('CUSTOMER_COUPON',              'marketing',   'customer', 'push', 'New coupon: {{couponCode}}', 'Use {{couponCode}} for {{discount}} off. Valid till {{expiresAt}}.', '/offers', 'normal', '{"couponCode":"string","discount":"string","expiresAt":"string"}'::jsonb),
  ('CUSTOMER_SUBSCRIPTION_UPDATE', 'account',     'customer', 'all',  '{{title}}', '{{body}}', '/subscription', 'normal', '{"title":"string","body":"string"}'::jsonb),
  ('ACCOUNT_SUSPENDED',            'account',     'customer', 'all',  'Account suspended', 'Your account has been suspended. Contact support for details.', '/support', 'critical', '{}'::jsonb),
  ('ACCOUNT_REACTIVATED',          'account',     'customer', 'all',  'Account reactivated', 'Welcome back! Your account is active again.', '/home', 'high', '{}'::jsonb),
  ('CUSTOMER_ANNOUNCEMENT',        'announcement','customer', 'all',  '{{title}}', '{{body}}', '{{deepLink}}', 'normal', '{"title":"string","body":"string","deepLink":"string"}'::jsonb),
  ('CUSTOMER_MAINTENANCE',         'system',      'customer', 'all',  'Scheduled maintenance', 'App will be unavailable from {{startTime}} to {{endTime}}.', NULL, 'high', '{"startTime":"string","endTime":"string"}'::jsonb),
  ('CUSTOMER_EMERGENCY',           'emergency',   'customer', 'all',  '{{title}}', '{{body}}', '{{deepLink}}', 'critical', '{"title":"string","body":"string","deepLink":"string"}'::jsonb),

  -- ---------------------------- MERCHANT (17) ----------------------------
  ('MERCHANT_SIGNUP',              'account',     'merchant', 'push', 'Welcome to Gatimitra Partner', 'Your merchant account is created. Complete KYC to start receiving orders.', '/kyc', 'normal', '{}'::jsonb),
  ('MERCHANT_KYC_SUBMITTED',       'account',     'merchant', 'in_app', 'KYC submitted', 'We are reviewing your documents. Decision typically within 24h.', '/kyc', 'normal', '{}'::jsonb),
  ('MERCHANT_KYC_APPROVED',        'account',     'merchant', 'all',  'KYC approved 🎉', 'Your store is live. Start accepting orders now.', '/store', 'high', '{}'::jsonb),
  ('MERCHANT_KYC_REJECTED',        'account',     'merchant', 'all',  'KYC rejected', '{{reason}} Please re-submit.', '/kyc', 'high', '{"reason":"string"}'::jsonb),
  ('MERCHANT_STORE_ACTIVATED',     'operational', 'merchant', 'all',  'Store activated', '{{storeName}} is now accepting orders.', '/store', 'normal', '{"storeName":"string"}'::jsonb),
  ('MERCHANT_STORE_DEACTIVATED',   'operational', 'merchant', 'all',  'Store deactivated', '{{storeName}} is offline. {{reason}}', '/store', 'high', '{"storeName":"string","reason":"string"}'::jsonb),
  ('MERCHANT_SUBSCRIPTION_EXPIRING','account',    'merchant', 'all',  'Subscription expiring soon', 'Your plan expires on {{expiresOn}}. Renew to avoid disruption.', '/subscription', 'high', '{"expiresOn":"string"}'::jsonb),
  ('MERCHANT_SUBSCRIPTION_RENEWED','account',     'merchant', 'all',  'Subscription renewed', 'Your plan is renewed until {{expiresOn}}.', '/subscription', 'normal', '{"expiresOn":"string"}'::jsonb),
  ('MERCHANT_SETTLEMENT_SUCCESS',  'payment',     'merchant', 'all',  'Settlement received', '₹{{amount}} settled to your bank for {{period}}.', '/payouts', 'normal', '{"amount":"number","period":"string"}'::jsonb),
  ('MERCHANT_SETTLEMENT_FAILED',   'payment',     'merchant', 'all',  'Settlement failed', '₹{{amount}} settlement failed. {{reason}}', '/payouts', 'high', '{"amount":"number","reason":"string"}'::jsonb),
  ('MERCHANT_NEW_ORDER',           'order',       'merchant', 'all',  'New order #{{orderShortId}}', '{{itemCount}} item(s) · ₹{{amount}} · {{customerName}}', '/orders/{{orderId}}', 'critical', '{"orderId":"string","orderShortId":"string","itemCount":"number","amount":"number","customerName":"string"}'::jsonb),
  ('MERCHANT_ORDER_CANCELLED',     'order',       'merchant', 'all',  'Order cancelled', 'Order #{{orderShortId}} cancelled. {{reason}}', '/orders/{{orderId}}', 'high', '{"orderId":"string","orderShortId":"string","reason":"string"}'::jsonb),
  ('MERCHANT_SUPPORT_TICKET',      'system',      'merchant', 'all',  'Support response', '{{ticketTitle}}: {{messagePreview}}', '/support/{{ticketId}}', 'normal', '{"ticketId":"string","ticketTitle":"string","messagePreview":"string"}'::jsonb),
  ('MERCHANT_WALLET_UPDATED',      'wallet',      'merchant', 'in_app', 'Wallet updated', '{{direction}} ₹{{amount}}. Balance ₹{{balance}}.', '/wallet', 'normal', '{"direction":"string","amount":"number","balance":"number"}'::jsonb),
  ('MERCHANT_OFFER',               'marketing',   'merchant', 'push', '{{offerTitle}}', '{{offerBody}}', '{{offerDeepLink}}', 'normal', '{"offerTitle":"string","offerBody":"string","offerDeepLink":"string"}'::jsonb),
  ('MERCHANT_ANNOUNCEMENT',        'announcement','merchant', 'all',  '{{title}}', '{{body}}', '{{deepLink}}', 'normal', '{"title":"string","body":"string","deepLink":"string"}'::jsonb),

  -- ---------------------------- RIDER (20) ----------------------------
  ('RIDER_SIGNUP',                 'account',     'rider',    'push', 'Welcome rider!', 'Complete your documents to start earning.', '/onboarding', 'normal', '{}'::jsonb),
  ('RIDER_OTP',                    'account',     'rider',    'in_app', 'OTP', 'Your verification code is {{otp}}.', NULL, 'critical', '{"otp":"string"}'::jsonb),
  ('RIDER_DOC_UPLOADED',           'account',     'rider',    'in_app', 'Document received', '{{docType}} uploaded. Review pending.', '/documents', 'normal', '{"docType":"string"}'::jsonb),
  ('RIDER_DOC_APPROVED',           'account',     'rider',    'all',  '{{docType}} approved', 'Document verified successfully.', '/documents', 'normal', '{"docType":"string"}'::jsonb),
  ('RIDER_DOC_REJECTED',           'account',     'rider',    'all',  '{{docType}} rejected', '{{reason}} Please re-upload.', '/documents', 'high', '{"docType":"string","reason":"string"}'::jsonb),
  ('RIDER_BG_VERIFICATION',        'account',     'rider',    'all',  'Background check', '{{status}}: {{message}}', '/profile', 'normal', '{"status":"string","message":"string"}'::jsonb),
  ('RIDER_TRAINING',               'account',     'rider',    'all',  'Training assigned', '{{title}}: {{body}}', '/training', 'normal', '{"title":"string","body":"string"}'::jsonb),
  ('RIDER_ACCOUNT_ACTIVATED',      'account',     'rider',    'all',  'You''re live!', 'Your account is activated. Go online to receive orders.', '/home', 'high', '{}'::jsonb),
  ('RIDER_ACCOUNT_DEACTIVATED',    'account',     'rider',    'all',  'Account deactivated', '{{reason}} Contact support for details.', '/support', 'critical', '{"reason":"string"}'::jsonb),
  ('RIDER_BLACKLISTED',            'account',     'rider',    'all',  'Account blacklisted', '{{reason}}', '/support', 'critical', '{"reason":"string"}'::jsonb),
  ('RIDER_SHIFT_STARTED',          'operational', 'rider',    'in_app', 'Shift started', 'You''re online. Stay safe.', '/home', 'low', '{}'::jsonb),
  ('RIDER_SHIFT_ENDED',            'operational', 'rider',    'in_app', 'Shift ended', 'Earnings: ₹{{earnings}} · {{deliveries}} deliveries.', '/earnings', 'normal', '{"earnings":"number","deliveries":"number"}'::jsonb),
  ('RIDER_NEW_ORDER',              'order',       'rider',    'all',  'New order — ₹{{payout}}', '{{distanceKm}} km · {{merchantName}} → {{dropArea}}', '/orders/{{orderId}}', 'critical', '{"orderId":"string","payout":"number","distanceKm":"number","merchantName":"string","dropArea":"string"}'::jsonb),
  ('RIDER_ORDER_CANCELLED',        'order',       'rider',    'all',  'Order cancelled', 'Order #{{orderShortId}} was cancelled.', '/orders/{{orderId}}', 'high', '{"orderId":"string","orderShortId":"string"}'::jsonb),
  ('RIDER_PENALTY',                'wallet',      'rider',    'all',  'Penalty applied', '₹{{amount}} deducted. {{reason}}', '/earnings', 'high', '{"amount":"number","reason":"string"}'::jsonb),
  ('RIDER_BONUS',                  'wallet',      'rider',    'all',  'Bonus credited 🎉', '₹{{amount}} for {{reason}}.', '/earnings', 'normal', '{"amount":"number","reason":"string"}'::jsonb),
  ('RIDER_INCENTIVE',              'wallet',      'rider',    'all',  'Incentive earned', '{{description}} · ₹{{amount}}', '/earnings', 'normal', '{"description":"string","amount":"number"}'::jsonb),
  ('RIDER_WALLET_UPDATED',         'wallet',      'rider',    'in_app', 'Wallet updated', '{{direction}} ₹{{amount}}. Balance ₹{{balance}}.', '/wallet', 'normal', '{"direction":"string","amount":"number","balance":"number"}'::jsonb),
  ('RIDER_WITHDRAWAL_REQUESTED',   'wallet',      'rider',    'all',  'Withdrawal requested', '₹{{amount}} requested. Expected by {{eta}}.', '/wallet', 'normal', '{"amount":"number","eta":"string"}'::jsonb),
  ('RIDER_WITHDRAWAL_SUCCESS',     'wallet',      'rider',    'all',  'Withdrawal successful', '₹{{amount}} credited to your bank.', '/wallet', 'normal', '{"amount":"number"}'::jsonb),
  ('RIDER_WITHDRAWAL_FAILED',      'wallet',      'rider',    'all',  'Withdrawal failed', '₹{{amount}} could not be processed. {{reason}}', '/wallet', 'high', '{"amount":"number","reason":"string"}'::jsonb),
  ('RIDER_ANNOUNCEMENT',           'announcement','rider',    'all',  '{{title}}', '{{body}}', '{{deepLink}}', 'normal', '{"title":"string","body":"string","deepLink":"string"}'::jsonb),
  ('RIDER_EMERGENCY',              'emergency',   'rider',    'all',  '{{title}}', '{{body}}', '{{deepLink}}', 'critical', '{"title":"string","body":"string","deepLink":"string"}'::jsonb),

  -- ---------------------------- ORDER-PAGE ADMIN ACTIONS ----------------------------
  ('ADMIN_ORDER_DELAYED',          'system',      'customer', 'all',  'Order running late', 'Sorry for the delay. {{message}}', '/orders/{{orderId}}', 'high', '{"orderId":"string","message":"string"}'::jsonb),
  ('ADMIN_RESTAURANT_BUSY',        'system',      'customer', 'all',  'Restaurant is busy', '{{merchantName}} is taking a bit longer. ETA updated.', '/orders/{{orderId}}', 'normal', '{"orderId":"string","merchantName":"string"}'::jsonb),
  ('ADMIN_RIDER_WAITING',          'system',      'merchant', 'all',  'Rider waiting at pickup', '{{riderName}} is waiting for order #{{orderShortId}}.', '/orders/{{orderId}}', 'high', '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb),
  ('ADMIN_CUSTOMER_UNREACHABLE',   'system',      'customer', 'all',  'We could not reach you', 'Please call back {{phone}} regarding order #{{orderShortId}}.', '/orders/{{orderId}}', 'critical', '{"orderId":"string","orderShortId":"string","phone":"string"}'::jsonb),
  ('ADMIN_PLEASE_ANSWER_CALL',     'system',      'customer', 'all',  'Please answer the call', 'Your rider is trying to reach you regarding order #{{orderShortId}}.', '/orders/{{orderId}}', 'critical', '{"orderId":"string","orderShortId":"string"}'::jsonb),
  ('ADMIN_REPLACEMENT_RIDER',      'system',      'customer', 'all',  'New rider assigned', '{{riderName}} is your new delivery partner.', '/orders/{{orderId}}', 'high', '{"orderId":"string","riderName":"string"}'::jsonb)
ON CONFLICT (code, locale) DO NOTHING;
