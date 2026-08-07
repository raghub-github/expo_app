-- Admin Order Details → "Send Cx notification" templates.
-- Uses existing notification_templates (v2). Codes prefixed ADMIN_CX_ for list filtering.
-- Idempotent: ON CONFLICT (code, locale) DO NOTHING.

INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled, retry_count
) VALUES
  (
    'ADMIN_CX_POST_PICKUP_LONG_DISTANCE', 'operational', 'customer', 'all',
    'Delivery Update',
    'Your delivery partner is travelling from a longer distance than expected. Your order is on the way and may take a little longer to arrive. Thank you for your patience.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PRE_PICKUP_MERCHANT_UNRESPONSIVE', 'operational', 'customer', 'all',
    'Order Update',
    'We''re trying to reach the restaurant regarding your order. We''ll update you shortly. Thank you for your patience.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_POST_PICKUP_TRAFFIC', 'operational', 'customer', 'all',
    'Delivery Delayed',
    'Heavy traffic is affecting the delivery route. Your delivery partner is on the way and your order will arrive as soon as possible.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_POST_PICKUP_RIDER_UNRESPONSIVE', 'operational', 'customer', 'all',
    'Delivery Update',
    'We are trying to contact your delivery partner. Our support team is actively working on it and will update you shortly.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PRE_PICKUP_STORE_ISSUE', 'operational', 'customer', 'all',
    'Restaurant Delay',
    'The restaurant is facing an operational issue which is delaying order preparation. We appreciate your patience.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PRE_PICKUP_DISPATCH_READY', 'operational', 'customer', 'all',
    'Rider Assigned',
    'Good news! Your order is ready and a delivery partner is on the way to pick it up.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_POST_PICKUP_ADDRESS_CONFIRM', 'operational', 'customer', 'all',
    'Address Confirmation Required',
    'Our delivery partner needs help locating your address. Please keep your phone available in case we need to contact you.',
    '/orders/{{orderId}}', 'critical',
    '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PRE_PICKUP_HIGH_FOOTFALL', 'operational', 'customer', 'all',
    'Restaurant Busy',
    'The restaurant is experiencing high order volume. Your order is being prepared and may take a little longer than usual.',
    '/orders/{{orderId}}', 'normal',
    '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PRE_PICKUP_RIDER_UNRESPONSIVE', 'operational', 'customer', 'all',
    'Pickup Delay',
    'We''re trying to assign or contact a delivery partner. We''ll update you as soon as possible.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_POST_PICKUP_RAIN', 'operational', 'customer', 'all',
    'Weather Delay',
    'Heavy rain is affecting delivery. Your delivery partner is on the way and your order may arrive a little later than expected.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_POST_PICKUP_CUSTOMER_UNRESPONSIVE', 'operational', 'customer', 'all',
    'Please Answer Your Phone',
    'Our delivery partner is trying to contact you for your order. Please answer your phone to avoid delivery delays.',
    '/orders/{{orderId}}', 'critical',
    '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_POST_PICKUP_ON_THE_WAY', 'operational', 'customer', 'all',
    'Order On The Way',
    'Your order has been picked up and is on its way. Sit back and relax—we''ll be there soon.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PRE_PICKUP_RAIN', 'operational', 'customer', 'all',
    'Preparation Delay',
    'Rain is affecting restaurant operations and pickup. Your order may take a little longer to be dispatched.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PRE_PICKUP_RIDER_CANT_FIND_STORE', 'operational', 'customer', 'all',
    'Pickup Delay',
    'Our delivery partner is locating the restaurant. Pickup may be slightly delayed, but we''re working to resolve it quickly.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PRE_PICKUP_ITEM_SLOW', 'operational', 'customer', 'all',
    'Preparing Your Order',
    'The restaurant needs a little extra time to prepare your order to maintain quality. Thank you for your patience.',
    '/orders/{{orderId}}', 'normal',
    '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_RIDER_ASSIGNED', 'order', 'customer', 'all',
    'Delivery Partner Assigned',
    '{{riderName}} has been assigned to your order and will pick it up shortly.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_RIDER_REASSIGNED', 'order', 'customer', 'all',
    'Delivery Partner Updated',
    'A new delivery partner has been assigned to ensure faster delivery.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PICKUP_COMPLETED', 'order', 'customer', 'all',
    'Order Picked Up',
    'Your order has been collected from the restaurant and is on the way.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_RIDER_NEAR_PICKUP', 'order', 'customer', 'all',
    'Pickup Partner Arrived',
    'Your delivery partner has reached the restaurant and is collecting your order.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_RIDER_NEAR_DELIVERY', 'order', 'customer', 'all',
    'Delivery Partner Nearby',
    'Your delivery partner is almost at your location. Please keep your phone available.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_DELIVERY_OTP', 'order', 'customer', 'all',
    'Delivery OTP',
    'Your Delivery OTP is {{deliveryOtp}}. Share it only after receiving your order.',
    '/orders/{{orderId}}', 'critical',
    '{"orderId":"string","orderShortId":"string","deliveryOtp":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_PICKUP_OTP', 'order', 'customer', 'all',
    'Pickup OTP',
    'Your Pickup OTP is {{pickupOtp}}. Share it only while handing over the parcel.',
    '/orders/{{orderId}}', 'critical',
    '{"orderId":"string","orderShortId":"string","pickupOtp":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_ORDER_DELIVERED', 'order', 'customer', 'all',
    'Delivered Successfully',
    'Your order has been delivered successfully. Enjoy your meal!',
    '/orders/{{orderId}}', 'normal',
    '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_REFUND_INITIATED', 'payment', 'customer', 'all',
    'Refund Started',
    'Your refund has been initiated and will be credited to your original payment method within the expected processing time.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","amount":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_REFUND_COMPLETED', 'payment', 'customer', 'all',
    'Refund Completed',
    'Your refund has been successfully processed.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","amount":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_SUPPORT_WORKING', 'system', 'customer', 'all',
    'Support is Working on Your Request',
    'Our support team is actively working on your issue and will update you shortly.',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_CUSTOM', 'operational', 'customer', 'all',
    '{{title}}',
    '{{body}}',
    '/orders/{{orderId}}', 'high',
    '{"orderId":"string","orderShortId":"string","title":"string","body":"string"}'::jsonb,
    'en', TRUE, 4
  )
