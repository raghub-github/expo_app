-- Rollback 0625 rider RC manual-review notification templates.

SET statement_timeout = '15s';

DELETE FROM public.notification_templates
WHERE code IN ('RIDER_RC_MANUAL_VERIFIED', 'RIDER_RC_MANUAL_REJECTED');

RESET statement_timeout;
