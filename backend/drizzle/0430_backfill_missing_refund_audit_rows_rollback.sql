-- Rollback 0430 · remove the backfilled audit rows (identified by the marker).
DELETE FROM merchant_subscription_refunds
WHERE actor_subject_id = 'backfill'
  AND actor_role = 'system'
  AND reason = 'Backfilled audit row (refund predates audit-trail fix)';
