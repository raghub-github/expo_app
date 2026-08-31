DROP INDEX IF EXISTS customer_store_bookmarks_customer_store_uidx;
DROP INDEX IF EXISTS customer_store_bookmarks_customer_idx;
-- Table left in place: existing saved stores must not be deleted on rollback.
