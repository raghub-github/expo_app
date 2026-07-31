-- Rollback 0470: accept-linked daily subscription fee column.

ALTER TABLE public.rider_subscriptions
  DROP COLUMN IF EXISTS last_accept_fee_on_date;
