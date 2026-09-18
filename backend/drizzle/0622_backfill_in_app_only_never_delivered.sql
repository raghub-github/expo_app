-- =============================================================================
-- 0622_backfill_in_app_only_never_delivered.sql
-- Historical hygiene: __in_app_only__ rows must never look like FCM success.
-- Idempotent: only rewrites rows still marked delivered with no error_code.
-- =============================================================================

-- Critical / kill-visible style templates → NO_PUSH_TOKEN
UPDATE public.notification_dispatch_logs
SET
  status = 'failed',
  error_code = 'NO_PUSH_TOKEN',
  error_message = COALESCE(
    error_message,
    'Backfill: in-app only — FCM was never sent'
  ),
  failed_at = COALESCE(failed_at, now()),
  delivered_at = NULL
WHERE device_token = '__in_app_only__'
  AND channel = 'in_app'
  AND status = 'delivered'
  AND (error_code IS NULL OR error_code = '')
  AND (
    template_code IN (
      'RIDER_NEW_ORDER',
      'RIDER_DISPATCH_OFFER',
      'MERCHANT_NEW_ORDER'
    )
    OR lower(coalesce(priority, '')) = 'critical'
  );

-- All other __in_app_only__ inbox rows → IN_APP_ONLY (not push delivered)
UPDATE public.notification_dispatch_logs
SET
  status = 'failed',
  error_code = 'IN_APP_ONLY',
  error_message = COALESCE(
    error_message,
    'Backfill: in-app inbox only — FCM was never sent'
  ),
  failed_at = COALESCE(failed_at, now()),
  delivered_at = NULL
WHERE device_token = '__in_app_only__'
  AND channel = 'in_app'
  AND status = 'delivered'
  AND (error_code IS NULL OR error_code = '');
