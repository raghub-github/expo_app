-- Repair: merchant_modifier_options may exist from partial 0134 run without modifier_group_id.
-- Adds column and creates indexes if missing.

DO $$
DECLARE
  has_group_id boolean;
  row_count bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_modifier_options') THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_modifier_options' AND column_name = 'modifier_group_id') THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_modifier_options' AND column_name = 'group_id') INTO has_group_id;
  ALTER TABLE merchant_modifier_options
    ADD COLUMN modifier_group_id BIGINT REFERENCES merchant_modifier_groups(id) ON DELETE CASCADE;
  IF has_group_id THEN
    UPDATE merchant_modifier_options SET modifier_group_id = group_id WHERE modifier_group_id IS NULL;
  END IF;
  SELECT COUNT(*) FROM merchant_modifier_options INTO row_count;
  IF row_count = 0 OR has_group_id THEN
    ALTER TABLE merchant_modifier_options ALTER COLUMN modifier_group_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS merchant_modifier_options_group_id_idx
  ON merchant_modifier_options(modifier_group_id);
CREATE INDEX IF NOT EXISTS merchant_modifier_options_display_order_idx
  ON merchant_modifier_options(modifier_group_id, display_order);
