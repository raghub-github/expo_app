-- ============================================================================
-- UNIFIED ORDERS CANCELLATION AND RATINGS
-- Production-Grade Cancellation and Rating System
-- Tracks cancellation reasons and order ratings
-- Migration: unified_orders_cancellation
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Complete Cancellation Tracking: All cancellation details tracked
-- - Immutable Ratings: Ratings never updated or deleted
-- - Multi-Actor Ratings: Customers, merchants, riders can rate
-- ============================================================================

-- ============================================================================
-- ORDER CANCELLATION REASONS (Cancellation Details)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_cancellation_reasons (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- CANCELLATION DETAILS
  -- ==========================================================================
  cancelled_by TEXT NOT NULL, -- 'customer', 'rider', 'merchant', 'system', 'agent'
  cancelled_by_id INTEGER,
  reason_code TEXT NOT NULL, -- Standardized reason code
  reason_text TEXT, -- Human-readable reason text
  
  -- ==========================================================================
  -- REFUND INFORMATION
  -- ==========================================================================
  refund_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'not_applicable'
  refund_amount NUMERIC(12, 2),
  
  -- ==========================================================================
  -- PENALTY INFORMATION
  -- ==========================================================================
  penalty_applied BOOLEAN DEFAULT FALSE,
  penalty_amount NUMERIC(12, 2),
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for order_cancellation_reasons
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_order_id_idx ON public.order_cancellation_reasons(order_id);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_cancelled_by_idx ON public.order_cancellation_reasons(cancelled_by);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_cancelled_by_id_idx ON public.order_cancellation_reasons(cancelled_by_id) WHERE cancelled_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_reason_code_idx ON public.order_cancellation_reasons(reason_code);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_refund_status_idx ON public.order_cancellation_reasons(refund_status);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_created_at_idx ON public.order_cancellation_reasons(created_at);

-- Comments
COMMENT ON TABLE public.order_cancellation_reasons IS 'Cancellation details and reasons for orders. Tracks who cancelled, reason, refund status, and penalties.';
COMMENT ON COLUMN public.order_cancellation_reasons.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_cancellation_reasons.cancelled_by IS 'Who cancelled the order: customer, rider, merchant, system, agent.';
COMMENT ON COLUMN public.order_cancellation_reasons.cancelled_by_id IS 'ID of who cancelled the order.';
COMMENT ON COLUMN public.order_cancellation_reasons.reason_code IS 'Standardized reason code (e.g., "CUSTOMER_CHANGED_MIND", "RIDER_UNAVAILABLE").';
COMMENT ON COLUMN public.order_cancellation_reasons.reason_text IS 'Human-readable reason text.';
COMMENT ON COLUMN public.order_cancellation_reasons.refund_status IS 'Refund status: pending, processing, completed, failed, not_applicable.';
COMMENT ON COLUMN public.order_cancellation_reasons.refund_amount IS 'Amount refunded (if applicable).';
COMMENT ON COLUMN public.order_cancellation_reasons.penalty_applied IS 'Whether penalty was applied for cancellation.';
COMMENT ON COLUMN public.order_cancellation_reasons.penalty_amount IS 'Penalty amount (if applicable).';

-- ============================================================================
-- ORDER RATINGS (Order Ratings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_ratings (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id INTEGER REFERENCES public.riders(id) ON DELETE SET NULL,
  
  -- ==========================================================================
  -- RATING DETAILS
  -- ==========================================================================
  rated_by TEXT NOT NULL, -- 'customer', 'merchant', 'rider'
  rated_by_id INTEGER,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  
  -- ==========================================================================
  -- CATEGORY RATINGS
  -- ==========================================================================
  rating_categories JSONB DEFAULT '{}', -- e.g., {"punctuality": 5, "communication": 4, "food_quality": 5}
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Ratings are immutable - never updated or deleted
);

-- Indexes for order_ratings
CREATE INDEX IF NOT EXISTS order_ratings_order_id_idx ON public.order_ratings(order_id);
CREATE INDEX IF NOT EXISTS order_ratings_rider_id_idx ON public.order_ratings(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_ratings_rated_by_idx ON public.order_ratings(rated_by);
CREATE INDEX IF NOT EXISTS order_ratings_rated_by_id_idx ON public.order_ratings(rated_by_id) WHERE rated_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_ratings_rating_idx ON public.order_ratings(rating);
CREATE INDEX IF NOT EXISTS order_ratings_created_at_idx ON public.order_ratings(created_at);

-- Comments
COMMENT ON TABLE public.order_ratings IS 'Ratings given for orders. Customers rate riders/merchants, merchants rate riders, riders rate customers. Immutable - never updated or deleted.';
COMMENT ON COLUMN public.order_ratings.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_ratings.rider_id IS 'Foreign key to riders table (if rating is for rider).';
COMMENT ON COLUMN public.order_ratings.rated_by IS 'Who gave the rating: customer, merchant, rider.';
COMMENT ON COLUMN public.order_ratings.rated_by_id IS 'ID of who gave the rating.';
COMMENT ON COLUMN public.order_ratings.rating IS 'Rating value (1-5).';
COMMENT ON COLUMN public.order_ratings.comment IS 'Rating comment (optional).';
COMMENT ON COLUMN public.order_ratings.rating_categories IS 'Category ratings stored as JSONB (e.g., {"punctuality": 5, "communication": 4}).';

-- ============================================================================
-- ORDER DELIVERY IMAGES (Delivery Proof Images)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_delivery_images (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- IMAGE DETAILS
  -- ==========================================================================
  image_url TEXT NOT NULL,
  image_type TEXT, -- 'delivery_proof', 'signature', 'damage', 'other'
  uploaded_by TEXT, -- 'rider', 'customer', 'merchant', 'agent'
  uploaded_by_id BIGINT,
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  image_metadata JSONB DEFAULT '{}', -- Additional image metadata (size, dimensions, etc.)
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Ensure columns exist (for backward compatibility if table already exists)
DO $$
BEGIN
  -- Handle migration from old schema (url -> image_url)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'image_url'
  ) THEN
    -- First, set any NULL values to empty string
    UPDATE public.order_delivery_images 
    SET url = '' 
    WHERE url IS NULL;
    
    -- Then rename the column
    ALTER TABLE public.order_delivery_images 
      RENAME COLUMN url TO image_url;
    
    -- Ensure NOT NULL constraint
    ALTER TABLE public.order_delivery_images 
      ALTER COLUMN image_url SET NOT NULL;
  END IF;
  
  -- Add image_url column if it doesn't exist (and url doesn't exist either)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'image_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'url'
  ) THEN
    ALTER TABLE public.order_delivery_images 
      ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add image_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'image_type'
  ) THEN
    ALTER TABLE public.order_delivery_images 
      ADD COLUMN image_type TEXT;
  END IF;
  
  -- Add uploaded_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE public.order_delivery_images 
      ADD COLUMN uploaded_by TEXT;
  END IF;
  
  -- Add uploaded_by_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'uploaded_by_id'
  ) THEN
    ALTER TABLE public.order_delivery_images 
      ADD COLUMN uploaded_by_id BIGINT;
  END IF;
  
  -- Add image_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'image_metadata'
  ) THEN
    ALTER TABLE public.order_delivery_images 
      ADD COLUMN image_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.order_delivery_images 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Make image_url NOT NULL if it's nullable (after migration)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_delivery_images' 
      AND column_name = 'image_url'
      AND is_nullable = 'YES'
  ) THEN
    -- First, set default for any NULL values
    UPDATE public.order_delivery_images 
    SET image_url = '' 
    WHERE image_url IS NULL;
    
    -- Then alter column to NOT NULL
    ALTER TABLE public.order_delivery_images 
      ALTER COLUMN image_url SET NOT NULL;
  END IF;
