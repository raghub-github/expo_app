"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Upload,
  Package,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { R2Image } from "@/components/ui/R2Image";
import { MenuItemsGridSkeleton } from "@/components/ui/MenuItemsGridSkeleton";
import { MenuItemForm, type ItemFormData } from "./MenuItemForm";
import {
  ITEM_PLACEHOLDER_SVG,
  CATEGORY_SUGGESTIONS,
  type MenuItem,
  type MenuCategory,
  type Customization,
  type Variant,
} from "./menu-types";

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
  tax_percentage: "5",
  in_stock: true,
  available_quantity: "",
  low_stock_threshold: "",
  has_customizations: false,
  has_addons: false,
  has_variants: false,
  is_popular: false,
  is_recommended: false,
  preparation_time_minutes: 15,
  serves: 1,
  is_active: true,
  allergens: "",
  category_id: null,
  customizations: [],
  variants: [],
};

function normalizeCategory(c: { id?: number; name?: string; category_name?: string }): MenuCategory {
  return {
    id: c.id ?? 0,
    store_id: 0,
    category_name: c.category_name ?? c.name ?? "—",
    is_active: true,
  };
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
    serves: (item.serves as number) ?? undefined,
    customizations: (item.customizations as Customization[]) ?? [],
    variants: (item.variants as Variant[]) ?? [],
  };
}

