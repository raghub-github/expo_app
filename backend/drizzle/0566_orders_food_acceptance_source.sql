-- Who accepted the food order: DASH-MX-PORT | PARTNERSITE | MX-APP.
-- I/O-safe: nullable TEXT with no default (PG adds the column as metadata, no
-- table rewrite). No CHECK, no index, no backfill — those would scan/write
-- orders_food on apply and add extra write I/O on every accept. Display infers
-- from accepted_by_label when this column is still null.

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS acceptance_source TEXT;

COMMENT ON COLUMN public.orders_food.acceptance_source IS
  'Canonical accept channel: DASH-MX-PORT (dashboard merchant portal), PARTNERSITE, MX-APP. Null = infer from accepted_by_label.';
