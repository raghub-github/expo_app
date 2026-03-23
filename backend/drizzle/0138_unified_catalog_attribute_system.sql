-- =============================================================================
-- Unified Catalog Engine (Menu → Multi-Industry) - Attribute System
-- -----------------------------------------------------------------------------
-- Adds dynamic attribute support with validation-by-definition:
-- - store_type_config (feature toggles per store type)
-- - attribute_definitions (schema for allowed attributes per store type)
-- - item_attributes (values for items, keyed by attribute_id)
-- - item_variant_attributes (values for variants, keyed by attribute_id)
--
-- NOTE: This migration is designed to be FOOD-safe:
-- - It does not remove or rename any existing merchant_menu_* tables/columns.
-- - FOOD endpoints can continue using legacy columns while we backfill.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Strong enums (data types, attribute scopes, combo semantics)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_attribute_data_type') THEN
    CREATE TYPE catalog_attribute_data_type AS ENUM ('string', 'number', 'boolean', 'enum', 'date');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_attribute_scope') THEN
    CREATE TYPE catalog_attribute_scope AS ENUM ('ITEM', 'VARIANT', 'BOTH');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_combo_type') THEN
    CREATE TYPE merchant_menu_combo_type AS ENUM ('FIXED', 'CUSTOMIZABLE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_combo_pricing_strategy') THEN
    CREATE TYPE merchant_menu_combo_pricing_strategy AS ENUM (
      'FIXED_PRICE',
      'DERIVE_FROM_COMPONENTS',
      'HYBRID'
    );
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 1) Store type feature toggles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_type_config (
  store_type store_type PRIMARY KEY,

  enable_addons BOOLEAN NOT NULL DEFAULT TRUE,
  enable_combos BOOLEAN NOT NULL DEFAULT TRUE,

  -- Pharma requirements
  enable_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  enable_prescription BOOLEAN NOT NULL DEFAULT FALSE,

  -- Used for Grocery (weight/quantity) and optionally Pharma/Food
  enable_weight BOOLEAN NOT NULL DEFAULT FALSE
);

-- -----------------------------------------------------------------------------
-- 2) Allowed attribute definitions per store type
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attribute_definitions (
  id BIGSERIAL PRIMARY KEY,
  store_type store_type NOT NULL,

  -- UI/contract key (no uncontrolled free-form input)
  attribute_name TEXT NOT NULL,

  -- string | number | boolean | enum | date
  data_type catalog_attribute_data_type NOT NULL,

  required BOOLEAN NOT NULL DEFAULT FALSE,

  -- Arbitrary validation constraints (interpreted by backend validator)
  validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Optional UI hints (label/unit/help/default/placeholder/etc.)
  selection_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Whether an attribute is intended to live at item-level, variant-level, or both.
  applies_to catalog_attribute_scope NOT NULL DEFAULT 'ITEM',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(store_type, attribute_name)
);

CREATE INDEX IF NOT EXISTS attribute_definitions_store_type_idx
  ON attribute_definitions(store_type);

