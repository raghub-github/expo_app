// Count stores by operational_status for verification page
export const fetchVerificationStatusCounts = async () => {
  const { data, error } = await supabase
    .from('merchant_stores')
    .select('approval_status')
    .is('deleted_at', null);
  if (error) {
    console.error('Error fetching verification status counts:', error);
    return { pending: 0, underReview: 0 };
  }
  let pending = 0, underReview = 0;
  (data || []).forEach((row: any) => {
    if (row.approval_status === 'DRAFT' || row.approval_status === 'SUBMITTED') pending++;
    if (row.approval_status === 'UNDER_VERIFICATION') underReview++;
  });
  return { pending, underReview };
};
// src/lib/database.ts

import { supabase, supabaseAdmin } from './supabase'
import { FoodOrder, OrderStats } from './types'
import { MerchantStore } from './types'

// ============================================
// MENU CATEGORY QUERIES
// ============================================

// Fetch all menu categories for a store (by store_id, not internal id)
export const fetchMenuCategories = async (storeId: string) => {
  try {
    // Get store's internal ID (bigint) from store_id (text)
    const { data: storeData, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single();
    if (storeError || !storeData) {
      throw new Error('Store not found');
    }
    const { data, error } = await supabase
      .from('merchant_menu_categories')
      .select('*')
      .eq('store_id', storeData.id)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching menu categories:', error);
    return [];
  }
};

// Create a new menu category
export const createMenuCategory = async (storeId: string, category: any) => {
  try {
    // Get store's internal ID (bigint) from store_id (text)
    const { data: storeData, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single();
    if (storeError || !storeData) {
      throw new Error('Store not found');
    }
    const payload = {
      ...category,
      store_id: storeData.id,
    };
    const { data, error } = await supabase
      .from('merchant_menu_categories')
      .insert([payload])
      .select()
      .single();
    if (error) {
      console.error('Error creating menu category:', {
        error,
        payload,
      });
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Error creating menu category (outer catch):', error);
    return null;
  }
};

// Update a menu category by id
export const updateMenuCategory = async (categoryId: number, updates: any) => {
  try {
    const { data, error } = await supabase
      .from('merchant_menu_categories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', categoryId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating menu category:', error);
    return null;
  }
};

// Delete a menu category by id
export const deleteMenuCategory = async (categoryId: number) => {
  try {
    const { error } = await supabase
      .from('merchant_menu_categories')
      .delete()
      .eq('id', categoryId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting menu category:', error);
    return false;
  }
};

// ============================================
// MERCHANT STORE QUERIES
// ============================================

export const fetchStoreById = async (storeId: string): Promise<MerchantStore | null> => {
  try {
    const { data, error } = await supabase
       .from('merchant_stores')
      .select('*')
      .eq('store_id', storeId)
      .single();
    if (error) throw error;
    return data as MerchantStore;
  } catch (error) {
    console.error('Error fetching store:', error);
    return null;
  }
}

export const fetchStoreByName = async (storeName: string): Promise<MerchantStore | null> => {
  try {
    const { data, error } = await supabase
       .from('merchant_stores')
      .select('*')
      .ilike('store_name', `%${storeName}%`)
      .single();
    if (error) {
      console.error('Store not found:', storeName);
      return null;
    }
    return data as MerchantStore;
  } catch (error) {
    console.error('Error fetching store by name:', error);
    return null;
  }
}

export const fetchAllStores = async (): Promise<MerchantStore[]> => {
  try {
    const { data, error } = await supabase
      .from('merchant_stores')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as MerchantStore[];
  } catch (error: any) {
    console.error('Error fetching stores:', error.message, error.stack);
    return [];
  }
}

export const registerStore = async (store: Partial<MerchantStore>): Promise<{ data: MerchantStore | null, error: any }> => {
  try {
    const requiredFields = ['store_name', 'owner_name', 'city', 'state'];
    for (const field of requiredFields) {
      if (!store[field as keyof typeof store]) {
        console.error('Missing required field:', field);
        return { data: null, error: { message: `Missing required field: ${field}` } };
      }
    }
    const { data, error } = await supabase
      .from('merchant_stores')
      .insert([store])
      .select()
      .single();
    return { data: data as MerchantStore, error };
  } catch (error) {
    console.error('Error registering store:', error);
    return { data: null, error };
  }
}

export const updateStoreInfo = async (storeId: string, updates: Partial<MerchantStore>): Promise<boolean> => {
  try {
    // Only allow fields that exist in the DB schema
    const allowedFields = [
      'store_name', 'store_display_name', 'store_description', 'store_email', 'store_phones',
      'full_address', 'landmark', 'city', 'state', 'postal_code', 'country', 'latitude', 'longitude',
      'logo_url', 'banner_url', 'gallery_images', 'cuisine_types', 'food_categories',
      'avg_preparation_time_minutes', 'min_order_amount', 'delivery_radius_km', 'is_pure_veg',
      'accepts_online_payment', 'accepts_cash', 'status', 'approval_status', 'approval_reason',
      'approved_by', 'approved_at', 'rejected_reason', 'current_onboarding_step', 'onboarding_completed',
      'onboarding_completed_at', 'is_active', 'is_accepting_orders', 'is_available', 'last_activity_at',
      'deleted_at', 'deleted_by', 'delist_reason', 'delisted_at', 'created_by', 'updated_by',
      'store_type', 'operational_status', 'parent_merchant_id', 'am_name', 'am_mobile', 'am_email', 'owner_name',
      'gst_number', 'pan_number', 'aadhar_number', 'fssai_number', 'bank_account_holder', 'bank_account_number', 'bank_ifsc', 'bank_name', 'ads_images'
    ];
    const sanitized: Record<string, any> = {};
    const updatesObj = updates as Record<string, any>;
    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(updatesObj, key)) {
        // Remove undefined values, but allow null for nullable fields
        if (updatesObj[key] !== undefined) {
          sanitized[key] = updatesObj[key];
        }
      }
    }
    sanitized.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('merchant_stores')
      .update(sanitized)
      .eq('store_id', storeId);
    if (error) throw error;
    return true;
  } catch (error: any) {
    // Log more details for debugging
    console.error('Error updating store:', {
      message: error?.message,
      stack: error?.stack,
      error
    });
    return false;
  }
}

// Fetch operating hours for a store
export const fetchStoreOperatingHours = async (storeId: string) => {
  try {
    // First, get the numeric id from merchant_stores using the string storeId
    const { data: storeData, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single();
    if (storeError || !storeData) throw storeError || new Error('Store not found');
    const storeBigIntId = storeData.id;
    const { data, error } = await supabase
      .from('merchant_store_operating_hours')
      .select('*')
      .eq('store_id', storeBigIntId)
      .single();
    if (error || !data) throw error || new Error('Operating hours not found');
    // Transform to array of days
    const days = [
      { key: 'monday', label: 'Monday' },
      { key: 'tuesday', label: 'Tuesday' },
      { key: 'wednesday', label: 'Wednesday' },
      { key: 'thursday', label: 'Thursday' },
      { key: 'friday', label: 'Friday' },
      { key: 'saturday', label: 'Saturday' },
      { key: 'sunday', label: 'Sunday' }
    ];
    return days.map(day => ({
      day_label: day.label,
      open: data[`${day.key}_open`],
      slot1_start: data[`${day.key}_slot1_start`],
      slot1_end: data[`${day.key}_slot1_end`],
      slot2_start: data[`${day.key}_slot2_start`],
      slot2_end: data[`${day.key}_slot2_end`],
      total_duration_minutes: data[`${day.key}_total_duration_minutes`],
    }));
  } catch (error) {
    console.error('Error fetching operating hours:', error);
    return [];
  }
}

// ============================================
// OFFERS QUERIES (FIXED)
// ============================================

// Offer type (strictly matches DB schema)
export interface Offer {
  offer_id: string;
  store_id: number; // bigint
  offer_title: string;
  offer_description: string | null;
  offer_type: 'BUY_N_GET_M' | 'PERCENTAGE' | 'FLAT' | 'COUPON' | 'FREE_ITEM';
  offer_sub_type: 'ALL_ORDERS' | 'SPECIFIC_ITEM';
  menu_item_ids: string[] | null;
  discount_value: string | null; // numeric(10,2) comes as string
  min_order_amount: string | null; // numeric(10,2) comes as string
  buy_quantity: number | null;
  get_quantity: number | null;
  coupon_code: string | null;
  image_url: string | null;
  valid_from: string;
  valid_till: string;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

// Fetch active offers for a store
// (removed duplicate fetchActiveOffers)
//
export const fetchActiveOffers = async (storeId: string): Promise<Offer[]> => {
  try {
    // Resolve bigint id from merchant_store
    const { data: storeData, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single();
    if (storeError || !storeData) {
      throw storeError || new Error('Store not found');
    }
    const storeBigIntId = storeData.id;
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('store_id', storeBigIntId)
      .eq('is_active', true)
      .gte('valid_till', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching offers:', error);
    return [];
  }
};
// Fetch all offers (including inactive) for a store
export async function fetchAllOffers(storeId: string): Promise<Offer[]> {
  try {
    // Get store's internal ID (bigint) from store_id (text)
    const { data: storeData, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single();

    if (storeError || !storeData) {
      console.error('Store not found for ID:', storeId);
      return [];
    }

    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('store_id', storeData.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all offers:', error);
      return [];
    }
    return data as Offer[] || [];
  } catch (error) {
    console.error('Error in fetchAllOffers:', error);
    return [];
  }
}



// Create new offer
export async function createOffer(offerData: any): Promise<Offer | null> {
  try {
    // IMPORTANT: The frontend must always send a valid store_id in offerData.
    if (!offerData.store_id) {
      const errMsg = 'Offer creation failed: store_id is required. The frontend must always send store_id.';
      console.error('createOffer: Missing store_id in offerData:', offerData);
      return { error: errMsg } as any;
    }
    let storeBigIntId: number | null = null;
    if (typeof offerData.store_id === 'number') {
      storeBigIntId = offerData.store_id;
    } else if (typeof offerData.store_id === 'string') {
      const { data: storeData, error: storeError, status } = await supabase
        .from('merchant_stores')
        .select('id')
        .eq('store_id', offerData.store_id)
        .single();
      if (storeError || !storeData) {
        console.error('[createOffer] merchant_store lookup failed:', {
          input_store_id: offerData.store_id,
          storeError,
          status,
          storeData
        });
        if (storeError && storeError.code === 'PGRST116') {
          // RLS: row not visible to this user/session
          console.error('[createOffer] RLS may be blocking access to merchant_store for this store_id.');
        }
        return null;
      }
      storeBigIntId = storeData.id;
    }
    if (!storeBigIntId) {
      console.error('[createOffer] Could not resolve store_id (bigint) for offer creation. Input:', offerData);
      return null;
    }

    // Prepare payload strictly per schema
    const payload = {
      store_id: storeBigIntId,
      offer_title: offerData.offer_title,
      offer_description: offerData.offer_description ?? null,
      offer_type: offerData.offer_type,
      offer_sub_type: offerData.offer_sub_type,
      menu_item_ids: offerData.menu_item_ids ?? null,
      discount_value: offerData.discount_value ?? null,
      min_order_amount: offerData.min_order_amount ?? null,
      buy_quantity: offerData.buy_quantity ?? null,
      get_quantity: offerData.get_quantity ?? null,
      coupon_code: offerData.coupon_code ?? null,
      image_url: offerData.image_url ?? null,
      valid_from: offerData.valid_from,
      valid_till: offerData.valid_till,
      is_active: offerData.is_active ?? true
    };

    const { data, error } = await supabase
      .from('offers')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating offer:', error);
      console.error('Supabase error details:', JSON.stringify(error, null, 2));
      console.error('Payload sent:', JSON.stringify(payload, null, 2));
      return null;
    }
    return data as Offer;
  } catch (error) {
    console.error('Error creating offer (exception):', error);
    return null;
  }
}

// Update offer
export async function updateOffer(offerId: string, offerData: any): Promise<Offer | null> {
  try {
    const { data, error } = await supabase
      .from('offers')
      .update(offerData)
      .eq('offer_id', offerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating offer:', error);
    return null;
  }
}

// Delete offer
export async function deleteOffer(offerId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('offers')
      .delete()
      .eq('offer_id', offerId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting offer:', error);
    return false;
  }
}

// Upload offer image to R2
export async function uploadOfferImage(storeId: string, offerId: string, file: File): Promise<string | null> {
  try {
    // Prepare file path for R2
    const fileExt = file.name.split('.').pop();
    const fileName = `${storeId}_${offerId}_${Date.now()}.${fileExt}`;
    const filePath = `offers/${fileName}`;

    // Upload to R2 using the same API as menu items
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parent', 'offers');
    formData.append('filename', fileName);
    // No menu_item_id needed for offers

    const uploadRes = await fetch('/api/upload/r2', {
      method: 'POST',
      body: formData,
    });
    if (!uploadRes.ok) {
      const errorData = await uploadRes.json();
      throw new Error(errorData.error || 'Offer image upload failed');
    }
    const uploadData = await uploadRes.json();
    const publicUrl = uploadData.url;
    if (!publicUrl) {
      throw new Error('No public URL returned from R2 upload');
    }
    return publicUrl;
  } catch (error) {
    console.error('Error uploading offer image to R2:', error);
    return null;
  }
}

// Toggle offer active status
export async function toggleOfferStatus(offerId: string, isActive: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('offers')
      .update({ 
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('offer_id', offerId);

    if (error) {
      console.error('Error toggling offer status:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in toggleOfferStatus:', error);
    return false;
  }
}

// Subscribe to offer changes (real-time)
export const subscribeToOffers = (storeId: string, callback: (offer: Offer) => void) => {
  return supabase
    .channel(`offers:${storeId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'offers',
        filter: `store_id=eq.${storeId}`,
      },
      (payload: any) => {
        callback(payload.new as Offer);
      }
    )
    .subscribe();
}

// ============================================
// MENU ITEMS QUERIES
// ============================================

export interface MenuItem {
  id: string;
  item_id: string;
  store_id: string;
  item_name: string;
  description: string;
  category_type: string;
  food_category_item: string;
  image_url: string | null;
  actual_price: number;
  offer_percent: number;
  in_stock: boolean;
  has_customization: boolean;
  has_addons: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const fetchMenuItems = async (storeId: string) => {
  try {
    // First get the store's internal ID (bigint) from the store_id (text)
    const { data: storeData, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single();

    if (storeError || !storeData) {
      console.error('Store not found for ID:', storeId);
      return [];
    }

    // Now fetch menu items using the store's internal ID (bigint)
    const { data, error } = await supabase
      .from('merchant_menu_items')
      .select('*')
      .eq('store_id', storeData.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('Error fetching menu items:', error.message);
    return [];
  }
}

export const createMenuItem = async (itemData: any) => {
  try {
    // Validate required fields
    if (!itemData.restaurant_id || !itemData.item_name || !itemData.base_price || !itemData.selling_price) {
      throw new Error('Missing required fields for menu item.');
    }

    // Get store's internal ID (bigint) from store_id (text)
    const { data: storeData, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', itemData.restaurant_id)
      .single();

    if (storeError || !storeData) {
      throw new Error('Store not found');
    }

    // Validate category_id exists if provided
    let categoryId = itemData.category_id ?? null;
    if (categoryId) {
      const { data: catData, error: catError } = await supabase
        .from('merchant_menu_categories')
        .select('id')
        .eq('id', categoryId)
        .single();
      if (catError || !catData) {
        throw new Error('Category not found');
      }
    }

    // Check if customizations exist
    const hasCustomizations = itemData.customizations && itemData.customizations.length > 0;
    const hasAddons = hasCustomizations && itemData.customizations.some((c: any) => 
      c.addons && c.addons.length > 0
    );

    // Insert menu item
    const { data, error } = await supabase
      .from('merchant_menu_items')
      .insert([{
        store_id: storeData.id,
        category_id: categoryId,
        item_name: itemData.item_name,
        item_description: itemData.item_description || '',
        item_image_url: itemData.item_image_url || null,
        food_type: itemData.food_type || null,
        spice_level: itemData.spice_level || null,
        cuisine_type: itemData.cuisine_type || null,
        base_price: itemData.base_price,
        selling_price: itemData.selling_price,
        discount_percentage: itemData.discount_percentage ?? 0,
        tax_percentage: itemData.tax_percentage ?? 0,
        in_stock: itemData.in_stock ?? true,
        available_quantity: itemData.available_quantity ?? null,
        low_stock_threshold: itemData.low_stock_threshold ?? null,
        has_customizations: hasCustomizations,
        has_addons: hasAddons,
        has_variants: itemData.has_variants ?? false,
        is_popular: itemData.is_popular ?? false,
        is_recommended: itemData.is_recommended ?? false,
        preparation_time_minutes: itemData.preparation_time_minutes ?? 15,
        serves: itemData.serves ?? 1,
        display_order: itemData.display_order ?? 0,
        is_active: itemData.is_active ?? true,
        item_metadata: itemData.item_metadata || {},
        nutritional_info: itemData.nutritional_info || {},
        allergens: itemData.allergens || null
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '42501') {
        throw new Error('Row Level Security (RLS) policy is blocking inserts. Check your Supabase RLS policy and authentication.');
      }
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error creating menu item:', error.message || error);
    throw error;
  }
}

export const updateMenuItem = async (itemId: string, itemData: any) => {
  try {
    const updatePayload = {
      category_id: itemData.category_id ?? null,
      item_name: itemData.item_name,
      item_description: itemData.item_description || '',
      item_image_url: itemData.item_image_url || null,
      food_type: itemData.food_type || null,
      spice_level: itemData.spice_level || null,
      cuisine_type: itemData.cuisine_type || null,
      base_price: itemData.base_price,
      selling_price: itemData.selling_price,
      discount_percentage: itemData.discount_percentage ?? 0,
      tax_percentage: itemData.tax_percentage ?? 0,
      in_stock: itemData.in_stock ?? true,
      available_quantity: itemData.available_quantity ?? null,
      low_stock_threshold: itemData.low_stock_threshold ?? null,
      has_customizations: itemData.has_customizations,
      has_addons: itemData.has_addons,
      has_variants: itemData.has_variants ?? false,
      is_popular: itemData.is_popular ?? false,
      is_recommended: itemData.is_recommended ?? false,
      preparation_time_minutes: itemData.preparation_time_minutes ?? 15,
      serves: itemData.serves ?? 1,
      display_order: itemData.display_order ?? 0,
      is_active: itemData.is_active ?? true,
      item_metadata: itemData.item_metadata || {},
      nutritional_info: itemData.nutritional_info || {},
      allergens: itemData.allergens || null,
      updated_at: new Date().toISOString(),
    };
    
    const { data, error } = await supabase
      .from('merchant_menu_items')
      .update(updatePayload)
      .eq('item_id', itemId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error updating menu item:', error.message);
    throw error;
  }
}

export const updateMenuItemStock = async (itemId: string, inStock: boolean) => {
  try {
    const { data, error } = await supabase
      .from('merchant_menu_items')
      .update({ 
        in_stock: inStock,
        updated_at: new Date().toISOString()
      })
      .eq('item_id', itemId)
      .select();

    if (error) {
      console.error('Error updating stock:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      throw new Error('Item not found');
    }
    
    return data[0];
  } catch (error: any) {
    console.error('Error updating stock status:', error.message);
    throw error;
  }
}

export const deleteMenuItem = async (itemId: string) => {
  try {
    // No image_url to fetch/delete

    // Delete from database
    const { error } = await supabase
      .from('merchant_menu_items')
      .delete()
      .eq('item_id', itemId);

    if (error) {
      throw new Error(error.message || 'Failed to delete item');
    }

    return true;
  } catch (error: any) {
    console.error('Error deleting menu item:', error.message);
    throw error;
  }
}

// ============================================
// IMAGE UPLOAD STATUS
// ============================================

export const getImageUploadCount = async (storeId: string): Promise<number> => {
  try {
    // First get the store's internal ID
    const { data: storeData, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single();

    if (storeError || !storeData) {
      console.error('Store not found for ID:', storeId);
      return 0;
    }

    const { data, error } = await supabase
      .from('merchant_menu_items')
      .select('item_id')
      .eq('store_id', storeData.id);

    if (error) throw error;
    return data?.length || 0;
  } catch (error: any) {
    console.error('Error getting image count:', error.message);
    return 0;
  }
}

export const getImageUploadStatus = async (storeId: string) => {
  try {
    const count = await getImageUploadCount(storeId);
    
    const TIER_1_LIMIT = 10;
    const TIER_2_LIMIT = 7;
    const TOTAL_FREE = TIER_1_LIMIT + TIER_2_LIMIT;

    const tier1Used = Math.min(count, TIER_1_LIMIT);
    const tier1Remaining = Math.max(0, TIER_1_LIMIT - count);
    const tier2Used = Math.max(0, Math.min(count - TIER_1_LIMIT, TIER_2_LIMIT));
    const tier2Remaining = Math.max(0, TIER_2_LIMIT - tier2Used);
    const canAccessTier2 = count >= TIER_1_LIMIT;
    const isPaid = count > TOTAL_FREE;
    const paidCount = Math.max(0, count - TOTAL_FREE);

    return {
      totalUsed: count,
      tier1Used,
      tier1Remaining,
      tier1Limit: TIER_1_LIMIT,
      tier2Used,
      tier2Remaining,
      tier2Limit: TIER_2_LIMIT,
      canAccessTier2,
      totalFreeAvailable: TOTAL_FREE,
      totalFreeUsed: Math.min(count, TOTAL_FREE),
      isPaid,
      paidCount,
      pricePerImage: 2.5
    };
  } catch (error: any) {
    console.error('Error getting image upload status:', error.message);
    return null;
  }
}

// ============================================
// FOOD ORDERS QUERIES (KEEP EXISTING)
// ============================================

export const fetchFoodOrdersByRestaurant = async (
  restaurantId: string,
  status?: string,
  limit = 50
): Promise<FoodOrder[]> => {
  try {
    let query = supabase
      .from('food_orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching orders:', error.message);
      throw error
    }
    
    return (data || []) as FoodOrder[]
  } catch (error: any) {
    console.error('Error fetching food orders:', error.message);
    return []
  }
}

export const fetchFoodOrdersByRestaurantName = async (
  restaurantName: string,
  status?: string,
  limit = 50
): Promise<FoodOrder[]> => {
  try {
    let query = supabase
      .from('food_orders')
      .select('*')
      .ilike('restaurant_name', `%${restaurantName}%`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching orders by name:', error.message);
      throw error
    }
    
    return (data || []) as FoodOrder[]
  } catch (error: any) {
    console.error('Error fetching food orders by name:', error.message);
    return []
  }
}

export const fetchOrderById = async (orderId: string): Promise<FoodOrder | null> => {
  try {
    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (error) throw error
    return data as FoodOrder
  } catch (error: any) {
    console.error('Error fetching order:', error.message);
    return null
  }
}

export const fetchOrdersByStatus = async (
  restaurantId: string,
  status: string
): Promise<FoodOrder[]> => {
  try {
    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as FoodOrder[]
  } catch (error: any) {
    console.error('Error fetching orders by status:', error.message);
    return []
  }
}

export const searchOrders = async (
  restaurantId: string,
  query: string
): Promise<FoodOrder[]> => {
  try {
    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .or(`order_number.ilike.%${query}%,user_name.ilike.%${query}%,user_phone.ilike.%${query}%`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as FoodOrder[]
  } catch (error: any) {
    console.error('Error searching orders:', error.message);
    return []
  }
}

// ============================================
// ORDER MUTATIONS
// ============================================

export const updateOrderStatus = async (
  orderId: string,
  status: string
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('food_orders')
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...(status === 'confirmed' && { confirmed_at: new Date().toISOString() }),
        ...(status === 'delivered' && { delivered_at: new Date().toISOString() }),
      })
      .eq('id', orderId)

    if (error) throw error
    return true
  } catch (error: any) {
    console.error('Error updating order status:', error.message);
    return false
  }
}

export const createFoodOrder = async (order: Partial<FoodOrder>): Promise<FoodOrder | null> => {
  try {
    const { data, error } = await supabase
      .from('food_orders')
      .insert([order])
      .select()
      .single()

    if (error) throw error
    return data as FoodOrder
  } catch (error: any) {
    console.error('Error creating order:', error.message);
    return null
  }
}

export const cancelOrder = async (orderId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('food_orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) throw error
    return true
  } catch (error: any) {
    console.error('Error cancelling order:', error.message);
    return false
  }
}

// ============================================
// DASHBOARD STATISTICS
// ============================================

export const fetchOrderStats = async (restaurantId: string): Promise<OrderStats | null> => {
  try {
    const { data: orders, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('restaurant_id', restaurantId)

    if (error) throw error

    const foodOrders = (orders || []) as FoodOrder[]

    const stats: OrderStats = {
      total_orders: foodOrders.length,
      pending_orders: foodOrders.filter((o) => o.status === 'pending').length,
      confirmed_orders: foodOrders.filter((o) => o.status === 'confirmed').length,
      preparing_orders: foodOrders.filter((o) => o.status === 'preparing').length,
      ready_orders: foodOrders.filter((o) => o.status === 'ready').length,
      out_for_delivery_orders: foodOrders.filter((o) => o.status === 'out_for_delivery').length,
      delivered_orders: foodOrders.filter((o) => o.status === 'delivered').length,
      cancelled_orders: foodOrders.filter((o) => o.status === 'cancelled').length,
      total_revenue: foodOrders
        .filter((o) => o.status === 'delivered')
        .reduce((sum, o) => sum + o.total_amount, 0),
      average_order_value:
        foodOrders.length > 0
          ? foodOrders.reduce((sum, o) => sum + o.total_amount, 0) / foodOrders.length
          : 0,
      average_rating: foodOrders.filter((o) => o.rating).length > 0
        ? foodOrders.filter((o) => o.rating).reduce((sum, o) => sum + (o.rating || 0), 0) /
          foodOrders.filter((o) => o.rating).length
        : 0,
    }

    return stats
  } catch (error: any) {
    console.error('Error fetching order stats:', error.message);
    return null
  }
}

export const fetchOrderStatsByRestaurantName = async (restaurantName: string): Promise<OrderStats | null> => {
  try {
    const { data: orders, error } = await supabase
      .from('food_orders')
      .select('*')
      .ilike('restaurant_name', `%${restaurantName}%`)

    if (error) throw error

    const foodOrders = (orders || []) as FoodOrder[]

    const stats: OrderStats = {
      total_orders: foodOrders.length,
      pending_orders: foodOrders.filter((o) => o.status === 'pending').length,
      confirmed_orders: foodOrders.filter((o) => o.status === 'confirmed').length,
      preparing_orders: foodOrders.filter((o) => o.status === 'preparing').length,
      ready_orders: foodOrders.filter((o) => o.status === 'ready').length,
      out_for_delivery_orders: foodOrders.filter((o) => o.status === 'out_for_delivery').length,
      delivered_orders: foodOrders.filter((o) => o.status === 'delivered').length,
      cancelled_orders: foodOrders.filter((o) => o.status === 'cancelled').length,
      total_revenue: foodOrders
        .filter((o) => o.status === 'delivered')
        .reduce((sum, o) => sum + o.total_amount, 0),
      average_order_value:
        foodOrders.length > 0
          ? foodOrders.reduce((sum, o) => sum + o.total_amount, 0) / foodOrders.length
          : 0,
      average_rating: foodOrders.filter((o) => o.rating).length > 0
        ? foodOrders.filter((o) => o.rating).reduce((sum, o) => sum + (o.rating || 0), 0) /
          foodOrders.filter((o) => o.rating).length
        : 0,
    }

    return stats
  } catch (error: any) {
    console.error('Error fetching order stats by name:', error.message);
    return null
  }
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

export const subscribeToRestaurantOrders = (
  restaurantId: string,
  callback: (order: FoodOrder) => void
) => {
  return supabase
    .channel(`orders:${restaurantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'food_orders',
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      (payload: any) => {
        callback(payload.new as FoodOrder)
      }
    )
    .subscribe()
}

export const subscribeToRestaurantData = (
  restaurantId: string,
  callback: (restaurant: any) => void
) => {
  return supabase
    .channel(`restaurant:${restaurantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'merchant_store',
        filter: `store_id=eq.${restaurantId}`,
      },
      (payload: any) => {
        callback(payload.new)
      }
    )
    .subscribe()
}

// ============================================
// BATCH OPERATIONS
// ============================================

export const fetchOrdersInDateRange = async (
  restaurantId: string,
  startDate: Date,
  endDate: Date
): Promise<FoodOrder[]> => {
  try {
    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as FoodOrder[]
  } catch (error: any) {
    console.error('Error fetching orders in date range:', error.message);
    return []
  }
}

export const fetchPendingOrders = async (restaurantId: string): Promise<FoodOrder[]> => {
  try {
    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'confirmed', 'preparing'])
      .order('created_at', { ascending: true })

    if (error) throw error
    return data as FoodOrder[]
  } catch (error: any) {
    console.error('Error fetching pending orders:', error.message);
    return []
  }
}

// ============================================
// ALIASES FOR COMPATIBILITY
// ============================================

// Alias functions for compatibility
export const fetchRestaurantById = fetchStoreById;
export const fetchRestaurantByName = fetchStoreByName;

// Legacy function for dashboard compatibility
export const fetchManagedStores = async (fromDate?: string, toDate?: string) => {
  let query = supabase
    .from('merchant_stores')
    .select('*')
    .in('approval_status', ['APPROVED', 'REJECTED'])
    .order('created_at', { ascending: false });
  if (fromDate) query = query.gte('created_at', fromDate + 'T00:00:00');
  if (toDate) query = query.lte('created_at', toDate + 'T23:59:59');
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching managed stores:', error);
    return [];
  }
  return data || [];
};

// Fetch documents for a store
export const fetchStoreDocuments = async (storeId: number) => {
  const { data, error } = await supabase
    .from('merchant_store_documents')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching store documents:', error);
    return [];
  }
  return data || [];
};

export const fetchStoreCounts = async (fromDate?: string, toDate?: string) => {
  let query = supabase
    .from('merchant_stores')
    .select('approval_status, created_at, deleted_at', { count: 'exact', head: false });

  if (fromDate) query = query.gte('created_at', fromDate + 'T00:00:00');
  if (toDate) query = query.lte('created_at', toDate + 'T23:59:59');

  const { data, error } = await query;
  console.log('Raw store data:', data); // Debug output
  if (error) {
    console.error('Error fetching store counts:', error);
    return { total: 0, pending: 0, verified: 0, rejected: 0, suspended: 0, blocked: 0 };
  }

  let total = 0, pending = 0, verified = 0, rejected = 0, suspended = 0, blocked = 0;
  (data || []).forEach((row: any) => {
    if (!row.deleted_at) {
      total++;
      if (row.approval_status === 'APPROVED') verified++;
      else if (row.approval_status === 'REJECTED') rejected++;
      else if (row.approval_status === 'SUSPENDED') suspended++;
      else if (row.approval_status === 'BLOCKED') blocked++;
      else pending++;
    }
  });

  return { total, pending, verified, rejected, suspended, blocked };
};

// ============================================
// DIAGNOSTIC FUNCTIONS
// ============================================

export const getAllOrdersInDatabase = async (): Promise<FoodOrder[]> => {
  try {
    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .limit(100)

    if (error) throw error
    return (data || []) as FoodOrder[]
  } catch (error: any) {
    console.error('Error fetching all orders:', error.message);
    return []
  }
}

export const getOrdersForRestaurantName = async (restaurantName: string): Promise<FoodOrder[]> => {
  try {
    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .ilike('restaurant_name', `%${restaurantName}%`)
      .limit(50)

    if (error) throw error
    return (data || []) as FoodOrder[]
  } catch (error: any) {
    console.error('Error fetching orders by name:', error.message);
    return []
  }
}

// ============================================
// TYPES (for reference - ensure these exist in ./types)
// ============================================

/*
// Add these to your ./types.ts file if not already present:

export interface FoodOrder {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  order_number: string;
  user_name: string;
  user_phone: string;
  items: any[];
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_address: string;
  delivery_type: string;
  rating?: number;
  feedback?: string;
  created_at: string;
  updated_at: string;
  confirmed_at?: string;
  delivered_at?: string;
}

export interface OrderStats {
  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  preparing_orders: number;
  ready_orders: number;
  out_for_delivery_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  total_revenue: number;
  average_order_value: number;
  average_rating: number;
}

export interface MerchantStore {
  id: string;
  store_id: string;
  store_name: string;
  owner_name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  address: string;
  pincode: string;
  gst_number?: string;
  fssai_license?: string;
  cuisine_type?: string;
  store_type?: string;
  opening_time?: string;
  closing_time?: string;
  is_vegetarian?: boolean;
  delivery_radius?: number;
  avg_rating?: number;
  total_reviews?: number;
  total_orders?: number;
  is_verified?: boolean;
  is_active?: boolean;
  approval_status?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}
*/