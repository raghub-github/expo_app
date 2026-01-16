-- ============================================================================
-- MERCHANT REGISTRATION & RELATIONSHIP MAPPING
-- Migration: 0012_merchant_registration_and_relationships
-- Database: Supabase PostgreSQL
-- ============================================================================

-- ============================================================================
-- REGISTRATION & ONBOARDING
-- ============================================================================

-- Store Registration Progress
CREATE TABLE merchant_store_registration_progress (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT NOT NULL REFERENCES merchant_parents(id) ON DELETE CASCADE,
  store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Progress Tracking
  current_step INTEGER NOT NULL DEFAULT 1,
  total_steps INTEGER DEFAULT 6,
  completed_steps INTEGER DEFAULT 0,
  
  -- Step Status
  step_1_completed BOOLEAN DEFAULT FALSE, -- Basic Info
  step_2_completed BOOLEAN DEFAULT FALSE, -- Address & Location
  step_3_completed BOOLEAN DEFAULT FALSE, -- Documents (GST, PAN, FSSAI)
  step_4_completed BOOLEAN DEFAULT FALSE, -- Bank Details
  step_5_completed BOOLEAN DEFAULT FALSE, -- Menu Setup
  step_6_completed BOOLEAN DEFAULT FALSE, -- Final Review
  
  -- Form Data (Preserve incomplete data)
  form_data JSONB DEFAULT '{}',
  
  -- Status
  registration_status TEXT DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'
  completed_at TIMESTAMP WITH TIME ZONE,
  abandoned_at TIMESTAMP WITH TIME ZONE,
  abandonment_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(parent_id, store_id)
);

CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_parent_id_idx ON merchant_store_registration_progress(parent_id);
CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_store_id_idx ON merchant_store_registration_progress(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_status_idx ON merchant_store_registration_progress(registration_status);

-- ============================================================================
-- ENHANCE ORDERS TABLE - MERCHANT RELATIONSHIPS
-- ============================================================================

-- Add merchant snapshot data to orders (preserve at time of order)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS merchant_store_name TEXT, -- Snapshot
  ADD COLUMN IF NOT EXISTS merchant_cuisine_types TEXT[], -- Snapshot
  ADD COLUMN IF NOT EXISTS merchant_avg_prep_time INTEGER, -- Snapshot
  ADD COLUMN IF NOT EXISTS merchant_commission_rate NUMERIC(5, 2), -- Snapshot
  ADD COLUMN IF NOT EXISTS merchant_gst_number TEXT; -- Snapshot

-- ============================================================================
-- MERCHANT-ORDER LINK TABLE (Order Association)
-- ============================================================================

CREATE TABLE merchant_store_orders (
  id BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT REFERENCES merchant_parents(id) ON DELETE SET NULL,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  
  -- Order Type
  order_type order_type NOT NULL,
  service_type service_type NOT NULL,
  
  -- Financial
  order_value NUMERIC(12, 2) DEFAULT 0,
  commission_amount NUMERIC(12, 2) DEFAULT 0,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  merchant_payout NUMERIC(12, 2) DEFAULT 0,
  
  -- Status
  order_status order_status_type,
  
  -- Timestamps
  order_placed_at TIMESTAMP WITH TIME ZONE,
  order_completed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id, order_id)
);