ON CONFLICT (code, locale) DO NOTHING;

-- Human-readable labels for the Order Details dropdown (stored in settings JSON).
INSERT INTO public.notification_settings (key, value, description) VALUES
  (
    'admin_cx_template_labels',
    '{
      "ADMIN_CX_POST_PICKUP_LONG_DISTANCE": "Post Pickup | Delay due to long distance",
      "ADMIN_CX_PRE_PICKUP_MERCHANT_UNRESPONSIVE": "Pre Pickup | Merchant is unresponsive",
      "ADMIN_CX_POST_PICKUP_TRAFFIC": "Post Pickup | Delay due to traffic",
      "ADMIN_CX_POST_PICKUP_RIDER_UNRESPONSIVE": "Post Pickup | Rider is unresponsive",
      "ADMIN_CX_PRE_PICKUP_STORE_ISSUE": "Pre Pickup | Electricity / Any other issue at the store",
      "ADMIN_CX_PRE_PICKUP_DISPATCH_READY": "Pre Pickup | Order marked as Dispatch Ready / Rider is on the way",
      "ADMIN_CX_POST_PICKUP_ADDRESS_CONFIRM": "Post Pickup | Customer Address Confirmation",
      "ADMIN_CX_PRE_PICKUP_HIGH_FOOTFALL": "Pre Pickup | High footfall at the store",
      "ADMIN_CX_PRE_PICKUP_RIDER_UNRESPONSIVE": "Pre Pickup | Rider is unresponsive",
      "ADMIN_CX_POST_PICKUP_RAIN": "Post Pickup | Delay due to rain",
      "ADMIN_CX_POST_PICKUP_CUSTOMER_UNRESPONSIVE": "Post Pickup | Customer is unresponsive",
      "ADMIN_CX_POST_PICKUP_ON_THE_WAY": "Post Pickup | Order is on the way",
      "ADMIN_CX_PRE_PICKUP_RAIN": "Pre Pickup | Delay due to rain",
      "ADMIN_CX_PRE_PICKUP_RIDER_CANT_FIND_STORE": "Pre Pickup | Rider is unable to find the store",
      "ADMIN_CX_PRE_PICKUP_ITEM_SLOW": "Pre Pickup | Item is taking longer to prepare",
      "ADMIN_CX_RIDER_ASSIGNED": "Rider Assigned",
      "ADMIN_CX_RIDER_REASSIGNED": "Rider Reassigned",
      "ADMIN_CX_PICKUP_COMPLETED": "Pickup Completed",
      "ADMIN_CX_RIDER_NEAR_PICKUP": "Rider Near Pickup",
      "ADMIN_CX_RIDER_NEAR_DELIVERY": "Rider Near Delivery",
      "ADMIN_CX_DELIVERY_OTP": "Delivery OTP",
      "ADMIN_CX_PICKUP_OTP": "Pickup OTP",
      "ADMIN_CX_ORDER_DELIVERED": "Order Delivered",
      "ADMIN_CX_REFUND_INITIATED": "Refund Initiated",
      "ADMIN_CX_REFUND_COMPLETED": "Refund Completed",
      "ADMIN_CX_SUPPORT_WORKING": "Support Contacted",
      "ADMIN_CX_CUSTOM": "Custom Message"
    }'::jsonb,
    'Dropdown labels for Order Details → Send Cx notification'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
