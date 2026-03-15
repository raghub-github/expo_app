-- ============================================================================
-- MIGRATION SCRIPT: UNIFIED ORDERS SYSTEM
-- Migrates from existing orders/orders_core to unified orders table
-- Migration: migrate_to_unified_orders
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- IMPORTANT:
-- - This script migrates data from orders and orders_core to unified orders table
-- - Preserves all historical data
-- - Maintains order IDs (starting at 1000000)
-- - Creates rollback script for safety
-- - Run in transaction for safety
-- ============================================================================

-- ============================================================================
-- PRE-MIGRATION CHECKS
-- ============================================================================

DO $$
DECLARE
  v_orders_count BIGINT;
  v_orders_core_count BIGINT;
  v_max_order_id BIGINT;
BEGIN
  -- Check if orders table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    RAISE EXCEPTION 'orders table does not exist';
  END IF;
  
  -- Count records in existing tables
  SELECT COUNT(*) INTO v_orders_count FROM public.orders;
  SELECT COUNT(*) INTO v_orders_core_count FROM public.orders_core WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders_core');
  SELECT COALESCE(MAX(id), 0) INTO v_max_order_id FROM public.orders;
  
  -- Log counts
  RAISE NOTICE 'Found % records in orders table', v_orders_count;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders_core') THEN
    RAISE NOTICE 'Found % records in orders_core table', v_orders_core_count;
  END IF;
  RAISE NOTICE 'Max order ID: %', v_max_order_id;
  
  -- Ensure sequence is at least at max order ID
  IF v_max_order_id >= 1000000 THEN
    PERFORM setval('orders_id_seq', GREATEST(v_max_order_id, 1000000), true);
  END IF;
END $$;

-- ============================================================================
-- STEP 1: CREATE BACKUP TABLES
-- ============================================================================

-- Backup existing orders table
CREATE TABLE IF NOT EXISTS public.orders_backup AS 
SELECT * FROM public.orders;

-- Backup existing orders_core table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders_core') THEN
    CREATE TABLE IF NOT EXISTS public.orders_core_backup AS 
    SELECT * FROM public.orders_core;
    RAISE NOTICE 'Created backup of orders_core table';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: CREATE UNIFIED ORDERS TABLE (IF NOT EXISTS)
-- ============================================================================

-- Note: The unified orders table should already be created by unified_orders_core.sql
-- This step ensures it exists and has all required columns

