-- ============================================================================
-- CONSTRAINTS AND VALIDATIONS
-- Migration: 0029_constraints_and_validations
-- Database: Supabase PostgreSQL
-- 
-- This file adds all missing constraints for data integrity and validation
-- ============================================================================

-- ============================================================================
-- CUSTOMER CONSTRAINTS
-- ============================================================================

-- Customers table constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    -- Mobile format validation
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customers_mobile_format'
    ) THEN
      ALTER TABLE customers
        ADD CONSTRAINT customers_mobile_format CHECK (primary_mobile ~ '^\+?[0-9]{10,15}$');
    END IF;
    
    -- Trust score range
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customers_trust_score_range'
    ) THEN
      ALTER TABLE customers
        ADD CONSTRAINT customers_trust_score_range CHECK (trust_score >= 0 AND trust_score <= 100);
    END IF;
    
    -- Fraud score range
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customers_fraud_score_range'
    ) THEN
      ALTER TABLE customers
        ADD CONSTRAINT customers_fraud_score_range CHECK (fraud_score >= 0 AND fraud_score <= 100);
    END IF;
    
    -- Wallet balance positive
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'customers' AND column_name = 'wallet_balance'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'customers_wallet_balance_positive'
      ) THEN
        ALTER TABLE customers
          ADD CONSTRAINT customers_wallet_balance_positive CHECK (wallet_balance >= 0);
      END IF;
    END IF;
  END IF;
END $$;

-- Customer addresses constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_addresses') THEN
    -- Latitude validation
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customer_addresses_latitude_valid'
    ) THEN
      ALTER TABLE customer_addresses
        ADD CONSTRAINT customer_addresses_latitude_valid 
        CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
    END IF;
    
    -- Longitude validation
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customer_addresses_longitude_valid'
    ) THEN
      ALTER TABLE customer_addresses
        ADD CONSTRAINT customer_addresses_longitude_valid 
        CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
    END IF;
  END IF;
END $$;

-- Customer wallet constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_wallet') THEN
    -- Balance positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customer_wallet_balance_positive'
    ) THEN
      ALTER TABLE customer_wallet
        ADD CONSTRAINT customer_wallet_balance_positive CHECK (current_balance >= 0);
    END IF;
    
    -- Locked amount positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customer_wallet_locked_positive'
    ) THEN
      ALTER TABLE customer_wallet
        ADD CONSTRAINT customer_wallet_locked_positive CHECK (locked_amount >= 0);
    END IF;
    
    -- Available balance positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customer_wallet_available_positive'
    ) THEN
      ALTER TABLE customer_wallet
        ADD CONSTRAINT customer_wallet_available_positive CHECK (available_balance >= 0);
    END IF;
  END IF;
END $$;

-- Customer wallet transactions constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_wallet_transactions') THEN
    -- Amount positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customer_wallet_transactions_amount_positive'
    ) THEN
      ALTER TABLE customer_wallet_transactions
        ADD CONSTRAINT customer_wallet_transactions_amount_positive CHECK (amount >= 0);
    END IF;
  END IF;
END $$;

-- Customer tips constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_tips_given') THEN
    -- Tip amount positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customer_tips_amount_positive'
    ) THEN
      ALTER TABLE customer_tips_given
        ADD CONSTRAINT customer_tips_amount_positive CHECK (tip_amount > 0);
    END IF;
  END IF;
END $$;

-- Customer ratings constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_ratings_given') THEN
    -- Overall rating range
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'customer_ratings_given_overall_rating_range'
    ) THEN
      ALTER TABLE customer_ratings_given
        ADD CONSTRAINT customer_ratings_given_overall_rating_range 
        CHECK (overall_rating >= 1 AND overall_rating <= 5);
    END IF;
    
    -- Food quality rating range
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'customer_ratings_given' AND column_name = 'food_quality_rating'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'customer_ratings_given_food_quality_range'
      ) THEN
        ALTER TABLE customer_ratings_given
          ADD CONSTRAINT customer_ratings_given_food_quality_range 
          CHECK (food_quality_rating IS NULL OR (food_quality_rating >= 1 AND food_quality_rating <= 5));
      END IF;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- ORDER CONSTRAINTS
-- ============================================================================

