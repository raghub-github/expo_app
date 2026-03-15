-- RLS policies for merchant_menu_items and merchant_menu_categories
-- Allow merchants to read/write their store's menu items and categories.
-- Uses merchant_user_store_access + merchant_users to link auth.uid() to store access.
-- Note: merchant_stores.store_id is text; merchant_menu_items.store_id is bigint (references merchant_stores.id).
-- The API (service role) bypasses RLS; these policies enable direct client access when needed.

-- merchant_menu_categories: Allow SELECT for stores the merchant has access to
DROP POLICY IF EXISTS "Allow read merchant_menu_categories for merchant stores" ON public.merchant_menu_categories;
CREATE POLICY "Allow read merchant_menu_categories for merchant stores"
  ON public.merchant_menu_categories
  FOR SELECT
  USING (
    store_id IN (
      SELECT ms.id
      FROM public.merchant_stores ms
      JOIN public.merchant_user_store_access mss ON mss.store_id = ms.id
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

DROP POLICY IF EXISTS "Allow insert merchant_menu_categories for merchant stores" ON public.merchant_menu_categories;
CREATE POLICY "Allow insert merchant_menu_categories for merchant stores"
  ON public.merchant_menu_categories
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT ms.id
      FROM public.merchant_stores ms
      JOIN public.merchant_user_store_access mss ON mss.store_id = ms.id
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

DROP POLICY IF EXISTS "Allow update merchant_menu_categories for merchant stores" ON public.merchant_menu_categories;
CREATE POLICY "Allow update merchant_menu_categories for merchant stores"
  ON public.merchant_menu_categories
  FOR UPDATE
  USING (
    store_id IN (
      SELECT ms.id
      FROM public.merchant_stores ms
      JOIN public.merchant_user_store_access mss ON mss.store_id = ms.id
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

DROP POLICY IF EXISTS "Allow delete merchant_menu_categories for merchant stores" ON public.merchant_menu_categories;
CREATE POLICY "Allow delete merchant_menu_categories for merchant stores"
  ON public.merchant_menu_categories
  FOR DELETE
  USING (
    store_id IN (
      SELECT ms.id
      FROM public.merchant_stores ms
      JOIN public.merchant_user_store_access mss ON mss.store_id = ms.id
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

-- merchant_menu_items: Allow SELECT for stores the merchant has access to
DROP POLICY IF EXISTS "Allow read merchant_menu_items for merchant stores" ON public.merchant_menu_items;
CREATE POLICY "Allow read merchant_menu_items for merchant stores"
  ON public.merchant_menu_items
  FOR SELECT
  USING (
    store_id IN (
      SELECT ms.id
      FROM public.merchant_stores ms
      JOIN public.merchant_user_store_access mss ON mss.store_id = ms.id
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

DROP POLICY IF EXISTS "Allow insert merchant_menu_items for merchant stores" ON public.merchant_menu_items;
CREATE POLICY "Allow insert merchant_menu_items for merchant stores"
  ON public.merchant_menu_items
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT ms.id
      FROM public.merchant_stores ms
      JOIN public.merchant_user_store_access mss ON mss.store_id = ms.id
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

DROP POLICY IF EXISTS "Allow update merchant_menu_items for merchant stores" ON public.merchant_menu_items;
CREATE POLICY "Allow update merchant_menu_items for merchant stores"
  ON public.merchant_menu_items
  FOR UPDATE
  USING (
    store_id IN (
      SELECT ms.id
      FROM public.merchant_stores ms
      JOIN public.merchant_user_store_access mss ON mss.store_id = ms.id
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );

DROP POLICY IF EXISTS "Allow delete merchant_menu_items for merchant stores" ON public.merchant_menu_items;
CREATE POLICY "Allow delete merchant_menu_items for merchant stores"
  ON public.merchant_menu_items
  FOR DELETE
  USING (
    store_id IN (
      SELECT ms.id
      FROM public.merchant_stores ms
      JOIN public.merchant_user_store_access mss ON mss.store_id = ms.id
      JOIN public.merchant_users mu ON mu.id = mss.user_id
      WHERE mu.user_id = auth.uid()::text
        AND (mss.is_active IS NULL OR mss.is_active = true)
    )
  );
