-- ============================================================================
-- Add is_popular and display_order to service_points for location search
-- Migration: 0093_service_points_popular
-- ============================================================================

-- Add columns for popular localities list
ALTER TABLE service_points
  ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Index for popular list query: active popular items by display order
CREATE INDEX IF NOT EXISTS service_points_popular_list_idx
  ON service_points(is_active, is_popular, display_order)
  WHERE is_popular = TRUE;

-- Index for search by name (ilike/prefix)
CREATE INDEX IF NOT EXISTS service_points_name_idx ON service_points(name);

COMMENT ON COLUMN service_points.is_popular IS 'Show in popular localities list on location search page';
COMMENT ON COLUMN service_points.display_order IS 'Order in popular localities list (lower first)';
