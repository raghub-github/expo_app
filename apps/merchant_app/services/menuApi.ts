/**
 * Merchant menu API — categories, items, stock toggle.
 * All requests require Authorization: Bearer <token> and storeId (string store_id).
 */

import { getApiBaseUrl } from "./api";
import { authFetch } from "@/services/authFetch";

export type MenuCategory = {
  id: number;
  category_name: string;
  category_description: string | null;
  category_image_url: string | null;
  parent_category_id: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MenuItemRow = {
  id: number;
  item_id: string;
  item_name: string;
  item_description: string | null;
  item_image_url: string | null;
  category_id: number | null;
  food_type: string | null;
  base_price: string;
  selling_price: string;
  in_stock: boolean;
  is_active: boolean;
  is_deleted: boolean | null;
  display_order: number;
  has_customizations: boolean;
  has_addons: boolean;
  has_variants: boolean;
  preparation_time_minutes: number | null;
  approval_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
};

export type ListCategoriesResponse = { categories: MenuCategory[] };
export type ListItemsResponse = { items: MenuItemRow[]; total: number };

/** Store profile (e.g. cuisines chosen during onboarding). Used for item cuisine picker. */
export async function fetchStoreProfile(
  storeId: string,
  token: string
): Promise<{ cuisine_types: string[] | null }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchants/${encodeURIComponent(storeId)}/about`,
    token
  );
  if (!res.ok) {
    if (res.status === 404) return { cuisine_types: null };
    throw new Error("Failed to load store profile");
  }
  const data = (await res.json()) as { cuisine_types?: string[] | null };
  return { cuisine_types: data.cuisine_types ?? null };
}

export async function fetchMenuCategories(
  storeId: string,
  token: string
): Promise<ListCategoriesResponse> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/categories`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Categories failed: ${res.status}`);
  }
  return res.json() as Promise<ListCategoriesResponse>;
}

export async function createCategory(
  storeId: string,
  token: string,
  body: {
    category_name: string;
    category_description?: string | null;
    category_image_url?: string | null;
    parent_category_id?: number | null;
    display_order?: number;
    is_active?: boolean;
  }
): Promise<{ id: number }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/categories`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Create category failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number }>;
}

export async function updateCategory(
  storeId: string,
  categoryId: number,
  token: string,
  body: {
    category_name?: string;
    category_description?: string | null;
    category_image_url?: string | null;
    parent_category_id?: number | null;
    display_order?: number;
    is_active?: boolean;
  }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/categories/${categoryId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PUT", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Update category failed: ${res.status}`);
  }
}

export async function deleteCategory(
  storeId: string,
  categoryId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/categories/${categoryId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; itemCount?: number; message?: string };
    if (err.error === "category_has_items") {
      const n = err.itemCount ?? 0;
      throw new Error(`This category has ${n} item${n !== 1 ? "s" : ""}. Move or delete them first, then delete the category.`);
    }
    throw new Error(err.message || `Delete category failed: ${res.status}`);
  }
}

export type AvailabilityWindow = {
  id: number;
  category_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

/** Availability window counts per category id (for "Hours set" badges). Keys are category id as string. */
export async function fetchCategoryAvailabilitySummary(
  storeId: string,
  token: string
): Promise<Record<string, number>> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/category-availability-summary`,
    token
  );
  if (!res.ok) return {};
  const data = (await res.json()) as { counts?: Record<string, number> };
  return data.counts ?? {};
}

export async function fetchCategoryAvailability(
  storeId: string,
  categoryId: number,
  token: string
): Promise<{ windows: AvailabilityWindow[] }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/categories/${categoryId}/availability?storeId=${encodeURIComponent(storeId)}`,
    token
  );
  if (!res.ok) throw new Error("Failed to load availability");
  return res.json() as Promise<{ windows: AvailabilityWindow[] }>;
}

export async function addCategoryAvailability(
  storeId: string,
  categoryId: number,
  token: string,
  body: { day_of_week: number; start_time: string; end_time: string }
): Promise<{ id: number }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/categories/${categoryId}/availability?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error("Failed to add availability");
  return res.json() as Promise<{ id: number }>;
}

export async function deleteCategoryAvailability(
  storeId: string,
  windowId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/categories/availability/${windowId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Failed to delete availability");
}

export async function fetchMenuItems(
  storeId: string,
  token: string,
  opts: {
    categoryId?: number | null;
    search?: string;
    limit?: number;
    offset?: number;
    approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
    inStock?: boolean | null;
  } = {}
): Promise<ListItemsResponse> {
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  if (opts.categoryId != null) params.set("categoryId", String(opts.categoryId));
  if (opts.search) params.set("search", opts.search);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  if (opts.approvalStatus != null && opts.approvalStatus !== undefined) params.set("approvalStatus", opts.approvalStatus);
  if (opts.inStock !== undefined && opts.inStock !== null) params.set("inStock", String(opts.inStock));
  const qs = params.toString();
  const url = `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/items${qs ? `?${qs}` : ""}`;
  const res = await authFetch(url, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Items failed: ${res.status}`);
  }
  return res.json() as Promise<ListItemsResponse>;
}

export async function patchItemStock(
  storeId: string,
  itemId: number,
  token: string,
  body: { in_stock?: boolean; available_quantity?: number | null }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/stock?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PATCH", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Stock update failed: ${res.status}`);
  }
}

