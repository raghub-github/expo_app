-- 0240: Cancellation scenario seed (run after 0239 and 0240a — enum values must be committed first)
-- If you see 55P04 on PRE_PICKUP_CANCELLED / POST_PICKUP_CANCELLED, run 0240a in a separate execution.

INSERT INTO public.payment_cancellation_rules (
  rule_code, rule_name, order_milestone, cancelled_by,
  merchant_gets_payment, customer_refund_mode, customer_refund_value, customer_refund_mode_calc,
  platform_keeps_commission, priority, is_active
) VALUES
  ('PRE_PICKUP_CUSTOMER', 'Pre-pickup: customer cancel', 'PRE_PICKUP_CANCELLED', 'CUSTOMER',
   FALSE, 'FULL', 100, 'PERCENTAGE', TRUE, 10, TRUE),
  ('PRE_PICKUP_MERCHANT', 'Pre-pickup: merchant reject', 'PRE_PICKUP_CANCELLED', 'MERCHANT',
   FALSE, 'FULL', 100, 'PERCENTAGE', TRUE, 11, TRUE),
  ('PRE_PICKUP_SYSTEM', 'Pre-pickup: auto timeout', 'PRE_PICKUP_CANCELLED', 'SYSTEM',
   FALSE, 'FULL', 100, 'PERCENTAGE', TRUE, 12, TRUE),
  ('ACCEPTED_MERCHANT_REJECT', 'After accept: merchant reject', 'ORDER_ACCEPTED', 'MERCHANT',
   FALSE, 'FULL', 100, 'PERCENTAGE', TRUE, 20, TRUE),
  ('PREPARING_MERCHANT', 'While preparing: merchant cancel', 'MERCHANT_PREPARING', 'MERCHANT',
   FALSE, 'PARTIAL', 50, 'PERCENTAGE', TRUE, 30, TRUE),
  ('PREPARING_CUSTOMER', 'While preparing: customer cancel', 'MERCHANT_PREPARING', 'CUSTOMER',
   FALSE, 'PARTIAL', 30, 'PERCENTAGE', TRUE, 31, TRUE),
  ('RIDER_ASSIGNED_CUSTOMER', 'Rider assigned, customer cancel', 'RIDER_ASSIGNED', 'CUSTOMER',
   FALSE, 'PARTIAL', 40, 'PERCENTAGE', TRUE, 40, TRUE),
  ('RIDER_ASSIGNED_MERCHANT', 'Rider assigned, merchant cancel', 'RIDER_ASSIGNED', 'MERCHANT',
   FALSE, 'NONE', 0, 'PERCENTAGE', TRUE, 41, TRUE),
  ('POST_PICKUP_CUSTOMER', 'Post-pickup: customer cancel', 'POST_PICKUP_CANCELLED', 'CUSTOMER',
   FALSE, 'PARTIAL', 60, 'PERCENTAGE', TRUE, 50, TRUE),
  ('POST_PICKUP_RIDER', 'Post-pickup: rider cancel', 'POST_PICKUP_CANCELLED', 'RIDER',
   FALSE, 'PARTIAL', 70, 'PERCENTAGE', TRUE, 51, TRUE),
  ('POST_PICKUP_MERCHANT', 'Post-pickup: merchant issue', 'POST_PICKUP_CANCELLED', 'MERCHANT',
   FALSE, 'FULL', 100, 'PERCENTAGE', TRUE, 52, TRUE),
  ('OFD_CUSTOMER', 'Out for delivery: customer', 'OUT_FOR_DELIVERY', 'CUSTOMER',
   FALSE, 'PARTIAL', 50, 'PERCENTAGE', TRUE, 55, TRUE),
  ('OFD_RIDER', 'Out for delivery: rider', 'OUT_FOR_DELIVERY', 'RIDER',
   TRUE, 'PARTIAL', 40, 'PERCENTAGE', TRUE, 56, TRUE),
  ('AFTER_DELIVERED_ADMIN', 'After delivered: admin refund', 'CANCELLED_AFTER_DELIVERED', 'ADMIN',
   FALSE, 'FULL', 100, 'PERCENTAGE', FALSE, 60, TRUE),
  ('AFTER_DELIVERED_CUSTOMER', 'After delivered: customer dispute', 'CANCELLED_AFTER_DELIVERED', 'CUSTOMER',
   FALSE, 'PARTIAL', 80, 'PERCENTAGE', FALSE, 61, TRUE),
  ('ADMIN_ANY', 'Admin cancel (any stage)', 'ADMIN_CANCELLED', 'ADMIN',
   FALSE, 'FULL', 100, 'PERCENTAGE', TRUE, 70, TRUE),
  ('FAILED_DELIVERY_RTO', 'Failed delivery / RTO', 'FAILED_DELIVERY', 'SYSTEM',
   FALSE, 'FULL', 100, 'PERCENTAGE', TRUE, 80, TRUE)
ON CONFLICT (rule_code) DO NOTHING;
