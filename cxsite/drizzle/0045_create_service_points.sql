-- ============================================================================
-- Create Service Points Table
-- Migration: 0045_create_service_points
-- ============================================================================

-- Create service_points table to store GatiMitra service locations
CREATE TABLE IF NOT EXISTS service_points (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES system_users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT service_points_latitude_check CHECK (latitude >= 6 AND latitude <= 37),
  CONSTRAINT service_points_longitude_check CHECK (longitude >= 68 AND longitude <= 98)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS service_points_city_idx ON service_points(city);
CREATE INDEX IF NOT EXISTS service_points_location_idx ON service_points(latitude, longitude);
CREATE INDEX IF NOT EXISTS service_points_is_active_idx ON service_points(is_active);
CREATE INDEX IF NOT EXISTS service_points_created_by_idx ON service_points(created_by);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_service_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_points_updated_at_trigger
  BEFORE UPDATE ON service_points
  FOR EACH ROW
  EXECUTE FUNCTION update_service_points_updated_at();

-- Add comments
COMMENT ON TABLE service_points IS 'Stores GatiMitra service point locations across India';
COMMENT ON COLUMN service_points.name IS 'Name of the service point';
COMMENT ON COLUMN service_points.city IS 'City where the service point is located';
COMMENT ON COLUMN service_points.latitude IS 'Latitude coordinate (India bounds: 6-37)';
COMMENT ON COLUMN service_points.longitude IS 'Longitude coordinate (India bounds: 68-98)';
COMMENT ON COLUMN service_points.address IS 'Full address of the service point';
COMMENT ON COLUMN service_points.is_active IS 'Whether the service point is currently active';
COMMENT ON COLUMN service_points.created_by IS 'System user who created this service point';
