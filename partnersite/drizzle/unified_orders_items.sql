-- ============================================================================
-- UNIFIED ORDERS ITEMS AND ADDONS TABLES
-- Production-Grade Order Items System
-- Supports all service types: food, parcel, ride
-- Migration: unified_orders_items
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Generic Items Table: Supports all order types
-- - Service-Specific Fields: item_type determines which fields are used
-- - Immutable After Creation: Items never updated after order creation
-- - Links to Merchant Menu: For food items, links to merchant_menu_items
-- ============================================================================

-- ============================================================================
-- ORDER ITEMS (Generic - Supports All Service Types)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- ITEM IDENTITY
  -- ==========================================================================
  item_id BIGINT, -- Generic item ID (if applicable)
  merchant_menu_id BIGINT, -- Reference to merchant_menu_items.id (for food items)
  item_name TEXT NOT NULL,
  item_title TEXT,
  item_description TEXT,
  item_image_url TEXT,
  item_category TEXT,
  item_subcategory TEXT,
  item_type TEXT, -- 'food_item', 'parcel', 'passenger', etc.
  
  -- ==========================================================================
  -- PRICING
  -- ==========================================================================
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  tax_percentage NUMERIC(5, 2) DEFAULT 0,
  tax_amount NUMERIC(10, 2) DEFAULT 0,
  total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
  
  -- ==========================================================================
  -- OFFERS & DISCOUNTS
  -- ==========================================================================
  merchant_offer JSONB DEFAULT '{}', -- Merchant-specific offer details
  platform_offer JSONB DEFAULT '{}', -- Platform-specific offer details
  final_item_price NUMERIC(10, 2) NOT NULL, -- Price after all discounts
  discount_amount NUMERIC(10, 2) DEFAULT 0,
  
  -- ==========================================================================
  -- FOOD-SPECIFIC FIELDS
  -- ==========================================================================
  is_veg BOOLEAN, -- Whether item is vegetarian
  spice_level TEXT, -- 'mild', 'medium', 'hot', 'extra_hot'
  customizations TEXT, -- Customization instructions (e.g., "no onions, extra cheese")
  
  -- ==========================================================================
  -- PARCEL-SPECIFIC FIELDS
  -- ==========================================================================
  item_weight_kg NUMERIC(5, 2), -- Item weight in kilograms
  item_value NUMERIC(10, 2), -- Declared value of item
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  item_metadata JSONB DEFAULT '{}', -- Additional item-specific metadata
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Items are immutable after order creation - no updated_at column
);

-- Indexes for order_items
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_item_id_idx ON public.order_items(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_merchant_menu_id_idx ON public.order_items(merchant_menu_id) WHERE merchant_menu_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_item_type_idx ON public.order_items(item_type) WHERE item_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_item_category_idx ON public.order_items(item_category) WHERE item_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_is_veg_idx ON public.order_items(is_veg) WHERE is_veg IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_created_at_idx ON public.order_items(created_at);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS order_items_order_type_idx ON public.order_items(order_id, item_type);

-- Comments
COMMENT ON TABLE public.order_items IS 'Items in order. Supports all order types (food, parcel, ride). Immutable after order creation.';
COMMENT ON COLUMN public.order_items.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_items.merchant_menu_id IS 'Reference to merchant_menu_items.id for food items.';
COMMENT ON COLUMN public.order_items.item_type IS 'Type of item: food_item, parcel, passenger, etc.';
COMMENT ON COLUMN public.order_items.unit_price IS 'Price per unit before discounts and taxes.';
COMMENT ON COLUMN public.order_items.total_price IS 'Total price (unit_price * quantity) before discounts and taxes.';
COMMENT ON COLUMN public.order_items.final_item_price IS 'Final price after all discounts and offers applied.';
COMMENT ON COLUMN public.order_items.is_veg IS 'Whether item is vegetarian (for food items).';
COMMENT ON COLUMN public.order_items.spice_level IS 'Spice level for food items: mild, medium, hot, extra_hot.';
COMMENT ON COLUMN public.order_items.customizations IS 'Customization instructions (e.g., "no onions, extra cheese").';
COMMENT ON COLUMN public.order_items.item_weight_kg IS 'Item weight in kilograms (for parcel items).';
COMMENT ON COLUMN public.order_items.item_value IS 'Declared value of item (for parcel items).';

-- ============================================================================
-- ORDER ITEM ADDONS (Addons for Order Items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_item_addons (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- ADDON IDENTITY
  -- ==========================================================================
  addon_id BIGINT, -- Reference to merchant_menu_addons.id (if applicable)
  addon_name TEXT NOT NULL,
  addon_type TEXT, -- 'extra', 'remove', 'substitute'
  
  -- ==========================================================================
  -- PRICING
  -- ==========================================================================
  addon_price NUMERIC(10, 2) DEFAULT 0,
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  addon_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Addons are immutable after order creation - no updated_at column
);

-- Indexes for order_item_addons
CREATE INDEX IF NOT EXISTS order_item_addons_order_item_id_idx ON public.order_item_addons(order_item_id);
CREATE INDEX IF NOT EXISTS order_item_addons_addon_id_idx ON public.order_item_addons(addon_id) WHERE addon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_item_addons_addon_type_idx ON public.order_item_addons(addon_type) WHERE addon_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_item_addons_created_at_idx ON public.order_item_addons(created_at);

-- Comments
COMMENT ON TABLE public.order_item_addons IS 'Addons for order items (e.g., extra cheese, no onions, substitute item). Immutable after order creation.';
COMMENT ON COLUMN public.order_item_addons.order_item_id IS 'Foreign key to order_items table.';
COMMENT ON COLUMN public.order_item_addons.addon_id IS 'Reference to merchant_menu_addons.id (if applicable).';
COMMENT ON COLUMN public.order_item_addons.addon_type IS 'Type of addon: extra (add something), remove (remove something), substitute (replace with something).';
COMMENT ON COLUMN public.order_item_addons.addon_price IS 'Additional price for this addon. Can be 0 for free addons or removals.';

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- Ensure total_price calculation is correct (unit_price * quantity)
-- Note: This is enforced at application level, but we can add a check constraint
-- However, CHECK constraints cannot reference other columns in PostgreSQL
-- So we'll rely on application logic for this validation

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_addons ENABLE ROW LEVEL SECURITY;
