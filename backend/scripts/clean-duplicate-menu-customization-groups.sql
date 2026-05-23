-- =============================================================================
-- Clean duplicate merchant_menu_item_customizations (same item + same group title)
--
-- Cause: dashboard save bug re-POSTed groups instead of PUT when numeric ids
-- were JSON strings — created duplicate "Extras", "Beverage", etc. on one item.
--
-- Strategy: keep the OLDEST row (lowest id) per (menu_item_id, title); delete
-- newer duplicates. Child addons on removed groups are deleted via ON DELETE CASCADE.
--
-- Usage:
--   1) Run SECTION A (preview) — review rows marked will_delete.
--   2) Optional: set menu_item filter in SECTION B (NULL = all items).
--   3) Run SECTION B inside a transaction; COMMIT if counts look right.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION A — PREVIEW (safe to run anytime)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    c.id,
    c.menu_item_id,
    m.item_name,
    m.store_id,
    c.customization_id,
    c.customization_title,
    c.customization_type,
    c.is_required,
    c.min_selection,
    c.max_selection,
    c.display_order,
    c.created_at,
    (
      SELECT COUNT(*)::int
      FROM merchant_menu_item_addons a
      WHERE a.customization_id = c.id
    ) AS addon_count,
    ROW_NUMBER() OVER (
      PARTITION BY c.menu_item_id, lower(trim(c.customization_title))
      ORDER BY c.id ASC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY c.menu_item_id, lower(trim(c.customization_title))
    ) AS dup_set_size
  FROM merchant_menu_item_customizations c
  INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id
)
SELECT
  id,
  menu_item_id,
  item_name,
  store_id,
  customization_title,
  customization_type,
  is_required,
  min_selection,
  max_selection,
  addon_count,
  created_at,
  CASE WHEN rn = 1 THEN 'keep' ELSE 'will_delete' END AS action
FROM ranked
WHERE dup_set_size > 1
ORDER BY menu_item_id, lower(trim(customization_title)), rn;

-- Summary count
WITH ranked AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER (
      PARTITION BY c.menu_item_id, lower(trim(c.customization_title))
      ORDER BY c.id ASC
    ) AS rn
  FROM merchant_menu_item_customizations c
)
SELECT COUNT(*) AS duplicate_groups_to_remove
FROM ranked
WHERE rn > 1;


-- ---------------------------------------------------------------------------
-- SECTION B — DELETE duplicates (transaction)
-- Set p_menu_item_id to a specific item (e.g. 27) or leave NULL for all items.
-- ---------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  p_menu_item_id bigint := NULL;  -- e.g. 27 for item #27 only; NULL = entire DB
  v_deleted_groups int := 0;
  v_deleted_addons int := 0;
BEGIN
  -- Count addons that will cascade away (informational)
  SELECT COUNT(*)::int INTO v_deleted_addons
  FROM merchant_menu_item_addons a
  WHERE a.customization_id IN (
    SELECT x.id
    FROM (
      SELECT
        c.id,
        ROW_NUMBER() OVER (
          PARTITION BY c.menu_item_id, lower(trim(c.customization_title))
          ORDER BY c.id ASC
        ) AS rn
      FROM merchant_menu_item_customizations c
      WHERE p_menu_item_id IS NULL OR c.menu_item_id = p_menu_item_id
    ) x
    WHERE x.rn > 1
  );

  DELETE FROM merchant_menu_item_customizations c
  WHERE c.id IN (
    SELECT x.id
    FROM (
      SELECT
        c2.id,
        ROW_NUMBER() OVER (
          PARTITION BY c2.menu_item_id, lower(trim(c2.customization_title))
          ORDER BY c2.id ASC
        ) AS rn
      FROM merchant_menu_item_customizations c2
      WHERE p_menu_item_id IS NULL OR c2.menu_item_id = p_menu_item_id
    ) x
    WHERE x.rn > 1
  );

  GET DIAGNOSTICS v_deleted_groups = ROW_COUNT;

  RAISE NOTICE 'Removed % duplicate customization group(s); ~% addon row(s) cascaded.',
    v_deleted_groups, v_deleted_addons;
END $$;

-- Verify: should return 0 rows
WITH ranked AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER (
      PARTITION BY c.menu_item_id, lower(trim(c.customization_title))
      ORDER BY c.id ASC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY c.menu_item_id, lower(trim(c.customization_title))
    ) AS dup_set_size
  FROM merchant_menu_item_customizations c
)
SELECT COUNT(*) AS remaining_duplicate_sets
FROM ranked
WHERE dup_set_size > 1 AND rn > 1;

-- Review then:
COMMIT;
-- ROLLBACK;


-- ---------------------------------------------------------------------------
-- SECTION C (optional) — duplicate add-ons inside ONE group (same addon_name)
-- Run only if the same option appears twice under a single group.
-- ---------------------------------------------------------------------------
/*
BEGIN;

DELETE FROM merchant_menu_item_addons a
WHERE a.id IN (
  SELECT x.id
  FROM (
    SELECT
      a2.id,
      ROW_NUMBER() OVER (
        PARTITION BY a2.customization_id, lower(trim(a2.addon_name))
        ORDER BY a2.id ASC
      ) AS rn
    FROM merchant_menu_item_addons a2
  ) x
  WHERE x.rn > 1
);

COMMIT;
*/
