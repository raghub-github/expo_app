-- RLS policies for orders_food so merchant dashboard can read orders
-- API uses service_role (bypasses RLS); these policies help direct Supabase client access

-- Enable RLS if not already
ALTER TABLE public.orders_food ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if any
DROP POLICY IF EXISTS "Allow read orders_food for merchant stores" ON public.orders_food;

-- Allow SELECT: merchants can read their store's orders
-- Uses merchant_user_store_access to link auth.uid() to store_id
CREATE POLICY "Allow read orders_food for merchant stores"
  ON public.orders_food
  FOR SELECT
  USING (
    merchant_store_id IS NULL
    OR merchant_store_id IN (
      SELECT mss.store_id
      FROM public.merchant_user_store_access mss
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

-- Allow UPDATE: merchants can update status of their store's orders
CREATE POLICY "Allow update orders_food for merchant stores"
  ON public.orders_food
  FOR UPDATE
  USING (
    merchant_store_id IN (
      SELECT mss.store_id
      FROM public.merchant_user_store_access mss
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

-- Service role bypasses RLS - API will work regardless
-- These policies enable direct client access for authenticated merchants