export function StoreMenuClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ categories?: unknown[]; items?: unknown[] } | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showMenuFileSection, setShowMenuFileSection] = useState(false);
  const menuFileSectionRef = useRef<HTMLDivElement>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
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
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);

  const [addForm, setAddForm] = useState<ItemFormData>(defaultItemFormData);
  const [editForm, setEditForm] = useState<ItemFormData>(defaultItemFormData);
  const [imagePreview, setImagePreview] = useState("");
  const [editImagePreview, setEditImagePreview] = useState("");
  const [addError, setAddError] = useState("");
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stockToggleItem, setStockToggleItem] = useState<{ item_id: string; newStatus: boolean } | null>(null);
  const [isTogglingStock, setIsTogglingStock] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/merchant/stores/${storeId}/menu`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const rawCategories = (data && "categories" in data && Array.isArray(data.categories) ? data.categories : []) as Record<string, unknown>[];
  const categories: MenuCategory[] = rawCategories.map((c, i) => {
    const norm = normalizeCategory(c as { id?: number; name?: string; category_name?: string });
    return { ...norm, id: (norm.id && norm.id > 0) ? norm.id : i + 1 };
  });
  const rawItems = (data && "items" in data && Array.isArray(data.items) ? data.items : []) as Record<string, unknown>[];
  const menuItems: MenuItem[] = rawItems.map((item, i) => normalizeItem(item, i));

  const filteredByCategory =
    selectedCategoryId === null
      ? menuItems
      : menuItems.filter((item) => item.category_id === selectedCategoryId);
  const searchedItems = searchTerm
    ? filteredByCategory.filter(
        (item) =>
          item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.item_description &&
            item.item_description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : filteredByCategory;

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

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingId(item.item_id);
    const allergensString = Array.isArray(item.allergens)
      ? item.allergens.join(", ")
      : typeof item.allergens === "string"
        ? item.allergens
        : "";
    setEditForm({
      ...defaultItemFormData,
      item_name: item.item_name ?? "",
      item_description: item.item_description ?? "",
      item_image_url: item.item_image_url ?? "",
      food_type: item.food_type ?? "",
      spice_level: item.spice_level ?? "",
      cuisine_type: item.cuisine_type ?? "",
      base_price: String(item.base_price ?? ""),
      selling_price: String(item.selling_price ?? ""),
      discount_percentage: String(item.discount_percentage ?? "0"),
      tax_percentage: String(item.tax_percentage ?? "5"),
      in_stock: item.in_stock ?? true,
      has_customizations: (item.customizations?.length ?? 0) > 0,
      has_addons: (item.customizations?.some((c) => (c.addons?.length ?? 0) > 0)) ?? false,
      has_variants: (item.variants?.length ?? 0) > 0,
      is_popular: item.is_popular ?? false,
      is_recommended: item.is_recommended ?? false,
      preparation_time_minutes: item.preparation_time_minutes ?? 15,
      serves: item.serves ?? 1,
      is_active: item.is_active ?? true,
      allergens: allergensString,
      category_id: item.category_id ?? null,
      customizations: item.customizations ?? [],
      variants: item.variants ?? [],
    });
    setEditImagePreview(item.item_image_url || "");
    setShowEditModal(true);
  };

  const handleAddItem = async () => {
    setAddError("");
    if (!addForm.item_name.trim()) return setAddError("Name is required");
    if (!addForm.category_id) return setAddError("Category is required");
    if (!addForm.base_price || Number(addForm.base_price) <= 0) return setAddError("Valid base price required");
    setIsSaving(true);
    try {
      toast("Menu item created (API integration pending).");
      setShowAddModal(false);
      setAddForm(defaultItemFormData);
      setImagePreview("");
    } catch {
      setAddError("Error saving item.");
    }
    setIsSaving(false);
  };

  const handleSaveEdit = async () => {
    setEditError("");
    if (!editingId) return;
    if (!editForm.item_name.trim()) return setEditError("Name is required");
    if (!editForm.category_id) return setEditError("Category is required");
    setIsSavingEdit(true);
    try {
      toast("Menu item updated (API integration pending).");
      setShowEditModal(false);
    } catch {
      setEditError("Error updating item.");
    }
    setIsSavingEdit(false);
  };

  const handleDeleteItem = async () => {
    if (!deleteItemId) return;
    setIsDeleting(true);
    try {
      toast("Menu item deleted (API integration pending).");
      setShowDeleteModal(false);
      setDeleteItemId(null);
    } catch {
      toast("Error deleting item.");
    }
    setIsDeleting(false);
  };

  const handleStockToggle = async () => {
    if (!stockToggleItem) return;
    setIsTogglingStock(true);
    try {
      toast(`Item marked as ${stockToggleItem.newStatus ? "In Stock" : "Out of Stock"} (API pending).`);
      setShowStockModal(false);
      setStockToggleItem(null);
    } catch {
      toast("Error updating stock.");
    }
    setIsTogglingStock(false);
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
      toast("Category saved (API integration pending).");
      setShowCategoryModal(false);
      setCategoryForm({ category_name: "", is_active: true });
      setEditingCategoryId(null);
    } catch {
      setCategoryError("Error saving category");
    }
    setCategoryLoading(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-20 shrink-0 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-2 gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-gray-900">Menu Management</h1>
              <p className="text-gray-500 text-xs mt-0 flex items-center gap-2 flex-wrap">
                <span>Manage your menu items and categories</span>
                {planLimits != null && (
                  <span className="text-gray-400">· Plan: {(planLimits as { planName?: string })?.planName ?? "—"}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                setCategoryModalMode("add");
                setCategoryForm({ category_name: "", is_active: true });
                setShowCategoryModal(true);
              }}
              disabled={!canAddCategory}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors bg-white text-orange-600 border border-orange-600 hover:bg-orange-50 disabled:opacity-50"
            >
              <Plus size={16} />
              Add Category
              {planLimits != null && (
                <span className="text-xs opacity-80">({categories.length}/{(planLimits as { maxMenuCategories?: number })?.maxMenuCategories ?? "—"})</span>
              )}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              disabled={!canAddItem}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-amber-600 text-amber-700 bg-white hover:bg-amber-50 transition-colors"
            >
              <Upload size={16} />
              Menu file
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-3 sm:px-4 pb-2">
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 min-w-[100px]">
            <div className="text-gray-500 text-xs font-medium">
              Total Items
              {planLimits != null && (
                <span className="ml-1 text-gray-400">/ {(planLimits as { maxMenuItems?: number })?.maxMenuItems ?? "—"}</span>
              )}
            </div>
            <div className="text-lg font-bold text-gray-900 leading-tight">{menuItems.length}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 min-w-[100px]">
            <div className="text-gray-500 text-xs font-medium">In Stock</div>
            <div className="text-lg font-bold text-green-600 leading-tight">{inStock}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 min-w-[100px]">
            <div className="text-gray-500 text-xs font-medium">Out of Stock</div>
            <div className="text-lg font-bold text-red-600 leading-tight">
              {outStock} ({outStockPercent}%)
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 min-w-[100px]">
            <div className="text-gray-500 text-xs font-medium">
              Categories
              {planLimits != null && (
                <span className="ml-1 text-gray-400">/ {(planLimits as { maxMenuCategories?: number })?.maxMenuCategories ?? "—"}</span>
              )}
            </div>
            <div className="text-lg font-bold text-blue-600 leading-tight">{categories.length}</div>
          </div>
        </div>

        {showMenuFileSection && (
          <div
            ref={menuFileSectionRef}
            className="mx-3 sm:mx-4 mb-3 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-orange-50/80 shadow-sm overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 text-amber-700">
                    <FileText size={20} />
                  </span>
                  Menu file (CSV or image)
                </h3>
                <p className="text-sm text-gray-600 mt-1.5">
                  Upload a CSV or menu card image. This replaces any file uploaded during onboarding. Our team will add items from it (pending until then).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMenuFileSection(false)}
                aria-label="Close menu file section"
                className="flex-shrink-0 p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-white/80 border border-transparent hover:border-gray-200 transition-colors"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>
            <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
              <p className="text-xs text-gray-500">Select CSV or image and upload. API integration pending.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-4 pb-3">
          <div className="flex-1 max-w-sm min-w-0 order-2 sm:order-1">
            <input
              type="text"
              placeholder="Search menu items..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-gray-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-0 order-1 sm:order-2 flex items-center gap-1 overflow-hidden">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                selectedCategoryId === null ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
              }`}
            >
              All Categories
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-hidden">
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
                className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden hide-scrollbar scroll-smooth touch-pan-x py-0.5"
              >
                <div className="flex items-center gap-1.5 flex-nowrap">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategoryId(category.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap max-w-[140px] truncate ${
                        selectedCategoryId === category.id ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      title={category.category_name}
                    >
                      {category.category_name}
                    </button>
                  ))}
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
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto px-3 sm:px-4 py-3">
          {loading ? (
            <MenuItemsGridSkeleton />
          ) : searchedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package size={48} className="text-gray-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-700">No menu items found</h3>
              <p className="text-gray-500 mt-2">
                {searchTerm ? "Try a different search term" : "Add your first menu item to get started"}
              </p>
              {categories.length === 0 && (
                <p className="text-sm text-gray-400 mt-2">You need to create a category first</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {searchedItems.map((item) => {
                const category = categories.find((c) => c.id === item.category_id);
                const discount = Number(item.discount_percentage);
                const hasDiscount = discount > 0;
                return (
                  <div
                    key={item.item_id}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden"
                  >
                    <div className="flex p-2.5 h-full gap-2.5">
                      <div className="w-14 h-14 flex-shrink-0 rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                        <R2Image
                          src={item.item_image_url}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                          fallbackSrc={ITEM_PLACEHOLDER_SVG}
                        />
                      </div>
                      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <div className="flex items-start justify-between gap-1 mb-0.5">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-gray-900 truncate">{item.item_name}</div>
                            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
                              {category?.category_name ?? "Uncategorized"}
                            </div>
                          </div>
                          <label className="inline-flex items-center cursor-pointer flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={item.in_stock ?? true}
                              onChange={() => {
                                setStockToggleItem({ item_id: item.item_id, newStatus: !item.in_stock });
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
                              <span className="text-sm font-bold text-orange-600">₹{item.selling_price}</span>
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
                              {item.food_type}
                            </span>
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
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="min-w-0 flex-1 flex items-center justify-center gap-0.5 px-1 py-1 bg-blue-50 text-blue-600 font-bold rounded-md border border-blue-200 hover:bg-blue-100 transition-all text-[10px]"
                          >
                            <Edit2 size={10} />
                            <span className="truncate">Edit</span>
                          </button>
                          <button
                            onClick={() => {
                              setDeleteItemId(item.item_id);
                              setShowDeleteModal(true);
                            }}
                            className="min-w-0 flex-1 flex items-center justify-center gap-0.5 px-1 py-1 bg-red-50 text-red-600 font-bold rounded-md border border-red-200 hover:bg-red-100 transition-all text-[10px]"
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

      {showAddModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
            onClick={() => {
              setShowAddModal(false);
              setAddForm(defaultItemFormData);
              setImagePreview("");
            }}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <MenuItemForm
                isEdit={false}
                formData={addForm}
                setFormData={setAddForm}
                imagePreview={imagePreview}
                setImagePreview={setImagePreview}
                imageUploadAllowed={imageUploadAllowed}
                imageLimitReached={imageLimitReached}
                imageUsed={imageUsed}
                imageLimit={imageLimit}
                imageSlotsLeft={imageSlotsLeft}
                onCancel={() => {
                  setShowAddModal(false);
                  setAddForm(defaultItemFormData);
                  setImagePreview("");
                }}
                onSubmit={handleAddItem}
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
            onClick={() => setShowEditModal(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <MenuItemForm
                isEdit
                formData={editForm}
                setFormData={setEditForm}
                imagePreview={editImagePreview}
                setImagePreview={setEditImagePreview}
                imageUploadAllowed={imageUploadAllowed}
                imageLimitReached={imageLimitReached}
                imageUsed={imageUsed}
                imageLimit={imageLimit}
                imageSlotsLeft={imageSlotsLeft}
                onCancel={() => setShowEditModal(false)}
                onSubmit={handleSaveEdit}
                isSaving={isSavingEdit}
                error={editError}
                title="Edit Menu Item"
                categories={categories}
                currentItemId={editingId ?? ""}
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
            onClick={() => {
              setShowCategoryModal(false);
              setCategoryForm({ category_name: "", is_active: true });
              setEditingCategoryId(null);
            }}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    {categoryModalMode === "add" ? "Add New Category" : "Edit Category"}
                  </h2>
                  <button
                    onClick={() => {
                      setShowCategoryModal(false);
                      setCategoryForm({ category_name: "", is_active: true });
                      setEditingCategoryId(null);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    aria-label="Close"
                  >
                    <X size={20} className="text-gray-600" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category Name * (max 30 characters)
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
                      placeholder="Start typing for suggestions..."
                    />
                    {(categoryForm.category_name?.length ?? 0) > 0 && (
                      <span className="absolute right-3 top-9 text-xs text-gray-400">
                        {categoryForm.category_name?.length ?? 0}/30
                      </span>
                    )}
                    {categorySuggestionsOpen && (
                      <div className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                        {(() => {
                          const q = (categoryForm.category_name ?? "").toLowerCase().trim();
                          const matched =
                            q.length === 0
                              ? CATEGORY_SUGGESTIONS.slice(0, 12)
                              : CATEGORY_SUGGESTIONS.filter((c) => c.toLowerCase().includes(q)).slice(0, 12);
                          return (
                            <>
                              {matched.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-orange-50"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setCategoryForm({ ...categoryForm, category_name: s });
                                    setCategorySuggestionsOpen(false);
                                  }}
                                >
                                  {s}
                                </button>
                              ))}
                              {q && !CATEGORY_SUGGESTIONS.some((c) => c.toLowerCase() === q) && (
                                <div className="border-t border-gray-100 mt-1 pt-1">
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm text-orange-600 font-medium hover:bg-orange-50"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setCategorySuggestionsOpen(false);
                                    }}
                                  >
                                    Add &quot;{categoryForm.category_name}&quot; as custom category
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
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
                      setEditingCategoryId(null);
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
                    {categoryLoading ? "Saving..." : categoryModalMode === "add" ? "Add Category" : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
