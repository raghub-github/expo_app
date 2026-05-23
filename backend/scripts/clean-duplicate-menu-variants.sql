-- =============================================================================
-- Clean duplicate merchant_menu_item_variants (same item + same variant name)
--
-- Cause: dashboard save re-POSTed variants when numeric ids were JSON strings,
-- or duplicate rows were created on repeated saves.
--
-- Strategy: keep the OLDEST row (lowest id) per (menu_item_id, variant_name);
-- delete newer duplicates.
--
-- Usage:
--   1) Run SECTION A (preview) — review rows marked will_delete.
--   2) Set menu_item filter in SECTION B (NULL = all items, e.g. 27 for one item).
--   3) Run SECTION B inside a transaction; COMMIT if counts look right.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION A — PREVIEW (safe to run anytime)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    v.id,
    v.menu_item_id,
    m.item_name,
    m.store_id,
    v.variant_id,
    v.variant_name,
    v.variant_type,
    v.variant_price,
    v.display_order,
    v.is_default,
    v.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY v.menu_item_id, lower(trim(v.variant_name))
      ORDER BY v.id ASC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY v.menu_item_id, lower(trim(v.variant_name))
    ) AS dup_set_size
  FROM merchant_menu_item_variants v
  INNER JOIN merchant_menu_items m ON m.id = v.menu_item_id
)
SELECT
  id,
  menu_item_id,
  item_name,
  store_id,
  variant_name,
  variant_type,
  variant_price,
  display_order,
  is_default,
  created_at,
  CASE WHEN rn = 1 THEN 'keep' ELSE 'will_delete' END AS action
FROM ranked
WHERE dup_set_size > 1
ORDER BY menu_item_id, lower(trim(variant_name)), rn;

-- Summary count
WITH ranked AS (
  SELECT
    v.id,
    ROW_NUMBER() OVER (
      PARTITION BY v.menu_item_id, lower(trim(v.variant_name))
      ORDER BY v.id ASC
    ) AS rn
  FROM merchant_menu_item_variants v
)
SELECT COUNT(*) AS duplicate_variants_to_remove
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
  v_deleted_variants int := 0;
BEGIN
  DELETE FROM merchant_menu_item_variants v
  WHERE v.id IN (
    SELECT x.id
    FROM (
      SELECT
        v2.id,
        ROW_NUMBER() OVER (
          PARTITION BY v2.menu_item_id, lower(trim(v2.variant_name))
          ORDER BY v2.id ASC
        ) AS rn
      FROM merchant_menu_item_variants v2
      WHERE p_menu_item_id IS NULL OR v2.menu_item_id = p_menu_item_id
    ) x
    WHERE x.rn > 1
  );

  GET DIAGNOSTICS v_deleted_variants = ROW_COUNT;

  RAISE NOTICE 'Removed % duplicate variant row(s).', v_deleted_variants;
END $$;

-- Verify: should return 0
WITH ranked AS (
  SELECT
    v.id,
    COUNT(*) OVER (
      PARTITION BY v.menu_item_id, lower(trim(v.variant_name))
    ) AS dup_set_size,
    ROW_NUMBER() OVER (
      PARTITION BY v.menu_item_id, lower(trim(v.variant_name))
      ORDER BY v.id ASC
    ) AS rn
  FROM merchant_menu_item_variants v
)
SELECT COUNT(*) AS remaining_duplicate_variant_rows
FROM ranked
WHERE dup_set_size > 1 AND rn > 1;

-- Review then:
COMMIT;
-- ROLLBACK;
