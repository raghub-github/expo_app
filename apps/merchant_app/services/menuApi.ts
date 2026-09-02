/**
 * Merchant menu API — categories, items, stock toggle.
 * All requests require Authorization: Bearer <token> and storeId (string store_id).
 */

import { getApiBaseUrl } from "./api";
import { authFetch } from "@/services/authFetch";
import { resolveImageUrl } from "@/services/outletApi";

export type MenuCategory = {
  id: number;
  category_name: string;
  category_description: string | null;
  category_image_url: string | null;
  parent_category_id: number | null;
  /** cuisine_master.id — must be linked via merchant_store_cuisines for this store */
  cuisine_id?: number | null;
  display_order: number;
  is_active: boolean;
  out_of_stock_manual?: boolean;
  out_of_stock_until?: string | null;
  /** Same marker as items under category when category OOS was cascaded. */
  out_of_stock_updated_at?: string | null;
  out_of_stock_active?: boolean;
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
  /** Backend-computed: considers item + category out-of-stock. */
  effective_in_stock?: boolean;
  out_of_stock_manual?: boolean;
  out_of_stock_until?: string | null;
  out_of_stock_updated_at?: string | null;
  category_out_of_stock_manual?: boolean;
  category_out_of_stock_until?: string | null;
  category_out_of_stock_updated_at?: string | null;
  is_active: boolean;
  is_deleted: boolean | null;
  display_order: number;
  has_customizations: boolean;
  has_addons: boolean;
  has_variants: boolean;
  preparation_time_minutes: number | null;
  /** Item-level packaging fee (₹); null/omitted when not set */
  packaging_charges?: number | null;
  serves: number | null;
  serves_label: string | null;
  item_size_value: number | null;
  item_size_unit: string | null;
  approval_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  primary_image_moderation_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  rejection_reason?: string | null;
  has_pending_change_request?: boolean;
  pending_change_request_type?: "CREATE" | "UPDATE" | "DELETE" | null;
  is_locked_by_plan?: boolean;
  locked_reason?: string | null;
  is_recommended?: boolean | null;
  is_popular?: boolean | null;
  image_count?: number;
};

export type ListCategoriesResponse = { categories: MenuCategory[] };
export type ListItemsResponse = { items: MenuItemRow[]; total: number };
/** Store profile for item form defaults (cuisines, prep time, packaging, delivery). */
export type StoreProfile = {
  cuisine_types: string[] | null;
  store_type: string | null;
  avg_preparation_time_minutes: number | null;
  packaging_charge_amount: number | null;
  delivery_charge_per_km: number | null;
  delivery_radius_km: number | null;
};

export async function fetchStoreProfile(
  storeId: string,
  token: string
): Promise<StoreProfile> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchants/${encodeURIComponent(storeId)}/about`,
    token
  );
  if (!res.ok) {
    if (res.status === 404) {
      return {
        cuisine_types: null,
        store_type: null,
        avg_preparation_time_minutes: null,
        packaging_charge_amount: null,
        delivery_charge_per_km: null,
        delivery_radius_km: null,
      };
    }
    throw new Error("Failed to load store profile");
  }
  const data = (await res.json()) as {
    cuisine_types?: string[] | null;
    store_type?: string | null;
    avg_preparation_time_minutes?: number | null;
    packaging_charge_amount?: number | null;
    delivery_charge_per_km?: number | null;
    delivery_radius_km?: number | null;
  };
  return {
    cuisine_types: data.cuisine_types ?? null,
    store_type: data.store_type ?? null,
    avg_preparation_time_minutes: data.avg_preparation_time_minutes ?? null,
    packaging_charge_amount: data.packaging_charge_amount ?? null,
    delivery_charge_per_km: data.delivery_charge_per_km ?? null,
    delivery_radius_km: data.delivery_radius_km ?? null,
  };
}

export type CategoryUiConfig = {
  store_type: string | null;
  cuisine_field: {
    visible: boolean;
    required_for_root: boolean;
    inherit_on_subcategory: boolean;
  };
  /** Plan allows linking more cuisines from cuisine_master (not free-text creation). */
  allow_create_custom_cuisine: boolean;
  item_form?: {
    variant: "grocery" | "standard";
    show_expiry: boolean;
    show_food_attrs: boolean;
  };
};

export type MenuCuisineOption = {
  id: number;
  name: string;
  is_system_defined: boolean;
};

export async function fetchCategoryUiConfig(
  storeId: string,
  token: string
): Promise<CategoryUiConfig | null> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/category-config`,
    token
  );
  if (!res.ok) return null;
  return (await res.json()) as CategoryUiConfig;
}

