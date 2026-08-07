-- 0513: Normalize service_type on customer-facing ticket titles & groups.
--
-- Requires 0512 (ticket_service_type value 'all').
--
-- Rules (customer ticket_section only):
--   food         — food delivery order / post-delivery chat topics
--   parcel       — parcel delivery order topics
--   person_ride  — ride / captain topics
--   all          — account, payments, app, general (visible on every service)
--
-- Idempotent: safe to re-run.

BEGIN;

-- ---------- 1. person_ride (rides) -------------------------------------------

UPDATE public.ticket_titles
SET
  service_type = 'person_ride'::ticket_service_type,
  intake_unified_service_type = COALESCE(intake_unified_service_type, 'RIDE')
WHERE ticket_section = 'customer'
  AND (
    title_code LIKE 'CUST_RIDE_%'
    OR customer_section_id = 'rides'
    OR group_id IN (SELECT id FROM public.ticket_groups WHERE group_code = 'CUST_RIDE')
  );

-- ---------- 2. food (food orders & post-delivery chat) -----------------------

UPDATE public.ticket_titles
SET
  service_type = 'food'::ticket_service_type,
  intake_unified_service_type = COALESCE(intake_unified_service_type, 'FOOD')
WHERE ticket_section = 'customer'
  AND title_code IN (
    'CUST_ORDER_CANCEL',
    'CUST_ORDER_MODIFY',
    'CUST_ORDER_NOT_RECEIVED',
    'CUST_DELAY',
    'CUST_ORDER_DELAYED',
    'CUST_MISSING_ITEM',
    'CUST_WRONG_ITEM',
    'CUST_DAMAGED',
    'CUST_DAMAGED_ITEM',
    'CUST_QUALITY',
    'CUST_RIDER_BEHAVIOR',
    'CUST_REFUND_REQUEST',
    'CUST_CHAT_SPILLAGE',
    'CUST_CHAT_MISSING',
    'CUST_CHAT_QUALITY',
    'CUST_CHAT_QUANTITY',
    'CUST_CHAT_NOT_RECEIVED'
  );

UPDATE public.ticket_titles tt
SET
  service_type = 'food'::ticket_service_type,
  intake_unified_service_type = COALESCE(tt.intake_unified_service_type, 'FOOD')
FROM public.ticket_groups tg
WHERE tt.ticket_section = 'customer'
  AND tt.group_id = tg.id
  AND tg.group_code IN (
    'CUST_POST_DELIVERY',
    'GRP_FOOD_ORDER_RELATED_CUSTOMER_CUSTOMER'
  );

UPDATE public.ticket_titles tt
SET
  service_type = 'food'::ticket_service_type,
  intake_unified_service_type = COALESCE(tt.intake_unified_service_type, 'FOOD')
FROM public.ticket_groups tg
WHERE tt.ticket_section = 'customer'
  AND tt.group_id = tg.id
  AND (
    tg.group_code LIKE 'GRP_FOOD%'
    OR tg.group_name ILIKE '%post pickup%'
    OR tg.group_name ILIKE '%post delivery%'
  )
  AND tt.service_type::text NOT IN ('person_ride', 'parcel', 'all');

-- ---------- 3. parcel (parcel orders) ----------------------------------------

UPDATE public.ticket_titles
SET
  service_type = 'parcel'::ticket_service_type,
  intake_unified_service_type = COALESCE(intake_unified_service_type, 'PARCEL')
WHERE ticket_section = 'customer'
  AND (
    title_code LIKE 'CUST_PARCEL_%'
    OR title_code LIKE 'PARCEL_%'
  );

UPDATE public.ticket_titles tt
SET
  service_type = 'parcel'::ticket_service_type,
  intake_unified_service_type = COALESCE(tt.intake_unified_service_type, 'PARCEL')
FROM public.ticket_groups tg
WHERE tt.ticket_section = 'customer'
  AND tt.group_id = tg.id
  AND (
    tg.group_code ILIKE '%parcel%'
    OR tg.group_name ILIKE '%parcel%'
  )
  AND tt.service_type::text NOT IN ('person_ride', 'all');

-- ---------- 4. all services (account / payments / app / general) -------------

UPDATE public.ticket_titles
SET
  service_type = 'all'::ticket_service_type,
  intake_unified_service_type = COALESCE(intake_unified_service_type, 'GENERAL')
WHERE ticket_section = 'customer'
  AND title_code IN (
    'CUST_PAYMENT_FAILED',
    'CUST_DOUBLE_CHARGE',
    'CUST_REFUND_STATUS',
    'CUST_COUPON_ISSUE',
    'CUST_WALLET_BALANCE',
    'CUST_WALLET_ISSUE',
    'CUST_LOGIN_ISSUE',
    'CUST_OTP',
    'CUST_PROFILE_UPDATE',
    'CUST_ADDRESS_ISSUE',
    'CUST_DELETE_ACCOUNT',
    'CUST_ACCOUNT_ISSUE',
    'CUST_APP_CRASH',
    'CUST_APP_BUG',
    'CUST_NOTIFICATIONS',
    'CUST_SAFETY',
    'CUST_FEEDBACK',
    'CUST_OTHER'
  );

UPDATE public.ticket_titles
SET
  service_type = 'all'::ticket_service_type,
  intake_unified_service_type = COALESCE(intake_unified_service_type, 'GENERAL')
WHERE ticket_section = 'customer'
  AND customer_section_id IN ('payments', 'account', 'app', 'general');

UPDATE public.ticket_titles tt
SET
  service_type = 'all'::ticket_service_type,
  intake_unified_service_type = COALESCE(tt.intake_unified_service_type, 'GENERAL')
FROM public.ticket_groups tg
WHERE tt.ticket_section = 'customer'
  AND tt.group_id = tg.id
  AND tg.group_code IN (
    'CUST_PAYMENTS',
    'CUST_ACCOUNT',
    'CUST_TECH',
    'CUST_GENERAL',
    'GRP_CUST_NON'
  )
  AND tt.service_type::text NOT IN ('food', 'parcel', 'person_ride');

-- Legacy seed used service_type = 'other' for cross-service customer topics.
UPDATE public.ticket_titles
SET
  service_type = 'all'::ticket_service_type,
  intake_unified_service_type = COALESCE(intake_unified_service_type, 'GENERAL')
WHERE ticket_section = 'customer'
  AND service_type::text = 'other';

-- ---------- 5. Customer groups (routing hints for admin UI) --------------------

UPDATE public.ticket_groups
SET service_type = 'person_ride'::ticket_service_type
WHERE ticket_section = 'customer'
  AND group_code = 'CUST_RIDE';

UPDATE public.ticket_groups
SET service_type = 'food'::ticket_service_type
WHERE ticket_section = 'customer'
  AND group_code IN (
    'CUST_ORDERS',
    'CUST_DELIVERY',
    'CUST_POST_DELIVERY',
    'GRP_CUST_ORDER',
    'GRP_FOOD_ORDER_RELATED_CUSTOMER_CUSTOMER'
  );

UPDATE public.ticket_groups
SET service_type = 'parcel'::ticket_service_type
WHERE ticket_section = 'customer'
  AND (group_code ILIKE '%parcel%' OR group_name ILIKE '%parcel%');

UPDATE public.ticket_groups
SET service_type = 'all'::ticket_service_type
WHERE ticket_section = 'customer'
  AND group_code IN (
    'CUST_PAYMENTS',
    'CUST_ACCOUNT',
    'CUST_TECH',
    'CUST_GENERAL',
    'GRP_CUST_NON'
  );

COMMIT;
