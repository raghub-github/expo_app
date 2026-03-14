-- Ensure merchant_modifier_groups uses column group_code (not group_id).
-- Some DBs have group_code (e.g. from Drizzle); 0134 created group_id. Unify to group_code.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_modifier_groups' AND column_name = 'group_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_modifier_groups' AND column_name = 'group_code'
  ) THEN
    ALTER TABLE merchant_modifier_groups RENAME COLUMN group_id TO group_code;
  END IF;
END $$;