export type MenuImageUploadStatus = {
  totalUsed: number;
  maxImageUploads: number | null;
  imageUploadAllowed: boolean;
  imageLimitReached: boolean;
  imageSlotsLeft: number | null;
};

export async function fetchMenuImageUploadStatus(
  storeId: string,
  token: string
): Promise<MenuImageUploadStatus | null> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/image-upload-status`,
    token
  );
  if (!res.ok) return null;
  return (await res.json()) as MenuImageUploadStatus;
}

function normalizeMenuCuisineRows(raw: unknown): MenuCuisineOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is MenuCuisineOption =>
      x != null &&
      typeof (x as MenuCuisineOption).id === "number" &&
      typeof (x as MenuCuisineOption).name === "string"
  );
}

/** Linked store cuisines + active master rows not yet linked (for “add to store”). */
export async function fetchMenuCuisinesAndCatalog(
  storeId: string,
  token: string
): Promise<{ cuisines: MenuCuisineOption[]; catalog: MenuCuisineOption[] }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/cuisines`,
    token
  );
  if (!res.ok) return { cuisines: [], catalog: [] };
  const data = (await res.json().catch(() => ({}))) as { cuisines?: unknown; catalog?: unknown };
  return {
    cuisines: normalizeMenuCuisineRows(data.cuisines),
    catalog: normalizeMenuCuisineRows(data.catalog),
  };
}

/** Link an existing cuisine_master row to this store (POST …/cuisines/link). */
export async function linkMenuCuisineFromCatalog(
  storeId: string,
  token: string,
  cuisineId: number
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/cuisines/link`,
    token,
    { method: "POST", body: JSON.stringify({ cuisine_id: cuisineId }) }
  );
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : `Link cuisine failed: ${res.status}`
    );
  }
}

/** Unlink a cuisine from this store (DELETE …/cuisines/:cuisineId). */
/**
 * After item save: link selected cuisine names that are in the master catalog but not yet on the store profile.
 * Plan limits enforced by the backend link endpoint.
 */
export async function ensureStoreCuisinesLinkedForItemNames(
  storeId: string,
  token: string,
  cuisineTypeCsv: string | null | undefined
): Promise<{ linked: number; warnings: string[] }> {
  const names = (cuisineTypeCsv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) return { linked: 0, warnings: [] };

  const { cuisines, catalog } = await fetchMenuCuisinesAndCatalog(storeId, token);
  const linkedLower = new Set(cuisines.map((c) => c.name.toLowerCase().trim()));
  const catalogByLower = new Map(catalog.map((c) => [c.name.toLowerCase().trim(), c]));

  let linked = 0;
  const warnings: string[] = [];

  for (const name of names) {
    const key = name.toLowerCase().trim();
    if (!key) continue;
    if (linkedLower.has(key)) continue;

    const cat = catalogByLower.get(key);
    if (cat) {
      try {
        await linkMenuCuisineFromCatalog(storeId, token, cat.id);
        linked++;
        linkedLower.add(key);
        catalogByLower.delete(key);
      } catch (e) {
        warnings.push(e instanceof Error ? e.message : String(e));
      }
    } else {
      warnings.push(
        `"${name}" could not be linked — it may already be on your store or not in the master cuisine list.`
      );
    }
  }

  return { linked, warnings };
}

export async function unlinkMenuCuisine(
  storeId: string,
  token: string,
  cuisineId: number
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/cuisines/${cuisineId}`,
    token,
    { method: "DELETE" }
  );
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : `Unlink cuisine failed: ${res.status}`
    );
  }
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
  const data = (await readJsonResponseSafe(res)) as ListCategoriesResponse;
  return {
    categories: (data.categories ?? []).map(normalizeMenuCategoryRow),
  };
}