CREATE INDEX IF NOT EXISTS merchant_store_orders_merchant_id_idx ON merchant_store_orders(merchant_id);
CREATE INDEX IF NOT EXISTS merchant_store_orders_store_id_idx ON merchant_store_orders(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_orders_order_id_idx ON merchant_store_orders(order_id);
CREATE INDEX IF NOT EXISTS merchant_store_orders_order_type_idx ON merchant_store_orders(order_type);
CREATE INDEX IF NOT EXISTS merchant_store_orders_service_type_idx ON merchant_store_orders(service_type);
CREATE INDEX IF NOT EXISTS merchant_store_orders_order_status_idx ON merchant_store_orders(order_status);

-- ============================================================================
-- MERCHANT RATINGS & REVIEWS (From Customers)
-- ============================================================================

CREATE TABLE merchant_store_ratings (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  customer_id BIGINT,
  
  -- Rating
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  food_rating SMALLINT CHECK (food_rating >= 1 AND food_rating <= 5),
  service_rating SMALLINT CHECK (service_rating >= 1 AND service_rating <= 5),
  packaging_rating SMALLINT CHECK (packaging_rating >= 1 AND packaging_rating <= 5),
  
  -- Review
  review_text TEXT,
  review_title TEXT,
  
  -- Media
  review_images TEXT[],
  
  -- Helpful
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  
  -- Response
  merchant_response TEXT,
  merchant_responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Moderation
  is_verified BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_ratings_store_id_idx ON merchant_store_ratings(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_ratings_order_id_idx ON merchant_store_ratings(order_id);
CREATE INDEX IF NOT EXISTS merchant_store_ratings_customer_id_idx ON merchant_store_ratings(customer_id);
CREATE INDEX IF NOT EXISTS merchant_store_ratings_rating_idx ON merchant_store_ratings(rating);
CREATE INDEX IF NOT EXISTS merchant_store_ratings_created_at_idx ON merchant_store_ratings(created_at);

-- ============================================================================
-- MERCHANT ANALYTICS (Daily/Monthly Aggregates)
-- ============================================================================

CREATE TABLE merchant_store_daily_analytics (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  analytics_date DATE NOT NULL,
  
  -- Order Metrics
  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  cancelled_orders INTEGER DEFAULT 0,
  
  -- Financial Metrics
  gross_revenue NUMERIC(12, 2) DEFAULT 0,
  net_revenue NUMERIC(12, 2) DEFAULT 0,
  total_commission NUMERIC(12, 2) DEFAULT 0,
  total_tax NUMERIC(12, 2) DEFAULT 0,
  total_discounts NUMERIC(12, 2) DEFAULT 0,
  
  -- Performance Metrics
  avg_preparation_time_minutes INTEGER,
  avg_delivery_time_minutes INTEGER,
  avg_rating NUMERIC(3, 2),
  
  -- Service-Specific
  food_orders INTEGER DEFAULT 0,
  parcel_orders INTEGER DEFAULT 0,
  ride_orders INTEGER DEFAULT 0,
  
  -- Metadata
  analytics_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id, analytics_date)
);

CREATE INDEX IF NOT EXISTS merchant_store_daily_analytics_store_id_idx ON merchant_store_daily_analytics(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_daily_analytics_date_idx ON merchant_store_daily_analytics(analytics_date);

-- ============================================================================
-- FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================================

-- Function: Get active stores for a parent
CREATE OR REPLACE FUNCTION get_parent_active_stores(p_parent_id BIGINT)
RETURNS TABLE (
  store_id BIGINT,
  store_name TEXT,
  city TEXT,
  status store_status,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ms.id, ms.store_name, ms.city, ms.status, ms.is_active
  FROM merchant_stores ms
  WHERE ms.parent_id = p_parent_id
    AND ms.is_active = TRUE
    AND ms.deleted_at IS NULL
  ORDER BY ms.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get store menu with items
CREATE OR REPLACE FUNCTION get_store_menu(p_store_id BIGINT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'store_id', p_store_id,
    'categories', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'category', row_to_json(mc.*),
          'items', (
            SELECT jsonb_agg(row_to_json(mi.*))
            FROM merchant_menu_items mi
            WHERE mi.category_id = mc.id AND mi.is_active = TRUE
          )
        )
      )
      FROM merchant_menu_categories mc
      WHERE mc.store_id = p_store_id AND mc.is_active = TRUE
      ORDER BY mc.display_order),
      '[]'::jsonb
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active Stores with Details
CREATE OR REPLACE VIEW active_merchant_stores AS
SELECT 
  ms.id,
  ms.store_id,
  ms.store_name,
  mp.parent_name,
  ms.city,
  ms.status,
  ms.is_active,
  ms.is_accepting_orders,
  msa.is_available,
  COUNT(DISTINCT mss.id) AS enabled_services_count,
  STRING_AGG(DISTINCT mss.service_type::text, ',') AS enabled_services
FROM merchant_stores ms
JOIN merchant_parents mp ON ms.parent_id = mp.id
LEFT JOIN merchant_store_availability msa ON ms.id = msa.store_id
LEFT JOIN merchant_store_services mss ON ms.id = mss.store_id AND mss.is_enabled = TRUE
WHERE ms.is_active = TRUE
  AND ms.deleted_at IS NULL
  AND ms.status = 'ACTIVE'
GROUP BY ms.id, ms.store_id, ms.store_name, mp.parent_name, ms.city, 
         ms.status, ms.is_active, ms.is_accepting_orders, msa.is_available;

-- View: Store Payout Summary
CREATE OR REPLACE VIEW merchant_store_payout_summary AS
SELECT 
  ms.id AS store_id,
  ms.store_name,
  COUNT(DISTINCT msp.id) AS total_payouts,
  COUNT(DISTINCT msp.id) FILTER (WHERE msp.status = 'PENDING') AS pending_payouts,
  COUNT(DISTINCT msp.id) FILTER (WHERE msp.status = 'COMPLETED') AS completed_payouts,
  COALESCE(SUM(msp.net_payout_amount) FILTER (WHERE msp.status = 'COMPLETED'), 0) AS total_paid_amount,
  COALESCE(SUM(msp.net_payout_amount) FILTER (WHERE msp.status = 'PENDING'), 0) AS pending_amount
FROM merchant_stores ms
LEFT JOIN merchant_store_payouts msp ON ms.id = msp.store_id
GROUP BY ms.id, ms.store_name;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE merchant_store_registration_progress IS 'Tracks store registration/onboarding progress. Preserves incomplete data.';
COMMENT ON TABLE merchant_store_orders IS 'Links orders to merchant stores. Provides merchant-centric order view.';
COMMENT ON TABLE merchant_store_ratings IS 'Customer ratings and reviews for merchant stores.';
COMMENT ON TABLE merchant_store_daily_analytics IS 'Daily aggregated analytics per store. Populated by cron job.';
COMMENT ON FUNCTION get_parent_active_stores IS 'Returns all active stores for a parent merchant.';
COMMENT ON FUNCTION get_store_menu IS 'Returns complete menu with categories and items as JSONB.';
COMMENT ON VIEW active_merchant_stores IS 'Shows all active stores with service information.';
COMMENT ON VIEW merchant_store_payout_summary IS 'Shows payout summary per store.';