-- ============================================================================
-- STEP 2.5: ENSURE UNIFIED COLUMNS EXIST ON public.orders
-- ============================================================================
-- When orders was created from an older schema (e.g. pickup_address instead of
-- pickup_address_raw), ADD COLUMN so the migration INSERT and SELECT succeed.
DO $$
BEGIN
  -- Location: pickup/drop address (unified names)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pickup_address_raw') THEN
    ALTER TABLE public.orders ADD COLUMN pickup_address_raw TEXT;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pickup_address') THEN
      UPDATE public.orders SET pickup_address_raw = COALESCE(pickup_address_raw, pickup_address);
    END IF;
    UPDATE public.orders SET pickup_address_raw = '' WHERE pickup_address_raw IS NULL;
    ALTER TABLE public.orders ALTER COLUMN pickup_address_raw SET NOT NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pickup_address') THEN
    UPDATE public.orders SET pickup_address_raw = COALESCE(pickup_address_raw, pickup_address) WHERE pickup_address_raw IS NULL OR (pickup_address IS NOT NULL AND pickup_address_raw = '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pickup_address_normalized') THEN
    ALTER TABLE public.orders ADD COLUMN pickup_address_normalized TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pickup_address_geocoded') THEN
    ALTER TABLE public.orders ADD COLUMN pickup_address_geocoded TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pickup_address_deviation_meters') THEN
    ALTER TABLE public.orders ADD COLUMN pickup_address_deviation_meters NUMERIC(6, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'drop_address_raw') THEN
    ALTER TABLE public.orders ADD COLUMN drop_address_raw TEXT;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'drop_address') THEN
      UPDATE public.orders SET drop_address_raw = COALESCE(drop_address_raw, drop_address);
    END IF;
    UPDATE public.orders SET drop_address_raw = '' WHERE drop_address_raw IS NULL;
    ALTER TABLE public.orders ALTER COLUMN drop_address_raw SET NOT NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'drop_address') THEN
    UPDATE public.orders SET drop_address_raw = COALESCE(drop_address_raw, drop_address) WHERE drop_address_raw IS NULL OR (drop_address IS NOT NULL AND drop_address_raw = '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'drop_address_normalized') THEN
    ALTER TABLE public.orders ADD COLUMN drop_address_normalized TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'drop_address_geocoded') THEN
    ALTER TABLE public.orders ADD COLUMN drop_address_geocoded TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'drop_address_deviation_meters') THEN
    ALTER TABLE public.orders ADD COLUMN drop_address_deviation_meters NUMERIC(6, 2);
  END IF;
  -- Legacy columns (some schemas have NOT NULL pickup_address/drop_address)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pickup_address') THEN
    ALTER TABLE public.orders ADD COLUMN pickup_address TEXT NOT NULL DEFAULT '';
    UPDATE public.orders SET pickup_address = COALESCE(pickup_address_raw, '') WHERE pickup_address = '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'drop_address') THEN
    ALTER TABLE public.orders ADD COLUMN drop_address TEXT NOT NULL DEFAULT '';
    UPDATE public.orders SET drop_address = COALESCE(drop_address_raw, '') WHERE drop_address = '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'distance_mismatch_flagged') THEN
    ALTER TABLE public.orders ADD COLUMN distance_mismatch_flagged BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'has_tip') THEN
    ALTER TABLE public.orders ADD COLUMN has_tip BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tip_amount') THEN
    ALTER TABLE public.orders ADD COLUMN tip_amount NUMERIC(10, 2) DEFAULT 0;
  END IF;
  -- Add any other commonly missing unified columns (nullable or with default)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_uuid') THEN
    ALTER TABLE public.orders ADD COLUMN order_uuid UUID UNIQUE DEFAULT gen_random_uuid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'formatted_order_id') THEN
    ALTER TABLE public.orders ADD COLUMN formatted_order_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'external_ref') THEN
    ALTER TABLE public.orders ADD COLUMN external_ref TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_category') THEN
    ALTER TABLE public.orders ADD COLUMN order_category order_category_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_source') THEN
    ALTER TABLE public.orders ADD COLUMN order_source order_source_type DEFAULT 'internal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'current_rider_id') THEN
    ALTER TABLE public.orders ADD COLUMN current_rider_id INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'current_status') THEN
    ALTER TABLE public.orders ADD COLUMN current_status TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'first_eta') THEN
    ALTER TABLE public.orders ADD COLUMN first_eta TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'promised_eta') THEN
    ALTER TABLE public.orders ADD COLUMN promised_eta TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cancelled_by_id') THEN
    ALTER TABLE public.orders ADD COLUMN cancelled_by_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cancelled_by_type') THEN
    ALTER TABLE public.orders ADD COLUMN cancelled_by_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cancellation_reason_id') THEN
    ALTER TABLE public.orders ADD COLUMN cancellation_reason_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cancellation_reason') THEN
    ALTER TABLE public.orders ADD COLUMN cancellation_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cancellation_details') THEN
    ALTER TABLE public.orders ADD COLUMN cancellation_details JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_address_id') THEN
    ALTER TABLE public.orders ADD COLUMN customer_address_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_address_auto') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_address_auto TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_address_manual') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_address_manual TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'alternate_mobiles') THEN
    ALTER TABLE public.orders ADD COLUMN alternate_mobiles TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'landmark') THEN
    ALTER TABLE public.orders ADD COLUMN landmark TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pincode') THEN
    ALTER TABLE public.orders ADD COLUMN pincode TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'is_self_order') THEN
    ALTER TABLE public.orders ADD COLUMN is_self_order BOOLEAN DEFAULT TRUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_for_name') THEN
    ALTER TABLE public.orders ADD COLUMN order_for_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_for_mobile') THEN
    ALTER TABLE public.orders ADD COLUMN order_for_mobile TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_for_relation') THEN
    ALTER TABLE public.orders ADD COLUMN order_for_relation TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'contact_less_delivery') THEN
    ALTER TABLE public.orders ADD COLUMN contact_less_delivery BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'special_delivery_notes') THEN
    ALTER TABLE public.orders ADD COLUMN special_delivery_notes TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_instructions') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_instructions TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'device_type') THEN
    ALTER TABLE public.orders ADD COLUMN device_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'device_os') THEN
    ALTER TABLE public.orders ADD COLUMN device_os TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'device_app_version') THEN
    ALTER TABLE public.orders ADD COLUMN device_app_version TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'device_ip') THEN
    ALTER TABLE public.orders ADD COLUMN device_ip TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'user_agent') THEN
    ALTER TABLE public.orders ADD COLUMN user_agent TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_via') THEN
    ALTER TABLE public.orders ADD COLUMN created_via TEXT DEFAULT 'app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_by_user_id') THEN
    ALTER TABLE public.orders ADD COLUMN created_by_user_id INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_type') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_type delivery_type DEFAULT 'standard';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_initiator') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_initiator delivery_initiator_type DEFAULT 'customer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'locality_type') THEN
    ALTER TABLE public.orders ADD COLUMN locality_type locality_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivered_by') THEN
    ALTER TABLE public.orders ADD COLUMN delivered_by TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'default_system_kpt_minutes') THEN
    ALTER TABLE public.orders ADD COLUMN default_system_kpt_minutes INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'merchant_updated_kpt_minutes') THEN
    ALTER TABLE public.orders ADD COLUMN merchant_updated_kpt_minutes INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'is_bulk_order') THEN
    ALTER TABLE public.orders ADD COLUMN is_bulk_order BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'bulk_reason') THEN
    ALTER TABLE public.orders ADD COLUMN bulk_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'bulk_order_group_id') THEN
    ALTER TABLE public.orders ADD COLUMN bulk_order_group_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_order_id') THEN
    ALTER TABLE public.orders ADD COLUMN provider_order_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_reference') THEN
    ALTER TABLE public.orders ADD COLUMN provider_reference TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'external_order_id') THEN
    ALTER TABLE public.orders ADD COLUMN external_order_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'buyer_app_name') THEN
    ALTER TABLE public.orders ADD COLUMN buyer_app_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'synced_with_provider') THEN
    ALTER TABLE public.orders ADD COLUMN synced_with_provider BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'sync_status') THEN
    ALTER TABLE public.orders ADD COLUMN sync_status TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'sync_error') THEN
    ALTER TABLE public.orders ADD COLUMN sync_error TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'sync_retry_count') THEN
    ALTER TABLE public.orders ADD COLUMN sync_retry_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'last_sync_at') THEN
    ALTER TABLE public.orders ADD COLUMN last_sync_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_status') THEN
    ALTER TABLE public.orders ADD COLUMN provider_status TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_status_updated_at') THEN
    ALTER TABLE public.orders ADD COLUMN provider_status_updated_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'swiggy_order_id') THEN
    ALTER TABLE public.orders ADD COLUMN swiggy_order_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'swiggy_restaurant_id') THEN
    ALTER TABLE public.orders ADD COLUMN swiggy_restaurant_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'swiggy_customer_id') THEN
    ALTER TABLE public.orders ADD COLUMN swiggy_customer_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'swiggy_delivery_partner_id') THEN
    ALTER TABLE public.orders ADD COLUMN swiggy_delivery_partner_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'zomato_order_id') THEN
    ALTER TABLE public.orders ADD COLUMN zomato_order_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'zomato_restaurant_id') THEN
    ALTER TABLE public.orders ADD COLUMN zomato_restaurant_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'zomato_customer_id') THEN
    ALTER TABLE public.orders ADD COLUMN zomato_customer_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'zomato_delivery_partner_id') THEN
    ALTER TABLE public.orders ADD COLUMN zomato_delivery_partner_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'rapido_booking_id') THEN
    ALTER TABLE public.orders ADD COLUMN rapido_booking_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'rapido_rider_id') THEN
    ALTER TABLE public.orders ADD COLUMN rapido_rider_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'rapido_customer_id') THEN
    ALTER TABLE public.orders ADD COLUMN rapido_customer_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'rapido_trip_id') THEN
    ALTER TABLE public.orders ADD COLUMN rapido_trip_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'ondc_order_id') THEN
    ALTER TABLE public.orders ADD COLUMN ondc_order_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shiprocket_shipment_id') THEN
    ALTER TABLE public.orders ADD COLUMN shiprocket_shipment_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_fare_amount') THEN
    ALTER TABLE public.orders ADD COLUMN provider_fare_amount NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_commission') THEN
    ALTER TABLE public.orders ADD COLUMN provider_commission NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_rider_payout') THEN
    ALTER TABLE public.orders ADD COLUMN provider_rider_payout NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_webhook_data') THEN
    ALTER TABLE public.orders ADD COLUMN provider_webhook_data JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_created_at') THEN
    ALTER TABLE public.orders ADD COLUMN provider_created_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_updated_at') THEN
    ALTER TABLE public.orders ADD COLUMN provider_updated_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_customer_id') THEN
    ALTER TABLE public.orders ADD COLUMN provider_customer_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_merchant_id') THEN
    ALTER TABLE public.orders ADD COLUMN provider_merchant_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_restaurant_id') THEN
    ALTER TABLE public.orders ADD COLUMN provider_restaurant_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'webhook_event_id') THEN
    ALTER TABLE public.orders ADD COLUMN webhook_event_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tpl_provider_id') THEN
    ALTER TABLE public.orders ADD COLUMN tpl_provider_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tpl_order_request_id') THEN
    ALTER TABLE public.orders ADD COLUMN tpl_order_request_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tpl_inbound_order_id') THEN
    ALTER TABLE public.orders ADD COLUMN tpl_inbound_order_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'is_tpl_order') THEN
    ALTER TABLE public.orders ADD COLUMN is_tpl_order BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tpl_direction') THEN
    ALTER TABLE public.orders ADD COLUMN tpl_direction TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'assignment_provider') THEN
    ALTER TABLE public.orders ADD COLUMN assignment_provider TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'restaurant_name') THEN
    ALTER TABLE public.orders ADD COLUMN restaurant_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'restaurant_phone') THEN
    ALTER TABLE public.orders ADD COLUMN restaurant_phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'preparation_time_minutes') THEN
    ALTER TABLE public.orders ADD COLUMN preparation_time_minutes INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'food_items_count') THEN
    ALTER TABLE public.orders ADD COLUMN food_items_count INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'food_items_total_value') THEN
    ALTER TABLE public.orders ADD COLUMN food_items_total_value NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'requires_utensils') THEN
    ALTER TABLE public.orders ADD COLUMN requires_utensils BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'veg_non_veg') THEN
    ALTER TABLE public.orders ADD COLUMN veg_non_veg veg_non_veg_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'package_weight_kg') THEN
    ALTER TABLE public.orders ADD COLUMN package_weight_kg NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'package_length_cm') THEN
    ALTER TABLE public.orders ADD COLUMN package_length_cm NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'package_width_cm') THEN
    ALTER TABLE public.orders ADD COLUMN package_width_cm NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'package_height_cm') THEN
    ALTER TABLE public.orders ADD COLUMN package_height_cm NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'package_value') THEN
    ALTER TABLE public.orders ADD COLUMN package_value NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'is_fragile') THEN
    ALTER TABLE public.orders ADD COLUMN is_fragile BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'is_cod') THEN
    ALTER TABLE public.orders ADD COLUMN is_cod BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cod_amount') THEN
    ALTER TABLE public.orders ADD COLUMN cod_amount NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'requires_signature') THEN
    ALTER TABLE public.orders ADD COLUMN requires_signature BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'requires_otp_verification') THEN
    ALTER TABLE public.orders ADD COLUMN requires_otp_verification BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'insurance_required') THEN
    ALTER TABLE public.orders ADD COLUMN insurance_required BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'insurance_amount') THEN
    ALTER TABLE public.orders ADD COLUMN insurance_amount NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'package_description') THEN
    ALTER TABLE public.orders ADD COLUMN package_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'passenger_name') THEN
    ALTER TABLE public.orders ADD COLUMN passenger_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'passenger_phone') THEN
    ALTER TABLE public.orders ADD COLUMN passenger_phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'passenger_count') THEN
    ALTER TABLE public.orders ADD COLUMN passenger_count INTEGER DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'ride_type') THEN
    ALTER TABLE public.orders ADD COLUMN ride_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'vehicle_type_required') THEN
    ALTER TABLE public.orders ADD COLUMN vehicle_type_required TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'base_fare') THEN
    ALTER TABLE public.orders ADD COLUMN base_fare NUMERIC(10, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'distance_fare') THEN
    ALTER TABLE public.orders ADD COLUMN distance_fare NUMERIC(10, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'time_fare') THEN
    ALTER TABLE public.orders ADD COLUMN time_fare NUMERIC(10, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'surge_multiplier') THEN
    ALTER TABLE public.orders ADD COLUMN surge_multiplier NUMERIC(3, 2) DEFAULT 1.0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'toll_charges') THEN
    ALTER TABLE public.orders ADD COLUMN toll_charges NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'parking_charges') THEN
    ALTER TABLE public.orders ADD COLUMN parking_charges NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'waiting_charges') THEN
    ALTER TABLE public.orders ADD COLUMN waiting_charges NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'scheduled_ride') THEN
    ALTER TABLE public.orders ADD COLUMN scheduled_ride BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'scheduled_pickup_time') THEN
    ALTER TABLE public.orders ADD COLUMN scheduled_pickup_time TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'return_trip') THEN
    ALTER TABLE public.orders ADD COLUMN return_trip BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'return_pickup_address') THEN
    ALTER TABLE public.orders ADD COLUMN return_pickup_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'return_pickup_lat') THEN
    ALTER TABLE public.orders ADD COLUMN return_pickup_lat NUMERIC(10, 7);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'return_pickup_lon') THEN
    ALTER TABLE public.orders ADD COLUMN return_pickup_lon NUMERIC(10, 7);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'return_pickup_time') THEN
    ALTER TABLE public.orders ADD COLUMN return_pickup_time TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'assigned_via') THEN
    ALTER TABLE public.orders ADD COLUMN assigned_via TEXT DEFAULT 'auto';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'refund_status') THEN
    ALTER TABLE public.orders ADD COLUMN refund_status TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'refund_amount') THEN
    ALTER TABLE public.orders ADD COLUMN refund_amount NUMERIC(12, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'last_agent_action') THEN
    ALTER TABLE public.orders ADD COLUMN last_agent_action TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'last_agent_id') THEN
    ALTER TABLE public.orders ADD COLUMN last_agent_id INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'last_agent_action_at') THEN
    ALTER TABLE public.orders ADD COLUMN last_agent_action_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'risk_flagged') THEN
    ALTER TABLE public.orders ADD COLUMN risk_flagged BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'risk_reason') THEN
    ALTER TABLE public.orders ADD COLUMN risk_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'priority') THEN
    ALTER TABLE public.orders ADD COLUMN priority TEXT DEFAULT 'normal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'special_requirements') THEN
    ALTER TABLE public.orders ADD COLUMN special_requirements TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_metadata') THEN
    ALTER TABLE public.orders ADD COLUMN order_metadata JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'items') THEN
    ALTER TABLE public.orders ADD COLUMN items JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'food_order_status') THEN
    ALTER TABLE public.orders ADD COLUMN food_order_status order_status_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'parent_merchant_id') THEN
    ALTER TABLE public.orders ADD COLUMN parent_merchant_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'contact_person_name') THEN
    ALTER TABLE public.orders ADD COLUMN contact_person_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'contact_person_phone') THEN
    ALTER TABLE public.orders ADD COLUMN contact_person_phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_proof_url') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_proof_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_proof_type') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_proof_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_rating') THEN
    ALTER TABLE public.orders ADD COLUMN customer_rating NUMERIC(3, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_feedback') THEN
    ALTER TABLE public.orders ADD COLUMN customer_feedback TEXT;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: MIGRATE DATA FROM ORDERS TABLE
-- ============================================================================

-- Migrate data from orders table to unified orders table
-- This handles the case where orders table has data but orders_core doesn't
INSERT INTO public.orders (
  -- Order Identity
  id, order_uuid, formatted_order_id, external_ref,
  
  -- Service Classification
  order_type, order_category, order_source,
  
  -- Party References
  customer_id, merchant_store_id, merchant_parent_id, current_rider_id, rider_id,
  
  -- Location Information
  pickup_address, drop_address,
  pickup_address_raw, pickup_address_normalized, pickup_address_geocoded,
  pickup_lat, pickup_lon, pickup_address_deviation_meters,
  drop_address_raw, drop_address_normalized, drop_address_geocoded,
  drop_lat, drop_lon, drop_address_deviation_meters,
  distance_km, distance_mismatch_flagged, eta_seconds,
  
  -- Financial Information
  fare_amount, commission_amount, rider_earning,
  total_item_value, total_tax, total_discount, total_delivery_fee,
  total_ctm, total_payable, total_paid, total_refunded,
  has_tip, tip_amount,
  
  -- Order Status
  status, current_status, payment_status, payment_method,
  
  -- Timestamps
  created_at, updated_at,
  estimated_pickup_time, estimated_delivery_time,
  first_eta, promised_eta,
  actual_pickup_time, actual_delivery_time,
  cancelled_at, cancelled_by, cancelled_by_id, cancelled_by_type,
  cancellation_reason_id, cancellation_reason, cancellation_details,
  
  -- Merchant Details
  merchant_id, merchant_name, merchant_address, merchant_phone, merchant_email,
  merchant_store_name, merchant_cuisine_types, merchant_avg_prep_time,
  merchant_commission_rate, merchant_gst_number,
  
  -- Customer Details
  customer_name, customer_mobile, customer_email, customer_address_id,
  delivery_address_auto, delivery_address_manual, alternate_mobiles,
  landmark, pincode,
  is_self_order, order_for_name, order_for_mobile, order_for_relation,
  contact_less_delivery, special_delivery_notes, delivery_instructions,
  
  -- Device & App Info
  device_type, device_os, device_app_version, device_ip, user_agent,
  created_via, created_by_user_id,
  
  -- Delivery Type & Details
  delivery_type, delivery_initiator, locality_type, delivered_by,
  default_system_kpt_minutes, merchant_updated_kpt_minutes,
  
  -- Bulk Order
  is_bulk_order, bulk_reason, bulk_order_group_id,
  
  -- Provider Integration
  provider_order_id, provider_reference, external_order_id, buyer_app_name,
  synced_with_provider, sync_status, sync_error, sync_retry_count,
  last_sync_at, provider_status, provider_status_updated_at,
  swiggy_order_id, swiggy_restaurant_id, swiggy_customer_id, swiggy_delivery_partner_id,
  zomato_order_id, zomato_restaurant_id, zomato_customer_id, zomato_delivery_partner_id,
  rapido_booking_id, rapido_rider_id, rapido_customer_id, rapido_trip_id,
  ondc_order_id, shiprocket_shipment_id,
  provider_fare_amount, provider_commission, provider_rider_payout,
  provider_webhook_data, provider_created_at, provider_updated_at,
  provider_customer_id, provider_merchant_id, provider_restaurant_id,
  webhook_event_id,
  
  -- 3PL Provider Integration
  tpl_provider_id, tpl_order_request_id, tpl_inbound_order_id,
  is_tpl_order, tpl_direction, assignment_provider,
  
  -- Service-Specific Fields (Food)
  restaurant_name, restaurant_phone, preparation_time_minutes,
  food_items_count, food_items_total_value, requires_utensils, veg_non_veg,
  
  -- Service-Specific Fields (Parcel)
  package_weight_kg, package_length_cm, package_width_cm, package_height_cm,
  package_value, is_fragile, is_cod, cod_amount,
  requires_signature, requires_otp_verification,
  insurance_required, insurance_amount, package_description,
  
  -- Service-Specific Fields (Ride)
  passenger_name, passenger_phone, passenger_count,
  ride_type, vehicle_type_required,
  base_fare, distance_fare, time_fare, surge_multiplier,
  toll_charges, parking_charges, waiting_charges,
  scheduled_ride, scheduled_pickup_time,
  return_trip, return_pickup_address, return_pickup_lat, return_pickup_lon, return_pickup_time,
  
  -- Assignment & Rider Info
  assigned_via,
  
  -- Refund & Agent Actions
  refund_status, refund_amount,
  last_agent_action, last_agent_id, last_agent_action_at,
  
  -- Risk & Flags
  risk_flagged, risk_reason, priority, special_requirements,
  
  -- Metadata
  order_metadata, items,
  
  -- Legacy Fields
  food_order_status, parent_merchant_id,
  contact_person_name, contact_person_phone,
  delivery_proof_url, delivery_proof_type,
  customer_rating, customer_feedback
)
SELECT 
  -- Order Identity
  o.id,
  COALESCE(o.order_uuid, gen_random_uuid()) AS order_uuid,
  o.formatted_order_id,
  o.external_ref,
  
  -- Service Classification
  o.order_type,
  COALESCE(o.order_category, o.order_type::TEXT::order_category_type) AS order_category,
  COALESCE(o.order_source, 'internal'::order_source_type) AS order_source,
  
  -- Party References
  o.customer_id,
  COALESCE(o.merchant_store_id, o.merchant_id) AS merchant_store_id,
  o.merchant_parent_id,
  o.rider_id AS current_rider_id,
  o.rider_id,
  
  -- Location Information (legacy pickup_address/drop_address for NOT NULL compatibility)
  COALESCE(o.pickup_address_raw, o.pickup_address, '') AS pickup_address,
  COALESCE(o.drop_address_raw, o.drop_address, '') AS drop_address,
  COALESCE(o.pickup_address_raw, o.pickup_address) AS pickup_address_raw,
  o.pickup_address_normalized,
  o.pickup_address_geocoded,
  o.pickup_lat,
  o.pickup_lon,
  o.pickup_address_deviation_meters,
  COALESCE(o.drop_address_raw, o.drop_address) AS drop_address_raw,
  o.drop_address_normalized,
  o.drop_address_geocoded,
  o.drop_lat,
  o.drop_lon,
  o.drop_address_deviation_meters,
  o.distance_km,
  COALESCE(o.distance_mismatch_flagged, FALSE) AS distance_mismatch_flagged,
  o.eta_seconds,
  
  -- Financial Information
  o.fare_amount,
  o.commission_amount,
  o.rider_earning,
  COALESCE(o.total_item_value, 0) AS total_item_value,
  COALESCE(o.total_tax, 0) AS total_tax,
  COALESCE(o.total_discount, 0) AS total_discount,
  COALESCE(o.total_delivery_fee, 0) AS total_delivery_fee,
  COALESCE(o.total_ctm, 0) AS total_ctm,
  COALESCE(o.total_payable, 0) AS total_payable,
  COALESCE(o.total_paid, 0) AS total_paid,
  COALESCE(o.total_refunded, 0) AS total_refunded,
  COALESCE(o.has_tip, FALSE) AS has_tip,
  COALESCE(o.tip_amount, 0) AS tip_amount,
  
  -- Order Status
  o.status,
  (
    CASE UPPER(TRIM(COALESCE(o.current_status::TEXT, o.status::TEXT)))
      WHEN 'READY_FOR_PICKUP' THEN 'reached_store'
      WHEN 'PENDING' THEN 'assigned'
      WHEN 'CONFIRMED' THEN 'accepted'
      WHEN 'PREPARING' THEN 'assigned'
      WHEN 'READY' THEN 'reached_store'
      WHEN 'OUT_FOR_DELIVERY' THEN 'in_transit'
      WHEN 'DISPATCHED' THEN 'in_transit'
      WHEN 'COMPLETED' THEN 'delivered'
      WHEN 'CANCELLED' THEN 'cancelled'
      WHEN 'ASSIGNED' THEN 'assigned'
      WHEN 'ACCEPTED' THEN 'accepted'
      WHEN 'REACHED_STORE' THEN 'reached_store'
      WHEN 'PICKED_UP' THEN 'picked_up'
      WHEN 'IN_TRANSIT' THEN 'in_transit'
      WHEN 'DELIVERED' THEN 'delivered'
      WHEN 'FAILED' THEN 'failed'
      WHEN 'assigned' THEN 'assigned'
      WHEN 'accepted' THEN 'accepted'
      WHEN 'reached_store' THEN 'reached_store'
      WHEN 'picked_up' THEN 'picked_up'
      WHEN 'in_transit' THEN 'in_transit'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'failed' THEN 'failed'
      ELSE 'assigned'
    END
  )::order_status_type AS current_status,
  COALESCE(o.payment_status, 'pending'::payment_status_type) AS payment_status,
  o.payment_method,
  
  -- Timestamps
  o.created_at,
  o.updated_at,
  o.estimated_pickup_time,
  o.estimated_delivery_time,
  o.first_eta,
  o.promised_eta,
  o.actual_pickup_time,
  o.actual_delivery_time,
  o.cancelled_at,
  o.cancelled_by,
  o.cancelled_by_id,
  o.cancelled_by_type,
  o.cancellation_reason_id,
  o.cancellation_reason,
  o.cancellation_details,
  
  -- Merchant Details
  o.merchant_id,
  o.merchant_name,
  o.merchant_address,
  o.merchant_phone,
  o.merchant_email,
  o.merchant_store_name,
  o.merchant_cuisine_types,
  o.merchant_avg_prep_time,
  o.merchant_commission_rate,
  o.merchant_gst_number,
  
  -- Customer Details
  o.customer_name,
  o.customer_mobile,
  o.customer_email,
  o.customer_address_id,
  o.delivery_address_auto,
  o.delivery_address_manual,
  o.alternate_mobiles,
  o.landmark,
  o.pincode,
  COALESCE(o.is_self_order, TRUE) AS is_self_order,
  o.order_for_name,
  o.order_for_mobile,
  o.order_for_relation,
  COALESCE(o.contact_less_delivery, FALSE) AS contact_less_delivery,
  o.special_delivery_notes,
  COALESCE(o.delivery_instructions, o.special_delivery_notes) AS delivery_instructions,
  
  -- Device & App Info
  o.device_type,
  o.device_os,
  o.device_app_version,
  o.device_ip,
  o.user_agent,
  COALESCE(o.created_via, 'app') AS created_via,
  o.created_by_user_id,
  
  -- Delivery Type & Details
  COALESCE(o.delivery_type, 'standard'::delivery_type) AS delivery_type,
  COALESCE(o.delivery_initiator, 'customer'::delivery_initiator_type) AS delivery_initiator,
  o.locality_type,
  o.delivered_by,
  o.default_system_kpt_minutes,
  o.merchant_updated_kpt_minutes,
  
  -- Bulk Order
  COALESCE(o.is_bulk_order, FALSE) AS is_bulk_order,
  o.bulk_reason,
  o.bulk_order_group_id,
  
  -- Provider Integration
  o.provider_order_id,
  o.provider_reference,
  o.external_order_id,
  o.buyer_app_name,
  COALESCE(o.synced_with_provider, FALSE) AS synced_with_provider,
  o.sync_status,
  o.sync_error,
  COALESCE(o.sync_retry_count, 0) AS sync_retry_count,
  o.last_sync_at,
  o.provider_status,
  o.provider_status_updated_at,
  o.swiggy_order_id,
  o.swiggy_restaurant_id,
  o.swiggy_customer_id,
  o.swiggy_delivery_partner_id,
  o.zomato_order_id,
  o.zomato_restaurant_id,
  o.zomato_customer_id,
  o.zomato_delivery_partner_id,
  o.rapido_booking_id,
  o.rapido_rider_id,
  o.rapido_customer_id,
  o.rapido_trip_id,
  o.ondc_order_id,
  o.shiprocket_shipment_id,
  o.provider_fare_amount,
  o.provider_commission,
  o.provider_rider_payout,
  o.provider_webhook_data,
  o.provider_created_at,
  o.provider_updated_at,
  o.provider_customer_id,
  o.provider_merchant_id,
  o.provider_restaurant_id,
  o.webhook_event_id,
  
  -- 3PL Provider Integration
  o.tpl_provider_id,
  o.tpl_order_request_id,
  o.tpl_inbound_order_id,
  COALESCE(o.is_tpl_order, FALSE) AS is_tpl_order,
  o.tpl_direction,
  o.assignment_provider,
  
  -- Service-Specific Fields (Food)
  o.restaurant_name,
  o.restaurant_phone,
  o.preparation_time_minutes,
  o.food_items_count,
  o.food_items_total_value,
  COALESCE(o.requires_utensils, FALSE) AS requires_utensils,
  o.veg_non_veg,
  
  -- Service-Specific Fields (Parcel)
  o.package_weight_kg,
  o.package_length_cm,
  o.package_width_cm,
  o.package_height_cm,
  o.package_value,
  COALESCE(o.is_fragile, FALSE) AS is_fragile,
  COALESCE(o.is_cod, FALSE) AS is_cod,
  o.cod_amount,
  COALESCE(o.requires_signature, FALSE) AS requires_signature,
  COALESCE(o.requires_otp_verification, FALSE) AS requires_otp_verification,
  COALESCE(o.insurance_required, FALSE) AS insurance_required,
  o.insurance_amount,
  o.package_description,
  
  -- Service-Specific Fields (Ride)
  o.passenger_name,
  o.passenger_phone,
  COALESCE(o.passenger_count, 1) AS passenger_count,
  o.ride_type,
  o.vehicle_type_required,
  o.base_fare,
  o.distance_fare,
  o.time_fare,
  COALESCE(o.surge_multiplier, 1.0) AS surge_multiplier,
  COALESCE(o.toll_charges, 0) AS toll_charges,
  COALESCE(o.parking_charges, 0) AS parking_charges,
  COALESCE(o.waiting_charges, 0) AS waiting_charges,
  COALESCE(o.scheduled_ride, FALSE) AS scheduled_ride,
  o.scheduled_pickup_time,
  COALESCE(o.return_trip, FALSE) AS return_trip,
  o.return_pickup_address,
  o.return_pickup_lat,
  o.return_pickup_lon,
  o.return_pickup_time,
  
  -- Assignment & Rider Info
  COALESCE(o.assigned_via, 'auto') AS assigned_via,
  
  -- Refund & Agent Actions
  o.refund_status,
  COALESCE(o.refund_amount, 0) AS refund_amount,
  o.last_agent_action,
  o.last_agent_id,
  o.last_agent_action_at,
  
  -- Risk & Flags
  COALESCE(o.risk_flagged, FALSE) AS risk_flagged,
  o.risk_reason,
  COALESCE(o.priority, 'normal') AS priority,
  o.special_requirements,
  
  -- Metadata
  COALESCE(o.order_metadata, '{}'::jsonb) AS order_metadata,
  o.items,
  
  -- Legacy Fields
  o.food_order_status,
  o.parent_merchant_id,
  o.contact_person_name,
  o.contact_person_phone,
  o.delivery_proof_url,
  o.delivery_proof_type,
  o.customer_rating,
  o.customer_feedback
FROM public.orders o
WHERE NOT EXISTS (
  SELECT 1 FROM public.orders unified 
  WHERE unified.id = o.id
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STEP 4: MIGRATE DATA FROM ORDERS_CORE TABLE (IF EXISTS)
-- ============================================================================

-- Migrate data from orders_core table to unified orders table
-- Prefer orders_core data over orders data for newer records
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders_core') THEN
    INSERT INTO public.orders (
      -- Order Identity
      id, order_uuid, formatted_order_id, external_ref,
      
      -- Service Classification
      order_type, order_category, order_source,
      
      -- Party References
      customer_id, merchant_store_id, merchant_parent_id, current_rider_id, rider_id,
      
      -- Location Information (pickup_address/drop_address for legacy NOT NULL columns)
      pickup_address, drop_address,
      pickup_address_raw, pickup_address_normalized, pickup_address_geocoded,
      pickup_lat, pickup_lon, pickup_address_deviation_meters,
      drop_address_raw, drop_address_normalized, drop_address_geocoded,
      drop_lat, drop_lon, drop_address_deviation_meters,
      distance_km, distance_mismatch_flagged, eta_seconds,
      
      -- Financial Information
      fare_amount, commission_amount, rider_earning,
      total_item_value, total_tax, total_discount, total_delivery_fee,
      total_ctm, total_payable, total_paid, total_refunded,
      has_tip, tip_amount,
      
      -- Order Status
      status, current_status, payment_status, payment_method,
      
      -- Timestamps
      created_at, updated_at,
      estimated_pickup_time, estimated_delivery_time,
      first_eta, promised_eta,
      actual_pickup_time, actual_delivery_time,
      cancelled_at, cancelled_by, cancelled_by_id, cancelled_by_type,
      cancellation_reason_id, cancellation_reason, cancellation_details,
      
      -- Bulk Order
      is_bulk_order, bulk_order_group_id,
      
      -- Risk & Flags
      risk_flagged, risk_reason,
      
      -- Metadata
      order_metadata, items
    )
    SELECT 
      oc.id,
      oc.order_uuid,
      oc.formatted_order_id,
      oc.external_ref,
      
      oc.order_type,
      (oc.order_type::TEXT)::order_category_type AS order_category,
      oc.order_source,
      
      oc.customer_id,
      oc.merchant_store_id,
      oc.merchant_parent_id,
      oc.rider_id AS current_rider_id,
      oc.rider_id,
      
      COALESCE(oc.pickup_address_raw, '') AS pickup_address,
      COALESCE(oc.drop_address_raw, '') AS drop_address,
      oc.pickup_address_raw,
      oc.pickup_address_normalized,
      oc.pickup_address_geocoded,
      oc.pickup_lat,
      oc.pickup_lon,
      oc.pickup_address_deviation_meters,
      oc.drop_address_raw,
      oc.drop_address_normalized,
      oc.drop_address_geocoded,
      oc.drop_lat,
      oc.drop_lon,
      oc.drop_address_deviation_meters,
      oc.distance_km,
      oc.distance_mismatch_flagged,
      oc.eta_seconds,
      
      oc.fare_amount,
      oc.commission_amount,
      oc.rider_earning,
      COALESCE(oc.items->>'total_item_value', '0')::NUMERIC AS total_item_value,
      0 AS total_tax,
      0 AS total_discount,
      0 AS total_delivery_fee,
      0 AS total_ctm,
      0 AS total_payable,
      0 AS total_paid,
      0 AS total_refunded,
      FALSE AS has_tip,
      0 AS tip_amount,
      
      oc.status,
      (
        CASE UPPER(TRIM(COALESCE(oc.current_status, oc.status::TEXT)))
          WHEN 'READY_FOR_PICKUP' THEN 'reached_store'
          WHEN 'PENDING' THEN 'assigned'
          WHEN 'CONFIRMED' THEN 'accepted'
          WHEN 'PREPARING' THEN 'assigned'
          WHEN 'READY' THEN 'reached_store'
          WHEN 'OUT_FOR_DELIVERY' THEN 'in_transit'
          WHEN 'DISPATCHED' THEN 'in_transit'
          WHEN 'COMPLETED' THEN 'delivered'
          WHEN 'CANCELLED' THEN 'cancelled'
          WHEN 'ASSIGNED' THEN 'assigned'
          WHEN 'ACCEPTED' THEN 'accepted'
          WHEN 'REACHED_STORE' THEN 'reached_store'
          WHEN 'PICKED_UP' THEN 'picked_up'
          WHEN 'IN_TRANSIT' THEN 'in_transit'
          WHEN 'DELIVERED' THEN 'delivered'
          WHEN 'FAILED' THEN 'failed'
          WHEN 'assigned' THEN 'assigned'
          WHEN 'accepted' THEN 'accepted'
          WHEN 'reached_store' THEN 'reached_store'
          WHEN 'picked_up' THEN 'picked_up'
          WHEN 'in_transit' THEN 'in_transit'
          WHEN 'delivered' THEN 'delivered'
          WHEN 'cancelled' THEN 'cancelled'
          WHEN 'failed' THEN 'failed'
          ELSE 'assigned'
        END
      )::order_status_type AS current_status,
      oc.payment_status,
      oc.payment_method,
      
      oc.created_at,
      oc.updated_at,
      oc.estimated_pickup_time,
      oc.estimated_delivery_time,
      NULL AS first_eta,
      NULL AS promised_eta,
      oc.actual_pickup_time,
      oc.actual_delivery_time,
      oc.cancelled_at,
      oc.cancelled_by,
      oc.cancelled_by_id,
      oc.cancelled_by_type,
      oc.cancellation_reason_id,
      NULL AS cancellation_reason,
      oc.cancellation_details,
      
      oc.is_bulk_order,
      oc.bulk_order_group_id,
      
      oc.risk_flagged,
      oc.risk_reason,
      
      '{}'::jsonb AS order_metadata,
      oc.items
    FROM public.orders_core oc
    WHERE NOT EXISTS (
      SELECT 1 FROM public.orders unified 
      WHERE unified.id = oc.id
    )
    ON CONFLICT (id) DO UPDATE SET
      -- Update with orders_core data (prefer newer structure)
      pickup_address_raw = EXCLUDED.pickup_address_raw,
      pickup_address_normalized = EXCLUDED.pickup_address_normalized,
      pickup_address_geocoded = EXCLUDED.pickup_address_geocoded,
      drop_address_raw = EXCLUDED.drop_address_raw,
      drop_address_normalized = EXCLUDED.drop_address_normalized,
      drop_address_geocoded = EXCLUDED.drop_address_geocoded,
      distance_mismatch_flagged = EXCLUDED.distance_mismatch_flagged,
      current_status = EXCLUDED.current_status,
      risk_flagged = EXCLUDED.risk_flagged,
      risk_reason = EXCLUDED.risk_reason,
      items = EXCLUDED.items,
      updated_at = NOW();
    
    RAISE NOTICE 'Migrated data from orders_core table';
  END IF;
END $$;

-- ============================================================================
-- STEP 5: UPDATE FOREIGN KEY REFERENCES
-- ============================================================================

-- Update foreign key references in related tables to point to unified orders table
-- Note: Most tables already reference orders.id, so this step may not be needed
-- But we'll verify and update if necessary

-- ============================================================================
-- STEP 6: MIGRATE SERVICE-SPECIFIC DATA
-- ============================================================================

-- Migrate food order details
INSERT INTO public.order_food_details (
  order_id, restaurant_id, restaurant_name, restaurant_phone, restaurant_address,
  preparation_time_minutes, estimated_preparation_time, actual_preparation_time,
  food_items_count, food_items_total_value,
  requires_utensils, requires_packaging, veg_non_veg, food_metadata
)
SELECT 
  o.id,
  o.merchant_store_id AS restaurant_id,
  o.restaurant_name,
  o.restaurant_phone,
  NULL AS restaurant_address,
  o.preparation_time_minutes,
  NULL AS estimated_preparation_time,
  NULL AS actual_preparation_time,
  o.food_items_count,
  o.food_items_total_value,
  COALESCE(o.requires_utensils, FALSE) AS requires_utensils,
  TRUE AS requires_packaging,
  o.veg_non_veg,
  '{}'::jsonb AS food_metadata
FROM public.orders o
WHERE (o.order_type::TEXT) = 'food'
  AND NOT EXISTS (
    SELECT 1 FROM public.order_food_details ofd WHERE ofd.order_id = o.id
  )
ON CONFLICT (order_id) DO NOTHING;

-- Migrate parcel order details
INSERT INTO public.order_parcel_details (
  order_id, package_weight_kg, package_length_cm, package_width_cm, package_height_cm,
  package_value, package_description, package_contents,
  is_fragile, is_hazardous, requires_handling,
  is_cod, cod_amount, cod_collected, cod_collected_at,
  requires_signature, requires_otp_verification, requires_photo_proof,
  delivery_proof_url, insurance_required, insurance_amount, insurance_provider,
  parcel_metadata
)
SELECT 
  o.id,
  o.package_weight_kg,
  o.package_length_cm,
  o.package_width_cm,
  o.package_height_cm,
  o.package_value,
  o.package_description,
  NULL::TEXT[] AS package_contents,
  COALESCE(o.is_fragile, FALSE) AS is_fragile,
  FALSE AS is_hazardous,
  NULL AS requires_handling,
  COALESCE(o.is_cod, FALSE) AS is_cod,
  o.cod_amount,
  FALSE AS cod_collected,
  NULL AS cod_collected_at,
  COALESCE(o.requires_signature, FALSE) AS requires_signature,
  COALESCE(o.requires_otp_verification, FALSE) AS requires_otp_verification,
  FALSE AS requires_photo_proof,
  NULL AS delivery_proof_url,
  COALESCE(o.insurance_required, FALSE) AS insurance_required,
  o.insurance_amount,
  NULL AS insurance_provider,
  '{}'::jsonb AS parcel_metadata
FROM public.orders o
WHERE (o.order_type::TEXT) = 'parcel'
  AND NOT EXISTS (
    SELECT 1 FROM public.order_parcel_details opd WHERE opd.order_id = o.id
  )
ON CONFLICT (order_id) DO NOTHING;

-- Migrate ride order details
INSERT INTO public.order_ride_details (
  order_id, passenger_name, passenger_phone, passenger_email, passenger_count,
  ride_type, vehicle_type_required,
  base_fare, distance_fare, time_fare, surge_multiplier, surge_amount,
  toll_charges, parking_charges, waiting_charges, night_charges,
  gst_amount, discount_amount, total_fare,
  scheduled_ride, scheduled_pickup_time,
  return_trip, return_pickup_address, return_pickup_lat, return_pickup_lon, return_pickup_time,
  route_polyline, route_waypoints, estimated_route_distance_km, actual_route_distance_km,
  ride_metadata
)
SELECT 
  o.id,
  o.passenger_name,
  o.passenger_phone,
  NULL AS passenger_email,
  COALESCE(o.passenger_count, 1) AS passenger_count,
  o.ride_type,
  o.vehicle_type_required,
  o.base_fare,
  o.distance_fare,
  o.time_fare,
  COALESCE(o.surge_multiplier, 1.0) AS surge_multiplier,
  0 AS surge_amount,
  COALESCE(o.toll_charges, 0) AS toll_charges,
  COALESCE(o.parking_charges, 0) AS parking_charges,
  COALESCE(o.waiting_charges, 0) AS waiting_charges,
  0 AS night_charges,
  0 AS gst_amount,
  0 AS discount_amount,
  0 AS total_fare,
  COALESCE(o.scheduled_ride, FALSE) AS scheduled_ride,
  o.scheduled_pickup_time,
  COALESCE(o.return_trip, FALSE) AS return_trip,
  o.return_pickup_address,
  o.return_pickup_lat,
  o.return_pickup_lon,
  o.return_pickup_time,
  NULL AS route_polyline,
  '[]'::jsonb AS route_waypoints,
  NULL AS estimated_route_distance_km,
  NULL AS actual_route_distance_km,
  '{}'::jsonb AS ride_metadata
FROM public.orders o
WHERE (o.order_type::TEXT) IN ('ride', 'person_ride')
  AND NOT EXISTS (
    SELECT 1 FROM public.order_ride_details ord WHERE ord.order_id = o.id
  )
ON CONFLICT (order_id) DO NOTHING;

-- ============================================================================
-- STEP 7: MIGRATE OTP DATA
-- ============================================================================

-- Migrate OTPs from order_food_otps and order_otps to unified order_otps table
-- Note: OTPs are linked to rider assignments, so we need to find/create appropriate assignments

-- Migrate from order_food_otps (if exists)
DO $$
DECLARE
  v_otp_record RECORD;
  v_rider_assignment_id BIGINT;
  v_otp_type_value otp_type;
  v_otp_status_value otp_status;
  v_pending_exists BOOLEAN;
BEGIN
  -- Check if order_food_otps table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_food_otps') THEN
    FOR v_otp_record IN 
      SELECT 
        ofo.id,
        ofo.order_id,
        ofo.otp_code,
        ofo.otp_type,
        ofo.verified_at,
        ofo.verified_by,
        ofo.attempt_count,
        ofo.locked_until,
        ofo.created_at,
        ofo.updated_at,
        o.current_rider_id
      FROM public.order_food_otps ofo
      LEFT JOIN public.orders o ON o.id = ofo.order_id
      WHERE EXISTS (SELECT 1 FROM public.orders WHERE id = ofo.order_id)
    LOOP
      -- Find or create rider assignment for this order
      SELECT id INTO v_rider_assignment_id
      FROM public.order_rider_assignments
      WHERE order_id = v_otp_record.order_id
        AND rider_id = COALESCE(v_otp_record.current_rider_id, 
            (SELECT rider_id FROM public.order_rider_assignments WHERE order_id = v_otp_record.order_id LIMIT 1))
        AND assignment_status IN ('pending', 'assigned', 'accepted', 'completed')
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- If no assignment found, try to find any assignment for this order
      IF v_rider_assignment_id IS NULL THEN
        SELECT id INTO v_rider_assignment_id
        FROM public.order_rider_assignments
        WHERE order_id = v_otp_record.order_id
        ORDER BY created_at DESC
        LIMIT 1;
      END IF;
      
      -- Map OTP type: 'PICKUP' -> 'pickup', 'RTO' -> 'delivery' (RTO is return to origin, treated as delivery)
      IF v_otp_record.otp_type = 'PICKUP' THEN
        v_otp_type_value := 'pickup';
      ELSIF v_otp_record.otp_type = 'RTO' THEN
        v_otp_type_value := 'delivery';
      ELSE
        v_otp_type_value := 'pickup'; -- Default to pickup
      END IF;
      
      -- Only migrate if we have a rider assignment
      IF v_rider_assignment_id IS NOT NULL THEN
        -- Determine OTP status
        v_otp_status_value := CASE 
          WHEN v_otp_record.verified_at IS NOT NULL THEN 'verified'
          WHEN v_otp_record.locked_until IS NOT NULL AND v_otp_record.locked_until > NOW() THEN 'failed'
          WHEN v_otp_record.attempt_count >= 3 THEN 'failed'
          ELSE 'pending'
        END;
        
        -- Check if pending OTP already exists (only for pending status)
        -- Skip if one already exists (due to partial unique index constraint)
        IF v_otp_status_value = 'pending' THEN
          SELECT EXISTS (
            SELECT 1 FROM public.order_otps
            WHERE rider_assignment_id = v_rider_assignment_id
              AND otp_type = v_otp_type_value
              AND otp_status = 'pending'
          ) INTO v_pending_exists;
          
          -- Skip if pending OTP already exists
          IF v_pending_exists THEN
            CONTINUE;
          END IF;
        END IF;
        
        INSERT INTO public.order_otps (
          order_id,
          rider_assignment_id,
          otp_type,
          otp_code,
          otp_status,
          expires_at,
          attempt_count,
          max_attempts,
          locked_until,
          verified_at,
          verified_by,
          verification_method,
          created_at,
          updated_at
        ) VALUES (
          v_otp_record.order_id,
          v_rider_assignment_id,
          v_otp_type_value,
          v_otp_record.otp_code,
          v_otp_status_value,
          COALESCE(v_otp_record.created_at + INTERVAL '10 minutes', NOW() + INTERVAL '10 minutes'), -- Default expiry
          v_otp_record.attempt_count,
          3, -- Default max attempts
          v_otp_record.locked_until,
          v_otp_record.verified_at,
          v_otp_record.verified_by,
          CASE WHEN v_otp_record.verified_at IS NOT NULL THEN 'manual_entry' ELSE NULL END,
          v_otp_record.created_at,
          v_otp_record.updated_at
        );
      END IF;
    END LOOP;
    
    RAISE NOTICE 'Migrated OTPs from order_food_otps table';
  END IF;
END $$;

-- Migrate from order_otps (if exists and different from order_food_otps)
DO $$
DECLARE
  v_otp_record RECORD;
  v_rider_assignment_id BIGINT;
  v_otp_type_value otp_type;
  v_otp_status_value otp_status;
  v_pending_exists BOOLEAN;
BEGIN
  -- Check if order_otps table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_otps') THEN
    FOR v_otp_record IN 
      SELECT 
        oo.id,
        oo.order_id,
        oo.otp_type,
        oo.code AS otp_code,
        oo.verified_at,
        oo.bypass_reason,
        oo.created_at,
        oo.updated_at,
        o.current_rider_id
      FROM public.order_otps oo
      LEFT JOIN public.orders o ON o.id = oo.order_id
      WHERE EXISTS (SELECT 1 FROM public.orders WHERE id = oo.order_id)
        -- Skip if already migrated from order_food_otps
        AND NOT EXISTS (
          SELECT 1 FROM public.order_food_otps 
          WHERE order_id = oo.order_id
        )
    LOOP
      -- Find or create rider assignment for this order
      SELECT id INTO v_rider_assignment_id
      FROM public.order_rider_assignments
      WHERE order_id = v_otp_record.order_id
        AND rider_id = COALESCE(v_otp_record.current_rider_id,
            (SELECT rider_id FROM public.order_rider_assignments WHERE order_id = v_otp_record.order_id LIMIT 1))
        AND assignment_status IN ('pending', 'assigned', 'accepted', 'completed')
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- If no assignment found, try to find any assignment for this order
      IF v_rider_assignment_id IS NULL THEN
        SELECT id INTO v_rider_assignment_id
        FROM public.order_rider_assignments
        WHERE order_id = v_otp_record.order_id
        ORDER BY created_at DESC
        LIMIT 1;
      END IF;
      
      -- Map OTP type from enum to our enum
      -- Assuming order_otps.otp_type is already in correct format or needs mapping
      BEGIN
        v_otp_type_value := v_otp_record.otp_type::otp_type;
      EXCEPTION WHEN OTHERS THEN
        -- If type doesn't match, default to pickup
        v_otp_type_value := 'pickup';
      END;
      
      -- Only migrate if we have a rider assignment
      IF v_rider_assignment_id IS NOT NULL THEN
        -- Determine OTP status
        v_otp_status_value := CASE 
          WHEN v_otp_record.verified_at IS NOT NULL THEN 'verified'
          WHEN v_otp_record.bypass_reason IS NOT NULL THEN 'bypassed'
          ELSE 'pending'
        END;
        
        -- Check if pending OTP already exists (only for pending status)
        -- Skip if one already exists (due to partial unique index constraint)
        IF v_otp_status_value = 'pending' THEN
          SELECT EXISTS (
            SELECT 1 FROM public.order_otps
            WHERE rider_assignment_id = v_rider_assignment_id
              AND otp_type = v_otp_type_value
              AND otp_status = 'pending'
          ) INTO v_pending_exists;
          
          -- Skip if pending OTP already exists
          IF v_pending_exists THEN
            CONTINUE;
          END IF;
        END IF;
        
        INSERT INTO public.order_otps (
          order_id,
          rider_assignment_id,
          otp_type,
          otp_code,
          otp_status,
          expires_at,
          attempt_count,
          max_attempts,
          bypassed,
          bypass_reason,
          created_at,
          updated_at
        ) VALUES (
          v_otp_record.order_id,
          v_rider_assignment_id,
          v_otp_type_value,
          v_otp_record.otp_code,
          v_otp_status_value,
          COALESCE(v_otp_record.created_at + INTERVAL '10 minutes', NOW() + INTERVAL '10 minutes'),
          0, -- Default attempt count
          3, -- Default max attempts
          v_otp_record.bypass_reason IS NOT NULL,
          v_otp_record.bypass_reason,
          v_otp_record.created_at,
          v_otp_record.updated_at
        );
      END IF;
    END LOOP;
    
    RAISE NOTICE 'Migrated OTPs from order_otps table';
  END IF;
END $$;

-- Migrate OTP audit logs from order_food_otp_audit
DO $$
DECLARE
  v_audit_record RECORD;
  v_order_otp_id BIGINT;
  v_rider_assignment_id BIGINT;
  v_otp_type_value otp_type;
BEGIN
  -- Check if order_food_otp_audit table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_food_otp_audit') THEN
    FOR v_audit_record IN 
      SELECT 
        ofoa.id,
        ofoa.order_id,
        ofoa.action,
        ofoa.otp_type,
        ofoa.actor,
        ofoa.created_at
      FROM public.order_food_otp_audit ofoa
      WHERE EXISTS (SELECT 1 FROM public.orders WHERE id = ofoa.order_id)
    LOOP
      -- Find corresponding OTP record (compare as text to avoid order_otp_type vs otp_type enum mismatch)
      SELECT id, rider_assignment_id INTO v_order_otp_id, v_rider_assignment_id
      FROM public.order_otps
      WHERE order_id = v_audit_record.order_id
        AND (otp_type::text) = (CASE
          WHEN v_audit_record.otp_type = 'PICKUP' THEN 'pickup'
          WHEN v_audit_record.otp_type = 'RTO' THEN 'delivery'
          ELSE 'pickup'
        END)
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- Map OTP type
      IF v_audit_record.otp_type = 'PICKUP' THEN
        v_otp_type_value := 'pickup';
      ELSIF v_audit_record.otp_type = 'RTO' THEN
        v_otp_type_value := 'delivery';
      ELSE
        v_otp_type_value := 'pickup';
      END IF;
      
      -- Insert audit log entry
      INSERT INTO public.order_otp_audit (
        order_id,
        order_otp_id,
        rider_assignment_id,
        action,
        otp_type,
        actor_type,
        created_at
      ) VALUES (
        v_audit_record.order_id,
        v_order_otp_id,
        v_rider_assignment_id,
        v_audit_record.action,
        v_otp_type_value,
        COALESCE(v_audit_record.actor, 'system'),
        v_audit_record.created_at
      )
      ON CONFLICT DO NOTHING; -- Avoid duplicates
    END LOOP;
    
    RAISE NOTICE 'Migrated OTP audit logs from order_food_otp_audit table';
  END IF;
END $$;

-- ============================================================================
-- STEP 8: VERIFY DATA INTEGRITY
-- ============================================================================

DO $$
DECLARE
  v_orders_count BIGINT;
  v_unified_count BIGINT;
  v_missing_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orders_count FROM public.orders_backup;
  SELECT COUNT(*) INTO v_unified_count FROM public.orders;
  
  -- Check for missing orders
  SELECT COUNT(*) INTO v_missing_count
  FROM public.orders_backup ob
  WHERE NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = ob.id
  );
  
  RAISE NOTICE 'Migration Summary:';
  RAISE NOTICE '  Original orders count: %', v_orders_count;
  RAISE NOTICE '  Unified orders count: %', v_unified_count;
  RAISE NOTICE '  Missing orders: %', v_missing_count;
  
  IF v_missing_count > 0 THEN
    RAISE WARNING 'Some orders were not migrated! Check logs for details.';
  END IF;
END $$;

-- ============================================================================
-- STEP 9: CREATE ROLLBACK SCRIPT (For Safety)
-- ============================================================================

-- Note: Rollback script is created as a separate file
-- This ensures we can restore from backup if needed

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration to unified orders table completed successfully!';
  RAISE NOTICE 'Backup tables created: orders_backup, orders_core_backup';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Verify data integrity';
  RAISE NOTICE '  2. Test application with unified schema';
  RAISE NOTICE '  3. Once verified, you can drop backup tables';
END $$;