/** Type-ahead: distinct category names from other stores (excludes names already on this store). */
export async function fetchCategoryNameSuggestions(
  storeId: string,
  token: string,
  opts: { q: string; limit?: number; editingCategoryId?: number | null }
): Promise<string[]> {
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  params.set("q", (opts.q ?? "").trim().slice(0, 30));
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.editingCategoryId != null) {
    params.set("editingCategoryId", String(opts.editingCategoryId));
  }
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/category-name-suggestions?${params.toString()}`,
    token
  );
  if (!res.ok) {
    return [];
  }
  const data = (await res.json().catch(() => ({}))) as { suggestions?: unknown };
  return Array.isArray(data.suggestions)
    ? data.suggestions.filter((x): x is string => typeof x === "string")
    : [];
}

/** Subcategory names from other stores (excludes names already under this parent on this store). */
export async function fetchSubcategoryNameSuggestions(
  storeId: string,
  token: string,
  opts: {
    q: string;
    limit?: number;
    parentCategoryId: number;
    editingCategoryId?: number | null;
  }
): Promise<string[]> {
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  params.set("q", (opts.q ?? "").trim().slice(0, 30));
  params.set("parentCategoryId", String(opts.parentCategoryId));
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.editingCategoryId != null) {
    params.set("editingCategoryId", String(opts.editingCategoryId));
  }
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/subcategory-name-suggestions?${params.toString()}`,
    token
  );
  if (!res.ok) {
    return [];
  }
  const data = (await res.json().catch(() => ({}))) as { suggestions?: unknown };
  return Array.isArray(data.suggestions)
    ? data.suggestions.filter((x): x is string => typeof x === "string")
    : [];
}

