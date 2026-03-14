import { getSupabase } from "../../lib/supabase.js";
import type {
  MerchantMenuItemRow,
  MerchantStoreRow,
  NearbyStoreRow,
  MerchantMenuCategoryRow,
  MenuItemVariantRow,
  MenuItemCustomizationRow,
  MenuItemAddonRow,
} from "./merchant.types.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SEARCH_LIMIT = 30;
/** Non-negotiable: never show stores beyond 15 km. */
const MAX_RADIUS_KM = 15;

function clampLimit(limit: number): number {
  return Math.min(MAX_LIMIT, Math.max(1, limit));
}

function validCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Nearby stores by user location (Haversine at DB). Requires migration 0050.
 * Strict: coords validated, radius capped at 15 km, veg_mode filter at DB.
 * Cache key: nearby:{lat.toFixed(4)}:{lng.toFixed(4)}:veg (invalidate on location/veg change).
 */
export async function listStoresNearby(params: {
  lat: number;
  lng: number;
  radius_km?: number;
  limit?: number;
  veg_mode?: boolean;
}): Promise<{ items: NearbyStoreRow[] }> {
  if (!validCoord(params.lat, params.lng)) {
    return { items: [] };
  }

  const supabase = getSupabase();
  const limit = clampLimit(params.limit ?? 50);
  const radius_km = Math.min(MAX_RADIUS_KM, Math.max(1, params.radius_km ?? MAX_RADIUS_KM));
  const veg_mode = Boolean(params.veg_mode);

  const { data, error } = await supabase.rpc("get_nearby_merchant_stores", {
    user_lat: params.lat,
    user_lng: params.lng,
    radius_km,
    max_limit: limit,
    veg_mode,
  });

  if (error) {
    if (error.code === "42883") {
      return { items: [] };
    }
    throw error;
  }
  return { items: (data ?? []) as NearbyStoreRow[] };
}

/**
 * List stores: with lat/lng uses nearby RPC (strict 15 km, veg filter at DB).
 * Without valid lat/lng returns empty — no frontend geo filtering; all filtering at DB/API.
 */
export async function listStores(params: {
  limit?: number;
  offset?: number;
  lat?: number;
  lng?: number;
  veg_mode?: boolean;
}): Promise<{ items: MerchantStoreRow[] | NearbyStoreRow[] }> {
  if (
    params.lat != null &&
    params.lng != null &&
    validCoord(params.lat, params.lng)
  ) {
    const { items } = await listStoresNearby({
      lat: params.lat,
      lng: params.lng,
      radius_km: MAX_RADIUS_KM,
      limit: params.limit ?? DEFAULT_LIMIT,
      veg_mode: params.veg_mode,
    });
    return { items };
  }

  return { items: [] };
}

/**
 * Get store by string store_id (public id). Includes banner fields and operational data.
 */
export async function getStoreByStoreId(storeId: string): Promise<MerchantStoreRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select("id, store_id, store_name, store_display_name, store_description, full_address, postal_code, logo_url, banner_url, gallery_images, ads_images, cuisine_types, city, latitude, longitude, operational_status, avg_preparation_time_minutes, is_active, is_available, is_accepting_orders, status, created_at, parent_id, packaging_charge_amount, delivery_charge_per_km, delivery_radius_km")
    .eq("store_id", storeId)
    .single();
  if (error || !data) return null;
  return data as MerchantStoreRow;
}

/** For order creation: fetch parent_id, address, coordinates by numeric store id. Never trust frontend for these. */
export async function getStoreByIdForOrder(
  merchantStoreId: number
): Promise<{ parentId: number | null; fullAddress: string | null; latitude: number | null; longitude: number | null } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select("parent_id, full_address, latitude, longitude")
    .eq("id", merchantStoreId)
    .single();
  if (error || !data) return null;
  const row = data as { parent_id?: number | null; full_address?: string | null; latitude?: number | string | null; longitude?: number | string | null };
  return {
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
    fullAddress: row.full_address ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
  };
}

