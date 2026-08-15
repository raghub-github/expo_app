-- Composite index to keep the shared rider-availability engine's bounding-box +
-- freshness query efficient (queryRiderAvailabilityCandidates in
-- @gatimitra/rider-availability, used by both customer-serviceability and the
-- Super Admin Geo Rx dashboard). Small table (one row per rider), so a plain
-- blocking CREATE INDEX is fine — no PostGIS/Redis GEO needed for this.
CREATE INDEX IF NOT EXISTS rider_current_locations_geo_fresh_idx
  ON rider_current_locations (updated_at DESC, lat, lng);
