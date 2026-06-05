-- Separate pre-book vs search-boost tips on person-ride orders
ALTER TABLE orders_ride
  ADD COLUMN IF NOT EXISTS prebook_tip_amount numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_boost_tip_1 numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_boost_tip_2 numeric(10, 2) NOT NULL DEFAULT 0;

-- Best-effort backfill: treat existing customer_tip_amount as pre-book when no extension yet
UPDATE orders_ride
SET prebook_tip_amount = customer_tip_amount
WHERE prebook_tip_amount = 0
  AND customer_tip_amount > 0
  AND COALESCE(dispatch_retry_count, 0) = 0;
