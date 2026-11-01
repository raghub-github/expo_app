-- 0646_merchant_order_decision_device.sql
-- Record WHICH device of a store accepted or rejected an order.
--
-- One order is shown on every device signed into a store, so "the store
-- accepted it" is not enough to answer "who accepted it, and from where".
-- orders_food already carries accepted_at / cancelled_at and the *_by_label
-- free-text fields, but nothing that identifies the deciding device.
--
-- BACKWARD COMPATIBLE: additive nullable columns only. No backfill — rows
-- decided before this migration genuinely have no device recorded, and
-- inventing one would make the audit trail lie.
--
-- PRODUCTION: apply only through the authorized migration process.

BEGIN;

-- 1) The authoritative decision, on the order itself, so "who decided this"
--    is answerable without scanning the action log.
ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS decision_device_id text,
  ADD COLUMN IF NOT EXISTS decision_user_id text;

COMMENT ON COLUMN public.orders_food.decision_device_id IS
  'user_device_sessions.device_id of the store device whose accept/reject won. NULL for orders decided before 0646, or decided by cron/admin rather than a device.';
COMMENT ON COLUMN public.orders_food.decision_user_id IS
  'Authenticated merchant user behind the winning accept/reject. NULL when the decision was not made by a signed-in device.';

-- Every action, not just the winning one, is attributed too — but through the
-- existing merchant_order_food_actions.metadata jsonb ("device_id"), which needs
-- no schema change and therefore works whether or not this migration has run.

-- No index on decision_device_id: it is written once per order and read per
-- order (already keyed by id), never used as a search key. A low-selectivity
-- index here would cost write throughput on the order hot path for nothing.

COMMIT;
