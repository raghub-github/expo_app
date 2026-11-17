-- =============================================================================
-- 0649_menu_review_noop_changes_cleanup.sql
-- I/O-safe cleanup: remove menu review change rows that are not real edits
-- (null / "" / [] / identical old_value vs new_value). Then drop PENDING EDIT
-- requests that have zero remaining field changes.
-- Idempotent. No live merchant_menu_items mutation.
-- =============================================================================

-- 1) Exact identical old/new
DELETE FROM merchant_menu_item_review_changes
WHERE old_value IS NOT DISTINCT FROM new_value;

-- 2) Empty-equivalent pairs (null / JSON null / "" / [])
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

-- 3) Whitespace-only string old vs empty-equivalent new (and vice versa already covered)
DELETE FROM merchant_menu_item_review_changes
WHERE
  jsonb_typeof(old_value) = 'string'
  AND jsonb_typeof(new_value) = 'string'
  AND TRIM(BOTH FROM (old_value #>> '{}')) = TRIM(BOTH FROM (new_value #>> '{}'));

-- 4) Numeric twins stored as number vs numeric string (e.g. 15 vs "15")
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

-- 5) PENDING EDIT requests with no remaining field diffs → delete (unique index frees the slot)
DELETE FROM merchant_menu_item_review_requests r
WHERE r.status = 'PENDING'
  AND r.request_type = 'EDIT'
  AND NOT EXISTS (
    SELECT 1
    FROM merchant_menu_item_review_changes c
    WHERE c.review_request_id = r.id
  );