export async function createCategory(
  storeId: string,
  token: string,
  body: {
    category_name: string;
    category_description?: string | null;
    category_image_url?: string | null;
    parent_category_id?: number | null;
    cuisine_id?: number | null;
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
    cuisine_id?: number | null;
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
    const err = await res.json().catch(() => ({})) as {
      error?: string;
      itemCount?: number;
      subcategoryCount?: number;
      message?: string;
    };
    if (err.error === "category_has_items") {
      const n = err.itemCount ?? 0;
      throw new Error(`This category has ${n} item${n !== 1 ? "s" : ""}. Move or delete them first, then delete the category.`);
    }
    if (err.error === "category_has_subcategories") {
      const n = err.subcategoryCount ?? 0;
      throw new Error(
        `This category has ${n} subcategor${n !== 1 ? "ies" : "y"}. Remove or reassign them first.`
      );
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
    changeRequestType?: "DELETE" | "UPDATE" | null;
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
  if (opts.changeRequestType) params.set("changeRequestType", opts.changeRequestType);
  const qs = params.toString();
  const url = `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/items${qs ? `?${qs}` : ""}`;
  const res = await authFetch(url, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Items failed: ${res.status}`);
  }
  const data = (await readJsonResponseSafe(res)) as ListItemsResponse;
  return {
    items: (data.items ?? []).map(normalizeMenuItemRow),
    total: data.total ?? (data.items?.length ?? 0),
  };
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

export async function patchItemFlags(
  storeId: string,
  itemId: number,
  token: string,
  body: { is_recommended?: boolean; is_popular?: boolean }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/flags?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PATCH", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Item flags update failed: ${res.status}`);
  }
}

export async function deleteMenuItemImage(
  storeId: string,
  imageId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/images/${imageId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Delete image failed: ${res.status}`);
  }
}

export type OutOfStockMode = "CLEAR" | "MANUAL" | "HOURS" | "NEXT_OPEN" | "CUSTOM";

/**
 * Build a JSON string safe for React Native fetch (never pass raw Date/objects as body).
 */
function serializeMerchantMenuOutOfStockBody(body: {
  mode: OutOfStockMode;
  hours?: number;
  until?: unknown;
}): string {
  const out: Record<string, string | number> = { mode: body.mode };
  if (body.mode === "HOURS" && body.hours != null) {
    const h = Math.floor(Number(body.hours));
    if (Number.isFinite(h)) out.hours = h;
  }
  if (body.mode === "CUSTOM") {
    const raw = body.until;
    if (raw != null) {
      if (typeof raw === "string") out.until = raw;
      else if (Object.prototype.toString.call(raw) === "[object Date]") out.until = new Date(raw as Date).toISOString();
      else out.until = String(raw);
    }
  }
  return JSON.stringify(out);
}

async function readJsonResponseSafe(res: Response): Promise<any> {
  try {
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return {};
    const raw = new TextDecoder("utf-8").decode(buf);
    const t = raw.trim();
    if (!t) return {};
    return JSON.parse(t) as any;
  } catch {
    return {};
  }
}

function toIsoTimestamptzOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const raw = String(value).trim();
  if (!raw) return null;
  let normalized = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;
  normalized = normalized.replace(/([+\-]\d{2})$/, "$1:00");
  normalized = normalized.replace(/([+\-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function normalizeMenuCategoryRow(category: MenuCategory): MenuCategory {
  return {
    ...category,
    out_of_stock_until: toIsoTimestamptzOrNull(category.out_of_stock_until),
    out_of_stock_updated_at: toIsoTimestamptzOrNull(category.out_of_stock_updated_at),
  };
}

function normalizeMenuItemRow(item: MenuItemRow): MenuItemRow {
  const rawImage = item.item_image_url?.trim() || null;
  return {
    ...item,
    // Absolute / device-ready URL so catalog cards paint without a second resolve pass.
    item_image_url: rawImage ? resolveImageUrl(rawImage) ?? rawImage : null,
    out_of_stock_until: toIsoTimestamptzOrNull(item.out_of_stock_until),
    out_of_stock_updated_at: toIsoTimestamptzOrNull(item.out_of_stock_updated_at),
    category_out_of_stock_until: toIsoTimestamptzOrNull(item.category_out_of_stock_until),
    category_out_of_stock_updated_at: toIsoTimestamptzOrNull(item.category_out_of_stock_updated_at),
  };
}

export async function patchItemOutOfStock(
  storeId: string,
  itemId: number | string,
  token: string,
  body: { mode: OutOfStockMode; hours?: number; until?: string | Date }
): Promise<{ ok: boolean; out_of_stock_manual: boolean; out_of_stock_until: string | null }> {
  const base = getApiBaseUrl();
  const bodyJson = serializeMerchantMenuOutOfStockBody(body);
  const storeIdStr = String(storeId);
  const tokenStr = String(token);
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${encodeURIComponent(String(itemId))}/out-of-stock?storeId=${encodeURIComponent(storeIdStr)}`,
    tokenStr,
    { method: "PATCH", body: bodyJson }
  );
  const json = await readJsonResponseSafe(res);
  if (!res.ok) {
    throw new Error((json as { error?: string; message?: string }).error || (json as any).message || `Out-of-stock update failed: ${res.status}`);
  }
  return json as any;
}

export async function patchCategoryOutOfStock(
  storeId: string,
  categoryId: number,
  token: string,
  body: { mode: OutOfStockMode; hours?: number; until?: string | Date }
): Promise<{ ok: boolean; out_of_stock_manual: boolean; out_of_stock_until: string | null }> {
  const base = getApiBaseUrl();
  const bodyJson = serializeMerchantMenuOutOfStockBody(body);
  const storeIdStr = String(storeId);
  const tokenStr = String(token);
  const res = await authFetch(
    `${base}/v1/merchant-menu/categories/${categoryId}/out-of-stock?storeId=${encodeURIComponent(storeIdStr)}`,
    tokenStr,
    { method: "PATCH", body: bodyJson }
  );
  const json = await readJsonResponseSafe(res);
  if (!res.ok) {
    throw new Error((json as { error?: string; message?: string }).error || (json as any).message || `Out-of-stock update failed: ${res.status}`);
  }
  return json as any;
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
  images: Array<{
    id: number;
    image_url: string;
    is_primary: boolean;
    display_order: number;
    moderation_status?: string | null;
    rejection_reason?: string | null;
    moderated_at?: string | null;
    created_at?: string | null;
  }>;
  linked_modifier_groups?: Array<{
    id: number;
    modifier_group_id: number;
    display_order: number;
    title: string;
    description: string | null;
    is_required: boolean;
    min_selection: number;
    max_selection: number;
    options: Array<{ id: number; option_id: string; name: string; price_delta: string; in_stock: boolean; display_order: number }>;
  }>;
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
  const data = (await res.json()) as MenuItemDetail;
  return {
    ...data,
    images: (data.images ?? []).map((img) => ({
      ...img,
      image_url: resolveImageUrl(img.image_url) ?? img.image_url,
    })),
  };
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
  packaging_charges?: number | null;
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
  available_quantity?: number | null;
  low_stock_threshold?: number | null;
  /** YYYY-MM-DD — grocery product expiry */
  expiry_date?: string | null;
  in_stock?: boolean;
};

export async function createMenuItem(
  storeId: string,
  token: string,
  body: MenuItemPayload
): Promise<{
  id: number | null;
  item_id: string | null;
  pending_review?: boolean;
  review_request_id?: number;
}> {
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
  return res.json() as Promise<{
    id: number | null;
    item_id: string | null;
    pending_review?: boolean;
    review_request_id?: number;
  }>;
}

/** Attach image to a pending ADD review request (R2 upload; no live menu row). */
export async function uploadReviewRequestImage(
  storeId: string,
  reviewRequestId: number,
  token: string,
  file: { uri: string; type?: string; name?: string }
): Promise<{ image_url: string; r2_key: string; review_request_id: number }> {
  const base = getApiBaseUrl();
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    type: file.type ?? "image/jpeg",
    name: file.name ?? "image.jpg",
  } as any);
  const res = await fetch(
    `${base}/v1/merchant-menu/change-requests/${reviewRequestId}/images?storeId=${encodeURIComponent(storeId)}`,
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
  return res.json() as Promise<{ image_url: string; r2_key: string; review_request_id: number }>;
}

