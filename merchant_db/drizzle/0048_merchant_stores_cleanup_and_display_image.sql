-- 1) Backfill NULLs so cards never show empty: display name, cuisine_types, food_categories, avg_preparation_time_minutes.
UPDATE public.merchant_stores
SET
    store_display_name = COALESCE(store_display_name, store_name),
    cuisine_types = COALESCE(cuisine_types, ARRAY['Restaurant']::text[]),
    food_categories = COALESCE(food_categories, ARRAY['Food']::text[]),
    avg_preparation_time_minutes = COALESCE(avg_preparation_time_minutes, 30)
WHERE TRUE;

-- 2) Ensure stores with banner are active and accepting orders (so they show in listing).
UPDATE public.merchant_stores
SET
    status = 'ACTIVE',
    approval_status = 'APPROVED',
    is_active = true,
    is_accepting_orders = true
WHERE banner_url IS NOT NULL;
