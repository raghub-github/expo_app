-- Rollback for 0422. Drops indexes + constraints + columns added by the
-- forward migration. Refunds recorded via the executor before the rollback
-- lose their execution/audit metadata (money paths themselves are in the
-- wallet ledgers + Razorpay records, so no financial loss).
DROP INDEX IF EXISTS public.order_refunds_actor_idx;
DROP INDEX IF EXISTS public.order_refunds_razorpay_refund_id_idx;
DROP INDEX IF EXISTS public.order_refunds_execution_status_idx;
DROP INDEX IF EXISTS public.order_refunds_execution_key_uniq;

ALTER TABLE public.order_refunds
  DROP CONSTRAINT IF EXISTS order_refunds_execution_route_check,
  DROP CONSTRAINT IF EXISTS order_refunds_execution_status_check;

ALTER TABLE public.order_refunds
  DROP COLUMN IF EXISTS order_gross_snapshot,
  DROP COLUMN IF EXISTS payment_method_snapshot,
  DROP COLUMN IF EXISTS payment_gateway_snapshot,
  DROP COLUMN IF EXISTS actor_user_agent,
  DROP COLUMN IF EXISTS actor_ip,
  DROP COLUMN IF EXISTS actor_role,
  DROP COLUMN IF EXISTS actor_name,
  DROP COLUMN IF EXISTS actor_email,
  DROP COLUMN IF EXISTS split_wallet_amount,
  DROP COLUMN IF EXISTS split_razorpay_amount,
  DROP COLUMN IF EXISTS customer_wallet_amount,
  DROP COLUMN IF EXISTS customer_wallet_ledger_id,
  DROP COLUMN IF EXISTS razorpay_response,
  DROP COLUMN IF EXISTS razorpay_payment_id,
  DROP COLUMN IF EXISTS razorpay_refund_id,
  DROP COLUMN IF EXISTS failure_reason,
  DROP COLUMN IF EXISTS failed_at,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS executed_at,
  DROP COLUMN IF EXISTS execution_key,
  DROP COLUMN IF EXISTS execution_route,
  DROP COLUMN IF EXISTS execution_status;
