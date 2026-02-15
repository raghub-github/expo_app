-- Database Relationships & Constraints Enhancement
-- Ensures proper foreign keys, constraints, and data integrity
-- Migration: 0007_relationships_and_constraints
-- Database: Supabase PostgreSQL

-- ============================================================================
-- ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Orders -> Merchants (if merchant_stores table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_stores') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name = 'merchant_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_merchant_id_fkey'
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_merchant_id_fkey
          FOREIGN KEY (merchant_id) REFERENCES merchant_stores(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Orders -> Merchant Parents (if merchant_parents table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_parents') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name = 'merchant_parent_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_merchant_parent_id_fkey'
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_merchant_parent_id_fkey
          FOREIGN KEY (merchant_parent_id) REFERENCES merchant_parents(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Orders -> Customers (if customers table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name = 'customer_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_customer_id_fkey'
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_customer_id_fkey
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Add foreign key constraints where tables exist
-- Order Actions -> Orders (already exists, verify)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'order_actions_order_id_fkey'
  ) THEN
    ALTER TABLE order_actions
      ADD CONSTRAINT order_actions_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Order Events -> Orders (already exists, verify)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'order_events_order_id_fkey'
  ) THEN
    ALTER TABLE order_events
      ADD CONSTRAINT order_events_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- ADD CHECK CONSTRAINTS FOR DATA VALIDITY
-- ============================================================================

-- Orders: Ensure fare amounts are non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_fare_amount_non_negative'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_fare_amount_non_negative CHECK (fare_amount IS NULL OR fare_amount >= 0);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_commission_amount_non_negative'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_commission_amount_non_negative CHECK (commission_amount IS NULL OR commission_amount >= 0);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_rider_earning_non_negative'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_rider_earning_non_negative CHECK (rider_earning IS NULL OR rider_earning >= 0);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_distance_km_non_negative'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_distance_km_non_negative CHECK (distance_km IS NULL OR distance_km >= 0);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_eta_seconds_non_negative'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_eta_seconds_non_negative CHECK (eta_seconds IS NULL OR eta_seconds >= 0);
  END IF;
END $$;

-- Orders: Ensure coordinates are valid (latitude: -90 to 90, longitude: -180 to 180)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_pickup_lat_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_pickup_lat_valid CHECK (pickup_lat >= -90 AND pickup_lat <= 90);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_pickup_lon_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_pickup_lon_valid CHECK (pickup_lon >= -180 AND pickup_lon <= 180);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_drop_lat_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_drop_lat_valid CHECK (drop_lat >= -90 AND drop_lat <= 90);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_drop_lon_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_drop_lon_valid CHECK (drop_lon >= -180 AND drop_lon <= 180);
  END IF;
END $$;

-- Orders: Ensure scheduled times are logical
-- Note: scheduled_delivery_time doesn't exist, using estimated_delivery_time instead
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'scheduled_pickup_time'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'estimated_delivery_time'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_scheduled_times_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_scheduled_times_valid CHECK (
        scheduled_pickup_time IS NULL OR 
        estimated_delivery_time IS NULL OR
        scheduled_pickup_time <= estimated_delivery_time
      );
  END IF;
END $$;

-- Orders: Ensure actual times are logical
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'actual_pickup_time'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'actual_delivery_time'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_actual_times_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_actual_times_valid CHECK (
        actual_pickup_time IS NULL OR
        actual_delivery_time IS NULL OR
        actual_pickup_time <= actual_delivery_time
      );
  END IF;
END $$;

-- Riders: Ensure referral code doesn't reference self
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'riders_referred_by_not_self'
      AND table_name = 'riders'
  ) THEN
    ALTER TABLE riders
      ADD CONSTRAINT riders_referred_by_not_self CHECK (referred_by IS NULL OR referred_by != id);
  END IF;
END $$;

-- Riders: Ensure coordinates are valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'riders_lat_valid'
      AND table_name = 'riders'
  ) THEN
    ALTER TABLE riders
      ADD CONSTRAINT riders_lat_valid CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'riders_lon_valid'
      AND table_name = 'riders'
  ) THEN
    ALTER TABLE riders
      ADD CONSTRAINT riders_lon_valid CHECK (lon IS NULL OR (lon >= -180 AND lon <= 180));
  END IF;
