-- =============================================================================
-- Assign Area Manager to stores so "Area Manager" shows on Merchant Profile UI
-- Run in Supabase SQL Editor. Replace 'GMMC1002' with your store_id (see sidebar on Profile).
-- =============================================================================

-- 1) Assign area manager id 1 to your store (edit store_id and area_manager_id as needed)
UPDATE merchant_stores
SET area_manager_id = 1
WHERE store_id = 'GMMC1002';

-- 2) Optional: assign same area manager to all stores that don't have one
-- UPDATE merchant_stores SET area_manager_id = 1 WHERE area_manager_id IS NULL;

-- 3) Optional: assign by internal id (e.g. store id = 29)
-- UPDATE merchant_stores SET area_manager_id = 1 WHERE id = 29;

-- =============================================================================
-- If area manager still doesn't show: ensure area_managers row exists and has user_id.
-- Check: SELECT * FROM area_managers WHERE id = 1;
-- Check: SELECT id, full_name, email, mobile FROM system_users WHERE id = (SELECT user_id FROM area_managers WHERE id = 1);
-- If area_managers.id = 1 has user_id pointing to a valid system_users row, name/email/mobile will show.
-- =============================================================================

-- Optional fallback: show AM name/email/mobile from store columns (no area_managers needed)
-- UPDATE merchant_stores
-- SET am_name = 'Area Manager Name', am_mobile = '+919876543210', am_email = 'am@example.com'
-- WHERE store_id = 'GMMC1002';