/** List menu review / change requests for a store (merchant or agent). */
export async function fetchChangeRequests(
  storeId: string,
  token: string,
  opts?: { status?: string; request_type?: string; limit?: number }
): Promise<{ change_requests: Array<Record<string, unknown>>; total: number }> {
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  params.set("storeId", storeId);
  if (opts?.status) params.set("status", opts.status);
  if (opts?.request_type) params.set("request_type", opts.request_type);
  params.set("limit", String(opts?.limit ?? 50));
  const res = await authFetch(`${base}/v1/merchant-menu/change-requests?${params.toString()}`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Fetch change requests failed: ${res.status}`);
  }
  return res.json() as Promise<{ change_requests: Array<Record<string, unknown>>; total: number }>;
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

export async function deleteMenuItem(
  storeId: string,
  itemId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (err.error === "item_approved_use_change_request") {
      throw new Error("This item is approved. Use Request delete from the menu for agent review.");
    }
    throw new Error(err.message || `Delete item failed: ${res.status}`);
  }
}

/** Create an update request for an approved item (agent will review). */
export async function createUpdateRequest(
  storeId: string,
  itemId: number,
  token: string,
  body: { requested_payload: Record<string, unknown>; reason?: string | null }
): Promise<{ id: number }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/change-requests?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Update request failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number }>;
}

/** Create a delete request for an approved item (agent will review). */
export async function createDeleteRequest(
  storeId: string,
  itemId: number,
  token: string,
  body?: { reason?: string | null }
): Promise<{ id: number }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/delete-requests?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body ?? {}) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Delete request failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number }>;
}

// --- Variants ---
export async function addVariant(
  storeId: string,
  itemId: number,
  token: string,
  body: { variant_name: string; variant_type?: string | null; variant_price: number; is_default?: boolean; display_order?: number; in_stock?: boolean }
): Promise<{ id: number; variant_id: string }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/variants?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Add variant failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; variant_id: string }>;
}

export async function updateVariant(
  storeId: string,
  variantId: number,
  token: string,
  body: { variant_name?: string; variant_type?: string | null; variant_price?: number; is_default?: boolean; display_order?: number; in_stock?: boolean }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/variants/${variantId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PUT", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Update variant failed: ${res.status}`);
  }
}