export type MenuItemDetail = MenuItemRow & {
  short_name: string | null;
  spice_level: string | null;
  cuisine_type: string | null;
  serves: number | null;
  serves_label: string | null;
  allergens: string[] | null;
  nutritional_info: object | null;
  item_size_value: number | null;
  item_size_unit: string | null;
  available_for_delivery: boolean;
  weight_per_serving: number | null;
  weight_per_serving_unit: string | null;
  calories_kcal: number | null;
  protein: number | null;
  protein_unit: string | null;
  carbohydrates: number | null;
  carbohydrates_unit: string | null;
  fat: number | null;
  fat_unit: string | null;
  fibre: number | null;
  fibre_unit: string | null;
  item_tags: string[] | null;
  variants: Array<{
    id: number;
    variant_id: string;
    variant_name: string;
    variant_type: string | null;
    variant_price: string;
    is_default: boolean;
    display_order: number;
    in_stock: boolean;
  }>;
  customizations: Array<{
    id: number;
    customization_id: string;
    customization_title: string;
    is_required: boolean;
    min_selection: number;
    max_selection: number;
    display_order: number;
    options: Array<{
      id: number;
      addon_id: string;
      addon_name: string;
      addon_price: string;
      display_order: number;
      in_stock: boolean;
    }>;
  }>;
  images: Array<{ id: number; image_url: string; is_primary: boolean; display_order: number }>;
};

export async function fetchMenuItem(
  storeId: string,
  itemId: number,
  token: string
): Promise<MenuItemDetail | null> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}?storeId=${encodeURIComponent(storeId)}`,
    token
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Item fetch failed: ${res.status}`);
  }
  return res.json() as Promise<MenuItemDetail>;
}

export type MenuItemPayload = {
  item_name: string;
  item_description?: string | null;
  category_id?: number | null;
  food_type?: string | null;
  spice_level?: string | null;
  cuisine_type?: string | null;
  base_price: number;
  selling_price: number;
  preparation_time_minutes?: number | null;
  serves?: number | null;
  serves_label?: string | null;
  short_name?: string | null;
  display_order?: number;
  item_size_value?: number | null;
  item_size_unit?: string | null;
  available_for_delivery?: boolean;
  weight_per_serving?: number | null;
  weight_per_serving_unit?: string | null;
  calories_kcal?: number | null;
  protein?: number | null;
  protein_unit?: string | null;
  carbohydrates?: number | null;
  carbohydrates_unit?: string | null;
  fat?: number | null;
  fat_unit?: string | null;
  fibre?: number | null;
  fibre_unit?: string | null;
  allergens?: string[] | null;
  item_tags?: string[] | null;
};

export async function createMenuItem(
  storeId: string,
  token: string,
  body: MenuItemPayload
): Promise<{ id: number; item_id: string }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/items`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Create item failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; item_id: string }>;
}

/** Upload item image (multipart). Returns { id, image_url, r2_key }. */
export async function uploadItemImage(
  storeId: string,
  itemId: number,
  token: string,
  file: { uri: string; type?: string; name?: string }
): Promise<{ id: number; image_url: string; r2_key: string }> {
  const base = getApiBaseUrl();
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    type: file.type ?? "image/jpeg",
    name: file.name ?? "image.jpg",
  } as any);
  const res = await fetch(
    `${base}/v1/merchant-menu/items/${itemId}/images?storeId=${encodeURIComponent(storeId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Upload failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; image_url: string; r2_key: string }>;
}

export type ComboRow = {
  id: number;
  combo_name: string;
  description: string | null;
  combo_price: string;
  image_url: string | null;
  is_active: boolean;
  is_deleted: boolean;
  display_order: number;
};

export type ComboDetail = ComboRow & {
  components: Array<{
    id: number;
    menu_item_id: number;
    variant_id: number | null;
    quantity: number;
    display_order: number;
  }>;
};

export async function fetchCombos(storeId: string, token: string): Promise<{ combos: ComboRow[] }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/combos`,
    token
  );
  if (!res.ok) throw new Error("Failed to load combos");
  return res.json() as Promise<{ combos: ComboRow[] }>;
}

export async function fetchCombo(storeId: string, comboId: number, token: string): Promise<ComboDetail | null> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/combos/${comboId}?storeId=${encodeURIComponent(storeId)}`,
    token
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load combo");
  return res.json() as Promise<ComboDetail>;
}

export async function createCombo(
  storeId: string,
  token: string,
  body: { combo_name: string; description?: string | null; combo_price: number; image_url?: string | null; display_order?: number }
): Promise<{ id: number }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/combos`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error("Failed to create combo");
  return res.json() as Promise<{ id: number }>;
}

export async function updateCombo(
  storeId: string,
  comboId: number,
  token: string,
  body: { combo_name?: string; description?: string | null; combo_price?: number; image_url?: string | null; is_active?: boolean; display_order?: number }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/combos/${comboId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PUT", body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error("Failed to update combo");
}

export async function deleteCombo(storeId: string, comboId: number, token: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/combos/${comboId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Failed to delete combo");
}

export async function addComboComponent(
  storeId: string,
  comboId: number,
  token: string,
  body: { menu_item_id: number; variant_id?: number | null; quantity?: number; display_order?: number }
): Promise<{ id: number }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/combos/${comboId}/components?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error("Failed to add component");
  return res.json() as Promise<{ id: number }>;
}

export async function deleteComboComponent(
  storeId: string,
  componentId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/combos/components/${componentId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Failed to remove component");
}

export async function updateMenuItem(
  storeId: string,
  itemId: number,
  token: string,
  body: Partial<MenuItemPayload> & { is_active?: boolean }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PUT", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Update item failed: ${res.status}`);
  }
}
