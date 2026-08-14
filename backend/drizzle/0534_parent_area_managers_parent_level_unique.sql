-- Fix: area-manager PARENT registration failed with
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Background: parent_area_managers links an area manager to a parent, optionally scoped to a
-- store (store_id). Store-level links (store_id set) are de-duped by the existing 3-col unique
-- `unique_parent_store_am (parent_id, store_id, area_manager_id)` and work fine (child flow).
--
-- The PARENT-level link is inserted with store_id = NULL and de-duped via
-- `ON CONFLICT (parent_id, area_manager_id)`. After the unique was changed to the 3-col form,
-- that 2-col conflict target matched NO constraint → 42P10. (And NULL store_id is "distinct"
-- in the 3-col unique, so it can't enforce one-parent-level-link-per-AM anyway.)
--
-- Add a PARTIAL unique index for the parent-level link only (store_id IS NULL). It provides a
-- matching target for the parent-register ON CONFLICT AND enforces at most one parent-level
-- link per (parent, area_manager). Store-level rows (store_id set) are untouched.
--
-- Safe: verified 0 duplicate (parent_id, area_manager_id) rows with store_id IS NULL before
-- creating this unique index.

CREATE UNIQUE INDEX IF NOT EXISTS parent_area_managers_parent_am_null_store_uniq
  ON public.parent_area_managers (parent_id, area_manager_id)
  WHERE store_id IS NULL;
