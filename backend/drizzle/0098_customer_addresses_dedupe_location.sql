-- ============================================================================
-- CUSTOMER ADDRESSES: Prevent duplicate same-location entries (Swiggy/Zomato-style)
-- 1) One-time cleanup: keep oldest row per (customer_id, rounded lat, rounded lng)
-- 2) Unique index: same coordinates cannot be saved multiple times per customer
-- ============================================================================

-- 1) Cleanup existing duplicates (keep row with smallest id per customer + location)
DELETE FROM public.customer_addresses a
USING public.customer_addresses b
WHERE a.id > b.id
  AND a.customer_id = b.customer_id
  AND a.is_active = true
  AND (a.deleted_at IS NULL)
  AND b.is_active = true
  AND (b.deleted_at IS NULL)
  AND a.latitude IS NOT NULL
  AND b.latitude IS NOT NULL
  AND a.longitude IS NOT NULL
  AND b.longitude IS NOT NULL
  AND ROUND(a.latitude::numeric, 4) = ROUND(b.latitude::numeric, 4)
  AND ROUND(a.longitude::numeric, 4) = ROUND(b.longitude::numeric, 4);

-- 2) Unique index: one row per (customer, rounded coordinates) to block future duplicates
-- Only for non-null coordinates (partial index so we don't block multiple NULL locations)
CREATE UNIQUE INDEX IF NOT EXISTS unique_customer_location
ON public.customer_addresses (
  customer_id,
  ROUND(latitude::numeric, 4),
  ROUND(longitude::numeric, 4)
)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND is_active = true AND deleted_at IS NULL;

COMMENT ON INDEX public.unique_customer_location IS 'Prevent duplicate saved addresses at same coordinates per customer (4 decimal places ~11m).';
