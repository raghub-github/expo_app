-- Migration: Optimize reviews capture and indexing for User Insights page
-- This migration adds indexes and ensures proper review data capture

-- Add index on merchant_store_id for customer_ratings_given if target_type is MERCHANT
-- This helps quickly fetch reviews for a specific merchant store
CREATE INDEX IF NOT EXISTS customer_ratings_given_target_merchant_idx 
ON customer_ratings_given(target_type, target_id) 
WHERE target_type = 'MERCHANT';

-- Add index on created_at for sorting reviews by date
CREATE INDEX IF NOT EXISTS customer_ratings_given_created_at_idx 
ON customer_ratings_given(created_at DESC);

-- Add index on merchant_response for filtering reviews with/without responses
CREATE INDEX IF NOT EXISTS customer_ratings_given_merchant_response_idx 
ON customer_ratings_given(merchant_responded_at) 
WHERE merchant_responded_at IS NOT NULL;

-- Add index on is_flagged for filtering flagged reviews
CREATE INDEX IF NOT EXISTS customer_ratings_given_is_flagged_idx 
ON customer_ratings_given(is_flagged) 
WHERE is_flagged = true;

-- Add index on overall_rating for filtering by rating
CREATE INDEX IF NOT EXISTS customer_ratings_given_overall_rating_idx 
ON customer_ratings_given(overall_rating);

-- Add composite index for merchant store reviews with rating
CREATE INDEX IF NOT EXISTS customer_ratings_given_merchant_rating_idx 
ON customer_ratings_given(target_type, target_id, overall_rating, created_at DESC) 
WHERE target_type = 'MERCHANT';

-- Add index on review_text for full-text search (if needed in future)
-- Note: This requires pg_trgm extension for better text search
-- CREATE INDEX IF NOT EXISTS customer_ratings_given_review_text_idx 
-- ON customer_ratings_given USING gin(review_text gin_trgm_ops);

-- Ensure merchant_store_ratings table has proper indexes (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_store_ratings') THEN
    CREATE INDEX IF NOT EXISTS merchant_store_ratings_store_id_created_idx 
    ON merchant_store_ratings(store_id, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS merchant_store_ratings_rating_idx 
    ON merchant_store_ratings(rating);
    
    CREATE INDEX IF NOT EXISTS merchant_store_ratings_merchant_response_idx 
    ON merchant_store_ratings(merchant_responded_at) 
    WHERE merchant_responded_at IS NOT NULL;
  END IF;
END $$;

-- Add comment to document the optimization
COMMENT ON INDEX customer_ratings_given_target_merchant_idx IS 'Index for quickly fetching merchant store reviews';
COMMENT ON INDEX customer_ratings_given_created_at_idx IS 'Index for sorting reviews by date';
COMMENT ON INDEX customer_ratings_given_merchant_rating_idx IS 'Composite index for merchant reviews with rating and date sorting';
