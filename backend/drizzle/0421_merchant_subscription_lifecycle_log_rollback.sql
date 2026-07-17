-- Rollback for 0421_merchant_subscription_lifecycle_log.sql.
-- Auto-renewal itself still works (money paths untouched); only the
-- audit trail + email dedupe is lost.
DROP TABLE IF EXISTS merchant_subscription_notifications;
DROP TABLE IF EXISTS merchant_subscription_renewal_attempts;
