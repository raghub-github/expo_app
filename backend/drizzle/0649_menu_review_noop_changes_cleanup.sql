-- =============================================================================
-- 0649_menu_review_noop_changes_cleanup.sql
-- I/O-safe cleanup: remove menu review change rows that are not real edits
-- (null / "" / [] / identical old_value vs new_value). Then drop PENDING EDIT
-- requests that have zero remaining field changes.
-- Idempotent. No live merchant_menu_items mutation.
-- =============================================================================

DELETE FROM merchant_menu_item_review_changes
WHERE old_value IS NOT DISTINCT FROM new_value;

DELETE FROM merchant_menu_item_review_changes
WHERE
  (
    old_value IS NULL
    OR old_value = 'null'::jsonb
    OR old_value = '""'::jsonb
    OR old_value = '[]'::jsonb
    OR (
      jsonb_typeof(old_value) = 'string'
      AND TRIM(BOTH FROM (old_value #>> '{}')) = ''
    )
  )
  AND
  (
    new_value IS NULL
    OR new_value = 'null'::jsonb
    OR new_value = '""'::jsonb
    OR new_value = '[]'::jsonb
    OR (
      jsonb_typeof(new_value) = 'string'
      AND TRIM(BOTH FROM (new_value #>> '{}')) = ''
    )
  );

DELETE FROM merchant_menu_item_review_changes
WHERE
  jsonb_typeof(old_value) = 'string'
  AND jsonb_typeof(new_value) = 'string'
  AND TRIM(BOTH FROM (old_value #>> '{}')) = TRIM(BOTH FROM (new_value #>> '{}'));

DELETE FROM merchant_menu_item_review_changes
WHERE
  (
    (jsonb_typeof(old_value) = 'number' AND jsonb_typeof(new_value) = 'string')
    OR (jsonb_typeof(old_value) = 'string' AND jsonb_typeof(new_value) = 'number')
  )
  AND TRIM(BOTH FROM (old_value #>> '{}')) ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND TRIM(BOTH FROM (new_value #>> '{}')) ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND TRIM(BOTH FROM (old_value #>> '{}'))::numeric
      = TRIM(BOTH FROM (new_value #>> '{}'))::numeric;

DELETE FROM merchant_menu_item_review_requests r
WHERE r.status = 'PENDING'
  AND r.request_type = 'EDIT'
  AND NOT EXISTS (
    SELECT 1
    FROM merchant_menu_item_review_changes c
    WHERE c.review_request_id = r.id
  );
