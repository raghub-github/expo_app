-- 0225: Backfill applicable_order_statuses for the 27 customer-facing titles.
--
-- The status codes used here match `orders_core.status` (enum order_status_type):
--   assigned | accepted | reached_store | picked_up | in_transit | delivered | cancelled | failed
-- Plus the sentinel 'NO_ORDER' which the app uses when the customer picks
-- "this isn't about a specific order" — those titles are shown regardless.
--
-- NULL = always show (fallback for "Something else").
--
-- Buckets:
--   BEFORE_PICKUP   = assigned, accepted, reached_store     (still cancellable / modifiable)
--   IN_TRANSIT      = picked_up, in_transit
--   DELIVERED       = delivered                              (item issues, refund)
--   CANCEL_OR_FAIL  = cancelled, failed                      (refund / what happened)

BEGIN;

UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['assigned','accepted','reached_store']
  WHERE title_code = 'CUST_ORDER_CANCEL';
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['assigned','accepted']
  WHERE title_code = 'CUST_ORDER_MODIFY';
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['picked_up','in_transit','delivered']
  WHERE title_code = 'CUST_ORDER_NOT_RECEIVED';
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['accepted','reached_store','picked_up','in_transit']
  WHERE title_code = 'CUST_DELAY';
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['delivered']
  WHERE title_code IN ('CUST_MISSING_ITEM','CUST_WRONG_ITEM','CUST_DAMAGED','CUST_QUALITY');
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['picked_up','in_transit','delivered']
  WHERE title_code = 'CUST_RIDER_BEHAVIOR';
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['delivered','cancelled','failed']
  WHERE title_code = 'CUST_REFUND_REQUEST';

-- Payment / account / app titles: not tied to a specific order. The 'NO_ORDER'
-- sentinel makes them appear when customer picks "not about an order".
-- A few (refund status, safety, feedback) are useful in BOTH contexts.
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['NO_ORDER']
  WHERE title_code IN (
    'CUST_PAYMENT_FAILED','CUST_DOUBLE_CHARGE','CUST_COUPON_ISSUE','CUST_WALLET_BALANCE',
    'CUST_LOGIN_ISSUE','CUST_OTP','CUST_PROFILE_UPDATE','CUST_ADDRESS_ISSUE','CUST_DELETE_ACCOUNT',
    'CUST_APP_CRASH','CUST_APP_BUG','CUST_NOTIFICATIONS'
  );

UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['delivered','cancelled','failed','NO_ORDER']
  WHERE title_code = 'CUST_REFUND_STATUS';
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['picked_up','in_transit','delivered','NO_ORDER']
  WHERE title_code = 'CUST_SAFETY';
UPDATE public.ticket_titles SET applicable_order_statuses = ARRAY['delivered','NO_ORDER']
  WHERE title_code = 'CUST_FEEDBACK';

-- CUST_OTHER stays NULL so it appears as a fallback in every context.

COMMIT;
