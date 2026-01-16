-- ============================================================================
-- MERCHANT DOMAIN SCHEMA - Production Grade
-- GatiMitra Multi-Service Platform
-- Migration: 0010_merchant_domain_complete
-- Database: Supabase PostgreSQL
-- 
-- SERVICES: Food Delivery, Parcel Delivery, Ride Booking
-- FEATURES: Multi-store, Multi-service, KYC, Menu, Offers, Payouts, Audit
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_type') THEN
    CREATE TYPE merchant_type AS ENUM ('LOCAL', 'BRAND', 'CHAIN', 'FRANCHISE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_status') THEN
    CREATE TYPE merchant_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLOCKED', 'PENDING_APPROVAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status') THEN
    CREATE TYPE verification_status AS ENUM ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type_merchant') THEN
    CREATE TYPE document_type_merchant AS ENUM ('GST', 'PAN', 'AADHAAR', 'FSSAI', 'TRADE_LICENSE', 'BANK_PROOF', 'SHOP_ACT', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_type') THEN
    CREATE TYPE service_type AS ENUM ('FOOD', 'PARCEL', 'RIDE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_status') THEN
    CREATE TYPE store_status AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE', 'DELISTED', 'BLOCKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_status') THEN
    CREATE TYPE payout_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ON_HOLD');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE activity_type AS ENUM ('DELISTED', 'RELISTED', 'BLOCKED', 'UNBLOCKED', 'STATUS_CHANGED', 'MENU_UPDATED', 'HOURS_UPDATED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'day_of_week') THEN
    CREATE TYPE day_of_week AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');
  END IF;
END $$;

-- ============================================================================
-- PHASE 1: CORE MERCHANT STRUCTURE
-- ============================================================================

-- Merchant Parents (Brand/Chain Owner)
CREATE TABLE IF NOT EXISTS merchant_parents (
  id BIGSERIAL PRIMARY KEY,
  parent_merchant_id TEXT NOT NULL UNIQUE,
  parent_name TEXT NOT NULL,
  merchant_type merchant_type NOT NULL DEFAULT 'LOCAL',
  
  -- Owner Details
  owner_name TEXT NOT NULL,
  owner_email TEXT,
  registered_phone TEXT NOT NULL UNIQUE,
  registered_phone_normalized TEXT,
  alternate_phone TEXT,
  
  -- Business Details
  business_name TEXT,
  brand_name TEXT,
  business_category TEXT,
  
  -- Status
  status merchant_status NOT NULL DEFAULT 'PENDING_APPROVAL',
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Soft Delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by INTEGER,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_by INTEGER
);

