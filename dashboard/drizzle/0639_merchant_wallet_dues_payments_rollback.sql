-- Rollback 0639 merchant_wallet_dues_payments
DROP INDEX IF EXISTS public.merchant_wallet_dues_payments_status_idx;
DROP INDEX IF EXISTS public.merchant_wallet_dues_payments_order_id_idx;
DROP INDEX IF EXISTS public.merchant_wallet_dues_payments_store_created_idx;
DROP INDEX IF EXISTS public.merchant_wallet_dues_payments_rzp_payment_id_uidx;
DROP TABLE IF EXISTS public.merchant_wallet_dues_payments;
