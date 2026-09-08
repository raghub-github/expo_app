-- Rollback 0604: remove only the seeded menu-report title codes.
-- Dashboard-curated rows with the same title_text are left in place.

BEGIN;

DELETE FROM public.ticket_titles
WHERE title_code IN (
  'CUST_MENU_INACCURATE_PHOTOS',
  'CUST_MENU_ITEMS_MISSING',
  'CUST_MENU_OTHER_ISSUE'
);

COMMIT;