CREATE INDEX IF NOT EXISTS merchant_parents_parent_merchant_id_idx ON merchant_parents(parent_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_parents_registered_phone_idx ON merchant_parents(registered_phone);
CREATE INDEX IF NOT EXISTS merchant_parents_status_idx ON merchant_parents(status);
CREATE INDEX IF NOT EXISTS merchant_parents_is_active_idx ON merchant_parents(is_active) WHERE is_active = TRUE;

-- Merchant Stores (Individual Outlets)
CREATE TABLE IF NOT EXISTS merchant_stores (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT NOT NULL UNIQUE,
  parent_id BIGINT NOT NULL REFERENCES merchant_parents(id) ON DELETE RESTRICT,
  
  -- Store Identity
  store_name TEXT NOT NULL,
  store_display_name TEXT,
  store_description TEXT,
  store_type TEXT, -- 'RESTAURANT', 'CLOUD_KITCHEN', 'WAREHOUSE', 'STORE', 'GARAGE'
  
  -- Contact
  store_email TEXT,
  store_phones TEXT[],
  
  -- Address
  full_address TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  landmark TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT DEFAULT 'IN',
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  
  -- Media
  logo_url TEXT,
  banner_url TEXT,
  gallery_images TEXT[],
  
  -- Cuisine/Category (for food)
  cuisine_types TEXT[],
  food_categories TEXT[],
  
  -- Configuration
  avg_preparation_time_minutes INTEGER DEFAULT 30,
  min_order_amount NUMERIC(10, 2) DEFAULT 0,
  max_order_amount NUMERIC(10, 2),
  delivery_radius_km NUMERIC(5, 2),
  is_pure_veg BOOLEAN DEFAULT FALSE,
  accepts_online_payment BOOLEAN DEFAULT TRUE,
  accepts_cash BOOLEAN DEFAULT TRUE,
  
  -- Status & Approval
  status store_status NOT NULL DEFAULT 'DRAFT',
  approval_status TEXT,
  approval_reason TEXT,
  approved_by INTEGER,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_reason TEXT,
  
  -- Registration Progress
  current_onboarding_step INTEGER DEFAULT 1,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Operational
  is_active BOOLEAN DEFAULT FALSE,
  is_accepting_orders BOOLEAN DEFAULT FALSE,
  is_available BOOLEAN DEFAULT FALSE,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  
  -- Soft Delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by INTEGER,
  delist_reason TEXT,
  delisted_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_by INTEGER
);

CREATE INDEX IF NOT EXISTS merchant_stores_store_id_idx ON merchant_stores(store_id);
CREATE INDEX IF NOT EXISTS merchant_stores_parent_id_idx ON merchant_stores(parent_id);
CREATE INDEX IF NOT EXISTS merchant_stores_status_idx ON merchant_stores(status);
CREATE INDEX IF NOT EXISTS merchant_stores_city_idx ON merchant_stores(city);
CREATE INDEX IF NOT EXISTS merchant_stores_postal_code_idx ON merchant_stores(postal_code);
CREATE INDEX IF NOT EXISTS merchant_stores_is_active_idx ON merchant_stores(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_stores_is_accepting_orders_idx ON merchant_stores(is_accepting_orders) WHERE is_accepting_orders = TRUE;
CREATE INDEX IF NOT EXISTS merchant_stores_location_idx ON merchant_stores(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Merchant Store Services (Multi-Service Support)
CREATE TABLE IF NOT EXISTS merchant_store_services (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  service_type service_type NOT NULL,
  
  -- Service Configuration
  is_enabled BOOLEAN DEFAULT TRUE,
  is_available BOOLEAN DEFAULT TRUE,
  service_radius_km NUMERIC(5, 2),
  min_order_amount NUMERIC(10, 2),
  avg_service_time_minutes INTEGER,
  
  -- Service-Specific Config (JSONB)
  service_config JSONB DEFAULT '{}',
  
  -- Status
  enabled_at TIMESTAMP WITH TIME ZONE,
  disabled_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id, service_type)
);

CREATE INDEX IF NOT EXISTS merchant_store_services_store_id_idx ON merchant_store_services(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_services_service_type_idx ON merchant_store_services(service_type);
CREATE INDEX IF NOT EXISTS merchant_store_services_is_enabled_idx ON merchant_store_services(is_enabled) WHERE is_enabled = TRUE;

-- Link orders to merchant stores
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS merchant_store_id BIGINT REFERENCES merchant_stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merchant_parent_id BIGINT REFERENCES merchant_parents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_merchant_store_id_idx ON orders(merchant_store_id);
CREATE INDEX IF NOT EXISTS orders_merchant_parent_id_idx ON orders(merchant_parent_id);

-- ============================================================================
-- PHASE 2: VERIFICATION & COMPLIANCE
-- ============================================================================

-- Merchant Store Verification
CREATE TABLE IF NOT EXISTS merchant_store_verification (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Verification Details
  verification_type TEXT NOT NULL, -- 'KYC', 'ADDRESS', 'BUSINESS', 'BANK', 'TAX'
  verification_status verification_status NOT NULL DEFAULT 'PENDING',
  
  -- Verifier
  verified_by INTEGER,
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT,
  
  -- Rejection
  rejected_reason TEXT,
  rejected_at TIMESTAMP WITH TIME ZONE,
  
  -- Expiry
  expires_at TIMESTAMP WITH TIME ZONE,
  renewal_required BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  verification_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_verification_store_id_idx ON merchant_store_verification(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_verification_status_idx ON merchant_store_verification(verification_status);
CREATE INDEX IF NOT EXISTS merchant_store_verification_type_idx ON merchant_store_verification(verification_type);

-- Merchant Store Documents
CREATE TABLE IF NOT EXISTS merchant_store_documents (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Document Details
  document_type document_type_merchant NOT NULL,
  document_number TEXT,
  document_url TEXT NOT NULL,
  document_name TEXT,
  
  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by INTEGER,
  verified_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Expiry
  issued_date DATE,
  expiry_date DATE,
  is_expired BOOLEAN DEFAULT FALSE,
  
  -- Version Control
  document_version INTEGER DEFAULT 1,
  is_latest BOOLEAN DEFAULT TRUE,
  replaced_by BIGINT REFERENCES merchant_store_documents(id),
  
  -- Metadata
  document_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  uploaded_by INTEGER
);

CREATE INDEX IF NOT EXISTS merchant_store_documents_store_id_idx ON merchant_store_documents(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_documents_document_type_idx ON merchant_store_documents(document_type);
CREATE INDEX IF NOT EXISTS merchant_store_documents_is_verified_idx ON merchant_store_documents(is_verified);
CREATE INDEX IF NOT EXISTS merchant_store_documents_is_latest_idx ON merchant_store_documents(is_latest) WHERE is_latest = TRUE;

-- Merchant Store Tax Details
CREATE TABLE IF NOT EXISTS merchant_store_tax_details (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- GST
  gst_number TEXT,
  gst_registered BOOLEAN DEFAULT FALSE,
  gst_certificate_url TEXT,
  gstin_verification_status verification_status DEFAULT 'PENDING',
  
  -- PAN
  pan_number TEXT,
  pan_holder_name TEXT,
  pan_card_url TEXT,
  pan_verification_status verification_status DEFAULT 'PENDING',
  
  -- Other Tax IDs
  tan_number TEXT,
  cin_number TEXT,
  
  -- Tax Configuration
  is_tax_exempt BOOLEAN DEFAULT FALSE,
  tax_exemption_reason TEXT,
  default_tax_percentage NUMERIC(5, 2) DEFAULT 5.0,
  
  -- FSSAI (Food Safety)
  fssai_number TEXT,
  fssai_certificate_url TEXT,
  fssai_expiry_date DATE,
  fssai_verification_status verification_status DEFAULT 'PENDING',
  
  -- Trade License
  trade_license_number TEXT,
  trade_license_url TEXT,
  trade_license_expiry_date DATE,
  
  -- Metadata
  tax_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS merchant_store_tax_details_store_id_idx ON merchant_store_tax_details(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_tax_details_gst_number_idx ON merchant_store_tax_details(gst_number) WHERE gst_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_tax_details_pan_number_idx ON merchant_store_tax_details(pan_number) WHERE pan_number IS NOT NULL;

-- Merchant Store Bank Accounts
CREATE TABLE IF NOT EXISTS merchant_store_bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Bank Details
  account_holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_number_encrypted TEXT, -- Encrypted version
  ifsc_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch_name TEXT,
  account_type TEXT, -- 'SAVINGS', 'CURRENT'
  
  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by INTEGER,
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_method TEXT, -- 'PENNY_DROP', 'MANUAL', 'DOCUMENT'
  
  -- UPI
  upi_id TEXT,
  upi_verified BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  bank_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_store_id_idx ON merchant_store_bank_accounts(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_is_primary_idx ON merchant_store_bank_accounts(is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_is_verified_idx ON merchant_store_bank_accounts(is_verified);

-- ============================================================================
-- PHASE 3: MENU & CATALOG
-- ============================================================================

-- Menu Categories
CREATE TABLE IF NOT EXISTS merchant_menu_categories (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Category Details
  category_name TEXT NOT NULL,
  category_description TEXT,
  category_image_url TEXT,
  
  -- Ordering
  display_order INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  category_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_categories_store_id_idx ON merchant_menu_categories(store_id);
CREATE INDEX IF NOT EXISTS merchant_menu_categories_is_active_idx ON merchant_menu_categories(is_active) WHERE is_active = TRUE;

-- Menu Items
CREATE TABLE IF NOT EXISTS merchant_menu_items (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES merchant_menu_categories(id) ON DELETE SET NULL,
  item_id TEXT NOT NULL UNIQUE,
  
  -- Item Details
  item_name TEXT NOT NULL,
  item_description TEXT,
  item_image_url TEXT,
  
  -- Classification
  food_type TEXT, -- 'VEG', 'NON_VEG', 'VEGAN', 'EGG'
  spice_level TEXT, -- 'MILD', 'MEDIUM', 'HOT', 'EXTRA_HOT'
  cuisine_type TEXT,
  
  -- Pricing
  base_price NUMERIC(10, 2) NOT NULL,
  selling_price NUMERIC(10, 2) NOT NULL,
  discount_percentage NUMERIC(5, 2) DEFAULT 0,
  tax_percentage NUMERIC(5, 2) DEFAULT 0,
  
  -- Stock
  in_stock BOOLEAN DEFAULT TRUE,
  available_quantity INTEGER,
  low_stock_threshold INTEGER,
  
  -- Features
  has_customizations BOOLEAN DEFAULT FALSE,
  has_addons BOOLEAN DEFAULT FALSE,
  has_variants BOOLEAN DEFAULT FALSE,
  is_popular BOOLEAN DEFAULT FALSE,
  is_recommended BOOLEAN DEFAULT FALSE,
  
  -- Preparation
  preparation_time_minutes INTEGER DEFAULT 15,
  serves INTEGER DEFAULT 1,
  
  -- Ordering
  display_order INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  item_metadata JSONB DEFAULT '{}',
  nutritional_info JSONB DEFAULT '{}',
  allergens TEXT[],
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_items_store_id_idx ON merchant_menu_items(store_id);
CREATE INDEX IF NOT EXISTS merchant_menu_items_category_id_idx ON merchant_menu_items(category_id);
CREATE INDEX IF NOT EXISTS merchant_menu_items_item_id_idx ON merchant_menu_items(item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_items_is_active_idx ON merchant_menu_items(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_menu_items_in_stock_idx ON merchant_menu_items(in_stock) WHERE in_stock = TRUE;

-- Link order_items to menu_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS merchant_menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS order_items_merchant_menu_item_id_idx ON order_items(merchant_menu_item_id);

-- Menu Item Customizations
CREATE TABLE IF NOT EXISTS merchant_menu_item_customizations (
  id BIGSERIAL PRIMARY KEY,
  customization_id TEXT NOT NULL UNIQUE,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  
  -- Customization Details
  customization_title TEXT NOT NULL,
  customization_type TEXT, -- 'SIZE', 'ADDON', 'VARIANT', 'OPTION'
  
  -- Rules
  is_required BOOLEAN DEFAULT FALSE,
  min_selection INTEGER DEFAULT 0,
  max_selection INTEGER DEFAULT 1,
  
  -- Ordering
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_item_customizations_menu_item_id_idx ON merchant_menu_item_customizations(menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_customizations_customization_id_idx ON merchant_menu_item_customizations(customization_id);

-- Menu Item Addons
CREATE TABLE IF NOT EXISTS merchant_menu_item_addons (
  id BIGSERIAL PRIMARY KEY,
  addon_id TEXT NOT NULL UNIQUE,
  customization_id BIGINT NOT NULL REFERENCES merchant_menu_item_customizations(id) ON DELETE CASCADE,
  
  -- Addon Details
  addon_name TEXT NOT NULL,
  addon_price NUMERIC(10, 2) DEFAULT 0,
  addon_image_url TEXT,
  
  -- Stock
  in_stock BOOLEAN DEFAULT TRUE,
  
  -- Ordering
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_item_addons_customization_id_idx ON merchant_menu_item_addons(customization_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_addons_addon_id_idx ON merchant_menu_item_addons(addon_id);

-- Menu Item Variants (Size, Color, etc.)
CREATE TABLE IF NOT EXISTS merchant_menu_item_variants (
  id BIGSERIAL PRIMARY KEY,
  variant_id TEXT NOT NULL UNIQUE,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  
  -- Variant Details
  variant_name TEXT NOT NULL,
  variant_type TEXT, -- 'SIZE', 'COLOR', 'WEIGHT', 'VOLUME'
  
  -- Pricing
  variant_price NUMERIC(10, 2) NOT NULL,
  price_difference NUMERIC(10, 2) DEFAULT 0, -- Difference from base price
  
  -- Stock
  in_stock BOOLEAN DEFAULT TRUE,
  available_quantity INTEGER,
  
  -- SKU
  sku TEXT,
  barcode TEXT,
  
  -- Ordering
  display_order INTEGER DEFAULT 0,
  
  -- Status
  is_default BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_item_variants_menu_item_id_idx ON merchant_menu_item_variants(menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_variants_variant_id_idx ON merchant_menu_item_variants(variant_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_variants_is_default_idx ON merchant_menu_item_variants(is_default) WHERE is_default = TRUE;

-- ============================================================================
-- PHASE 4: OFFERS & PROMOTIONS
-- ============================================================================

-- Merchant Offers
CREATE TABLE IF NOT EXISTS merchant_offers (
  id BIGSERIAL PRIMARY KEY,
  offer_id TEXT NOT NULL UNIQUE,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Offer Details
  offer_title TEXT NOT NULL,
  offer_description TEXT,
  offer_image_url TEXT,
  offer_terms TEXT,
  
  -- Offer Type
  offer_type TEXT NOT NULL, -- 'PERCENTAGE', 'FLAT', 'BUY_X_GET_Y', 'FREE_DELIVERY', 'FREE_ITEM'
  offer_sub_type TEXT, -- 'ALL_ORDERS', 'SPECIFIC_ITEMS', 'CATEGORY', 'FIRST_ORDER'
  
  -- Discount Details
  discount_value NUMERIC(10, 2),
  discount_percentage NUMERIC(5, 2),
  max_discount_amount NUMERIC(10, 2),
  
  -- Conditions
  min_order_amount NUMERIC(10, 2),
  max_order_amount NUMERIC(10, 2),
  min_items INTEGER,
  applicable_on_days day_of_week[],
  applicable_time_start TIME,
  applicable_time_end TIME,
  
  -- Buy X Get Y
  buy_quantity INTEGER,
  get_quantity INTEGER,
  
  -- Usage Limits
  max_uses_total INTEGER,
  max_uses_per_user INTEGER,
  current_uses INTEGER DEFAULT 0,
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_till TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  
  -- Priority
  display_priority INTEGER DEFAULT 0,
  
  -- Metadata
  offer_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by INTEGER
);

CREATE INDEX IF NOT EXISTS merchant_offers_store_id_idx ON merchant_offers(store_id);
CREATE INDEX IF NOT EXISTS merchant_offers_offer_id_idx ON merchant_offers(offer_id);
CREATE INDEX IF NOT EXISTS merchant_offers_is_active_idx ON merchant_offers(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_offers_validity_idx ON merchant_offers(valid_from, valid_till);

-- Merchant Coupons
CREATE TABLE IF NOT EXISTS merchant_coupons (
  id BIGSERIAL PRIMARY KEY,
  coupon_id TEXT NOT NULL UNIQUE,
  store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE,
  parent_id BIGINT REFERENCES merchant_parents(id) ON DELETE CASCADE,
  
  -- Coupon Code
  coupon_code TEXT NOT NULL UNIQUE,
  coupon_description TEXT,
  
  -- Coupon Type
  coupon_type TEXT NOT NULL, -- 'PERCENTAGE', 'FLAT', 'FREE_DELIVERY'
  discount_value NUMERIC(10, 2),
  discount_percentage NUMERIC(5, 2),
  max_discount_amount NUMERIC(10, 2),
  
  -- Conditions
  min_order_amount NUMERIC(10, 2),
  applicable_service_types service_type[],
  
  -- Usage Limits
  max_uses_total INTEGER,
  max_uses_per_user INTEGER,
  current_uses INTEGER DEFAULT 0,
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_till TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  coupon_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT check_store_or_parent CHECK (
    (store_id IS NOT NULL AND parent_id IS NULL) OR
    (store_id IS NULL AND parent_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS merchant_coupons_store_id_idx ON merchant_coupons(store_id);
CREATE INDEX IF NOT EXISTS merchant_coupons_parent_id_idx ON merchant_coupons(parent_id);
CREATE INDEX IF NOT EXISTS merchant_coupons_coupon_code_idx ON merchant_coupons(coupon_code);
CREATE INDEX IF NOT EXISTS merchant_coupons_is_active_idx ON merchant_coupons(is_active) WHERE is_active = TRUE;

-- Merchant Offer Applicability (Item-Offer Mapping)
CREATE TABLE IF NOT EXISTS merchant_offer_applicability (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES merchant_offers(id) ON DELETE CASCADE,
  menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES merchant_menu_categories(id) ON DELETE CASCADE,
  
  -- Applicability
  applicability_type TEXT NOT NULL, -- 'ITEM', 'CATEGORY', 'ALL'
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT check_item_or_category CHECK (
    (menu_item_id IS NOT NULL AND category_id IS NULL) OR
    (menu_item_id IS NULL AND category_id IS NOT NULL) OR
    (menu_item_id IS NULL AND category_id IS NULL AND applicability_type = 'ALL')
  )
);

CREATE INDEX IF NOT EXISTS merchant_offer_applicability_offer_id_idx ON merchant_offer_applicability(offer_id);
CREATE INDEX IF NOT EXISTS merchant_offer_applicability_menu_item_id_idx ON merchant_offer_applicability(menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_offer_applicability_category_id_idx ON merchant_offer_applicability(category_id);

-- ============================================================================
-- ADD MISSING FOREIGN KEYS (Conditional)
-- ============================================================================

-- Merchant Parents -> System Users (if system_users table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_users') THEN
    -- merchant_parents.created_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_parents' 
        AND column_name = 'created_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_parents_created_by_fkey'
    ) THEN
      ALTER TABLE merchant_parents
        ADD CONSTRAINT merchant_parents_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_parents.updated_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_parents' 
        AND column_name = 'updated_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_parents_updated_by_fkey'
    ) THEN
      ALTER TABLE merchant_parents
        ADD CONSTRAINT merchant_parents_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_parents.deleted_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_parents' 
        AND column_name = 'deleted_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_parents_deleted_by_fkey'
    ) THEN
      ALTER TABLE merchant_parents
        ADD CONSTRAINT merchant_parents_deleted_by_fkey
        FOREIGN KEY (deleted_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_stores.approved_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_stores' 
        AND column_name = 'approved_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_stores_approved_by_fkey'
    ) THEN
      ALTER TABLE merchant_stores
        ADD CONSTRAINT merchant_stores_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_stores.created_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_stores' 
        AND column_name = 'created_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_stores_created_by_fkey'
    ) THEN
      ALTER TABLE merchant_stores
        ADD CONSTRAINT merchant_stores_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_stores.updated_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_stores' 
        AND column_name = 'updated_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_stores_updated_by_fkey'
    ) THEN
      ALTER TABLE merchant_stores
        ADD CONSTRAINT merchant_stores_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_stores.deleted_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_stores' 
        AND column_name = 'deleted_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_stores_deleted_by_fkey'
    ) THEN
      ALTER TABLE merchant_stores
        ADD CONSTRAINT merchant_stores_deleted_by_fkey
        FOREIGN KEY (deleted_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_store_verification.verified_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_store_verification' 
        AND column_name = 'verified_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_store_verification_verified_by_fkey'
    ) THEN
      ALTER TABLE merchant_store_verification
        ADD CONSTRAINT merchant_store_verification_verified_by_fkey
        FOREIGN KEY (verified_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_store_documents.verified_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_store_documents' 
        AND column_name = 'verified_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_store_documents_verified_by_fkey'
    ) THEN
      ALTER TABLE merchant_store_documents
        ADD CONSTRAINT merchant_store_documents_verified_by_fkey
        FOREIGN KEY (verified_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    -- merchant_store_bank_accounts.verified_by
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_store_bank_accounts' 
        AND column_name = 'verified_by'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'merchant_store_bank_accounts_verified_by_fkey'
    ) THEN
      ALTER TABLE merchant_store_bank_accounts
        ADD CONSTRAINT merchant_store_bank_accounts_verified_by_fkey
        FOREIGN KEY (verified_by) REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
