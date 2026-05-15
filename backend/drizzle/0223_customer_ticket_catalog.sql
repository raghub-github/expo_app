-- 0223: Customer-facing ticket catalog.
--
-- WHY:
--   The Customer App needs its own curated title/group/tag catalog inside the
--   SAME ticket_titles / ticket_groups / ticket_tags tables that the merchant
--   side already uses. The merchant side uses `merchant_section_id` to bucket
--   titles into UI sections (orders, payments, restaurant, …). We mirror that
--   with `customer_section_id` so admins can independently curate which
--   titles show up in the customer help hub.
--
-- WHAT:
--   1. Add `customer_section_id` column on ticket_titles (idempotent).
--   2. Seed default customer support groups (queues), tags, and titles.
--   3. Map each title to its group so round-robin auto-assignment routes
--      customer tickets to the right agent queue automatically.

BEGIN;

-- ----- 1. Schema additions ---------------------------------------------------

ALTER TABLE public.ticket_titles
  ADD COLUMN IF NOT EXISTS customer_section_id TEXT;

CREATE INDEX IF NOT EXISTS ticket_titles_customer_section_idx
  ON public.ticket_titles (customer_section_id)
  WHERE customer_section_id IS NOT NULL;

-- ----- 2. Default groups (queues) -------------------------------------------

INSERT INTO public.ticket_groups (group_code, group_name, ticket_section, source_role, is_active, display_order)
VALUES
  ('CUST_ORDERS',  'Customer · Orders',     'customer', 'customer', TRUE, 100),
  ('CUST_PAYMENTS','Customer · Payments',   'customer', 'customer', TRUE, 110),
  ('CUST_DELIVERY','Customer · Delivery',   'customer', 'customer', TRUE, 120),
  ('CUST_ACCOUNT', 'Customer · Account',    'customer', 'customer', TRUE, 130),
  ('CUST_TECH',    'Customer · App Issues', 'customer', 'customer', TRUE, 140),
  ('CUST_GENERAL', 'Customer · General',    'customer', 'customer', TRUE, 150)
ON CONFLICT (group_code) DO NOTHING;

-- ----- 3. Default tags -------------------------------------------------------

INSERT INTO public.ticket_tags (tag_code, tag_name, tag_color, is_active)
VALUES
  ('CUST_REFUND',       'Refund',           '#16a34a', TRUE),
  ('CUST_CANCEL',       'Cancel Order',     '#dc2626', TRUE),
  ('CUST_REPLACE',      'Replacement',      '#f59e0b', TRUE),
  ('CUST_DELAY',        'Delivery Delay',   '#eab308', TRUE),
  ('CUST_MISSING_ITEM', 'Missing Item',     '#9333ea', TRUE),
  ('CUST_WRONG_ITEM',   'Wrong Item',       '#9333ea', TRUE),
  ('CUST_QUALITY',      'Food Quality',     '#dc2626', TRUE),
  ('CUST_PAYMENT_FAIL', 'Payment Failure',  '#dc2626', TRUE),
  ('CUST_RIDER_ISSUE',  'Rider Issue',      '#0ea5e9', TRUE),
  ('CUST_APP_BUG',      'App Bug',          '#64748b', TRUE),
  ('CUST_ACCOUNT',      'Account',          '#0ea5e9', TRUE),
  ('CUST_FEEDBACK',     'Feedback',         '#22c55e', TRUE)
ON CONFLICT (tag_code) DO NOTHING;

-- ----- 4. Default titles -----------------------------------------------------

-- Optional intake columns may not exist on this DB yet (merchant intake added them).
-- We add them idempotently so the insert below works either way.
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_title         TEXT;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_category      TEXT;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_priority      TEXT;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_service_type  TEXT;

-- Helper: We insert by title_code and look up group_id at INSERT time so the
-- migration is replayable even if group IDs shift between environments.
WITH g AS (
  SELECT
    (SELECT id FROM public.ticket_groups WHERE group_code = 'CUST_ORDERS')   AS gid_orders,
    (SELECT id FROM public.ticket_groups WHERE group_code = 'CUST_PAYMENTS') AS gid_payments,
    (SELECT id FROM public.ticket_groups WHERE group_code = 'CUST_DELIVERY') AS gid_delivery,
    (SELECT id FROM public.ticket_groups WHERE group_code = 'CUST_ACCOUNT')  AS gid_account,
    (SELECT id FROM public.ticket_groups WHERE group_code = 'CUST_TECH')     AS gid_tech,
    (SELECT id FROM public.ticket_groups WHERE group_code = 'CUST_GENERAL')  AS gid_general
)
INSERT INTO public.ticket_titles
  (title_code, title_text, service_type, ticket_section, source_role, customer_section_id,
   group_id, display_order, is_active,
   intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type)
