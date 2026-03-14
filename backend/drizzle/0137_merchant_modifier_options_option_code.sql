-- Ensure merchant_modifier_options uses column option_code (not option_id).
-- Unify to option_code so dashboard/backend work with DBs that have option_code.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_modifier_options' AND column_name = 'option_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_modifier_options' AND column_name = 'option_code'
  ) THEN
    ALTER TABLE merchant_modifier_options RENAME COLUMN option_id TO option_code;
  END IF;
END $$;