/**
 * Single source of truth for store operational status. Used by all UIs (list, detail, cart, checkout, group order).
 * Returns OPEN only when is_active, is_available, is_accepting_orders true and operational_status = 'OPEN'.
 */
export async function getStoreLiveStatus(storeId: string): Promise<"OPEN" | "CLOSED" | null> {
  const store = await getStoreByStoreId(storeId);
  if (!store) return null;
  const { computeLiveStatus } = await import("./merchant.types.js");
  const raw = (store as { live_status?: string | null }).live_status;
  if (raw === "OPEN" || raw === "CLOSED") return raw;
  return computeLiveStatus({
    is_active: store.is_active,
    is_available: store.is_available,
    is_accepting_orders: store.is_accepting_orders,
    operational_status: store.operational_status,
  });
}

/**
 * Get menu items for a store (by string store_id).
 * Only is_active = true and in_stock = true. Groups by category_id using merchant_menu_categories.
 * If searchQ is provided, filters items by item_name ILIKE %searchQ%.
 */
export async function getMenuByStoreId(
  storeId: string,
  searchQ?: string
): Promise<{
  store: MerchantStoreRow | null;
  items: (MerchantMenuItemRow & { category_name: string | null })[];
}> {
  const supabase = getSupabase();
  const store = await getStoreByStoreId(storeId);
  if (!store) return { store: null, items: [] };

  const [categoriesRes, itemsRes] = await Promise.all([
    supabase
      .from("merchant_menu_categories")
      .select("id, category_name, display_order")
      .eq("store_id", store.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    searchQ && searchQ.trim()
      ? supabase
          .from("merchant_menu_items")
          .select("id, store_id, category_id, item_id, item_name, item_description, item_image_url, food_type, spice_level, cuisine_type, base_price, selling_price, discount_percentage, in_stock, is_active, is_popular, is_recommended, preparation_time_minutes, has_customizations, has_addons, has_variants")
          .eq("store_id", store.id)
          .eq("is_active", true)
          .eq("in_stock", true)
          .eq("approval_status", "APPROVED")
          .ilike("item_name", `%${searchQ.trim()}%`)
          .order("item_name", { ascending: true })
      : supabase
          .from("merchant_menu_items")
          .select("id, store_id, category_id, item_id, item_name, item_description, item_image_url, food_type, spice_level, cuisine_type, base_price, selling_price, discount_percentage, in_stock, is_active, is_popular, is_recommended, preparation_time_minutes, has_customizations, has_addons, has_variants")
          .eq("store_id", store.id)
          .eq("is_active", true)
          .eq("in_stock", true)
          .eq("approval_status", "APPROVED")
          .order("item_name", { ascending: true }),
  ]);

  const categories = (categoriesRes.data ?? []) as { id: number; category_name: string; display_order: number | null }[];
  const categoryMap = new Map(categories.map((c) => [c.id, c.category_name]));
  const items = (itemsRes.data ?? []) as MerchantMenuItemRow[];
  if (itemsRes.error) throw itemsRes.error;

  const itemsWithCategory = items.map((m) => ({
    ...m,
    category_name: m.category_id != null ? categoryMap.get(m.category_id) ?? null : null,
  }));

  return { store, items: itemsWithCategory };
}

export type MenuItemFullConfig = {
  item: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    isVeg: boolean;
    hasCustomizations: boolean;
    hasAddons: boolean;
    hasVariants: boolean;
  };
  variants: Array<{
    id: string;
    name: string;
    type: string | null;
    price: number;
    isDefault: boolean;
    displayOrder: number;
  }>;
  customizations: Array<{
    id: string;
    title: string;
    type: string | null;
    isRequired: boolean;
    minSelection: number;
    maxSelection: number;
    displayOrder: number;
    addons: Array<{
      id: string;
      name: string;
      price: number;
      imageUrl: string | null;
      displayOrder: number;
    }>;
  }>;
};

/**
 * Full config for one menu item: item + variants + customizations (with addons). Used by customization sheet.
 * Lazy-loaded when user taps item that has has_variants / has_addons / has_customizations.
 */