SELECT * FROM (VALUES
  -- ORDERS section (visible from order-detail "Raise ticket" button)
  ('CUST_ORDER_CANCEL',        'Cancel my order',                    'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_orders   FROM g), 100, TRUE, 'CUSTOMER_ORDER_CANCEL_REQUEST',  'ORDER',    'HIGH',   'FOOD'),
  ('CUST_ORDER_MODIFY',        'Modify items in my order',           'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_orders   FROM g), 110, TRUE, 'CUSTOMER_ORDER_MODIFY_REQUEST',  'ORDER',    'MEDIUM', 'FOOD'),
  ('CUST_ORDER_NOT_RECEIVED',  'I never received my order',          'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_delivery FROM g), 120, TRUE, 'CUSTOMER_ORDER_NOT_RECEIVED',    'DELIVERY', 'URGENT', 'FOOD'),
  ('CUST_DELAY',               'My order is delayed',                'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_delivery FROM g), 130, TRUE, 'CUSTOMER_ORDER_DELAYED',         'DELIVERY', 'HIGH',   'FOOD'),
  ('CUST_MISSING_ITEM',        'Item missing from my order',         'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_orders   FROM g), 140, TRUE, 'CUSTOMER_MISSING_ITEM',          'ORDER',    'HIGH',   'FOOD'),
  ('CUST_WRONG_ITEM',          'I received the wrong item',          'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_orders   FROM g), 150, TRUE, 'CUSTOMER_WRONG_ITEM',            'ORDER',    'HIGH',   'FOOD'),
  ('CUST_DAMAGED',             'Order was damaged or spilled',       'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_orders   FROM g), 160, TRUE, 'CUSTOMER_DAMAGED_ITEM',          'ORDER',    'HIGH',   'FOOD'),
  ('CUST_QUALITY',             'Food quality issue',                 'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_orders   FROM g), 170, TRUE, 'CUSTOMER_FOOD_QUALITY',          'ORDER',    'HIGH',   'FOOD'),
  ('CUST_RIDER_BEHAVIOR',      'Issue with delivery partner',        'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_delivery FROM g), 180, TRUE, 'CUSTOMER_RIDER_ISSUE',           'DELIVERY', 'HIGH',   'FOOD'),
  ('CUST_REFUND_REQUEST',      'Refund for this order',              'food'::ticket_service_type,  'customer'::ticket_section, 'customer'::ticket_source_role, 'orders',     (SELECT gid_payments FROM g), 190, TRUE, 'CUSTOMER_REFUND_REQUEST',        'REFUND',   'HIGH',   'FOOD'),

  -- PAYMENTS section (general help → payments)
  ('CUST_PAYMENT_FAILED',      'Payment failed but money deducted',  'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'payments',   (SELECT gid_payments FROM g), 200, TRUE, 'CUSTOMER_PAYMENT_FAILED',        'PAYMENT',  'URGENT', 'GENERAL'),
  ('CUST_DOUBLE_CHARGE',       'I was charged twice',                'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'payments',   (SELECT gid_payments FROM g), 210, TRUE, 'CUSTOMER_DOUBLE_CHARGE',         'PAYMENT',  'URGENT', 'GENERAL'),
  ('CUST_REFUND_STATUS',       'Where is my refund?',                'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'payments',   (SELECT gid_payments FROM g), 220, TRUE, 'CUSTOMER_REFUND_STATUS',         'REFUND',   'HIGH',   'GENERAL'),
  ('CUST_COUPON_ISSUE',        'Coupon / promo code not working',    'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'payments',   (SELECT gid_payments FROM g), 230, TRUE, 'CUSTOMER_COUPON_ISSUE',          'PAYMENT',  'MEDIUM', 'GENERAL'),
  ('CUST_WALLET_BALANCE',      'Wallet balance is incorrect',        'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'payments',   (SELECT gid_payments FROM g), 240, TRUE, 'CUSTOMER_WALLET_ISSUE',          'PAYMENT',  'MEDIUM', 'GENERAL'),

  -- ACCOUNT section
  ('CUST_LOGIN_ISSUE',         'Cannot log in',                      'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'account',    (SELECT gid_account FROM g),  300, TRUE, 'CUSTOMER_LOGIN_ISSUE',           'ACCOUNT',  'HIGH',   'GENERAL'),
  ('CUST_OTP',                 'Not receiving OTP',                  'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'account',    (SELECT gid_account FROM g),  310, TRUE, 'CUSTOMER_OTP_NOT_RECEIVED',      'ACCOUNT',  'HIGH',   'GENERAL'),
  ('CUST_PROFILE_UPDATE',      'Update my profile / phone / email',  'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'account',    (SELECT gid_account FROM g),  320, TRUE, 'CUSTOMER_PROFILE_UPDATE',        'ACCOUNT',  'MEDIUM', 'GENERAL'),
  ('CUST_ADDRESS_ISSUE',       'Address / location issue',           'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'account',    (SELECT gid_account FROM g),  330, TRUE, 'CUSTOMER_ADDRESS_ISSUE',         'ACCOUNT',  'MEDIUM', 'GENERAL'),
  ('CUST_DELETE_ACCOUNT',      'Delete my account',                  'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'account',    (SELECT gid_account FROM g),  340, TRUE, 'CUSTOMER_ACCOUNT_DELETE',        'ACCOUNT',  'LOW',    'GENERAL'),

  -- APP / TECHNICAL section
  ('CUST_APP_CRASH',           'App keeps crashing',                 'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'app',        (SELECT gid_tech FROM g),     400, TRUE, 'CUSTOMER_APP_CRASH',             'TECHNICAL','MEDIUM', 'GENERAL'),
  ('CUST_APP_BUG',             'Something looks wrong in the app',   'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'app',        (SELECT gid_tech FROM g),     410, TRUE, 'CUSTOMER_APP_BUG',               'TECHNICAL','LOW',    'GENERAL'),
  ('CUST_NOTIFICATIONS',       'Notifications not working',          'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'app',        (SELECT gid_tech FROM g),     420, TRUE, 'CUSTOMER_NOTIFICATIONS_ISSUE',   'TECHNICAL','LOW',    'GENERAL'),

  -- GENERAL / COMPLAINT / FEEDBACK
  ('CUST_SAFETY',              'Safety concern',                     'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'general',    (SELECT gid_general FROM g),  500, TRUE, 'CUSTOMER_SAFETY_CONCERN',        'COMPLAINT','CRITICAL','GENERAL'),
  ('CUST_FEEDBACK',            'General feedback or suggestion',     'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'general',    (SELECT gid_general FROM g),  510, TRUE, 'CUSTOMER_FEEDBACK',              'FEEDBACK', 'LOW',    'GENERAL'),
  ('CUST_OTHER',               'Something else',                     'other'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'general',    (SELECT gid_general FROM g),  520, TRUE, 'CUSTOMER_OTHER',                 'OTHER',    'LOW',    'GENERAL')
) AS v(title_code, title_text, service_type, ticket_section, source_role, customer_section_id,
       group_id, display_order, is_active,
       intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type)
ON CONFLICT (title_code) DO NOTHING;

-- ----- 5. Title ↔ tag mapping ------------------------------------------------

WITH titlemap AS (
  SELECT
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_ORDER_CANCEL')       AS t_cancel,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_ORDER_NOT_RECEIVED') AS t_notrecv,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_DELAY')              AS t_delay,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_MISSING_ITEM')       AS t_missing,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_WRONG_ITEM')         AS t_wrong,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_QUALITY')            AS t_quality,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_RIDER_BEHAVIOR')     AS t_rider,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_REFUND_REQUEST')     AS t_refund_req,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_PAYMENT_FAILED')     AS t_paid_fail,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_DOUBLE_CHARGE')      AS t_double,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_REFUND_STATUS')      AS t_refund_st,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_COUPON_ISSUE')       AS t_coupon,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_APP_BUG')            AS t_appbug,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_APP_CRASH')          AS t_crash,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_FEEDBACK')           AS t_fb
), tagmap AS (
  SELECT
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_CANCEL')       AS g_cancel,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_DELAY')        AS g_delay,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_MISSING_ITEM') AS g_missing,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_WRONG_ITEM')   AS g_wrong,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_QUALITY')      AS g_qual,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_RIDER_ISSUE')  AS g_rider,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_REFUND')       AS g_refund,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_PAYMENT_FAIL') AS g_payfail,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_APP_BUG')      AS g_appbug,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_FEEDBACK')     AS g_fb
)
INSERT INTO public.ticket_title_tags (ticket_title_id, tag_id)
SELECT t, g FROM (
  SELECT (SELECT t_cancel FROM titlemap)     AS t, (SELECT g_cancel FROM tagmap)  AS g
  UNION ALL SELECT (SELECT t_notrecv FROM titlemap), (SELECT g_delay FROM tagmap)
  UNION ALL SELECT (SELECT t_delay FROM titlemap),   (SELECT g_delay FROM tagmap)
  UNION ALL SELECT (SELECT t_missing FROM titlemap), (SELECT g_missing FROM tagmap)
  UNION ALL SELECT (SELECT t_wrong FROM titlemap),   (SELECT g_wrong FROM tagmap)
  UNION ALL SELECT (SELECT t_quality FROM titlemap), (SELECT g_qual FROM tagmap)
  UNION ALL SELECT (SELECT t_rider FROM titlemap),   (SELECT g_rider FROM tagmap)
  UNION ALL SELECT (SELECT t_refund_req FROM titlemap), (SELECT g_refund FROM tagmap)
  UNION ALL SELECT (SELECT t_paid_fail FROM titlemap),  (SELECT g_payfail FROM tagmap)
  UNION ALL SELECT (SELECT t_double FROM titlemap),     (SELECT g_payfail FROM tagmap)
  UNION ALL SELECT (SELECT t_refund_st FROM titlemap),  (SELECT g_refund FROM tagmap)
  UNION ALL SELECT (SELECT t_coupon FROM titlemap),     (SELECT g_payfail FROM tagmap)
  UNION ALL SELECT (SELECT t_appbug FROM titlemap),     (SELECT g_appbug FROM tagmap)
  UNION ALL SELECT (SELECT t_crash FROM titlemap),      (SELECT g_appbug FROM tagmap)
  UNION ALL SELECT (SELECT t_fb FROM titlemap),         (SELECT g_fb FROM tagmap)
) pairs
WHERE t IS NOT NULL AND g IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
