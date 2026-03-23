"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Upload, Edit2, Trash2, Search, Image as ImageIcon, Info, ChevronDown } from "lucide-react";
import { R2Image } from "@/components/ui/R2Image";
import {
  type MenuCategory,
  type Customization,
  type Addon,
  type Variant,
  FOOD_TYPES,
  SPICE_LEVELS,
  CUISINE_TYPES,
  CUISINE_TOP_COUNT,
  CUSTOMIZATION_TYPES,
  CUSTOMIZATION_VARIANT_LIMIT,
  SERVES_OPTIONS,
  SIZE_UNITS,
  WEIGHT_PER_SERVING_UNITS,
  NUTRIENT_UNITS,
  normalizeSpiceLevelForForm,
} from "./menu-types";

export interface ItemFormData {
  item_name: string;
  item_description: string;
  item_image_url: string;
  food_type: string;
  spice_level: string;
  cuisine_type: string;
  base_price: string;
  selling_price: string;
  discount_percentage: string;
  tax_percentage: string;
  in_stock: boolean;
  available_quantity: string;
  low_stock_threshold: string;
  has_customizations: boolean;
  has_addons: boolean;
  has_variants: boolean;
  is_popular: boolean;
  is_recommended: boolean;
  preparation_time_minutes: number;
  /** When true, item uses a per-item packaging fee (see packaging_charges). */
  packaging_enabled: boolean;
  packaging_charges: string;
  serves: number;
  serves_label: string;
  item_size_value: string;
  item_size_unit: string;
  /** Same semantics as merchant app / backend `merchant_menu_items`. */
  available_for_delivery: boolean;
  weight_per_serving: string;
  weight_per_serving_unit: string;
  calories_kcal: string;
  protein: string;
  protein_unit: string;
  carbohydrates: string;
  carbohydrates_unit: string;
  fat: string;
  fat_unit: string;
  fibre: string;
  fibre_unit: string;
  /** Comma-separated tags (stored as `item_tags` text[]). */
  item_tags: string;
  is_active: boolean;
  allergens: string;
  category_id: number | null;
  customizations: Customization[];
  variants: Variant[];
}

interface ItemFormProps {
  isEdit?: boolean;
  formData: ItemFormData;
  setFormData: (data: ItemFormData | ((prev: ItemFormData) => ItemFormData)) => void;
  imagePreview: string;
  setImagePreview: (url: string) => void;
  onProcessImage?: (file: File, isEdit: boolean) => void | Promise<void>;
  onSaveAndNext?: () => Promise<void>;
  onSubmitOptions?: () => Promise<void>;
  onSubmit?: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string;
  title: string;
  categories: MenuCategory[];
  currentItemId?: string;
  storeId?: string;
  onSwitchToAddonLibrary?: () => void;
  imageUploadAllowed?: boolean;
  imageLimitReached?: boolean;
  imageUsed?: number;
  imageLimit?: number | null;
  imageSlotsLeft?: number | null;
  maxCuisinesPerItem?: number | null;
  imageValidationError?: string;
  imageValidating?: boolean;
  /** Optional: center 1:1 crop + resize after validation failed (dashboard normalizes client-side). */
  onNormalizeMenuItemImage?: () => void | Promise<void>;
  storeDefaults?: {
    avg_preparation_time_minutes?: number | null;
    packaging_charge_amount?: number | null;
  } | null;
}

const defaultNewCustomization = {
  customization_title: "",
  customization_type: "Checkbox" as const,
  is_required: false,
  min_selection: 0,
  max_selection: 1,
  display_order: 0,
};

