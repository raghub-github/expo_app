-- =============================================================================
-- MERCHANT MENU ITEMS – FINAL REFERENCE SQL
-- Use for reference or fresh DB. Existing DBs: run 0035_merchant_menu_variant_type_ensure.sql
-- if variant_type is missing. All writes go through API (service role) to avoid RLS errors.
-- =============================================================================

-- Items (main table)
CREATE TABLE IF NOT EXISTS public.merchant_menu_items (
  id bigserial NOT NULL,
  store_id bigint NOT NULL,
  category_id bigint NULL,
  item_id text NOT NULL,
  item_name text NOT NULL,
  item_description text NULL,
  item_image_url text NULL,
  food_type text NULL,
  spice_level text NULL,
  cuisine_type text NULL,
  base_price numeric(10, 2) NOT NULL,
  selling_price numeric(10, 2) NOT NULL,
  discount_percentage numeric(5, 2) NULL DEFAULT 0,
  tax_percentage numeric(5, 2) NULL DEFAULT 0,
  in_stock boolean NULL DEFAULT true,
  available_quantity integer NULL,
  low_stock_threshold integer NULL,
  has_customizations boolean NULL DEFAULT false,
  has_addons boolean NULL DEFAULT false,
  has_variants boolean NULL DEFAULT false,
  is_popular boolean NULL DEFAULT false,
  is_recommended boolean NULL DEFAULT false,
  preparation_time_minutes integer NULL DEFAULT 15,
  serves integer NULL DEFAULT 1,
  is_active boolean NULL DEFAULT true,
  allergens text[] NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_menu_items_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_menu_items_item_id_key UNIQUE (item_id),
  CONSTRAINT merchant_menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES merchant_menu_categories (id) ON DELETE SET NULL,
  CONSTRAINT merchant_menu_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES merchant_stores (id) ON DELETE CASCADE,
  CONSTRAINT merchant_menu_items_base_price_positive CHECK (base_price > 0),
  CONSTRAINT merchant_menu_items_selling_price_positive CHECK (selling_price > 0)
);

CREATE INDEX IF NOT EXISTS merchant_menu_items_store_id_idx ON public.merchant_menu_items USING btree (store_id);
CREATE INDEX IF NOT EXISTS merchant_menu_items_category_id_idx ON public.merchant_menu_items USING btree (category_id);
CREATE INDEX IF NOT EXISTS merchant_menu_items_item_id_idx ON public.merchant_menu_items USING btree (item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_items_is_active_idx ON public.merchant_menu_items USING btree (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS merchant_menu_items_in_stock_idx ON public.merchant_menu_items USING btree (in_stock) WHERE in_stock = true;
CREATE INDEX IF NOT EXISTS merchant_menu_items_store_active_idx ON public.merchant_menu_items USING btree (store_id, is_active) WHERE is_active = true;

-- Variants (with title: variant_type e.g. "Size")
CREATE TABLE IF NOT EXISTS public.merchant_menu_item_variants (
  id bigserial NOT NULL,
  variant_id text NOT NULL,
  menu_item_id bigint NOT NULL,
  variant_name text NOT NULL,
  variant_type text NULL,
  variant_price numeric(10, 2) NOT NULL,
  price_difference numeric(10, 2) NULL DEFAULT 0,
  in_stock boolean NULL DEFAULT true,
  available_quantity integer NULL,
  sku text NULL,
  barcode text NULL,
  display_order integer NULL DEFAULT 0,
  is_default boolean NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_menu_item_variants_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_menu_item_variants_variant_id_key UNIQUE (variant_id),
  CONSTRAINT merchant_menu_item_variants_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES merchant_menu_items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS merchant_menu_item_variants_menu_item_id_idx ON public.merchant_menu_item_variants USING btree (menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_variants_variant_id_idx ON public.merchant_menu_item_variants USING btree (variant_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_variants_is_default_idx ON public.merchant_menu_item_variants USING btree (is_default) WHERE is_default = true;

-- Customizations
CREATE TABLE IF NOT EXISTS public.merchant_menu_item_customizations (
  id bigserial NOT NULL,
  customization_id text NOT NULL,
  menu_item_id bigint NOT NULL,
  customization_title text NOT NULL,
  customization_type text NULL,
  is_required boolean NULL DEFAULT false,
  min_selection integer NULL DEFAULT 0,
  max_selection integer NULL DEFAULT 1,
  display_order integer NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_menu_item_customizations_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_menu_item_customizations_customization_id_key UNIQUE (customization_id),
  CONSTRAINT merchant_menu_item_customizations_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES merchant_menu_items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS merchant_menu_item_customizations_menu_item_id_idx ON public.merchant_menu_item_customizations USING btree (menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_customizations_customization_id_idx ON public.merchant_menu_item_customizations USING btree (customization_id);

-- Addons (per customization)
CREATE TABLE IF NOT EXISTS public.merchant_menu_item_addons (
  id bigserial NOT NULL,
  addon_id text NOT NULL,
  customization_id bigint NOT NULL,
  addon_name text NOT NULL,
  addon_price numeric(10, 2) NULL DEFAULT 0,
  addon_image_url text NULL,
  in_stock boolean NULL DEFAULT true,
  display_order integer NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_menu_item_addons_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_menu_item_addons_addon_id_key UNIQUE (addon_id),
  CONSTRAINT merchant_menu_item_addons_customization_id_fkey FOREIGN KEY (customization_id) REFERENCES merchant_menu_item_customizations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS merchant_menu_item_addons_customization_id_idx ON public.merchant_menu_item_addons USING btree (customization_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_addons_addon_id_idx ON public.merchant_menu_item_addons USING btree (addon_id);
