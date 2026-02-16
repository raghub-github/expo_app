# Fixes Applied to 0055_enterprise_ticket_system.sql

## Issues Fixed

### 1. Missing Columns in CREATE TABLE Statements
**Problem:** Columns were referenced in indexes/comments but not defined in CREATE TABLE.

**Fixed:**
- Added `group_id`, `display_order`, `metadata` to `ticket_titles` table
- Added `is_3pl_order`, `tpl_provider_id`, `tpl_direction`, `external_order_id`, `external_provider_name` to `tickets` table
- Added `rider_3pl_id`, `provider_id`, `external_provider_name`, `external_entity_id`, `external_entity_name` to `ticket_participants` table

### 2. PostgreSQL Doesn't Support `ADD COLUMN IF NOT EXISTS`
**Problem:** PostgreSQL doesn't have `ADD COLUMN IF NOT EXISTS` syntax.

**Fixed:**
- Replaced with proper column existence checks using `information_schema.columns`
- Added exception handling for cases where table doesn't exist yet

### 3. Index Creation on Non-Existent Columns
**Problem:** Indexes were being created on columns that might not exist if table was created in previous run.

**Fixed:**
- Wrapped index creation in conditional DO blocks
- Check column existence before creating indexes on 3PL columns

### 4. Constraint References Non-Existent Columns
**Problem:** CHECK constraint in `ticket_participants` references columns that might not exist.

**Fixed:**
- Drop and recreate constraint after adding all columns
- Ensure constraint is created with all required columns

## Migration Safety Features

1. **Idempotent ALTER Statements:** All ALTER TABLE statements check for column existence before adding
2. **Exception Handling:** Added exception handling for undefined_table errors
3. **Conditional Index Creation:** Indexes on optional columns are created conditionally
4. **Constraint Management:** Constraints are dropped and recreated to include new columns

## Execution Order

The migration is designed to be safe for multiple runs:

1. **CREATE TABLE IF NOT EXISTS** - Creates table if it doesn't exist (with all columns)
2. **ALTER TABLE** - Adds missing columns if table exists without them
3. **CREATE INDEX IF NOT EXISTS** - Creates indexes (conditionally for optional columns)

## Testing

To test the migration:
1. Run `0055_enterprise_ticket_system.sql` - should create all tables
2. Run it again - should be idempotent (no errors)
3. Run `0056_migrate_unified_tickets_to_enterprise.sql` - should migrate data

All fixes ensure the migration is idempotent and safe to run multiple times.
