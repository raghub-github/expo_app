"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { getQueryClient } from "@/lib/react-query";
import { useStoreMenuQuery } from "@/hooks/queries/useMerchantStoreQueries";
import { queryKeys } from "@/lib/queryKeys";
import { useAppPathname, useAppParams, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { useStoreContext } from "../StoreContext";
import {
  merchantStoreHref,
  resolveEffectiveStoreId,
  storeIdFromPathname,
  storePageSuffix,
  writeLastMerchantStoreId,
} from "@/lib/merchants/effective-store-id";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Upload,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  LayoutGrid,
  ListTree,
  SlidersHorizontal,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { R2Image } from "@/components/ui/R2Image";
import { withAttachmentCacheBust, resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { MenuItemsGridSkeleton } from "@/components/ui/MenuItemsGridSkeleton";
import { MenuItemForm, type ItemFormData } from "./MenuItemForm";
import { buildEditOptionsRefs } from "@/lib/map-menu-item-options";
import {
  DEFAULT_ITEM_FORM_DATA,
  mapMenuItemToEditForm,
} from "@/lib/map-menu-item-edit-form";
import {
  customizationGroupIds,
  dedupeCustomizationGroups,
  dedupeVariants,
  toFiniteMenuId,
} from "@/lib/menu-customization-normalize";
import { normalizeVariantSizeValue } from "@/lib/menu-variant-size";
import { setMenuItemFormModalOpen } from "@/lib/merchant-menu-form-modal-bus";
import {
  ITEM_PLACEHOLDER_SVG,
  normalizeFoodTypeForForm,
  normalizeSpiceLevelForForm,
  getFoodTypeLabel,
  itemHasCustomizationContent,
  type MenuItem,
  type MenuCategory,
  type Customization,
  type Variant,
} from "./menu-types";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import Link from "next/link";
import { normalizeMenuItemImageFile, validateMenuItemImageFile } from "@/lib/menuItemImageValidationClient";
import { ensureStoreCuisinesLinkedForItemNames } from "@/lib/merchant/ensureStoreCuisinesForItem";
import { dispatchMenuReviewQueueRefresh } from "@/lib/merchant/menu-review-queue";
import { MenuItemPhotoCustomerPreview } from "@/components/merchant/MenuItemPhotoCustomerPreview";
import type { MenuMediaFile } from "@/lib/merchant-menu-media";
import {
  MENU_PAGE_GLOBAL_STYLES,
  menuCategoryChipActive,
  menuCategoryChipIdle,
  menuFilterSelect,
  menuItemCard,
  menuSearchInput,
  menuStatCard,
} from "./menu-page-styles";
import { useMenuPageChrome } from "./menu-page-chrome-context";
import { useMenuOutOfStock } from "./useMenuOutOfStock";
import { MenuOutOfStockSheet } from "@/components/merchant/MenuOutOfStockSheet";
import { MenuRestoreStockConfirm } from "@/components/merchant/MenuRestoreStockConfirm";
import { MenuItemStockToggle } from "@/components/merchant/MenuItemStockToggle";
import { MenuItemPriceRow } from "./MenuItemPriceRow";

async function throwMenuApiError(res: Response, fallback: string): Promise<never> {
  const j = await res.json().catch(() => ({}));
  throw new Error(typeof (j as { error?: string }).error === "string" ? (j as { error: string }).error : fallback);
}

function nutritionPayloadFromForm(form: ItemFormData) {
  const parseOpt = (s: string): number | null => {
    const t = String(s ?? "").trim();
    if (!t) return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const tags = form.item_tags
    ? String(form.item_tags)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  return {
    available_for_delivery: form.available_for_delivery !== false,
    weight_per_serving: parseOpt(form.weight_per_serving),
    weight_per_serving_unit: form.weight_per_serving_unit || "grams",
    calories_kcal: parseOpt(form.calories_kcal),
    protein: parseOpt(form.protein),
    protein_unit: form.protein_unit || "mg",
    carbohydrates: parseOpt(form.carbohydrates),
    carbohydrates_unit: form.carbohydrates_unit || "mg",
    fat: parseOpt(form.fat),
    fat_unit: form.fat_unit || "mg",
    fibre: parseOpt(form.fibre),
    fibre_unit: form.fibre_unit || "mg",
    item_tags: tags.length ? tags : null,
  };
}

function parseNullableInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeCategory(c: {
  id?: number;
  store_id?: number;
  name?: string;
  category_name?: string;
  category_description?: string | null;
  parent_category_id?: number | null;
  cuisine_id?: number | null;
  display_order?: number | null;
  is_active?: boolean;
}): MenuCategory {
  const parentCategoryIdNum = parseNullableInt(c.parent_category_id);
  const cuisineIdNum = parseNullableInt(c.cuisine_id);
  const idNum = parseNullableInt(c.id) ?? 0;
  return {
    id: idNum,
    store_id: Number(c.store_id) ?? 0,
    category_name: c.category_name ?? c.name ?? "—",
    category_description: c.category_description ?? undefined,
    parent_category_id: parentCategoryIdNum ?? undefined,
    cuisine_id: cuisineIdNum ?? undefined,
    display_order: c.display_order ?? undefined,
    is_active: c.is_active !== false,
    out_of_stock_manual: Boolean((c as { out_of_stock_manual?: boolean }).out_of_stock_manual),
    out_of_stock_until: ((c as { out_of_stock_until?: string | null }).out_of_stock_until as string | null) ?? null,
    out_of_stock_updated_at:
      ((c as { out_of_stock_updated_at?: string | null }).out_of_stock_updated_at as string | null) ?? null,
  };
}

function formatCategoryLabel(categories: MenuCategory[], categoryId: number | null | undefined): string {
  if (categoryId == null) return "Uncategorized";
  const cat = categories.find((c) => Number(c.id) === Number(categoryId));
  if (!cat) return "Uncategorized";
  if (cat.parent_category_id) {
    const parent = categories.find((c) => Number(c.id) === Number(cat.parent_category_id));
    return parent ? `${parent.category_name} (${cat.category_name})` : cat.category_name;
  }
  return cat.category_name;
}

function normalizeItem(
  item: Record<string, unknown>,
  index: number
): MenuItem {
  const id = parseNullableInt(item.id) ?? index;
  const itemId = (item.item_id as string) ?? String(id);
  return {
    id,
    item_id: itemId,
    item_name: (item.item_name as string) ?? (item.name as string) ?? "—",
    category_id: parseNullableInt(item.category_id),
    base_price: Number(item.base_price) ?? 0,
    selling_price: Number(item.selling_price) ?? 0,
    discount_percentage: Number(item.discount_percentage) ?? 0,
    tax_percentage: Number(item.tax_percentage) ?? 0,
    in_stock: (item.in_stock as boolean) ?? true,
    out_of_stock_manual: Boolean((item as { out_of_stock_manual?: boolean }).out_of_stock_manual),
    out_of_stock_until: ((item as { out_of_stock_until?: string | null }).out_of_stock_until as string | null) ?? null,
    out_of_stock_updated_at:
      ((item as { out_of_stock_updated_at?: string | null }).out_of_stock_updated_at as string | null) ?? null,
    has_customizations: (item.has_customizations as boolean) ?? false,
    has_addons: (item.has_addons as boolean) ?? false,
    has_variants: (item.has_variants as boolean) ?? false,
    is_popular: (item.is_popular as boolean) ?? false,
    is_recommended: (item.is_recommended as boolean) ?? false,
    item_image_url: resolveAttachmentProxyUrl((item.item_image_url as string) ?? "") || undefined,
    item_description: (item.item_description as string) ?? undefined,
    food_type: (item.food_type as string) ?? undefined,
    spice_level: (item.spice_level as string) ?? undefined,
    cuisine_type: (item.cuisine_type as string) ?? undefined,
    is_active: (item.is_active as boolean) ?? true,
    is_deleted: Boolean(item.is_deleted),
    preparation_time_minutes: (item.preparation_time_minutes as number) ?? undefined,
    packaging_charges:
      item.packaging_charges == null ? undefined : Number(item.packaging_charges as number),
    serves: (item.serves as number) ?? undefined,
    serves_label: (item.serves_label as string) ?? null,
    item_size_value:
      item.item_size_value == null ? null : (Number(item.item_size_value) as number),
    item_size_unit: (item.item_size_unit as string) ?? null,
    available_for_delivery:
      (item.available_for_delivery as boolean) ?? true,
    weight_per_serving:
      item.weight_per_serving == null ? null : (Number(item.weight_per_serving) as number),
    weight_per_serving_unit: (item.weight_per_serving_unit as string) ?? null,
    calories_kcal:
      item.calories_kcal == null ? null : (Number(item.calories_kcal) as number),
    protein:
      item.protein == null ? null : (Number(item.protein) as number),
    protein_unit: (item.protein_unit as string) ?? null,
    carbohydrates:
      item.carbohydrates == null ? null : (Number(item.carbohydrates) as number),
    carbohydrates_unit: (item.carbohydrates_unit as string) ?? null,
    fat:
      item.fat == null ? null : (Number(item.fat) as number),
    fat_unit: (item.fat_unit as string) ?? null,
    fibre:
      item.fibre == null ? null : (Number(item.fibre) as number),
    fibre_unit: (item.fibre_unit as string) ?? null,
    item_tags: (item.item_tags as string[] | null) ?? null,
    customizations: (item.customizations as Customization[]) ?? [],
    variants: (item.variants as Variant[]) ?? [],
    allergens: (item.allergens as any) ?? undefined,
    approval_status: (item.approval_status as any) ?? null,
    rejection_reason: (item.rejection_reason as string | null) ?? null,
    has_pending_change_request: Boolean((item as any).has_pending_change_request),
    pending_change_request_type: ((item as any).pending_change_request_type as any) ?? null,
    linked_modifier_groups: ((item as any).linked_modifier_groups as any) ?? [],
  };
}

export function StoreMenuClient({ storeId: storeIdProp, onSwitchToAddonLibrary }: { storeId: string; onSwitchToAddonLibrary?: () => void }) {
  const { toast } = useToast();
  const queryClient = getQueryClient();
  const router = useRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const params = useAppParams<{ id?: string }>();
  const storeCtx = useStoreContext();
  const storeId =
    resolveEffectiveStoreId([
      storeIdProp,
      params.id,
      Array.isArray(params.id) ? params.id[0] : undefined,
      storeIdFromPathname(pathname),
      storeCtx.storeId,
    ]) ?? "";
  const menuSearch = searchParams.toString();
  const { canManageStore, canApproveMenuItems, isViewOnly, canMutate } = useMerchantDashboardAccess();
  /** Pure VIEW (or no store/menu manage grant): no add/edit/delete/stock/approve. */
  const menuReadOnly = isViewOnly || !canManageStore || !canMutate;
  const canReviewApprove = canApproveMenuItems && !menuReadOnly;
  const menuQuery = useStoreMenuQuery(storeId || null);
  const data = menuQuery.data ?? null;
  const menuRequestPending =
    !storeId || menuQuery.isPending || (menuQuery.isFetching && data == null);
  const menuRequestFailed = menuQuery.isError && data == null;
  const loading = menuRequestPending;
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const preserveMenuScroll = useCallback(() => {
    const el = menuScrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (menuScrollRef.current) menuScrollRef.current.scrollTop = top;
      });
    });
  }, []);

  useEffect(() => {
    writeLastMerchantStoreId(storeId);
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    if (storeIdFromPathname(pathname) === storeId) return;
    router.replace(merchantStoreHref(storeId, storePageSuffix(pathname), menuSearch));
  }, [storeId, pathname, router, menuSearch]);

  const categories = useMemo((): MenuCategory[] => {
    const raw = (data && "categories" in data && Array.isArray(data.categories) ? data.categories : []) as Record<
      string,
      unknown
    >[];
    return raw.map((c, i) => {
      const norm = normalizeCategory(c as Parameters<typeof normalizeCategory>[0]);
      return { ...norm, id: norm.id && norm.id > 0 ? norm.id : i + 1 };
    });
  }, [data]);

  const menuItems = useMemo((): MenuItem[] => {
    const raw = (data && "items" in data && Array.isArray(data.items) ? data.items : []) as Record<string, unknown>[];
    return raw.map((item, i) => normalizeItem(item, i));
  }, [data]);

  const menuOos = useMenuOutOfStock({
    storeId,
    menuItems,
    categories,
    queryClient,
    toast,
    onStockUpdated: preserveMenuScroll,
  });
  const storeMenuDefaults = useMemo(() => {
    const s = (
      data as {
        store?: { avg_preparation_time_minutes?: number | null; packaging_charge_amount?: number | null };
      } | null
    )?.store;
    return {
      avg_preparation_time_minutes: s?.avg_preparation_time_minutes ?? null,
      packaging_charge_amount: s?.packaging_charge_amount ?? null,
    };
  }, [data]);
  const [addCreatedItemId, setAddCreatedItemId] = useState<number | null>(null);
  const [addModalKey, setAddModalKey] = useState(0);
  const initialAddVariantsRef = useRef<number[]>([]);
  const initialAddCustRef = useRef<number[]>([]);
  const initialAddAddonIdsRef = useRef<Record<number, number[]>>({});

  const openAddItemModal = useCallback(() => {
    // No categories yet → open Add Category first so mx/admin can add items after.
    if (categories.length === 0) {
      setCategoryModalMode("add");
      setCategoryForm({
        category_name: "",
        category_description: "",
        display_order: 0,
        is_active: true,
        cuisine_id: undefined,
      });
      setParentCategoryIdInForm(null);
      setEditingCategoryId(null);
      setCategoryCuisineInput("");
      setShowCategoryModal(true);
      return;
    }
    setAddCreatedItemId(null);
    initialAddVariantsRef.current = [];
    initialAddCustRef.current = [];
    initialAddAddonIdsRef.current = {};
    setAddModalKey((k) => k + 1);
    setAddForm({
      ...DEFAULT_ITEM_FORM_DATA,
      preparation_time_minutes: storeMenuDefaults.avg_preparation_time_minutes ?? 15,
    });
    setAddError("");
    setImagePreview("");
    setAddImageFile(null);
    setAddImageValidationError("");
    setAddImageValidating(false);
    addImagePendingFileRef.current = null;
    setShowAddModal(true);
  }, [storeMenuDefaults, categories.length]);
  const refreshMenu = useCallback(async () => {
    const url = `/api/merchant/stores/${storeId}/menu?_=${Date.now()}`;
    await queryClient.fetchQuery({
      queryKey: queryKeys.merchantStore.menu(storeId),
      queryFn: async () => {
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data as { error?: string })?.error ?? "Failed to refresh menu");
        }
        return data as { success: boolean; categories?: unknown[]; items?: unknown[] };
      },
      staleTime: 0,
    });
  }, [queryClient, storeId]);
  const deleteMenuVariantsById = useCallback(async (variantIds: number[]) => {
    const base = `/api/merchant/stores/${storeId}/menu`;
    for (const id of [...new Set(variantIds)]) {
      const r = await fetch(`${base}/variants/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 404) {
        throw new Error(typeof j?.error === "string" ? j.error : "Failed to delete variant");
      }
    }
  }, [storeId]);

  const patchMenuItemInCache = useCallback(
    (itemId: number, patch: Record<string, unknown>) => {
      queryClient.setQueryData(queryKeys.merchantStore.menu(storeId), (prev: unknown) => {
        if (!prev || typeof prev !== "object") return prev;
        const current = prev as { items?: unknown[] };
        if (!Array.isArray(current.items)) return prev;
        let changed = false;
        const items = current.items.map((row) => {
          const r = row as Record<string, unknown>;
          const rowId = parseNullableInt(r.id);
          if (rowId == null || rowId !== itemId) return row;
          changed = true;
          return { ...r, ...patch };
        });
        if (!changed) return prev;
        return {
          ...(current as Record<string, unknown>),
          items,
        };
      });
    },
    [queryClient, storeId]
  );
  /** Optimistic card thumbnails — shown until menu refetch confirms server URL. */
  const [cardImageByItemId, setCardImageByItemId] = useState<Record<number, string>>({});
  const applyMenuItemImageToCards = useCallback(
    (itemId: number, imageUrl: string) => {
      const displayUrl = withAttachmentCacheBust(imageUrl);
      setCardImageByItemId((prev) => ({ ...prev, [itemId]: displayUrl }));
      patchMenuItemInCache(itemId, { item_image_url: displayUrl });
    },
    [patchMenuItemInCache]
  );
  const uploadEditItemImage = useCallback(
    async (itemId: number, file: File): Promise<string> => {
      const fd = new FormData();
      fd.append("file", file);
      const imgRes = await fetch(`/api/merchant/stores/${storeId}/menu/items/${itemId}/images`, {
        method: "POST",
        body: fd,
      });
      const img = await imgRes.json().catch(() => ({}));
      if (!imgRes.ok || img?.success === false) {
        throw new Error(img?.error || "Image upload failed");
      }
      const imageUrl = String(img.image_url ?? "").trim();
      if (!imageUrl) throw new Error("Image upload failed");
      applyMenuItemImageToCards(itemId, imageUrl);
      return withAttachmentCacheBust(imageUrl);
    },
    [storeId, applyMenuItemImageToCards]
  );
  const itemCardImageUrl = useCallback(
    (item: MenuItem) => cardImageByItemId[item.id] ?? item.item_image_url,
    [cardImageByItemId]
  );

  useEffect(() => {
    setCardImageByItemId((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const item of menuItems) {
        if (next[item.id] && item.item_image_url) {
          delete next[item.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [menuItems]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categoryPillMode, setCategoryPillMode] = useState<"category" | "sub-category">("category");
  const [viewMode, setViewMode] = useState<"card" | "tree">("card");
  const [contentScope, setContentScope] = useState<"item" | "cust">("item");
  const [custStockBusy, setCustStockBusy] = useState<string | null>(null);
  const [openTreeGroups, setOpenTreeGroups] = useState<Record<string, boolean>>({});
  const [categoryChipDropdownId, setCategoryChipDropdownId] = useState<number | null>(null);
  const [subcategoryRowOffset, setSubcategoryRowOffset] = useState(0);
  const categoryChipRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const subcategoryRowRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [stockFilter, setStockFilter] = useState<"ALL" | "IN_STOCK" | "OUT_OF_STOCK">("ALL");
  const [changeRequestFilter, setChangeRequestFilter] = useState<"ALL" | "UPDATE" | "DELETE">("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<"LIVE" | "REMOVED" | "ALL">("LIVE");
  const [showMenuFileSection, setShowMenuFileSection] = useState(false);
  const { setItemsToolbar } = useMenuPageChrome();
  const [menuReferenceFiles, setMenuReferenceFiles] = useState<MenuMediaFile[]>([]);
  const [menuReferenceLoading, setMenuReferenceLoading] = useState(false);
  const [menuReferenceError, setMenuReferenceError] = useState<string | null>(null);
  const menuReferenceLoadedForStoreRef = useRef<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    setMenuItemFormModalOpen(showEditModal || showAddModal);
    return () => setMenuItemFormModalOpen(false);
  }, [showEditModal, showAddModal]);
  useEffect(() => {
    if (!showMenuFileSection) return;
    if (menuReferenceLoadedForStoreRef.current === storeId) return;
    let cancelled = false;
    setMenuReferenceLoading(true);
    setMenuReferenceError(null);
    (async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/media?scope=MENU_REFERENCE`, {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.success === false) {
          throw new Error(json?.error || "Failed to load menu files");
        }
        const files = Array.isArray(json?.files) ? (json.files as MenuMediaFile[]) : [];
        if (!cancelled) {
          setMenuReferenceFiles(files);
          menuReferenceLoadedForStoreRef.current = storeId;
        }
      } catch (e) {
        if (!cancelled) {
          setMenuReferenceFiles([]);
          setMenuReferenceError(e instanceof Error ? e.message : "Failed to load menu files");
        }
      } finally {
        if (!cancelled) setMenuReferenceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMenuFileSection, storeId]);

  const isSheetOrPdfFile = useCallback((file: MenuMediaFile) => {
    const entity = String(file.source_entity ?? "").toUpperCase();
    if (entity === "ONBOARDING_MENU_PDF" || entity === "ONBOARDING_MENU_SHEET") return true;
    const name = String(file.original_file_name ?? "").toLowerCase();
    const mime = String(file.mime_type ?? "").toLowerCase();
    return (
      name.endsWith(".pdf") ||
      name.endsWith(".csv") ||
      name.endsWith(".xls") ||
      name.endsWith(".xlsx") ||
      mime.includes("pdf") ||
      mime.includes("csv") ||
      mime.includes("sheet") ||
      mime.includes("excel") ||
      mime.includes("spreadsheet")
    );
  }, []);

  const menuSheetOrPdfFiles = menuReferenceFiles.filter((f) => isSheetOrPdfFile(f) && !!f.menu_url);
  const menuImageFiles = menuReferenceFiles.filter((f) => (f.reference_images?.length ?? 0) > 0);
  const [viewCustModal, setViewCustModal] = useState<{ open: boolean; item: MenuItem | null }>({
    open: false,
    item: null,
  });
  const [viewCustModalTab, setViewCustModalTab] = useState<"customizations" | "variants">("customizations");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState<"add" | "edit">("add");
  const [categoryForm, setCategoryForm] = useState<Partial<MenuCategory>>({
    category_name: "",
    is_active: true,
  });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryCuisineInput, setCategoryCuisineInput] = useState("");
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const [categoryPeerSuggestions, setCategoryPeerSuggestions] = useState<string[]>([]);
  const [categoryPeerSuggestionsLoading, setCategoryPeerSuggestionsLoading] = useState(false);
  const debouncedCategoryNameInput = useDebouncedValue(categoryForm.category_name ?? "", 280);
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false);
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false);
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
  const [categoryDeleteError, setCategoryDeleteError] = useState<string | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [moveItemsToCategoryId, setMoveItemsToCategoryId] = useState<number | null>(null);
  const [isMovingCategoryItems, setIsMovingCategoryItems] = useState(false);
  const [parentCategoryIdInForm, setParentCategoryIdInForm] = useState<number | null>(null);
  const [categoryUiConfig, setCategoryUiConfig] = useState<{
    cuisine_field: { visible: boolean; required_for_root: boolean; inherit_on_subcategory: boolean };
    allow_create_custom_cuisine: boolean;
    limits?: { max_cuisines: number | null; current_custom_cuisine_count: number };
  } | null>(null);
  const [cuisineOptions, setCuisineOptions] = useState<
    Array<{ id: number; name: string; is_system_defined: boolean }>
  >([]);

  const [addForm, setAddForm] = useState<ItemFormData>(DEFAULT_ITEM_FORM_DATA);
  const [editForm, setEditForm] = useState<ItemFormData>(DEFAULT_ITEM_FORM_DATA);
  const [imagePreview, setImagePreview] = useState("");
  const [editImagePreview, setEditImagePreview] = useState("");
  const [addImageFile, setAddImageFile] = useState<File | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [addImageValidationError, setAddImageValidationError] = useState("");
  const [editImageValidationError, setEditImageValidationError] = useState("");
  const [addImageValidating, setAddImageValidating] = useState(false);
  const [editImageValidating, setEditImageValidating] = useState(false);
  const addImagePendingFileRef = useRef<File | null>(null);
  const editImagePendingFileRef = useRef<File | null>(null);
  /** Item id for the open edit modal; null when closed. Guards in-flight reload from overwriting another session. */
  const editModalItemIdRef = useRef<number | null>(null);
  /** Ignores stale GET /menu/items/[id] responses that can overwrite fresher cache after save. */
  const editItemReloadSeqRef = useRef(0);
  const [addError, setAddError] = useState("");
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [reviewItem, setReviewItem] = useState<MenuItem | null>(null);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);
  const [photoRejectReason, setPhotoRejectReason] = useState("");
  const [isReviewActionLoading, setIsReviewActionLoading] = useState<"APPROVE" | "REJECT" | null>(null);
  const [showAppliedAddonsDrawer, setShowAppliedAddonsDrawer] = useState(false);
  const [appliedAddonsItem, setAppliedAddonsItem] = useState<MenuItem | null>(null);
  const [appliedAddonsLoading, setAppliedAddonsLoading] = useState(false);
  const [appliedAddonsError, setAppliedAddonsError] = useState("");
  const [unlinkingModifierLinkId, setUnlinkingModifierLinkId] = useState<number | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const trackAudit = useCallback((payload: {
    actionType: "VIEW" | "CREATE" | "UPDATE" | "DELETE";
    resourceType: string;
    resourceId?: string;
    actionDetails?: Record<string, unknown>;
    actionStatus?: "SUCCESS" | "FAILED";
    errorMessage?: string;
    requestMethod?: string;
  }) => {
    try {
      if (process.env.NODE_ENV === "development") return;
      if (typeof window === "undefined") return;
      void fetch("/api/audit/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: payload.actionType === "VIEW" ? "PAGE_VIEW" : "API_CALL",
          dashboardType: "MERCHANT",
          actionType: payload.actionType,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId,
          actionDetails: payload.actionDetails ?? {},
          requestPath: window.location.pathname,
          requestMethod: payload.requestMethod ?? payload.actionType,
          actionStatus: payload.actionStatus ?? "SUCCESS",
          errorMessage: payload.errorMessage,
        }),
      });
    } catch {
      // never block UI
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/menu/category-config`, {
          credentials: "include",
        });
        const cfg = (await res.json().catch(() => null)) as {
          cuisine_field?: { visible?: boolean; required_for_root?: boolean; inherit_on_subcategory?: boolean };
          allow_create_custom_cuisine?: boolean;
          limits?: { max_cuisines?: number | null; current_custom_cuisine_count?: number };
        } | null;
        if (cancelled || !res.ok || !cfg?.cuisine_field) return;
        setCategoryUiConfig({
          cuisine_field: {
            visible: Boolean(cfg.cuisine_field.visible),
            required_for_root: Boolean(cfg.cuisine_field.required_for_root),
            inherit_on_subcategory: Boolean(cfg.cuisine_field.inherit_on_subcategory),
          },
          allow_create_custom_cuisine: Boolean(cfg.allow_create_custom_cuisine),
          limits: cfg.limits
            ? {
                max_cuisines:
                  cfg.limits.max_cuisines != null && Number.isFinite(Number(cfg.limits.max_cuisines))
                    ? Number(cfg.limits.max_cuisines)
                    : null,
                current_custom_cuisine_count: Number(cfg.limits.current_custom_cuisine_count ?? 0),
              }
            : undefined,
        });
      } catch {
        if (!cancelled) setCategoryUiConfig(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const parseCuisineRows = (
    rows: unknown
  ): Array<{ id: number; name: string; is_system_defined: boolean }> => {
    if (!Array.isArray(rows)) return [];
    const out: Array<{ id: number; name: string; is_system_defined: boolean }> = [];
    for (const raw of rows) {
      if (raw == null || typeof raw !== "object") continue;
      const x = raw as Record<string, unknown>;
      const idRaw = x.id;
      const idNum =
        typeof idRaw === "bigint" ? Number(idRaw) : typeof idRaw === "number" ? idRaw : Number(idRaw);
      if (!Number.isFinite(idNum) || idNum <= 0) continue;
      if (typeof x.name !== "string") continue;
      out.push({
        id: idNum,
        name: x.name,
        is_system_defined: Boolean(x.is_system_defined),
      });
    }
    return out;
  };

  const loadStoreCuisines = useCallback(async () => {
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/cuisines`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        cuisines?: unknown;
      };
      if (!res.ok || j.success === false) {
        setCuisineOptions([]);
        return;
      }
      const linked = parseCuisineRows(Array.isArray(j.cuisines) ? j.cuisines : []);
      setCuisineOptions(linked);
      setCategoryUiConfig((prev) =>
        prev?.limits
          ? { ...prev, limits: { ...prev.limits, current_custom_cuisine_count: linked.length } }
          : prev
      );
    } catch {
      setCuisineOptions([]);
    }
  }, [storeId]);

  useEffect(() => {
    void loadStoreCuisines();
  }, [loadStoreCuisines]);

  useEffect(() => {
    if (showCategoryModal && categoryUiConfig?.cuisine_field.visible) {
      void loadStoreCuisines();
    }
  }, [showCategoryModal, categoryUiConfig?.cuisine_field.visible, loadStoreCuisines]);

  const showCuisinePicker =
    Boolean(categoryUiConfig?.cuisine_field.visible) && parentCategoryIdInForm == null;

  const selectedCuisineForCategory = useMemo(() => {
    const cid = categoryForm.cuisine_id;
    if (cid == null || Number.isNaN(Number(cid))) return null;
    return cuisineOptions.find((c) => c.id === Number(cid)) ?? null;
  }, [categoryForm.cuisine_id, cuisineOptions]);
  const cuisineChipLabel = selectedCuisineForCategory?.name ?? null;

  const resolveCuisineIdFromPicker = useCallback(
    (typedRaw: string, currentId?: number | null): number | undefined => {
      if (currentId != null && !Number.isNaN(Number(currentId)) && Number(currentId) > 0) {
        const stillLinked = cuisineOptions.some((c) => c.id === Number(currentId));
        if (stillLinked) return Number(currentId);
        // Keep existing category cuisine even if temporarily missing from options.
        if (categoryModalMode === "edit") return Number(currentId);
      }
      const typed = typedRaw.trim().toLowerCase();
      if (!typed) return undefined;
      const exact = cuisineOptions.find((c) => c.name.trim().toLowerCase() === typed);
      if (exact) return Number(exact.id);
      const prefix = cuisineOptions.find((c) => {
        const n = c.name.trim().toLowerCase();
        return n.startsWith(typed) || typed.startsWith(n);
      });
      if (prefix) return Number(prefix.id);
      return undefined;
    },
    [cuisineOptions, categoryModalMode]
  );

  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parent_category_id).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [categories]
  );
  const rootCategories = parentCategories;
  const subCategories = useMemo(
    () =>
      categories
        .filter((c) => c.parent_category_id != null)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [categories]
  );
  const categoriesForPills = categoryPillMode === "category" ? rootCategories : subCategories;
  const childrenByParentId = useMemo(() => {
    const map = new Map<number, MenuCategory[]>();
    for (const c of categories) {
      if (c.parent_category_id == null) continue;
      const list = map.get(c.parent_category_id) ?? [];
      list.push(c);
      map.set(c.parent_category_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return map;
  }, [categories]);
  const displayCategoriesForChips = useMemo(() => parentCategories, [parentCategories]);
  const activeChipSubcategories = useMemo(() => {
    if (categoryChipDropdownId == null) return [];
    return categories.filter(
      (c) =>
        c.parent_category_id != null &&
        Number(c.parent_category_id) === Number(categoryChipDropdownId)
    );
  }, [categories, categoryChipDropdownId]);
  useEffect(() => {
    const updateOffset = () => {
      if (categoryChipDropdownId == null) {
        setSubcategoryRowOffset((prev) => (prev === 0 ? prev : 0));
        return;
      }
      const chipEl = categoryChipRefs.current[categoryChipDropdownId];
      const rowEl = subcategoryRowRef.current;
      if (!chipEl || !rowEl) {
        setSubcategoryRowOffset((prev) => (prev === 0 ? prev : 0));
        return;
      }
      const left = chipEl.getBoundingClientRect().left - rowEl.getBoundingClientRect().left;
      const next = Math.max(0, Math.round(left));
      setSubcategoryRowOffset((prev) => (prev === next ? prev : next));
    };
    updateOffset();
    const scroller = categoryScrollRef.current;
    scroller?.addEventListener("scroll", updateOffset, { passive: true });
    window.addEventListener("resize", updateOffset);
    return () => {
      scroller?.removeEventListener("scroll", updateOffset);
      window.removeEventListener("resize", updateOffset);
    };
  }, [categoryChipDropdownId, categories.length]);

  /** Same scope as DB unique (store + parent + lower(name)): root vs siblings under a parent. */
  const categoryNameConflictSet = useMemo(() => {
    const set = new Set<string>();
    const scopeParent = parentCategoryIdInForm ?? null;
    for (const c of categories) {
      if (categoryModalMode === "edit" && editingCategoryId != null && c.id === editingCategoryId) continue;
      const rowParent = c.parent_category_id ?? null;
      if (rowParent !== scopeParent) continue;
      const n = (c.category_name ?? "").toLowerCase().trim();
      if (n) set.add(n);
    }
    return set;
  }, [categories, categoryModalMode, editingCategoryId, parentCategoryIdInForm]);

  const useSubcategoryPeerSuggestions =
    parentCategoryIdInForm != null;

  useEffect(() => {
    if (!showCategoryModal) {
      setCategoryPeerSuggestions([]);
      setCategoryPeerSuggestionsLoading(false);
      return;
    }
    const ac = new AbortController();
    (async () => {
      setCategoryPeerSuggestionsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("q", debouncedCategoryNameInput.trim().slice(0, 30));
        if (categoryModalMode === "edit" && editingCategoryId != null) {
          params.set("editingCategoryId", String(editingCategoryId));
        }
        let url: string;
        if (useSubcategoryPeerSuggestions && parentCategoryIdInForm != null) {
          params.set("parentCategoryId", String(parentCategoryIdInForm));
          url = `/api/merchant/stores/${storeId}/menu/subcategory-name-suggestions?${params.toString()}`;
        } else {
          url = `/api/merchant/stores/${storeId}/menu/category-name-suggestions?${params.toString()}`;
        }
        const res = await fetch(url, { credentials: "include", signal: ac.signal });
        const j = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          suggestions?: unknown;
          error?: string;
        };
        if (!res.ok || j.success === false) throw new Error(j.error || "Request failed");
        const list = Array.isArray(j.suggestions)
          ? j.suggestions.filter((x): x is string => typeof x === "string")
          : [];
        if (!ac.signal.aborted) setCategoryPeerSuggestions(list);
      } catch {
        if (!ac.signal.aborted) setCategoryPeerSuggestions([]);
      } finally {
        if (!ac.signal.aborted) setCategoryPeerSuggestionsLoading(false);
      }
    })();
    return () => ac.abort();
  }, [
    showCategoryModal,
    debouncedCategoryNameInput,
    storeId,
    categoryModalMode,
    editingCategoryId,
    parentCategoryIdInForm,
    useSubcategoryPeerSuggestions,
  ]);

  const filteredByCategory = (() => {
    if (selectedCategoryId === null) return menuItems;
    const selected = categories.find((c) => c.id === selectedCategoryId);
    if (!selected) return menuItems.filter((item) => item.category_id === selectedCategoryId);
    const isRoot = !selected.parent_category_id;
    if (categoryPillMode === "category" && isRoot) {
      const childIds = new Set(
        categories.filter((c) => c.parent_category_id === selected.id).map((c) => c.id)
      );
      return menuItems.filter(
        (item) =>
          item.category_id === selected.id ||
          (item.category_id != null && childIds.has(item.category_id))
      );
    }
    return menuItems.filter((item) => item.category_id === selectedCategoryId);
  })();

  const filteredByStatus =
    statusFilter === "ALL"
      ? filteredByCategory
      : filteredByCategory.filter((item) => {
          const st = item.approval_status ?? "PENDING";
          return st === statusFilter;
        });

  const filteredByStock =
    stockFilter === "ALL"
      ? filteredByStatus
      : filteredByStatus.filter((item) => {
          const inStockNow = menuOos.isItemInStock(item);
          return stockFilter === "IN_STOCK" ? inStockNow : !inStockNow;
        });

  const filteredByChangeRequest =
    changeRequestFilter === "ALL"
      ? filteredByStock
      : filteredByStock.filter((item) => {
          if (!item.has_pending_change_request) return false;
          return item.pending_change_request_type === changeRequestFilter;
        });

  const filteredByVisibility =
    visibilityFilter === "ALL"
      ? filteredByChangeRequest
      : filteredByChangeRequest.filter((item) => {
          const deleted = Boolean(item.is_deleted);
          return visibilityFilter === "LIVE" ? !deleted : deleted;
        });

  const searchedItems = searchTerm
    ? filteredByVisibility.filter(
        (item) =>
          item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.item_description &&
            item.item_description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : filteredByVisibility;

  const custScopeItems = useMemo(
    () => searchedItems.filter(itemHasCustomizationContent),
    [searchedItems]
  );

  const treeGroups = useMemo(() => {
    const byCat = new Map<
      string,
      { key: string; categoryId: number | null; categoryName: string; items: MenuItem[] }
    >();
    for (const item of searchedItems) {
      const categoryId = item.category_id ?? null;
      const categoryName =
        categoryId == null
          ? "Uncategorized"
          : categories.find((c) => c.id === categoryId)?.category_name ?? "Uncategorized";
      const key = String(categoryId ?? "uncategorized");
      const existing = byCat.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        byCat.set(key, { key, categoryId, categoryName, items: [item] });
      }
    }
    return Array.from(byCat.values()).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [searchedItems, categories]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("dashboard_menu_view_mode");
      if (saved === "card" || saved === "tree") setViewMode(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("dashboard_menu_view_mode", viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const inStock = menuItems.filter((item) => menuOos.isItemInStock(item)).length;
  const outStock = menuItems.filter((item) => !menuOos.isItemInStock(item)).length;
  const outStockPercent = menuItems.length ? Math.round((outStock / menuItems.length) * 100) : 0;

  const planLimits = null;
  const canAddItem = !menuReadOnly;

  useEffect(() => {
    setItemsToolbar(
      <>
        <p className="text-xs text-gray-500 min-w-0 max-w-[200px] sm:max-w-none truncate sm:whitespace-normal">
          Manage your menu items and categories
          {planLimits != null && (
            <span className="text-gray-400">
              {" "}
              · Plan: {(planLimits as { planName?: string })?.planName ?? "—"}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-medium text-gray-600">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className={menuFilterSelect}
              aria-label="Filter by status"
            >
              <option value="ALL">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-gray-600">
            <span>Stock</span>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
              className={menuFilterSelect}
              aria-label="Filter by stock"
            >
              <option value="ALL">All</option>
              <option value="IN_STOCK">In stock</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
            </select>
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-gray-600">
            <span>Requests</span>
            <select
              value={changeRequestFilter}
              onChange={(e) => setChangeRequestFilter(e.target.value as typeof changeRequestFilter)}
              className={menuFilterSelect}
              aria-label="Filter by change request"
            >
              <option value="ALL">All</option>
              <option value="UPDATE">Edit</option>
              <option value="DELETE">Delete</option>
            </select>
          </div>
        </div>
      </>
    );
    return () => setItemsToolbar(null);
  }, [setItemsToolbar, statusFilter, stockFilter, changeRequestFilter]);
  const canAddCategory = true;
  const imageUploadAllowed = true;
  const imageLimitReached = false;
  const imageUsed = 0;
  const imageLimit: number | null = null;
  const imageSlotsLeft: number | null = null;

  const initialEditVariantsRef = useRef<number[]>([]);
  const initialEditCustRef = useRef<number[]>([]);
  const initialEditAddonIdsRef = useRef<Record<number, number[]>>({});

  const setEditOptionsRefs = useCallback((form: ItemFormData) => {
    const refs = buildEditOptionsRefs(dedupeCustomizationGroups(form.customizations));
    initialEditVariantsRef.current = dedupeVariants(form.variants)
      .map((v) => toFiniteMenuId(v.id))
      .filter((id): id is number => id != null);
    initialEditCustRef.current = refs.custIds;
    initialEditAddonIdsRef.current = refs.addonMap;
  }, []);

  const hydrateEditFormFromItem = useCallback(
    (item: MenuItem) => {
      const form = mapMenuItemToEditForm(item as unknown as Record<string, unknown>, item.id);
      const deduped: ItemFormData = {
        ...form,
        customizations: dedupeCustomizationGroups(form.customizations),
        variants: dedupeVariants(form.variants),
      };
      setEditOptionsRefs(deduped);
      const imageUrl = resolveAttachmentProxyUrl(
        deduped.item_image_url || itemCardImageUrl(item) || item.item_image_url || ""
      );
      const previewUrl = imageUrl ? withAttachmentCacheBust(imageUrl) : "";
      setEditForm({ ...deduped, item_image_url: imageUrl || deduped.item_image_url });
      setEditImagePreview(previewUrl);
    },
    [setEditOptionsRefs, itemCardImageUrl]
  );

  /** Reload full edit form + menu list cache from GET /menu/items/[id] after any save. */
  const reloadEditItemFromServer = useCallback(
    async (menuItemId: number): Promise<ItemFormData> => {
      const seq = ++editItemReloadSeqRef.current;
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${menuItemId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success || !json?.item) {
        throw new Error(json?.error || "Failed to load saved item");
      }
      const data = json.item as Record<string, unknown>;
      const form = mapMenuItemToEditForm(data, menuItemId);
      const deduped: ItemFormData = {
        ...form,
        customizations: dedupeCustomizationGroups(form.customizations),
        variants: dedupeVariants(form.variants),
      };
      setEditOptionsRefs(deduped);
      const imageUrl = resolveAttachmentProxyUrl(
        String(form.item_image_url ?? data.item_image_url ?? "").trim()
      );
      const cacheBustedImageUrl = imageUrl ? withAttachmentCacheBust(imageUrl, seq) : "";
      if (editModalItemIdRef.current === menuItemId) {
        setEditForm({ ...deduped, item_image_url: imageUrl || deduped.item_image_url });
        setEditImagePreview(cacheBustedImageUrl || imageUrl);
      }
      if (seq !== editItemReloadSeqRef.current) {
        return deduped;
      }
      patchMenuItemInCache(menuItemId, {
        ...data,
        item_image_url: cacheBustedImageUrl || imageUrl || data.item_image_url,
        customizations: deduped.customizations,
        variants: deduped.variants,
        has_variants: deduped.has_variants,
        has_customizations: deduped.has_customizations,
        has_addons: deduped.has_addons,
      });
      if (cacheBustedImageUrl || imageUrl) {
        setCardImageByItemId((prev) => ({
          ...prev,
          [menuItemId]: cacheBustedImageUrl || imageUrl,
        }));
      }
      return { ...deduped, item_image_url: imageUrl || deduped.item_image_url };
    },
    [storeId, setEditOptionsRefs, patchMenuItemInCache]
  );

  const closeEditModalAfterSuccess = useCallback(() => {
    toast("Successfully Updated");
    editModalItemIdRef.current = null;
    setShowEditModal(false);
    setEditError("");
    setEditImageFile(null);
    setEditImageValidationError("");
    setEditImageValidating(false);
    editImagePendingFileRef.current = null;
  }, [toast]);

  const handleOpenEditModal = (item: MenuItem) => {
    const latest = menuItems.find((m) => Number(m.id) === Number(item.id)) ?? item;
    editModalItemIdRef.current = latest.id;
    setEditingId(latest.id);
    setEditError("");
    setEditImageFile(null);
    setEditImageValidationError("");
    setEditImageValidating(false);
    editImagePendingFileRef.current = null;
    hydrateEditFormFromItem(latest);
    setShowEditModal(true);
    void reloadEditItemFromServer(latest.id).catch(() => {
      /* keep cache-hydrated form if fetch fails */
    });
  };

  const handleEditVariantRemoved = useCallback(
    (variantId: number | null, nextVariants: Variant[]) => {
      if (variantId != null) {
        initialEditVariantsRef.current = initialEditVariantsRef.current.filter((id) => id !== variantId);
      }
      if (editingId != null) {
        patchMenuItemInCache(editingId, {
          variants: nextVariants,
          has_variants: nextVariants.length > 0,
        });
      }
    },
    [editingId, patchMenuItemInCache]
  );

  const handleAddVariantRemoved = useCallback((variantId: number | null) => {
    if (variantId != null) {
      initialAddVariantsRef.current = initialAddVariantsRef.current.filter((id) => id !== variantId);
    }
  }, []);

  const openAppliedAddons = useCallback(
    async (item: MenuItem) => {
      setShowAppliedAddonsDrawer(true);
      setAppliedAddonsItem(item);
      setAppliedAddonsError("");
      setAppliedAddonsLoading(true);
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${item.id}`);
        const json = await res.json().catch(() => ({}));
        const full = res.ok && json?.success && json?.item ? (json.item as MenuItem) : null;
        if (full) setAppliedAddonsItem(full);
      } catch (e) {
        setAppliedAddonsError(e instanceof Error ? e.message : "Failed to load addons");
      } finally {
        setAppliedAddonsLoading(false);
      }
    },
    [storeId],
  );

  const packagingPayloadForForm = (form: ItemFormData) => {
    if (!form.packaging_enabled) return null;
    const raw = String(form.packaging_charges ?? "").replace(/,/g, "").trim();
    if (raw !== "") {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    const def = storeMenuDefaults.packaging_charge_amount;
    if (def != null && Number.isFinite(Number(def)) && Number(def) >= 0) return Number(def);
    return null;
  };

  const assertAddMainValid = (form: ItemFormData) => {
    if (!form.item_name.trim()) {
      setAddError("Name is required");
      throw new Error("Name is required");
    }
    if (!form.category_id) {
      setAddError("Category is required");
      throw new Error("Category is required");
    }
    if (!form.base_price || Number(form.base_price) <= 0) {
      setAddError("Valid base price required");
      throw new Error("Valid base price required");
    }
    if (form.packaging_enabled) {
      const raw = String(form.packaging_charges ?? "").replace(/,/g, "").trim();
      const n = raw !== "" ? Number(raw) : NaN;
      const def = storeMenuDefaults.packaging_charge_amount;
      const hasAmount = raw !== "" && Number.isFinite(n) && n >= 0;
      const hasStoreDefault = def != null && Number.isFinite(Number(def)) && Number(def) >= 0;
      if (!hasAmount && !hasStoreDefault) {
        setAddError("Enter packaging amount (₹) or turn off packaging.");
        throw new Error("Packaging");
      }
    }
    setAddError("");
  };

  /** Step 1 (or update main fields after item exists): create item or PATCH when revisiting tab 1. */
  const handleAddSaveAndNext = async () => {
    assertAddMainValid(addForm);
    setIsSaving(true);
    try {
      if (addCreatedItemId != null) {
        const packagingPayload = packagingPayloadForForm(addForm);
        const payload = {
          item_name: addForm.item_name.trim(),
          item_description: addForm.item_description?.trim() || null,
          category_id: addForm.category_id,
          food_type: addForm.food_type || null,
          spice_level: addForm.spice_level || null,
          cuisine_type: addForm.cuisine_type || null,
          base_price: addForm.base_price ? Number(addForm.base_price) : 0,
          selling_price: addForm.selling_price ? Number(addForm.selling_price) : Number(addForm.base_price),
          discount_percentage: 0,
          in_stock: Boolean(addForm.in_stock),
          is_active: Boolean(addForm.is_active),
          is_popular: Boolean(addForm.is_popular),
          is_recommended: Boolean(addForm.is_recommended),
          preparation_time_minutes: addForm.preparation_time_minutes ?? null,
          packaging_charges: packagingPayload,
          serves: addForm.serves ?? null,
          serves_label: addForm.serves_label || null,
          item_size_value: addForm.item_size_value ? Number(addForm.item_size_value) : null,
          item_size_unit: addForm.item_size_unit || null,
          allergens: addForm.allergens ? String(addForm.allergens).split(",").map((s) => s.trim()).filter(Boolean) : [],
          ...nutritionPayloadFromForm(addForm),
        };
        const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${addCreatedItemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok || r?.success === false) throw new Error(r?.error || "Update failed");
        if (addImageFile) {
          const fd = new FormData();
          fd.append("file", addImageFile);
          const imgRes = await fetch(`/api/merchant/stores/${storeId}/menu/items/${addCreatedItemId}/images`, {
            method: "POST",
            body: fd,
          });
          const img = await imgRes.json().catch(() => ({}));
          if (!imgRes.ok || img?.success === false) toast(img?.error || "Image upload failed.");
          else setAddImageFile(null);
        }
        try {
          const { linked, skippedMessages } = await ensureStoreCuisinesLinkedForItemNames(storeId, addForm.cuisine_type);
          if (linked > 0) await loadStoreCuisines();
          if (skippedMessages.length > 0) toast(skippedMessages.slice(0, 2).join(" ") + (skippedMessages.length > 2 ? " …" : ""));
        } catch {
          /* non-fatal */
        }
        await refreshMenu();
        toast("Item details updated.");
        return;
      }

      const packagingPayload = packagingPayloadForForm(addForm);
      const payload = {
        item_name: addForm.item_name.trim(),
        item_description: addForm.item_description?.trim() || null,
        category_id: addForm.category_id,
        food_type: addForm.food_type || null,
        spice_level: addForm.spice_level || null,
        cuisine_type: addForm.cuisine_type || null,
        base_price: Number(addForm.base_price),
        selling_price: addForm.selling_price ? Number(addForm.selling_price) : Number(addForm.base_price),
        in_stock: Boolean(addForm.in_stock),
        is_active: Boolean(addForm.is_active),
        is_popular: Boolean(addForm.is_popular),
        is_recommended: Boolean(addForm.is_recommended),
        has_customizations: false,
        has_addons: false,
        has_variants: false,
        preparation_time_minutes: addForm.preparation_time_minutes ?? null,
        packaging_charges: packagingPayload,
        serves: addForm.serves ?? null,
        serves_label: addForm.serves_label || null,
        item_size_value: addForm.item_size_value ? Number(addForm.item_size_value) : null,
        item_size_unit: addForm.item_size_unit || null,
        allergens: addForm.allergens
          ? String(addForm.allergens)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
        ...nutritionPayloadFromForm(addForm),
      };
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r?.success === false) throw new Error(r?.error || "Create failed");
      const newId = Number(r?.id);
      if (!Number.isFinite(newId)) throw new Error("Invalid item id from server");
      trackAudit({
        actionType: "CREATE",
        resourceType: "merchant_menu_items",
        resourceId: String(newId),
        actionDetails: { action: "create_item", payload: { ...payload, item_description: payload.item_description ? "[text]" : null } },
        actionStatus: "SUCCESS",
        requestMethod: "POST",
      });
      initialAddVariantsRef.current = [];
      initialAddCustRef.current = [];
      initialAddAddonIdsRef.current = {};
      setAddCreatedItemId(newId);
      if (addImageFile) {
        const fd = new FormData();
        fd.append("file", addImageFile);
        const imgRes = await fetch(`/api/merchant/stores/${storeId}/menu/items/${newId}/images`, {
          method: "POST",
          body: fd,
        });
        const img = await imgRes.json().catch(() => ({}));
        if (!imgRes.ok || img?.success === false) {
          toast(img?.error || "Image upload failed (item created).");
          trackAudit({
            actionType: "UPDATE",
            resourceType: "merchant_menu_item_images",
            resourceId: String(newId),
            actionDetails: { action: "upload_item_image" },
            actionStatus: "FAILED",
            errorMessage: img?.error || "Image upload failed",
            requestMethod: "POST",
          });
        } else {
          trackAudit({
            actionType: "UPDATE",
            resourceType: "merchant_menu_item_images",
            resourceId: String(img?.id ?? ""),
            actionDetails: { action: "upload_item_image", menu_item_id: newId },
            actionStatus: "SUCCESS",
            requestMethod: "POST",
          });
          setAddImageFile(null);
        }
      }
      try {
        const { linked, skippedMessages } = await ensureStoreCuisinesLinkedForItemNames(storeId, addForm.cuisine_type);
        if (linked > 0) await loadStoreCuisines();
        if (skippedMessages.length > 0) toast(skippedMessages.slice(0, 2).join(" ") + (skippedMessages.length > 2 ? " …" : ""));
      } catch {
        /* non-fatal */
      }
      await refreshMenu();
      toast("Item saved. Add customizations or variants, then Submit.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error saving item.";
      const validationOnly = ["Name is required", "Category is required", "Valid base price required", "Packaging"].includes(msg);
      if (!validationOnly) {
        setAddError(msg);
        trackAudit({
          actionType: "CREATE",
          resourceType: "merchant_menu_items",
          actionDetails: { action: "add_save_step" },
          actionStatus: "FAILED",
          errorMessage: msg,
          requestMethod: "POST",
        });
      }
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const syncItemOptionFlags = async (itemId: number, form: ItemFormData) => {
    const custs = form.customizations ?? [];
    const vars = form.variants ?? [];
    const has_customizations = custs.length > 0;
    const has_variants = vars.length > 0;
    const has_addons = custs.some((c) => (c.addons?.length ?? 0) > 0);
    const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ has_customizations, has_variants, has_addons }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || r?.success === false) throw new Error(r?.error || "Failed to update option flags");
  };

  const handleAddSubmitOptions = async () => {
    if (addCreatedItemId == null) {
      toast("Save the item on the first tab first.");
      throw new Error("No item");
    }
    setAddError("");
    setIsSaving(true);
    try {
      const base = `/api/merchant/stores/${storeId}/menu`;
      const itemId = addCreatedItemId;
      const variantsToSave = dedupeVariants(addForm.variants ?? []);
      const currentVariantIds = variantsToSave
        .map((v) => toFiniteMenuId(v.id))
        .filter((id): id is number => id != null);
      const toDeleteVariants = initialAddVariantsRef.current.filter((id) => !currentVariantIds.includes(id));
      await deleteMenuVariantsById(toDeleteVariants);
      for (const v of variantsToSave) {
        const payload = {
          variant_name: v.variant_name,
          variant_type: v.variant_type ?? null,
          variant_price: v.variant_price,
          variant_size_value: normalizeVariantSizeValue(v.variant_size_value),
          variant_size_unit: v.variant_size_unit ?? null,
          is_default: v.is_default ?? false,
          display_order: v.display_order ?? 0,
        };
        const variantPk = toFiniteMenuId(v.id);
        if (variantPk != null) {
          const r = await fetch(`${base}/variants/${variantPk}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!r.ok) throw new Error("Failed to update variant");
        } else {
          const r = await fetch(`${base}/items/${itemId}/variants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!r.ok) throw new Error("Failed to add variant");
        }
      }

      const custsToSave = dedupeCustomizationGroups(addForm.customizations ?? []);
      const currentCustIds = customizationGroupIds(custsToSave);
      const toDeleteCust = initialAddCustRef.current.filter((id) => !currentCustIds.includes(id));
      for (const id of toDeleteCust) {
        const r = await fetch(`${base}/customization-groups/${id}`, { method: "DELETE" });
        if (!r.ok) throw new Error("Failed to delete customization group");
      }

      const groupIdsInOrder: number[] = [];
      for (const c of custsToSave) {
        const payload = {
          customization_title: c.customization_title,
          customization_type: c.customization_type ?? null,
          is_required: c.is_required,
          min_selection: c.min_selection,
          max_selection: c.max_selection,
          display_order: c.display_order,
        };
        const groupPk = toFiniteMenuId(c.id);
        if (groupPk != null) {
          const r = await fetch(`${base}/customization-groups/${groupPk}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!r.ok) throw new Error("Failed to update customization group");
          groupIdsInOrder.push(groupPk);
        } else {
          const r = await fetch(`${base}/items/${itemId}/customization-groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j?.id) throw new Error("Failed to add customization group");
          groupIdsInOrder.push(Number(j.id));
        }
      }

      let custIndex = 0;
      for (const c of custsToSave) {
        const groupId = groupIdsInOrder[custIndex++] ?? 0;
        if (!groupId) continue;
        const initialAddonIds = initialAddAddonIdsRef.current[groupId] ?? [];
        const currentAddonIds = (c.addons ?? [])
          .map((o) => toFiniteMenuId(o.id))
          .filter((id): id is number => id != null);
        const toDeleteAddons = initialAddonIds.filter((id) => !currentAddonIds.includes(id));
        for (const id of toDeleteAddons) {
          const r = await fetch(`${base}/customization-options/${id}`, { method: "DELETE" });
          if (!r.ok) throw new Error("Failed to delete addon");
        }
        for (const o of c.addons ?? []) {
          const optPayload = {
            addon_name: o.addon_name,
            addon_price: o.addon_price ?? 0,
            addon_image_url: o.addon_image_url ?? null,
            addon_size_value: o.addon_size_value ?? null,
            addon_size_unit: o.addon_size_unit ?? null,
            display_order: o.display_order ?? 0,
          };
          const addonPk = toFiniteMenuId(o.id);
          if (addonPk != null) {
            const r = await fetch(`${base}/customization-options/${addonPk}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(optPayload),
            });
            if (!r.ok) throw new Error("Failed to update addon");
          } else {
            const r = await fetch(`${base}/customization-groups/${groupId}/options`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(optPayload),
            });
            if (!r.ok) throw new Error("Failed to add addon");
          }
        }
      }

      await syncItemOptionFlags(itemId, addForm);
      toast("Menu item finished — variants and customizations saved.");
      await refreshMenu();
      setShowAddModal(false);
      setAddCreatedItemId(null);
      setAddForm(DEFAULT_ITEM_FORM_DATA);
      setImagePreview("");
      setAddImageFile(null);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to save options.");
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    setEditError("");
    if (editingId == null) return;
    if (!editForm.item_name.trim()) {
      setEditError("Name is required");
      throw new Error("Name is required");
    }
    if (!editForm.category_id) {
      setEditError("Category is required");
      throw new Error("Category is required");
    }
    if (editImageValidationError) {
      setEditError("Fix the image issue in the upload area or use Auto-fix.");
      throw new Error("Fix image");
    }
    setIsSavingEdit(true);
    try {
      editItemReloadSeqRef.current += 1;
      const packagingPayload = (() => {
        if (!editForm.packaging_enabled) return null;
        const n = Number(String(editForm.packaging_charges ?? "").replace(/,/g, ""));
        return Number.isFinite(n) && n >= 0 ? n : null;
      })();
      const discountNum = Number(String(editForm.discount_percentage ?? "0").replace(/,/g, ""));
      const taxNum = Number(String(editForm.tax_percentage ?? "0").replace(/,/g, ""));
      const payload = {
        item_name: editForm.item_name.trim(),
        item_description: editForm.item_description?.trim() || null,
        category_id: editForm.category_id,
        food_type: editForm.food_type || null,
        spice_level: editForm.spice_level || null,
        cuisine_type: editForm.cuisine_type || null,
        base_price: editForm.base_price ? Number(editForm.base_price) : 0,
        selling_price: editForm.selling_price ? Number(editForm.selling_price) : (editForm.base_price ? Number(editForm.base_price) : 0),
        discount_percentage: Number.isFinite(discountNum) ? discountNum : 0,
        tax_percentage: Number.isFinite(taxNum) ? taxNum : 0,
        in_stock: Boolean(editForm.in_stock),
        is_active: Boolean(editForm.is_active),
        is_popular: Boolean(editForm.is_popular),
        is_recommended: Boolean(editForm.is_recommended),
        preparation_time_minutes: editForm.preparation_time_minutes ?? null,
        packaging_charges: packagingPayload,
        serves: editForm.serves ?? null,
        serves_label: editForm.serves_label || null,
        item_size_value: editForm.item_size_value ? Number(editForm.item_size_value) : null,
        item_size_unit: editForm.item_size_unit || null,
        allergens: editForm.allergens ? String(editForm.allergens).split(",").map((s) => s.trim()).filter(Boolean) : [],
        ...nutritionPayloadFromForm(editForm),
      };
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r?.success === false) throw new Error(r?.error || "Update failed");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: String(editingId),
        actionDetails: { action: "update_item", payload: { ...payload, item_description: payload.item_description ? "[text]" : null } },
        actionStatus: "SUCCESS",
        requestMethod: "PUT",
      });
      if (editImageFile) {
        const cacheBustedImageUrl = await uploadEditItemImage(editingId, editImageFile);
        setEditImagePreview(cacheBustedImageUrl);
        setEditImageFile(null);
        trackAudit({
          actionType: "UPDATE",
          resourceType: "merchant_menu_item_images",
          resourceId: String(editingId),
          actionDetails: { action: "upload_item_image", menu_item_id: editingId },
          actionStatus: "SUCCESS",
          requestMethod: "POST",
        });
      }
      await reloadEditItemFromServer(editingId);
      await refreshMenu();
      try {
        const { linked, skippedMessages } = await ensureStoreCuisinesLinkedForItemNames(
          storeId,
          editForm.cuisine_type
        );
        if (linked > 0) await loadStoreCuisines();
        if (skippedMessages.length > 0) {
          toast(skippedMessages.slice(0, 2).join(" ") + (skippedMessages.length > 2 ? " …" : ""));
        }
      } catch {
        /* non-fatal */
      }
      closeEditModalAfterSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error updating item.";
      setEditError(msg);
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: editingId != null ? String(editingId) : undefined,
        actionDetails: { action: "update_item" },
        actionStatus: "FAILED",
        errorMessage: msg,
        requestMethod: "PUT",
      });
      throw e;
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSaveEditOptions = async () => {
    if (editingId == null) return;
    setEditError("");
    setIsSavingEdit(true);
    try {
      const base = `/api/merchant/stores/${storeId}/menu`;
      const variantsToSave = dedupeVariants(editForm.variants ?? []);
      const currentVariantIds = variantsToSave
        .map((v) => toFiniteMenuId(v.id))
        .filter((id): id is number => id != null);
      const toDeleteVariants = initialEditVariantsRef.current.filter((id) => !currentVariantIds.includes(id));
      await deleteMenuVariantsById(toDeleteVariants);
      for (const v of variantsToSave) {
        const payload = {
          variant_name: v.variant_name,
          variant_type: v.variant_type ?? null,
          variant_price: v.variant_price,
          variant_size_value: normalizeVariantSizeValue(v.variant_size_value),
          variant_size_unit: v.variant_size_unit ?? null,
          is_default: v.is_default ?? false,
          display_order: v.display_order ?? 0,
        };
        const variantPk = toFiniteMenuId(v.id);
        if (variantPk != null) {
          const r = await fetch(`${base}/variants/${variantPk}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!r.ok) await throwMenuApiError(r, "Failed to update variant");
        } else {
          const r = await fetch(`${base}/items/${editingId}/variants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!r.ok) await throwMenuApiError(r, "Failed to add variant");
        }
      }

      const custsToSave = dedupeCustomizationGroups(editForm.customizations ?? []);
      const currentCustIds = customizationGroupIds(custsToSave);
      const toDeleteCust = initialEditCustRef.current.filter((id) => !currentCustIds.includes(id));
      for (const id of toDeleteCust) {
        const r = await fetch(`${base}/customization-groups/${id}`, { method: "DELETE" });
        if (!r.ok) await throwMenuApiError(r, "Failed to delete customization group");
      }

      const groupIdsInOrder: number[] = [];
      for (const c of custsToSave) {
        const payload = { customization_title: c.customization_title, customization_type: c.customization_type ?? null, is_required: c.is_required, min_selection: c.min_selection, max_selection: c.max_selection, display_order: c.display_order };
        const groupPk = toFiniteMenuId(c.id);
        if (groupPk != null) {
          const r = await fetch(`${base}/customization-groups/${groupPk}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!r.ok) await throwMenuApiError(r, "Failed to update customization group");
          groupIdsInOrder.push(groupPk);
        } else {
          const r = await fetch(`${base}/items/${editingId}/customization-groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j?.id) {
            if (!r.ok) await throwMenuApiError(r, "Failed to add customization group");
            throw new Error("Failed to add customization group");
          }
          groupIdsInOrder.push(Number(j.id));
        }
      }

      let custIndex = 0;
      for (const c of custsToSave) {
        const groupId = groupIdsInOrder[custIndex++] ?? 0;
        if (!groupId) continue;
        const initialAddonIds = initialEditAddonIdsRef.current[groupId] ?? [];
        const currentAddonIds = (c.addons ?? [])
          .map((o) => toFiniteMenuId(o.id))
          .filter((id): id is number => id != null);
        const toDeleteAddons = initialAddonIds.filter((id) => !currentAddonIds.includes(id));
        for (const id of toDeleteAddons) {
          const r = await fetch(`${base}/customization-options/${id}`, { method: "DELETE" });
          if (!r.ok) await throwMenuApiError(r, "Failed to delete addon");
        }
        for (const o of c.addons ?? []) {
          const payload = {
            addon_name: o.addon_name,
            addon_price: o.addon_price ?? 0,
            addon_image_url: o.addon_image_url ?? null,
            addon_size_value: o.addon_size_value ?? null,
            addon_size_unit: o.addon_size_unit ?? null,
            display_order: o.display_order ?? 0,
          };
          const addonPk = toFiniteMenuId(o.id);
          if (addonPk != null) {
            const r = await fetch(`${base}/customization-options/${addonPk}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!r.ok) await throwMenuApiError(r, "Failed to update addon");
          } else {
            const r = await fetch(`${base}/customization-groups/${groupId}/options`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!r.ok) await throwMenuApiError(r, "Failed to add addon");
          }
        }
      }

      await syncItemOptionFlags(editingId, editForm);
      await reloadEditItemFromServer(editingId);
      closeEditModalAfterSuccess();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save options.");
      throw e;
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleProcessImage = async (file: File, isEdit: boolean) => {
    if (isEdit) {
      setEditImageValidationError("");
      setEditImageValidating(true);
      editImagePendingFileRef.current = file;
    } else {
      setAddImageValidationError("");
      setAddImageValidating(true);
      addImagePendingFileRef.current = file;
    }
    const check = await validateMenuItemImageFile(file);
    if (isEdit) {
      setEditImageValidating(false);
    } else {
      setAddImageValidating(false);
    }
    if (!check.valid) {
      if (isEdit) {
        setEditImageValidationError(check.error);
      } else {
        setAddImageValidationError(check.error);
      }
      return;
    }
    if (isEdit) {
      editImagePendingFileRef.current = null;
    } else {
      addImagePendingFileRef.current = null;
    }
    const preview = URL.createObjectURL(file);
    if (isEdit) {
      setEditImageFile(file);
      setEditImagePreview(preview);
      if (editingId != null) {
        setEditImageValidating(true);
        try {
          const uploadedUrl = await uploadEditItemImage(editingId, file);
          setEditImagePreview(uploadedUrl);
          setEditImageFile(null);
        } catch (e) {
          setEditImageValidationError(e instanceof Error ? e.message : "Image upload failed");
          setEditImageFile(file);
        } finally {
          setEditImageValidating(false);
        }
      }
    } else {
      setAddImageFile(file);
      setImagePreview(preview);
    }
  };

  const handleNormalizeMenuItemImage = async (isEdit: boolean) => {
    const pending = isEdit ? editImagePendingFileRef.current : addImagePendingFileRef.current;
    if (!pending) {
      toast("Choose an image first.");
      return;
    }
    if (isEdit) {
      setEditImageValidationError("");
      setEditImageValidating(true);
    } else {
      setAddImageValidationError("");
      setAddImageValidating(true);
    }
    const normalized = await normalizeMenuItemImageFile(pending);
    if (isEdit) {
      setEditImageValidating(false);
    } else {
      setAddImageValidating(false);
    }
    if (!normalized.ok) {
      if (isEdit) {
        setEditImageValidationError(normalized.error);
      } else {
        setAddImageValidationError(normalized.error);
      }
      toast(normalized.error);
      return;
    }
    await handleProcessImage(normalized.file, isEdit);
  };

  const handleDeleteItem = async () => {
    if (deleteItemId == null) return;
    const deletingId = deleteItemId;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${deletingId}`, { method: "DELETE" });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r?.success === false) throw new Error(r?.error || "Delete failed");
      queryClient.setQueryData(queryKeys.merchantStore.menu(storeId), (prev: unknown) => {
        if (!prev || typeof prev !== "object") return prev;
        const current = prev as { items?: unknown[] };
        if (!Array.isArray(current.items)) return prev;
        return {
          ...(current as Record<string, unknown>),
          items: current.items.filter((row) => Number((row as { id?: unknown }).id) !== deletingId),
        };
      });
      toast("Menu item deleted.");
      trackAudit({
        actionType: "DELETE",
        resourceType: "merchant_menu_items",
        resourceId: String(deletingId),
        actionDetails: { action: "delete_item" },
        actionStatus: "SUCCESS",
        requestMethod: "DELETE",
      });
      await refreshMenu();
      setShowDeleteModal(false);
      setDeleteItemId(null);
    } catch {
      toast("Error deleting item.");
      trackAudit({
        actionType: "DELETE",
        resourceType: "merchant_menu_items",
        resourceId: deleteItemId != null ? String(deleteItemId) : undefined,
        actionDetails: { action: "delete_item" },
        actionStatus: "FAILED",
        errorMessage: "Error deleting item.",
        requestMethod: "DELETE",
      });
    }
    setIsDeleting(false);
  };

  const openAddCategory = () => {
    setCategoryModalMode("add");
    setCategoryForm({
      category_name: "",
      category_description: "",
      display_order: categories.length,
      is_active: true,
      cuisine_id: undefined,
    });
    setParentCategoryIdInForm(null);
    setEditingCategoryId(null);
    setCategoryCuisineInput("");
    setShowCategoryModal(true);
  };
  const openAddSubcategory = (parent: MenuCategory) => {
    setCategoryModalMode("add");
    const siblings = categories.filter((x) => x.parent_category_id === parent.id);
    setCategoryForm({
      category_name: "",
      category_description: "",
      display_order: siblings.length,
      is_active: true,
      cuisine_id: undefined,
    });
    setParentCategoryIdInForm(parent.id);
    setEditingCategoryId(null);
    setCategoryCuisineInput("");
    setShowCategoryModal(true);
  };
  const openEditCategory = (cat: MenuCategory) => {
    setCategoryModalMode("edit");
    setCategoryForm({
      category_name: cat.category_name,
      category_description: cat.category_description ?? "",
      display_order: cat.display_order ?? 0,
      is_active: cat.is_active !== false,
      cuisine_id: cat.cuisine_id ?? undefined,
    });
    setParentCategoryIdInForm(cat.parent_category_id ?? null);
    setEditingCategoryId(cat.id);
    setCategoryCuisineInput(
      cat.cuisine_id != null
        ? (cuisineOptions.find((c) => c.id === Number(cat.cuisine_id))?.name ?? "")
        : ""
    );
    setShowCategoryModal(true);
    setShowManageCategoriesModal(false);
  };

  const handleSaveCategory = async () => {
    setCategoryError(null);
    const name = (categoryForm.category_name ?? "").trim();
    if (!name) {
      setCategoryError("Category name is required");
      return;
    }
    if (name.length > 30) {
      setCategoryError("Category name must not exceed 30 characters");
      return;
    }
    setCategoryLoading(true);
    try {
      let resolvedCuisineId: number | undefined =
        showCuisinePicker
          ? resolveCuisineIdFromPicker(categoryCuisineInput, categoryForm.cuisine_id)
          : undefined;
      if (showCuisinePicker && !resolvedCuisineId && categoryCuisineInput.trim()) {
        // Last resort: resolve / link via API (custom_name + master prefix match).
        const createCuisineRes = await fetch(`/api/merchant/stores/${storeId}/menu/cuisines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: categoryCuisineInput.trim() }),
        });
        const created = await createCuisineRes.json().catch(() => ({}));
        if (!createCuisineRes.ok || created?.success === false || !created?.id) {
          throw new Error(
            (typeof created?.message === "string" && created.message) ||
              (typeof created?.error === "string" && created.error) ||
              "Pick a cuisine from the list linked to this store"
          );
        }
        resolvedCuisineId = Number(created.id);
        await loadStoreCuisines();
      }
      if (showCuisinePicker && categoryUiConfig?.cuisine_field.required_for_root && !resolvedCuisineId) {
        setCategoryError("Select a cuisine from the list");
        return;
      }

      const payload: Record<string, unknown> = {
        category_name: name,
        category_description: (categoryForm.category_description ?? "").trim() || null,
        parent_category_id: parentCategoryIdInForm ?? null,
        display_order: Number(categoryForm.display_order) || 0,
        is_active: Boolean(categoryForm.is_active),
      };
      if (showCuisinePicker && resolvedCuisineId) {
        payload.cuisine_id = resolvedCuisineId;
      }
      const isEdit = categoryModalMode === "edit" && editingCategoryId != null;
      const url = isEdit
        ? `/api/merchant/stores/${storeId}/menu/categories/${editingCategoryId}`
        : `/api/merchant/stores/${storeId}/menu/categories`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r?.success === false) {
        const msg =
          typeof r?.message === "string" && r.message.trim()
            ? r.message
            : typeof r?.error === "string"
              ? r.error
              : "Save failed";
        throw new Error(msg);
      }
      toast(isEdit ? "Category updated." : "Category created.");
      trackAudit({
        actionType: isEdit ? "UPDATE" : "CREATE",
        resourceType: "merchant_menu_categories",
        resourceId: isEdit ? String(editingCategoryId) : String(r?.id ?? ""),
        actionDetails: { action: isEdit ? "update_category" : "create_category", payload },
        actionStatus: "SUCCESS",
        requestMethod: method,
      });
      await refreshMenu();
      setShowCategoryModal(false);
      setCategoryForm({ category_name: "", is_active: true });
      setCategoryCuisineInput("");
      setEditingCategoryId(null);
      setParentCategoryIdInForm(null);
      setShowManageCategoriesModal(false);
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : "Error saving category");
      trackAudit({
        actionType: categoryModalMode === "edit" ? "UPDATE" : "CREATE",
        resourceType: "merchant_menu_categories",
        resourceId: editingCategoryId != null ? String(editingCategoryId) : undefined,
        actionDetails: { action: "save_category" },
        actionStatus: "FAILED",
        errorMessage: "Error saving category",
        requestMethod: categoryModalMode === "edit" ? "PUT" : "POST",
      });
    }
    setCategoryLoading(false);
  };

  const handleDeleteCategory = async () => {
    if (deleteCategoryId == null) return;
    setCategoryDeleteError(null);
    setIsDeletingCategory(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/categories/${deleteCategoryId}`, { method: "DELETE" });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r?.success === false) {
        if (r?.error === "category_has_items" && typeof r?.itemCount === "number") {
          setCategoryDeleteError(`Cannot delete: ${r.itemCount} item(s) are in this category. Move or remove them first.`);
        } else if (r?.error === "category_has_subcategories" && typeof r?.subcategoryCount === "number") {
          setCategoryDeleteError(
            `Cannot delete: this category has ${r.subcategoryCount} subcategory(ies). Remove or reassign them first.`
          );
        } else {
          setCategoryDeleteError(
            typeof r?.message === "string" && r.message.trim() ? r.message : String(r?.error ?? "Delete failed")
          );
        }
        return;
      }
      toast("Category removed.");
      trackAudit({
        actionType: "DELETE",
        resourceType: "merchant_menu_categories",
        resourceId: String(deleteCategoryId),
        actionDetails: { action: "delete_category" },
        actionStatus: "SUCCESS",
        requestMethod: "DELETE",
      });
      await refreshMenu();
      setShowDeleteCategoryModal(false);
      setDeleteCategoryId(null);
      setMoveItemsToCategoryId(null);
      setShowManageCategoriesModal(false);
    } catch {
      setCategoryDeleteError("Error deleting category");
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const closeDeleteCategoryModal = () => {
    setIsDeletingCategory(false);
    setIsMovingCategoryItems(false);
    setShowDeleteCategoryModal(false);
    setDeleteCategoryId(null);
    setCategoryDeleteError(null);
    setMoveItemsToCategoryId(null);
  };

  const handleMoveCategoryItemsThenDelete = async () => {
    if (deleteCategoryId == null || moveItemsToCategoryId == null) return;
    setCategoryDeleteError(null);
    setIsMovingCategoryItems(true);
    try {
      const moveRes = await fetch(`/api/merchant/stores/${storeId}/menu/categories/${deleteCategoryId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move_items", targetCategoryId: moveItemsToCategoryId }),
      });
      const moveJson = await moveRes.json().catch(() => ({}));
      if (!moveRes.ok || moveJson?.success === false) {
        setCategoryDeleteError(
          typeof moveJson?.message === "string" && moveJson.message.trim()
            ? moveJson.message
            : String(moveJson?.error ?? "Could not move items")
        );
        return;
      }
      const delRes = await fetch(`/api/merchant/stores/${storeId}/menu/categories/${deleteCategoryId}`, {
        method: "DELETE",
      });
      const delJson = await delRes.json().catch(() => ({}));
      if (!delRes.ok || delJson?.success === false) {
        setCategoryDeleteError(
          typeof delJson?.message === "string" && delJson.message.trim()
            ? delJson.message
            : "Items moved, but the empty category could not be deleted. Try Delete again."
        );
        await refreshMenu();
        return;
      }
      toast("Items moved and category removed.");
      await refreshMenu();
      setShowDeleteCategoryModal(false);
      setDeleteCategoryId(null);
      setMoveItemsToCategoryId(null);
      setShowManageCategoriesModal(false);
    } catch {
      setCategoryDeleteError("Error moving items");
    } finally {
      setIsMovingCategoryItems(false);
    }
  };

  async function handleCustOptionStockToggle(
    item: MenuItem,
    targetType: "variant" | "addon" | "modifier_option",
    optionId: number,
    inStock: boolean
  ) {
    const busyKey = `${targetType}-${optionId}`;
    setCustStockBusy(busyKey);
    try {
      const url =
        targetType === "variant"
          ? `/api/merchant/stores/${storeId}/menu/variants/${optionId}`
          : targetType === "addon"
            ? `/api/merchant/stores/${storeId}/menu/customization-options/${optionId}`
            : `/api/merchant/stores/${storeId}/menu/modifier-options/${optionId}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ in_stock: inStock }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || "Failed to update stock");
      }
      patchMenuItemInCache(item.id, {
        ...(targetType === "variant"
          ? {
              variants: (item.variants ?? []).map((v) =>
                v.id === optionId ? { ...v, in_stock: inStock } : v
              ),
            }
          : targetType === "addon"
            ? {
                customizations: (item.customizations ?? []).map((g) => ({
                  ...g,
                  addons: (g.addons ?? []).map((a) =>
                    a.id === optionId ? { ...a, in_stock: inStock } : a
                  ),
                })),
              }
            : {
                linked_modifier_groups: (item.linked_modifier_groups ?? []).map((g) => ({
                  ...g,
                  options: (g.options ?? []).map((o) =>
                    o.id === optionId ? { ...o, in_stock: inStock } : o
                  ),
                })),
              }),
      });
      toast(inStock ? "Marked in stock" : "Marked out of stock");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update stock");
    } finally {
      setCustStockBusy(null);
    }
  }

  return (
    <div className="menu-page-root flex h-full min-h-0 flex-col bg-white">
      <style>{MENU_PAGE_GLOBAL_STYLES}</style>
      <header className="sticky top-0 z-40 shrink-0 border-b border-gray-200 bg-white shadow-sm">
        <div className="px-3 sm:px-4 lg:px-6 flex items-center gap-2 justify-between flex-nowrap py-2">
          <div className="flex items-center gap-1.5 min-w-0 shrink overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1.5 flex-nowrap">
              <div className={menuStatCard}>
                <div className="text-gray-500 text-[10px] font-medium leading-tight whitespace-nowrap">
                  Total Items
                  {planLimits != null && (
                    <span className="text-gray-400">
                      / {(planLimits as { maxMenuItems?: number })?.maxMenuItems ?? "—"}
                    </span>
                  )}
                </div>
                <div className="text-base font-bold text-gray-900 leading-tight">{menuItems.length}</div>
              </div>
              <div className={menuStatCard}>
                <div className="text-gray-500 text-[10px] font-medium leading-tight whitespace-nowrap">In Stock</div>
                <div className="text-base font-bold text-green-600 leading-tight">{inStock}</div>
              </div>
              <div className={menuStatCard}>
                <div className="text-gray-500 text-[10px] font-medium leading-tight whitespace-nowrap">Out of Stock</div>
                <div className="text-base font-bold text-red-600 leading-tight">
                  {outStock} ({outStockPercent}%)
                </div>
              </div>
              <div className={menuStatCard}>
                <div className="text-gray-500 text-[10px] font-medium leading-tight whitespace-nowrap">
                  Categories
                  {planLimits != null && (
                    <span className="text-gray-400">
                      / {(planLimits as { maxMenuCategories?: number })?.maxMenuCategories ?? "—"}
                    </span>
                  )}
                </div>
                <div className="text-base font-bold text-blue-600 leading-tight">{categories.length}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end min-w-0">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setContentScope("item")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors ${
                  contentScope === "item" ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                aria-pressed={contentScope === "item"}
              >
                <Package size={16} />
                Item
              </button>
              <button
                type="button"
                onClick={() => setContentScope("cust")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors border-l border-gray-200 ${
                  contentScope === "cust" ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                aria-pressed={contentScope === "cust"}
              >
                <SlidersHorizontal size={16} />
                Cust
              </button>
            </div>
            {contentScope === "item" ? (
            <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors ${
                  viewMode === "card" ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                aria-pressed={viewMode === "card"}
              >
                <LayoutGrid size={16} />
                Card
              </button>
              <button
                type="button"
                onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors border-l border-gray-200 ${
                  viewMode === "tree" ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                aria-pressed={viewMode === "tree"}
              >
                <ListTree size={16} />
                Tree
              </button>
            </div>
            ) : null}
            {!menuReadOnly ? (
            <button
              type="button"
              onClick={() => setShowManageCategoriesModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              <Layers size={16} />
              Manage categories
            </button>
            ) : null}
            {!menuReadOnly ? (
            <button
              onClick={() => openAddItemModal()}
              disabled={!canAddItem}
              className="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Add Menu Item
              {planLimits != null && (
                <span className="text-xs opacity-90">({menuItems.length}/{(planLimits as { maxMenuItems?: number })?.maxMenuItems ?? "—"})</span>
              )}
            </button>
            ) : null}
            {!menuReadOnly ? (
            <button
              type="button"
              onClick={() => setShowMenuFileSection(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-amber-600 text-amber-700 bg-white hover:bg-amber-50 transition-colors"
            >
              <Upload size={16} />
              Menu file
            </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-4 lg:px-6 py-3">
          <div className="flex-1 max-w-sm min-w-0 order-2 sm:order-1">
            <input
              type="text"
              placeholder="Search menu items..."
              className={menuSearchInput}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-0 order-1 sm:order-2 flex items-center gap-1 overflow-hidden">
            <div className="flex-shrink-0 rounded-md text-xs font-medium whitespace-nowrap bg-orange-500 text-white shadow-sm ring-1 ring-orange-200">
              <select
                className="bg-transparent px-3 py-1.5 outline-none text-white cursor-pointer"
                value={categoryPillMode}
                onChange={(e) => {
                  const v = e.target.value === "sub-category" ? "sub-category" : "category";
                  setCategoryPillMode(v);
                  setSelectedCategoryId(null);
                  setCategoryChipDropdownId(null);
                }}
                aria-label="Category filter mode"
              >
                <option value="category">All Category</option>
                <option value="sub-category">All Sub-Category</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryId(null);
                setCategoryChipDropdownId(null);
              }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                selectedCategoryId === null ? menuCategoryChipActive : menuCategoryChipIdle
              }`}
            >
              {categoryPillMode === "category" ? "All Categories" : "All Sub-Categories"}
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-hidden">
              {categoriesForPills.length > 0 && (
                <button
                  type="button"
                  onClick={() => categoryScrollRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
                  className="flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Previous categories"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <div
                ref={categoryScrollRef}
                className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth touch-pan-x py-0.5"
              >
                <div className="flex items-center gap-1.5 flex-nowrap">
                  {categoriesForPills.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(category.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap max-w-[160px] truncate ${
                        selectedCategoryId === category.id ? menuCategoryChipActive : menuCategoryChipIdle
                      }`}
                      title={
                        categoryPillMode === "sub-category" && category.parent_category_id
                          ? `${categories.find((c) => c.id === category.parent_category_id)?.category_name ?? ""} / ${category.category_name}`
                          : category.category_name
                      }
                    >
                      {categoryPillMode === "sub-category" && category.parent_category_id
                        ? `${categories.find((c) => c.id === category.parent_category_id)?.category_name ?? ""} / ${category.category_name}`
                        : category.category_name}
                    </button>
                  ))}
                </div>
              </div>
              {categoriesForPills.length > 0 && (
                <button
                  type="button"
                  onClick={() => categoryScrollRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
                  className="flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Next categories"
                >
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div ref={menuScrollRef} className="flex-1 min-w-0 overflow-y-auto px-3 sm:px-4 py-3 bg-white">
          {loading ? (
            <MenuItemsGridSkeleton />
          ) : menuRequestFailed ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package size={48} className="text-gray-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-700">Couldn’t load menu items</h3>
              <p className="text-gray-500 mt-2">
                {menuQuery.error instanceof Error ? menuQuery.error.message : "Please try again."}
              </p>
              <button
                type="button"
                onClick={() => void menuQuery.refetch()}
                className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700"
              >
                Retry
              </button>
            </div>
          ) : (contentScope === "item"
              ? searchedItems.length === 0
              : custScopeItems.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package size={48} className="text-gray-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-700">
                {contentScope === "cust"
                  ? "No customization items found"
                  : menuItems.length > 0
                    ? "No items match current filters"
                    : "No menu items found"}
              </h3>
              <p className="text-gray-500 mt-2">
                {contentScope === "cust"
                  ? searchTerm
                    ? "Try a different search term or switch to Item view"
                    : "Items with add-ons or variants will appear here"
                  : menuItems.length > 0
                    ? "Try clearing or changing filters to see items."
                    : searchTerm
                      ? "Try a different search term"
                      : "Add your first menu item to get started"}
              </p>
              {contentScope === "item" && menuItems.length === 0 && categories.length === 0 && !menuReadOnly && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <p className="text-sm text-gray-400">You need to create a category first</p>
                  <button
                    type="button"
                    onClick={() => openAddCategory()}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700"
                  >
                    Add Category
                  </button>
                </div>
              )}
            </div>
          ) : contentScope === "cust" ? (
            <div className="space-y-4">
              {custScopeItems.map((item) => {
                const categoryDisplayLabel = formatCategoryLabel(categories, item.category_id);
                const variants = item.variants ?? [];
                const custGroups = item.customizations ?? [];
                const linkedGroups = item.linked_modifier_groups ?? [];
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                  >
                    <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/80 p-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                        <R2Image
                          key={`${item.id}-${itemCardImageUrl(item) ?? "none"}`}
                          src={itemCardImageUrl(item)}
                          alt={item.item_name}
                          className="h-full w-full object-cover"
                          fallbackSrc={ITEM_PLACEHOLDER_SVG}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-900">{item.item_name}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          {categoryDisplayLabel}
                        </p>
                      </div>
                      <MenuItemPriceRow item={item} className="shrink-0" showBadge={false} />
                    </div>
                    <div className="space-y-3 p-3">
                      {variants.length > 0 ? (
                        <div>
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                            Variants
                          </p>
                          <ul className="space-y-1">
                            {variants.map((v, i) => {
                              const variantInStock = v.in_stock !== false;
                              return (
                              <li
                                key={v.variant_id || i}
                                className="flex items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-2.5 py-1.5 text-sm"
                              >
                                <span className="min-w-0 flex-1 text-gray-800">
                                  {v.variant_name || v.variant_type || "Variant"}
                                  {v.variant_size_value && v.variant_size_unit
                                    ? ` (${v.variant_size_value} ${v.variant_size_unit})`
                                    : ""}
                                </span>
                                <span className="font-semibold tabular-nums text-gray-900 shrink-0">
                                  ₹{v.variant_price ?? 0}
                                </span>
                                {v.id ? (
                                  <MenuItemStockToggle
                                    inStock={variantInStock}
                                    disabled={menuReadOnly || custStockBusy === `variant-${v.id}`}
                                    onToggle={() =>
                                      handleCustOptionStockToggle(item, "variant", v.id!, !variantInStock)
                                    }
                                  />
                                ) : null}
                              </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                      {custGroups.length > 0 ? (
                        <div>
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                            Add-ons / Customizations
                          </p>
                          <div className="space-y-2">
                            {custGroups.map((group, idx) => (
                              <div
                                key={group.customization_id || idx}
                                className="rounded-lg border border-blue-100 bg-blue-50/30 p-2.5"
                              >
                                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {group.customization_title}
                                  </p>
                                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200">
                                    {group.customization_type || "Checkbox"}
                                  </span>
                                </div>
                                <ul className="space-y-1">
                                  {(group.addons ?? []).map((addon, j) => {
                                    const addonInStock = addon.in_stock !== false;
                                    return (
                                    <li
                                      key={addon.addon_id || j}
                                      className="flex items-center justify-between gap-2 rounded border border-white bg-white px-2 py-1 text-sm"
                                    >
                                      <span className="min-w-0 flex-1 text-gray-700">{addon.addon_name}</span>
                                      <span className="font-medium tabular-nums text-gray-900 shrink-0">
                                        ₹{addon.addon_price ?? 0}
                                      </span>
                                      {addon.id ? (
                                        <MenuItemStockToggle
                                          inStock={addonInStock}
                                          disabled={menuReadOnly || custStockBusy === `addon-${addon.id}`}
                                          onToggle={() =>
                                            handleCustOptionStockToggle(item, "addon", addon.id!, !addonInStock)
                                          }
                                        />
                                      ) : null}
                                    </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {linkedGroups.length > 0 ? (
                        <div>
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                            Linked Add-on Groups
                          </p>
                          <div className="space-y-2">
                            {linkedGroups.map((group) => (
                              <div
                                key={group.id}
                                className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-2.5"
                              >
                                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-gray-900">{group.title}</p>
                                  {group.is_required ? (
                                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-100">
                                      Required
                                    </span>
                                  ) : null}
                                </div>
                                <ul className="space-y-1">
                                  {(group.options ?? []).map((opt) => {
                                    const optInStock = opt.in_stock !== false;
                                    return (
                                    <li
                                      key={opt.id}
                                      className="flex items-center justify-between gap-2 rounded border border-white bg-white px-2 py-1 text-sm"
                                    >
                                      <span className="min-w-0 flex-1 text-gray-700">{opt.name}</span>
                                      {opt.price_delta !== "0" && opt.price_delta ? (
                                        <span className="font-medium tabular-nums text-gray-900 shrink-0">
                                          +₹{opt.price_delta}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-gray-400 shrink-0">Included</span>
                                      )}
                                      <MenuItemStockToggle
                                        inStock={optInStock}
                                        disabled={menuReadOnly || custStockBusy === `modifier_option-${opt.id}`}
                                        onToggle={() =>
                                          handleCustOptionStockToggle(
                                            item,
                                            "modifier_option",
                                            opt.id,
                                            !optInStock
                                          )
                                        }
                                      />
                                    </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {variants.length === 0 &&
                      custGroups.length === 0 &&
                      linkedGroups.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          Customization flags set — open item to view full details.
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === "card" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchedItems.map((item) => {
                const categoryDisplayLabel = formatCategoryLabel(categories, item.category_id);
                const linkedGroupsCount = (item.linked_modifier_groups?.length ?? 0) || 0;
                const linkedOptionsCount =
                  item.linked_modifier_groups?.reduce((sum, g) => sum + (g.options?.length ?? 0), 0) ?? 0;
                const inlineAddonsCount =
                  (item.customizations ?? []).reduce((sum, c) => sum + (c.addons?.length ?? 0), 0) || 0;
                const hasAddons =
                  linkedGroupsCount > 0 ||
                  (item.has_addons ?? false) ||
                  linkedOptionsCount > 0 ||
                  inlineAddonsCount > 0;
                return (
                  <div
                    key={item.id}
                    className={menuItemCard}
                  >
                    <div className="flex p-2.5 h-full gap-2.5">
                      <div className="w-14 h-14 flex-shrink-0 rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                        <R2Image
                          key={`${item.id}-${itemCardImageUrl(item) ?? "none"}`}
                          src={itemCardImageUrl(item)}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                          fallbackSrc={ITEM_PLACEHOLDER_SVG}
                        />
                      </div>
                      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <div className="flex items-start justify-between gap-1 mb-0.5">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-gray-900 truncate">{item.item_name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide truncate" title={categoryDisplayLabel}>
                              {categoryDisplayLabel}
                            </div>
                            {(() => {
                              const oosLabel = menuOos.itemOosLabel(item);
                              return oosLabel ? (
                                <div className="text-[11px] font-semibold text-red-600 mt-0.5">{oosLabel}</div>
                              ) : (
                                <div className="text-[11px] font-semibold text-green-600 mt-0.5">In stock</div>
                              );
                            })()}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                (item.approval_status ?? "PENDING") === "APPROVED"
                                  ? "bg-green-50 text-green-700 border border-green-200"
                                  : (item.approval_status ?? "PENDING") === "REJECTED"
                                    ? "bg-red-50 text-red-700 border border-red-200"
                                    : "bg-amber-50 text-amber-800 border border-amber-200"
                              }`}
                              title="Approval status"
                            >
                              {(item.approval_status ?? "PENDING") === "APPROVED"
                                ? "Approved"
                                : (item.approval_status ?? "PENDING") === "REJECTED"
                                  ? "Rejected"
                                  : "Pending"}
                            </span>
                            {hasAddons && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openAppliedAddons(item);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
                                title={
                                  linkedGroupsCount > 0
                                    ? `${linkedGroupsCount} addon group${linkedGroupsCount !== 1 ? "s" : ""}`
                                    : "View applied addons"
                                }
                              >
                                <Layers size={12} />
                                Addons
                                {linkedGroupsCount > 0
                                  ? ` · ${linkedGroupsCount}`
                                  : linkedOptionsCount > 0
                                    ? ` · ${linkedOptionsCount}`
                                    : ""}
                              </button>
                            )}
                            {item.has_pending_change_request && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  item.pending_change_request_type === "DELETE"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : item.pending_change_request_type === "UPDATE"
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                }`}
                                title="Pending change request"
                              >
                                {item.pending_change_request_type === "DELETE"
                                  ? "Delete requested"
                                  : item.pending_change_request_type === "UPDATE"
                                    ? "Edit requested"
                                    : "Change requested"}
                              </span>
                            )}
                          </div>
                          </div>
                          {!menuReadOnly ? (
                          <MenuItemStockToggle
                            inStock={menuOos.isItemInStock(item)}
                            disabled={menuOos.oosBusy}
                            onToggle={() => menuOos.handleItemStockToggle(item)}
                          />
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 mb-1">
                          <MenuItemPriceRow item={item} />
                        </div>
                        {item.item_description && (
                          <p className="text-[11px] text-gray-600 line-clamp-2 mb-1.5 flex-grow leading-tight">
                            {item.item_description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {item.is_popular && (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded">
                              Popular
                            </span>
                          )}
                          {item.is_recommended && (
                            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-semibold rounded">
                              Recommended
                            </span>
                          )}
                          {item.has_customizations && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded">
                              Customizable
                            </span>
                          )}
                          {item.has_variants && (
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded">
                              Variants
                            </span>
                          )}
                          {item.food_type && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded">
                              {getFoodTypeLabel(item.food_type)}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-600">
                          {(item.serves_label || item.serves) && (
                            <span>
                              Serves{" "}
                              {item.serves_label
                                ? item.serves_label
                                : item.serves
                                  ? `${item.serves} person${item.serves > 1 ? "s" : ""}`
                                  : ""}
                            </span>
                          )}
                          {item.spice_level && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              {normalizeSpiceLevelForForm(item.spice_level)}
                            </span>
                          )}
                          {item.item_size_value && item.item_size_unit && (
                            <span>
                              • Size {item.item_size_value} {item.item_size_unit}
                            </span>
                          )}
                          {item.preparation_time_minutes != null && (
                            <span>• Prep {item.preparation_time_minutes} min</span>
                          )}
                          {item.packaging_charges != null && Number(item.packaging_charges) > 0 && (
                            <span>• Pkg ₹{Number(item.packaging_charges).toFixed(0)}</span>
                          )}
                          {item.cuisine_type && (
                            <span className="truncate max-w-[120px]">• {item.cuisine_type}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-auto min-w-0">
                          {(item.customizations?.length ?? 0) > 0 || (item.variants?.length ?? 0) > 0 ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewCustModal({ open: true, item });
                                setViewCustModalTab("customizations");
                              }}
                              className="flex-shrink-0 flex items-center justify-center gap-0.5 px-1.5 py-1 bg-gray-100 text-gray-700 font-semibold rounded-md border border-gray-200 hover:bg-orange-50 transition-all text-[10px] whitespace-nowrap"
                              type="button"
                            >
                              Options
                            </button>
                          ) : null}
                          {canReviewApprove && (item.approval_status ?? "PENDING") === "PENDING" && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${item.id}`);
                                  const full = res.ok ? await res.json().catch(() => null) : null;
                                  if (full?.item) {
                                    setReviewItem({ ...item, ...full.item });
                                    setShowReviewDrawer(true);
                                  } else {
                                    setReviewItem(item);
                                    setShowReviewDrawer(true);
                                  }
                                } catch {
                                  setReviewItem(item);
                                  setShowReviewDrawer(true);
                                }
                              }}
                              className="flex-shrink-0 flex items-center justify-center gap-0.5 px-1.5 py-1 bg-gray-100 text-gray-700 font-semibold rounded-md border border-gray-200 hover:bg-gray-200 transition-all text-[10px] whitespace-nowrap"
                            >
                              <span className="truncate">Review</span>
                            </button>
                          )}
                          {!menuReadOnly ? (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(item)}
                                className="min-w-0 flex-1 flex cursor-pointer items-center justify-center gap-0.5 px-1 py-1 bg-blue-50 text-blue-600 font-bold rounded-md border border-blue-200 hover:bg-blue-100 transition-all text-[10px]"
                              >
                                <Edit2 size={10} />
                                <span className="truncate">Edit</span>
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteItemId(item.id);
                                  setShowDeleteModal(true);
                                }}
                                className="min-w-0 flex-1 flex cursor-pointer items-center justify-center gap-0.5 px-1 py-1 bg-red-50 text-red-600 font-bold rounded-md border border-red-200 hover:bg-red-100 transition-all text-[10px]"
                              >
                                <Trash2 size={10} />
                                <span className="truncate">Delete</span>
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {treeGroups.map((group) => {
                const isOpen = openTreeGroups[group.key] ?? true;
                return (
                  <div key={group.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="px-3 py-2.5 flex items-center justify-between gap-3 bg-gray-50">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTreeGroups((prev) => ({ ...prev, [group.key]: !isOpen }))
                        }
                        className="min-w-0 flex items-center gap-2 text-left"
                        aria-expanded={isOpen}
                      >
                        <span className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
                          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </span>
                        <span className="font-semibold text-gray-900 truncate">
                          {group.categoryName}{" "}
                          <span className="text-gray-400 font-medium">({group.items.length})</span>
                        </span>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="divide-y divide-gray-100">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-gray-900 truncate">{item.item_name}</div>
                              {(() => {
                                const oosLabel = menuOos.itemOosLabel(item);
                                return oosLabel ? (
                                  <div className="text-xs font-semibold text-red-600 mt-0.5">{oosLabel}</div>
                                ) : (
                                  <div className="text-xs font-semibold text-green-600 mt-0.5">In stock</div>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                              <MenuItemPriceRow item={item} showBadge={false} />
                              {!menuReadOnly ? (
                              <MenuItemStockToggle
                                inStock={menuOos.isItemInStock(item)}
                                disabled={menuOos.oosBusy}
                                onToggle={() => menuOos.handleItemStockToggle(item)}
                              />
                              ) : null}
                              {canReviewApprove && (item.approval_status ?? "PENDING") === "PENDING" && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const res = await fetch(
                                        `/api/merchant/stores/${storeId}/menu/items/${item.id}`
                                      );
                                      const full = res.ok ? await res.json().catch(() => null) : null;
                                      if (full?.item) {
                                        setReviewItem({ ...item, ...full.item });
                                        setShowReviewDrawer(true);
                                      } else {
                                        setReviewItem(item);
                                        setShowReviewDrawer(true);
                                      }
                                    } catch {
                                      setReviewItem(item);
                                      setShowReviewDrawer(true);
                                    }
                                  }}
                                  className="px-2 py-1 text-[10px] font-semibold rounded-md border border-gray-200 bg-gray-100 hover:bg-gray-200"
                                >
                                  Review
                                </button>
                              )}
                              {!menuReadOnly ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(item)}
                                    className="px-2 py-1 text-[10px] font-bold rounded-md border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteItemId(item.id);
                                      setShowDeleteModal(true);
                                    }}
                                    className="px-2 py-1 text-[10px] font-bold rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showMenuFileSection &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => setShowMenuFileSection(false)}
          >
            <div
              className="w-full max-w-md bg-white shadow-xl border-l border-gray-200 flex flex-col max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3 bg-gradient-to-br from-amber-50/80 to-orange-50/50">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700">
                      <FileText size={18} />
                    </span>
                    Menu file (CSV or image)
                  </h2>
                  <p className="text-xs text-gray-600 mt-1">
                    Please review the store menu and add items accordingly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMenuFileSection(false)}
                  aria-label="Close menu file panel"
                  className="flex-shrink-0 p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                {menuReferenceLoading ? (
                  <p className="text-sm text-gray-500">Loading uploaded menu files...</p>
                ) : menuReferenceError ? (
                  <p className="text-sm text-red-600">{menuReferenceError}</p>
                ) : (
                  <div className="space-y-3">
                    {menuSheetOrPdfFiles.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                        <div className="text-xs font-semibold text-gray-800 mb-2">Menu document(s)</div>
                        <div className="flex flex-wrap gap-2">
                          {menuSheetOrPdfFiles.map((f) => (
                            <a
                              key={`doc-${f.id}`}
                              href={String(f.menu_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                            >
                              View {f.original_file_name || `file #${f.id}`}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {menuImageFiles.length > 0 && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                        <div className="text-xs font-semibold text-gray-800 mb-2">Menu image(s)</div>
                        <div className="flex flex-wrap gap-2">
                          {menuImageFiles.flatMap((file) =>
                            (file.reference_images ?? []).map((img, idx) => (
                              <a
                                key={`img-${file.id}-${img.id}-${idx}`}
                                href={img.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                View {img.file_name || `image ${idx + 1}`}
                              </a>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                    {menuSheetOrPdfFiles.length === 0 && menuImageFiles.length === 0 && (
                      <p className="text-sm text-gray-500">No menu file found for this store yet.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {showReviewDrawer && reviewItem &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setShowReviewDrawer(false);
              setReviewItem(null);
              setPhotoRejectReason("");
            }}
          >
            <div
              className="w-full max-w-lg bg-white shadow-xl border-l border-gray-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">Review item photo</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowReviewDrawer(false);
                    setReviewItem(null);
                    setPhotoRejectReason("");
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
              <div className="p-4 flex-1 overflow-auto space-y-4 text-sm">
                <MenuItemPhotoCustomerPreview
                  item={reviewItem}
                  categoryLabel={formatCategoryLabel(categories, reviewItem.category_id)}
                  storeId={storeId}
                />
                {reviewItem.rejection_reason ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <div className="text-[11px] font-bold text-red-800 uppercase tracking-wide">Previous rejection reason</div>
                    <p className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{reviewItem.rejection_reason}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-semibold">
                    Status: {(reviewItem.approval_status ?? "PENDING").toLowerCase()}
                  </span>
                  {reviewItem.spice_level && (
                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[11px] font-semibold">
                      {normalizeSpiceLevelForForm(reviewItem.spice_level)}
                    </span>
                  )}
                  {reviewItem.has_customizations && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold">
                      Customizable
                    </span>
                  )}
                  {reviewItem.has_variants && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
                      Variants
                    </span>
                  )}
                  {(reviewItem.linked_modifier_groups?.length ?? 0) > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[11px] font-semibold">
                      Addons
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 space-y-0.5">
                  {(reviewItem.serves_label || reviewItem.serves) && (
                    <div>
                      <span className="font-semibold">Serves: </span>
                      {reviewItem.serves_label
                        ? reviewItem.serves_label
                        : reviewItem.serves
                          ? `${reviewItem.serves} person${reviewItem.serves > 1 ? "s" : ""}`
                          : "—"}
                    </div>
                  )}
                  {(reviewItem.item_size_value && reviewItem.item_size_unit) && (
                    <div>
                      <span className="font-semibold">Item size: </span>
                      {reviewItem.item_size_value} {reviewItem.item_size_unit}
                    </div>
                  )}
                  {reviewItem.preparation_time_minutes != null && (
                    <div>
                      <span className="font-semibold">Prep time: </span>
                      {reviewItem.preparation_time_minutes} min
                    </div>
                  )}
                  {reviewItem.packaging_charges != null && Number(reviewItem.packaging_charges) > 0 && (
                    <div>
                      <span className="font-semibold">Packaging: </span>₹{Number(reviewItem.packaging_charges).toFixed(2)}
                    </div>
                  )}
                  {reviewItem.cuisine_type && (
                    <div>
                      <span className="font-semibold">Cuisine: </span>
                      {reviewItem.cuisine_type}
                    </div>
                  )}
                  {reviewItem.allergens && (
                    <div>
                      <span className="font-semibold">Allergens: </span>
                      {Array.isArray(reviewItem.allergens) ? reviewItem.allergens.join(", ") : reviewItem.allergens}
                    </div>
                  )}
                </div>
                {(reviewItem.customizations?.length ?? 0) > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-700 mb-1">Customizations</div>
                    <ul className="text-xs text-gray-600 space-y-0.5">
                      {reviewItem.customizations?.map((c) => (
                        <li key={c.id ?? c.customization_id}>
                          {c.customization_title}{" "}
                          {c.is_required ? <span className="text-[10px] text-red-600">(required)</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(reviewItem.variants?.length ?? 0) > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-700 mb-1">Variants</div>
                    <ul className="text-xs text-gray-600 space-y-0.5">
                      {reviewItem.variants?.map((v) => (
                        <li key={v.id ?? v.variant_id}>
                          {v.variant_name} — ₹{v.variant_price}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(reviewItem.linked_modifier_groups?.length ?? 0) > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-700 mb-1">Linked addon groups</div>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {reviewItem.linked_modifier_groups?.map((g) => (
                        <li key={g.id}>
                          <span className="font-medium">{g.title}</span>
                          {g.is_required && <span className="text-[10px] text-red-600 ml-0.5">(required)</span>}
                          {g.min_selection != null || g.max_selection != null ? (
                            <span className="text-[10px] text-gray-500 ml-0.5">
                              min {g.min_selection ?? 0} / max {g.max_selection ?? "—"}
                            </span>
                          ) : null}
                          {g.options?.length ? (
                            <ul className="mt-0.5 ml-2 text-[11px] text-gray-500">
                              {g.options.slice(0, 8).map((o) => (
                                <li key={o.id}>{o.name} {o.price_delta !== "0" ? `(+₹${o.price_delta})` : ""}</li>
                              ))}
                              {(g.options?.length ?? 0) > 8 && (
                                <li>+{(g.options?.length ?? 0) - 8} more</li>
                              )}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-200 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Rejection reason (required to reject photo)
                  </label>
                  <textarea
                    value={photoRejectReason}
                    onChange={(e) => setPhotoRejectReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. Tags - All components of the dish are not clearly visible in the image"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 resize-y min-h-[72px]"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      "Tags - All components of the dish are not clearly visible in the image",
                      "Image is blurry or low quality",
                      "Dish is not clearly visible",
                      "Image contains watermark or promotional text",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPhotoRejectReason(preset)}
                        className="px-2 py-1 rounded-md border border-gray-200 bg-gray-50 text-[10px] font-medium text-gray-700 hover:bg-gray-100 text-left"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                {canReviewApprove ? (
                <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!reviewItem) return;
                    const reason = photoRejectReason.trim();
                    if (reason.length < 3) {
                      toast("Add a rejection reason (min 3 characters).");
                      return;
                    }
                    setIsReviewActionLoading("REJECT");
                    try {
                      const res = await fetch(
                        `/api/merchant/stores/${storeId}/menu/items/${reviewItem.id}/approval`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ approval_status: "REJECTED", rejection_reason: reason }),
                        }
                      );
                      const r = await res.json().catch(() => ({}));
                      if (!res.ok || r?.success === false) throw new Error(r?.error || "Reject failed");
                      toast("Photo rejected.");
                      trackAudit({
                        actionType: "UPDATE",
                        resourceType: "merchant_menu_items",
                        resourceId: String(reviewItem.id),
                        actionDetails: { action: "reject_item_photo", rejection_reason: reason },
                        actionStatus: "SUCCESS",
                        requestMethod: "PATCH",
                      });
                      await refreshMenu();
                      dispatchMenuReviewQueueRefresh();
                      setShowReviewDrawer(false);
                      setReviewItem(null);
                      setPhotoRejectReason("");
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Reject failed");
                      trackAudit({
                        actionType: "UPDATE",
                        resourceType: "merchant_menu_items",
                        resourceId: reviewItem ? String(reviewItem.id) : undefined,
                        actionDetails: { action: "reject_item_photo" },
                        actionStatus: "FAILED",
                        errorMessage: e instanceof Error ? e.message : "Reject failed",
                        requestMethod: "PATCH",
                      });
                    } finally {
                      setIsReviewActionLoading(null);
                    }
                  }}
                  disabled={isReviewActionLoading !== null}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md border border-red-200 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                >
                  {isReviewActionLoading === "REJECT" ? "Rejecting…" : "Reject photo"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!reviewItem) return;
                    setIsReviewActionLoading("APPROVE");
                    try {
                      const res = await fetch(
                        `/api/merchant/stores/${storeId}/menu/items/${reviewItem.id}/approval`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ approval_status: "APPROVED" }),
                        }
                      );
                      const r = await res.json().catch(() => ({}));
                      if (!res.ok || r?.success === false) throw new Error(r?.error || "Approve failed");
                      toast("Photo approved.");
                      trackAudit({
                        actionType: "UPDATE",
                        resourceType: "merchant_menu_items",
                        resourceId: String(reviewItem.id),
                        actionDetails: { action: "approve_item_photo" },
                        actionStatus: "SUCCESS",
                        requestMethod: "PATCH",
                      });
                      await refreshMenu();
                      dispatchMenuReviewQueueRefresh();
                      setShowReviewDrawer(false);
                      setReviewItem(null);
                      setPhotoRejectReason("");
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Approve failed");
                      trackAudit({
                        actionType: "UPDATE",
                        resourceType: "merchant_menu_items",
                        resourceId: reviewItem ? String(reviewItem.id) : undefined,
                        actionDetails: { action: "approve_item" },
                        actionStatus: "FAILED",
                        errorMessage: e instanceof Error ? e.message : "Approve failed",
                        requestMethod: "PATCH",
                      });
                    } finally {
                      setIsReviewActionLoading(null);
                    }
                  }}
                  disabled={isReviewActionLoading !== null}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md border border-green-200 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
                >
                  {isReviewActionLoading === "APPROVE" ? "Approving…" : "Approve photo"}
                </button>
                </div>
                ) : (
                  <p className="text-xs font-medium text-gray-500">View only — approve/reject disabled</p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {showAppliedAddonsDrawer &&
        appliedAddonsItem &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9997] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setShowAppliedAddonsDrawer(false);
              setAppliedAddonsItem(null);
              setAppliedAddonsError("");
            }}
          >
            <div
              className="w-full max-w-md bg-white shadow-xl border-l border-gray-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Applied addons</div>
                  <div className="text-sm font-extrabold text-gray-900 truncate">{appliedAddonsItem.item_name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {(appliedAddonsItem.linked_modifier_groups?.length ?? 0)} group
                    {(appliedAddonsItem.linked_modifier_groups?.length ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAppliedAddonsDrawer(false);
                    setAppliedAddonsItem(null);
                    setAppliedAddonsError("");
                  }}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
              <div className="p-4 flex-1 overflow-auto space-y-3 text-sm bg-gradient-to-b from-white to-slate-50/60">
                {appliedAddonsError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {appliedAddonsError}
                  </div>
                ) : (appliedAddonsItem.linked_modifier_groups?.length ?? 0) === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                    No addon groups are linked to this item.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appliedAddonsLoading && (
                      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                        Fetching latest addon options…
                      </div>
                    )}
                    {appliedAddonsItem.linked_modifier_groups?.map((g) => (
                      <div key={g.id} className="rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-3 py-2 bg-white flex items-start justify-between gap-3 border-b border-gray-100">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-gray-900 truncate">{g.title}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                  g.is_required
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-gray-50 text-gray-700 border-gray-200"
                                }`}
                              >
                                {g.is_required ? "Required" : "Optional"}
                              </span>
                              {(g.min_selection != null || g.max_selection != null) && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-700 border border-slate-200">
                                  min {g.min_selection ?? 0} / max {g.max_selection ?? "—"}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-[11px] font-bold text-gray-600">
                              {typeof (g as any).options_count === "number"
                                ? `${Number((g as any).options_count)} option${Number((g as any).options_count) !== 1 ? "s" : ""}`
                                : `${(g.options?.length ?? 0)} option${(g.options?.length ?? 0) !== 1 ? "s" : ""}`}
                            </div>
                            <button
                              type="button"
                              disabled={unlinkingModifierLinkId === g.id}
                              onClick={async () => {
                                setUnlinkingModifierLinkId(g.id);
                                try {
                                  const res = await fetch(
                                    `/api/merchant/stores/${storeId}/menu/items/${appliedAddonsItem.id}/modifier-groups/${g.id}`,
                                    { method: "DELETE" }
                                  );
                                  const j = await res.json().catch(() => ({}));
                                  if (!res.ok || j?.success === false) {
                                    throw new Error(j?.error || "Failed to remove addon group");
                                  }
                                  setAppliedAddonsItem((prev) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      linked_modifier_groups: (prev.linked_modifier_groups ?? []).filter((x) => x.id !== g.id),
                                    };
                                  });
                                  // Also refresh the menu list so badge/count updates.
                                  await refreshMenu();
                                } catch (e) {
                                  setAppliedAddonsError(e instanceof Error ? e.message : "Failed to remove addon group");
                                } finally {
                                  setUnlinkingModifierLinkId(null);
                                }
                              }}
                              className="px-2 py-1 rounded-md text-[11px] font-extrabold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Remove this addon group from item"
                            >
                              {unlinkingModifierLinkId === g.id ? "Removing…" : "Remove"}
                            </button>
                          </div>
                        </div>
                        {(g.options?.length ?? 0) > 0 ? (
                          <ul className="px-3 py-2 text-sm text-gray-800 space-y-1 bg-gray-50/50">
                            {g.options!.map((o) => (
                              <li key={o.id} className="flex items-center justify-between gap-2">
                                <span className="truncate">{o.name}</span>
                                <span className="text-xs font-extrabold text-gray-700 shrink-0 tabular-nums">
                                  {o.price_delta !== "0" ? `+₹${o.price_delta}` : "+₹0"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : appliedAddonsLoading ? (
                          <div className="px-3 py-2 text-sm text-gray-600 bg-gray-50/50">Loading options…</div>
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-600 bg-gray-50/50">No options in this group.</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {showAddModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
          >
            <div onClick={(e) => e.stopPropagation()}>
              <MenuItemForm
                key={addModalKey}
                isEdit={false}
                formData={addForm}
                setFormData={setAddForm}
                imagePreview={imagePreview}
                setImagePreview={setImagePreview}
                onProcessImage={handleProcessImage}
                imageUploadAllowed={imageUploadAllowed}
                imageLimitReached={imageLimitReached}
                imageUsed={imageUsed}
                imageLimit={imageLimit}
                imageSlotsLeft={imageSlotsLeft}
                storeDefaults={storeMenuDefaults}
                storeId={storeId}
                currentItemId={addCreatedItemId != null ? String(addCreatedItemId) : undefined}
                imageValidationError={addImageValidationError}
                imageValidating={addImageValidating}
                onNormalizeMenuItemImage={() => handleNormalizeMenuItemImage(false)}
                onCancel={() => {
                  setShowAddModal(false);
                  setAddCreatedItemId(null);
                  setAddForm(DEFAULT_ITEM_FORM_DATA);
                  setImagePreview("");
                  setAddImageFile(null);
                  setAddImageValidationError("");
                  setAddImageValidating(false);
                  addImagePendingFileRef.current = null;
                }}
                onSaveAndNext={handleAddSaveAndNext}
                onSubmitOptions={addCreatedItemId != null ? handleAddSubmitOptions : undefined}
                onVariantRemoved={handleAddVariantRemoved}
                isSaving={isSaving}
                error={addError}
                title="Add New Menu Item"
                categories={categories}
              />
            </div>
          </div>,
          document.body
        )}

      {showEditModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
          >
            <div onClick={(e) => e.stopPropagation()}>
              <MenuItemForm
                isEdit
                formData={editForm}
                setFormData={setEditForm}
                imagePreview={editImagePreview}
                setImagePreview={setEditImagePreview}
                onProcessImage={handleProcessImage}
                imageUploadAllowed={imageUploadAllowed}
                imageLimitReached={imageLimitReached}
                imageUsed={imageUsed}
                imageLimit={imageLimit}
                imageSlotsLeft={imageSlotsLeft}
                storeDefaults={storeMenuDefaults}
                imageValidationError={editImageValidationError}
                imageValidating={editImageValidating}
                onNormalizeMenuItemImage={() => handleNormalizeMenuItemImage(true)}
                onCancel={() => {
                  editModalItemIdRef.current = null;
                  setShowEditModal(false);
                  setEditImageValidationError("");
                  setEditImageValidating(false);
                  editImagePendingFileRef.current = null;
                }}
                onSubmit={handleSaveEdit}
                onSubmitOptions={handleSaveEditOptions}
                onVariantRemoved={handleEditVariantRemoved}
                isSaving={isSavingEdit}
                error={editError}
                title="Edit Menu Item"
                categories={categories}
                currentItemId={editingId != null ? String(editingId) : ""}
                storeId={storeId}
                onSwitchToAddonLibrary={onSwitchToAddonLibrary}
              />
            </div>
          </div>,
          document.body
        )}

      {viewCustModal.open &&
        viewCustModal.item &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
            onClick={() => setViewCustModal({ open: false, item: null })}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-md mx-2 p-0 border border-gray-100 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-base md:text-lg font-bold text-gray-900 truncate">Options</h2>
                  <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewCustModalTab("customizations")}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                        viewCustModalTab === "customizations" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Addons
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewCustModalTab("variants")}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                        viewCustModalTab === "variants" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Variants
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setViewCustModal({ open: false, item: null })}
                  className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
                  aria-label="Close"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
                {viewCustModalTab === "customizations" ? (
                  (viewCustModal.item.customizations?.length ?? 0) > 0 ? (
                    <div className="space-y-4">
                      {viewCustModal.item.customizations!.map((group: Customization, idx: number) => (
                        <div key={idx} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                          <div className="font-semibold text-gray-800 text-sm">{group.customization_title}</div>
                          <ul className="space-y-1 mt-2">
                            {group.addons?.map((addon, i) => (
                              <li key={i} className="flex justify-between py-1 px-2 bg-white rounded border">
                                <span className="text-sm text-gray-700">{addon.addon_name}</span>
                                <span className="text-sm font-medium text-gray-900">₹{addon.addon_price}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm">No customizations available.</div>
                  )
                ) : (viewCustModal.item.variants?.length ?? 0) > 0 ? (
                  <div className="space-y-3">
                    {viewCustModal.item.variants!.map((v: Variant, i: number) => (
                      <div key={v.variant_id ?? i} className="flex justify-between py-1 px-2 bg-gray-50 rounded border">
                        <span className="text-sm text-gray-700">{v.variant_name}</span>
                        <span className="text-sm font-medium text-gray-900">₹{v.variant_price}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-sm">No variants available.</div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {showDeleteModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/40 backdrop-blur-md">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
              <div className="p-6">
                <div className="text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                    <Trash2 className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Menu Item</h3>
                  <p className="text-gray-600 mb-6">Are you sure you want to delete this item? This action cannot be undone.</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100"
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteItem}
                    className="flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600"
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      <MenuOutOfStockSheet
        modal={menuOos.oosModal}
        sheetShown={menuOos.oosSheetShown}
        busy={menuOos.oosBusy}
        choice={menuOos.oosChoice}
        hours={menuOos.oosHours}
        date={menuOos.oosDate}
        time={menuOos.oosTime}
        onClose={() => menuOos.setOosModal(null)}
        onConfirm={() => void menuOos.confirmOutOfStock()}
        onChoiceChange={menuOos.setOosChoice}
        onHoursChange={menuOos.setOosHours}
        onDateChange={menuOos.setOosDate}
        onTimeChange={menuOos.setOosTime}
        onCustomTouched={() => menuOos.setOosCustomTouched(true)}
      />
      <MenuRestoreStockConfirm
        open={menuOos.restoreConfirm != null}
        busy={menuOos.oosBusy}
        title={menuOos.restoreConfirm?.title ?? ""}
        message={menuOos.restoreConfirm?.message ?? ""}
        onCancel={() => menuOos.setRestoreConfirm(null)}
        onConfirm={() => void menuOos.restoreConfirm?.onConfirm()}
      />

      {showCategoryModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-[34rem] mx-3 max-h-[88vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-bold text-gray-900">
                    {categoryModalMode === "add"
                      ? parentCategoryIdInForm != null
                        ? "Add Subcategory"
                        : "Add New Category"
                      : "Edit Category"}
                  </h2>
                  <button
                    onClick={() => {
                      setShowCategoryModal(false);
                      setCategoryForm({ category_name: "", is_active: true });
                      setEditingCategoryId(null);
                      setParentCategoryIdInForm(null);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    aria-label="Close"
                  >
                    <X size={20} className="text-gray-600" />
                  </button>
                </div>
                <div className="space-y-3">
                  {categoryModalMode === "add" && parentCategoryIdInForm != null && (
                    <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm text-gray-800">
                      <span className="font-medium">Subcategory under </span>
                      {parentCategories.find((p) => p.id === parentCategoryIdInForm)?.category_name ?? "parent"}
                    </div>
                  )}
                  {categoryModalMode === "add" &&
                    parentCategoryIdInForm != null &&
                    categoryUiConfig?.cuisine_field.visible &&
                    (() => {
                      const p = parentCategories.find((x) => x.id === parentCategoryIdInForm);
                      const hasCuisine = p != null && p.cuisine_id != null && !Number.isNaN(Number(p.cuisine_id));
                      return !hasCuisine ? (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                          This parent category has no cuisine set. Add or edit the parent to assign a cuisine before
                          adding subcategories.
                        </div>
                      ) : null;
                    })()}
                  {showCuisinePicker && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cuisine{categoryUiConfig?.cuisine_field.required_for_root ? " *" : ""}
                      </label>
                      <p className="text-[11px] text-gray-500 mb-2">
                        Choose one cuisine for this category from the cuisines linked to your store. Add or remove store
                        cuisines on the store profile — use <span className="italic">Edit cuisine list</span> below when
                        it applies.
                      </p>
                      <select
                        value={
                          categoryForm.cuisine_id != null && !Number.isNaN(Number(categoryForm.cuisine_id))
                            ? String(categoryForm.cuisine_id)
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (!raw) {
                            setCategoryCuisineInput("");
                            setCategoryForm((prev) => ({ ...prev, cuisine_id: undefined }));
                            return;
                          }
                          const id = Number(raw);
                          const opt = cuisineOptions.find((c) => c.id === id);
                          setCategoryCuisineInput(opt?.name ?? "");
                          setCategoryForm((prev) => ({ ...prev, cuisine_id: id }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:border-orange-400 focus:ring-1 focus:ring-orange-100 bg-white"
                        aria-label="Cuisine"
                      >
                        <option value="">
                          {categoryUiConfig?.cuisine_field.required_for_root
                            ? "Select cuisine..."
                            : "None (optional)"}
                        </option>
                        {cuisineOptions.map((c) => (
                          <option key={`cuisine-${c.id}`} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                        {categoryForm.cuisine_id != null &&
                          !cuisineOptions.some((c) => c.id === Number(categoryForm.cuisine_id)) && (
                            <option value={String(categoryForm.cuisine_id)}>
                              {categoryCuisineInput.trim() || `Cuisine #${categoryForm.cuisine_id}`}
                            </option>
                          )}
                      </select>
                      {categoryUiConfig?.cuisine_field.required_for_root && cuisineOptions.length === 0 && (
                        <div className="mt-2 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
                          No cuisines linked to this store yet. Open{" "}
                          <Link
                            href={`/dashboard/merchants/stores/${storeId}/profile`}
                            className="font-semibold underline"
                          >
                            Store profile → Edit cuisine list
                          </Link>{" "}
                          to add cuisines from the master list first.
                        </div>
                      )}
                      {cuisineChipLabel != null && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-gray-500">Selected for this category:</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-xs text-gray-900">
                            {cuisineChipLabel}
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-800 font-bold"
                              title="Remove selected cuisine"
                              onClick={() => {
                                setCategoryCuisineInput("");
                                setCategoryForm((f) => ({
                                  ...f,
                                  cuisine_id: undefined,
                                }));
                              }}
                            >
                              ×
                            </button>
                          </span>
                        </div>
                      )}
                      {!categoryUiConfig?.cuisine_field.required_for_root &&
                        categoryForm.cuisine_id == null &&
                        cuisineOptions.length > 0 && (
                          <p className="mt-2 text-[11px] text-gray-600">
                            Optional — leave empty if not needed, or{" "}
                            <Link
                              href={`/dashboard/merchants/stores/${storeId}/profile`}
                              className="font-semibold text-orange-600 hover:text-orange-700 underline"
                            >
                              edit cuisine list
                            </Link>{" "}
                            to change which cuisines are available for this store.
                          </p>
                        )}
                      {!categoryUiConfig?.cuisine_field.required_for_root &&
                        categoryForm.cuisine_id == null &&
                        cuisineOptions.length === 0 && (
                          <p className="mt-2 text-[11px] text-gray-600">
                            <Link
                              href={`/dashboard/merchants/stores/${storeId}/profile`}
                              className="font-semibold text-orange-600 hover:text-orange-700 underline"
                            >
                              Edit cuisine list
                            </Link>{" "}
                            on the store profile to link cuisines from the master list first.
                          </p>
                        )}
                      <p className="mt-2 text-xs text-gray-500">
                        Subcategories inherit cuisine from their parent; only top-level categories pick a cuisine here.
                      </p>
                    </div>
                  )}
                  {categoryModalMode === "edit" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Parent category (optional)</label>
                      <select
                        value={parentCategoryIdInForm ?? ""}
                        onChange={(e) => setParentCategoryIdInForm(e.target.value === "" ? null : Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                      >
                        <option value="">None (top-level)</option>
                        {parentCategories.filter((p) => p.id !== editingCategoryId).map((p) => (
                          <option key={p.id} value={p.id}>{p.category_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {useSubcategoryPeerSuggestions
                        ? "Subcategory name * (max 30 characters)"
                        : "Category name * (max 30 characters)"}
                    </label>
                    <input
                      type="text"
                      maxLength={30}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                      value={categoryForm.category_name ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.slice(0, 30);
                        setCategoryForm({ ...categoryForm, category_name: v });
                        setCategorySuggestionsOpen(true);
                      }}
                      onFocus={() => setCategorySuggestionsOpen(true)}
                      onBlur={() => setTimeout(() => setCategorySuggestionsOpen(false), 180)}
                      placeholder={
                        useSubcategoryPeerSuggestions
                          ? "Start typing — subcategory names from other stores"
                          : "Start typing — category names from other stores"
                      }
                    />
                    {(categoryForm.category_name?.length ?? 0) > 0 && (
                      <span className="absolute right-3 top-9 text-xs text-gray-400">
                        {categoryForm.category_name?.length ?? 0}/30
                      </span>
                    )}
                    {categorySuggestionsOpen && (
                      <div className="absolute z-10 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                        {categoryPeerSuggestionsLoading ? (
                          <p className="px-3 py-2 text-sm text-gray-500">
                            {useSubcategoryPeerSuggestions
                              ? "Loading subcategory suggestions from other stores…"
                              : "Loading suggestions from other stores…"}
                          </p>
                        ) : (
                          (() => {
                            const q = (categoryForm.category_name ?? "").trim();
                            const qLower = q.toLowerCase();
                            const matched = categoryPeerSuggestions.filter(
                              (s) => !categoryNameConflictSet.has(String(s).toLowerCase().trim())
                            );
                            const exactInList =
                              qLower.length > 0 &&
                              matched.some((s) => s.toLowerCase().trim() === qLower);
                            const duplicateOnStore =
                              qLower.length > 0 && categoryNameConflictSet.has(qLower);
                            return (
                              <>
                                {matched.length > 0 ? (
                                  matched.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-orange-50"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setCategoryForm({ ...categoryForm, category_name: s.slice(0, 30) });
                                        setCategorySuggestionsOpen(false);
                                      }}
                                    >
                                      {s}
                                    </button>
                                  ))
                                ) : (
                                  <p className="px-3 py-2 text-sm text-gray-500">
                                    {q.length > 0
                                      ? "No matching names from other stores yet. You can still use your own name."
                                      : useSubcategoryPeerSuggestions
                                        ? "Popular subcategory names from other stores."
                                        : "Popular category names from other stores on the platform."}
                                  </p>
                                )}
                                {q.length > 0 && !exactInList && !duplicateOnStore && (
                                  <div className="border-t border-gray-100 mt-1 pt-1">
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm text-orange-600 font-medium hover:bg-orange-50"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setCategorySuggestionsOpen(false);
                                      }}
                                    >
                                      Use &quot;{categoryForm.category_name}&quot; as new{" "}
                                      {useSubcategoryPeerSuggestions ? "subcategory" : "category"}
                                    </button>
                                  </div>
                                )}
                                {duplicateOnStore && (
                                  <p className="px-3 py-2 text-xs text-red-600 border-t border-gray-100">
                                    {useSubcategoryPeerSuggestions
                                      ? "This name is already used under this category."
                                      : "This store already has a category with this name."}
                                  </p>
                                )}
                              </>
                            );
                          })()
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                      value={categoryForm.category_description ?? ""}
                      onChange={(e) => setCategoryForm({ ...categoryForm, category_description: e.target.value })}
                      placeholder="Short description"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display order</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                      value={categoryForm.display_order ?? 0}
                      onChange={(e) => setCategoryForm({ ...categoryForm, display_order: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="category-active"
                      checked={categoryForm.is_active}
                      onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })}
                      className="h-4 w-4 text-orange-500 rounded"
                    />
                    <label htmlFor="category-active" className="text-sm text-gray-700">
                      Active
                    </label>
                  </div>
                </div>
                {categoryError && <div className="mt-4 text-red-500 text-sm">{categoryError}</div>}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowCategoryModal(false);
                      setCategoryForm({ category_name: "", is_active: true });
                      setCategoryCuisineInput("");
                      setEditingCategoryId(null);
                      setParentCategoryIdInForm(null);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100"
                    disabled={categoryLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCategory}
                    className="flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-orange-500 hover:bg-orange-600"
                    disabled={categoryLoading}
                  >
                    {categoryLoading ? "Saving..." : categoryModalMode === "add" ? (parentCategoryIdInForm != null ? "Add Subcategory" : "Add Category") : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showManageCategoriesModal && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
            onClick={() => setShowManageCategoriesModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold text-gray-900">Manage categories</h2>
                <button onClick={() => setShowManageCategoriesModal(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              <div className="p-4 flex gap-2 shrink-0">
                <button
                  onClick={() => { setShowManageCategoriesModal(false); openAddCategory(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600"
                >
                  <Plus size={16} />
                  Add category
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-1">
                {parentCategories.length === 0 && (
                  <p className="text-sm text-gray-500">No categories yet. Add one above.</p>
                )}
                {parentCategories.map((parent) => (
                  <div key={parent.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50">
                      <span className="font-medium text-gray-900">{parent.category_name}</span>
                      {!menuReadOnly ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openAddSubcategory(parent)}
                          className="px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded"
                        >
                          Add subcategory
                        </button>
                        <button type="button" onClick={() => openEditCategory(parent)} className="p-1.5 text-gray-500 hover:bg-gray-200 rounded" aria-label="Edit">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => { setDeleteCategoryId(parent.id); setCategoryDeleteError(null); setMoveItemsToCategoryId(null); setIsDeletingCategory(false); setShowDeleteCategoryModal(true); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      ) : null}
                    </div>
                    {(childrenByParentId.get(parent.id) ?? []).map((child) => (
                      <div key={child.id} className="flex items-center justify-between gap-2 px-4 py-2 border-t border-gray-100 bg-white">
                        <span className="text-gray-700">  {child.category_name}</span>
                        {!menuReadOnly ? (
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openEditCategory(child)} className="p-1.5 text-gray-500 hover:bg-gray-200 rounded" aria-label="Edit">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" onClick={() => { setDeleteCategoryId(child.id); setCategoryDeleteError(null); setMoveItemsToCategoryId(null); setIsDeletingCategory(false); setShowDeleteCategoryModal(true); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {showDeleteCategoryModal && deleteCategoryId != null && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete category?</h3>
              {(() => {
                const cat = categories.find((c) => c.id === deleteCategoryId);
                const itemCount = menuItems.filter((item) => Number(item.category_id) === Number(deleteCategoryId)).length;
                const moveTargets = categories.filter((c) => c.id !== deleteCategoryId);
                const categoryBusy = isDeletingCategory || isMovingCategoryItems;
                return (
                  <>
                    <p className="text-sm text-gray-600 mb-4">
                      {cat
                        ? `"${cat.category_name}" will be removed.${itemCount > 0 ? ` ${itemCount} item(s) are in this category — move them first, then delete.` : ""}`
                        : "This category will be removed."}
                    </p>
                    {itemCount > 0 ? (
                      <div className="mb-4 space-y-2">
                        <label className="block text-xs font-semibold text-gray-700" htmlFor="move-category-select">
                          Move items to
                        </label>
                        <select
                          id="move-category-select"
                          value={moveItemsToCategoryId ?? ""}
                          onChange={(e) => setMoveItemsToCategoryId(e.target.value ? Number(e.target.value) : null)}
                          disabled={categoryBusy || moveTargets.length === 0}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white disabled:bg-gray-50"
                        >
                          <option value="">Select a category</option>
                          {moveTargets.map((c) => (
                            <option key={c.id} value={c.id}>
                              {formatCategoryLabel(categories, c.id)}
                            </option>
                          ))}
                        </select>
                        {moveTargets.length === 0 ? (
                          <p className="text-xs text-gray-500">Create another category first, then move these items.</p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleMoveCategoryItemsThenDelete()}
                          disabled={categoryBusy || moveItemsToCategoryId == null}
                          className="w-full px-4 py-2 rounded-lg font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
                        >
                          {isMovingCategoryItems ? "Moving..." : "Move items & delete"}
                        </button>
                      </div>
                    ) : null}
                    {categoryDeleteError && <p className="text-sm text-red-600 mb-4">{categoryDeleteError}</p>}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={closeDeleteCategoryModal}
                        className="flex-1 px-4 py-2 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCategory()}
                        className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                        disabled={categoryBusy || itemCount > 0}
                      >
                        {isDeletingCategory ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