-- Order payments constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_payments') THEN
    -- Payment amount positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'order_payments_amount_positive'
    ) THEN
      ALTER TABLE order_payments
        ADD CONSTRAINT order_payments_amount_positive CHECK (payment_amount > 0);
    END IF;
    
    -- Payment attempt number positive
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'order_payments' AND column_name = 'payment_attempt_no'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'order_payments_attempt_positive'
      ) THEN
        ALTER TABLE order_payments
          ADD CONSTRAINT order_payments_attempt_positive CHECK (payment_attempt_no > 0);
      END IF;
    END IF;
  END IF;
END $$;

-- Order refunds constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_refunds') THEN
    -- Refund amount positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'order_refunds_amount_positive'
    ) THEN
      ALTER TABLE order_refunds
        ADD CONSTRAINT order_refunds_amount_positive CHECK (refund_amount > 0);
    END IF;
  END IF;
END $$;

-- Order items constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
    -- Quantity positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'order_items_quantity_positive'
    ) THEN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);
    END IF;
    
    -- Unit price non-negative
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'order_items' AND column_name = 'unit_price'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'order_items_unit_price_non_negative'
      ) THEN
        ALTER TABLE order_items
          ADD CONSTRAINT order_items_unit_price_non_negative CHECK (unit_price >= 0);
      END IF;
    END IF;
  END IF;
END $$;

-- Order food items constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_food_items') THEN
    -- Quantity positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'order_food_items_quantity_positive'
    ) THEN
      ALTER TABLE order_food_items
        ADD CONSTRAINT order_food_items_quantity_positive CHECK (quantity > 0);
    END IF;
    
    -- Unit price non-negative
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'order_food_items_unit_price_non_negative'
    ) THEN
      ALTER TABLE order_food_items
        ADD CONSTRAINT order_food_items_unit_price_non_negative CHECK (unit_price >= 0);
    END IF;
    
    -- Total price non-negative
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'order_food_items_total_price_non_negative'
    ) THEN
      ALTER TABLE order_food_items
        ADD CONSTRAINT order_food_items_total_price_non_negative CHECK (total_price >= 0);
    END IF;
  END IF;
END $$;

-- Order ratings constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_ratings') THEN
    -- Rating range
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'order_ratings_rating_range'
    ) THEN
      ALTER TABLE order_ratings
        ADD CONSTRAINT order_ratings_rating_range CHECK (rating >= 1 AND rating <= 5);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- MERCHANT CONSTRAINTS
-- ============================================================================

-- Merchant menu items constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_menu_items') THEN
    -- Base price positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_menu_items_base_price_positive'
    ) THEN
      ALTER TABLE merchant_menu_items
        ADD CONSTRAINT merchant_menu_items_base_price_positive CHECK (base_price > 0);
    END IF;
    
    -- Selling price positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_menu_items_selling_price_positive'
    ) THEN
      ALTER TABLE merchant_menu_items
        ADD CONSTRAINT merchant_menu_items_selling_price_positive CHECK (selling_price > 0);
    END IF;
  END IF;
END $$;

-- Merchant store payouts constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_store_payouts') THEN
    -- Payout amount positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_store_payouts_amount_positive'
    ) THEN
      ALTER TABLE merchant_store_payouts
        ADD CONSTRAINT merchant_store_payouts_amount_positive CHECK (payout_amount > 0);
    END IF;
    
    -- Net payout amount non-negative
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_store_payouts_net_amount_non_negative'
    ) THEN
      ALTER TABLE merchant_store_payouts
        ADD CONSTRAINT merchant_store_payouts_net_amount_non_negative CHECK (net_payout_amount >= 0);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- RIDER CONSTRAINTS
-- ============================================================================

-- Rider vehicles constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rider_vehicles') THEN
    -- Location validation (if columns exist)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'riders' AND column_name = 'lat'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'riders_latitude_valid'
      ) THEN
        ALTER TABLE riders
          ADD CONSTRAINT riders_latitude_valid 
          CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90));
      END IF;
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'riders' AND column_name = 'lon'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'riders_longitude_valid'
      ) THEN
        ALTER TABLE riders
          ADD CONSTRAINT riders_longitude_valid 
          CHECK (lon IS NULL OR (lon >= -180 AND lon <= 180));
      END IF;
    END IF;
  END IF;
END $$;

