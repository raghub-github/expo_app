-- 0224: Two changes that together unlock the customer ticket flow.
--
-- (A) FIX BUG: Add customer-specific values to `unified_ticket_title` enum.
--     The seed migration 0223 used CUSTOMER_* values in ticket_titles.intake_unified_title
--     (which is plain TEXT) but the actual `unified_tickets.ticket_title` column
--     is this enum, and the customer-support insert hits:
--       "invalid input value for enum unified_ticket_title: \"CUSTOMER_ORDER_CANCEL_REQUEST\""
--
-- (B) NEW FEATURE: Add `ticket_titles.applicable_order_statuses TEXT[]` so the
--     customer raise wizard can show ONLY status-relevant concerns once an
--     order is selected (cancel before pickup, damaged after delivery, etc.).
--     NULL = always show; otherwise array of orders_core.status / current_status
--     codes the title is relevant for. Plus a sentinel 'NO_ORDER' for titles
--     that should appear when the customer chose "not about an order".

BEGIN;

-- ---------- (A) Customer enum values -----------------------------------------
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is supported on PG 9.6+ and is safe
-- inside a transaction on PG 12+. Supabase is on a modern version.

ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_ORDER_CANCEL_REQUEST';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_ORDER_MODIFY_REQUEST';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_ORDER_NOT_RECEIVED';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_ORDER_DELAYED';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_MISSING_ITEM';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_WRONG_ITEM';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_DAMAGED_ITEM';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_FOOD_QUALITY';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_RIDER_ISSUE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_REFUND_REQUEST';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_PAYMENT_FAILED';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_DOUBLE_CHARGE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_REFUND_STATUS';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_COUPON_ISSUE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_WALLET_ISSUE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_LOGIN_ISSUE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_OTP_NOT_RECEIVED';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_PROFILE_UPDATE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_ADDRESS_ISSUE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_ACCOUNT_DELETE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_APP_CRASH';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_APP_BUG';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_NOTIFICATIONS_ISSUE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_SAFETY_CONCERN';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_FEEDBACK';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_OTHER';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_GENERAL_QUERY';

-- ---------- (B) Status-driven concerns ---------------------------------------
ALTER TABLE public.ticket_titles
  ADD COLUMN IF NOT EXISTS applicable_order_statuses TEXT[];

CREATE INDEX IF NOT EXISTS ticket_titles_applicable_statuses_idx
  ON public.ticket_titles USING GIN (applicable_order_statuses);

COMMIT;
