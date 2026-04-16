"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useStoreMenuQuery } from "@/hooks/queries/useMerchantStoreQueries";
import { queryKeys } from "@/lib/queryKeys";
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
  FileText,
  Layers,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { R2Image } from "@/components/ui/R2Image";
import { MenuItemsGridSkeleton } from "@/components/ui/MenuItemsGridSkeleton";
import { MenuItemForm, type ItemFormData } from "./MenuItemForm";
import {
  ITEM_PLACEHOLDER_SVG,
  normalizeFoodTypeForForm,
  normalizeSpiceLevelForForm,
  getFoodTypeLabel,
  type MenuItem,
  type MenuCategory,
  type Customization,
  type Variant,
} from "./menu-types";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import Link from "next/link";
import { normalizeMenuItemImageFile, validateMenuItemImageFile } from "@/lib/menuItemImageValidationClient";
import { ensureStoreCuisinesLinkedForItemNames } from "@/lib/merchant/ensureStoreCuisinesForItem";
import type { MenuMediaFile } from "@/lib/merchant-menu-media";

const defaultItemFormData: ItemFormData = {
  item_name: "",
  item_description: "",
  item_image_url: "",
  food_type: "",
  spice_level: "",
  cuisine_type: "",
  base_price: "",
  selling_price: "",
  discount_percentage: "0",
  tax_percentage: "0",
  in_stock: true,
  available_quantity: "",
  low_stock_threshold: "",
  has_customizations: false,
  has_addons: false,
  has_variants: false,
  is_popular: false,
  is_recommended: false,
  preparation_time_minutes: 15,
  packaging_enabled: false,
  packaging_charges: "",
  serves: 1,
  serves_label: "",
  item_size_value: "",
  item_size_unit: "",
  available_for_delivery: true,
  weight_per_serving: "",
  weight_per_serving_unit: "grams",
  calories_kcal: "",
  protein: "",
  protein_unit: "mg",
  carbohydrates: "",
  carbohydrates_unit: "mg",
  fat: "",
  fat_unit: "mg",
  fibre: "",
  fibre_unit: "mg",
  item_tags: "",
  is_active: true,
  allergens: "",
  category_id: null,
  customizations: [],
  variants: [],
};

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
  const parentCategoryIdNum =
    c.parent_category_id == null ? undefined : Number(c.parent_category_id);
  const cuisineIdNum =
    c.cuisine_id == null ? undefined : Number(c.cuisine_id);
  return {
    id: c.id ?? 0,
    store_id: Number(c.store_id) ?? 0,
    category_name: c.category_name ?? c.name ?? "—",
    category_description: c.category_description ?? undefined,
    parent_category_id: Number.isFinite(parentCategoryIdNum as number) ? parentCategoryIdNum : undefined,
    cuisine_id: Number.isFinite(cuisineIdNum as number) ? cuisineIdNum : undefined,
    display_order: c.display_order ?? undefined,
    is_active: c.is_active !== false,
  };
}

function formatCategoryLabel(categories: MenuCategory[], categoryId: number | null | undefined): string {
  if (categoryId == null) return "Uncategorized";
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return "Uncategorized";
  if (cat.parent_category_id) {
    const parent = categories.find((c) => c.id === cat.parent_category_id);
    return parent ? `${parent.category_name} (${cat.category_name})` : cat.category_name;
  }
  return cat.category_name;
}

function normalizeItem(
  item: Record<string, unknown>,
  index: number
): MenuItem {
  const id = (item.id as number) ?? index;
  const itemId = (item.item_id as string) ?? String(id);
  return {
    id,
    item_id: itemId,
    item_name: (item.item_name as string) ?? (item.name as string) ?? "—",
    category_id: (item.category_id as number) ?? null,
    base_price: Number(item.base_price) ?? 0,
    selling_price: Number(item.selling_price) ?? 0,
    discount_percentage: Number(item.discount_percentage) ?? 0,
    tax_percentage: Number(item.tax_percentage) ?? 0,
    in_stock: (item.in_stock as boolean) ?? true,
    has_customizations: (item.has_customizations as boolean) ?? false,
    has_addons: (item.has_addons as boolean) ?? false,
    has_variants: (item.has_variants as boolean) ?? false,
    is_popular: (item.is_popular as boolean) ?? false,
    is_recommended: (item.is_recommended as boolean) ?? false,
    item_image_url: (item.item_image_url as string) ?? undefined,
    item_description: (item.item_description as string) ?? undefined,
    food_type: (item.food_type as string) ?? undefined,
    spice_level: (item.spice_level as string) ?? undefined,
    cuisine_type: (item.cuisine_type as string) ?? undefined,
    is_active: (item.is_active as boolean) ?? true,
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
    has_pending_change_request: Boolean((item as any).has_pending_change_request),
    pending_change_request_type: ((item as any).pending_change_request_type as any) ?? null,
  };
}