END $$;

-- Indexes for order_delivery_images
CREATE INDEX IF NOT EXISTS order_delivery_images_order_id_idx ON public.order_delivery_images(order_id);
CREATE INDEX IF NOT EXISTS order_delivery_images_image_type_idx ON public.order_delivery_images(image_type) WHERE image_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_delivery_images_uploaded_by_idx ON public.order_delivery_images(uploaded_by) WHERE uploaded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_delivery_images_uploaded_by_id_idx ON public.order_delivery_images(uploaded_by_id) WHERE uploaded_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_delivery_images_created_at_idx ON public.order_delivery_images(created_at);

-- Comments
COMMENT ON TABLE public.order_delivery_images IS 'Delivery proof images and other images related to orders. Tracks image URL, type, and who uploaded it.';
COMMENT ON COLUMN public.order_delivery_images.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_delivery_images.image_url IS 'URL to the image (required).';
COMMENT ON COLUMN public.order_delivery_images.image_type IS 'Type of image: delivery_proof, signature, damage, other.';
COMMENT ON COLUMN public.order_delivery_images.uploaded_by IS 'Who uploaded the image: rider, customer, merchant, agent.';
COMMENT ON COLUMN public.order_delivery_images.uploaded_by_id IS 'ID of who uploaded the image.';
COMMENT ON COLUMN public.order_delivery_images.image_metadata IS 'Additional image metadata (size, dimensions, format, etc.).';

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_cancellation_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_images ENABLE ROW LEVEL SECURITY;
