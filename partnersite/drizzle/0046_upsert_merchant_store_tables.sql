-- Updated SQL for merchant_store and progress tables with proper UPSERT support

-- 1. Create or update merchant_store table with proper constraints
CREATE TABLE IF NOT EXISTS public.merchant_stores (
    id BIGSERIAL PRIMARY KEY,
    store_id TEXT UNIQUE NOT NULL,
    parent_id BIGINT NOT NULL,
    store_name TEXT NOT NULL,
    store_display_name TEXT,
    store_description TEXT,
    store_type TEXT NOT NULL DEFAULT 'RESTAURANT',
    custom_store_type TEXT,
    legal_business_name TEXT,
    store_email TEXT NOT NULL,
    store_phones TEXT[] DEFAULT '{}',
    owner_full_name TEXT NOT NULL,
    
    -- Address fields
    full_address TEXT,
    address_line1 TEXT,
    building_name TEXT,
    floor_number TEXT,
    unit_number TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'IN',
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    landmark TEXT,
    
    -- Store setup fields
    cuisine_types TEXT[] DEFAULT '{}',
    food_categories TEXT[] DEFAULT '{}',
    avg_preparation_time_minutes INTEGER DEFAULT 30,
    min_order_amount DECIMAL(10,2) DEFAULT 0,
    delivery_radius_km DECIMAL(5,2) DEFAULT 5,
    is_pure_veg BOOLEAN DEFAULT false,
    accepts_online_payment BOOLEAN DEFAULT true,
    accepts_cash BOOLEAN DEFAULT true,
    
    -- Media URLs
    logo_url TEXT,
    banner_url TEXT,
    gallery_image_urls TEXT[] DEFAULT '{}',
    
    -- Menu URLs
    menu_image_urls TEXT[] DEFAULT '{}',
    menu_spreadsheet_url TEXT,
    
    -- Status and timestamps
    registration_status TEXT DEFAULT 'IN_PROGRESS',
    current_onboarding_step INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 2. Create or update merchant_store_registration_progress table
CREATE TABLE IF NOT EXISTS public.merchant_store_registration_progress (
    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT NOT NULL,
    store_id BIGINT REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
    current_step INTEGER DEFAULT 1,
    total_steps INTEGER DEFAULT 9,
    completed_steps INTEGER DEFAULT 0,
    
    -- Step completion flags
    step_1_completed BOOLEAN DEFAULT false,
    step_2_completed BOOLEAN DEFAULT false,
    step_3_completed BOOLEAN DEFAULT false,
    step_4_completed BOOLEAN DEFAULT false,
    step_5_completed BOOLEAN DEFAULT false,
    step_6_completed BOOLEAN DEFAULT false,
    step_7_completed BOOLEAN DEFAULT false,
    step_8_completed BOOLEAN DEFAULT false,
    step_9_completed BOOLEAN DEFAULT false,
    
    -- Form data storage
    form_data JSONB DEFAULT '{}',
    
    -- Status and timestamps
    registration_status TEXT DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    last_step_completed_at TIMESTAMP WITH TIME ZONE
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS merchant_stores_parent_id_idx ON public.merchant_stores(parent_id);
CREATE INDEX IF NOT EXISTS merchant_stores_store_id_idx ON public.merchant_stores(store_id);
CREATE INDEX IF NOT EXISTS merchant_stores_status_idx ON public.merchant_stores(registration_status);

CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_parent_id_idx 
ON public.merchant_store_registration_progress(parent_id);
CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_store_id_idx 
ON public.merchant_store_registration_progress(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_status_idx 
ON public.merchant_store_registration_progress(registration_status);

-- 4. Create unique constraint for single active registration per parent
CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_registration_progress_parent_single_active_draft
ON public.merchant_store_registration_progress USING btree (parent_id)
TABLESPACE pg_default
WHERE (
  (store_id IS NULL)
  AND (registration_status = ANY (ARRAY['IN_PROGRESS'::text, 'DRAFT'::text]))
);

-- 5. Create function to upsert merchant_store data
CREATE OR REPLACE FUNCTION upsert_merchant_store(
    p_store_id TEXT,
    p_parent_id BIGINT,
    p_store_name TEXT,
    p_store_display_name TEXT DEFAULT NULL,
    p_store_description TEXT DEFAULT NULL,
    p_store_type TEXT DEFAULT 'RESTAURANT',
    p_custom_store_type TEXT DEFAULT NULL,
    p_legal_business_name TEXT DEFAULT NULL,
    p_store_email TEXT DEFAULT NULL,
    p_store_phones TEXT[] DEFAULT '{}',
    p_owner_full_name TEXT DEFAULT NULL,
    p_full_address TEXT DEFAULT NULL,
    p_address_line1 TEXT DEFAULT NULL,
    p_building_name TEXT DEFAULT NULL,
    p_floor_number TEXT DEFAULT NULL,
    p_unit_number TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_postal_code TEXT DEFAULT NULL,
    p_country TEXT DEFAULT 'IN',
    p_latitude DECIMAL DEFAULT NULL,
    p_longitude DECIMAL DEFAULT NULL,
    p_landmark TEXT DEFAULT NULL,
    p_cuisine_types TEXT[] DEFAULT '{}',
    p_food_categories TEXT[] DEFAULT '{}',
    p_avg_preparation_time_minutes INTEGER DEFAULT 30,
    p_min_order_amount DECIMAL DEFAULT 0,
    p_delivery_radius_km DECIMAL DEFAULT 5,
    p_is_pure_veg BOOLEAN DEFAULT false,
    p_accepts_online_payment BOOLEAN DEFAULT true,
    p_accepts_cash BOOLEAN DEFAULT true,
    p_logo_url TEXT DEFAULT NULL,
    p_banner_url TEXT DEFAULT NULL,
    p_gallery_image_urls TEXT[] DEFAULT '{}',
    p_menu_image_urls TEXT[] DEFAULT '{}',
    p_menu_spreadsheet_url TEXT DEFAULT NULL,
    p_registration_status TEXT DEFAULT 'IN_PROGRESS',
    p_current_onboarding_step INTEGER DEFAULT 1
)
RETURNS BIGINT AS $$
DECLARE
    store_record_id BIGINT;
BEGIN
    INSERT INTO public.merchant_stores (
        store_id, parent_id, store_name, store_display_name, store_description,
        store_type, custom_store_type, legal_business_name, store_email, store_phones,
        owner_full_name, full_address, address_line1, building_name, floor_number,
        unit_number, city, state, postal_code, country, latitude, longitude, landmark,
        cuisine_types, food_categories, avg_preparation_time_minutes, min_order_amount,
        delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
        logo_url, banner_url, gallery_image_urls, menu_image_urls, menu_spreadsheet_url,
        registration_status, current_onboarding_step, updated_at
    ) VALUES (
        p_store_id, p_parent_id, p_store_name, p_store_display_name, p_store_description,
        p_store_type, p_custom_store_type, p_legal_business_name, p_store_email, p_store_phones,
        p_owner_full_name, p_full_address, p_address_line1, p_building_name, p_floor_number,
        p_unit_number, p_city, p_state, p_postal_code, p_country, p_latitude, p_longitude, p_landmark,
        p_cuisine_types, p_food_categories, p_avg_preparation_time_minutes, p_min_order_amount,
        p_delivery_radius_km, p_is_pure_veg, p_accepts_online_payment, p_accepts_cash,
        p_logo_url, p_banner_url, p_gallery_image_urls, p_menu_image_urls, p_menu_spreadsheet_url,
        p_registration_status, p_current_onboarding_step, NOW()
    )
    ON CONFLICT (store_id) DO UPDATE SET
        store_name = COALESCE(EXCLUDED.store_name, merchant_stores.store_name),
        store_display_name = COALESCE(EXCLUDED.store_display_name, merchant_stores.store_display_name),
        store_description = COALESCE(EXCLUDED.store_description, merchant_stores.store_description),
        store_type = COALESCE(EXCLUDED.store_type, merchant_stores.store_type),
        custom_store_type = COALESCE(EXCLUDED.custom_store_type, merchant_stores.custom_store_type),
        legal_business_name = COALESCE(EXCLUDED.legal_business_name, merchant_stores.legal_business_name),
        store_email = COALESCE(EXCLUDED.store_email, merchant_stores.store_email),
        store_phones = COALESCE(EXCLUDED.store_phones, merchant_stores.store_phones),
        owner_full_name = COALESCE(EXCLUDED.owner_full_name, merchant_stores.owner_full_name),
        full_address = COALESCE(EXCLUDED.full_address, merchant_stores.full_address),
        address_line1 = COALESCE(EXCLUDED.address_line1, merchant_stores.address_line1),
        building_name = COALESCE(EXCLUDED.building_name, merchant_stores.building_name),
        floor_number = COALESCE(EXCLUDED.floor_number, merchant_stores.floor_number),
        unit_number = COALESCE(EXCLUDED.unit_number, merchant_stores.unit_number),
        city = COALESCE(EXCLUDED.city, merchant_stores.city),
        state = COALESCE(EXCLUDED.state, merchant_stores.state),
        postal_code = COALESCE(EXCLUDED.postal_code, merchant_stores.postal_code),
        country = COALESCE(EXCLUDED.country, merchant_stores.country),
        latitude = COALESCE(EXCLUDED.latitude, merchant_stores.latitude),
        longitude = COALESCE(EXCLUDED.longitude, merchant_stores.longitude),
        landmark = COALESCE(EXCLUDED.landmark, merchant_stores.landmark),
        cuisine_types = COALESCE(EXCLUDED.cuisine_types, merchant_stores.cuisine_types),
        food_categories = COALESCE(EXCLUDED.food_categories, merchant_stores.food_categories),
        avg_preparation_time_minutes = COALESCE(EXCLUDED.avg_preparation_time_minutes, merchant_stores.avg_preparation_time_minutes),
        min_order_amount = COALESCE(EXCLUDED.min_order_amount, merchant_stores.min_order_amount),
        delivery_radius_km = COALESCE(EXCLUDED.delivery_radius_km, merchant_stores.delivery_radius_km),
        is_pure_veg = COALESCE(EXCLUDED.is_pure_veg, merchant_stores.is_pure_veg),
        accepts_online_payment = COALESCE(EXCLUDED.accepts_online_payment, merchant_stores.accepts_online_payment),
        accepts_cash = COALESCE(EXCLUDED.accepts_cash, merchant_stores.accepts_cash),
        logo_url = COALESCE(EXCLUDED.logo_url, merchant_stores.logo_url),
        banner_url = COALESCE(EXCLUDED.banner_url, merchant_stores.banner_url),
        gallery_image_urls = COALESCE(EXCLUDED.gallery_image_urls, merchant_stores.gallery_image_urls),
        menu_image_urls = COALESCE(EXCLUDED.menu_image_urls, merchant_stores.menu_image_urls),
        menu_spreadsheet_url = COALESCE(EXCLUDED.menu_spreadsheet_url, merchant_stores.menu_spreadsheet_url),
        registration_status = COALESCE(EXCLUDED.registration_status, merchant_stores.registration_status),
        current_onboarding_step = COALESCE(EXCLUDED.current_onboarding_step, merchant_stores.current_onboarding_step),
        updated_at = NOW()
    RETURNING id INTO store_record_id;
    
    RETURN store_record_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Create function to upsert registration progress
CREATE OR REPLACE FUNCTION upsert_registration_progress(
    p_parent_id BIGINT,
    p_store_id BIGINT DEFAULT NULL,
    p_current_step INTEGER DEFAULT 1,
    p_total_steps INTEGER DEFAULT 9,
    p_completed_steps INTEGER DEFAULT 0,
    p_step_1_completed BOOLEAN DEFAULT false,
    p_step_2_completed BOOLEAN DEFAULT false,
    p_step_3_completed BOOLEAN DEFAULT false,
    p_step_4_completed BOOLEAN DEFAULT false,
    p_step_5_completed BOOLEAN DEFAULT false,
    p_step_6_completed BOOLEAN DEFAULT false,
    p_step_7_completed BOOLEAN DEFAULT false,
    p_step_8_completed BOOLEAN DEFAULT false,
    p_step_9_completed BOOLEAN DEFAULT false,
    p_form_data JSONB DEFAULT '{}',
    p_registration_status TEXT DEFAULT 'IN_PROGRESS',
    p_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_last_step_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    progress_record_id BIGINT;
BEGIN
    INSERT INTO public.merchant_store_registration_progress (
        parent_id, store_id, current_step, total_steps, completed_steps,
        step_1_completed, step_2_completed, step_3_completed, step_4_completed,
        step_5_completed, step_6_completed, step_7_completed, step_8_completed,
        step_9_completed, form_data, registration_status, completed_at,
        last_step_completed_at, updated_at
    ) VALUES (
        p_parent_id, p_store_id, p_current_step, p_total_steps, p_completed_steps,
        p_step_1_completed, p_step_2_completed, p_step_3_completed, p_step_4_completed,
        p_step_5_completed, p_step_6_completed, p_step_7_completed, p_step_8_completed,
        p_step_9_completed, p_form_data, p_registration_status, p_completed_at,
        p_last_step_completed_at, NOW()
    )
    ON CONFLICT (parent_id) 
    WHERE (store_id IS NULL AND registration_status = ANY (ARRAY['IN_PROGRESS'::text, 'DRAFT'::text]))
    DO UPDATE SET
        store_id = COALESCE(EXCLUDED.store_id, merchant_store_registration_progress.store_id),
        current_step = COALESCE(EXCLUDED.current_step, merchant_store_registration_progress.current_step),
        total_steps = COALESCE(EXCLUDED.total_steps, merchant_store_registration_progress.total_steps),
        completed_steps = COALESCE(EXCLUDED.completed_steps, merchant_store_registration_progress.completed_steps),
        step_1_completed = COALESCE(EXCLUDED.step_1_completed, merchant_store_registration_progress.step_1_completed),
        step_2_completed = COALESCE(EXCLUDED.step_2_completed, merchant_store_registration_progress.step_2_completed),
        step_3_completed = COALESCE(EXCLUDED.step_3_completed, merchant_store_registration_progress.step_3_completed),
        step_4_completed = COALESCE(EXCLUDED.step_4_completed, merchant_store_registration_progress.step_4_completed),
        step_5_completed = COALESCE(EXCLUDED.step_5_completed, merchant_store_registration_progress.step_5_completed),
        step_6_completed = COALESCE(EXCLUDED.step_6_completed, merchant_store_registration_progress.step_6_completed),
        step_7_completed = COALESCE(EXCLUDED.step_7_completed, merchant_store_registration_progress.step_7_completed),
        step_8_completed = COALESCE(EXCLUDED.step_8_completed, merchant_store_registration_progress.step_8_completed),
        step_9_completed = COALESCE(EXCLUDED.step_9_completed, merchant_store_registration_progress.step_9_completed),
        form_data = COALESCE(EXCLUDED.form_data, merchant_store_registration_progress.form_data),
        registration_status = COALESCE(EXCLUDED.registration_status, merchant_store_registration_progress.registration_status),
        completed_at = COALESCE(EXCLUDED.completed_at, merchant_store_registration_progress.completed_at),
        last_step_completed_at = COALESCE(EXCLUDED.last_step_completed_at, merchant_store_registration_progress.last_step_completed_at),
        updated_at = NOW()
    RETURNING id INTO progress_record_id;
    
    RETURN progress_record_id;
END;
$$ LANGUAGE plpgsql;