export function StoreMenuClient({ storeId, onSwitchToAddonLibrary }: { storeId: string; onSwitchToAddonLibrary?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const menuQuery = useStoreMenuQuery(storeId);
  const data = menuQuery.data ?? null;
  const loading = menuQuery.isLoading;
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
    setAddCreatedItemId(null);
    initialAddVariantsRef.current = [];
    initialAddCustRef.current = [];
    initialAddAddonIdsRef.current = {};
    setAddModalKey((k) => k + 1);
    setAddForm({
      ...defaultItemFormData,
      preparation_time_minutes: storeMenuDefaults.avg_preparation_time_minutes ?? 15,
    });
    setAddError("");
    setImagePreview("");
    setAddImageFile(null);
    setAddImageValidationError("");
    setAddImageValidating(false);
    addImagePendingFileRef.current = null;
    setShowAddModal(true);
  }, [storeMenuDefaults]);
  const refreshMenu = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.menu(storeId) });
    await queryClient.refetchQueries({ queryKey: queryKeys.merchantStore.menu(storeId), type: "active" });
  }, [queryClient, storeId]);
  const patchMenuItemInCache = useCallback(
    (itemId: number, patch: Record<string, unknown>) => {
      queryClient.setQueryData(queryKeys.merchantStore.menu(storeId), (prev: unknown) => {
        if (!prev || typeof prev !== "object") return prev;
        const current = prev as { items?: unknown[] };
        if (!Array.isArray(current.items)) return prev;
        return {
          ...(current as Record<string, unknown>),
          items: current.items.map((row) => {
            const r = row as Record<string, unknown>;
            return Number(r.id) === itemId ? { ...r, ...patch } : row;
          }),
        };
      });
    },
    [queryClient, storeId]
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
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
  const menuFileSectionRef = useRef<HTMLDivElement>(null);
  const [menuReferenceFiles, setMenuReferenceFiles] = useState<MenuMediaFile[]>([]);
  const [menuReferenceLoading, setMenuReferenceLoading] = useState(false);
  const [menuReferenceError, setMenuReferenceError] = useState<string | null>(null);
  const menuReferenceLoadedForStoreRef = useRef<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);

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
  const [parentCategoryIdInForm, setParentCategoryIdInForm] = useState<number | null>(null);
  const [categoryUiConfig, setCategoryUiConfig] = useState<{
    cuisine_field: { visible: boolean; required_for_root: boolean; inherit_on_subcategory: boolean };
    allow_create_custom_cuisine: boolean;
    limits?: { max_cuisines: number | null; current_custom_cuisine_count: number };
  } | null>(null);
  const [cuisineOptions, setCuisineOptions] = useState<
    Array<{ id: number; name: string; is_system_defined: boolean }>
  >([]);

  const [addForm, setAddForm] = useState<ItemFormData>(defaultItemFormData);
  const [editForm, setEditForm] = useState<ItemFormData>(defaultItemFormData);
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
  const [addError, setAddError] = useState("");
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stockToggleItem, setStockToggleItem] = useState<{ id: number; newStatus: boolean } | null>(null);
  const [isTogglingStock, setIsTogglingStock] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [reviewItem, setReviewItem] = useState<MenuItem | null>(null);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);
  const [isReviewActionLoading, setIsReviewActionLoading] = useState<"APPROVE" | "REJECT" | null>(null);
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
  const cuisineChipLabel = selectedCuisineForCategory?.name ?? (categoryCuisineInput.trim() || null);
  const commitTypedCuisineSelection = useCallback(() => {
    const typed = categoryCuisineInput.trim();
    if (!typed) {
      setCategoryForm((prev) => ({ ...prev, cuisine_id: undefined }));
      return;
    }
    const matched = cuisineOptions.find(
      (c) => c.name.trim().toLowerCase() === typed.toLowerCase()
    );
    if (matched) {
      setCategoryCuisineInput(matched.name);
      setCategoryForm((prev) => ({ ...prev, cuisine_id: Number(matched.id) }));
      return;
    }
    setCategoryCuisineInput(typed);
    setCategoryForm((prev) => ({ ...prev, cuisine_id: undefined }));
  }, [categoryCuisineInput, cuisineOptions]);

  const rawCategories = (data && "categories" in data && Array.isArray(data.categories) ? data.categories : []) as Record<string, unknown>[];
  const categories: MenuCategory[] = rawCategories.map((c, i) => {
    const norm = normalizeCategory(c as {
      id?: number;
      store_id?: number;
      name?: string;
      category_name?: string;
      category_description?: string | null;
      parent_category_id?: number | null;
      cuisine_id?: number | null;
      display_order?: number | null;
      is_active?: boolean;
    });
    return { ...norm, id: (norm.id && norm.id > 0) ? norm.id : i + 1 };
  });
  const parentCategories = useMemo(() => categories.filter((c) => !c.parent_category_id).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)), [categories]);
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

  const rawItems = (data && "items" in data && Array.isArray(data.items) ? data.items : []) as Record<string, unknown>[];
  const menuItems: MenuItem[] = rawItems.map((item, i) => normalizeItem(item, i));

  const filteredByCategory =
    selectedCategoryId === null
      ? menuItems
      : menuItems.filter((item) => item.category_id === selectedCategoryId);

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
          const inStockNow = item.in_stock ?? true;
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
          const deleted = Boolean((item as any).is_deleted);
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

  const inStock = menuItems.filter((item) => item.in_stock).length;
  const outStock = menuItems.filter((item) => !item.in_stock).length;
  const outStockPercent = menuItems.length ? Math.round((outStock / menuItems.length) * 100) : 0;

  const planLimits = null;
  const canAddItem = true;
  const canAddCategory = true;
  const imageUploadAllowed = true;
  const imageLimitReached = false;
  const imageUsed = 0;
  const imageLimit: number | null = null;
  const imageSlotsLeft: number | null = null;

  const [editDetailLoading, setEditDetailLoading] = useState(false);
  const initialEditVariantsRef = useRef<number[]>([]);
  const initialEditCustRef = useRef<number[]>([]);
  const initialEditAddonIdsRef = useRef<Record<number, number[]>>({});
  const handleOpenEditModal = async (item: MenuItem) => {
    setEditingId(item.id);
    setEditDetailLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${item.id}`);
      const json = await res.json().catch(() => ({}));
      const full = res.ok && json?.success && json?.item ? json.item : null;
      const data = full ?? item;
      const variants = (data.variants ?? []).map((v: any) => ({
        id: v.id,
        variant_id: v.variant_id ?? "",
        menu_item_id: item.id,
        variant_name: v.variant_name ?? "",
        variant_type: v.variant_type ?? null,
        variant_price: typeof v.variant_price === "string" ? Number(v.variant_price) : (v.variant_price ?? 0),
        in_stock: v.in_stock ?? true,
        display_order: v.display_order ?? 0,
        is_default: v.is_default ?? false,
      }));
      const customizations = (data.customizations ?? []).map((c: any) => ({
        id: c.id,
        customization_id: c.customization_id ?? "",
        menu_item_id: item.id,
        customization_title: c.customization_title ?? "",
        customization_type: c.customization_type ?? "Checkbox",
        is_required: c.is_required ?? false,
        min_selection: c.min_selection ?? 0,
        max_selection: c.max_selection ?? 1,
        display_order: c.display_order ?? 0,
        addons: (c.addons ?? []).map((o: any) => ({
          id: o.id,
          addon_id: o.addon_id ?? "",
          customization_id: c.id,
          addon_name: o.addon_name ?? "",
          addon_price: typeof o.addon_price === "string" ? Number(o.addon_price) : (o.addon_price ?? 0),
          display_order: o.display_order ?? 0,
          in_stock: o.in_stock ?? true,
        })),
      }));
      const allergensString = Array.isArray(data.allergens)
        ? data.allergens.join(", ")
        : typeof data.allergens === "string"
          ? data.allergens
          : "";
      initialEditVariantsRef.current = variants.map((v: any) => v.id).filter((id: number) => Number.isFinite(id));
      initialEditCustRef.current = customizations.map((c: any) => c.id).filter((id: number) => Number.isFinite(id));
      const addonMap: Record<number, number[]> = {};
      customizations.forEach((c: any) => {
        if (c.id && Number.isFinite(c.id))
          addonMap[c.id] = (c.addons ?? []).map((o: any) => o.id).filter((id: number) => Number.isFinite(id));
      });
      initialEditAddonIdsRef.current = addonMap;
      const basePriceNum = data.base_price != null ? Number(data.base_price) : null;
      const sellingPriceNum = data.selling_price != null ? Number(data.selling_price) : null;
      const discountNum = data.discount_percentage != null ? Number(data.discount_percentage) : 0;
      const taxNum = data.tax_percentage != null ? Number(data.tax_percentage) : 0;
      const pkgRaw = (data as { packaging_charges?: unknown }).packaging_charges;
      const pkgNum = pkgRaw != null && pkgRaw !== "" ? Number(pkgRaw) : NaN;
      const packaging_enabled = Number.isFinite(pkgNum) && pkgNum > 0;
      setEditForm({
        ...defaultItemFormData,
        item_name: data.item_name ?? "",
        item_description: data.item_description ?? "",
        item_image_url: data.item_image_url ?? "",
        food_type: normalizeFoodTypeForForm(data.food_type),
        spice_level: normalizeSpiceLevelForForm(data.spice_level),
        cuisine_type: data.cuisine_type ?? "",
        base_price: basePriceNum != null ? basePriceNum.toFixed(2) : "",
        selling_price: sellingPriceNum != null ? sellingPriceNum.toFixed(2) : "",
        discount_percentage: String(discountNum),
        tax_percentage: String(taxNum),
        in_stock: data.in_stock ?? true,
        has_customizations: customizations.length > 0,
        has_addons: customizations.some(
          (c: { addons?: { length?: number }[] }) => (c.addons?.length ?? 0) > 0
        ),
        has_variants: variants.length > 0,
        is_popular: data.is_popular ?? false,
        is_recommended: data.is_recommended ?? false,
        preparation_time_minutes: data.preparation_time_minutes ?? 15,
        packaging_enabled,
        packaging_charges: packaging_enabled ? String(pkgNum) : "",
        serves: data.serves ?? 1,
        serves_label: data.serves_label ?? "",
        item_size_value: data.item_size_value != null ? String(data.item_size_value) : "",
        item_size_unit: data.item_size_unit ?? "",
        available_for_delivery: data.available_for_delivery ?? true,
        weight_per_serving:
          data.weight_per_serving != null ? String(data.weight_per_serving) : "",
        weight_per_serving_unit: data.weight_per_serving_unit ?? "grams",
        calories_kcal:
          data.calories_kcal != null ? String(data.calories_kcal) : "",
        protein: data.protein != null ? String(data.protein) : "",
        protein_unit: data.protein_unit ?? "mg",
        carbohydrates:
          data.carbohydrates != null ? String(data.carbohydrates) : "",
        carbohydrates_unit: data.carbohydrates_unit ?? "mg",
        fat: data.fat != null ? String(data.fat) : "",
        fat_unit: data.fat_unit ?? "mg",
        fibre: data.fibre != null ? String(data.fibre) : "",
        fibre_unit: data.fibre_unit ?? "mg",
        item_tags: Array.isArray(data.item_tags)
          ? data.item_tags.join(", ")
          : typeof data.item_tags === "string"
            ? data.item_tags
            : "",
        is_active: data.is_active ?? true,
        allergens: allergensString,
        category_id: data.category_id ?? null,
        customizations,
        variants,
      });
      setEditImagePreview(data.item_image_url || "");
    } catch {
      setEditError("Failed to load item details.");
      const allergensString = Array.isArray(item.allergens)
        ? item.allergens.join(", ")
        : typeof item.allergens === "string"
          ? item.allergens
          : "";
      const basePriceNum = item.base_price != null ? Number(item.base_price) : null;
      const sellingPriceNum = item.selling_price != null ? Number(item.selling_price) : null;
      const pkgNumFb =
        item.packaging_charges != null ? Number(item.packaging_charges as number) : NaN;
      const packaging_enabled_fb = Number.isFinite(pkgNumFb) && pkgNumFb > 0;
      setEditForm({
        ...defaultItemFormData,
        item_name: item.item_name ?? "",
        item_description: item.item_description ?? "",
        item_image_url: item.item_image_url ?? "",
        food_type: normalizeFoodTypeForForm(item.food_type),
        spice_level: normalizeSpiceLevelForForm(item.spice_level),
        cuisine_type: item.cuisine_type ?? "",
        base_price: basePriceNum != null ? basePriceNum.toFixed(2) : "",
        selling_price: sellingPriceNum != null ? sellingPriceNum.toFixed(2) : "",
        discount_percentage: String(item.discount_percentage ?? "0"),
        tax_percentage: String(item.tax_percentage ?? "0"),
        in_stock: item.in_stock ?? true,
        has_customizations: (item.customizations?.length ?? 0) > 0,
        has_addons: (item.customizations?.some((c) => (c.addons?.length ?? 0) > 0)) ?? false,
        has_variants: (item.variants?.length ?? 0) > 0,
        is_popular: item.is_popular ?? false,
        is_recommended: item.is_recommended ?? false,
        preparation_time_minutes: item.preparation_time_minutes ?? 15,
        packaging_enabled: packaging_enabled_fb,
        packaging_charges: packaging_enabled_fb ? String(pkgNumFb) : "",
        serves: item.serves ?? 1,
        serves_label: item.serves_label ?? "",
        item_size_value: item.item_size_value != null ? String(item.item_size_value) : "",
        item_size_unit: item.item_size_unit ?? "",
        available_for_delivery: (item as { available_for_delivery?: boolean }).available_for_delivery ?? true,
        weight_per_serving:
          (item as { weight_per_serving?: unknown }).weight_per_serving != null
            ? String((item as { weight_per_serving?: unknown }).weight_per_serving)
            : "",
        weight_per_serving_unit:
          (item as { weight_per_serving_unit?: string }).weight_per_serving_unit ?? "grams",
        calories_kcal:
          (item as { calories_kcal?: unknown }).calories_kcal != null
            ? String((item as { calories_kcal?: unknown }).calories_kcal)
            : "",
        protein:
          (item as { protein?: unknown }).protein != null ? String((item as { protein?: unknown }).protein) : "",
        protein_unit: (item as { protein_unit?: string }).protein_unit ?? "mg",
        carbohydrates:
          (item as { carbohydrates?: unknown }).carbohydrates != null
            ? String((item as { carbohydrates?: unknown }).carbohydrates)
            : "",
        carbohydrates_unit: (item as { carbohydrates_unit?: string }).carbohydrates_unit ?? "mg",
        fat: (item as { fat?: unknown }).fat != null ? String((item as { fat?: unknown }).fat) : "",
        fat_unit: (item as { fat_unit?: string }).fat_unit ?? "mg",
        fibre: (item as { fibre?: unknown }).fibre != null ? String((item as { fibre?: unknown }).fibre) : "",
        fibre_unit: (item as { fibre_unit?: string }).fibre_unit ?? "mg",
        item_tags: Array.isArray((item as { item_tags?: unknown }).item_tags)
          ? ((item as { item_tags?: string[] }).item_tags ?? []).join(", ")
          : typeof (item as { item_tags?: unknown }).item_tags === "string"
            ? String((item as { item_tags?: string }).item_tags)
            : "",
        is_active: item.is_active ?? true,
        allergens: allergensString,
        category_id: item.category_id ?? null,
        customizations: item.customizations ?? [],
        variants: item.variants ?? [],
      });
      setEditImagePreview(item.item_image_url || "");
    } finally {
      setEditDetailLoading(false);
    }
    setShowEditModal(true);
  };

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
      const currentVariantIds = (addForm.variants ?? []).map((v) => v.id).filter((id): id is number => id != null && Number.isFinite(id));
      const toDeleteVariants = initialAddVariantsRef.current.filter((id) => !currentVariantIds.includes(id));
      for (const id of toDeleteVariants) {
        const r = await fetch(`${base}/variants/${id}`, { method: "DELETE" });
        if (!r.ok) throw new Error("Failed to delete variant");
      }
      for (const v of addForm.variants ?? []) {
        const payload = {
          variant_name: v.variant_name,
          variant_type: v.variant_type ?? null,
          variant_price: v.variant_price,
          is_default: v.is_default ?? false,
          display_order: v.display_order ?? 0,
        };
        if (v.id && Number.isFinite(v.id)) {
          const r = await fetch(`${base}/variants/${v.id}`, {
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

      const currentCustIds = (addForm.customizations ?? []).map((c) => c.id).filter((id): id is number => id != null && Number.isFinite(id));
      const toDeleteCust = initialAddCustRef.current.filter((id) => !currentCustIds.includes(id));
      for (const id of toDeleteCust) {
        const r = await fetch(`${base}/customization-groups/${id}`, { method: "DELETE" });
        if (!r.ok) throw new Error("Failed to delete customization group");
      }

      const groupIdsInOrder: number[] = [];
      for (const c of addForm.customizations ?? []) {
        const payload = {
          customization_title: c.customization_title,
          customization_type: c.customization_type ?? null,
          is_required: c.is_required,
          min_selection: c.min_selection,
          max_selection: c.max_selection,
          display_order: c.display_order,
        };
        if (c.id && Number.isFinite(c.id)) {
          const r = await fetch(`${base}/customization-groups/${c.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!r.ok) throw new Error("Failed to update customization group");
          groupIdsInOrder.push(c.id);
        } else {
          const r = await fetch(`${base}/items/${itemId}/customization-groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j?.id) throw new Error("Failed to add customization group");
          groupIdsInOrder.push(j.id);
        }
      }

      let custIndex = 0;
      for (const c of addForm.customizations ?? []) {
        const groupId = groupIdsInOrder[custIndex++] ?? 0;
        if (!groupId) continue;
        const initialAddonIds = initialAddAddonIdsRef.current[c.id ?? 0] ?? [];
        const currentAddonIds = (c.addons ?? []).map((o) => o.id).filter((id): id is number => id != null && Number.isFinite(id));
        const toDeleteAddons = initialAddonIds.filter((id) => !currentAddonIds.includes(id));
        for (const id of toDeleteAddons) {
          const r = await fetch(`${base}/customization-options/${id}`, { method: "DELETE" });
          if (!r.ok) throw new Error("Failed to delete addon");
        }
        for (const o of c.addons ?? []) {
          const optPayload = { addon_name: o.addon_name, addon_price: o.addon_price ?? 0, display_order: o.display_order ?? 0 };
          if (o.id && Number.isFinite(o.id)) {
            const r = await fetch(`${base}/customization-options/${o.id}`, {
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
      setAddForm(defaultItemFormData);
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
    if (!editForm.item_name.trim()) return setEditError("Name is required");
    if (!editForm.category_id) return setEditError("Category is required");
    if (editImageValidationError) {
      return setEditError("Fix the image issue in the upload area or use Auto-fix.");
    }
    setIsSavingEdit(true);
    try {
      const packagingPayload = (() => {
        if (!editForm.packaging_enabled) return null;
        const n = Number(String(editForm.packaging_charges ?? "").replace(/,/g, ""));
        return Number.isFinite(n) && n >= 0 ? n : null;
      })();
      const payload = {
        item_name: editForm.item_name.trim(),
        item_description: editForm.item_description?.trim() || null,
        category_id: editForm.category_id,
        food_type: editForm.food_type || null,
        spice_level: editForm.spice_level || null,
        cuisine_type: editForm.cuisine_type || null,
        base_price: editForm.base_price ? Number(editForm.base_price) : 0,
        selling_price: editForm.selling_price ? Number(editForm.selling_price) : (editForm.base_price ? Number(editForm.base_price) : 0),
        discount_percentage: 0,
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
      let uploadedImageUrl: string | null = null;
      if (editImageFile) {
        const fd = new FormData();
        fd.append("file", editImageFile);
        const imgRes = await fetch(`/api/merchant/stores/${storeId}/menu/items/${editingId}/images`, {
          method: "POST",
          body: fd,
        });
        const img = await imgRes.json().catch(() => ({}));
        if (!imgRes.ok || img?.success === false) throw new Error(img?.error || "Image upload failed");
        uploadedImageUrl = String(img.image_url ?? "");
        setEditImagePreview(uploadedImageUrl || editImagePreview);
        setEditImageFile(null);
        trackAudit({
          actionType: "UPDATE",
          resourceType: "merchant_menu_item_images",
          resourceId: String(img?.id ?? ""),
          actionDetails: { action: "upload_item_image", menu_item_id: editingId },
          actionStatus: "SUCCESS",
          requestMethod: "POST",
        });
      }
      patchMenuItemInCache(editingId, {
        item_name: payload.item_name,
        item_description: payload.item_description,
        category_id: payload.category_id,
        food_type: payload.food_type,
        spice_level: payload.spice_level,
        cuisine_type: payload.cuisine_type,
        base_price: payload.base_price,
        selling_price: payload.selling_price,
        discount_percentage: payload.discount_percentage,
        in_stock: payload.in_stock,
        is_active: payload.is_active,
        is_popular: payload.is_popular,
        is_recommended: payload.is_recommended,
        preparation_time_minutes: payload.preparation_time_minutes,
        packaging_charges: payload.packaging_charges,
        serves: payload.serves,
        serves_label: payload.serves_label,
        item_size_value: payload.item_size_value,
        item_size_unit: payload.item_size_unit,
        available_for_delivery: payload.available_for_delivery,
        weight_per_serving: payload.weight_per_serving,
        weight_per_serving_unit: payload.weight_per_serving_unit,
        calories_kcal: payload.calories_kcal,
        protein: payload.protein,
        protein_unit: payload.protein_unit,
        carbohydrates: payload.carbohydrates,
        carbohydrates_unit: payload.carbohydrates_unit,
        fat: payload.fat,
        fat_unit: payload.fat_unit,
        fibre: payload.fibre,
        fibre_unit: payload.fibre_unit,
        item_tags: payload.item_tags,
        ...(uploadedImageUrl ? { item_image_url: uploadedImageUrl } : {}),
      });
      toast("Menu item updated.");
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
      setShowEditModal(false);
    } catch {
      setEditError("Error updating item.");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: editingId != null ? String(editingId) : undefined,
        actionDetails: { action: "update_item" },
        actionStatus: "FAILED",
        errorMessage: "Error updating item.",
        requestMethod: "PUT",
      });
    }
    setIsSavingEdit(false);
  };

  const handleSaveEditOptions = async () => {
    if (editingId == null) return;
    setEditError("");
    setIsSavingEdit(true);
    try {
      const base = `/api/merchant/stores/${storeId}/menu`;
      const currentVariantIds = (editForm.variants ?? []).map((v) => v.id).filter((id): id is number => id != null && Number.isFinite(id));
      const toDeleteVariants = initialEditVariantsRef.current.filter((id) => !currentVariantIds.includes(id));
      for (const id of toDeleteVariants) {
        const r = await fetch(`${base}/variants/${id}`, { method: "DELETE" });
        if (!r.ok) throw new Error("Failed to delete variant");
      }
      for (const v of editForm.variants ?? []) {
        const payload = { variant_name: v.variant_name, variant_type: v.variant_type ?? null, variant_price: v.variant_price, is_default: v.is_default ?? false, display_order: v.display_order ?? 0 };
        if (v.id && Number.isFinite(v.id)) {
          const r = await fetch(`${base}/variants/${v.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!r.ok) throw new Error("Failed to update variant");
        } else {
          const r = await fetch(`${base}/items/${editingId}/variants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!r.ok) throw new Error("Failed to add variant");
        }
      }

      const currentCustIds = (editForm.customizations ?? []).map((c) => c.id).filter((id): id is number => id != null && Number.isFinite(id));
      const toDeleteCust = initialEditCustRef.current.filter((id) => !currentCustIds.includes(id));
      for (const id of toDeleteCust) {
        const r = await fetch(`${base}/customization-groups/${id}`, { method: "DELETE" });
        if (!r.ok) throw new Error("Failed to delete customization group");
      }

      const groupIdsInOrder: number[] = [];
      for (const c of editForm.customizations ?? []) {
        const payload = { customization_title: c.customization_title, customization_type: c.customization_type ?? null, is_required: c.is_required, min_selection: c.min_selection, max_selection: c.max_selection, display_order: c.display_order };
        if (c.id && Number.isFinite(c.id)) {
          const r = await fetch(`${base}/customization-groups/${c.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!r.ok) throw new Error("Failed to update customization group");
          groupIdsInOrder.push(c.id);
        } else {
          const r = await fetch(`${base}/items/${editingId}/customization-groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j?.id) throw new Error("Failed to add customization group");
          groupIdsInOrder.push(j.id);
        }
      }

      let custIndex = 0;
      for (const c of editForm.customizations ?? []) {
        const groupId = groupIdsInOrder[custIndex++] ?? 0;
        if (!groupId) continue;
        const initialAddonIds = initialEditAddonIdsRef.current[c.id ?? 0] ?? [];
        const currentAddonIds = (c.addons ?? []).map((o) => o.id).filter((id): id is number => id != null && Number.isFinite(id));
        const toDeleteAddons = initialAddonIds.filter((id) => !currentAddonIds.includes(id));
        for (const id of toDeleteAddons) {
          const r = await fetch(`${base}/customization-options/${id}`, { method: "DELETE" });
          if (!r.ok) throw new Error("Failed to delete addon");
        }
        for (const o of c.addons ?? []) {
          const payload = { addon_name: o.addon_name, addon_price: o.addon_price ?? 0, display_order: o.display_order ?? 0 };
          if (o.id && Number.isFinite(o.id)) {
            const r = await fetch(`${base}/customization-options/${o.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!r.ok) throw new Error("Failed to update addon");
          } else {
            const r = await fetch(`${base}/customization-groups/${groupId}/options`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!r.ok) throw new Error("Failed to add addon");
          }
        }
      }

      await syncItemOptionFlags(editingId, editForm);
      toast("Variants and customizations saved.");
      await refreshMenu();
      setShowEditModal(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save options.");
    }
    setIsSavingEdit(false);
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

  const handleStockToggle = async () => {
    if (!stockToggleItem) return;
    setIsTogglingStock(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${stockToggleItem.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ in_stock: stockToggleItem.newStatus }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r?.success === false) throw new Error(r?.error || "Stock update failed");
      toast(`Item marked as ${stockToggleItem.newStatus ? "In Stock" : "Out of Stock"}.`);
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: String(stockToggleItem.id),
        actionDetails: { action: "toggle_stock", in_stock: stockToggleItem.newStatus },
        actionStatus: "SUCCESS",
        requestMethod: "PATCH",
      });
      await refreshMenu();
      setShowStockModal(false);
      setStockToggleItem(null);
    } catch {
      toast("Error updating stock.");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: stockToggleItem?.id != null ? String(stockToggleItem.id) : undefined,
        actionDetails: { action: "toggle_stock" },
        actionStatus: "FAILED",
        errorMessage: "Error updating stock.",
        requestMethod: "PATCH",
      });
    }
    setIsTogglingStock(false);
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
        showCuisinePicker && categoryForm.cuisine_id != null && !Number.isNaN(Number(categoryForm.cuisine_id))
          ? Number(categoryForm.cuisine_id)
          : undefined;
      const typedCuisineName = categoryCuisineInput.trim();
      if (showCuisinePicker && !resolvedCuisineId && typedCuisineName) {
        const existingByName = cuisineOptions.find(
          (c) => c.name.trim().toLowerCase() === typedCuisineName.toLowerCase()
        );
        if (existingByName) {
          resolvedCuisineId = Number(existingByName.id);
        } else {
          const createCuisineRes = await fetch(`/api/merchant/stores/${storeId}/menu/cuisines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: typedCuisineName }),
          });
          const created = await createCuisineRes.json().catch(() => ({}));
          if (!createCuisineRes.ok || created?.success === false || !created?.id) {
            throw new Error(
              (typeof created?.message === "string" && created.message) ||
                (typeof created?.error === "string" && created.error) ||
                "Failed to add cuisine"
            );
          }
          resolvedCuisineId = Number(created.id);
          await loadStoreCuisines();
        }
      }
      if (showCuisinePicker && categoryUiConfig?.cuisine_field.required_for_root && !resolvedCuisineId) {
        setCategoryError("Select a cuisine or type one to add");
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
      setShowManageCategoriesModal(false);
    } catch {
      setCategoryDeleteError("Error deleting category");
    }
    setIsDeletingCategory(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-20 shrink-0 border-b border-gray-200 bg-white/95 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-1 gap-1">
          <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-gray-900">Menu Management</h1>
              <p className="text-gray-500 text-[11px] mt-0 flex items-center gap-2 flex-wrap">
                <span>Manage your menu items and categories</span>
                {planLimits != null && (
                  <span className="text-gray-400">· Plan: {(planLimits as { planName?: string })?.planName ?? "—"}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setShowManageCategoriesModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs sm:text-sm font-semibold rounded-lg transition-colors bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              <Layers size={16} />
              Manage categories
            </button>
            <button
              onClick={() => openAddItemModal()}
              disabled={!canAddItem}
              className="flex cursor-pointer items-center gap-1.5 px-3 py-1 text-xs sm:text-sm font-semibold rounded-lg transition-colors bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Add Menu Item
              {planLimits != null && (
                <span className="text-xs opacity-90">({menuItems.length}/{(planLimits as { maxMenuItems?: number })?.maxMenuItems ?? "—"})</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMenuFileSection(true);
                setTimeout(() => menuFileSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
              }}
              className="flex items-center gap-1.5 px-3 py-1 text-xs sm:text-sm font-semibold rounded-lg border border-amber-600 text-amber-700 bg-white hover:bg-amber-50 transition-colors"
            >
              <Upload size={16} />
              Menu file
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 px-3 sm:px-4 pb-1">
          <div className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 min-w-[120px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 text-[10px] font-medium">
                Total Items
                {planLimits != null && (
                  <span className="ml-1 text-gray-400">/ {(planLimits as { maxMenuItems?: number })?.maxMenuItems ?? "—"}</span>
                )}
              </span>
              <span className="text-sm font-bold text-gray-900 leading-tight">{menuItems.length}</span>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 min-w-[100px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 text-[10px] font-medium">In Stock</span>
              <span className="text-sm font-bold text-green-600 leading-tight">{inStock}</span>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 min-w-[120px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 text-[10px] font-medium">Out Of Stocks</span>
              <span className="text-sm font-bold text-red-600 leading-tight">
                {outStock} ({outStockPercent}%)
              </span>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 min-w-[120px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 text-[10px] font-medium">
                Categories
                {planLimits != null && (
                  <span className="ml-1 text-gray-400">/ {(planLimits as { maxMenuCategories?: number })?.maxMenuCategories ?? "—"}</span>
                )}
              </span>
              <span className="text-sm font-bold text-blue-600 leading-tight">{categories.length}</span>
            </div>
          </div>
        </div>

        {showMenuFileSection && (
          <div
            ref={menuFileSectionRef}
            className="mx-3 sm:mx-4 mb-2 rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-orange-50/80 shadow-sm overflow-hidden"
          >
            <div className="flex items-start justify-between gap-2 p-2.5 sm:p-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 text-amber-700">
                    <FileText size={16} />
                  </span>
                  Menu file (CSV or image)
                </h3>
                <p className="text-xs text-gray-600 mt-1">
                  Please review the store menu and add item accordingly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMenuFileSection(false)}
                aria-label="Close menu file section"
                className="flex-shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-white/80 border border-transparent hover:border-gray-200 transition-colors"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-0">
              {menuReferenceLoading ? (
                <p className="text-xs text-gray-500">Loading uploaded menu files...</p>
              ) : menuReferenceError ? (
                <p className="text-xs text-red-600">{menuReferenceError}</p>
              ) : (
                <div className="space-y-2">
                  {menuSheetOrPdfFiles.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-white/80 p-2">
                      <div className="text-[11px] font-semibold text-gray-800 mb-1">Menu document(s)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {menuSheetOrPdfFiles.map((f) => (
                          <a
                            key={`doc-${f.id}`}
                            href={String(f.menu_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                          >
                            View {f.original_file_name || `file #${f.id}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {menuImageFiles.length > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-white/80 p-2">
                      <div className="text-[11px] font-semibold text-gray-800 mb-1">Menu image(s)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {menuImageFiles.flatMap((file) =>
                          (file.reference_images ?? []).map((img, idx) => (
                            <a
                              key={`img-${file.id}-${img.id}-${idx}`}
                              href={img.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              View {img.file_name || `image ${idx + 1}`}
                            </a>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  {menuSheetOrPdfFiles.length === 0 && menuImageFiles.length === 0 && (
                    <p className="text-xs text-gray-500">
                      No menu file found for this store yet.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="px-3 sm:px-4 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div className="order-2 sm:order-1">
            <input
              type="text"
              placeholder="Search menu items..."
              className="w-48 sm:w-60 px-2.5 py-1 text-[11px] sm:text-xs border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-gray-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="order-3 sm:order-2 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-gray-600">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2 py-1 text-[11px] sm:text-xs border border-gray-300 rounded-lg bg-white text-gray-900"
                aria-label="Filter by status"
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-gray-600">
              <span>Stock</span>
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as any)}
                className="px-2 py-1 text-[11px] sm:text-xs border border-gray-300 rounded-lg bg-white text-gray-900"
                aria-label="Filter by stock"
              >
                <option value="ALL">All</option>
                <option value="IN_STOCK">In stock</option>
                <option value="OUT_OF_STOCK">Out of stock</option>
              </select>
            </div>
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-gray-600">
              <span>Requests</span>
              <select
                value={changeRequestFilter}
                onChange={(e) => setChangeRequestFilter(e.target.value as any)}
                className="px-2 py-1 text-[11px] sm:text-xs border border-gray-300 rounded-lg bg-white text-gray-900"
                aria-label="Filter by change request"
              >
                <option value="ALL">All</option>
                <option value="UPDATE">Edit</option>
                <option value="DELETE">Delete</option>
              </select>
            </div>
          </div>
          <div className="flex-1 min-w-0 order-1 sm:order-2 flex items-center gap-1 overflow-x-hidden overflow-y-visible">
            <button
              onClick={() => {
                setSelectedCategoryId(null);
                setCategoryChipDropdownId(null);
              }}
              className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap ${
                selectedCategoryId === null ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
              }`}
            >
              All Categories
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-hidden overflow-y-visible">
              {categories.length > 0 && (
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
                  className="flex-1 min-w-0 overflow-x-auto overflow-y-visible hide-scrollbar scroll-smooth touch-pan-x py-0.5"
              >
                <div className="flex items-center gap-1.5 flex-nowrap">
                  {displayCategoriesForChips.map((category) => {
                    const subcategories = categories.filter(
                      (c) =>
                        c.id !== category.id &&
                        c.parent_category_id != null &&
                        Number(c.parent_category_id) === Number(category.id)
                    );
                    const hasSubcategories = subcategories.length > 0;
                    return (
                      <div
                        key={category.id}
                        className="relative flex-shrink-0"
                        ref={(el) => {
                          categoryChipRefs.current[category.id] = el;
                        }}
                      >
                        <div
                          className={`flex items-center rounded-md text-[11px] font-medium whitespace-nowrap max-w-[150px] ${
                            selectedCategoryId === category.id ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategoryId(category.id);
                              if (!hasSubcategories) setCategoryChipDropdownId(null);
                            }}
                            className="px-2.5 py-1 rounded-l-md max-w-[120px] truncate"
                            title={category.parent_category_id ? `${categories.find((c) => c.id === category.parent_category_id)?.category_name ?? ""} › ${category.category_name}` : category.category_name}
                          >
                            {category.parent_category_id ? `  ${category.category_name}` : category.category_name}
                          </button>
                          {hasSubcategories && (
                            <button
                              type="button"
                              onClick={() =>
                                setCategoryChipDropdownId((prev) => (prev === category.id ? null : category.id))
                              }
                              className={`cursor-pointer px-1.5 py-1 rounded-r-md border-l transition-colors ${
                                categoryChipDropdownId === category.id
                                  ? "bg-orange-100 text-orange-700 border-orange-300"
                                  : selectedCategoryId === category.id
                                    ? "border-orange-400/60 hover:bg-orange-600"
                                    : "border-gray-300 hover:bg-gray-300/60"
                              }`}
                              aria-label={`Show subcategories for ${category.category_name}`}
                            >
                              <ChevronDown
                                size={12}
                                className={categoryChipDropdownId === category.id ? "rotate-180 transition-transform" : "transition-transform"}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {categories.length > 0 && (
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
          {categoryChipDropdownId != null && activeChipSubcategories.length > 0 && (
            <div ref={subcategoryRowRef} className="relative w-full mt-1">
              <span
                className="absolute -top-2 h-3 w-px bg-orange-500"
                style={{ left: `${subcategoryRowOffset + 18}px` }}
                aria-hidden
              />
              <div
                className="relative flex items-center gap-1.5 flex-nowrap overflow-x-auto hide-scrollbar py-0.5"
                style={{ paddingLeft: `${subcategoryRowOffset}px` }}
              >
                {activeChipSubcategories.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(sub.id);
                      setCategoryChipDropdownId(null);
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-medium ${
                      selectedCategoryId === sub.id
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {sub.category_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto px-3 sm:px-4 py-3 bg-slate-50">
          {loading ? (
            <MenuItemsGridSkeleton />
          ) : searchedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package size={48} className="text-gray-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-700">
                {menuItems.length > 0 ? "No items match current filters" : "No menu items found"}
              </h3>
              <p className="text-gray-500 mt-2">
                {menuItems.length > 0
                  ? "Try clearing or changing filters to see items."
                  : searchTerm
                    ? "Try a different search term"
                    : "Add your first menu item to get started"}
              </p>
              {menuItems.length === 0 && categories.length === 0 && (
                <p className="text-sm text-gray-400 mt-2">You need to create a category first</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {searchedItems.map((item) => {
                const categoryDisplayLabel = formatCategoryLabel(categories, item.category_id);
                const discount = Number(item.discount_percentage);
                const hasDiscount = discount > 0;
                return (
                  <div
                    key={item.id}
                    className="bg-white/95 rounded-lg border border-gray-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden"
                  >
                    <div className="flex p-2 h-full gap-3">
                      <div className="w-16 h-16 flex-shrink-0 rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                        <R2Image
                          src={item.item_image_url}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                          fallbackSrc={ITEM_PLACEHOLDER_SVG}
                        />
                      </div>
                      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-gray-900 truncate">{item.item_name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide truncate" title={categoryDisplayLabel}>
                              {categoryDisplayLabel}
                            </div>
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
                          <label className="inline-flex items-center cursor-pointer flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={item.in_stock ?? true}
                              onChange={() => {
                                setStockToggleItem({ id: item.id, newStatus: !item.in_stock });
                                setShowStockModal(true);
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-7 h-4 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                              <div
                                className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                                  item.in_stock ? "translate-x-3" : ""
                                }`}
                              />
                            </div>
                          </label>
                        </div>
                        <div className="flex items-center gap-1 mb-1">
                          {hasDiscount ? (
                            <>
                              <span className="text-sm font-semibold text-orange-600">₹{item.selling_price}</span>
                              <span className="text-xs font-medium text-gray-500 line-through">₹{item.base_price}</span>
                              <span className="px-1 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">
                                {discount}% OFF
                              </span>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-orange-600">₹{item.selling_price}</span>
                          )}
                        </div>
                        {item.item_description && (
                          <p className="text-[11px] text-gray-600 line-clamp-1 mb-1 flex-grow leading-tight">
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
                        <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
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
                          {(item.approval_status ?? "PENDING") === "PENDING" && (
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
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showReviewDrawer && reviewItem &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setShowReviewDrawer(false);
              setReviewItem(null);
            }}
          >
            <div
              className="w-full max-w-md bg-white shadow-xl border-l border-gray-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">Review item</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowReviewDrawer(false);
                    setReviewItem(null);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
              <div className="p-4 flex-1 overflow-auto space-y-3 text-sm">
                <div className="w-full h-40 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                  <R2Image
                    src={reviewItem.item_image_url}
                    alt={reviewItem.item_name}
                    className="w-full h-full object-cover"
                    fallbackSrc={ITEM_PLACEHOLDER_SVG}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                    {formatCategoryLabel(categories, reviewItem.category_id)}
                  </div>
                  <div className="text-base font-bold text-gray-900">{reviewItem.item_name}</div>
                  {reviewItem.item_description && (
                    <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{reviewItem.item_description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-semibold">
                    Status: {(reviewItem.approval_status ?? "PENDING").toLowerCase()}
                  </span>
                  {reviewItem.food_type && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-semibold">
                      {getFoodTypeLabel(reviewItem.food_type)}
                    </span>
                  )}
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
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-orange-600">₹{reviewItem.selling_price}</span>
                  {reviewItem.base_price && reviewItem.base_price > reviewItem.selling_price && (
                    <span className="text-xs text-gray-500 line-through">₹{reviewItem.base_price}</span>
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
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!reviewItem) return;
                    setIsReviewActionLoading("REJECT");
                    try {
                      const res = await fetch(
                        `/api/merchant/stores/${storeId}/menu/items/${reviewItem.id}/approval`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ approval_status: "REJECTED" }),
                        }
                      );
                      const r = await res.json().catch(() => ({}));
                      if (!res.ok || r?.success === false) throw new Error(r?.error || "Reject failed");
                      toast("Item rejected.");
                      trackAudit({
                        actionType: "UPDATE",
                        resourceType: "merchant_menu_items",
                        resourceId: String(reviewItem.id),
                        actionDetails: { action: "reject_item" },
                        actionStatus: "SUCCESS",
                        requestMethod: "PATCH",
                      });
                      await refreshMenu();
                      setShowReviewDrawer(false);
                      setReviewItem(null);
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Reject failed");
                      trackAudit({
                        actionType: "UPDATE",
                        resourceType: "merchant_menu_items",
                        resourceId: reviewItem ? String(reviewItem.id) : undefined,
                        actionDetails: { action: "reject_item" },
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
                  {isReviewActionLoading === "REJECT" ? "Rejecting…" : "Reject"}
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
                      toast("Item approved.");
                      trackAudit({
                        actionType: "UPDATE",
                        resourceType: "merchant_menu_items",
                        resourceId: String(reviewItem.id),
                        actionDetails: { action: "approve_item" },
                        actionStatus: "SUCCESS",
                        requestMethod: "PATCH",
                      });
                      await refreshMenu();
                      setShowReviewDrawer(false);
                      setReviewItem(null);
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
                  {isReviewActionLoading === "APPROVE" ? "Approving…" : "Approve"}
                </button>
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
                  setAddForm(defaultItemFormData);
                  setImagePreview("");
                  setAddImageFile(null);
                  setAddImageValidationError("");
                  setAddImageValidating(false);
                  addImagePendingFileRef.current = null;
                }}
                onSaveAndNext={handleAddSaveAndNext}
                onSubmitOptions={addCreatedItemId != null ? handleAddSubmitOptions : undefined}
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
                  setShowEditModal(false);
                  setEditImageValidationError("");
                  setEditImageValidating(false);
                  editImagePendingFileRef.current = null;
                }}
                onSubmit={handleSaveEdit}
                onSubmitOptions={handleSaveEditOptions}
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

      {showStockModal &&
        stockToggleItem &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/40 backdrop-blur-md">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
              <div className="p-6">
                <div className="text-center">
                  <div
                    className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4 ${
                      stockToggleItem.newStatus ? "bg-green-100" : "bg-red-100"
                    }`}
                  >
                    <span className={stockToggleItem.newStatus ? "text-green-600 text-xl" : "text-red-600 text-xl"}>
                      {stockToggleItem.newStatus ? "✓" : "✗"}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {stockToggleItem.newStatus ? "Mark as In Stock" : "Mark as Out of Stock"}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {stockToggleItem.newStatus
                      ? "This item will be available for customers to order."
                      : "This item will be hidden from customers and marked as unavailable."}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowStockModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100"
                    disabled={isTogglingStock}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStockToggle}
                    className={`flex-1 px-4 py-2.5 rounded-lg font-bold text-white ${
                      stockToggleItem.newStatus ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"
                    }`}
                    disabled={isTogglingStock}
                  >
                    {isTogglingStock ? "Updating..." : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

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
                      <input
                        list="category-cuisine-options"
                        value={categoryCuisineInput}
                        onChange={(e) => {
                          const typed = e.target.value;
                          setCategoryCuisineInput(typed);
                          const matched = cuisineOptions.find(
                            (c) => c.name.trim().toLowerCase() === typed.trim().toLowerCase()
                          );
                          setCategoryForm((prev) => ({
                            ...prev,
                            cuisine_id: matched ? Number(matched.id) : undefined,
                          }));
                        }}
                        onBlur={() => commitTypedCuisineSelection()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitTypedCuisineSelection();
                          }
                        }}
                        placeholder="Type or select cuisine..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                      />
                      <datalist id="category-cuisine-options">
                        {cuisineOptions.map((c) => (
                          <option key={`cuisine-name-${c.id}`} value={c.name} />
                        ))}
                      </datalist>
                      {categoryUiConfig?.cuisine_field.required_for_root && cuisineOptions.length === 0 && (
                        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
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
                        <button type="button" onClick={() => { setDeleteCategoryId(parent.id); setCategoryDeleteError(null); setShowDeleteCategoryModal(true); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {(childrenByParentId.get(parent.id) ?? []).map((child) => (
                      <div key={child.id} className="flex items-center justify-between gap-2 px-4 py-2 border-t border-gray-100 bg-white">
                        <span className="text-gray-700">  {child.category_name}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openEditCategory(child)} className="p-1.5 text-gray-500 hover:bg-gray-200 rounded" aria-label="Edit">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" onClick={() => { setDeleteCategoryId(child.id); setCategoryDeleteError(null); setShowDeleteCategoryModal(true); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
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
              <p className="text-sm text-gray-600 mb-4">
                {(() => {
                  const cat = categories.find((c) => c.id === deleteCategoryId);
                  return cat ? `"${cat.category_name}" will be removed. Categories with menu items cannot be deleted.` : "This category will be removed.";
                })()}
              </p>
              {categoryDeleteError && <p className="text-sm text-red-600 mb-4">{categoryDeleteError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteCategoryModal(false); setDeleteCategoryId(null); setCategoryDeleteError(null); }}
                  className="flex-1 px-4 py-2 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
                  disabled={isDeletingCategory}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCategory}
                  className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                  disabled={isDeletingCategory}
                >
                  {isDeletingCategory ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