export async function deleteVariant(
  storeId: string,
  variantId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/variants/${variantId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Delete variant failed: ${res.status}`);
  }
}

// --- Customization groups + options (add-ons) ---
export async function addCustomizationGroup(
  storeId: string,
  itemId: number,
  token: string,
  body: { customization_title: string; is_required?: boolean; min_selection?: number; max_selection?: number; display_order?: number }
): Promise<{ id: number; customization_id: string }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/customization-groups?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Add customization group failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; customization_id: string }>;
}

export async function updateCustomizationGroup(
  storeId: string,
  groupId: number,
  token: string,
  body: { customization_title?: string; is_required?: boolean; min_selection?: number; max_selection?: number; display_order?: number }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/customization-groups/${groupId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PUT", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Update customization group failed: ${res.status}`);
  }
}

export async function deleteCustomizationGroup(
  storeId: string,
  groupId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/customization-groups/${groupId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Delete customization group failed: ${res.status}`);
  }
}

export async function addCustomizationOption(
  storeId: string,
  groupId: number,
  token: string,
  body: { addon_name: string; addon_price?: number; addon_image_url?: string | null; display_order?: number }
): Promise<{ id: number; addon_id: string }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/customization-groups/${groupId}/options?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Add add-on failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; addon_id: string }>;
}

export async function updateCustomizationOption(
  storeId: string,
  optionId: number,
  token: string,
  body: { addon_name?: string; addon_price?: number; addon_image_url?: string | null; display_order?: number; in_stock?: boolean }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/customization-options/${optionId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PUT", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Update add-on failed: ${res.status}`);
  }
}