export function MenuItemForm({
  isEdit = false,
  formData,
  setFormData,
  imagePreview,
  onProcessImage,
  onSaveAndNext,
  onSubmitOptions,
  onSubmit,
  onCancel,
  isSaving,
  error,
  title,
  categories,
  currentItemId,
  storeId,
  onSwitchToAddonLibrary,
  imageUploadAllowed = true,
  imageLimitReached = false,
  imageUsed = 0,
  imageLimit = null,
  imageSlotsLeft = null,
  maxCuisinesPerItem = null,
  imageValidationError,
  imageValidating = false,
  onNormalizeMenuItemImage,
  storeDefaults,
}: ItemFormProps) {
  const [activeSection, setActiveSection] = useState<"main" | "customization">("main");
  const [cuisineSearch, setCuisineSearch] = useState("");
  const [cuisineViewMore, setCuisineViewMore] = useState(false);
  const [nutritionExpanded, setNutritionExpanded] = useState(false);
  const [customizations, setCustomizations] = useState<Customization[]>(formData.customizations || []);
  const [newCustomization, setNewCustomization] = useState({ ...defaultNewCustomization });
  const [editingCustomizationIndex, setEditingCustomizationIndex] = useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [linkedAddonGroups, setLinkedAddonGroups] = useState<{ id: number; modifier_group_id: number; group?: { title: string; options_count?: number } }[]>([]);
  const [showLinkAddonPicker, setShowLinkAddonPicker] = useState(false);
  const [allGroupsForPicker, setAllGroupsForPicker] = useState<{ id: number; title: string; options_count: number; used_in_items_count: number }[]>([]);

  useEffect(() => {
    setCustomizations(formData.customizations || []);
  }, [formData.customizations?.length, currentItemId]);

  useEffect(() => {
    if (!storeId || !currentItemId) return;
    const itemId = typeof currentItemId === "string" ? parseInt(currentItemId, 10) : currentItemId;
    if (!Number.isFinite(itemId)) return;
    const ac = new AbortController();
    fetch(`/api/merchant/stores/${storeId}/menu/items/${itemId}/modifier-groups`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => {
        if (ac.signal.aborted) return;
        if (j?.linkedModifierGroups) {
          setLinkedAddonGroups(
            j.linkedModifierGroups.map((l: any) => ({
              id: l.id,
              modifier_group_id: l.modifier_group_id,
              group: { title: l.group?.title ?? "", options_count: l.group?.options?.length ?? 0 },
            }))
          );
        }
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
      });
    return () => ac.abort();
  }, [storeId, currentItemId]);

  useEffect(() => {
    if (!showLinkAddonPicker || !storeId) return;
    const ac = new AbortController();
    fetch(`/api/merchant/stores/${storeId}/menu/modifier-groups`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => {
        if (ac.signal.aborted) return;
        if (j?.modifierGroups) setAllGroupsForPicker(j.modifierGroups);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
      });
    return () => ac.abort();
  }, [showLinkAddonPicker, storeId]);

  const categoryPickerRef = useRef<HTMLDivElement>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryPickerQuery, setCategoryPickerQuery] = useState("");

  type CategorySection = {
    key: string;
    title: string;
    rows: { id: number; parentName: string; subName: string | null }[];
  };

  const categorySections = useMemo((): CategorySection[] => {
    const sortKids = (a: MenuCategory, b: MenuCategory) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) || a.id - b.id;
    const byParent = new Map<number, MenuCategory[]>();
    for (const c of categories) {
      if (c.parent_category_id) {
        const arr = byParent.get(c.parent_category_id) ?? [];
        arr.push(c);
        byParent.set(c.parent_category_id, arr);
      }
    }
    const roots = categories.filter((c) => !c.parent_category_id).slice().sort(sortKids);
    const used = new Set<number>();
    const sections: CategorySection[] = [];
    for (const root of roots) {
      const kids = (byParent.get(root.id) ?? []).slice().sort(sortKids);
      if (kids.length) {
        for (const ch of kids) used.add(ch.id);
        sections.push({
          key: `p-${root.id}`,
          title: root.category_name,
          rows: kids.map((ch) => ({
            id: ch.id,
            parentName: root.category_name,
            subName: ch.category_name,
          })),
        });
      } else {
        used.add(root.id);
        sections.push({
          key: `leaf-${root.id}`,
          title: root.category_name,
          rows: [{ id: root.id, parentName: root.category_name, subName: null }],
        });
      }
    }
    const orphans = categories.filter((c) => c.parent_category_id && !used.has(c.id));
    if (orphans.length) {
      sections.push({
        key: "orphan",
        title: "Other",
        rows: orphans.sort(sortKids).map((c) => ({
          id: c.id,
          parentName: c.category_name,
          subName: null,
        })),
      });
    }
    return sections;
  }, [categories]);

  const filteredCategorySections = useMemo(() => {
    const q = categoryPickerQuery.trim().toLowerCase();
    if (!q) return categorySections;
    return categorySections
      .map((sec) => ({
        ...sec,
        rows: sec.rows.filter((row) => {
          const a = row.parentName.toLowerCase();
          const b = row.subName?.toLowerCase() ?? "";
          return a.includes(q) || b.includes(q) || `${a} ${b}`.includes(q);
        }),
      }))
      .filter((sec) => sec.rows.length > 0);
  }, [categorySections, categoryPickerQuery]);

  const categoryButtonLabel = useMemo(() => {
    if (formData.category_id == null) return "Select category";
    const cat = categories.find((c) => c.id === formData.category_id);
    if (!cat) return "Select category";
    const parent = cat.parent_category_id
      ? categories.find((c) => c.id === cat.parent_category_id)
      : null;
    return parent ? `${parent.category_name} (${cat.category_name})` : cat.category_name;
  }, [formData.category_id, categories]);

  useEffect(() => {
    if (!categoryPickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(e.target as Node)) {
        setCategoryPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [categoryPickerOpen]);

  // Selling price is not auto-calculated; offer/discount is set separately. Base and selling show actual API values.

  const selectedCuisines: string[] = formData.cuisine_type
    ? String(formData.cuisine_type)
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];
  const cuisineLimit = maxCuisinesPerItem ?? 10;
  const cuisineAtLimit = selectedCuisines.length >= cuisineLimit;
  const toggleCuisine = (cuisine: string) => {
    const next = selectedCuisines.includes(cuisine)
      ? selectedCuisines.filter((c) => c !== cuisine)
      : cuisineAtLimit
        ? selectedCuisines
        : [...selectedCuisines, cuisine];
    setFormData({ ...formData, cuisine_type: next.length ? next.join(", ") : "" });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file && onProcessImage) void Promise.resolve(onProcessImage(file, isEdit));
  };

  const totalOptionsCount = (formData.customizations?.length || 0) + (formData.variants?.length || 0);
  const atOptionsLimit = totalOptionsCount >= CUSTOMIZATION_VARIANT_LIMIT;

  const handleAddCustomization = () => {
    if (!newCustomization.customization_title.trim()) return;
    if (totalOptionsCount >= CUSTOMIZATION_VARIANT_LIMIT) return;
    const updated = [...customizations];
    if (editingCustomizationIndex !== null) {
      updated[editingCustomizationIndex] = {
        ...newCustomization,
        customization_id: customizations[editingCustomizationIndex]?.customization_id ?? "",
        menu_item_id: customizations[editingCustomizationIndex]?.menu_item_id ?? 0,
        addons: updated[editingCustomizationIndex]?.addons || [],
      };
      setEditingCustomizationIndex(null);
    } else {
      updated.push({
        ...newCustomization,
        customization_id: "",
        menu_item_id: 0,
        addons: [],
      });
    }
    setCustomizations(updated);
    setFormData({ ...formData, customizations: updated, has_customizations: updated.length > 0 });
    setNewCustomization({ ...defaultNewCustomization, display_order: updated.length });
  };

  const handleEditCustomization = (index: number) => {
    const c = customizations[index];
    setNewCustomization({
      customization_title: c.customization_title,
      customization_type: (c.customization_type as "Checkbox") || "Checkbox",
      is_required: c.is_required,
      min_selection: c.min_selection,
      max_selection: c.max_selection,
      display_order: c.display_order,
    });
    setEditingCustomizationIndex(index);
  };

  const handleDeleteCustomization = (index: number) => {
    const updated = customizations.filter((_, i) => i !== index);
    setCustomizations(updated);
    setFormData({ ...formData, customizations: updated, has_customizations: updated.length > 0 });
  };

  const handleAddAddon = (custIndex: number) => {
    const updated = [...customizations];
    const cust = updated[custIndex];
    const addons = cust.addons || [];
    addons.push({
      addon_id: "",
      customization_id: cust.id ?? 0,
      addon_name: `Addon ${addons.length + 1}`,
      addon_price: 0,
      display_order: addons.length,
    });
    updated[custIndex] = { ...cust, addons };
    setCustomizations(updated);
    setFormData({ ...formData, customizations: updated, has_customizations: updated.length > 0 });
  };

  const handleUpdateAddon = (custIndex: number, addonIndex: number, field: string, value: unknown) => {
    const updated = [...customizations];
    const addons = [...(updated[custIndex].addons || [])];
    addons[addonIndex] = { ...addons[addonIndex], [field]: value };
    updated[custIndex] = { ...updated[custIndex], addons };
    setCustomizations(updated);
    setFormData({ ...formData, customizations: updated, has_customizations: updated.length > 0 });
  };

  const handleDeleteAddon = (custIndex: number, addonIndex: number) => {
    const updated = [...customizations];
    const addons = (updated[custIndex].addons || []).filter((_, i) => i !== addonIndex);
    updated[custIndex] = { ...updated[custIndex], addons };
    setCustomizations(updated);
    setFormData({ ...formData, customizations: updated, has_customizations: updated.length > 0 });
  };

  const baseNum = Number(formData.base_price);
  const isBaseInvalid = formData.base_price !== "" && (isNaN(baseNum) || baseNum <= 0);
  const sellNum = Number(formData.selling_price);
  const isSellInvalid = formData.selling_price !== "" && (isNaN(sellNum) || sellNum <= 0);

  const q = cuisineSearch.trim().toLowerCase();
  const filteredCuisines = q
    ? CUISINE_TYPES.filter((c) => c.toLowerCase().includes(q))
    : CUISINE_TYPES;
  const topCuisines = CUISINE_TYPES.slice(0, CUISINE_TOP_COUNT);
  const showCuisines = !cuisineViewMore && !q ? topCuisines : filteredCuisines;
  const hasMoreCuisines = !cuisineViewMore && !q && CUISINE_TYPES.length > CUISINE_TOP_COUNT;
  const customAdd =
    q &&
    !CUISINE_TYPES.some((c) => c.toLowerCase() === q) &&
    !selectedCuisines.some((c) => c.toLowerCase() === q);

  /** Add flow: second tab needs an item id (after Save and Next). Edit flow: always unlocked. */
  const lockOptionsTab = Boolean(onSaveAndNext) && !currentItemId;

  return (
    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-2 md:mx-0 border border-gray-100">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">
            {isEdit
              ? `Editing: ${currentItemId}`
              : currentItemId
                ? `Item #${currentItemId} — add customizations or variants on the next tab`
                : "Enter details for the menu item"}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close">
          <X size={18} className="text-gray-600" />
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveSection("main")}
          className={`px-3 py-2 text-xs font-medium border-b-2 ${
            activeSection === "main" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500"
          }`}
        >
          Item & pricing
        </button>
        <button
          type="button"
          title={
            lockOptionsTab
              ? "Use Save and Next on the first tab to create the item, then add options here"
              : undefined
          }
          disabled={lockOptionsTab}
          onClick={() => {
            if (lockOptionsTab) return;
            setActiveSection("customization");
          }}
          className={`px-3 py-2 text-xs font-medium border-b-2 ${
            activeSection === "customization"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500"
          } ${lockOptionsTab ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          Customizations & variants
        </button>
      </div>

      <form
        className="px-4 py-3 max-h-[70vh] overflow-y-auto"
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            if (activeSection === "main") {
              if (onSaveAndNext) {
                await onSaveAndNext();
                setActiveSection("customization");
              } else if (onSubmit) onSubmit();
            } else {
              if (onSubmitOptions) await onSubmitOptions();
              else if (onSubmit) onSubmit();
            }
          } catch {
            /* parent sets error / toast; do not advance tab */
          }
        }}
      >
        {activeSection === "main" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Item name *</label>
                <input
                  type="text"
                  placeholder="Name"
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  required
                />
              </div>
              <div className="relative" ref={categoryPickerRef}>
                <label className="text-xs font-medium text-gray-600">Category *</label>
                <button
                  type="button"
                  id="menu-item-category-picker"
                  aria-expanded={categoryPickerOpen}
                  aria-haspopup="listbox"
                  className="mt-0.5 w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-left hover:border-orange-200 hover:bg-orange-50/30 transition-colors shadow-sm"
                  onClick={() => setCategoryPickerOpen((o) => !o)}
                >
                  <span
                    className={
                      formData.category_id == null ? "text-gray-400" : "text-gray-900 font-medium truncate"
                    }
                  >
                    {categoryButtonLabel}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${categoryPickerOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {categoryPickerOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200/90 bg-white shadow-xl shadow-gray-200/60 overflow-hidden ring-1 ring-black/5">
                    <div className="p-2 border-b border-gray-100 bg-gradient-to-b from-gray-50/80 to-white">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="search"
                          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white"
                          placeholder="Search categories…"
                          value={categoryPickerQuery}
                          onChange={(e) => setCategoryPickerQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {filteredCategorySections.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-gray-500 text-center">No categories match</p>
                      ) : (
                        filteredCategorySections.map((sec) => (
                          <div key={sec.key} className="mb-0.5 last:mb-0">
                            <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gradient-to-r from-slate-50 via-white to-gray-50/80 border-b border-gray-100/80">
                              {sec.title}
                            </div>
                            {sec.rows.map((row) => (
                              <button
                                key={row.id}
                                type="button"
                                role="option"
                                aria-selected={formData.category_id === row.id}
                                className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors border-b border-gray-50 last:border-0 ${
                                  formData.category_id === row.id
                                    ? "bg-orange-50 text-orange-950"
                                    : "text-gray-800 hover:bg-slate-50"
                                }`}
                                onClick={() => {
                                  setFormData({ ...formData, category_id: row.id });
                                  setCategoryPickerOpen(false);
                                  setCategoryPickerQuery("");
                                }}
                              >
                                <span className="min-w-0">
                                  {row.subName != null ? (
                                    <>
                                      <span className="font-semibold text-gray-900">{row.parentName}</span>
                                      <span className="text-gray-500 font-normal"> ({row.subName})</span>
                                    </>
                                  ) : (
                                    <span className="font-semibold text-gray-900">{row.parentName}</span>
                                  )}
                                </span>
                                {formData.category_id === row.id && (
                                  <span className="text-orange-600 text-xs font-bold shrink-0">✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Food type</label>
                <select
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  value={formData.food_type || ""}
                  onChange={(e) => setFormData({ ...formData, food_type: e.target.value })}
                >
                  <option value="">—</option>
                  {FOOD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Spice</label>
                <select
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  value={normalizeSpiceLevelForForm(formData.spice_level)}
                  onChange={(e) => setFormData({ ...formData, spice_level: e.target.value })}
                >
                  <option value="">—</option>
                  {SPICE_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Cuisine {maxCuisinesPerItem != null && <span className="text-gray-500 font-normal">(max {maxCuisinesPerItem})</span>}
              </label>
              {cuisineViewMore && CUISINE_TYPES.length > CUISINE_TOP_COUNT && (
                <button
                  type="button"
                  onClick={() => setCuisineViewMore(false)}
                  className="mt-1 text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  Show less
                </button>
              )}
              {selectedCuisines.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-gray-500 self-center mr-0.5">Added:</span>
                  {selectedCuisines.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-orange-100 border border-orange-300 text-orange-800"
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => toggleCuisine(c)}
                        className="p-0.5 rounded hover:bg-orange-200 text-orange-600"
                        aria-label={`Remove ${c}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative mt-1">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search cuisines..."
                  value={cuisineSearch}
                  onChange={(e) => setCuisineSearch(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {showCuisines.map((c) => {
                  const checked = selectedCuisines.includes(c);
                  const disabled = !checked && cuisineAtLimit;
                  return (
                    <label
                      key={c}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border cursor-pointer transition-colors ${
                        disabled
                          ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                          : checked
                            ? "bg-orange-100 border-orange-300 text-orange-800"
                            : "bg-white border-gray-200 text-gray-700 hover:border-orange-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleCuisine(c)}
                        className="sr-only"
                      />
                      <span>{c}</span>
                    </label>
                  );
                })}
                {customAdd && (
                  <button
                    type="button"
                    disabled={cuisineAtLimit}
                    onClick={() => {
                      if (cuisineAtLimit) return;
                      const value = cuisineSearch.trim();
                      if (!value) return;
                      setFormData({ ...formData, cuisine_type: [...selectedCuisines, value].join(", ") });
                      setCuisineSearch("");
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-dashed border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                  >
                    Add &quot;{cuisineSearch.trim()}&quot;
                  </button>
                )}
              </div>
              {hasMoreCuisines && (
                <button
                  type="button"
                  onClick={() => setCuisineViewMore(true)}
                  className="mt-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  View more cuisines ({CUISINE_TYPES.length - CUISINE_TOP_COUNT} more)
                </button>
              )}
              {maxCuisinesPerItem != null && (
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {selectedCuisines.length}/{maxCuisinesPerItem} selected
                </p>
              )}
            </div>
            <div className="flex gap-3 items-start">
              <div className="flex-shrink-0">
                <label className="text-xs font-medium text-gray-600 block mb-1">Image</label>
                <p className="text-[10px] text-gray-500 mb-1 max-w-[11rem] leading-snug">
                  Square 1:1 · 400–2000 px · max 10 MB (PNG, JPG, WebP)
                </p>
                {imageLimitReached && (
                  <div className="flex justify-end mb-0.5">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-600 cursor-help"
                      title="Subscribe to the plan for more uploads"
                    >
                      <Info size={12} />
                    </span>
                  </div>
                )}
                {!imageUploadAllowed ? (
                  <div className="w-16 h-16 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-xs px-1 text-center">
                    Images not in plan
                  </div>
                ) : imageLimitReached ? (
                  <div className="w-20 rounded-lg bg-gray-100 border border-red-200 flex flex-col items-center justify-center text-gray-600 text-xs px-1 text-center py-2">
                    {imagePreview ? (
                      imagePreview.startsWith("blob:") || imagePreview.startsWith("data:") ? (
                        <img src={imagePreview} alt="" className="w-16 h-16 object-cover rounded" />
                      ) : (
                        <R2Image src={imagePreview} alt="" className="w-16 h-16 object-cover rounded" />
                      )
                    ) : (
                      <ImageIcon size={20} className="text-gray-400 mb-0.5" />
                    )}
                    <span className="font-medium mt-0.5">{imageLimit != null ? `${imageLimit}/${imageLimit}` : "Limit"}</span>
                    <span className="mt-0.5 text-[10px] font-semibold text-red-600">Limit Exceeded</span>
                  </div>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => !imageLimitReached && imageUploadAllowed && fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !imageLimitReached && imageUploadAllowed) {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      className="w-20 rounded-lg border overflow-hidden flex flex-col items-center justify-center bg-gray-50 cursor-pointer border-gray-200 hover:border-orange-300 hover:bg-orange-50/50"
                      aria-label="Upload menu item image"
                    >
                      <div className="w-16 h-16 flex items-center justify-center relative">
                        {imageValidating ? (
                          <span className="inline-block w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" aria-hidden />
                        ) : imagePreview ? (
                          imagePreview.startsWith("blob:") || imagePreview.startsWith("data:") ? (
                            <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <R2Image src={imagePreview} alt="" className="w-full h-full object-cover" />
                          )
                        ) : (
                          <ImageIcon size={20} className="text-gray-400" />
                        )}
                      </div>
                      {imageLimit != null && (
                        <p className="text-[10px] text-gray-500 mt-0.5 text-center">
                          {imageUsed}/{imageLimit} · {imageSlotsLeft != null ? `${imageSlotsLeft} left` : "—"}
                        </p>
                      )}
                      <span className="mt-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-gray-700">
                        <Upload size={12} />
                        <span>Upload</span>
                      </span>
                    </div>
                    {imageValidationError && (
                      <p className="text-xs text-red-600 mt-1 max-w-[10rem]" role="alert">
                        {imageValidationError}
                      </p>
                    )}
                    {imageValidationError && onNormalizeMenuItemImage && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-orange-600 font-semibold hover:text-orange-700 disabled:opacity-50"
                        onClick={() => void onNormalizeMenuItemImage()}
                        disabled={imageValidating}
                      >
                        Auto-fix (1:1 crop and resize)
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-xs font-medium text-gray-600">Description</label>
                <textarea
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm resize-none"
                  rows={2}
                  placeholder="Optional"
                  value={formData.item_description || ""}
                  onChange={(e) => setFormData({ ...formData, item_description: e.target.value })}
                />
                <label className="text-xs font-medium text-gray-600 mt-1 block">Allergens (comma)</label>
                <input
                  type="text"
                  placeholder="e.g. Nuts, Dairy"
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  value={formData.allergens || ""}
                  onChange={(e) => setFormData({ ...formData, allergens: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Base price (₹) *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={`w-full px-2.5 py-1.5 border rounded text-sm ${isBaseInvalid ? "border-red-300" : "border-gray-200"}`}
                  value={formData.base_price}
                  onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                  required
                />
                {isBaseInvalid && <span className="text-xs text-red-500">&gt; 0</span>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Selling price (₹) *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={`w-full px-2.5 py-1.5 border rounded text-sm ${isSellInvalid ? "border-red-300" : "border-gray-200"}`}
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                  required
                />
                {isSellInvalid && <span className="text-xs text-red-500">&gt; 0</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.in_stock}
                  onChange={(e) => setFormData({ ...formData, in_stock: e.target.checked })}
                  className="h-4 w-4 text-orange-500 rounded"
                />
                <span className="text-xs font-medium text-gray-700">In stock</span>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Avail. qty</label>
                <input
                  type="number"
                  min={0}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  value={formData.available_quantity || ""}
                  onChange={(e) => setFormData({ ...formData, available_quantity: e.target.value || "" })}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Low stock at</label>
                <input
                  type="number"
                  min={0}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  value={formData.low_stock_threshold || ""}
                  onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value || "" })}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Prep / ETA (min)</label>
                <input
                  type="number"
                  min={0}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  value={formData.preparation_time_minutes ?? 15}
                  onChange={(e) =>
                    setFormData({ ...formData, preparation_time_minutes: Number(e.target.value) || 15 })
                  }
                />
                {storeDefaults?.avg_preparation_time_minutes != null && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Store default: {storeDefaults.avg_preparation_time_minutes} min
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Serves (label)</label>
                <select
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  value={formData.serves_label || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      serves_label: e.target.value,
                      serves: e.target.value ? Number((e.target.value.match(/\d+/) || ["1"])[0]) : formData.serves,
                    })
                  }
                >
                  <option value="">Select serves</option>
                  {SERVES_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Item size</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={0}
                    className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                    value={formData.item_size_value}
                    onChange={(e) => setFormData({ ...formData, item_size_value: e.target.value })}
                    placeholder="e.g. 500"
                  />
                  <select
                    className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                    value={formData.item_size_unit}
                    onChange={(e) => setFormData({ ...formData, item_size_unit: e.target.value })}
                  >
                    <option value="">Unit</option>
                    {SIZE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-gray-100">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-3 max-w-md">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700">Packaging charge for this item</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Uses your store default from settings when you turn this on; you can change the amount for this item
                      only.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.packaging_enabled}
                    onClick={() => {
                      const on = !formData.packaging_enabled;
                      const defAmt = storeDefaults?.packaging_charge_amount;
                      const fromStore =
                        defAmt != null && Number.isFinite(Number(defAmt))
                          ? String(Number(defAmt))
                          : "";
                      setFormData({
                        ...formData,
                        packaging_enabled: on,
                        packaging_charges: on
                          ? fromStore !== ""
                            ? fromStore
                            : formData.packaging_charges?.trim() || ""
                          : "",
                      });
                    }}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 ${
                      formData.packaging_enabled ? "bg-orange-500" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 translate-y-px rounded-full bg-white shadow transition ${
                        formData.packaging_enabled ? "translate-x-[1.35rem]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
                {formData.packaging_enabled && (
                  <div className="mt-1.5 flex flex-col gap-1 max-w-md">
                    <label className="text-xs font-medium text-gray-600">Amount (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder={
                        storeDefaults?.packaging_charge_amount != null
                          ? `e.g. ${Number(storeDefaults.packaging_charge_amount).toFixed(0)}`
                          : "Amount (₹)"
                      }
                      value={formData.packaging_charges}
                      onChange={(e) => setFormData({ ...formData, packaging_charges: e.target.value })}
                    />
                    {storeDefaults?.packaging_charge_amount != null && (
                      <p className="text-[10px] text-gray-500">
                        Store default: ₹{Number(storeDefaults.packaging_charge_amount).toFixed(2)} (merchant_stores) —
                        saved on this item only
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-800">Delivery & nutrition (optional)</p>
              <div className="flex items-center justify-between gap-3 max-w-md">
                <span className="text-xs font-medium text-gray-700">Available for delivery</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.available_for_delivery}
                  onClick={() => {
                    const cur = formData.available_for_delivery !== false;
                    setFormData({ ...formData, available_for_delivery: !cur });
                  }}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 ${
                    formData.available_for_delivery ? "bg-orange-500" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 translate-y-px rounded-full bg-white shadow transition ${
                      formData.available_for_delivery ? "translate-x-[1.35rem]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
              <p className="text-[10px] text-gray-500">Per serving ≈ one adult portion (same as merchant app).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Weight per serving</label>
                  <div className="flex gap-1.5 mt-0.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder="e.g. 500"
                      value={formData.weight_per_serving}
                      onChange={(e) => setFormData({ ...formData, weight_per_serving: e.target.value })}
                    />
                    <select
                      className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                      value={formData.weight_per_serving_unit}
                      onChange={(e) => setFormData({ ...formData, weight_per_serving_unit: e.target.value })}
                    >
                      {WEIGHT_PER_SERVING_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Calories (kcal)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm mt-0.5"
                    placeholder="e.g. 300"
                    value={formData.calories_kcal}
                    onChange={(e) => setFormData({ ...formData, calories_kcal: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Protein</label>
                  <div className="flex gap-1.5 mt-0.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder="e.g. 50"
                      value={formData.protein}
                      onChange={(e) => setFormData({ ...formData, protein: e.target.value })}
                    />
                    <select
                      className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                      value={formData.protein_unit}
                      onChange={(e) => setFormData({ ...formData, protein_unit: e.target.value })}
                    >
                      {NUTRIENT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {nutritionExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Carbohydrates</label>
                    <div className="flex gap-1.5 mt-0.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                        value={formData.carbohydrates}
                        onChange={(e) => setFormData({ ...formData, carbohydrates: e.target.value })}
                      />
                      <select
                        className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                        value={formData.carbohydrates_unit}
                        onChange={(e) => setFormData({ ...formData, carbohydrates_unit: e.target.value })}
                      >
                        {NUTRIENT_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Fat</label>
                    <div className="flex gap-1.5 mt-0.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                        value={formData.fat}
                        onChange={(e) => setFormData({ ...formData, fat: e.target.value })}
                      />
                      <select
                        className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                        value={formData.fat_unit}
                        onChange={(e) => setFormData({ ...formData, fat_unit: e.target.value })}
                      >
                        {NUTRIENT_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-600">Fibre</label>
                    <div className="flex gap-1.5 mt-0.5 max-w-md">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                        value={formData.fibre}
                        onChange={(e) => setFormData({ ...formData, fibre: e.target.value })}
                      />
                      <select
                        className="w-1/2 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                        value={formData.fibre_unit}
                        onChange={(e) => setFormData({ ...formData, fibre_unit: e.target.value })}
                      >
                        {NUTRIENT_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {!nutritionExpanded && (
                <button
                  type="button"
                  className="text-xs font-medium text-orange-600 hover:text-orange-700"
                  onClick={() => setNutritionExpanded(true)}
                >
                  View more (carbs, fat, fibre)
                </button>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600">Item tags (comma-separated)</label>
                <input
                  type="text"
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm mt-0.5"
                  placeholder="e.g. High protein, Chef special"
                  value={formData.item_tags}
                  onChange={(e) => setFormData({ ...formData, item_tags: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1 border-t border-gray-100">
              <p className="w-full text-[10px] text-gray-500 -mb-1">
                Customizations and variants are added in the next tab; flags below save with this step.
              </p>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={formData.is_popular}
                  onChange={(e) => setFormData({ ...formData, is_popular: e.target.checked })}
                  className="h-3.5 w-3.5 text-orange-500 rounded"
                />
                <span className="text-xs text-gray-700">Popular</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={formData.is_recommended}
                  onChange={(e) => setFormData({ ...formData, is_recommended: e.target.checked })}
                  className="h-3.5 w-3.5 text-orange-500 rounded"
                />
                <span className="text-xs text-gray-700">Recommended</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-3.5 w-3.5 text-orange-500 rounded"
                />
                <span className="text-xs text-gray-700">Active</span>
              </label>
            </div>
          </div>
        )}

        {activeSection === "customization" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Customizations & add-ons (extra cheese, spice level, etc.). Max {CUSTOMIZATION_VARIANT_LIMIT} total. Current: {totalOptionsCount}/{CUSTOMIZATION_VARIANT_LIMIT}
            </p>
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">
                {editingCustomizationIndex !== null ? "Edit" : "Add"} customization group
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-600">Group name *</label>
                  <input
                    type="text"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    value={newCustomization.customization_title}
                    onChange={(e) =>
                      setNewCustomization({ ...newCustomization, customization_title: e.target.value })
                    }
                    placeholder="e.g. Toppings"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Type</label>
                  <select
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    value={newCustomization.customization_type}
                    onChange={(e) =>
                      setNewCustomization({ ...newCustomization, customization_type: e.target.value as "Checkbox" })
                    }
                  >
                    {CUSTOMIZATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Min / Max</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min={0}
                      className="w-12 px-2 py-1.5 border border-gray-200 rounded text-sm"
                      value={newCustomization.min_selection}
                      onChange={(e) =>
                        setNewCustomization({ ...newCustomization, min_selection: Number(e.target.value) })
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      className="w-12 px-2 py-1.5 border border-gray-200 rounded text-sm"
                      value={newCustomization.max_selection}
                      onChange={(e) =>
                        setNewCustomization({ ...newCustomization, max_selection: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-4 flex items-center gap-3">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={newCustomization.is_required}
                      onChange={(e) =>
                        setNewCustomization({ ...newCustomization, is_required: e.target.checked })
                      }
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs text-gray-700">Required</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddCustomization}
                    disabled={atOptionsLimit && editingCustomizationIndex === null}
                    className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingCustomizationIndex !== null ? "Update" : "Add group"}
                  </button>
                  {editingCustomizationIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewCustomization({ ...defaultNewCustomization, display_order: customizations.length });
                        setEditingCustomizationIndex(null);
                      }}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
            {customizations.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-700">
                  Existing groups ({customizations.length})
                </h3>
                {customizations.map((cust, custIndex) => (
                  <div key={custIndex} className="border border-gray-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900">{cust.customization_title}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {cust.customization_type} {cust.min_selection}-{cust.max_selection}
                        </span>
                        <span className="text-xs ml-1">
                          {cust.is_required ? (
                            <span className="text-red-600">Required</span>
                          ) : (
                            <span className="text-gray-500">Optional</span>
                          )}
                          <span className="text-gray-400"> · Min {cust.min_selection} / Max {cust.max_selection}</span>
                        </span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditCustomization(custIndex)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          aria-label="Edit group"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomization(custIndex)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          aria-label="Delete group"
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddAddon(custIndex)}
                          className="text-xs text-orange-600 font-medium px-1.5 py-0.5"
                        >
                          Add add-on
                        </button>
                      </div>
                    </div>
                    {cust.addons && cust.addons.length > 0 ? (
                      <div className="mt-2 pl-2 border-l border-gray-200 space-y-1">
                        {cust.addons.map((addon, addonIndex) => (
                          <div key={addonIndex} className="flex items-center gap-2">
                            <input
                              type="text"
                              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs"
                              value={addon.addon_name}
                              onChange={(e) =>
                                handleUpdateAddon(custIndex, addonIndex, "addon_name", e.target.value)
                              }
                              placeholder="Add-on name (e.g. Extra cheese)"
                            />
                            <span className="text-gray-500 text-xs">₹</span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-14 px-2 py-1 border border-gray-200 rounded text-xs"
                              value={addon.addon_price}
                              onChange={(e) =>
                                handleUpdateAddon(custIndex, addonIndex, "addon_price", Number(e.target.value))
                              }
                              placeholder="0"
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteAddon(custIndex, addonIndex)}
                              className="text-xs font-medium text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-2">No add-ons in this group.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 py-2">No customizations added yet. Create a group above.</p>
            )}
            <div className="border-t border-gray-200 pt-3">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">
                Variants (optional) — size, half/full, etc.
                {(formData.customizations?.length || 0) + (formData.variants?.length || 0) >=
                  CUSTOMIZATION_VARIANT_LIMIT && (
                  <span className="text-amber-600 font-normal ml-1">· Max {CUSTOMIZATION_VARIANT_LIMIT} total</span>
                )}
              </h3>
              {(formData.variants || []).length > 0 && (
                <p className="text-xs text-gray-500 mb-2">Existing variants ({(formData.variants || []).length})</p>
              )}
              {(formData.variants || []).map((v, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-end gap-3 mb-3 p-2.5 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="min-w-[140px]">
                    <label className="text-xs text-gray-600 block mb-0.5">Variant name *</label>
                    <input
                      type="text"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      value={v.variant_name}
                      onChange={(e) => {
                        const vars = [...(formData.variants || [])];
                        vars[idx] = { ...vars[idx], variant_name: e.target.value };
                        setFormData({
                          ...formData,
                          variants: vars,
                          has_variants: vars.some((v) => (v.variant_name || "").trim().length > 0),
                        });
                      }}
                      placeholder="e.g. Half, Full"
                    />
                  </div>
                  <div className="min-w-[100px]">
                    <label className="text-xs text-gray-600 block mb-0.5">Variant price (₹) *</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      value={typeof v.variant_price === "number" ? v.variant_price : ""}
                      onChange={(e) => {
                        const vars = [...(formData.variants || [])];
                        vars[idx] = { ...vars[idx], variant_price: Number(e.target.value) || 0 };
                        setFormData({
                          ...formData,
                          variants: vars,
                          has_variants: vars.some((v) => (v.variant_name || "").trim().length > 0),
                        });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const vars = (formData.variants || []).filter((_, i) => i !== idx);
                      setFormData({ ...formData, variants: vars, has_variants: vars.length > 0 });
                    }}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded self-end"
                    aria-label="Remove variant"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={
                  (formData.customizations?.length || 0) + (formData.variants?.length || 0) >=
                  CUSTOMIZATION_VARIANT_LIMIT
                }
                onClick={() => {
                  const vars = [
                    ...(formData.variants || []),
                    {
                      variant_id: "",
                      variant_name: "",
                      variant_type: "",
                      variant_price: 0,
                      menu_item_id: 0,
                    } as Variant,
                  ];
                  setFormData({ ...formData, variants: vars, has_variants: true });
                }}
                className="mt-2 px-3 py-1.5 bg-orange-500 text-white rounded text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add variant
              </button>
            </div>

            {storeId && currentItemId && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-xs font-semibold text-gray-700 mb-2">Linked addon groups</h3>
                <p className="text-xs text-gray-500 mb-2">Reusable addon groups from Addon Library. Link or unlink below.</p>
                {linkedAddonGroups.length > 0 && (
                  <ul className="space-y-1.5 mb-2">
                    {linkedAddonGroups.map((link) => (
                      <li key={link.id} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded border border-gray-100">
                        <span className="text-sm font-medium text-gray-900">{link.group?.title ?? "—"}</span>
                        <div className="flex items-center gap-1">
                          {link.group?.options_count != null && (
                            <span className="text-xs text-gray-500">{link.group.options_count} options</span>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              const itemId = typeof currentItemId === "string" ? parseInt(currentItemId, 10) : currentItemId;
                              if (!Number.isFinite(itemId)) return;
                              try {
                                const r = await fetch(
                                  `/api/merchant/stores/${storeId}/menu/items/${itemId}/modifier-groups/${link.id}`,
                                  { method: "DELETE" }
                                );
                                if (r.ok) setLinkedAddonGroups((prev) => prev.filter((l) => l.id !== link.id));
                              } catch {}
                            }}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLinkAddonPicker(true)}
                    className="px-3 py-1.5 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded hover:bg-orange-100"
                  >
                    Add existing group
                  </button>
                  {onSwitchToAddonLibrary ? (
                    <button type="button" onClick={onSwitchToAddonLibrary} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200">
                      Create new group (Addon Library)
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500 self-center">Go to Addon Library tab to create a new group.</span>
                  )}
                </div>
                {showLinkAddonPicker && (
                  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowLinkAddonPicker(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                      <div className="p-3 border-b font-semibold text-gray-900">Link addon group</div>
                      <div className="overflow-auto p-3 space-y-1">
                        {allGroupsForPicker
                          .filter((g) => !linkedAddonGroups.some((l) => l.modifier_group_id === g.id))
                          .map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={async () => {
                                const itemId = typeof currentItemId === "string" ? parseInt(currentItemId, 10) : currentItemId;
                                if (!Number.isFinite(itemId)) return;
                                try {
                                  const r = await fetch(`/api/merchant/stores/${storeId}/menu/items/${itemId}/modifier-groups`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ modifier_group_id: g.id }),
                                  });
                                  if (r.ok) {
                                    setLinkedAddonGroups((prev) => [...prev, { id: 0, modifier_group_id: g.id, group: { title: g.title, options_count: g.options_count } }]);
                                    const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${itemId}/modifier-groups`);
                                    const j = await res.json();
                                    if (j?.linkedModifierGroups)
                                      setLinkedAddonGroups(
                                        j.linkedModifierGroups.map((l: any) => ({
                                          id: l.id,
                                          modifier_group_id: l.modifier_group_id,
                                          group: { title: l.group?.title ?? "", options_count: l.group?.options?.length ?? 0 },
                                        }))
                                      );
                                    setShowLinkAddonPicker(false);
                                  }
                                } catch {}
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:bg-orange-50 text-sm"
                            >
                              <span className="flex flex-col items-start">
                                <span className="font-semibold text-gray-900">
                                  #{g.id} · {g.title}
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  {g.options_count} option{g.options_count === 1 ? "" : "s"}
                                </span>
                              </span>
                            </button>
                          ))}
                        {allGroupsForPicker.filter((g) => !linkedAddonGroups.some((l) => l.modifier_group_id === g.id)).length === 0 && (
                          <p className="text-sm text-gray-500 py-4 text-center">No other groups to link. Create one in Addon Library tab.</p>
                        )}
                      </div>
                      <div className="p-3 border-t">
                        <button type="button" onClick={() => setShowLinkAddonPicker(false)} className="px-3 py-1.5 rounded border border-gray-300 text-sm font-medium">
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          {activeSection === "main" ? (
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
              disabled={
                isSaving ||
                !!imageValidationError ||
                isBaseInvalid ||
                isSellInvalid ||
                !formData.base_price ||
                !formData.selling_price
              }
            >
              {isSaving && (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {isSaving ? "Saving..." : onSaveAndNext ? "Save and Next" : isEdit ? "Save" : "Add Item"}
            </button>
          ) : (
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
              disabled={isSaving}
            >
              {isSaving && (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {isSaving ? "Saving..." : "Submit"}
            </button>
          )}
        </div>
        {error && <div className="text-red-500 text-xs mt-2">{error}</div>}
      </form>
    </div>
  );
}
