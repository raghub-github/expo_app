-- ============================================================================
-- UNIFIED ORDERS TRACKING TABLES
-- Production-Grade Tracking System
-- Route snapshots, parcel tracking events, and COD collections
-- Migration: unified_orders_tracking
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Immutable Tracking: Tracking events never updated or deleted
-- - Complete History: All tracking events preserved
-- - Route Tracking: Route snapshots for distance and time calculations
-- - COD Tracking: Complete COD collection and deposit tracking
-- ============================================================================

-- ============================================================================
-- ORDER ROUTE SNAPSHOTS (Route Snapshots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_route_snapshots (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- SNAPSHOT DETAILS
  -- ==========================================================================
  snapshot_type TEXT NOT NULL, -- 'initial', 'updated', 'final', 'recalculated'
  distance_km NUMERIC(8, 2),
  duration_seconds INTEGER,
  polyline TEXT, -- Encoded polyline string
  
  -- ==========================================================================
  -- MAP SERVICE RESPONSE
  -- ==========================================================================
  mapbox_response JSONB, -- Mapbox API response (or other map service)
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Route snapshots are immutable - never updated or deleted
);

-- Indexes for order_route_snapshots
CREATE INDEX IF NOT EXISTS order_route_snapshots_order_id_idx ON public.order_route_snapshots(order_id);
CREATE INDEX IF NOT EXISTS order_route_snapshots_snapshot_type_idx ON public.order_route_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS order_route_snapshots_recorded_at_idx ON public.order_route_snapshots(recorded_at);
CREATE INDEX IF NOT EXISTS order_route_snapshots_order_recorded_idx ON public.order_route_snapshots(order_id, recorded_at);

-- Comments
COMMENT ON TABLE public.order_route_snapshots IS 'Route snapshots for orders. Tracks distance, duration, and polyline at different points in time. Immutable - never updated or deleted.';
COMMENT ON COLUMN public.order_route_snapshots.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_route_snapshots.snapshot_type IS 'Type of snapshot: initial, updated, final, recalculated.';
COMMENT ON COLUMN public.order_route_snapshots.distance_km IS 'Route distance in kilometers.';
COMMENT ON COLUMN public.order_route_snapshots.duration_seconds IS 'Route duration in seconds.';
COMMENT ON COLUMN public.order_route_snapshots.polyline IS 'Encoded polyline string for route visualization.';
COMMENT ON COLUMN public.order_route_snapshots.mapbox_response IS 'Map service API response (stored as JSONB for flexibility).';
COMMENT ON COLUMN public.order_route_snapshots.recorded_at IS 'When snapshot was recorded.';

-- ============================================================================
-- PARCEL TRACKING EVENTS (Parcel-Specific Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.parcel_tracking_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- EVENT DETAILS
  -- ==========================================================================
  event_type TEXT NOT NULL, -- 'picked_up', 'in_transit', 'out_for_delivery', 'delivery_attempted', 'delivered', 'returned'
  location TEXT, -- Current location description
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  status_description TEXT, -- Event description
  
  -- ==========================================================================
  -- HANDLING INFORMATION
  -- ==========================================================================
  handled_by TEXT, -- 'rider', 'warehouse', 'customer', 'merchant'
  
  -- ==========================================================================
  -- PROOF
  -- ==========================================================================
  proof_url TEXT, -- Photo/signature proof URL
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Tracking events are immutable - never updated or deleted
);

-- Indexes for parcel_tracking_events
CREATE INDEX IF NOT EXISTS parcel_tracking_events_order_id_idx ON public.parcel_tracking_events(order_id);
CREATE INDEX IF NOT EXISTS parcel_tracking_events_event_type_idx ON public.parcel_tracking_events(event_type);
CREATE INDEX IF NOT EXISTS parcel_tracking_events_handled_by_idx ON public.parcel_tracking_events(handled_by) WHERE handled_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS parcel_tracking_events_created_at_idx ON public.parcel_tracking_events(created_at);
CREATE INDEX IF NOT EXISTS parcel_tracking_events_order_created_idx ON public.parcel_tracking_events(order_id, created_at);

-- Comments
COMMENT ON TABLE public.parcel_tracking_events IS 'Parcel-specific tracking events. Immutable tracking log - never updated or deleted. Used for parcel tracking and customer notifications.';
COMMENT ON COLUMN public.parcel_tracking_events.order_id IS 'Foreign key to orders table. Must have order_type=''parcel''.';
COMMENT ON COLUMN public.parcel_tracking_events.event_type IS 'Type of tracking event: picked_up, in_transit, out_for_delivery, delivery_attempted, delivered, returned.';
COMMENT ON COLUMN public.parcel_tracking_events.location IS 'Location description where event occurred.';
COMMENT ON COLUMN public.parcel_tracking_events.lat IS 'Latitude where event occurred.';
COMMENT ON COLUMN public.parcel_tracking_events.lon IS 'Longitude where event occurred.';
COMMENT ON COLUMN public.parcel_tracking_events.status_description IS 'Description of the event.';
COMMENT ON COLUMN public.parcel_tracking_events.handled_by IS 'Who handled the parcel: rider, warehouse, customer, merchant.';
COMMENT ON COLUMN public.parcel_tracking_events.proof_url IS 'URL to proof photo/signature (if applicable).';

-- ============================================================================
-- COD COLLECTIONS (COD Collection Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cod_collections (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- COLLECTION DETAILS
  -- ==========================================================================
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  collected_by INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE RESTRICT,
  
  -- ==========================================================================
  -- COLLECTION METHOD
  -- ==========================================================================
  collection_method TEXT DEFAULT 'cash', -- 'cash', 'upi', 'card'
  transaction_id TEXT, -- Transaction ID (for digital payments)
  receipt_url TEXT, -- Receipt/proof URL
  
  -- ==========================================================================
  -- BANK DEPOSIT TRACKING
  -- ==========================================================================
  deposited_to_bank BOOLEAN DEFAULT FALSE,
  deposited_at TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for cod_collections
CREATE INDEX IF NOT EXISTS cod_collections_order_id_idx ON public.cod_collections(order_id);
CREATE INDEX IF NOT EXISTS cod_collections_collected_by_idx ON public.cod_collections(collected_by);
CREATE INDEX IF NOT EXISTS cod_collections_collected_at_idx ON public.cod_collections(collected_at);
CREATE INDEX IF NOT EXISTS cod_collections_collection_method_idx ON public.cod_collections(collection_method);
CREATE INDEX IF NOT EXISTS cod_collections_deposited_to_bank_idx ON public.cod_collections(deposited_to_bank) WHERE deposited_to_bank = FALSE;
CREATE INDEX IF NOT EXISTS cod_collections_transaction_id_idx ON public.cod_collections(transaction_id) WHERE transaction_id IS NOT NULL;

-- Comments
COMMENT ON TABLE public.cod_collections IS 'COD (Cash on Delivery) collection tracking. Tracks COD collections, collection method, and bank deposits. Used for COD reconciliation and financial reports.';
COMMENT ON COLUMN public.cod_collections.order_id IS 'Foreign key to orders table. Must have is_cod=true or order_type=''parcel'' with COD.';
COMMENT ON COLUMN public.cod_collections.amount IS 'COD amount collected (required, must be > 0).';
COMMENT ON COLUMN public.cod_collections.collected_at IS 'When COD was collected.';
COMMENT ON COLUMN public.cod_collections.collected_by IS 'Foreign key to riders table - rider who collected COD.';
COMMENT ON COLUMN public.cod_collections.collection_method IS 'Collection method: cash, upi, card.';
COMMENT ON COLUMN public.cod_collections.transaction_id IS 'Transaction ID (for digital payments like UPI or card).';
COMMENT ON COLUMN public.cod_collections.receipt_url IS 'URL to receipt/proof of collection.';
COMMENT ON COLUMN public.cod_collections.deposited_to_bank IS 'Whether COD was deposited to bank.';
COMMENT ON COLUMN public.cod_collections.deposited_at IS 'When COD was deposited to bank.';

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_route_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcel_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_collections ENABLE ROW LEVEL SECURITY;