-- Wallet ledger constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallet_ledger') THEN
    -- Amount non-negative
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'wallet_ledger_amount_non_negative'
    ) THEN
      ALTER TABLE wallet_ledger
        ADD CONSTRAINT wallet_ledger_amount_non_negative CHECK (amount >= 0);
    END IF;
    
    -- Balance non-negative (if exists)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'wallet_ledger' AND column_name = 'balance'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'wallet_ledger_balance_non_negative'
      ) THEN
        ALTER TABLE wallet_ledger
          ADD CONSTRAINT wallet_ledger_balance_non_negative 
          CHECK (balance IS NULL OR balance >= 0);
      END IF;
    END IF;
  END IF;
END $$;

-- Withdrawal requests constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'withdrawal_requests') THEN
    -- Amount positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'withdrawal_requests_amount_positive'
    ) THEN
      ALTER TABLE withdrawal_requests
        ADD CONSTRAINT withdrawal_requests_amount_positive CHECK (amount > 0);
    END IF;
  END IF;
END $$;

-- COD collections constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cod_collections') THEN
    -- Amount positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'cod_collections_amount_positive'
    ) THEN
      ALTER TABLE cod_collections
        ADD CONSTRAINT cod_collections_amount_positive CHECK (amount > 0);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- RIDE CONSTRAINTS
-- ============================================================================

-- Ride fare breakdown constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ride_fare_breakdown') THEN
    -- Base fare non-negative
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ride_fare_breakdown_base_fare_non_negative'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_base_fare_non_negative CHECK (base_fare >= 0);
    END IF;
    
    -- Distance fare non-negative
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ride_fare_breakdown_distance_fare_non_negative'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_distance_fare_non_negative CHECK (distance_fare >= 0);
    END IF;
    
    -- Time fare non-negative
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ride_fare_breakdown_time_fare_non_negative'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_time_fare_non_negative CHECK (time_fare >= 0);
    END IF;
    
    -- Surge multiplier >= 1.0
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ride_fare_breakdown_surge_multiplier_valid'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_surge_multiplier_valid CHECK (surge_multiplier >= 1.0);
    END IF;
    
    -- Total fare positive
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ride_fare_breakdown_total_fare_positive'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_total_fare_positive CHECK (total_fare > 0);
    END IF;
    
    -- Rider earning non-negative
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ride_fare_breakdown_rider_earning_non_negative'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_rider_earning_non_negative CHECK (rider_earning >= 0);
    END IF;
  END IF;
END $$;

-- Order ride details constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_ride_details') THEN
    -- Passenger count positive
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'order_ride_details' AND column_name = 'passenger_count'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'order_ride_details_passenger_count_positive'
      ) THEN
        ALTER TABLE order_ride_details
          ADD CONSTRAINT order_ride_details_passenger_count_positive CHECK (passenger_count > 0);
      END IF;
    END IF;
    
    -- Surge multiplier >= 1.0
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'order_ride_details' AND column_name = 'surge_multiplier'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'order_ride_details_surge_multiplier_valid'
      ) THEN
        ALTER TABLE order_ride_details
          ADD CONSTRAINT order_ride_details_surge_multiplier_valid CHECK (surge_multiplier >= 1.0);
      END IF;
    END IF;
    
    -- Total fare non-negative
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'order_ride_details' AND column_name = 'total_fare'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'order_ride_details_total_fare_non_negative'
      ) THEN
        ALTER TABLE order_ride_details
          ADD CONSTRAINT order_ride_details_total_fare_non_negative CHECK (total_fare >= 0);
      END IF;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- SYSTEM USER CONSTRAINTS
-- ============================================================================

-- System users constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_users') THEN
    -- Email format validation
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'system_users_email_format'
    ) THEN
      ALTER TABLE system_users
        ADD CONSTRAINT system_users_email_format 
        CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');
    END IF;
    
    -- Mobile format validation
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'system_users_mobile_format'
    ) THEN
      ALTER TABLE system_users
        ADD CONSTRAINT system_users_mobile_format CHECK (mobile ~ '^\+?[0-9]{10,15}$');
    END IF;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON CONSTRAINT customers_mobile_format ON customers IS 'Validates mobile number format';
COMMENT ON CONSTRAINT customers_trust_score_range ON customers IS 'Ensures trust score is between 0 and 100';
COMMENT ON CONSTRAINT order_payments_amount_positive ON order_payments IS 'Ensures payment amount is always positive';
COMMENT ON CONSTRAINT ride_fare_breakdown_surge_multiplier_valid ON ride_fare_breakdown IS 'Ensures surge multiplier is at least 1.0';
