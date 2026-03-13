-- =============================================================================
-- 0120_menu_governance_and_safety.sql
-- Unified approval_status model for categories, items, combos
-- and safety constraints for pricing and counts.
--
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Shared approval status enum (if we want a generic type)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_approval_status') THEN
    CREATE TYPE merchant_menu_approval_status AS ENUM ('pending', 'approved', 'rejected', 'auto_approved');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) Items: align approval fields and add rejection_reason
-- ---------------------------------------------------------------------------
ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS approval_status merchant_menu_approval_status DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS merchant_menu_items_approval_idx
  ON merchant_menu_items (store_id, approval_status)
  WHERE approval_status IN ('PENDING', 'APPROVED');

-- Ensure soft-delete index is present for live queries
CREATE INDEX IF NOT EXISTS merchant_menu_items_not_deleted_idx
  ON merchant_menu_items (store_id, is_deleted)
  WHERE is_deleted IS FALSE;

-- Basic price non-negative guards (Postgres does not support IF NOT EXISTS for constraints directly)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_menu_items_base_price_non_negative'
  ) THEN
    ALTER TABLE merchant_menu_items
      ADD CONSTRAINT chk_menu_items_base_price_non_negative
      CHECK (base_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_menu_items_selling_price_non_negative'
  ) THEN
    ALTER TABLE merchant_menu_items
      ADD CONSTRAINT chk_menu_items_selling_price_non_negative
      CHECK (selling_price >= 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3) Categories: governance fields
-- ---------------------------------------------------------------------------
ALTER TABLE merchant_menu_categories
  ADD COLUMN IF NOT EXISTS approval_status merchant_menu_approval_status DEFAULT 'auto_approved',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS merchant_menu_categories_approval_idx
  ON merchant_menu_categories (store_id, approval_status)
  WHERE approval_status IN ('pending', 'approved');

-- ---------------------------------------------------------------------------
-- 4) Combos: governance fields
-- ---------------------------------------------------------------------------
ALTER TABLE merchant_menu_combos
  ADD COLUMN IF NOT EXISTS approval_status merchant_menu_approval_status DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS merchant_menu_combos_approval_idx
  ON merchant_menu_combos (store_id, approval_status)
  WHERE approval_status IN ('pending', 'approved');

-- Price >= 0 safeguard for combos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_menu_combos_price_positive'
  ) THEN
    ALTER TABLE merchant_menu_combos
      ADD CONSTRAINT chk_menu_combos_price_positive
      CHECK (combo_price >= 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5) Variants & addons: non-negative price constraints
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_menu_item_variants_price_non_negative'
  ) THEN
    ALTER TABLE merchant_menu_item_variants
      ADD CONSTRAINT chk_menu_item_variants_price_non_negative
      CHECK (variant_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_menu_item_addons_price_non_negative'
  ) THEN
    ALTER TABLE merchant_menu_item_addons
      ADD CONSTRAINT chk_menu_item_addons_price_non_negative
      CHECK (addon_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_menu_addons_price_non_negative'
  ) THEN
    ALTER TABLE merchant_menu_addons
      ADD CONSTRAINT chk_menu_addons_price_non_negative
      CHECK (addon_price >= 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 6) Safety-related helper indexes for combos/components
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS merchant_menu_combo_components_item_idx
  ON merchant_menu_combo_components (menu_item_id);