export async function deleteCustomizationOption(
  storeId: string,
  optionId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/customization-options/${optionId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Delete add-on failed: ${res.status}`);
  }
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
  out_of_stock_manual?: boolean;
  out_of_stock_until?: string | null;
  out_of_stock_active?: boolean;
  effective_in_stock?: boolean;
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

export async function patchComboOutOfStock(
  storeId: string,
  comboId: number,
  token: string,
  body: { mode: OutOfStockMode; hours?: number; until?: string | Date }
): Promise<{ ok: boolean; out_of_stock_manual: boolean; out_of_stock_until: string | null }> {
  const base = getApiBaseUrl();
  const bodyJson = serializeMerchantMenuOutOfStockBody(body);
  const storeIdStr = String(storeId);
  const tokenStr = String(token);
  const res = await authFetch(
    `${base}/v1/merchant-menu/combos/${comboId}/out-of-stock?storeId=${encodeURIComponent(storeIdStr)}`,
    tokenStr,
    { method: "PATCH", body: bodyJson }
  );
  const json = await readJsonResponseSafe(res);
  if (!res.ok) {
    throw new Error((json as { error?: string; message?: string }).error || (json as any).message || `Out-of-stock update failed: ${res.status}`);
  }
  return json as any;
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
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (err.error === "item_approved_use_change_request") {
      throw new Error("This item is approved. Submit changes from the edit screen to send an update request for agent review.");
    }
    throw new Error(err.message || `Update item failed: ${res.status}`);
  }
}

// --- Reusable modifier groups (Addon Library) ---
export type ModifierGroupRow = {
  id: number;
  group_id: string;
  title: string;
  description: string | null;
  is_required: boolean;
  min_selection: number;
  max_selection: number;
  display_order: number;
  options_count: number;
  used_in_items_count: number;
};

export type ModifierOptionRow = {
  id: number;
  option_id: string;
  name: string;
  price_delta: string;
  image_url: string | null;
  in_stock: boolean;
  default_quantity: number;
  display_order: number;
};

export type LinkedModifierGroup = {
  id: number;
  modifier_group_id: number;
  display_order: number;
  group: {
    id: number;
    group_id: string;
    title: string;
    description: string | null;
    is_required: boolean;
    min_selection: number;
    max_selection: number;
    options: Array<{ id: number; option_id: string; name: string; price_delta: string; in_stock: boolean; display_order: number }>;
  };
};

export async function fetchModifierGroups(
  storeId: string,
  token: string
): Promise<{ modifierGroups: ModifierGroupRow[] }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/modifier-groups`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Failed to load addon groups: ${res.status}`);
  }
  const data = (await res.json()) as { modifierGroups?: ModifierGroupRow[] };
  return { modifierGroups: data.modifierGroups ?? [] };
}

export async function createModifierGroup(
  storeId: string,
  token: string,
  body: { title: string; description?: string | null; is_required?: boolean; min_selection?: number; max_selection?: number; display_order?: number }
): Promise<{ id: number; group_id: string }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/${encodeURIComponent(storeId)}/modifier-groups`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (err.error?.startsWith("LIMIT_")) throw new Error(err.error);
    throw new Error(err.message || `Create addon group failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; group_id: string }>;
}

export async function updateModifierGroup(
  storeId: string,
  groupId: number,
  token: string,
  body: { title?: string; description?: string | null; is_required?: boolean; min_selection?: number; max_selection?: number; display_order?: number }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/modifier-groups/${groupId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PUT", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Addon group not found");
    throw new Error(`Update failed: ${res.status}`);
  }
}

export async function deleteModifierGroup(storeId: string, groupId: number, token: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/modifier-groups/${groupId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Addon group not found");
    throw new Error(`Delete failed: ${res.status}`);
  }
}

export async function fetchModifierOptions(
  storeId: string,
  groupId: number,
  token: string
): Promise<{ options: ModifierOptionRow[] }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/modifier-groups/${groupId}/options?storeId=${encodeURIComponent(storeId)}`,
    token
  );
  if (!res.ok) throw new Error(`Failed to load options: ${res.status}`);
  const data = (await res.json()) as { options?: ModifierOptionRow[] };
  return { options: data.options ?? [] };
}

export async function addModifierOption(
  storeId: string,
  groupId: number,
  token: string,
  body: { name: string; price_delta?: number; image_url?: string | null; in_stock?: boolean; default_quantity?: number; display_order?: number }
): Promise<{ id: number; option_id: string }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/modifier-groups/${groupId}/options?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    if (err.error?.startsWith("LIMIT_")) throw new Error(err.error);
    if (res.status === 404) throw new Error("Addon group not found");
    throw new Error(`Add option failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; option_id: string }>;
}

export async function updateModifierOption(
  storeId: string,
  optionId: number,
  token: string,
  body: { name?: string; price_delta?: number; image_url?: string | null; in_stock?: boolean; default_quantity?: number; display_order?: number }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/modifier-options/${optionId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "PUT", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Option not found");
    throw new Error(`Update failed: ${res.status}`);
  }
}

export async function deleteModifierOption(storeId: string, optionId: number, token: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/modifier-options/${optionId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Option not found");
    throw new Error(`Delete failed: ${res.status}`);
  }
}

export async function fetchItemModifierGroups(
  storeId: string,
  itemId: number,
  token: string
): Promise<{ linkedModifierGroups: LinkedModifierGroup[] }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/modifier-groups?storeId=${encodeURIComponent(storeId)}`,
    token
  );
  if (!res.ok) throw new Error(`Failed to load linked addons: ${res.status}`);
  const data = (await res.json()) as { linkedModifierGroups?: LinkedModifierGroup[] };
  return { linkedModifierGroups: data.linkedModifierGroups ?? [] };
}

export async function linkModifierGroupToItem(
  storeId: string,
  itemId: number,
  token: string,
  body: { modifier_group_id: number; display_order?: number }
): Promise<{ id: number }> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/modifier-groups?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    if (res.status === 409) throw new Error("This addon group is already linked to this item.");
    if (err.error?.startsWith("LIMIT_")) throw new Error(err.error);
    if (res.status === 404) throw new Error("Addon group or item not found");
    throw new Error(`Link failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: number }>;
}

export async function unlinkModifierGroupFromItem(
  storeId: string,
  itemId: number,
  linkId: number,
  token: string
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await authFetch(
    `${base}/v1/merchant-menu/items/${itemId}/modifier-groups/${linkId}?storeId=${encodeURIComponent(storeId)}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Link not found");
    throw new Error(`Unlink failed: ${res.status}`);
  }
}