-- -----------------------------------------------------------------------------
-- 3) Item attribute values (generic JSONB values)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_attributes (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  attribute_id BIGINT NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  value JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(item_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS item_attributes_item_id_idx
  ON item_attributes(item_id);

CREATE INDEX IF NOT EXISTS item_attributes_attribute_id_idx
  ON item_attributes(attribute_id);

-- -----------------------------------------------------------------------------
-- Data integrity: ensure attribute store_type + scope match the target row
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_item_attributes_store_type_and_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_store_type store_type;
  v_attr_store_type store_type;
  v_applies_to catalog_attribute_scope;
BEGIN
  SELECT s.store_type
    INTO v_item_store_type
  FROM merchant_menu_items mi
  INNER JOIN merchant_stores s ON s.id = mi.store_id
  WHERE mi.id = NEW.item_id;

  SELECT ad.store_type, ad.applies_to
    INTO v_attr_store_type, v_applies_to
  FROM attribute_definitions ad
  WHERE ad.id = NEW.attribute_id;

  IF v_item_store_type IS NULL OR v_attr_store_type IS NULL THEN
    RAISE EXCEPTION 'ATTRIBUTE_STORE_TYPE_RESOLUTION_FAILED item_id=%, attribute_id=%', NEW.item_id, NEW.attribute_id;
  END IF;

  IF v_item_store_type <> v_attr_store_type THEN
    RAISE EXCEPTION 'ATTRIBUTE_STORE_TYPE_MISMATCH item_store_type=%, attribute_store_type=% item_id=%, attribute_id=%',
      v_item_store_type, v_attr_store_type, NEW.item_id, NEW.attribute_id;
  END IF;

  IF v_applies_to NOT IN ('ITEM', 'BOTH') THEN
    RAISE EXCEPTION 'ATTRIBUTE_SCOPE_MISMATCH expected=ITEM|BOTH actual=% attribute_id=%',
      v_applies_to, NEW.attribute_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_item_attributes_store_type_and_scope ON item_attributes;
CREATE TRIGGER trg_enforce_item_attributes_store_type_and_scope
BEFORE INSERT OR UPDATE ON item_attributes
FOR EACH ROW
EXECUTE FUNCTION enforce_item_attributes_store_type_and_scope();

-- -----------------------------------------------------------------------------
-- 4) Variant attribute values (for edge cases: size/color attributes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_variant_attributes (
  id BIGSERIAL PRIMARY KEY,
  variant_id BIGINT NOT NULL REFERENCES merchant_menu_item_variants(id) ON DELETE CASCADE,
  attribute_id BIGINT NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  value JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(variant_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS item_variant_attributes_variant_id_idx
  ON item_variant_attributes(variant_id);

CREATE INDEX IF NOT EXISTS item_variant_attributes_attribute_id_idx
  ON item_variant_attributes(attribute_id);

CREATE OR REPLACE FUNCTION enforce_item_variant_attributes_store_type_and_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_store_type store_type;
  v_attr_store_type store_type;
  v_applies_to catalog_attribute_scope;
BEGIN
  SELECT s.store_type
    INTO v_item_store_type
  FROM merchant_menu_item_variants v
  INNER JOIN merchant_menu_items mi ON mi.id = v.menu_item_id
  INNER JOIN merchant_stores s ON s.id = mi.store_id
  WHERE v.id = NEW.variant_id;

  SELECT ad.store_type, ad.applies_to
    INTO v_attr_store_type, v_applies_to
  FROM attribute_definitions ad
  WHERE ad.id = NEW.attribute_id;

  IF v_item_store_type IS NULL OR v_attr_store_type IS NULL THEN
    RAISE EXCEPTION 'VARIANT_ATTRIBUTE_STORE_TYPE_RESOLUTION_FAILED variant_id=%, attribute_id=%', NEW.variant_id, NEW.attribute_id;
  END IF;

  IF v_item_store_type <> v_attr_store_type THEN
    RAISE EXCEPTION 'VARIANT_ATTRIBUTE_STORE_TYPE_MISMATCH item_store_type=%, attribute_store_type=% variant_id=%, attribute_id=%',
      v_item_store_type, v_attr_store_type, NEW.variant_id, NEW.attribute_id;
  END IF;

  IF v_applies_to NOT IN ('VARIANT', 'BOTH') THEN
    RAISE EXCEPTION 'VARIANT_ATTRIBUTE_SCOPE_MISMATCH expected=VARIANT|BOTH actual=% attribute_id=%',
      v_applies_to, NEW.attribute_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_item_variant_attributes_store_type_and_scope ON item_variant_attributes;
CREATE TRIGGER trg_enforce_item_variant_attributes_store_type_and_scope
BEFORE INSERT OR UPDATE ON item_variant_attributes
FOR EACH ROW
EXECUTE FUNCTION enforce_item_variant_attributes_store_type_and_scope();

-- -----------------------------------------------------------------------------
-- 5) Combo system - generic fields (fixed vs customizable)
-- -----------------------------------------------------------------------------
ALTER TABLE merchant_menu_combos
  ADD COLUMN IF NOT EXISTS combo_type merchant_menu_combo_type DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS pricing_strategy merchant_menu_combo_pricing_strategy DEFAULT 'FIXED_PRICE',
  ADD COLUMN IF NOT EXISTS combo_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS merchant_menu_combos_combo_type_idx
  ON merchant_menu_combos(store_id, combo_type);