export async function getMenuItemFullConfig(
  storeId: string,
  itemId: string
): Promise<MenuItemFullConfig | null> {
  const supabase = getSupabase();
  const store = await getStoreByStoreId(storeId);
  if (!store) return null;

  const { data: itemRow, error: itemError } = await supabase
    .from("merchant_menu_items")
    .select("id, item_id, item_name, item_description, item_image_url, food_type, base_price, selling_price, has_customizations, has_addons, has_variants")
    .eq("store_id", store.id)
    .eq("item_id", itemId)
    .eq("is_active", true)
    .eq("approval_status", "APPROVED")
    .single();

  if (itemError || !itemRow) return null;
  const item = itemRow as MerchantMenuItemRow & { has_customizations?: boolean; has_addons?: boolean; has_variants?: boolean };

  const [variantsRes, customizationsRes] = await Promise.all([
    supabase
      .from("merchant_menu_item_variants")
      .select("variant_id, variant_name, variant_type, variant_price, is_default, display_order")
      .eq("menu_item_id", item.id)
      .eq("in_stock", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("merchant_menu_item_customizations")
      .select("id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order")
      .eq("menu_item_id", item.id)
      .order("display_order", { ascending: true }),
  ]);

  const variants = (variantsRes.data ?? []) as MenuItemVariantRow[];
  const customizations = (customizationsRes.data ?? []) as MenuItemCustomizationRow[];

  const addonsByCustomization = await Promise.all(
    customizations.map((c) =>
      supabase
        .from("merchant_menu_item_addons")
        .select("addon_id, addon_name, addon_price, addon_image_url, display_order")
        .eq("customization_id", c.id)
        .eq("in_stock", true)
        .order("display_order", { ascending: true })
    )
  );

  const customizationsWithAddons = customizations.map((c, i) => {
    const addons = (addonsByCustomization[i].data ?? []) as MenuItemAddonRow[];
    return {
      id: c.customization_id,
      title: c.customization_title,
      type: c.customization_type ?? null,
      isRequired: c.is_required === true,
      minSelection: c.min_selection ?? 0,
      maxSelection: c.max_selection ?? 1,
      displayOrder: c.display_order ?? 0,
      addons: addons.map((a) => ({
        id: a.addon_id,
        name: a.addon_name,
        price: parseFloat(a.addon_price ?? "0"),
        imageUrl: a.addon_image_url ?? null,
        displayOrder: a.display_order ?? 0,
      })),
    };
  });

  return {
    item: {
      id: item.item_id,
      menuItemId: item.id,
      name: item.item_name,
      description: item.item_description ?? null,
      price: parseFloat(item.selling_price),
      imageUrl: item.item_image_url ?? null,
      isVeg: (item.food_type ?? "").toLowerCase().startsWith("veg"),
      hasCustomizations: item.has_customizations === true,
      hasAddons: item.has_addons === true,
      hasVariants: item.has_variants === true,
    },
    variants: variants.map((v) => ({
      id: v.variant_id,
      name: v.variant_name,
      type: v.variant_type ?? null,
      price: parseFloat(v.variant_price),
      isDefault: v.is_default === true,
      displayOrder: v.display_order ?? 0,
    })),
    customizations: customizationsWithAddons,
  };
}

/**
 * Search menu items and stores. When lat/lng provided, uses scored nearby RPCs (15km, approval_status).
 * Otherwise uses FTS search_menu_items + store fetch (no location filter).
 */
export async function search(params: {
  q: string;
  limit?: number;
  offset?: number;
  lat?: number;
  lng?: number;
}): Promise<{
  dishes: MerchantMenuItemRow[];
  stores: MerchantStoreRow[];
}> {
  const supabase = getSupabase();
  const q = (params.q ?? "").trim();
  const limit = clampLimit(params.limit ?? SEARCH_LIMIT);
  const offset = Math.max(0, params.offset ?? 0);
  const useNearby = validCoord(params.lat ?? 0, params.lng ?? 0);

  if (!q) {
    return { dishes: [], stores: [] };
  }

  if (useNearby) {
    const lat = params.lat!;
    const lng = params.lng!;
    const [storesRes, dishesRes] = await Promise.all([
      supabase.rpc("search_stores_nearby", {
        query_text: q,
        user_lat: lat,
        user_lng: lng,
        lim: Math.min(limit, 20),
      }),
      supabase.rpc("search_dishes_nearby", {
        query_text: q,
        user_lat: lat,
        user_lng: lng,
        lim: limit,
      }),
    ]);

    const storeRows = (storesRes.data ?? []) as Array<{
      id: number;
      store_id: string;
      store_name: string;
      store_display_name: string | null;
      logo_url: string | null;
      banner_url: string | null;
      cuisine_types: string[] | null;
      distance_km: number;
      search_score: number;
    }>;
    const dishRows = (dishesRes.data ?? []) as Array<{
      item_id: string;
      item_name: string;
      item_description: string | null;
      cuisine_type: string | null;
      selling_price: string | number;
      food_type: string | null;
      store_id: number;
      store_public_id: string;
      store_name: string;
      distance_km: number;
      search_score: number;
      is_popular: boolean | null;
      is_recommended: boolean | null;
    }>;

    const stores: MerchantStoreRow[] = storeRows.map((s) => ({
      id: s.id,
      store_id: s.store_id,
      store_name: s.store_name,
      store_display_name: s.store_display_name,
      store_description: null,
      logo_url: s.logo_url,
      banner_url: s.banner_url,
      cuisine_types: s.cuisine_types,
      city: null,
      latitude: null,
      longitude: null,
      operational_status: null,
      avg_preparation_time_minutes: null,
      is_active: true,
      is_accepting_orders: true,
      status: null,
    }));

    const items: MerchantMenuItemRow[] = dishRows.map((d) => ({
      id: 0,
      store_id: d.store_id,
      category_id: null,
      item_id: d.item_id,
      item_name: d.item_name,
      item_description: d.item_description,
      item_image_url: null,
      food_type: d.food_type,
      spice_level: null,
      cuisine_type: d.cuisine_type,
      base_price: String(d.selling_price),
      selling_price: String(d.selling_price),
      discount_percentage: null,
      in_stock: true,
      is_active: true,
      is_popular: d.is_popular ?? false,
      is_recommended: d.is_recommended ?? false,
      preparation_time_minutes: null,
    }));

    return { dishes: items, stores };
  }

  let items: MerchantMenuItemRow[] = [];
  const { data: rpcData, error: rpcError } = await supabase.rpc("search_menu_items", {
    query_text: q,
    lim: limit,
    off: offset,
  });

  if (!rpcError && Array.isArray(rpcData) && rpcData.length >= 0) {
    items = rpcData as MerchantMenuItemRow[];
  } else {
    const { data: ilikeData, error: ilikeError } = await supabase
      .from("merchant_menu_items")
      .select("id, store_id, category_id, item_id, item_name, item_description, item_image_url, food_type, spice_level, cuisine_type, base_price, selling_price, discount_percentage, in_stock, is_active, is_popular, is_recommended")
      .eq("is_active", true)
      .eq("in_stock", true)
      .or(`item_name.ilike.%${q}%,item_description.ilike.%${q}%,cuisine_type.ilike.%${q}%`)
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (ilikeError) throw ilikeError;
    items = (ilikeData ?? []) as MerchantMenuItemRow[];
  }

  const storeIds = [...new Set(items.map((i) => i.store_id))];
  if (storeIds.length === 0) {
    return { dishes: items, stores: [] };
  }

  const { data: storeRows, error: storeError } = await supabase
    .from("merchant_stores")
    .select("id, store_id, store_name, store_display_name, store_description, logo_url, banner_url, cuisine_types, city, is_active, is_accepting_orders, status")
    .in("id", storeIds)
    .eq("is_active", true);

  if (storeError) throw storeError;
  const stores = (storeRows ?? []) as MerchantStoreRow[];

  return { dishes: items, stores };
}
