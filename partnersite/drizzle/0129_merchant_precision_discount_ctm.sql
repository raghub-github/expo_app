-- Mirror of backend/drizzle/0412_merchant_precision_discount_ctm.sql

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS merchant_precision_discount NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders_core.merchant_precision_discount IS
  'Merchant store precision/cart checkout discount only (₹). Platform offers and platform coupons are never stored here.';
