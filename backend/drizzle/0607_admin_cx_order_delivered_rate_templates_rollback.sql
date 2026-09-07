-- Rollback 0607: remove only the two rating templates + their label keys.
-- Does not delete other ADMIN_CX_* templates or the labels map.

DELETE FROM public.notification_templates
WHERE code IN ('ADMIN_CX_ORDER_DELIVERED_DE', 'ADMIN_CX_ORDER_DELIVERED_SP')
  AND locale = 'en';

UPDATE public.notification_settings
SET
  value = COALESCE(value, '{}'::jsonb)
    - 'ADMIN_CX_ORDER_DELIVERED_DE'
    - 'ADMIN_CX_ORDER_DELIVERED_SP',
  updated_at = now()
WHERE key = 'admin_cx_template_labels'
  AND (
    value ? 'ADMIN_CX_ORDER_DELIVERED_DE'
    OR value ? 'ADMIN_CX_ORDER_DELIVERED_SP'
  );
