-- 0652_menu_item_image_rejection_reason_io_safe_rollback.sql
-- Rollback is intentionally a no-op for column drops: rejection_reason is used by
-- live Partner Menu / Control Merchant Portal flows. Only clear comments if needed.
--
-- Do NOT DROP rejection_reason / moderated_at / moderated_by here.

BEGIN;

COMMENT ON COLUMN public.merchant_menu_items.rejection_reason IS
  'Agent-provided reason when item photo/menu entry is rejected (shown to merchant).';

COMMENT ON COLUMN public.merchant_menu_item_images.rejection_reason IS NULL;

COMMIT;
