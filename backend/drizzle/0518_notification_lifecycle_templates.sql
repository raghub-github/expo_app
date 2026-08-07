-- Additional lifecycle templates for domain events not covered by earlier seeds.
-- Idempotent ON CONFLICT DO NOTHING on (code, locale) unique index from 0385.

INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled, retry_count
) VALUES
  (
    'CUSTOMER_ADDRESS_UPDATED', 'account', 'customer', 'all',
    'Address updated',
    'Your saved address was updated successfully.',
    '/addresses', 'normal',
    '{"customerName":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'CUSTOMER_SUPPORT_TICKET', 'system', 'customer', 'all',
    'Support update',
    'Ticket #{{ticketId}}: {{messagePreview}}',
    '/support/{{ticketId}}', 'high',
    '{"ticketId":"string","ticketTitle":"string","messagePreview":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'RIDER_SUPPORT_TICKET', 'system', 'rider', 'all',
    'Support update',
    'Ticket #{{ticketId}}: {{messagePreview}}',
    '/support/{{ticketId}}', 'high',
    '{"ticketId":"string","ticketTitle":"string","messagePreview":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'MERCHANT_STORE_SUSPENDED', 'account', 'merchant', 'all',
    'Store suspended',
    '{{storeName}} has been suspended. {{reason}}',
    '/mx/store', 'critical',
    '{"storeName":"string","reason":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'MERCHANT_STORE_APPROVED', 'account', 'merchant', 'all',
    'Store approved',
    '{{storeName}} is approved and ready to go live.',
    '/mx/store', 'high',
    '{"storeName":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'MERCHANT_MENU_APPROVED', 'operational', 'merchant', 'all',
    'Menu approved',
    'Your menu changes for {{storeName}} were approved.',
    '/mx/menu', 'normal',
    '{"storeName":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'MERCHANT_MENU_REJECTED', 'operational', 'merchant', 'all',
    'Menu needs changes',
    'Menu for {{storeName}} was rejected. {{reason}}',
    '/mx/menu', 'high',
    '{"storeName":"string","reason":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'RIDER_SHIFT_REMINDER', 'operational', 'rider', 'all',
    'Shift reminder',
    'Your shift starts soon. Stay online to receive orders.',
    '/home', 'normal',
    '{}'::jsonb, 'en', TRUE, 4
  ),
  (
    'RIDER_ATTENDANCE', 'operational', 'rider', 'all',
    'Attendance update',
    '{{message}}',
    '/home', 'normal',
    '{"message":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'RIDER_INCENTIVE', 'wallet', 'rider', 'all',
    'Incentive earned',
    'You earned ₹{{amount}}. {{message}}',
    '/earnings', 'high',
    '{"amount":"string","message":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'CUSTOMER_INACTIVE_REMINDER', 'marketing', 'customer', 'push',
    'We miss you',
    'Come back to Gatimitra — tasty food and fast rides await.',
    '/home', 'low',
    '{}'::jsonb, 'en', TRUE, 3
  ),
  (
    'CUSTOMER_KYC_REMINDER', 'kyc', 'customer', 'all',
    'Complete your profile',
    'Finish verification to unlock all features.',
    '/profile', 'normal',
    '{}'::jsonb, 'en', TRUE, 3
  ),
  (
    'CUSTOMER_WALLET_REMINDER', 'wallet', 'customer', 'push',
    'Wallet reminder',
    'Your GatiCash balance is ₹{{balance}}. Top up for faster checkout.',
    '/wallet', 'low',
    '{"balance":"string"}'::jsonb, 'en', TRUE, 3
  ),
  (
    'MERCHANT_SUBSCRIPTION_REMINDER', 'account', 'merchant', 'all',
    'Subscription reminder',
    'Your partner plan {{expiresOn}}. Renew to keep accepting orders.',
    '/mx/subscription', 'high',
    '{"expiresOn":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'RIDER_ORDER_REASSIGNED', 'order', 'rider', 'all',
    'Order reassigned',
    'Order {{orderId}} was reassigned. {{reason}}',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","reason":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'RIDER_PICKUP_REMINDER', 'order', 'rider', 'all',
    'Pickup reminder',
    'Please complete pickup for order {{orderId}}.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'RIDER_DELIVERY_REMINDER', 'order', 'rider', 'all',
    'Delivery reminder',
    'Please complete delivery for order {{orderId}}.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string"}'::jsonb, 'en', TRUE, 4
  )
ON CONFLICT (code, locale) DO NOTHING;
