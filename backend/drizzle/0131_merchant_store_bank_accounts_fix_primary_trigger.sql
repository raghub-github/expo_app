-- ============================================================================
-- 0131_merchant_store_bank_accounts_fix_primary_trigger.sql
-- Ensure only one primary bank account per store, even when edited via UI.
-- Replaces any existing merchant_store_bank_accounts_set_primary() function
-- and (re)creates the trigger in a deterministic way.
-- ============================================================================

-- Always replace the helper function with the correct implementation.
CREATE OR REPLACE FUNCTION merchant_store_bank_accounts_set_primary()
RETURNS TRIGGER AS $BODY$
BEGIN
  -- When a row is marked primary for a store, clear primary flag on all
  -- other rows for the same store before the UNIQUE index is checked.
  IF NEW.is_primary = TRUE THEN
    UPDATE merchant_store_bank_accounts
    SET is_primary = FALSE
    WHERE store_id = NEW.store_id
      AND id <> NEW.id
      AND is_primary = TRUE;
  END IF;
  RETURN NEW;
END;
$BODY$ LANGUAGE plpgsql;

-- Drop and recreate trigger so we are sure it points to the latest function.
DROP TRIGGER IF EXISTS merchant_store_bank_accounts_set_primary_trigger
  ON merchant_store_bank_accounts;

CREATE TRIGGER merchant_store_bank_accounts_set_primary_trigger
BEFORE INSERT OR UPDATE OF is_primary
ON merchant_store_bank_accounts
FOR EACH ROW
WHEN (NEW.is_primary = TRUE)
EXECUTE FUNCTION merchant_store_bank_accounts_set_primary();

