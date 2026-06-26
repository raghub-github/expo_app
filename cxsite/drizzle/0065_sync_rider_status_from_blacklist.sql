-- ============================================================================
-- 0065: Sync riders.status from blacklist (one-time for existing data)
-- Set status = BLOCKED for riders whose most recent "all" blacklist entry
-- is permanent and active. Does not set ACTIVE (whitelisted) - only BLOCKED.
-- ============================================================================

UPDATE riders r
SET status = 'BLOCKED'
FROM (
  SELECT DISTINCT ON (rider_id) rider_id, banned, is_permanent
  FROM blacklist_history
  WHERE LOWER(service_type::text) = 'all'
  ORDER BY rider_id, created_at DESC
) latest
WHERE r.id = latest.rider_id
  AND latest.banned = true
  AND latest.is_permanent = true
  AND r.status = 'ACTIVE';