END $$;

-- Wallet Ledger: Ensure amounts are non-negative
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallet_ledger') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'wallet_ledger_amount_non_negative'
        AND table_name = 'wallet_ledger'
    ) THEN
      ALTER TABLE wallet_ledger
        ADD CONSTRAINT wallet_ledger_amount_non_negative CHECK (amount >= 0);
    END IF;
    
    -- Add balance constraint only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'wallet_ledger' 
        AND column_name = 'balance'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'wallet_ledger_balance_non_negative'
        AND table_name = 'wallet_ledger'
    ) THEN
      ALTER TABLE wallet_ledger
        ADD CONSTRAINT wallet_ledger_balance_non_negative CHECK (balance IS NULL OR balance >= 0);
    END IF;
  END IF;
END $$;

-- Withdrawal Requests: Ensure amount is positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'withdrawal_requests_amount_positive'
      AND table_name = 'withdrawal_requests'
  ) THEN
    ALTER TABLE withdrawal_requests
      ADD CONSTRAINT withdrawal_requests_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- Withdrawal Requests: Add constraints for optional columns if they exist
DO $$
BEGIN
  -- Check and add net_amount constraint if column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_requests' 
      AND column_name = 'net_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'withdrawal_requests_net_amount_valid'
      AND table_name = 'withdrawal_requests'
  ) THEN
    ALTER TABLE withdrawal_requests
      ADD CONSTRAINT withdrawal_requests_net_amount_valid CHECK (net_amount IS NULL OR net_amount > 0);
  END IF;
  
  -- Check and add processing_fee constraint if column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_requests' 
      AND column_name = 'processing_fee'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'withdrawal_requests_processing_fee_non_negative'
      AND table_name = 'withdrawal_requests'
  ) THEN
    ALTER TABLE withdrawal_requests
      ADD CONSTRAINT withdrawal_requests_processing_fee_non_negative CHECK (processing_fee IS NULL OR processing_fee >= 0);
  END IF;
END $$;

-- Ratings: Ensure rating is between 1 and 5
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ratings') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ratings_rating_range'
        AND table_name = 'ratings'
    ) THEN
      ALTER TABLE ratings
        ADD CONSTRAINT ratings_rating_range CHECK (rating >= 1 AND rating <= 5);
    END IF;
  END IF;
END $$;

-- Order Ratings: Ensure rating is between 1 and 5
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_ratings') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_ratings_rating_range'
        AND table_name = 'order_ratings'
    ) THEN
      ALTER TABLE order_ratings
        ADD CONSTRAINT order_ratings_rating_range CHECK (rating >= 1 AND rating <= 5);
    END IF;
  END IF;
END $$;

-- Order Food Items: Ensure quantities and prices are positive
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_food_items') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_food_items_quantity_positive'
        AND table_name = 'order_food_items'
    ) THEN
      ALTER TABLE order_food_items
        ADD CONSTRAINT order_food_items_quantity_positive CHECK (quantity > 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_food_items_unit_price_non_negative'
        AND table_name = 'order_food_items'
    ) THEN
      ALTER TABLE order_food_items
        ADD CONSTRAINT order_food_items_unit_price_non_negative CHECK (unit_price >= 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_food_items_total_price_non_negative'
        AND table_name = 'order_food_items'
    ) THEN
      ALTER TABLE order_food_items
        ADD CONSTRAINT order_food_items_total_price_non_negative CHECK (total_price >= 0);
    END IF;
  END IF;
END $$;

-- Parcel Tracking: Ensure weight and dimensions are positive
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'package_weight_kg'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_package_weight_positive'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_package_weight_positive CHECK (package_weight_kg IS NULL OR package_weight_kg > 0);
  END IF;
  
  -- Package dimensions constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'package_length_cm'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'package_width_cm'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'package_height_cm'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_package_dimensions_positive'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_package_dimensions_positive CHECK (
        (package_length_cm IS NULL OR package_length_cm > 0) AND
        (package_width_cm IS NULL OR package_width_cm > 0) AND
        (package_height_cm IS NULL OR package_height_cm > 0)
      );
  END IF;
END $$;

-- Ride Booking: Ensure passenger count is positive
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'passenger_count'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_passenger_count_positive'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_passenger_count_positive CHECK (passenger_count IS NULL OR passenger_count > 0);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'surge_multiplier'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_surge_multiplier_positive'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_surge_multiplier_positive CHECK (surge_multiplier IS NULL OR surge_multiplier >= 1.0);
  END IF;
END $$;

-- Ride Fare Breakdown: Ensure all amounts are non-negative
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ride_fare_breakdown') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ride_fare_breakdown_base_fare_non_negative'
        AND table_name = 'ride_fare_breakdown'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_base_fare_non_negative CHECK (base_fare >= 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ride_fare_breakdown_distance_fare_non_negative'
        AND table_name = 'ride_fare_breakdown'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_distance_fare_non_negative CHECK (distance_fare >= 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ride_fare_breakdown_time_fare_non_negative'
        AND table_name = 'ride_fare_breakdown'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_time_fare_non_negative CHECK (time_fare >= 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ride_fare_breakdown_surge_multiplier_positive'
        AND table_name = 'ride_fare_breakdown'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_surge_multiplier_positive CHECK (surge_multiplier >= 1.0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ride_fare_breakdown_total_fare_positive'
        AND table_name = 'ride_fare_breakdown'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_total_fare_positive CHECK (total_fare > 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ride_fare_breakdown_rider_earning_non_negative'
        AND table_name = 'ride_fare_breakdown'
    ) THEN
      ALTER TABLE ride_fare_breakdown
        ADD CONSTRAINT ride_fare_breakdown_rider_earning_non_negative CHECK (rider_earning >= 0);
    END IF;
  END IF;
END $$;

-- COD Collections: Ensure amount is positive
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cod_collections') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'cod_collections_amount_positive'
        AND table_name = 'cod_collections'
    ) THEN
      ALTER TABLE cod_collections
        ADD CONSTRAINT cod_collections_amount_positive CHECK (amount > 0);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- ADD UNIQUE CONSTRAINTS
-- ============================================================================

-- Ensure one active vehicle per rider
-- (Already handled by unique index in rider_vehicles table)

-- Ensure provider order ID is unique per provider
-- (Already handled by unique constraint in provider_order_mapping)

-- Ensure one fare breakdown per order
-- (Already handled by unique index in ride_fare_breakdown)

-- ============================================================================
-- ADD COMPOSITE UNIQUE CONSTRAINTS
-- ============================================================================

-- Ensure rider can only have one active order per status
-- (This might be too restrictive, so we'll skip this)

-- ============================================================================
-- ADD MISSING FOREIGN KEYS FOR ADMIN/USER REFERENCES
-- ============================================================================

-- system_config.updated_by -> system_users.id (if system_users table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_users') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'system_config' 
        AND column_name = 'updated_by'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'system_config_updated_by_fkey'
      ) THEN
        ALTER TABLE system_config
          ADD CONSTRAINT system_config_updated_by_fkey
          FOREIGN KEY (updated_by) REFERENCES system_users(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- rider_vehicles.verified_by -> system_users.id (if system_users table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_users') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'rider_vehicles' 
        AND column_name = 'verified_by'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'rider_vehicles_verified_by_fkey'
      ) THEN
        ALTER TABLE rider_vehicles
          ADD CONSTRAINT rider_vehicles_verified_by_fkey
          FOREIGN KEY (verified_by) REFERENCES system_users(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- settlement_batches.initiated_by -> system_users.id (if system_users table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_users') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'settlement_batches' 
        AND column_name = 'initiated_by'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'settlement_batches_initiated_by_fkey'
      ) THEN
        ALTER TABLE settlement_batches
          ADD CONSTRAINT settlement_batches_initiated_by_fkey
          FOREIGN KEY (initiated_by) REFERENCES system_users(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- commission_history.created_by -> system_users.id (if system_users table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_users') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'commission_history' 
        AND column_name = 'created_by'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'commission_history_created_by_fkey'
      ) THEN
        ALTER TABLE commission_history
          ADD CONSTRAINT commission_history_created_by_fkey
          FOREIGN KEY (created_by) REFERENCES system_users(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- ADD TRIGGERS FOR DATA INTEGRITY
-- ============================================================================

-- Trigger to ensure only one active vehicle per rider
-- Only create if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rider_vehicles') THEN
    EXECUTE $sql$CREATE OR REPLACE FUNCTION ensure_single_active_vehicle()
RETURNS TRIGGER AS $func$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE rider_vehicles
    SET is_active = FALSE
    WHERE rider_id = NEW.rider_id
      AND id != NEW.id
      AND is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;$sql$;

    DROP TRIGGER IF EXISTS rider_vehicles_single_active_trigger ON rider_vehicles;
    EXECUTE $sql$CREATE TRIGGER rider_vehicles_single_active_trigger
      BEFORE INSERT OR UPDATE ON rider_vehicles
      FOR EACH ROW
      WHEN (NEW.is_active = TRUE)
      EXECUTE FUNCTION ensure_single_active_vehicle();$sql$;
  END IF;
END $$;

-- Trigger to validate order status transitions
-- Only create if orders table exists and has status column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'status'
  ) THEN
    EXECUTE $sql$CREATE OR REPLACE FUNCTION validate_order_status_transition()
RETURNS TRIGGER AS $func$
BEGIN
  IF OLD.status = 'delivered' AND NEW.status != 'delivered' THEN
    RAISE EXCEPTION 'Cannot change status from delivered';
  END IF;
  
  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    RAISE EXCEPTION 'Cannot change status from cancelled';
  END IF;
  
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;$sql$;

    DROP TRIGGER IF EXISTS orders_status_transition_trigger ON orders;
    EXECUTE $sql$CREATE TRIGGER orders_status_transition_trigger
      BEFORE UPDATE OF status ON orders
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION validate_order_status_transition();$sql$;
  END IF;
END $$;

-- Trigger to auto-calculate net amount in withdrawal requests
-- Only create if required columns exist
-- NOTE: This trigger is only created if net_amount column exists in withdrawal_requests table
-- If the column doesn't exist, this entire block is skipped (no error, no function created)
DO $$
DECLARE
  v_has_net_amount BOOLEAN;
  v_has_processing_fee BOOLEAN;
  v_has_tds_deducted BOOLEAN;
  v_has_amount BOOLEAN;
  v_function_sql TEXT;
BEGIN
  -- First, drop the function and trigger if they exist (to avoid conflicts)
  DROP TRIGGER IF EXISTS withdrawal_requests_calculate_net_amount_trigger ON withdrawal_requests;
  DROP FUNCTION IF EXISTS calculate_withdrawal_net_amount() CASCADE;
  
  -- Check which columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_requests' 
      AND column_name = 'net_amount'
  ) INTO v_has_net_amount;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_requests' 
      AND column_name = 'amount'
  ) INTO v_has_amount;
  
  -- Only proceed if both net_amount and amount columns exist
  -- If net_amount doesn't exist, skip creating the function entirely
  IF NOT (v_has_net_amount AND v_has_amount) THEN
    -- Columns don't exist, skip this entire block (function won't be created)
    -- This prevents the error "column net_amount does not exist"
    RETURN;
  END IF;
  
  -- Both columns exist, check for optional columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_requests' 
      AND column_name = 'processing_fee'
  ) INTO v_has_processing_fee;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_requests' 
      AND column_name = 'tds_deducted'
  ) INTO v_has_tds_deducted;
  
  -- Build function SQL based on which optional columns exist
  IF v_has_processing_fee AND v_has_tds_deducted THEN
    v_function_sql := $sql$CREATE OR REPLACE FUNCTION calculate_withdrawal_net_amount()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.net_amount := NEW.amount - COALESCE(NEW.processing_fee, 0) - COALESCE(NEW.tds_deducted, 0);
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;$sql$;
  ELSIF v_has_processing_fee THEN
    v_function_sql := $sql$CREATE OR REPLACE FUNCTION calculate_withdrawal_net_amount()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.net_amount := NEW.amount - COALESCE(NEW.processing_fee, 0);
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;$sql$;
  ELSE
    v_function_sql := $sql$CREATE OR REPLACE FUNCTION calculate_withdrawal_net_amount()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.net_amount := NEW.amount;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;$sql$;
  END IF;
  
  -- Execute function creation (columns exist, so this will work)
  EXECUTE v_function_sql;
  
  -- Create trigger
  EXECUTE $sql$CREATE TRIGGER withdrawal_requests_calculate_net_amount_trigger
    BEFORE INSERT OR UPDATE ON withdrawal_requests
    FOR EACH ROW
    EXECUTE FUNCTION calculate_withdrawal_net_amount();$sql$;
END $$;

-- Trigger to validate ride fare breakdown totals
-- Only create if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ride_fare_breakdown') THEN
    EXECUTE $sql$CREATE OR REPLACE FUNCTION validate_ride_fare_totals()
RETURNS TRIGGER AS $func$
DECLARE
  v_calculated_total NUMERIC(10, 2);
BEGIN
  v_calculated_total := 
    NEW.base_fare +
    COALESCE(NEW.distance_fare, 0) +
    COALESCE(NEW.time_fare, 0) +
    COALESCE(NEW.surge_amount, 0) +
    COALESCE(NEW.toll_charges, 0) +
    COALESCE(NEW.parking_charges, 0) +
    COALESCE(NEW.waiting_charges, 0) +
    COALESCE(NEW.night_charges, 0) +
    COALESCE(NEW.gst_amount, 0) -
    COALESCE(NEW.discount_amount, 0);
  
  IF ABS(NEW.total_fare - v_calculated_total) > 0.01 THEN
    RAISE WARNING 'Fare breakdown total mismatch. Expected: %, Actual: %', v_calculated_total, NEW.total_fare;
  END IF;
  
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;$sql$;

    DROP TRIGGER IF EXISTS ride_fare_breakdown_validate_totals_trigger ON ride_fare_breakdown;
    EXECUTE $sql$CREATE TRIGGER ride_fare_breakdown_validate_totals_trigger
      BEFORE INSERT OR UPDATE ON ride_fare_breakdown
      FOR EACH ROW
      EXECUTE FUNCTION validate_ride_fare_totals();$sql$;
  END IF;
END $$;

-- ============================================================================
-- ADD INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================================

-- Composite indexes for common queries

-- Orders: Find orders by rider and status
CREATE INDEX IF NOT EXISTS orders_rider_status_created_idx ON orders(rider_id, status, created_at DESC);

-- Orders: Find orders by type and status
CREATE INDEX IF NOT EXISTS orders_type_status_created_idx ON orders(order_type, status, created_at DESC);

-- Orders: Find orders by source and status
CREATE INDEX IF NOT EXISTS orders_source_status_created_idx ON orders(source, status, created_at DESC);

-- Orders: Find active orders for a rider
CREATE INDEX IF NOT EXISTS orders_rider_active_status_idx ON orders(rider_id, status) 
  WHERE status IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit');

-- Orders: Find orders needing sync
CREATE INDEX IF NOT EXISTS orders_sync_pending_idx ON orders(source, synced_with_provider, sync_status)
  WHERE source != 'internal' AND (synced_with_provider = FALSE OR sync_status = 'failed');

-- Wallet Ledger: Find recent transactions for a rider
CREATE INDEX IF NOT EXISTS wallet_ledger_rider_created_desc_idx ON wallet_ledger(rider_id, created_at DESC);

-- Order Events: Find events for an order chronologically
CREATE INDEX IF NOT EXISTS order_events_order_created_asc_idx ON order_events(order_id, created_at ASC);

-- Order Assignments: Find pending assignments
CREATE INDEX IF NOT EXISTS order_assignments_pending_idx ON order_assignments(order_id, status, created_at)
  WHERE status = 'pending';

-- Webhook Events: Find pending webhooks to process
CREATE INDEX IF NOT EXISTS webhook_events_pending_processing_idx ON webhook_events(provider_type, status, created_at)
  WHERE status IN ('pending', 'processing');

-- ============================================================================
-- ADD PARTIAL INDEXES FOR PERFORMANCE
-- ============================================================================

-- Active riders only
CREATE INDEX IF NOT EXISTS riders_active_city_idx ON riders(city, status) WHERE status = 'ACTIVE';

-- Active orders only
CREATE INDEX IF NOT EXISTS orders_active_rider_idx ON orders(rider_id, order_type, created_at DESC)
  WHERE status NOT IN ('delivered', 'cancelled', 'failed');

-- Pending withdrawals
CREATE INDEX IF NOT EXISTS withdrawal_requests_pending_idx ON withdrawal_requests(rider_id, created_at DESC)
  WHERE status = 'pending';

-- Unresolved conflicts
CREATE INDEX IF NOT EXISTS order_conflicts_unresolved_idx ON order_conflicts(order_id, provider_type, created_at DESC)
  WHERE resolved = FALSE;

-- Failed syncs
CREATE INDEX IF NOT EXISTS order_sync_logs_failed_idx ON order_sync_logs(order_id, provider_type, created_at DESC)
  WHERE success = FALSE;

-- ============================================================================
-- ADD MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================================================

-- Provider Performance Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS provider_performance_summary AS
SELECT 
  o.source AS provider_type,
  o.order_type,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  COALESCE(SUM(o.fare_amount) FILTER (WHERE o.status = 'delivered'), 0) AS total_revenue,
  COALESCE(SUM(o.rider_earning) FILTER (WHERE o.status = 'delivered'), 0) AS total_rider_earnings,
  COALESCE(SUM(o.commission_amount) FILTER (WHERE o.status = 'delivered'), 0) AS total_commission,
  COALESCE(AVG(EXTRACT(EPOCH FROM (o.actual_delivery_time - o.actual_pickup_time)) / 60), 0) AS avg_delivery_time_minutes,
  DATE_TRUNC('day', o.created_at) AS order_date
FROM orders o
WHERE o.source != 'internal'
GROUP BY o.source, o.order_type, DATE_TRUNC('day', o.created_at);

-- Create unique index on materialized view (with existence check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'provider_performance_summary'
      AND n.nspname = 'public'
      AND c.relkind = 'm'  -- 'm' = materialized view
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'provider_performance_summary_unique_idx'
      AND schemaname = 'public'
  ) THEN
    CREATE UNIQUE INDEX provider_performance_summary_unique_idx 
      ON provider_performance_summary(provider_type, order_type, order_date);
  END IF;
END $$;

-- Order Source Distribution
CREATE MATERIALIZED VIEW IF NOT EXISTS order_source_distribution AS
SELECT 
  source,
  order_type,
  status,
  COUNT(*) AS order_count,
  DATE_TRUNC('day', created_at) AS order_date
FROM orders
GROUP BY source, order_type, status, DATE_TRUNC('day', created_at);

-- Create unique index on materialized view (with existence check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'order_source_distribution'
      AND n.nspname = 'public'
      AND c.relkind = 'm'  -- 'm' = materialized view
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'order_source_distribution_unique_idx'
      AND schemaname = 'public'
  ) THEN
    CREATE UNIQUE INDEX order_source_distribution_unique_idx 
      ON order_source_distribution(source, order_type, status, order_date);
  END IF;
END $$;

-- ============================================================================
-- ADD FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================================

-- Function to get rider's active orders
CREATE OR REPLACE FUNCTION get_rider_active_orders(p_rider_id INTEGER)
RETURNS TABLE (
  order_id BIGINT,
  order_type order_type,
  status order_status_type,
  pickup_address TEXT,
  drop_address TEXT,
  fare_amount NUMERIC(10, 2),
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.order_type,
    o.status,
    o.pickup_address,
    o.drop_address,
    o.fare_amount,
    o.created_at
  FROM orders o
  WHERE o.rider_id = p_rider_id
    AND o.status IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit')
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get order with all related data
CREATE OR REPLACE FUNCTION get_order_details(p_order_id BIGINT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'order', row_to_json(o.*),
    'food_items', COALESCE(
      (SELECT jsonb_agg(row_to_json(fi.*)) FROM order_food_items fi WHERE fi.order_id = o.id),
      '[]'::jsonb
    ),
    'parcel_events', COALESCE(
      (SELECT jsonb_agg(row_to_json(pe.*)) FROM parcel_tracking_events pe WHERE pe.order_id = o.id ORDER BY pe.created_at),
      '[]'::jsonb
    ),
    'fare_breakdown', COALESCE(
      (SELECT row_to_json(fb.*) FROM ride_fare_breakdown fb WHERE fb.order_id = o.id),
      '{}'::jsonb
    ),
    'status_history', COALESCE(
      (SELECT jsonb_agg(row_to_json(sh.*)) FROM order_status_history sh WHERE sh.order_id = o.id ORDER BY sh.created_at),
      '[]'::jsonb
    ),
    'assignments', COALESCE(
      (SELECT jsonb_agg(row_to_json(oa.*)) FROM order_assignments oa WHERE oa.order_id = o.id ORDER BY oa.created_at),
      '[]'::jsonb
    ),
    'provider_mapping', COALESCE(
      (SELECT row_to_json(pom.*) FROM provider_order_mapping pom WHERE pom.order_id = o.id),
      '{}'::jsonb
    )
  ) INTO v_result
  FROM orders o
  WHERE o.id = p_order_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ADD VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Active Orders with Rider Info
CREATE OR REPLACE VIEW active_orders_with_rider AS
SELECT 
  o.id AS order_id,
  o.order_type,
  o.status,
  o.source,
  o.pickup_address,
  o.drop_address,
  o.fare_amount,
  o.rider_id,
  r.name AS rider_name,
  r.mobile AS rider_mobile,
  r.city AS rider_city,
  o.created_at,
  o.estimated_pickup_time,
  o.estimated_delivery_time
FROM orders o
LEFT JOIN riders r ON o.rider_id = r.id
WHERE o.status IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit')
ORDER BY o.created_at DESC;

-- View: Provider Order Sync Status
CREATE OR REPLACE VIEW provider_sync_status AS
SELECT 
  o.id AS order_id,
  o.source AS provider_type,
  o.provider_order_id,
  o.synced_with_provider,
  o.sync_status,
  o.last_sync_at,
  pom.provider_status,
  pom.last_sync_at AS mapping_last_sync,
  COUNT(DISTINCT osl.id) AS sync_attempts,
  COUNT(DISTINCT osl.id) FILTER (WHERE osl.success = FALSE) AS failed_syncs
FROM orders o
LEFT JOIN provider_order_mapping pom ON o.id = pom.order_id
LEFT JOIN order_sync_logs osl ON o.id = osl.order_id
WHERE o.source != 'internal'
GROUP BY o.id, o.source, o.provider_order_id, o.synced_with_provider, 
         o.sync_status, o.last_sync_at, pom.provider_status, pom.last_sync_at;

-- View: Rider Performance by Order Type
CREATE OR REPLACE VIEW rider_performance_by_order_type AS
SELECT 
  r.id AS rider_id,
  r.name AS rider_name,
  o.order_type,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  COALESCE(SUM(o.rider_earning) FILTER (WHERE o.status = 'delivered'), 0) AS total_earnings,
  COALESCE(AVG(rt.rating), 0) AS avg_rating,
  DATE_TRUNC('day', o.created_at) AS order_date
FROM riders r
LEFT JOIN orders o ON r.id = o.rider_id
LEFT JOIN ratings rt ON r.id = rt.rider_id AND o.id = rt.order_id
WHERE r.status = 'ACTIVE'
GROUP BY r.id, r.name, o.order_type, DATE_TRUNC('day', o.created_at);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_rider_active_orders IS 'Returns all active orders for a rider. Used by rider app to show current orders.';
COMMENT ON FUNCTION get_order_details IS 'Returns complete order details with all related data (food items, tracking, fare, etc.) as JSONB.';
COMMENT ON VIEW active_orders_with_rider IS 'Shows all active orders with rider information. Used by admin dashboard.';
COMMENT ON VIEW provider_sync_status IS 'Shows synchronization status for all external provider orders. Used for monitoring.';
COMMENT ON VIEW rider_performance_by_order_type IS 'Rider performance metrics broken down by order type. Used for analytics.';

COMMENT ON CONSTRAINT orders_fare_amount_non_negative ON orders IS 'Ensures fare amount is never negative';
COMMENT ON CONSTRAINT orders_pickup_lat_valid ON orders IS 'Ensures pickup latitude is within valid range (-90 to 90)';
COMMENT ON CONSTRAINT ratings_rating_range ON ratings IS 'Ensures rating is between 1 and 5';
