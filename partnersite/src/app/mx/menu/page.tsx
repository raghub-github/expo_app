"use client";

// Default placeholder for menu items when no image is set (restaurant-style)
const ITEM_PLACEHOLDER_SVG = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" fill="#f3f4f6"/><path d="M32 18c-5 0-9 4-9 9s4 9 9 9 9-4 9-9-4-9-9-9zm0 14c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="#d1d5db"/><path d="M20 38l4 12h16l4-12H20z" fill="#9ca3af"/><ellipse cx="32" cy="44" rx="12" ry="3" fill="#e5e7eb"/></svg>'
);

function isMenuItemLockedByPlan(item: { is_locked_by_plan?: boolean }): boolean {
  return item.is_locked_by_plan === true;
}

function menuItemLockBadgeLabel(item: { locked_reason?: string | null }): string {
  return item.locked_reason === 'manual_admin_lock' ? 'Admin locked' : 'Plan locked';
}

function menuItemLockHint(item: { locked_reason?: string | null }): string {
  return item.locked_reason === 'manual_admin_lock'
    ? 'Locked by admin — hidden from customers.'
    : 'Plan limit reached — hidden from customers. Upgrade to unlock.';
}

// Helper to generate menu item id like GMI1001, GMI1002, ...
function generateMenuItemId() {
  if (typeof window !== 'undefined') {
    let counter = parseInt(localStorage.getItem('menuItemIdCounter') || '1000', 10);
    counter += 1;
    localStorage.setItem('menuItemIdCounter', counter.toString());
    return `GMI${counter}`;
  }
  return `GMI${Math.floor(Math.random() * 9000) + 1000}`;
}
// --- MenuItem and Customization Types ---
interface MenuItem {
  id: number;
  item_id: string;
  item_name: string;
  category_id: number | null;
  category_type?: string;
  food_category_item?: string;
  base_price: number;
  selling_price: number;
  discount_percentage: number;
  tax_percentage: number;
  in_stock?: boolean;
  out_of_stock_manual?: boolean;
  out_of_stock_until?: string | null;
  out_of_stock_updated_at?: string | null;
  has_customizations?: boolean;
  has_addons?: boolean;
  has_variants?: boolean;
  is_popular?: boolean;
  is_recommended?: boolean;
  item_image_url?: string;
  item_description?: string;
  // removed duplicate/conflicting discount_percentage and tax_percentage
  available_quantity?: number;
  low_stock_threshold?: number;
  preparation_time_minutes?: number;
  packaging_charges?: number | null;
  serves?: number;
  allergens?: string[];
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
  item_tags?: string[] | null;
  customizations?: Customization[];
  variants?: Variant[];
  linked_modifier_groups?: Array<{
    id: number;
    modifier_group_id: number;
    title: string;
    description?: string | null;
    is_required?: boolean;
    min_selection?: number;
    max_selection?: number;
    display_order?: number;
    options?: Array<{
      id: number;
      option_id?: string;
      name: string;
      price_delta?: number | string;
      in_stock?: boolean;
      display_order?: number;
    }>;
  }>;
  food_type?: string;
  spice_level?: string;
  cuisine_type?: string;
  is_active?: boolean;
  is_deleted?: boolean | null;
  store_id?: number;
  is_locked_by_plan?: boolean;
  locked_reason?: string | null;
  approval_status?: string | null;
  primary_image_moderation_status?: string | null;
  image_count?: number | null;
  rejection_reason?: string | null;
}

interface Customization {
  id?: number;
  customization_id: string;
  menu_item_id: number;
  customization_title: string;
  customization_type?: string;
  is_required: boolean;
  min_selection: number;
  max_selection: number;
  display_order: number;
  addons?: Addon[];
}

interface Addon {
  id?: number;
  addon_id: string;
  customization_id: number;
  addon_name: string;
  addon_price: number;
  addon_image_url?: string;
  in_stock?: boolean;
  display_order?: number;
}

interface Variant {
  id?: number;
  variant_id: string;
  menu_item_id: number;
  variant_name: string;
  variant_type?: string;
  variant_price: number;
  price_difference?: number;
  in_stock?: boolean;
  available_quantity?: number;
  sku?: string;
  barcode?: string;
  display_order?: number;
  is_default?: boolean;
  /** Optional packaging-size display (e.g. "500 ml") rendered next to the name. */
  variant_size_value?: string | number | null;
  variant_size_unit?: string | null;
}

type MenuCombo = {
  id: number;
  combo_name: string;
  description: string | null;
  combo_price: number;
  image_url: string | null;
  is_active?: boolean | null;
  is_deleted?: boolean | null;
  display_order?: number | null;
  out_of_stock_manual?: boolean;
  out_of_stock_until?: string | null;
  out_of_stock_updated_at?: string | null;
};

function itemHasCustomizationContent(item: MenuItem): boolean {
  if (item.has_customizations || item.has_variants || item.has_addons) return true;
  if ((item.customizations?.length ?? 0) > 0) return true;
  if ((item.variants?.length ?? 0) > 0) return true;
  if ((item.linked_modifier_groups?.length ?? 0) > 0) return true;
  return false;
}

import React, { useState, useEffect, Suspense, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, X, Upload, Package, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Image as ImageIcon, Info, Search, FileText, Eye, LayoutGrid, ListTree, SlidersHorizontal, Lock } from 'lucide-react'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext'
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton'
import { 
  fetchStoreById, 
  fetchStoreByName, 
  fetchMenuItems,
  deleteMenuItem, 
  getImageUploadStatus, 
  fetchMenuCategories, 
  createMenuCategory, 
  updateMenuCategory, 
  deleteMenuCategory,
  fetchCustomizationsForMenuItem,
  fetchAddonsForCustomization,
  fetchVariantsForMenuItem,
} from '@/lib/database'
import { MenuItemsGridSkeleton, MenuPageSkeleton } from '@/components/PageSkeleton'
import { R2Image } from '@/components/R2Image'
import { CatalogItemPhotoModal } from '@/components/menu/CatalogItemPhotoModal'
import {
  CatalogPhotoUploadOptionsModal,
  type CatalogPhotoUploadCallbacks,
} from '@/components/menu/CatalogPhotoUploadOptionsModal'
import {
  itemHasCatalogPhoto,
  itemPhotoInReview,
  itemPhotoRejected,
} from '@/lib/catalog-photo-helpers'
import { markPlanEnforceRan, shouldRunPlanEnforce } from '@/lib/plan-usage-cache'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { linkItemCuisineSelectionsToStoreProfile } from '@/lib/linkItemCuisinesToStore'
import { normalizeMenuItemImageFile, validateMenuItemImageFile } from '@/lib/menuItemImageValidationClient'
import { persistPartnerSelectedStoreId, readPartnerSelectedStoreId } from '@/lib/partner-selected-store'
import { useQueryClient } from '@tanstack/react-query'
import { merchantKeys } from '@/lib/query-keys'

// --- Menu Category interface ---
type MerchantStore = {
  id?: number;
  store_id: string;
  store_name: string;
  avg_preparation_time_minutes?: number | null;
  packaging_charge_amount?: number | null;
};

interface MenuCategory {
  id: number;
  store_id: number;
  category_name: string;
  parent_category_id?: number | null;
  display_order?: number | null;
  is_active?: boolean;
  out_of_stock_manual?: boolean;
  out_of_stock_until?: string | null;
  out_of_stock_updated_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

function formatCategoryLabel(categories: MenuCategory[], categoryId: number | null | undefined): string {
  if (categoryId == null) return 'Uncategorized';
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return 'Uncategorized';
  if (cat.parent_category_id) {
    const parent = categories.find((c) => c.id === cat.parent_category_id);
    return parent ? `${parent.category_name} (${cat.category_name})` : cat.category_name;
  }
  return cat.category_name;
}

const CUSTOMIZATION_VARIANT_LIMIT = 10;

const WEIGHT_PER_SERVING_UNITS = ['grams', 'kg', 'oz', 'lbs'] as const;
const NUTRIENT_UNITS = ['mg', 'g'] as const;

function mxNutritionPayloadFromForm(form: Record<string, unknown>) {
  const parseOpt = (s: unknown): number | null => {
    const t = String(s ?? '').trim();
    if (!t) return null;
    const n = Number(t.replace(/,/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const tags = form.item_tags
    ? String(form.item_tags)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  return {
    available_for_delivery: form.available_for_delivery !== false,
    weight_per_serving: parseOpt(form.weight_per_serving),
    weight_per_serving_unit: (form.weight_per_serving_unit as string) || 'grams',
    calories_kcal: parseOpt(form.calories_kcal),
    protein: parseOpt(form.protein),
    protein_unit: (form.protein_unit as string) || 'mg',
    carbohydrates: parseOpt(form.carbohydrates),
    carbohydrates_unit: (form.carbohydrates_unit as string) || 'mg',
    fat: parseOpt(form.fat),
    fat_unit: (form.fat_unit as string) || 'mg',
    fibre: parseOpt(form.fibre),
    fibre_unit: (form.fibre_unit as string) || 'mg',
    item_tags: tags.length ? tags : null,
  };
}

const MENU_CSV_MIN_ROWS = 1;
const MENU_CSV_MAX_ROWS = 500;
function validateMenuCsv(file: File): Promise<{ valid: true } | { valid: false; error: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string) || '';
      const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        resolve({ valid: false, error: 'CSV is empty.' });
        return;
      }
      const headers = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
      const rowCount = lines.length - 1;
      if (rowCount < MENU_CSV_MIN_ROWS) {
        resolve({ valid: false, error: `Minimum ${MENU_CSV_MIN_ROWS} data row(s) required (excluding header).` });
        return;
      }
      if (rowCount > MENU_CSV_MAX_ROWS) {
        resolve({ valid: false, error: `Maximum ${MENU_CSV_MAX_ROWS} rows allowed. You have ${rowCount}.` });
        return;
      }
      const hasName = ['item_name', 'name'].some((h) => headers.includes(h));
      const hasPrice = ['price', 'base_price', 'selling_price'].some((h) => headers.includes(h));
      if (!hasName) {
        resolve({ valid: false, error: 'CSV must have a column: item_name or name.' });
        return;
      }
      if (!hasPrice) {
        resolve({ valid: false, error: 'CSV must have a column: price, base_price, or selling_price.' });
        return;
      }
      resolve({ valid: true });
    };
    reader.onerror = () => resolve({ valid: false, error: 'Could not read file.' });
    reader.readAsText(file, 'UTF-8');
  });
}

interface ItemFormProps {
  isEdit?: boolean;
  /** When true, all fields are read-only and only a Close button is shown (view details in merchant portal). */
  readOnly?: boolean;
  formData: any;
  setFormData: (data: any) => void;
  imagePreview: string;
  setImagePreview: (url: string) => void;
  onProcessImage: (file: File, isEdit: boolean) => void;
  /** Called when main tab "Save and Next" is clicked - save item then switch to options tab */
  onSaveAndNext?: () => Promise<void>;
  /** Called when customization tab "Submit" is clicked - save options and close */
  onSubmitOptions?: () => Promise<void>;
  /** Legacy: single submit (used when onSaveAndNext/onSubmitOptions not provided) */
  onSubmit?: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string;
  title: string;
  categories: MenuCategory[];
  currentItemId?: string;
  imageUploadAllowed?: boolean;
  imageLimitReached?: boolean;
  imageUsed?: number;
  imageLimit?: number | null;
  /** Slots left (limit - used). Shown on button when not at limit. */
  imageSlotsLeft?: number | null;
  /** Max cuisines selectable per item (from plan). Null = no limit. */
  maxCuisinesPerItem?: number | null;
  /** Shown under image box; blocks submit when set */
  imageValidationError?: string;
  /** True while aspect-ratio/size validation is in progress */
  imageValidating?: boolean;
  /** Center 1:1 crop + resize after validation failed */
  onNormalizeMenuItemImage?: () => void | Promise<void>;
  /** Dynamic cuisine options loaded for this store; falls back to default list if empty. */
  cuisineOptions?: string[];
  storeDefaults?: {
    avg_preparation_time_minutes?: number | null;
    packaging_charge_amount?: number | null;
  };
}

export const dynamic = 'force-dynamic'

// Food type options — same values as merchant app and dashboard (DB stores VEG, NON_VEG, EGG, Vegan)
const FOOD_TYPES = [
  { value: 'VEG', label: 'Veg' },
  { value: 'NON_VEG', label: 'Non-Veg' },
  { value: 'EGG', label: 'Egg' },
  { value: 'Vegan', label: 'Vegan' },
];
const SPICE_LEVELS = ['Mild', 'Medium', 'Hot', 'Very Hot'];
function normalizeSpiceLevelForForm(v: string | null | undefined): string {
  if (v == null || v === '') return '';
  const u = String(v).trim().toLowerCase();
  if (u === 'mild') return 'Mild';
  if (u === 'medium') return 'Medium';
  if (u === 'hot') return 'Hot';
  if (u === 'very hot' || u === 'very_hot' || u === 'extra_hot') return 'Very Hot';
  return String(v).trim();
}
function normalizeFoodTypeForForm(v: string | null | undefined): string {
  if (v == null || v === '') return '';
  const u = String(v).trim();
  const upper = u.toUpperCase();
  if (upper === 'VEG' || u === 'Vegetarian') return 'VEG';
  if (upper === 'NON_VEG' || u === 'Non-Vegetarian' || u === 'Non-Veg') return 'NON_VEG';
  if (upper === 'EGG' || u === 'Eggitarian' || u === 'Egg') return 'EGG';
  if (u === 'Vegan') return 'Vegan';
  return u;
}
// Default cuisine list (used as seed; UI will merge with cuisines from DB per store)
const CUISINE_TYPES = [
  'North Indian', 'Chinese', 'Fast Food', 'South Indian', 'Biryani', 'Pizza', 'Bakery', 'Street Food', 'Burger', 'Mughlai', 'Momos', 'Sandwich', 'Mithai', 'Rolls', 'Beverages', 'Desserts', 'Cafe', 'Healthy Food', 'Maharashtrian', 'Tea', 'Bengali', 'Ice Cream', 'Juices', 'Shake', 'Shawarma', 'Gujarati', 'Italian', 'Continental', 'Lebanese', 'Salad', 'Andhra', 'Waffle', 'Coffee', 'Kebab', 'Arabian', 'Kerala', 'Asian', 'Seafood', 'Pasta', 'BBQ', 'Rajasthani', 'Wraps', 'Paan', 'Hyderabadi', 'Mexican', 'Bihari', 'Goan', 'Assamese', 'American', 'Mandi', 'Chettinad', 'Mishti', 'Bar Food', 'Malwani', 'Odia', 'Roast Chicken', 'Tamil', 'Japanese', 'Finger Food', 'Korean', 'North Eastern', 'Thai', 'Kathiyawadi', 'Bubble Tea', 'Mangalorean', 'Burmese', 'Sushi', 'Lucknowi', 'Modern Indian', 'Tibetan', 'Afghan', 'Oriental', 'Pancake', 'Kashmiri', 'Middle Eastern', 'Grocery', 'Konkan', 'European', 'Awadhi', 'Hot dogs', 'Sindhi', 'Turkish', 'Naga', 'Mediterranean', 'Nepalese', 'Cuisine Varies', 'Saoji', 'Charcoal Chicken', 'Steak', 'Frozen Yogurt', 'Panini', 'Parsi', 'Sichuan', 'Iranian', 'Grilled Chicken', 'French', 'Raw Meats', 'Drinks Only', 'Vietnamese', 'Liquor', 'Greek', 'Himachali', 'Bohri', 'Garhwali', 'Cantonese', 'Malaysian', 'Belgian', 'British', 'African', 'Spanish', 'Manipuri', 'Egyptian', 'Sri Lankan', 'Relief fund', 'Bangladeshi', 'Indonesian', 'Tex-Mex', 'Irish', 'Singaporean', 'South American', 'Mongolian', 'German', 'Russian', 'Brazilian', 'Pakistani', 'Australian', 'Moroccan', 'Filipino', 'Hot Pot', 'Retail Products', 'Mizo', 'Portuguese', 'Indian', 'Tripuri', 'Delight Goodies', 'Meghalayan', 'Sikkimese', 'Armenian', 'Afghani',
];
const CUISINE_TOP_COUNT = 7;

// Customization types
const CUSTOMIZATION_TYPES = ['Radio', 'Checkbox', 'Dropdown', 'Text'];

function ItemForm(props: ItemFormProps) {
  const {
    isEdit = false,
    readOnly = false,
    formData,
    setFormData,
    imagePreview,
    setImagePreview,
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
    imageUploadAllowed = true,
    imageLimitReached = false,
    imageUsed = 0,
    imageLimit = null,
    imageSlotsLeft = null,
    maxCuisinesPerItem = null,
    imageValidationError,
    imageValidating = false,
    onNormalizeMenuItemImage,
    cuisineOptions,
    storeDefaults,
  } = props;

  const categoryPickerRef = React.useRef<HTMLDivElement>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryPickerQuery, setCategoryPickerQuery] = useState('');

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
        key: 'orphan',
        title: 'Other',
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
          const b = row.subName?.toLowerCase() ?? '';
          return a.includes(q) || b.includes(q) || `${a} ${b}`.includes(q);
        }),
      }))
      .filter((sec) => sec.rows.length > 0);
  }, [categorySections, categoryPickerQuery]);

  const categoryButtonLabel = useMemo(() => {
    if (formData.category_id == null) return 'Select category';
    const cat = categories.find((c) => c.id === formData.category_id);
    if (!cat) return 'Select category';
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
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [categoryPickerOpen]);

  const ALL_CUISINES: string[] = Array.isArray(cuisineOptions) && cuisineOptions.length > 0
    ? Array.from(new Set([...cuisineOptions, ...CUISINE_TYPES]))
    : CUISINE_TYPES;

  const selectedCuisines: string[] = formData.cuisine_type
    ? String(formData.cuisine_type).split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];
  const cuisineLimit = maxCuisinesPerItem ?? 10;
  const cuisineAtLimit = selectedCuisines.length >= cuisineLimit;
  const toggleCuisine = (cuisine: string) => {
    const next = selectedCuisines.includes(cuisine)
      ? selectedCuisines.filter((c: string) => c !== cuisine)
      : cuisineAtLimit
        ? selectedCuisines
        : [...selectedCuisines, cuisine];
    setFormData({ ...formData, cuisine_type: next.length ? next.join(', ') : '' });
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Auto-calculate selling price from base discount (tax comes from agreement later, not shown here)
  useEffect(() => {
    const base = parseFloat(formData.base_price) || 0;
    const discount = parseFloat(formData.discount_percentage) || 0;
    if (base > 0) {
      const selling = base - (base * discount / 100);
      if (!isNaN(selling)) {
        setFormData((prev: any) => ({ ...prev, selling_price: selling.toFixed(2) }));
      }
    } else {
      setFormData((prev: any) => ({ ...prev, selling_price: '' }));
    }
  }, [formData.base_price, formData.discount_percentage, setFormData]);

  const [activeSection, setActiveSection] = useState<'main' | 'customization'>('main');
  const [showFoodDropdown, setShowFoodDropdown] = useState(false);
  const [cuisineSearch, setCuisineSearch] = useState('');
  const [cuisineViewMore, setCuisineViewMore] = useState(false);
  const [nutritionExpanded, setNutritionExpanded] = useState(false);
  const [customizations, setCustomizations] = useState<Customization[]>(formData.customizations || []);
  useEffect(() => {
    setCustomizations(formData.customizations || []);
  }, [formData.customizations?.length, currentItemId]);
  const [newCustomization, setNewCustomization] = useState({
    customization_title: '',
    customization_type: 'Checkbox',
    is_required: false,
    min_selection: 0,
    max_selection: 1,
    display_order: 0
  });
  const [editingCustomizationIndex, setEditingCustomizationIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!showFoodDropdown) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.food-dropdown-root')) {
        setShowFoodDropdown(false);
      }
    }
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [showFoodDropdown]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      onProcessImage(file, isEdit);
    }
  };

  const openFilePicker = () => {
    if (imageLimitReached) return;
    if (!imageUploadAllowed) return;
    fileInputRef.current?.click();
  };

  const totalOptionsCount = (formData.customizations?.length || 0) + (formData.variants?.length || 0);
  const atOptionsLimit = totalOptionsCount >= CUSTOMIZATION_VARIANT_LIMIT;

  const handleAddCustomization = () => {
    if (!newCustomization.customization_title.trim()) {
      toast.error('Customization title is required');
      return;
    }
    if (totalOptionsCount >= CUSTOMIZATION_VARIANT_LIMIT) {
      toast.error(`Max ${CUSTOMIZATION_VARIANT_LIMIT} customizations & variants allowed.`);
      return;
    }

    const updatedCustomizations = [...customizations];
    if (editingCustomizationIndex !== null) {
      updatedCustomizations[editingCustomizationIndex] = {
        ...newCustomization,
        customization_id: (customizations[editingCustomizationIndex]?.customization_id ?? ''),
        menu_item_id: (customizations[editingCustomizationIndex]?.menu_item_id ?? 0),
        addons: updatedCustomizations[editingCustomizationIndex]?.addons || []
      };
      setEditingCustomizationIndex(null);
    } else {
      updatedCustomizations.push({
        ...newCustomization,
        customization_id: '',
        menu_item_id: 0,
        addons: []
      });
    }

    setCustomizations(updatedCustomizations);
    setFormData({ ...formData, customizations: updatedCustomizations, has_customizations: updatedCustomizations.length > 0 });
    setNewCustomization({
      customization_title: '',
      customization_type: 'Checkbox',
      is_required: false,
      min_selection: 0,
      max_selection: 1,
      display_order: updatedCustomizations.length
    });
  };

  const handleEditCustomization = (index: number) => {
    const cust = customizations[index];
    setNewCustomization({
      customization_title: cust.customization_title,
      customization_type: cust.customization_type || 'Checkbox',
      is_required: cust.is_required,
      min_selection: cust.min_selection,
      max_selection: cust.max_selection,
      display_order: cust.display_order
    });
    setEditingCustomizationIndex(index);
  };

  const handleDeleteCustomization = (index: number) => {
    const updatedCustomizations = customizations.filter((_: Customization, i: number) => i !== index);
    setCustomizations(updatedCustomizations);
    setFormData({ ...formData, customizations: updatedCustomizations, has_customizations: updatedCustomizations.length > 0 });
  };

  const handleAddAddon = (customizationIndex: number) => {
    const updatedCustomizations = [...customizations];
    const cust = updatedCustomizations[customizationIndex];
    const newAddon = {
      addon_name: `Addon ${(cust.addons?.length || 0) + 1}`,
      addon_price: 0,
      display_order: cust.addons?.length || 0
    };
    
    cust.addons = [
      ...(cust.addons || []),
      {
        ...newAddon,
        addon_id: (newAddon as any).addon_id || '',
        customization_id: (newAddon as any).customization_id || 0
      }
    ];
    setCustomizations(updatedCustomizations);
    setFormData({ ...formData, customizations: updatedCustomizations, has_customizations: updatedCustomizations.length > 0 });
  };

  const handleUpdateAddon = (customizationIndex: number, addonIndex: number, field: string, value: any) => {
    const updatedCustomizations = [...customizations];
    const addons = updatedCustomizations[customizationIndex].addons || [];
    addons[addonIndex] = { ...addons[addonIndex], [field]: value };
    updatedCustomizations[customizationIndex].addons = addons;
    setCustomizations(updatedCustomizations);
    setFormData({ ...formData, customizations: updatedCustomizations, has_customizations: updatedCustomizations.length > 0 });
  };

  const handleDeleteAddon = (customizationIndex: number, addonIndex: number) => {
    const updatedCustomizations = [...customizations];
    const addons = updatedCustomizations[customizationIndex].addons || [];
    addons.splice(addonIndex, 1);
    updatedCustomizations[customizationIndex].addons = addons;
    setCustomizations(updatedCustomizations);
    setFormData({ ...formData, customizations: updatedCustomizations, has_customizations: updatedCustomizations.length > 0 });
  };

  // Validation helpers
  const offerPercentNum = Number(formData.discount_percentage);
  const isOfferPercentInvalid =
    formData.discount_percentage !== '' && (isNaN(offerPercentNum) || offerPercentNum < 0 || offerPercentNum > 100);

  const basePriceNum = Number(formData.base_price);
  const isBasePriceInvalid = formData.base_price !== '' && (isNaN(basePriceNum) || basePriceNum <= 0);

  const sellingPriceNum = Number(formData.selling_price);
  const isSellingPriceInvalid = formData.selling_price !== '' && (isNaN(sellingPriceNum) || sellingPriceNum <= 0);

  const lockOptionsTab = Boolean(onSaveAndNext) && !currentItemId;

  return (
    <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl mx-2 md:mx-0 border border-gray-100 overflow-hidden">
      <div className="flex min-h-0 max-h-[85vh]">
        {/* Left: item preview (desktop only) */}
        <div className="hidden md:flex w-[300px] shrink-0 border-r border-gray-100 bg-gradient-to-b from-gray-50 to-white flex-col items-center justify-between p-3">
          <div className="flex-1 w-full flex items-center justify-center">
            <div className="relative w-[210px] h-[420px] rounded-[2.2rem] bg-black shadow-[0_16px_48px_rgba(0,0,0,0.22)] p-[8px]">
              <div className="absolute top-[6px] left-1/2 -translate-x-1/2 w-[80px] h-[18px] bg-black rounded-b-2xl" />
              <div className="h-full w-full rounded-[1.9rem] bg-white overflow-hidden border border-black/10">
                <div className="px-3 pt-3">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {formData.item_name?.trim() ? formData.item_name : 'Item name'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-gray-500 line-clamp-2">
                    {formData.item_description?.trim() ? formData.item_description : 'Item description'}
                  </p>
                </div>
                <div className="px-3 mt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-900">
                      ₹{String(formData.selling_price || formData.base_price || '').trim() || '—'}
                    </p>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                      Preview
                    </span>
                  </div>
                </div>
                <div className="px-3 mt-2">
                  <div className="h-28 w-full rounded-xl bg-gray-100 overflow-hidden border border-gray-200 flex items-center justify-center">
                    {imagePreview ? (
                      imagePreview.startsWith('blob:') || imagePreview.startsWith('data:') ? (
                        <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <R2Image src={imagePreview} alt="" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <ImageIcon size={22} />
                        <p className="mt-2 text-xs font-medium">No image</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-4 mt-3">
                  <div className="h-2 w-24 rounded-full bg-gray-200" />
                  <div className="mt-2 h-2 w-40 rounded-full bg-gray-200" />
                  <div className="mt-2 h-2 w-32 rounded-full bg-gray-200" />
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Item preview on <span className="font-semibold text-gray-700">GatiMitra</span>
          </p>
        </div>

        {/* Right: editor */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">
                {formData.item_name?.trim()
                  ? formData.item_name
                  : (readOnly ? 'View menu item details' : title)}
              </h2>
              <p className="text-xs text-gray-500 truncate">
                {readOnly
                  ? 'View only — editing is managed from the agent dashboard'
                  : isEdit
                    ? `Editing: ${currentItemId}`
                    : currentItemId
                      ? `Item #${currentItemId} — add customizations or variants on the next tab`
                      : 'Enter details for the menu item'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onCancel}
                className="p-2 hover:bg-gray-100 rounded-lg"
                aria-label="Close"
              >
                <X size={18} className="text-gray-700" />
              </button>
            </div>
          </div>

          <div className="flex border-b border-gray-200 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSection('main')}
              className={`px-3 py-2 text-xs font-medium border-b-2 ${activeSection === 'main' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}
            >
              Item & pricing
            </button>
            <button
              type="button"
              title={
                lockOptionsTab
                  ? 'Use Save and Next on the first tab to create the item, then add options here'
                  : undefined
              }
              disabled={lockOptionsTab}
              onClick={() => {
                if (lockOptionsTab) return;
                setActiveSection('customization');
              }}
              className={`px-3 py-2 text-xs font-medium border-b-2 ${activeSection === 'customization' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'} ${lockOptionsTab ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Customizations & variants
            </button>
          </div>

          <form
            className="px-4 py-3 flex-1 min-h-0 overflow-y-auto"
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              if (readOnly) return;
              try {
                if (activeSection === 'main') {
                  if (onSaveAndNext) {
                    await onSaveAndNext();
                    setActiveSection('customization');
                  } else if (onSubmit) onSubmit();
                } else {
                  if (onSubmitOptions) await onSubmitOptions();
                  else if (onSubmit) onSubmit();
                }
              } catch {
                /* error state / toast from handler */
              }
            }}
          >
            {activeSection === 'main' && (
              <div className="space-y-3">
            {/* Row 1: Name, Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Item name *</label>
                <input type="text" placeholder="Name" readOnly={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} value={formData.item_name} onChange={e => !readOnly && setFormData({ ...formData, item_name: e.target.value })} required />
              </div>
              <div className="relative" ref={categoryPickerRef}>
                <label className="text-xs font-medium text-gray-600">Category *</label>
                <button
                  type="button"
                  disabled={readOnly}
                  aria-expanded={categoryPickerOpen}
                  aria-haspopup="listbox"
                  className={`mt-0.5 w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm text-left transition-colors shadow-sm ${
                    readOnly
                      ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-90'
                      : 'bg-white border-gray-200 hover:border-orange-200 hover:bg-orange-50/30'
                  }`}
                  onClick={() => {
                    if (readOnly) return;
                    setCategoryPickerOpen((o) => !o);
                  }}
                >
                  <span
                    className={
                      formData.category_id == null ? 'text-gray-400' : 'text-gray-900 font-medium truncate'
                    }
                  >
                    {categoryButtonLabel}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${categoryPickerOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {categoryPickerOpen && !readOnly && (
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
                                    ? 'bg-orange-50 text-orange-950'
                                    : 'text-gray-800 hover:bg-slate-50'
                                }`}
                                onClick={() => {
                                  setFormData({ ...formData, category_id: row.id });
                                  setCategoryPickerOpen(false);
                                  setCategoryPickerQuery('');
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
            {/* Row 2: Food type, Spice */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Food type</label>
                <select disabled={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} value={normalizeFoodTypeForForm(formData.food_type) || ''} onChange={e => !readOnly && setFormData({ ...formData, food_type: e.target.value })}>
                  <option value="">—</option>
                  {FOOD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Spice</label>
                <select disabled={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} value={normalizeSpiceLevelForForm(formData.spice_level) || ''} onChange={e => !readOnly && setFormData({ ...formData, spice_level: e.target.value })}>
                  <option value="">—</option>
                  {SPICE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            {/* Cuisine: selected chips, show less at top, search, list, view more */}
            <div>
              <label className="text-xs font-medium text-gray-600">
                Cuisine {maxCuisinesPerItem != null && (
                  <span className="text-gray-500 font-normal">(max {maxCuisinesPerItem})</span>
                )}
              </label>
              {cuisineViewMore && ALL_CUISINES.length > CUISINE_TOP_COUNT && (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => setCuisineViewMore(false)}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                  >
                    Show less
                  </button>
                </div>
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
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => toggleCuisine(c)}
                          className="p-0.5 rounded hover:bg-orange-200 text-orange-600"
                          aria-label={`Remove ${c}`}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {!readOnly && (
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
              )}
              {(() => {
                const q = cuisineSearch.trim().toLowerCase();
                const filtered = q
                  ? ALL_CUISINES.filter((c) => c.toLowerCase().includes(q))
                  : ALL_CUISINES;
                const topCuisines = ALL_CUISINES.slice(0, CUISINE_TOP_COUNT);
                const showAsTop = !cuisineViewMore && !q ? topCuisines : filtered;
                const hasMore = !cuisineViewMore && !q && ALL_CUISINES.length > CUISINE_TOP_COUNT;
                const customAdd = q && !ALL_CUISINES.some((c) => c.toLowerCase() === q) && !selectedCuisines.some((c) => c.toLowerCase() === q);
                return (
                  <>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {showAsTop.map((c) => {
                        const checked = selectedCuisines.includes(c);
                        const disabled = !checked && cuisineAtLimit;
                        return (
                          <label
                            key={c}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                              readOnly ? 'bg-gray-50 border-gray-200 text-gray-700 cursor-default' : disabled ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : checked ? 'bg-orange-100 border-orange-300 text-orange-800 cursor-pointer' : 'bg-white border-gray-200 text-gray-700 hover:border-orange-200 cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled || readOnly}
                              onChange={() => !readOnly && toggleCuisine(c)}
                              className="sr-only"
                            />
                            <span>{c}</span>
                          </label>
                        );
                      })}
                      {!readOnly && customAdd && (
                        <button
                          type="button"
                          disabled={cuisineAtLimit}
                          onClick={() => {
                            if (cuisineAtLimit) return;
                            const value = cuisineSearch.trim();
                            if (!value) return;
                            const next = [...selectedCuisines, value];
                            setFormData({ ...formData, cuisine_type: next.join(', ') });
                            setCuisineSearch('');
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-dashed border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add &quot;{cuisineSearch.trim()}&quot;
                        </button>
                      )}
                    </div>
                    {!readOnly && hasMore && (
                      <button
                        type="button"
                        onClick={() => setCuisineViewMore(true)}
                        className="mt-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium"
                      >
                        View more cuisines ({ALL_CUISINES.length - CUISINE_TOP_COUNT} more)
                      </button>
                    )}
                  </>
                );
              })()}
              {maxCuisinesPerItem != null && (
                <p className="text-[10px] text-gray-500 mt-0.5">{selectedCuisines.length}/{maxCuisinesPerItem} selected</p>
              )}
            </div>
            {/* Image + Description row */}
            <div className="flex gap-3 items-start">
              <div className="flex-shrink-0">
                <label className="text-xs font-medium text-gray-600 block mb-1">Image</label>
                {imageLimitReached && (
                  <div className="flex justify-end mb-0.5">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200 cursor-help"
                      title="Subscribe to the plan for more uploads"
                    >
                      <Info size={12} />
                    </span>
                  </div>
                )}
                {!imageUploadAllowed ? (
                  <div className="w-16 h-16 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-xs px-1 text-center">Images not in plan</div>
                ) : imageLimitReached ? (
                  <div className="w-20 rounded-lg bg-gray-100 border border-red-200 flex flex-col items-center justify-center text-gray-600 text-xs px-1 text-center py-2">
                    {imagePreview ? (
                      imagePreview.startsWith('blob:') || imagePreview.startsWith('data:') ? (
                        <img src={imagePreview} alt="" className="w-16 h-16 object-cover rounded" />
                      ) : (
                        <R2Image src={imagePreview} alt="" className="w-16 h-16 object-cover rounded" />
                      )
                    ) : (
                      <ImageIcon size={20} className="text-gray-400 mb-0.5" />
                    )}
                    <span className="font-medium mt-0.5">{imageLimit != null ? `${imageLimit}/${imageLimit}` : 'Limit'}</span>
                    <span className="mt-0.5 text-[10px] font-semibold text-red-600">Limit Exceeded</span>
                  </div>
                ) : readOnly ? (
                  <div className="w-20 rounded-lg border overflow-hidden flex flex-col items-center justify-center bg-gray-50 border-gray-200">
                    <div className="w-16 h-16 flex items-center justify-center relative">
                      {imagePreview ? (
                        imagePreview.startsWith('blob:') || imagePreview.startsWith('data:') ? (
                          <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <R2Image src={imagePreview} alt="" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <ImageIcon size={20} className="text-gray-400" />
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={handleImageChange}
                      disabled={false}
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={openFilePicker}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFilePicker(); } }}
                      className="w-20 rounded-lg border overflow-hidden flex flex-col items-center justify-center bg-gray-50 transition-colors cursor-pointer border-gray-200 hover:border-orange-300 hover:bg-orange-50/50"
                      aria-label="Upload menu item image"
                    >
                      <div className="w-16 h-16 flex items-center justify-center relative">
                        {imageValidating ? (
                          <span className="inline-block w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" aria-hidden />
                        ) : imagePreview ? (
                          imagePreview.startsWith('blob:') || imagePreview.startsWith('data:') ? (
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
                          {imageUsed}/{imageLimit} · {imageSlotsLeft != null ? `${imageSlotsLeft} left` : '—'}
                        </p>
                      )}
                      <span className="mt-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-gray-700">
                        <Upload size={12} />
                        <span>Upload</span>
                      </span>
                    </div>
                    {imageValidationError && (
                      <p className="text-xs text-red-600 mt-1 max-w-[10rem]" role="alert">{imageValidationError}</p>
                    )}
                    {!readOnly && imageValidationError && onNormalizeMenuItemImage && (
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
                <textarea readOnly={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm resize-none ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} rows={2} placeholder="Optional" value={formData.item_description || ''} onChange={e => !readOnly && setFormData({ ...formData, item_description: e.target.value })} />
                <label className="text-xs font-medium text-gray-600 mt-1 block">Allergens (comma)</label>
                <input type="text" readOnly={readOnly} placeholder="e.g. Nuts, Dairy" className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} value={formData.allergens || ''} onChange={e => !readOnly && setFormData({ ...formData, allergens: e.target.value })} />
              </div>
            </div>
            {/* Pricing row: base, selling, discount% */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Base price (₹) *</label>
                <input type="number" min="0" step="0.01" readOnly={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50' : ''} ${isBasePriceInvalid ? 'border-red-300' : 'border-gray-200'}`} value={formData.base_price} onChange={e => !readOnly && setFormData({ ...formData, base_price: e.target.value })} required />
                {isBasePriceInvalid && <span className="text-xs text-red-500">&gt; 0</span>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Selling (₹) *</label>
                <input type="number" min="0" step="0.01" readOnly className={`w-full px-2.5 py-1.5 border rounded text-sm bg-gray-50 ${isSellingPriceInvalid ? 'border-red-300' : 'border-gray-200'}`} value={formData.selling_price} required />
                {isSellingPriceInvalid && <span className="text-xs text-red-500">&gt; 0</span>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Discount %</label>
                <input type="number" min="0" max="100" step="0.01" readOnly={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50' : ''} ${isOfferPercentInvalid ? 'border-red-300' : 'border-gray-200'}`} value={formData.discount_percentage} onChange={e => !readOnly && setFormData({ ...formData, discount_percentage: e.target.value })} />
              </div>
            </div>
            {/* Stock & prep */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={formData.in_stock} disabled={readOnly} onChange={e => !readOnly && setFormData({ ...formData, in_stock: e.target.checked })} className="h-4 w-4 text-orange-500 rounded" />
                <span className="text-xs font-medium text-gray-700">In stock</span>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Avail. qty</label>
                <input type="number" min="0" readOnly={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} value={formData.available_quantity || ''} onChange={e => !readOnly && setFormData({ ...formData, available_quantity: e.target.value || '' })} placeholder="—" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Low stock at</label>
                <input type="number" min="0" readOnly={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} value={formData.low_stock_threshold || ''} onChange={e => !readOnly && setFormData({ ...formData, low_stock_threshold: e.target.value || '' })} placeholder="—" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Prep / ETA (min)</label>
                <input type="number" min="0" readOnly={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} value={formData.preparation_time_minutes ?? 15} onChange={e => !readOnly && setFormData({ ...formData, preparation_time_minutes: Number(e.target.value) || 15 })} />
                {storeDefaults?.avg_preparation_time_minutes != null && (
                  <p className="text-[10px] text-gray-500 mt-0.5">Store default: {storeDefaults.avg_preparation_time_minutes} min</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Serves</label>
                <input type="number" min="1" readOnly={readOnly} className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`} value={formData.serves ?? 1} onChange={e => !readOnly && setFormData({ ...formData, serves: Number(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-gray-100">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-3 max-w-md">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700">Packaging charge for this item</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Uses your store default from settings when you turn this on; you can change the amount for this item only.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!formData.packaging_enabled}
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return;
                      const on = !formData.packaging_enabled;
                      const defAmt = storeDefaults?.packaging_charge_amount;
                      const fromStore =
                        defAmt != null && Number.isFinite(Number(defAmt)) ? String(Number(defAmt)) : '';
                      setFormData({
                        ...formData,
                        packaging_enabled: on,
                        packaging_charges: on ? (fromStore !== '' ? fromStore : (formData.packaging_charges?.trim() || '')) : '',
                      });
                    }}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 ${
                      formData.packaging_enabled ? 'bg-orange-500' : 'bg-gray-200'
                    } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 translate-y-px rounded-full bg-white shadow transition ${
                        formData.packaging_enabled ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
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
                      readOnly={readOnly}
                      className={`w-full px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                      placeholder={
                        storeDefaults?.packaging_charge_amount != null
                          ? `e.g. ${Number(storeDefaults.packaging_charge_amount).toFixed(0)}`
                          : 'Amount (₹)'
                      }
                      value={formData.packaging_charges ?? ''}
                      onChange={(e) => !readOnly && setFormData({ ...formData, packaging_charges: e.target.value })}
                    />
                    {storeDefaults?.packaging_charge_amount != null && (
                      <p className="text-[10px] text-gray-500">
                        Store default: ₹{Number(storeDefaults.packaging_charge_amount).toFixed(2)} (merchant_stores) — saved on this item only
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
                  aria-checked={formData.available_for_delivery !== false}
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;
                    const cur = formData.available_for_delivery !== false;
                    setFormData({ ...formData, available_for_delivery: !cur });
                  }}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 ${
                    formData.available_for_delivery !== false ? 'bg-orange-500' : 'bg-gray-200'
                  } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 translate-y-px rounded-full bg-white shadow transition ${
                      formData.available_for_delivery !== false ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[10px] text-gray-500">Per serving ≈ one adult portion (aligned with merchant app).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Weight per serving</label>
                  <div className="flex gap-1.5 mt-0.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      readOnly={readOnly}
                      className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                      placeholder="e.g. 500"
                      value={formData.weight_per_serving ?? ''}
                      onChange={(e) => !readOnly && setFormData({ ...formData, weight_per_serving: e.target.value })}
                    />
                    <select
                      className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                      value={formData.weight_per_serving_unit || 'grams'}
                      disabled={readOnly}
                      onChange={(e) => !readOnly && setFormData({ ...formData, weight_per_serving_unit: e.target.value })}
                    >
                      {WEIGHT_PER_SERVING_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
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
                    readOnly={readOnly}
                    className={`w-full px-2.5 py-1.5 border rounded text-sm mt-0.5 ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                    placeholder="e.g. 300"
                    value={formData.calories_kcal ?? ''}
                    onChange={(e) => !readOnly && setFormData({ ...formData, calories_kcal: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Protein</label>
                  <div className="flex gap-1.5 mt-0.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      readOnly={readOnly}
                      className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                      placeholder="e.g. 50"
                      value={formData.protein ?? ''}
                      onChange={(e) => !readOnly && setFormData({ ...formData, protein: e.target.value })}
                    />
                    <select
                      className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                      value={formData.protein_unit || 'mg'}
                      disabled={readOnly}
                      onChange={(e) => !readOnly && setFormData({ ...formData, protein_unit: e.target.value })}
                    >
                      {NUTRIENT_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
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
                        readOnly={readOnly}
                        className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                        value={formData.carbohydrates ?? ''}
                        onChange={(e) => !readOnly && setFormData({ ...formData, carbohydrates: e.target.value })}
                      />
                      <select
                        className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                        value={formData.carbohydrates_unit || 'mg'}
                        disabled={readOnly}
                        onChange={(e) => !readOnly && setFormData({ ...formData, carbohydrates_unit: e.target.value })}
                      >
                        {NUTRIENT_UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
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
                        readOnly={readOnly}
                        className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                        value={formData.fat ?? ''}
                        onChange={(e) => !readOnly && setFormData({ ...formData, fat: e.target.value })}
                      />
                      <select
                        className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                        value={formData.fat_unit || 'mg'}
                        disabled={readOnly}
                        onChange={(e) => !readOnly && setFormData({ ...formData, fat_unit: e.target.value })}
                      >
                        {NUTRIENT_UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
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
                        readOnly={readOnly}
                        className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                        value={formData.fibre ?? ''}
                        onChange={(e) => !readOnly && setFormData({ ...formData, fibre: e.target.value })}
                      />
                      <select
                        className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                        value={formData.fibre_unit || 'mg'}
                        disabled={readOnly}
                        onChange={(e) => !readOnly && setFormData({ ...formData, fibre_unit: e.target.value })}
                      >
                        {NUTRIENT_UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {!nutritionExpanded && !readOnly && (
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
                  readOnly={readOnly}
                  className={`w-full px-2.5 py-1.5 border rounded text-sm mt-0.5 ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                  placeholder="e.g. High protein, Chef special"
                  value={formData.item_tags ?? ''}
                  onChange={(e) => !readOnly && setFormData({ ...formData, item_tags: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1 border-t border-gray-100">
              <p className="w-full text-[10px] text-gray-500 -mb-1">
                Customizations and variants are added in the next tab; flags below save with this step.
              </p>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={formData.is_popular} disabled={readOnly} onChange={e => !readOnly && setFormData({ ...formData, is_popular: e.target.checked })} className="h-3.5 w-3.5 text-orange-500 rounded" /><span className="text-xs text-gray-700">Popular</span></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={formData.is_recommended} disabled={readOnly} onChange={e => !readOnly && setFormData({ ...formData, is_recommended: e.target.checked })} className="h-3.5 w-3.5 text-orange-500 rounded" /><span className="text-xs text-gray-700">Recommended</span></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={formData.is_active} disabled={readOnly} onChange={e => !readOnly && setFormData({ ...formData, is_active: e.target.checked })} className="h-3.5 w-3.5 text-orange-500 rounded" /><span className="text-xs text-gray-700">Active</span></label>
            </div>
          </div>
        )}

        {activeSection === 'customization' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Customizations & add-ons (extra cheese, spice level, etc.). Max {CUSTOMIZATION_VARIANT_LIMIT} total. Current: {totalOptionsCount}/{CUSTOMIZATION_VARIANT_LIMIT}</p>
            {!readOnly && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">{editingCustomizationIndex !== null ? 'Edit' : 'Add'} customization group</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-600">Group name *</label>
                  <input type="text" className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" value={newCustomization.customization_title} onChange={e => setNewCustomization({...newCustomization, customization_title: e.target.value})} placeholder="e.g. Toppings" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Type</label>
                  <select className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" value={newCustomization.customization_type} onChange={e => setNewCustomization({...newCustomization, customization_type: e.target.value})}>
                    {CUSTOMIZATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Min / Max</label>
                  <div className="flex gap-1">
                    <input type="number" min="0" className="w-12 px-2 py-1.5 border border-gray-200 rounded text-sm" value={newCustomization.min_selection} onChange={e => setNewCustomization({...newCustomization, min_selection: Number(e.target.value)})} />
                    <input type="number" min="1" className="w-12 px-2 py-1.5 border border-gray-200 rounded text-sm" value={newCustomization.max_selection} onChange={e => setNewCustomization({...newCustomization, max_selection: Number(e.target.value)})} />
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-4 flex items-center gap-3">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={newCustomization.is_required} onChange={e => setNewCustomization({...newCustomization, is_required: e.target.checked})} className="h-3.5 w-3.5" /><span className="text-xs text-gray-700">Required</span></label>
                  <button type="button" onClick={handleAddCustomization} disabled={atOptionsLimit && editingCustomizationIndex === null} className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed">
                    {editingCustomizationIndex !== null ? 'Update' : 'Add group'}
                  </button>
                  {editingCustomizationIndex !== null && (
                    <button type="button" onClick={() => { setNewCustomization({ customization_title: '', customization_type: 'Checkbox', is_required: false, min_selection: 0, max_selection: 1, display_order: customizations.length }); setEditingCustomizationIndex(null); }} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300">Cancel</button>
                  )}
                </div>
              </div>
            </div>
            )}

            {customizations.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-700">Existing groups ({customizations.length})</h3>
                {customizations.map((cust, custIndex) => (
                  <div key={custIndex} className="border border-gray-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900">{cust.customization_title}</span>
                        <span className="text-xs text-gray-500 ml-2">{cust.customization_type} {cust.min_selection}-{cust.max_selection}</span>
                        <span className="text-xs ml-1">
                          {cust.is_required ? <span className="text-red-600">Required</span> : <span className="text-gray-500">Optional</span>}
                          <span className="text-gray-400"> · Min {cust.min_selection} / Max {cust.max_selection}</span>
                        </span>
                      </div>
                      {!readOnly && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button type="button" onClick={() => handleEditCustomization(custIndex)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={12} /></button>
                        <button type="button" onClick={() => handleDeleteCustomization(custIndex)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 size={12} /></button>
                        <button type="button" onClick={() => handleAddAddon(custIndex)} className="text-xs text-orange-600 font-medium px-1.5 py-0.5">Add add-on</button>
                      </div>
                      )}
                    </div>
                    {cust.addons && cust.addons.length > 0 ? (
                      <div className="mt-2 pl-2 border-l border-gray-200 space-y-1">
                        {cust.addons.map((addon, addonIndex) => (
                          <div key={addonIndex} className="flex items-center gap-2">
                            {readOnly ? (
                              <span className="text-xs text-gray-800">{addon.addon_name} — ₹{addon.addon_price}</span>
                            ) : (
                              <>
                                <input type="text" className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs" value={addon.addon_name} onChange={e => handleUpdateAddon(custIndex, addonIndex, 'addon_name', e.target.value)} placeholder="Add-on name (e.g. Extra cheese)" />
                                <span className="text-gray-500 text-xs">₹</span>
                                <input type="number" min="0" step="0.01" className="w-14 px-2 py-1 border border-gray-200 rounded text-xs" value={addon.addon_price} onChange={e => handleUpdateAddon(custIndex, addonIndex, 'addon_price', Number(e.target.value))} placeholder="0" />
                                <button type="button" onClick={() => handleDeleteAddon(custIndex, addonIndex)} className="text-xs font-medium text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded">Remove</button>
                              </>
                            )}
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
                {(formData.customizations?.length || 0) + (formData.variants?.length || 0) >= CUSTOMIZATION_VARIANT_LIMIT && (
                  <span className="text-amber-600 font-normal ml-1">· Max {CUSTOMIZATION_VARIANT_LIMIT} total</span>
                )}
              </h3>
              {(formData.variants || []).length > 0 && (
                <p className="text-xs text-gray-500 mb-2">Existing variants ({(formData.variants || []).length})</p>
              )}
              {(formData.variants || []).map((v: Variant, idx: number) => (
                <div key={idx} className="flex flex-wrap items-end gap-3 mb-3 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  {readOnly ? (
                    <span className="text-sm text-gray-800">{v.variant_name || v.variant_type || '—'} — ₹{typeof v.variant_price === 'number' ? v.variant_price : ''}</span>
                  ) : (
                    <>
                      <div className="min-w-[140px]">
                        <label className="text-xs text-gray-600 block mb-0.5">Variant name *</label>
                        <input type="text" className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" value={v.variant_name || v.variant_type || ''} onChange={e => { const vars = [...(formData.variants || [])]; vars[idx] = { ...vars[idx], variant_name: e.target.value, variant_type: e.target.value }; setFormData({ ...formData, variants: vars }); }} placeholder="e.g. Half, Full" />
                      </div>
                      <div className="min-w-[100px]">
                        <label className="text-xs text-gray-600 block mb-0.5">Variant price (₹) *</label>
                        <input type="number" min="0" step="0.01" className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" value={typeof v.variant_price === 'number' ? v.variant_price : ''} onChange={e => { const vars = [...(formData.variants || [])]; vars[idx] = { ...vars[idx], variant_price: Number(e.target.value) || 0 }; setFormData({ ...formData, variants: vars }); }} placeholder="0" />
                      </div>
                      <button type="button" onClick={() => { const vars = (formData.variants || []).filter((_: Variant, i: number) => i !== idx); setFormData({ ...formData, variants: vars, has_variants: vars.length > 0 }); }} className="p-1.5 text-red-600 hover:bg-red-50 rounded self-end" aria-label="Remove variant"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              ))}
              {!readOnly && (
              <button
                type="button"
                disabled={(formData.customizations?.length || 0) + (formData.variants?.length || 0) >= CUSTOMIZATION_VARIANT_LIMIT}
                onClick={() => {
                  const vars = [...(formData.variants || []), { variant_name: '', variant_type: '', variant_price: 0, menu_item_id: 0 }];
                  setFormData({ ...formData, variants: vars, has_variants: true });
                }}
                className="mt-2 px-3 py-1.5 bg-orange-500 text-white rounded text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add variant
              </button>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
          <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100" onClick={onCancel} disabled={isSaving}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && (activeSection === 'main' ? (
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
              disabled={isSaving || !!imageValidationError || isOfferPercentInvalid || isBasePriceInvalid || isSellingPriceInvalid || !formData.base_price || !formData.discount_percentage || !formData.selling_price}
            >
              {isSaving && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isSaving ? 'Saving...' : (onSaveAndNext ? 'Save and Next' : (isEdit ? 'Save' : 'Add Item'))}
            </button>
          ) : (
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
              disabled={isSaving}
            >
              {isSaving && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isSaving ? 'Saving...' : 'Submit'}
            </button>
          ))}
        </div>
            {error && <div className="text-red-500 text-xs mt-2">{error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}

function MenuContent() {
  // --- Dynamic Menu Categories State ---
  // Keep SSR + first client paint identical (no window/localStorage in initializers).
  const [storeId, setStoreId] = useState<string | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categoryPillMode, setCategoryPillMode] = useState<'category' | 'sub-category'>('category');
  const [viewMode, setViewMode] = useState<'card' | 'tree'>('card');
  const [contentScope, setContentScope] = useState<'item' | 'cust'>('item');
  const [openTreeGroups, setOpenTreeGroups] = useState<Record<string, boolean>>({});
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState<'add' | 'edit'>('add');
  const [categoryForm, setCategoryForm] = useState<Partial<MenuCategory>>({ 
    category_name: '', 
    is_active: true,
  });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [parentCategoryIdInForm, setParentCategoryIdInForm] = useState<number | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const [categoryPeerSuggestions, setCategoryPeerSuggestions] = useState<string[]>([]);
  const [categoryPeerSuggestionsLoading, setCategoryPeerSuggestionsLoading] = useState(false);
  const debouncedCategoryName = useDebouncedValue(categoryForm.category_name ?? '', 280);

  const rootCategories = useMemo(() => categories.filter((c) => !c.parent_category_id), [categories]);
  const subCategories = useMemo(() => categories.filter((c) => !!c.parent_category_id), [categories]);
  const categoryScrollRef = React.useRef<HTMLDivElement>(null);
  const menuListScrollRef = React.useRef<HTMLDivElement>(null);

  const categoryNameConflictSet = React.useMemo(() => {
    const set = new Set<string>();
    const scopeParent = parentCategoryIdInForm ?? null;
    for (const c of categories) {
      if (categoryModalMode === 'edit' && editingCategoryId != null && c.id === editingCategoryId) continue;
      const rowParent = c.parent_category_id ?? null;
      if (rowParent !== scopeParent) continue;
      const n = (c.category_name ?? '').toLowerCase().trim();
      if (n) set.add(n);
    }
    return set;
  }, [categories, categoryModalMode, editingCategoryId, parentCategoryIdInForm]);

  const useSubcategoryPeerSuggestions = parentCategoryIdInForm != null;

  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [store, setStore] = useState<MerchantStore | null>(null);
  const itemFormStoreDefaults = useMemo(
    () => ({
      avg_preparation_time_minutes: store?.avg_preparation_time_minutes ?? null,
      packaging_charge_amount: store?.packaging_charge_amount ?? null,
    }),
    [store]
  );
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [combos, setCombos] = useState<MenuCombo[]>([]);
  const [comboDetailsById, setComboDetailsById] = useState<Record<number, { components: Array<{ menu_item_id: number }> }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cuisineOptions, setCuisineOptions] = useState<string[]>(CUISINE_TYPES);

  const refreshCuisineOptionsFromApi = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/merchant/store-cuisines?storeId=${encodeURIComponent(storeId)}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const apiCuisines: string[] = Array.isArray((data as { cuisines?: unknown }).cuisines)
        ? (data as { cuisines: unknown[] }).cuisines.filter((c: unknown) => typeof c === 'string')
        : [];
      if (apiCuisines.length > 0) {
        const merged = Array.from(new Set([...apiCuisines, ...CUISINE_TYPES]));
        setCuisineOptions(merged);
      }
    } catch (e) {
      console.error('[menu] refreshCuisineOptionsFromApi', e);
    }
  }, [storeId]);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [lockedPlanBannerDismissed, setLockedPlanBannerDismissed] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [oosModal, setOosModal] = useState<
    | null
    | { kind: "item"; item_id: string; item_name: string }
    | { kind: "category"; categoryId: number; categoryName: string }
    | { kind: "combo"; comboId: number; comboName: string }
  >(null);
  const [oosBusy, setOosBusy] = useState(false);
  const [custStockBusy, setCustStockBusy] = useState<string | null>(null);
  const [oosChoice, setOosChoice] = useState<"HOURS" | "NEXT_OPEN" | "CUSTOM" | "MANUAL">("HOURS");
  const [oosHours, setOosHours] = useState(5);
  const [oosDate, setOosDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [oosTime, setOosTime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  });
  const [oosCustomTouched, setOosCustomTouched] = useState(false);
  const [oosSheetShown, setOosSheetShown] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<null | {
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>(null);
  const [viewCustModal, setViewCustModal] = useState<{ open: boolean; item: MenuItem | null }>({ open: false, item: null });
  const [viewCustModalTab, setViewCustModalTab] = useState<'customizations' | 'variants'>('customizations');
  const [itemPhotoModal, setItemPhotoModal] = useState<MenuItem | null>(null);
  const [itemUploadModal, setItemUploadModal] = useState<MenuItem | null>(null);
  const [photoUploadByItemId, setPhotoUploadByItemId] = useState<
    Record<number, { previewUri: string; progress: number }>
  >({});

  // Form states
  const [addForm, setAddForm] = useState({
    item_name: '',
    item_description: '',
    item_image_url: '',
    image: null as File | null,
    food_type: '',
    spice_level: '',
    cuisine_type: '',
    base_price: '',
    selling_price: '',
    discount_percentage: '0',
    tax_percentage: '0',
    in_stock: true,
    available_quantity: '',
    low_stock_threshold: '',
    has_customizations: false,
    has_addons: false,
    has_variants: false,
    is_popular: false,
    is_recommended: false,
    preparation_time_minutes: 15,
    packaging_enabled: false,
    packaging_charges: '',
    serves: 1,
    is_active: true,
    allergens: '',
    available_for_delivery: true,
    weight_per_serving: '',
    weight_per_serving_unit: 'grams',
    calories_kcal: '',
    protein: '',
    protein_unit: 'mg',
    carbohydrates: '',
    carbohydrates_unit: 'mg',
    fat: '',
    fat_unit: 'mg',
    fibre: '',
    fibre_unit: 'mg',
    item_tags: '',
    category_id: null as number | null,
    customizations: [] as Customization[],
    variants: [] as Variant[],
  });

  const [editForm, setEditForm] = useState({
    item_name: '',
    item_description: '',
    item_image_url: '',
    image: null as File | null,
    food_type: '',
    spice_level: '',
    cuisine_type: '',
    base_price: '',
    selling_price: '',
    discount_percentage: '0',
    tax_percentage: '0',
    in_stock: true,
    available_quantity: '',
    low_stock_threshold: '',
    has_customizations: false,
    has_addons: false,
    has_variants: false,
    is_popular: false,
    is_recommended: false,
    preparation_time_minutes: 25,
    packaging_enabled: false,
    packaging_charges: '',
    serves: 1,
    is_active: true,
    allergens: '',
    available_for_delivery: true,
    weight_per_serving: '',
    weight_per_serving_unit: 'grams',
    calories_kcal: '',
    protein: '',
    protein_unit: 'mg',
    carbohydrates: '',
    carbohydrates_unit: 'mg',
    fat: '',
    fat_unit: 'mg',
    fibre: '',
    fibre_unit: 'mg',
    item_tags: '',
    category_id: null as number | null,
    customizations: [] as Customization[],
    variants: [] as Variant[],
  });

  const [imagePreview, setImagePreview] = useState('');
  const [editImagePreview, setEditImagePreview] = useState('');
  const [addImageValidationError, setAddImageValidationError] = useState('');
  const [editImageValidationError, setEditImageValidationError] = useState('');
  const [addImageValidating, setAddImageValidating] = useState(false);
  const [editImageValidating, setEditImageValidating] = useState(false);
  const addImagePendingFileRef = useRef<File | null>(null);
  const editImagePendingFileRef = useRef<File | null>(null);
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  /** After "Save and Next" we have created the item; Submit will sync options for this item */
  const [addItemSaved, setAddItemSaved] = useState<{ item_id: string; id: number } | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMenuItemId, setEditingMenuItemId] = useState<number | null>(null);

  const [imageUploadStatus, setImageUploadStatus] = useState<any>(null);
  const [storeImageCount, setStoreImageCount] = useState<{ totalUsed: number } | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeIdResolved, setStoreIdResolved] = useState(false);
  const [planLimits, setPlanLimits] = useState<{
    maxMenuItems: number | null;
    maxMenuCategories: number | null;
    imageUploadAllowed: boolean;
    maxImageUploads: number | null;
    maxCuisinesPerItem: number | null;
    planName?: string;
  } | null>(null);

  const imageUsed = storeImageCount?.totalUsed ?? imageUploadStatus?.totalUsed ?? 0;
  const imageLimit = planLimits?.maxImageUploads ?? null;
  const imageUploadAllowed = planLimits == null || planLimits.imageUploadAllowed === true;
  const imageLimitReached = planLimits != null && imageLimit != null && imageUsed >= imageLimit;
  const imageSlotsLeft = imageLimit != null ? Math.max(0, imageLimit - imageUsed) : null;

  /** `id` is the DB row; `entryId` identifies one image inside a JSONB bundle row (null for PDF/CSV/legacy rows). */
  interface MenuFileEntry { id: number; entryId?: string | null; url: string; fileName: string; type: 'image' | 'pdf' | 'csv'; verificationStatus: string }
  const [menuFiles, setMenuFiles] = useState<MenuFileEntry[]>([]);
  const [menuUploadMode, setMenuUploadMode] = useState<'csv' | 'image' | 'pdf' | null>(null);
  const [menuPendingFiles, setMenuPendingFiles] = useState<File[]>([]);
  const [menuUploading, setMenuUploading] = useState(false);
  const [menuDeleting, setMenuDeleting] = useState<string | null>(null);
  const [menuReplaceError, setMenuReplaceError] = useState('');
  const [csvValidationError, setCsvValidationError] = useState('');
  const [showMenuFileSection, setShowMenuFileSection] = useState(false);
  const menuImageInputRef = React.useRef<HTMLInputElement>(null);
  const menuFileInputRef = React.useRef<HTMLInputElement>(null);
  const MAX_MENU_IMAGES = 3;
  const menuImages = menuFiles.filter(f => f.type === 'image');
  const menuPdfs = menuFiles.filter(f => f.type === 'pdf');
  const menuCsvs = menuFiles.filter(f => f.type === 'csv');
  const hasAnyUploadedMenuFiles = menuFiles.length > 0;

  const refetchImageCount = React.useCallback(async () => {
    if (!storeId) return;
    try {
      const countRes = await fetch(`/api/merchant/store-image-count?storeId=${encodeURIComponent(storeId)}`);
      if (countRes.ok) {
        const countData = await countRes.json();
        setStoreImageCount({ totalUsed: countData.totalUsed ?? 0 });
      }
    } catch {
      // keep previous count
    }
  }, [storeId]);

  const refetchMenuItems = React.useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}&view=list`, {
        credentials: 'include',
      });
      const json = await res.json().catch(() => []);
      const nextItems = res.ok && Array.isArray(json) ? json : [];
      setMenuItems(nextItems);
      queryClient.setQueryData(merchantKeys.menuItems(storeId), nextItems);
    } catch (e) {
      console.error('[menu] refetchMenuItems', e);
    }
  }, [storeId, queryClient]);

  const catalogPhotoUploadCallbacks = useMemo<CatalogPhotoUploadCallbacks>(
    () => ({
      onStart: (itemId, previewUri) => {
        setPhotoUploadByItemId((prev) => ({
          ...prev,
          [itemId]: { previewUri, progress: 0.05 },
        }));
      },
      onProgress: (itemId, progress) => {
        setPhotoUploadByItemId((prev) => {
          const cur = prev[itemId];
          if (!cur) return prev;
          return { ...prev, [itemId]: { ...cur, progress } };
        });
      },
      onSuccess: (itemId, previewUri, imageUrl) => {
        setPhotoUploadByItemId((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        setMenuItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  approval_status:
                    String(it.approval_status ?? '').toUpperCase() === 'APPROVED' ? 'APPROVED' : 'PENDING',
                  primary_image_moderation_status: 'PENDING',
                  item_image_url: imageUrl || previewUri,
                  image_count: Math.max(it.image_count ?? 0, 1),
                }
              : it,
          ),
        );
        void refetchMenuItems();
        void refetchImageCount();
      },
      onError: (itemId) => {
        setPhotoUploadByItemId((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      },
    }),
    [refetchMenuItems, refetchImageCount],
  );

  const handleOpenItemPhoto = useCallback(
    (item: MenuItem) => {
      if (isMenuItemLockedByPlan(item)) {
        toast.error('This item is locked. Upgrade your plan to unlock and edit it.');
        return;
      }
      if (photoUploadByItemId[item.id]) return;
      if (!imageUploadAllowed) {
        toast.error('Image uploads are not included in your current plan.');
        return;
      }
      if (imageLimitReached && !itemHasCatalogPhoto(item)) {
        toast.error(
          imageLimit != null
            ? `Image limit reached (${imageLimit}/${imageLimit}). Upgrade your plan to add more.`
            : 'Image upload limit reached for your plan.',
        );
        return;
      }
      if (itemHasCatalogPhoto(item)) {
        setItemPhotoModal(item);
        return;
      }
      setItemUploadModal(item);
    },
    [photoUploadByItemId, imageUploadAllowed, imageLimitReached, imageLimit],
  );

  const refetchExistingMenuMedia = React.useCallback(async () => {
    const storeDbId = (store as { id?: number })?.id;
    if (storeDbId == null) return;
    try {
      const menuRes = await fetch(`/api/auth/store-menu-media-signed?storeDbId=${storeDbId}`);
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        if (Array.isArray(menuData.files)) {
          setMenuFiles(menuData.files);
        }
      }
    } catch {
      // keep previous
    }
  }, [store]);

  const handleMenuFileUpload = async () => {
    if (!storeId || !menuUploadMode || menuPendingFiles.length === 0) {
      toast.error('Select a file type and choose file(s).');
      return;
    }
    if (menuUploadMode === 'csv') {
      const validation = await validateMenuCsv(menuPendingFiles[0]);
      if (!validation.valid) {
        setCsvValidationError(validation.error);
        return;
      }
      setCsvValidationError('');
    }
    if (menuUploadMode === 'image' && menuImages.length + menuPendingFiles.length > MAX_MENU_IMAGES) {
      setMenuReplaceError(`Maximum ${MAX_MENU_IMAGES} images allowed. You have ${menuImages.length}, trying to add ${menuPendingFiles.length}.`);
      return;
    }
    setMenuReplaceError('');
    setMenuUploading(true);
    try {
      const formData = new FormData();
      for (const f of menuPendingFiles) formData.append('file', f);
      const sourceEntity =
        menuUploadMode === 'csv'
          ? 'ONBOARDING_MENU_SHEET'
          : menuUploadMode === 'pdf'
            ? 'ONBOARDING_MENU_PDF'
            : 'ONBOARDING_MENU_IMAGE';
      formData.append('source_entity', sourceEntity);
      const res = await fetch(
        `/api/merchant/stores/${encodeURIComponent(storeId)}/media/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMenuReplaceError(data?.error || 'Upload failed.');
        toast.error(data?.error || 'Upload failed.');
        return;
      }
      setMenuPendingFiles([]);
      toast.success(menuUploadMode === 'image' ? 'Menu image(s) uploaded.' : 'Menu file uploaded.');
      await refetchExistingMenuMedia();
    } catch {
      setMenuReplaceError('Upload failed. Please try again.');
      toast.error('Upload failed.');
    } finally {
      setMenuUploading(false);
    }
  };

  /** Unique per rendered row: several images can share one DB row (JSONB bundle). */
  const menuFileKey = (file: MenuFileEntry) => `${file.id}:${file.entryId ?? 'row'}`;

  const handleMenuFileDelete = async (file: MenuFileEntry) => {
    if (!storeId) return;
    setMenuDeleting(menuFileKey(file));
    try {
      // entryId removes just this image from a bundle row; without it the whole row is removed.
      const entryParam = file.entryId ? `&entryId=${encodeURIComponent(file.entryId)}` : '';
      const res = await fetch(
        `/api/merchant/menu-upload?storeId=${encodeURIComponent(storeId)}&fileId=${file.id}${entryParam}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Delete failed.');
        return;
      }
      toast.success('File removed.');
      await refetchExistingMenuMedia();
    } catch {
      toast.error('Delete failed.');
    } finally {
      setMenuDeleting(null);
    }
  };

  // Fetch store ID from params or localStorage; must belong to logged-in merchant (resolve-session).
  useEffect(() => {
    const getStoreId = async () => {
      let id =
        searchParams?.get('storeId') ??
        searchParams?.get('store_id') ??
        null;
      if (!id && typeof window !== 'undefined') {
        id = readPartnerSelectedStoreId() || localStorage.getItem('selectedStoreId');
      }
      if (id) {
        setStoreId(id);
        setStoreIdResolved(true);
      }
      try {
        const res = await fetch('/api/merchant-auth/resolve-session', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        const allowed: string[] = Array.isArray(data?.stores)
          ? data.stores
              .map((s: { store_id?: string | null }) => String(s?.store_id ?? '').trim())
              .filter(Boolean)
          : [];
        if (allowed.length > 0) {
          if (!id || !allowed.includes(id)) {
            id = allowed[0] ?? null;
            if (id) persistPartnerSelectedStoreId(id);
          }
        }
      } catch {
        // keep id from URL/localStorage
      }
      setStoreId(id);
      setStoreIdResolved(true);
    };
    void getStoreId();
  }, [searchParams]);

  // Fetch categories for the store
  useEffect(() => {
    if (!storeId) return;
    setCategoryLoading(true);
    fetchMenuCategories(storeId)
      .then((data) => setCategories(data))
      .catch(() => setCategories([]))
      .finally(() => setCategoryLoading(false));
  }, [storeId]);

  // Fetch cuisines for the store and merge with default list
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void (async () => {
      await refreshCuisineOptionsFromApi();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, refreshCuisineOptionsFromApi]);

  // Fetch store and menu items
  useEffect(() => {
    if (!storeIdResolved) return;
    if (!storeId) {
      setStoreError('Please select a store first. No store ID found in URL or localStorage.');
      setIsLoading(false);
      return;
    }
    
    const loadMenuSecondaryData = async (
      currentStoreId: string,
      storeDbId: number | undefined,
      comboRows: MenuCombo[]
    ) => {
      try {
        if (shouldRunPlanEnforce(currentStoreId)) {
          await fetch(
            `/api/merchant/subscription/enforce-limits?storeId=${encodeURIComponent(currentStoreId)}`,
            { method: 'POST' }
          );
          markPlanEnforceRan(currentStoreId);
        }
      } catch {
        // Non-blocking
      }

      try {
        const fullRes = await fetch(
          `/api/merchant/menu-items?storeId=${encodeURIComponent(currentStoreId)}`,
          { credentials: 'include' }
        );
        if (fullRes.ok) {
          const fullItems = await fullRes.json();
          if (Array.isArray(fullItems)) setMenuItems(fullItems);
        }
      } catch {
        // keep list payload
      }

      try {
        const ids = comboRows
          .map((c) => c.id)
          .filter((id) => typeof id === 'number' && Number.isFinite(id));
        if (ids.length > 0) {
          const detailPairs = await Promise.all(
            ids.slice(0, 30).map(async (id) => {
              try {
                const dRes = await fetch(
                  `/api/merchant/combos/${id}?storeId=${encodeURIComponent(currentStoreId)}`
                );
                const dJson = dRes.ok ? await dRes.json().catch(() => null) : null;
                const combo = dJson && typeof dJson === 'object' ? (dJson as any).combo : null;
                const components = combo && Array.isArray(combo.components) ? combo.components : [];
                return [id, { components }] as const;
              } catch {
                return null;
              }
            })
          );
          setComboDetailsById((prev) => {
            const next = { ...prev };
            for (const p of detailPairs) {
              if (!p) continue;
              next[p[0]] = p[1];
            }
            return next;
          });
        }
      } catch {
        // ignore
      }

      try {
        const [status, countRes, subRes, menuRes] = await Promise.all([
          getImageUploadStatus(currentStoreId),
          fetch(`/api/merchant/store-image-count?storeId=${encodeURIComponent(currentStoreId)}`),
          fetch(`/api/merchant/subscription?storeId=${encodeURIComponent(currentStoreId)}`),
          storeDbId != null
            ? fetch(`/api/auth/store-menu-media-signed?storeDbId=${storeDbId}`)
            : Promise.resolve(null),
        ]);

        setImageUploadStatus(status);

        if (countRes.ok) {
          const countData = await countRes.json();
          setStoreImageCount({ totalUsed: countData.totalUsed ?? 0 });
        } else {
          setStoreImageCount(null);
        }

        if (subRes.ok) {
          const subJson = await subRes.json();
          const plan = subJson.plan ?? subJson.subscription?.merchant_plans ?? null;
          if (plan && typeof plan === 'object') {
            const maxImg = plan.max_image_uploads ?? null;
            const canUploadImages =
              plan.image_upload_allowed === true || (maxImg != null && maxImg > 0);
            setPlanLimits({
              maxMenuItems: plan.max_menu_items ?? null,
              maxMenuCategories: plan.max_menu_categories ?? null,
              imageUploadAllowed: canUploadImages,
              maxImageUploads: maxImg,
              maxCuisinesPerItem: plan.max_cuisines ?? null,
              planName: plan.plan_name ?? undefined,
            });
          } else {
            setPlanLimits(null);
          }
        } else {
          setPlanLimits(null);
        }

        if (menuRes && 'ok' in menuRes && menuRes.ok) {
          const menuData = await menuRes.json();
          if (Array.isArray(menuData.files)) {
            setMenuFiles(menuData.files);
          }
        }
      } catch {
        // keep defaults
      }
    };

    const loadData = async () => {
      const cachedItems = queryClient.getQueryData<MenuItem[]>(merchantKeys.menuItems(storeId));
      if (!cachedItems?.length) {
        setIsLoading(true);
      }
      setStoreError(null);
      try {
        const [data, itemsRes, comboRes] = await Promise.all([
          (async () => {
            let storeData = await fetchStoreById(storeId);
            if (!storeData) storeData = await fetchStoreByName(storeId);
            return storeData;
          })(),
          fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}&view=list`, {
            credentials: 'include',
          }),
          fetch(`/api/merchant/combos?storeId=${encodeURIComponent(storeId)}`, {
            credentials: 'include',
          }),
        ]);

        if (!data) {
          setStoreError(`Store not found with ID/Name: ${storeId}`);
          setIsLoading(false);
          return;
        }

        setStore(data);

        const items = itemsRes.ok ? await itemsRes.json() : [];
        const nextItems = Array.isArray(items) ? items : [];
        setMenuItems(nextItems);
        queryClient.setQueryData(merchantKeys.menuItems(storeId), nextItems);

        let comboRows: MenuCombo[] = [];
        try {
          const comboJson = comboRes.ok ? await comboRes.json().catch(() => null) : null;
          const raw = comboJson && typeof comboJson === 'object' ? (comboJson as { combos?: unknown }).combos : [];
          comboRows = Array.isArray(raw) ? (raw as MenuCombo[]) : [];
          setCombos(comboRows);
        } catch {
          comboRows = [];
          setCombos([]);
        }

        setIsLoading(false);

        const storeDbId = (data as { id?: number })?.id;
        void loadMenuSecondaryData(storeId, storeDbId, comboRows);
      } catch (error) {
        console.error('Error loading menu:', error);
        setStoreError('Error loading store data. Please try again.');
        setIsLoading(false);
      }
    };
    loadData();
  }, [storeId, storeIdResolved, queryClient]);

  useEffect(() => {
    if (!showCategoryModal || !storeId) {
      setCategoryPeerSuggestions([]);
      setCategoryPeerSuggestionsLoading(false);
      return;
    }
    const ac = new AbortController();
    (async () => {
      setCategoryPeerSuggestionsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('q', debouncedCategoryName.trim().slice(0, 30));
        if (categoryModalMode === 'edit' && editingCategoryId != null) {
          params.set('editingCategoryId', String(editingCategoryId));
        }
        let url: string;
        if (useSubcategoryPeerSuggestions && parentCategoryIdInForm != null) {
          params.set('parentCategoryId', String(parentCategoryIdInForm));
          url = `/api/merchant/subcategory-name-suggestions?storeId=${encodeURIComponent(storeId)}&${params.toString()}`;
        } else {
          url = `/api/merchant/category-name-suggestions?storeId=${encodeURIComponent(storeId)}&${params.toString()}`;
        }
        const res = await fetch(url, { signal: ac.signal, credentials: 'include' });
        const j = (await res.json().catch(() => ({}))) as { suggestions?: unknown };
        const list = Array.isArray(j.suggestions)
          ? j.suggestions.filter((x): x is string => typeof x === 'string')
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
    storeId,
    debouncedCategoryName,
    categoryModalMode,
    editingCategoryId,
    parentCategoryIdInForm,
    useSubcategoryPeerSuggestions,
  ]);

  // Add or Edit category
  const handleSaveCategory = async () => {
    setCategoryError(null);
    const name = categoryForm.category_name?.trim() ?? '';
    if (!name) {
      setCategoryError('Category name is required');
      return;
    }
    if (name.length > 30) {
      setCategoryError('Category name must not exceed 30 characters');
      return;
    }
    if (categoryModalMode === 'add' && planLimits?.maxMenuCategories != null && categories.length >= planLimits.maxMenuCategories) {
      setCategoryError(`Category limit reached (${planLimits.maxMenuCategories}). Upgrade your plan to add more.`);
      return;
    }
    setCategoryLoading(true);
    try {
      const payload = {
        category_name: name,
        is_active: categoryForm.is_active ?? true,
        ...(categoryModalMode === 'add' && parentCategoryIdInForm != null
          ? { parent_category_id: parentCategoryIdInForm }
          : {}),
      };
      if (categoryModalMode === 'add') {
        const newCat = await createMenuCategory(storeId!, payload);
        if (newCat) setCategories((prev) => [...prev, newCat]);
      } else if (categoryModalMode === 'edit' && editingCategoryId) {
        const updated = await updateMenuCategory(editingCategoryId, payload);
        if (updated) setCategories((prev) => prev.map((cat) => cat.id === editingCategoryId ? updated : cat));
      }
      setShowCategoryModal(false);
      setCategoryForm({ category_name: '', is_active: true });
      setEditingCategoryId(null);
      setParentCategoryIdInForm(null);
    } catch (e) {
      setCategoryError('Error saving category');
    }
    setCategoryLoading(false);
  };

  // Delete category
  const handleDeleteCategory = async (id: number) => {
    setCategoryLoading(true);
    try {
      // Check if category has items
      const hasItems = menuItems.some(item => item.category_id === id);
      if (hasItems) {
        toast.error('Cannot delete category with menu items. Remove items first or reassign them.');
        setCategoryLoading(false);
        return;
      }
      
      const ok = await deleteMenuCategory(id);
      if (ok) {
        setCategories((prev) => prev.filter((cat) => cat.id !== id));
        if (selectedCategoryId === id) setSelectedCategoryId(null);
        await refetchImageCount();
        toast.success('Category deleted successfully');
      }
    } catch {
      toast.error('Error deleting category');
    }
    setCategoryLoading(false);
  };

  const processImageFile = async (file: File, isEdit: boolean = false) => {
    if (isEdit) {
      setEditImageValidationError('');
      setEditImageValidating(true);
      editImagePendingFileRef.current = file;
    } else {
      setAddImageValidationError('');
      setAddImageValidating(true);
      addImagePendingFileRef.current = file;
    }

    const result = await validateMenuItemImageFile(file);
    if (isEdit) {
      setEditImageValidating(false);
    } else {
      setAddImageValidating(false);
    }

    if (!result.valid) {
      if (isEdit) {
        setEditImageValidationError(result.error);
        setEditForm(prev => ({ ...prev, image: null }));
      } else {
        setAddImageValidationError(result.error);
        setAddForm(prev => ({ ...prev, image: null }));
      }
      return;
    }

    if (isEdit) {
      editImagePendingFileRef.current = null;
    } else {
      addImagePendingFileRef.current = null;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      if (isEdit) {
        setEditImagePreview(dataUrl);
      } else {
        setImagePreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);

    if (isEdit) {
      setEditForm(prev => ({ ...prev, image: file }));
    } else {
      setAddForm(prev => ({ ...prev, image: file }));
    }

    const used = imageUploadStatus?.totalUsed ?? 0;
    const allowed = planLimits?.imageUploadAllowed === true;
    const limit = planLimits?.maxImageUploads;
    const atLimit = limit != null && used >= limit;
    if (planLimits && !allowed) {
      toast.error('Image uploads are not included in your current plan. Upgrade to add images.');
    } else if (planLimits && atLimit && !(isEdit ? editForm.item_image_url : addForm.item_image_url)) {
      toast.error(`Image limit reached (${limit} images). Upgrade your plan to add more.`);
    }
  };

  const handleNormalizeMenuItemImage = async (isEdit: boolean) => {
    const pending = isEdit ? editImagePendingFileRef.current : addImagePendingFileRef.current;
    if (!pending) {
      toast.error('Choose an image first.');
      return;
    }
    if (isEdit) {
      setEditImageValidationError('');
      setEditImageValidating(true);
    } else {
      setAddImageValidationError('');
      setAddImageValidating(true);
    }
    const normalized = await normalizeMenuItemImageFile(pending);
    if (isEdit) {
      setEditImageValidating(false);
    } else {
      setAddImageValidating(false);
    }
    if (!normalized.ok) {
      if (isEdit) setEditImageValidationError(normalized.error);
      else setAddImageValidationError(normalized.error);
      toast.error(normalized.error);
      return;
    }
    await processImageFile(normalized.file, isEdit);
  };

  async function handleAddItem() {
    if (!storeId) {
      toast.error('Please select a store first');
      return;
    }
    if (!canAddItem) {
      toast.error('Menu item limit reached for your plan. Upgrade to add more items.');
      return;
    }
    setAddError("");
    if (addImageValidationError) return setAddError(addImageValidationError);

    // Validation
    if (!addForm.item_name.trim()) return setAddError("Name is required");
    if (!addForm.category_id) return setAddError("Category is required");
    if (!addForm.base_price || isNaN(Number(addForm.base_price)) || Number(addForm.base_price) <= 0) 
      return setAddError("Valid base price is required (greater than 0)");
    if (!addForm.selling_price || isNaN(Number(addForm.selling_price)) || Number(addForm.selling_price) <= 0) 
      return setAddError("Valid selling price is required (greater than 0)");
    if (addForm.discount_percentage && (isNaN(Number(addForm.discount_percentage)) || Number(addForm.discount_percentage) < 0 || Number(addForm.discount_percentage) > 100)) {
      return setAddError("Discount % must be between 0 and 100");
    }
    if (addForm.packaging_enabled) {
      const raw = String(addForm.packaging_charges ?? "").replace(/,/g, "").trim();
      const n = raw !== "" ? Number(raw) : NaN;
      const def = itemFormStoreDefaults.packaging_charge_amount;
      const hasAmount = raw !== "" && Number.isFinite(n) && n >= 0;
      const hasStoreDefault = def != null && Number.isFinite(Number(def)) && Number(def) >= 0;
      if (!hasAmount && !hasStoreDefault) {
        return setAddError("Enter packaging amount (₹) or turn off packaging.");
      }
    }
    setIsSaving(true);
    try {
      let itemImageUrl = addForm.item_image_url;
      if (addForm.image && storeId) {
        const formData = new FormData();
        formData.append("file", addForm.image);
        formData.append("storeId", storeId);
        const uploadRes = await fetch("/api/merchant/menu-items/upload-image", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          setAddError(err?.error || "Image upload failed.");
          setIsSaving(false);
          return;
        }
        const uploadData = await uploadRes.json();
        itemImageUrl = uploadData.image_url ?? uploadData.key ?? addForm.item_image_url;
        setImagePreview(itemImageUrl);
      }

      // Prepare allergens as array
      const allergensArray = addForm.allergens 
        ? addForm.allergens.split(',').map((a: string) => a.trim()).filter(Boolean)
        : [];

      // Use a ref to persist counter across renders (could be replaced with a DB sequence in production)
      const win = window as Window & { menuItemIdCounterRef?: { current: number } };
      if (!win.menuItemIdCounterRef) {
        win.menuItemIdCounterRef = { current: 0 };
      }
      // Validate category_id and storeId
      if (!addForm.category_id) {
        setAddError('Category is required.');
        setIsSaving(false);
        return;
      }
      if (!storeId) {
        setAddError('Store ID is required.');
        setIsSaving(false);
        return;
      }

      const packagingPayload = (() => {
        if (!addForm.packaging_enabled) return null;
        const raw = String(addForm.packaging_charges ?? "").replace(/,/g, "").trim();
        if (raw !== "") {
          const n = Number(raw);
          return Number.isFinite(n) && n >= 0 ? n : null;
        }
        const def = itemFormStoreDefaults.packaging_charge_amount;
        if (def != null && Number.isFinite(Number(def)) && Number(def) >= 0) {
          return Number(def);
        }
        return null;
      })();
      const newItem = {
        item_name: addForm.item_name,
        item_description: addForm.item_description,
        item_image_url: itemImageUrl,
        food_type: addForm.food_type,
        spice_level: addForm.spice_level,
        cuisine_type: addForm.cuisine_type,
        base_price: Number(addForm.base_price),
        selling_price: Number(addForm.selling_price),
        discount_percentage: addForm.discount_percentage ? Number(addForm.discount_percentage) : 0,
        tax_percentage: 0,
        in_stock: addForm.in_stock,
        available_quantity: addForm.available_quantity ? Number(addForm.available_quantity) : null,
        low_stock_threshold: addForm.low_stock_threshold ? Number(addForm.low_stock_threshold) : null,
        has_customizations: addForm.customizations?.length > 0,
        has_addons: addForm.customizations?.some(c => c.addons && c.addons.length > 0),
        has_variants: addForm.has_variants,
        is_popular: addForm.is_popular,
        is_recommended: addForm.is_recommended,
        preparation_time_minutes: addForm.preparation_time_minutes,
        packaging_charges: packagingPayload,
        serves: addForm.serves,
        is_active: addForm.is_active,
        allergens: allergensArray,
        category_id: addForm.category_id,
        customizations: addForm.customizations || [],
        restaurant_id: storeId,
        ...mxNutritionPayloadFromForm(addForm as unknown as Record<string, unknown>),
      };

      const res = await fetch('/api/merchant/menu-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to create menu item');
      }
      const result = await res.json();
      if (result && result.item_id) {
        try {
          const { linked, errors } = await linkItemCuisineSelectionsToStoreProfile(storeId, newItem.cuisine_type);
          if (linked > 0) await refreshCuisineOptionsFromApi();
          if (errors.length > 0) toast.error(errors.slice(0, 2).join(' '));
        } catch (e) {
          console.error('[menu] Failed to link cuisines to store profile', e);
        }
        // API already created customizations/addons/variants server-side (bypasses RLS)
        setMenuItems((prev) => [result, ...prev]);
        setShowAddModal(false);
        await refetchImageCount();
        setAddForm({
          item_name: '',
          item_description: '',
          item_image_url: '',
          image: null,
          food_type: '',
          spice_level: '',
          cuisine_type: '',
          base_price: '',
          selling_price: '',
          discount_percentage: '0',
          tax_percentage: '0',
          in_stock: true,
          available_quantity: '',
          low_stock_threshold: '',
          has_customizations: false,
          has_addons: false,
          has_variants: false,
          is_popular: false,
          is_recommended: false,
          preparation_time_minutes: 15,
          packaging_enabled: false,
          packaging_charges: '',
          serves: 1,
          is_active: true,
          allergens: '',
          available_for_delivery: true,
          weight_per_serving: '',
          weight_per_serving_unit: 'grams',
          calories_kcal: '',
          protein: '',
          protein_unit: 'mg',
          carbohydrates: '',
          carbohydrates_unit: 'mg',
          fat: '',
          fat_unit: 'mg',
          fibre: '',
          fibre_unit: 'mg',
          item_tags: '',
          category_id: null,
          customizations: [],
          variants: [],
        });
        setImagePreview('');
        toast.success('Item added successfully!');
      } else {
        setAddError('Failed to add item.');
      }
    } catch (e) {
      console.error('Error adding item:', e);
      setAddError('Error saving item.');
    }
    setIsSaving(false);
  }

  async function handleAddSaveAndNext() {
    if (!storeId) {
      toast.error('Please select a store first');
      throw new Error('No store');
    }
    if (!canAddItem) {
      toast.error('Menu item limit reached for your plan. Upgrade to add more items.');
      throw new Error('Limit');
    }
    setAddError('');
    if (!addForm.item_name.trim()) {
      setAddError('Name is required');
      throw new Error('Name is required');
    }
    if (!addForm.category_id) {
      setAddError('Category is required');
      throw new Error('Category is required');
    }
    if (!addForm.base_price || isNaN(Number(addForm.base_price)) || Number(addForm.base_price) <= 0) {
      setAddError('Valid base price is required (greater than 0)');
      throw new Error('Base price');
    }
    if (!addForm.selling_price || isNaN(Number(addForm.selling_price)) || Number(addForm.selling_price) <= 0) {
      setAddError('Valid selling price is required (greater than 0)');
      throw new Error('Selling price');
    }
    if (
      addForm.discount_percentage &&
      (isNaN(Number(addForm.discount_percentage)) ||
        Number(addForm.discount_percentage) < 0 ||
        Number(addForm.discount_percentage) > 100)
    ) {
      setAddError('Discount % must be between 0 and 100');
      throw new Error('Discount');
    }

    setIsSaving(true);
    try {
      let itemImageUrl = addForm.item_image_url;
      if (addForm.image && storeId) {
        const formData = new FormData();
        formData.append('file', addForm.image);
        formData.append('storeId', storeId);
        const uploadRes = await fetch('/api/merchant/menu-items/upload-image', { method: 'POST', body: formData });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          const msg = err?.error || 'Image upload failed.';
          setAddError(msg);
          throw new Error(msg);
        }
        const uploadData = await uploadRes.json();
        itemImageUrl = uploadData.image_url ?? uploadData.key ?? addForm.item_image_url;
        setImagePreview(itemImageUrl);
      }
      const allergensArray = addForm.allergens
        ? addForm.allergens.split(',').map((a: string) => a.trim()).filter(Boolean)
        : [];
      if (!addForm.category_id || !storeId) {
        setAddError('Category and store are required.');
        throw new Error('Category and store');
      }
      const packagingPayloadSn = (() => {
        if (!addForm.packaging_enabled) return null;
        const raw = String(addForm.packaging_charges ?? '').replace(/,/g, '').trim();
        if (raw !== '') {
          const n = Number(raw);
          return Number.isFinite(n) && n >= 0 ? n : null;
        }
        const def = itemFormStoreDefaults?.packaging_charge_amount;
        if (def != null && Number.isFinite(Number(def)) && Number(def) >= 0) return Number(def);
        return null;
      })();
      if (addForm.packaging_enabled && packagingPayloadSn == null) {
        setAddError('Enter packaging amount (₹) or turn off packaging.');
        throw new Error('Packaging');
      }
      const newItem = {
        item_name: addForm.item_name,
        item_description: addForm.item_description,
        item_image_url: itemImageUrl,
        food_type: addForm.food_type,
        spice_level: addForm.spice_level,
        cuisine_type: addForm.cuisine_type,
        base_price: Number(addForm.base_price),
        selling_price: Number(addForm.selling_price),
        discount_percentage: addForm.discount_percentage ? Number(addForm.discount_percentage) : 0,
        tax_percentage: 0,
        in_stock: addForm.in_stock,
        available_quantity: addForm.available_quantity ? Number(addForm.available_quantity) : null,
        low_stock_threshold: addForm.low_stock_threshold ? Number(addForm.low_stock_threshold) : null,
        has_customizations: false,
        has_addons: false,
        has_variants: false,
        is_popular: addForm.is_popular,
        is_recommended: addForm.is_recommended,
        preparation_time_minutes: addForm.preparation_time_minutes,
        packaging_charges: packagingPayloadSn,
        serves: addForm.serves,
        is_active: addForm.is_active,
        allergens: allergensArray,
        category_id: addForm.category_id,
        customizations: [],
        restaurant_id: storeId,
        ...mxNutritionPayloadFromForm(addForm as unknown as Record<string, unknown>),
      };
      const res = await fetch('/api/merchant/menu-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to create menu item');
      }
      const result = await res.json();
      if (result?.item_id) {
        try {
          const { linked, errors } = await linkItemCuisineSelectionsToStoreProfile(storeId, newItem.cuisine_type);
          if (linked > 0) await refreshCuisineOptionsFromApi();
          if (errors.length > 0) toast.error(errors.slice(0, 2).join(' '));
        } catch (e) {
          console.error('[menu] Failed to link cuisines to store profile', e);
        }
        setAddItemSaved({ item_id: result.item_id, id: result.id });
        setMenuItems((prev) => [result, ...prev]);
        toast.success('Item saved. Add customizations/variants or click Submit.');
      } else {
        setAddError('Failed to save item.');
        throw new Error('Failed to save item.');
      }
    } catch (e) {
      console.error('Error saving item:', e);
      if (e instanceof Error && !['Name is required', 'Category is required', 'Base price', 'Selling price', 'Discount', 'Packaging', 'No store', 'Limit', 'Category and store'].includes(e.message)) {
        setAddError(e.message || 'Error saving item.');
      }
      throw e;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddSubmitOptions() {
    if (!addItemSaved || !storeId) {
      toast.error('Save the item first (Save and Next).');
      throw new Error('No item');
    }
    setIsSaving(true);
    setAddError('');
    try {
      const custs = Array.isArray(addForm.customizations) ? addForm.customizations : [];
      const vars = Array.isArray(addForm.variants) ? addForm.variants : [];
      const res = await fetch('/api/merchant/menu-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: addItemSaved.item_id,
          storeId,
          customizations: custs,
          variants: vars.map((v: any) => ({
            variant_name: v.variant_name,
            variant_type: v.variant_type ?? null,
            variant_price: typeof v.variant_price === 'number' ? v.variant_price : Number(v.variant_price) || 0,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to save options');
      }
      setShowAddModal(false);
      setAddItemSaved(null);
      setAddForm({
        item_name: '',
        item_description: '',
        item_image_url: '',
        image: null,
        food_type: '',
        spice_level: '',
        cuisine_type: '',
        base_price: '',
        selling_price: '',
        discount_percentage: '0',
        tax_percentage: '0',
        in_stock: true,
        available_quantity: '',
        low_stock_threshold: '',
        has_customizations: false,
        has_addons: false,
        has_variants: false,
        is_popular: false,
        is_recommended: false,
        preparation_time_minutes: 15,
        packaging_enabled: false,
        packaging_charges: '',
        serves: 1,
        is_active: true,
        allergens: '',
        available_for_delivery: true,
        weight_per_serving: '',
        weight_per_serving_unit: 'grams',
        calories_kcal: '',
        protein: '',
        protein_unit: 'mg',
        carbohydrates: '',
        carbohydrates_unit: 'mg',
        fat: '',
        fat_unit: 'mg',
        fibre: '',
        fibre_unit: 'mg',
        item_tags: '',
        category_id: null,
        customizations: [],
        variants: [],
      });
      setImagePreview('');
      toast.success('Item saved successfully!');
      const refreshRes = await fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}`);
      const json = await refreshRes.json().catch(() => []);
      setMenuItems(refreshRes.ok && Array.isArray(json) ? json : []);
    } catch (e) {
      console.error('Error saving options:', e);
      setAddError(e instanceof Error ? e.message : 'Error saving options.');
      throw e;
    } finally {
      setIsSaving(false);
    }
  }

  const handleOpenEditModal = async (item: MenuItem) => {
    setEditingId(item.item_id);
    setEditingMenuItemId(item.id);
    setEditImagePreview(item.item_image_url || '');
    
    const allergensString = Array.isArray(item.allergens) 
      ? item.allergens.join(', ') 
      : (typeof item.allergens === 'string' ? item.allergens : '');
    
    let customizationsWithAddons: Customization[] = [];
    let variantsList: Variant[] = [];
    // Use customizations/variants from GET response (enriched by API, bypasses RLS)
    if (Array.isArray(item.customizations) && item.customizations.length > 0) {
      customizationsWithAddons = item.customizations.map((c: any) => ({
        id: c.id,
        customization_id: c.customization_id ?? '',
        menu_item_id: c.menu_item_id ?? item.id,
        customization_title: c.customization_title ?? '',
        customization_type: c.customization_type ?? undefined,
        is_required: c.is_required ?? false,
        min_selection: c.min_selection ?? 0,
        max_selection: c.max_selection ?? 1,
        display_order: c.display_order ?? 0,
        addons: (c.addons ?? []).map((a: any) => ({
          id: a.id,
          addon_id: a.addon_id ?? '',
          customization_id: a.customization_id ?? c.id,
          addon_name: a.addon_name ?? '',
          addon_price: a.addon_price ?? 0,
          addon_image_url: a.addon_image_url,
          in_stock: a.in_stock,
          display_order: a.display_order ?? 0,
        })),
      }));
    }
    if (Array.isArray(item.variants) && item.variants.length > 0) {
      variantsList = item.variants.map((v: any) => ({
        id: v.id,
        variant_id: v.variant_id ?? '',
        menu_item_id: v.menu_item_id ?? item.id,
        variant_name: v.variant_name ?? '',
        variant_type: v.variant_type ?? '',
        variant_price: v.variant_price ?? 0,
        price_difference: v.price_difference,
        in_stock: v.in_stock,
        available_quantity: v.available_quantity,
        display_order: v.display_order ?? 0,
        is_default: v.is_default,
      }));
    }
    // If not enriched (e.g. stale list), fetch from DB (may be empty if RLS blocks)
    if (customizationsWithAddons.length === 0 && variantsList.length === 0) {
      try {
        const [customizations, variants] = await Promise.all([
          fetchCustomizationsForMenuItem(item.id),
          fetchVariantsForMenuItem(item.id),
        ]);
        for (const c of customizations) {
          const addons = await fetchAddonsForCustomization(c.id);
          customizationsWithAddons.push({
            id: c.id,
            customization_id: c.customization_id,
            menu_item_id: c.menu_item_id,
            customization_title: c.customization_title,
            customization_type: c.customization_type ?? undefined,
            is_required: c.is_required ?? false,
            min_selection: c.min_selection ?? 0,
            max_selection: c.max_selection ?? 1,
            display_order: c.display_order ?? 0,
            addons: addons.map((a: any) => ({
              id: a.id,
              addon_id: a.addon_id,
              customization_id: a.customization_id,
              addon_name: a.addon_name,
              addon_price: a.addon_price ?? 0,
              addon_image_url: a.addon_image_url,
              in_stock: a.in_stock,
              display_order: a.display_order ?? 0,
            })),
          });
        }
        variantsList = variants.map((v: any) => ({
          id: v.id,
          variant_id: v.variant_id,
          menu_item_id: v.menu_item_id,
          variant_name: v.variant_name,
          variant_type: v.variant_type,
          variant_price: v.variant_price,
          price_difference: v.price_difference,
          in_stock: v.in_stock,
          available_quantity: v.available_quantity,
          display_order: v.display_order,
          is_default: v.is_default,
        }));
      } catch (e) {
        console.error('Error loading item details:', e);
      }
    }
    
    const basePriceStr = item.base_price != null ? (typeof item.base_price === 'number' ? item.base_price.toFixed(2) : String(item.base_price)) : '';
    const sellingPriceStr = item.selling_price != null ? (typeof item.selling_price === 'number' ? item.selling_price.toFixed(2) : String(item.selling_price)) : '';
    const pkgNum = item.packaging_charges != null ? Number(item.packaging_charges) : NaN;
    const packaging_enabled = Number.isFinite(pkgNum) && pkgNum > 0;
    setEditForm({
      item_name: item.item_name || '',
      item_description: item.item_description || '',
      item_image_url: item.item_image_url || '',
      image: null,
      food_type: normalizeFoodTypeForForm(item.food_type) || '',
      spice_level: normalizeSpiceLevelForForm(item.spice_level) || '',
      cuisine_type: item.cuisine_type || '',
      base_price: basePriceStr,
      selling_price: sellingPriceStr,
      discount_percentage: item.discount_percentage?.toString() ?? '0',
      tax_percentage: item.tax_percentage?.toString() ?? '0',
      in_stock: item.in_stock ?? true,
      available_quantity: item.available_quantity?.toString() || '',
      low_stock_threshold: item.low_stock_threshold?.toString() || '',
      has_customizations: customizationsWithAddons.length > 0,
      has_addons: customizationsWithAddons.some(c => (c.addons?.length ?? 0) > 0),
      has_variants: variantsList.length > 0,
      is_popular: item.is_popular ?? false,
      is_recommended: item.is_recommended ?? false,
      preparation_time_minutes: item.preparation_time_minutes || 15,
      packaging_enabled,
      packaging_charges: packaging_enabled ? String(pkgNum) : '',
      serves: item.serves || 1,
      is_active: item.is_active ?? true,
      allergens: allergensString,
      available_for_delivery: item.available_for_delivery ?? true,
      weight_per_serving: item.weight_per_serving != null ? String(item.weight_per_serving) : '',
      weight_per_serving_unit: item.weight_per_serving_unit ?? 'grams',
      calories_kcal: item.calories_kcal != null ? String(item.calories_kcal) : '',
      protein: item.protein != null ? String(item.protein) : '',
      protein_unit: item.protein_unit ?? 'mg',
      carbohydrates: item.carbohydrates != null ? String(item.carbohydrates) : '',
      carbohydrates_unit: item.carbohydrates_unit ?? 'mg',
      fat: item.fat != null ? String(item.fat) : '',
      fat_unit: item.fat_unit ?? 'mg',
      fibre: item.fibre != null ? String(item.fibre) : '',
      fibre_unit: item.fibre_unit ?? 'mg',
      item_tags: Array.isArray(item.item_tags) ? item.item_tags.join(', ') : '',
      category_id: item.category_id ?? null,
      customizations: customizationsWithAddons,
      variants: variantsList,
    });
    setShowEditModal(true);
  };

  function validateEditItemFields(): string | null {
    if (editImageValidationError) return editImageValidationError;
    if (!editingId || !editingMenuItemId) return 'No item selected for editing.';
    const itemName = (editForm.item_name ?? '').toString().trim();
    if (!itemName) return 'Name is required';
    if (!editForm.category_id) return 'Category is required';
    if (!editForm.base_price || isNaN(Number(editForm.base_price)) || Number(editForm.base_price) <= 0)
      return 'Valid base price is required (greater than 0)';
    if (!editForm.selling_price || isNaN(Number(editForm.selling_price)) || Number(editForm.selling_price) <= 0)
      return 'Valid selling price is required (greater than 0)';
    if (editForm.discount_percentage && (isNaN(Number(editForm.discount_percentage)) || Number(editForm.discount_percentage) < 0 || Number(editForm.discount_percentage) > 100))
      return 'Discount % must be between 0 and 100';
    return null;
  }

  async function handleEditSaveAndNext() {
    const err = validateEditItemFields();
    if (err) {
      setEditError(err);
      return;
    }
    setEditError('');
    setIsSavingEdit(true);
    try {
      let itemImageUrl = editForm.item_image_url;
      if (editForm.image && storeId) {
        const formData = new FormData();
        formData.append('file', editForm.image);
        formData.append('storeId', storeId);
        const uploadRes = await fetch('/api/merchant/menu-items/upload-image', { method: 'POST', body: formData });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          setEditError(err?.error || 'Image upload failed.');
          setIsSavingEdit(false);
          return;
        }
        const uploadData = await uploadRes.json();
        itemImageUrl = uploadData.image_url ?? uploadData.key ?? editForm.item_image_url;
        setEditImagePreview(itemImageUrl);
      }
      const allergensArray = editForm.allergens
        ? editForm.allergens.split(',').map((a: string) => a.trim()).filter(Boolean)
        : [];
      const hasCustomizations = Array.isArray(editForm.customizations) && editForm.customizations.length > 0;
      const hasAddons = Array.isArray(editForm.customizations) && editForm.customizations.some((c: any) => Array.isArray(c.addons) && c.addons.length > 0);
      const packagingPatch = (() => {
        if (!editForm.packaging_enabled) return null;
        const n = Number(String(editForm.packaging_charges ?? '').replace(/,/g, ''));
        return Number.isFinite(n) && n >= 0 ? n : null;
      })();
      const patchBody = {
        itemId: editingId,
        storeId,
        item_name: (editForm.item_name ?? '').toString().trim(),
        item_description: editForm.item_description,
        item_image_url: itemImageUrl,
        food_type: editForm.food_type,
        spice_level: editForm.spice_level,
        cuisine_type: editForm.cuisine_type,
        base_price: Number(editForm.base_price),
        selling_price: Number(editForm.selling_price),
        discount_percentage: editForm.discount_percentage ? Number(editForm.discount_percentage) : 0,
        tax_percentage: 0,
        in_stock: editForm.in_stock,
        available_quantity: editForm.available_quantity ? Number(editForm.available_quantity) : null,
        low_stock_threshold: editForm.low_stock_threshold ? Number(editForm.low_stock_threshold) : null,
        has_customizations: hasCustomizations,
        has_addons: hasAddons,
        has_variants: editForm.has_variants,
        is_popular: editForm.is_popular,
        is_recommended: editForm.is_recommended,
        preparation_time_minutes: editForm.preparation_time_minutes,
        packaging_charges: packagingPatch,
        serves: editForm.serves,
        is_active: editForm.is_active,
        allergens: allergensArray,
        category_id: editForm.category_id,
        ...mxNutritionPayloadFromForm(editForm as unknown as Record<string, unknown>),
        // Do NOT send customizations/variants - save item only, switch to options tab
      };
      const res = await fetch('/api/merchant/menu-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || 'Failed to update item');
      }
      try {
        const { linked, errors } = await linkItemCuisineSelectionsToStoreProfile(storeId!, editForm.cuisine_type);
        if (linked > 0) await refreshCuisineOptionsFromApi();
        if (errors.length > 0) toast.error(errors.slice(0, 2).join(' '));
      } catch (e) {
        console.error('[menu] Failed to link cuisines to store profile', e);
      }
      toast.success('Item saved. Add or edit customizations/variants, then click Submit.');
    } catch (e) {
      console.error('Error updating item:', e);
      setEditError('Error updating item.');
    }
    setIsSavingEdit(false);
  }

  async function handleEditSubmitOptions() {
    if (!editingId || !storeId) {
      toast.error('Item not loaded.');
      return;
    }
    setIsSavingEdit(true);
    setEditError('');
    try {
      const custs = Array.isArray(editForm.customizations) ? editForm.customizations : [];
      const vars = Array.isArray(editForm.variants) ? editForm.variants : [];
      const hasCustomizations = custs.length > 0;
      const hasAddons = custs.some((c: any) => Array.isArray(c.addons) && c.addons.length > 0);
      const res = await fetch('/api/merchant/menu-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: editingId,
          storeId,
          base_price: Number(editForm.base_price),
          has_customizations: hasCustomizations,
          has_addons: hasAddons,
          has_variants: vars.length > 0,
          customizations: custs,
          variants: vars.map((v: any) => ({
            variant_name: v.variant_name,
            variant_type: v.variant_type ?? null,
            variant_price: typeof v.variant_price === 'number' ? v.variant_price : Number(v.variant_price) || 0,
          })),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || 'Failed to save options');
      }
      const saveJson = await res.json().catch(() => ({}));
      const listRes = await fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}`);
      const listJson = await listRes.json().catch(() => []);
      const itemsList = listRes.ok && Array.isArray(listJson) ? listJson : [];
      const updatedMenuItem = itemsList.find((item: any) => item.item_id === editingId);
      if (updatedMenuItem) {
        setMenuItems((prev) => prev.map((item) => (item.item_id === editingId ? { ...item, ...updatedMenuItem } : item)));
      }
      setShowEditModal(false);
      await refetchImageCount();
      if (saveJson?.pending_review) {
        toast.success(
          saveJson?.unchanged
            ? 'Already under review. Live menu stays unchanged until approved.'
            : 'Changes submitted for review. Live menu stays unchanged until approved.'
        );
      } else if (saveJson?.no_changes) {
        toast.success('No new changes to submit.');
      } else {
        toast.success('Item updated successfully!');
      }
    } catch (e) {
      console.error('Error saving options:', e);
      setEditError(e instanceof Error ? e.message : 'Error saving options.');
    }
    setIsSavingEdit(false);
  }

  async function handleSaveEdit() {
    const err = validateEditItemFields();
    if (err) {
      setEditError(err);
      return;
    }
    setEditError('');
    setIsSavingEdit(true);
    try {
      let itemImageUrl = editForm.item_image_url;
      if (editForm.image && storeId) {
        const formData = new FormData();
        formData.append('file', editForm.image);
        formData.append('storeId', storeId);
        const uploadRes = await fetch('/api/merchant/menu-items/upload-image', { method: 'POST', body: formData });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          setEditError(err?.error || 'Image upload failed.');
          setIsSavingEdit(false);
          return;
        }
        const uploadData = await uploadRes.json();
        itemImageUrl = uploadData.image_url ?? uploadData.key ?? editForm.item_image_url;
        setEditImagePreview(itemImageUrl);
      }
      const allergensArray = editForm.allergens
        ? editForm.allergens.split(',').map((a: string) => a.trim()).filter(Boolean)
        : [];
      const hasCustomizations = Array.isArray(editForm.customizations) && editForm.customizations.length > 0;
      const hasAddons = Array.isArray(editForm.customizations) && editForm.customizations.some((c: any) => Array.isArray(c.addons) && c.addons.length > 0);
      const custs = Array.isArray(editForm.customizations) ? editForm.customizations : [];
      const vars = Array.isArray(editForm.variants) ? editForm.variants : [];
      const res = await fetch('/api/merchant/menu-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: editingId,
          storeId,
          item_name: (editForm.item_name ?? '').toString().trim(),
          item_description: editForm.item_description,
          item_image_url: itemImageUrl,
          food_type: editForm.food_type,
          spice_level: editForm.spice_level,
          cuisine_type: editForm.cuisine_type,
          base_price: Number(editForm.base_price),
          selling_price: Number(editForm.selling_price),
          discount_percentage: editForm.discount_percentage ? Number(editForm.discount_percentage) : 0,
          tax_percentage: 0,
          in_stock: editForm.in_stock,
          available_quantity: editForm.available_quantity ? Number(editForm.available_quantity) : null,
          low_stock_threshold: editForm.low_stock_threshold ? Number(editForm.low_stock_threshold) : null,
          has_customizations: hasCustomizations,
          has_addons: hasAddons,
          has_variants: editForm.has_variants,
          is_popular: editForm.is_popular,
          is_recommended: editForm.is_recommended,
          preparation_time_minutes: editForm.preparation_time_minutes,
          packaging_charges: (() => {
            if (!editForm.packaging_enabled) return null;
            const n = Number(String(editForm.packaging_charges ?? '').replace(/,/g, ''));
            return Number.isFinite(n) && n >= 0 ? n : null;
          })(),
          serves: editForm.serves,
          is_active: editForm.is_active,
          allergens: allergensArray,
          category_id: editForm.category_id,
          ...mxNutritionPayloadFromForm(editForm as unknown as Record<string, unknown>),
          customizations: custs,
          variants: vars.map((v: any) => ({
            variant_name: v.variant_name,
            variant_type: v.variant_type ?? null,
            variant_price: typeof v.variant_price === 'number' ? v.variant_price : Number(v.variant_price) || 0,
          })),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || 'Failed to update menu item');
      }
      const result = await res.json();
      if (result?.pending_review) {
        setShowEditModal(false);
        await refetchImageCount();
        toast.success('Changes submitted for review. Live menu stays unchanged until approved.');
      } else if (result?.item_id) {
        const listRes = await fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId!)}`);
        const listJson = await listRes.json().catch(() => []);
        const itemsList = listRes.ok && Array.isArray(listJson) ? listJson : [];
        const updatedMenuItem = itemsList.find((item: any) => item.item_id === editingId);
        if (updatedMenuItem) {
          setMenuItems((prev) => prev.map((item) => (item.item_id === editingId ? { ...item, ...updatedMenuItem } : item)));
        } else {
          setMenuItems((prev) => prev.map((item) => (item.item_id === editingId ? { ...item, ...result, item_image_url: itemImageUrl } : item)));
        }
        try {
          const { linked, errors } = await linkItemCuisineSelectionsToStoreProfile(
            storeId!,
            (result.cuisine_type as string) || editForm.cuisine_type
          );
          if (linked > 0) await refreshCuisineOptionsFromApi();
          if (errors.length > 0) toast.error(errors.slice(0, 2).join(' '));
        } catch (e) {
          console.error('[menu] Failed to link cuisines to store profile', e);
        }
        setShowEditModal(false);
        await refetchImageCount();
        toast.success('Item updated successfully!');
      } else {
        setEditError('Failed to update item. Please try again.');
      }
    } catch (e) {
      console.error('Error updating item:', e);
      setEditError('Error updating item.');
    }
    setIsSavingEdit(false);
  }

  async function handleDeleteItem() {
    if (!deleteItemId) return;
    
    setIsDeleting(true);
    try {
      const result = await deleteMenuItem(deleteItemId);
      if (result) {
        setMenuItems(prev => prev.filter(item => item.item_id !== deleteItemId));
        setShowDeleteModal(false);
        setDeleteItemId(null);
        await refetchImageCount();
        toast.success('Item deleted successfully!');
      } else {
        toast.error('Failed to delete item.');
      }
    } catch (error) {
      toast.error('Error deleting item.');
    } finally {
      setIsDeleting(false);
    }
  }

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const isOosActive = useCallback((manual?: boolean, until?: string | null) => {
    if (manual) return true;
    if (!until) return false;
    const ms = new Date(until).getTime();
    return Number.isFinite(ms) && ms > nowTick;
  }, [nowTick]);

  useEffect(() => {
    if (!storeId) return;
    const hasStaleExpired =
      menuItems.some(
        (item) =>
          !item.out_of_stock_manual &&
          item.out_of_stock_until != null &&
          new Date(String(item.out_of_stock_until)).getTime() <= nowTick &&
          item.in_stock === false
      ) ||
      categories.some(
        (c) =>
          !c.out_of_stock_manual &&
          c.out_of_stock_until != null &&
          new Date(String(c.out_of_stock_until)).getTime() <= nowTick
      );
    if (!hasStaleExpired) return;
    void fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}&view=list`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((items) => {
        if (Array.isArray(items)) setMenuItems(items);
      })
      .catch(() => undefined);
  }, [nowTick, storeId, menuItems, categories]);

  const isCategoryOos = useCallback((categoryId: number | null | undefined) => {
    if (categoryId == null) return false;
    const c = categoryById.get(categoryId);
    return c ? isOosActive(c.out_of_stock_manual, c.out_of_stock_until ?? null) : false;
  }, [categoryById, isOosActive]);

  const isItemBlockedByCategoryOos = useCallback((item: MenuItem) => {
    const categoryId = item.category_id ?? null;
    if (categoryId == null) return false;
    const c = categoryById.get(categoryId);
    if (!c) return false;
    const catOos = isOosActive(c.out_of_stock_manual, c.out_of_stock_until ?? null);
    if (!catOos) return false;
    // Category OOS cascades to items by stamping out_of_stock_updated_at with the category marker.
    // If an item was later manually cleared (has a different marker), it should be allowed In Stock.
    const catMarker = (c as any).out_of_stock_updated_at ?? null;
    const itemMarker = (item as any).out_of_stock_updated_at ?? null;
    if (!catMarker || !itemMarker) return false;
    return String(itemMarker) === String(catMarker);
  }, [categoryById, isOosActive]);

  const itemInStockIgnoringCategory = useCallback((item: MenuItem) => {
    if (isOosActive(item.out_of_stock_manual, item.out_of_stock_until ?? null)) {
      return false;
    }
    if (
      !item.out_of_stock_manual &&
      item.out_of_stock_until == null &&
      item.in_stock === false &&
      (item.out_of_stock_updated_at == null || String(item.out_of_stock_updated_at).trim() === "")
    ) {
      return false;
    }
    return true;
  }, [isOosActive]);

  const effectiveInStock = useCallback((item: MenuItem) => {
    const baseOk = itemInStockIgnoringCategory(item);
    if (!baseOk) return false;
    // Only block by category OOS if the item is still under the category cascade marker.
    return !isItemBlockedByCategoryOos(item);
  }, [isItemBlockedByCategoryOos, itemInStockIgnoringCategory]);

  const comboComponentsAvailable = useCallback((comboId: number) => {
    const details = comboDetailsById[comboId];
    const componentIds: number[] = Array.isArray((details as any)?.components)
      ? ((details as any).components as any[]).map((x) => Number((x as any)?.menu_item_id)).filter((n) => Number.isFinite(n))
      : [];
    if (componentIds.length === 0) return true;
    for (const id of componentIds) {
      const it = menuItems.find((m) => Number(m.item_id) === id);
      if (it && !effectiveInStock(it)) return false;
    }
    return true;
  }, [comboDetailsById, effectiveInStock, menuItems]);

  const effectiveComboInStock = useCallback((c: MenuCombo) => {
    const base = c.is_active !== false;
    const comboOos = isOosActive(c.out_of_stock_manual, c.out_of_stock_until ?? null);
    const componentsOk = comboComponentsAvailable(c.id);
    return base && !comboOos && componentsOk;
  }, [comboComponentsAvailable, isOosActive]);

  const formatOosUntil = useCallback((untilIso: string) => {
    const d = new Date(untilIso);
    if (Number.isNaN(d.getTime())) return null;
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${time}, ${date}`;
  }, []);

  const getComboOosLabel = useCallback((c: MenuCombo) => {
    if (effectiveComboInStock(c)) return null;
    // Combo-specific OOS first
    if (c.out_of_stock_manual) return 'Out of stock';
    if (c.out_of_stock_until) {
      const fmt = formatOosUntil(c.out_of_stock_until);
      return fmt ? `Out of stock till ${fmt}` : 'Out of stock';
    }
    // Then component-item blocking
    if (!comboComponentsAvailable(c.id)) return 'Not available · an item is out of stock';
    // Fallback (inactive)
    return 'Out of stock';
  }, [comboComponentsAvailable, effectiveComboInStock, formatOosUntil]);

  const getItemOosLabel = useCallback((item: MenuItem) => {
    if (effectiveInStock(item)) return null;
    // Category OOS takes precedence for messaging.
    if (item.category_id != null) {
      const c = categoryById.get(item.category_id);
      if (c && isItemBlockedByCategoryOos(item)) {
        if (c.out_of_stock_manual) return 'Out of stock (category) · manual';
        if (c.out_of_stock_until && isOosActive(c.out_of_stock_manual, c.out_of_stock_until)) {
          const fmt = formatOosUntil(c.out_of_stock_until);
          return fmt ? `Out of stock (category) till ${fmt}` : 'Out of stock (category)';
        }
        return 'Out of stock (category)';
      }
    }
    if (item.out_of_stock_manual) return 'Out of stock · manual';
    if (item.out_of_stock_until && isOosActive(false, item.out_of_stock_until)) {
      const fmt = formatOosUntil(item.out_of_stock_until);
      return fmt ? `Out of stock till ${fmt}` : 'Out of stock';
    }
    // Fallback: legacy base flag
    if (item.in_stock === false) return 'Out of stock';
    return 'Out of stock';
  }, [categoryById, effectiveInStock, formatOosUntil, isItemBlockedByCategoryOos, isOosActive]);

  async function clearOutOfStockForItem(item: MenuItem) {
    if (!storeId) return;
    setOosBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const res = await fetch('/api/merchant/menu-out-of-stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, targetType: 'item', id: item.item_id, mode: 'CLEAR' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to clear out-of-stock');
      setMenuItems((prev) =>
        prev.map((p) =>
          p.item_id === item.item_id
            ? { ...p, out_of_stock_manual: false, out_of_stock_until: null, in_stock: true, out_of_stock_updated_at: nowIso }
            : p
        )
      );
      toast.success('Item marked In Stock!');

      // If this item belongs to a category currently marked OOS, auto-clear the category when all items are back in stock.
      const catId = item.category_id ?? null;
      if (catId != null) {
        const cat = categoryById.get(catId);
        const catOosActive = cat ? isOosActive((cat as any).out_of_stock_manual, (cat as any).out_of_stock_until ?? null) : false;
        if (catOosActive) {
          const allBack = menuItems
            .filter((it) => (it.category_id ?? null) === catId && (it as any).is_deleted !== true)
            .every((it) =>
              it.item_id === item.item_id ? true : itemInStockIgnoringCategory(it)
            );
          if (allBack) {
            await clearOutOfStockForCategory(catId);
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setOosBusy(false);
    }
  }

  async function handleCustOptionStockToggle(
    item: MenuItem,
    targetType: 'variant' | 'addon' | 'modifier_option',
    optionId: number,
    inStock: boolean
  ) {
    if (!storeId || !optionId) return;
    const busyKey = `${targetType}-${optionId}`;
    setCustStockBusy(busyKey);
    try {
      const res = await fetch('/api/merchant/menu-option-stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, targetType, id: optionId, in_stock: inStock }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'Failed to update stock');
      setMenuItems((prev) =>
        prev.map((it) => {
          if (it.id !== item.id && it.item_id !== item.item_id) return it;
          if (targetType === 'variant') {
            return {
              ...it,
              variants: (it.variants ?? []).map((v) =>
                v.id === optionId ? { ...v, in_stock: inStock } : v
              ),
            };
          }
          if (targetType === 'addon') {
            return {
              ...it,
              customizations: (it.customizations ?? []).map((g) => ({
                ...g,
                addons: (g.addons ?? []).map((a) =>
                  a.id === optionId ? { ...a, in_stock: inStock } : a
                ),
              })),
            };
          }
          return {
            ...it,
            linked_modifier_groups: (it.linked_modifier_groups ?? []).map((g) => ({
              ...g,
              options: (g.options ?? []).map((o) =>
                o.id === optionId ? { ...o, in_stock: inStock } : o
              ),
            })),
          };
        })
      );
      toast.success(inStock ? 'Marked in stock' : 'Marked out of stock');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update stock');
    } finally {
      setCustStockBusy(null);
    }
  }

  async function clearOutOfStockForCategory(categoryId: number) {
    if (!storeId) return;
    setOosBusy(true);
    try {
      const prevMarker = (categoryById.get(categoryId) as any)?.out_of_stock_updated_at ?? null;
      const res = await fetch('/api/merchant/menu-out-of-stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, targetType: 'category', id: categoryId, mode: 'CLEAR' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to clear out-of-stock');
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId
            ? { ...c, out_of_stock_manual: false, out_of_stock_until: null, out_of_stock_updated_at: (data as any)?.out_of_stock_updated_at ?? null }
            : c
        )
      );
      // Locally restore items that were blocked by the previous category cascade marker.
      if (prevMarker) {
        setMenuItems((prev) =>
          prev.map((it) => {
            if ((it.category_id ?? null) !== categoryId) return it;
            const itMarker = (it as any).out_of_stock_updated_at ?? null;
            const wasCascaded = itMarker != null && String(itMarker) === String(prevMarker) && !it.out_of_stock_manual;
            if (!wasCascaded) return it;
            return { ...it, out_of_stock_manual: false, out_of_stock_until: null, in_stock: true };
          })
        );
      }
      toast.success('Category marked In Stock!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setOosBusy(false);
    }
  }

  async function clearOutOfStockForCombo(comboId: number) {
    if (!storeId) return;
    setOosBusy(true);
    try {
      const res = await fetch('/api/merchant/menu-out-of-stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, targetType: 'combo', id: comboId, mode: 'CLEAR' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to clear out-of-stock');
      setCombos((prev) => prev.map((c) => (c.id === comboId ? { ...c, out_of_stock_manual: false, out_of_stock_until: null } : c)));
      toast.success('Combo marked In Stock!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setOosBusy(false);
    }
  }

  function requestRestoreConfirm(action: () => Promise<void> | void) {
    setRestoreConfirm({
      title: 'Bring back in stock?',
      message: 'This will make it available to customers and start receiving orders.',
      onConfirm: async () => {
        setRestoreConfirm(null);
        await action();
      },
    });
  }

  async function confirmOutOfStock() {
    if (!storeId || !oosModal) return;
    setOosBusy(true);
    try {
      const mode =
        oosChoice === 'HOURS'
          ? 'HOURS'
          : oosChoice === 'NEXT_OPEN'
            ? 'NEXT_OPEN'
            : oosChoice === 'CUSTOM'
              ? 'CUSTOM'
              : 'MANUAL';

      const untilIso =
        oosChoice === 'CUSTOM'
          ? new Date(`${oosDate}T${oosTime}:00`).toISOString()
          : undefined;

      const body =
        oosModal.kind === 'item'
          ? { storeId, targetType: 'item', id: oosModal.item_id, mode, hours: oosChoice === 'HOURS' ? oosHours : undefined, until: untilIso }
          : oosModal.kind === 'category'
            ? { storeId, targetType: 'category', id: oosModal.categoryId, mode, hours: oosChoice === 'HOURS' ? oosHours : undefined, until: untilIso }
            : { storeId, targetType: 'combo', id: oosModal.comboId, mode, hours: oosChoice === 'HOURS' ? oosHours : undefined, until: untilIso };

      const res = await fetch('/api/merchant/menu-out-of-stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to update out-of-stock');

      if (oosModal.kind === 'item') {
        const marker = (data as any)?.out_of_stock_updated_at ?? new Date().toISOString();
        setMenuItems((prev) =>
          prev.map((p) =>
            p.item_id === oosModal.item_id
              ? { ...p, out_of_stock_manual: Boolean((data as any)?.out_of_stock_manual), out_of_stock_until: (data as any)?.out_of_stock_until ?? null, out_of_stock_updated_at: marker, in_stock: true }
              : p
          )
        );
      } else if (oosModal.kind === 'category') {
        const marker = (data as any)?.out_of_stock_updated_at ?? new Date().toISOString();
        setCategories((prev) =>
          prev.map((c) =>
            c.id === oosModal.categoryId
              ? { ...c, out_of_stock_manual: Boolean((data as any)?.out_of_stock_manual), out_of_stock_until: (data as any)?.out_of_stock_until ?? null, out_of_stock_updated_at: marker }
              : c
          )
        );
        // Locally cascade to items like the backend does (without overriding already-OOS items).
        setMenuItems((prev) =>
          prev.map((it) => {
            if ((it.category_id ?? null) !== oosModal.categoryId) return it;
            if ((it as any).is_deleted === true) return it;
            const itemAlreadyOos = isOosActive(it.out_of_stock_manual, it.out_of_stock_until ?? null);
            if (itemAlreadyOos) return it;
            return {
              ...it,
              out_of_stock_manual: false,
              out_of_stock_until: (data as any)?.out_of_stock_until ?? null,
              out_of_stock_updated_at: marker,
              in_stock: true,
            };
          })
        );
      } else {
        const marker = (data as any)?.out_of_stock_updated_at ?? new Date().toISOString();
        setCombos((prev) =>
          prev.map((c) =>
            c.id === oosModal.comboId
              ? { ...c, out_of_stock_manual: Boolean((data as any)?.out_of_stock_manual), out_of_stock_until: (data as any)?.out_of_stock_until ?? null, out_of_stock_updated_at: marker }
              : c
          )
        );
      }

      setOosModal(null);
      toast.success('Out of stock updated!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setOosBusy(false);
    }
  }

  // Default "Custom date & time" to now + 1 hour, and keep it fresh while sheet is open
  // until the user changes the custom inputs.
  useEffect(() => {
    if (!oosModal) return;
    setOosSheetShown(false);
    const raf = requestAnimationFrame(() => setOosSheetShown(true));
    setOosCustomTouched(false);
    const d = new Date(Date.now() + 60 * 60 * 1000);
    setOosDate(d.toISOString().slice(0, 10));
    setOosTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    const t = setInterval(() => {
      setOosDate((prev) => {
        if (oosCustomTouched) return prev;
        const dd = new Date(Date.now() + 60 * 60 * 1000);
        return dd.toISOString().slice(0, 10);
      });
      setOosTime((prev) => {
        if (oosCustomTouched) return prev;
        const dd = new Date(Date.now() + 60 * 60 * 1000);
        return `${String(dd.getHours()).padStart(2, '0')}:${String(dd.getMinutes()).padStart(2, '0')}`;
      });
    }, 60 * 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, [oosModal, oosCustomTouched]);

  // Calculate stats (effective: item + category OOS)
  const inStock = menuItems.filter((item) => effectiveInStock(item)).length;
  const outStock = menuItems.filter((item) => !effectiveInStock(item)).length;
  const outStockPercent = menuItems.length ? Math.round((outStock / menuItems.length) * 100) : 0;

  // Filter items by selected category (category mode includes its sub-categories; sub-category mode is exact match)
  const filteredItems = (() => {
    if (selectedCategoryId == null) return menuItems;
    const selected = categories.find((c) => c.id === selectedCategoryId);
    if (!selected) return menuItems.filter((item) => item.category_id === selectedCategoryId);
    const isRoot = !selected.parent_category_id;
    if (categoryPillMode === 'category' && isRoot) {
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

  // Filter by search term
  const searchedItems = searchTerm
    ? filteredItems.filter(item => 
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.item_description && item.item_description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : filteredItems;

  const custScopeItems = useMemo(
    () => searchedItems.filter(itemHasCustomizationContent),
    [searchedItems]
  );

  const searchedCombos = useMemo(() => {
    if (selectedCategoryId !== null) return [];
    if (!searchTerm.trim()) return combos;
    const q = searchTerm.trim().toLowerCase();
    return combos.filter((c) =>
      String(c.combo_name ?? '').toLowerCase().includes(q) ||
      String(c.description ?? '').toLowerCase().includes(q)
    );
  }, [combos, searchTerm, selectedCategoryId]);

  const treeGroups = useMemo(() => {
    const byCat = new Map<string, { key: string; categoryId: number | null; categoryName: string; items: MenuItem[] }>();
    for (const item of searchedItems) {
      const categoryId = item.category_id ?? null;
      const categoryName =
        categoryId == null
          ? 'Uncategorized'
          : categories.find((c) => c.id === categoryId)?.category_name ?? 'Uncategorized';
      const key = String(categoryId ?? 'uncategorized');
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
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('mx_menu_view_mode');
      if (saved === 'card' || saved === 'tree') setViewMode(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('mx_menu_view_mode', viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  // Lock shell scroll — only the menu list scrolls, toolbar stays fixed below partner header.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('mx-no-page-scroll');
    body.classList.add('mx-no-page-scroll');
    return () => {
      html.classList.remove('mx-no-page-scroll');
      body.classList.remove('mx-no-page-scroll');
    };
  }, []);

  // Plan-driven: no hardcoding. When planLimits is null (no plan) = no restrictions
  const canAddItem =
    planLimits == null ||
    planLimits.maxMenuItems == null ||
    menuItems.filter((i) => !i.is_deleted).length < planLimits.maxMenuItems;
  const canAddCategory = planLimits == null || planLimits.maxMenuCategories == null || categories.length < planLimits.maxMenuCategories;

  const menuPageSubtitle = useMemo(() => {
    const base = 'Manage your menu items and categories';
    const pn = planLimits?.planName;
    if (pn != null && pn !== '') return `${base} · Plan: ${pn}`;
    return base;
  }, [planLimits?.planName]);

  if (!storeIdResolved && !storeId) {
    return (
      <MXLayoutWhite restaurantName="Loading..." restaurantId={undefined}>
        <PartnerPageHeader title="Menu Management" subtitle="Loading menu…" />
        <MenuPageSkeleton />
      </MXLayoutWhite>
    );
  }

  // Show error if no store is selected
  if (storeError) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name || "Unknown Store"} restaurantId={storeId ?? undefined}>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center p-8">
            <Package size={64} className="text-gray-300 mb-4 mx-auto" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Store Not Selected</h2>
            <p className="text-gray-600 mb-6">{storeError}</p>
            <div className="space-y-3">
              <p className="text-gray-500 text-sm">How to select a store:</p>
              <ul className="text-left text-gray-600 text-sm max-w-md mx-auto">
                <li className="mb-2">1. Go to the Stores dashboard</li>
                <li className="mb-2">2. Select a store from the list</li>
                <li className="mb-2">3. Click on "Menu Management" for that store</li>
                <li>4. Or make sure the URL contains <code className="bg-gray-100 px-2 py-1 rounded">?storeId=YOUR_STORE_ID</code></li>
              </ul>
            </div>
          </div>
        </div>
      </MXLayoutWhite>
    );
  }

  return (
    <MXLayoutWhite restaurantName={store?.store_name || "Loading..."} restaurantId={storeId ?? undefined}>
      <PartnerPageHeader title="Menu Management" subtitle={menuPageSubtitle} />

      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div id="mx-menu-toolbar" className="shrink-0 z-20 bg-white shadow-sm">
        <div className="border-b border-gray-200">
        <div className="mx-shell-header !px-3 sm:!px-4 lg:!px-6 flex items-center gap-2 justify-between flex-nowrap py-2">
          <div className="flex items-center gap-1.5 min-w-0 shrink">
            <MobileHamburgerButton />
            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-hide">
              <div className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 min-w-[72px] shrink-0">
                <div className="text-gray-500 text-[10px] font-medium leading-tight whitespace-nowrap">
                  Total Items
                  {planLimits?.maxMenuItems != null && (
                    <span className="text-gray-400">/ {planLimits.maxMenuItems}</span>
                  )}
                </div>
                <div className="text-base font-bold text-gray-900 leading-tight">{menuItems.length}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 min-w-[72px] shrink-0">
                <div className="text-gray-500 text-[10px] font-medium leading-tight whitespace-nowrap">In Stock</div>
                <div className="text-base font-bold text-green-600 leading-tight">{inStock}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 min-w-[80px] shrink-0">
                <div className="text-gray-500 text-[10px] font-medium leading-tight whitespace-nowrap">Out of Stock</div>
                <div className="text-base font-bold text-red-600 leading-tight">{outStock} ({outStockPercent}%)</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 min-w-[72px] shrink-0">
                <div className="text-gray-500 text-[10px] font-medium leading-tight whitespace-nowrap">
                  Categories
                  {planLimits?.maxMenuCategories != null && (
                    <span className="text-gray-400">/ {planLimits.maxMenuCategories}</span>
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
                onClick={() => setContentScope('item')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors ${contentScope === 'item' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                aria-pressed={contentScope === 'item'}
              >
                <Package size={16} />
                Item
              </button>
              <button
                type="button"
                onClick={() => setContentScope('cust')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors border-l border-gray-200 ${contentScope === 'cust' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                aria-pressed={contentScope === 'cust'}
              >
                <SlidersHorizontal size={16} />
                Cust
              </button>
            </div>
            {contentScope === 'item' ? (
            <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors ${viewMode === 'card' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                aria-pressed={viewMode === 'card'}
              >
                <LayoutGrid size={16} />
                Card
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors border-l border-gray-200 ${viewMode === 'tree' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                aria-pressed={viewMode === 'tree'}
              >
                <ListTree size={16} />
                Tree
              </button>
            </div>
            ) : null}
            <button
              type="button"
              disabled={!canAddCategory}
              title={canAddCategory ? "Add a new menu category" : "Category limit reached for your plan. Upgrade to add more categories."}
              onClick={() => { setCategoryModalMode('add'); setShowCategoryModal(true); setParentCategoryIdInForm(null); setCategoryForm({ category_name: '', is_active: true }); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${canAddCategory ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
            >
              <Plus size={16} />
              Add Category
              {planLimits?.maxMenuCategories != null && (
                <span className="text-xs opacity-80">({categories.length}/{planLimits.maxMenuCategories})</span>
              )}
            </button>
            <button
              type="button"
              disabled={!canAddItem}
              title={canAddItem ? "Add a new menu item (will be reviewed before going live)" : "Menu item limit reached for your plan. Upgrade to add more items."}
              onClick={() => {
                if (!canAddItem) return;
                if (categories.length === 0) {
                  if (!canAddCategory) return;
                  setCategoryModalMode('add');
                  setShowCategoryModal(true);
                  setParentCategoryIdInForm(null);
                  setCategoryForm({ category_name: '', is_active: true });
                  return;
                }
                setShowAddModal(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${canAddItem ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
            >
              <Plus size={16} />
              Add Menu Item
              {planLimits?.maxMenuItems != null && (
                <span className="text-xs opacity-90">({menuItems.length}/{planLimits.maxMenuItems})</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowMenuFileSection(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-amber-600 text-amber-700 bg-white hover:bg-amber-50 transition-colors"
            >
              <Upload size={16} />
              Menu file
            </button>
          </div>
        </div>
        </div>

        {(() => {
          const lockedCount = menuItems.filter((i) => isMenuItemLockedByPlan(i)).length;
          if (lockedCount === 0 || lockedPlanBannerDismissed) return null;
          return (
            <div className="px-3 sm:px-4 pt-2.5 pb-1">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                <p className="min-w-0 truncate text-xs font-medium text-amber-900">
                  <span className="font-bold">{lockedCount}</span> item{lockedCount !== 1 ? 's' : ''} locked
                  <span className="hidden sm:inline"> — newest items auto-locked (plan limit)</span>
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href="/mx/store-settings?tab=plans"
                    className="inline-flex items-center rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                  >
                    Upgrade
                  </a>
                  <button
                    type="button"
                    onClick={() => setLockedPlanBannerDismissed(true)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-800 hover:bg-amber-100 transition-colors"
                    aria-label="Dismiss locked items notice"
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Search and Categories - single row, sticky All + horizontal scroll */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-gray-200">
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
            <div className="flex-shrink-0 rounded-md text-xs font-medium whitespace-nowrap bg-orange-500 text-white shadow-sm ring-1 ring-orange-200">
              <select
                className="bg-transparent px-3 py-1.5 outline-none text-white"
                value={categoryPillMode}
                onChange={(e) => {
                  const v = e.target.value === 'sub-category' ? 'sub-category' : 'category';
                  setCategoryPillMode(v);
                  setSelectedCategoryId(null);
                }}
              >
                <option value="category">All Category</option>
                <option value="sub-category">All Sub-Category</option>
              </select>
            </div>

            <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-hidden">
              {(categoryPillMode === 'category' ? rootCategories : subCategories).length > 0 && (
                <button
                  type="button"
                  onClick={() => categoryScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
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
                  {(categoryPillMode === 'category' ? rootCategories : subCategories).map((category) => (
                    <button
                      key={category.id}
                      onClick={() =>
                        setSelectedCategoryId((prev) => (prev === category.id ? null : category.id))
                      }
                      className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap max-w-[160px] truncate ${
                        selectedCategoryId === category.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      title={
                        categoryPillMode === 'sub-category' && category.parent_category_id
                          ? `${categories.find((c) => c.id === category.parent_category_id)?.category_name ?? ''} / ${category.category_name}`
                          : category.category_name
                      }
                    >
                      {categoryPillMode === 'sub-category' && category.parent_category_id
                        ? `${categories.find((c) => c.id === category.parent_category_id)?.category_name ?? ''} / ${category.category_name}`
                        : category.category_name}
                    </button>
                  ))}
                </div>
              </div>
              {(categoryPillMode === 'category' ? rootCategories : subCategories).length > 0 && (
                <button
                  type="button"
                  onClick={() => categoryScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                  className="flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Next categories"
                >
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={menuListScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-3 sm:px-4 py-3 relative bg-white"
      >
        {isLoading ? (
          <MenuItemsGridSkeleton />
        ) : ((contentScope === 'item'
            ? searchedItems.length === 0 && searchedCombos.length === 0
            : custScopeItems.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package size={48} className="text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-700">
              {contentScope === 'cust' ? 'No customization items found' : 'No menu items found'}
            </h3>
            <p className="text-gray-500 mt-2">
              {contentScope === 'cust'
                ? searchTerm
                  ? 'Try a different search term or switch to Item view'
                  : 'Items with add-ons or variants will appear here'
                : searchTerm
                  ? 'Try a different search term'
                  : 'Add your first menu item to get started'}
            </p>
            {contentScope === 'item' && categories.length === 0 && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-sm text-gray-400">You need to create a category first</p>
                <button
                  type="button"
                  disabled={!canAddCategory}
                  onClick={() => {
                    if (!canAddCategory) return;
                    setCategoryModalMode('add');
                    setShowCategoryModal(true);
                    setParentCategoryIdInForm(null);
                    setCategoryForm({ category_name: '', is_active: true });
                  }}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg ${canAddCategory ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                >
                  Add Category
                </button>
              </div>
            )}
          </div>
        ) : contentScope === 'cust' ? (
          <div className="space-y-4">
            {custScopeItems.map((item) => {
              const category = categories.find((cat) => cat.id === item.category_id);
              const variants = item.variants ?? [];
              const custGroups = item.customizations ?? [];
              const linkedGroups = item.linked_modifier_groups ?? [];
              return (
                <div key={item.item_id || item.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/80 p-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                      <R2Image
                        src={item.item_image_url}
                        alt={item.item_name}
                        className="h-full w-full object-cover"
                        fallbackSrc={ITEM_PLACEHOLDER_SVG}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">{item.item_name}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {category?.category_name || 'Uncategorized'}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-orange-600">₹{item.selling_price}</p>
                  </div>
                  <div className="space-y-3 p-3">
                    {variants.length > 0 ? (
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700">Variants</p>
                        <ul className="space-y-1">
                          {variants.map((v, i) => {
                            const variantInStock = v.in_stock !== false;
                            const variantBusy = custStockBusy === `variant-${v.id}`;
                            return (
                            <li
                              key={v.variant_id || i}
                              className="flex items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-2.5 py-1.5 text-sm"
                            >
                              <span className="min-w-0 flex-1 text-gray-800">
                                {v.variant_name || v.variant_type || 'Variant'}
                                {v.variant_size_value && v.variant_size_unit
                                  ? ` (${v.variant_size_value} ${v.variant_size_unit})`
                                  : ''}
                              </span>
                              <span className="font-semibold tabular-nums text-gray-900 shrink-0">₹{v.variant_price ?? 0}</span>
                              {v.id ? (
                                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                                  <input
                                    type="checkbox"
                                    checked={variantInStock}
                                    disabled={variantBusy}
                                    onChange={() => handleCustOptionStockToggle(item, 'variant', v.id!, !variantInStock)}
                                    className="sr-only peer"
                                  />
                                  <div className={`relative h-4 w-7 rounded-full bg-gray-200 transition-all peer-checked:bg-green-500 ${variantBusy ? 'opacity-50' : ''}`}>
                                    <div className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${variantInStock ? 'translate-x-3' : ''}`} />
                                  </div>
                                </label>
                              ) : null}
                            </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    {custGroups.length > 0 ? (
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-blue-700">Add-ons / Customizations</p>
                        <div className="space-y-2">
                          {custGroups.map((group, idx) => (
                            <div key={group.customization_id || idx} className="rounded-lg border border-blue-100 bg-blue-50/30 p-2.5">
                              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900">{group.customization_title}</p>
                                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200">
                                  {group.customization_type || 'Checkbox'}
                                </span>
                              </div>
                              <ul className="space-y-1">
                                {(group.addons ?? (group as { options?: Addon[] }).options ?? []).map((addon, j) => {
                                  const addonInStock = addon.in_stock !== false;
                                  const addonBusy = custStockBusy === `addon-${addon.id}`;
                                  return (
                                  <li
                                    key={addon.addon_id || j}
                                    className="flex items-center justify-between gap-2 rounded border border-white bg-white px-2 py-1 text-sm"
                                  >
                                    <span className="min-w-0 flex-1 text-gray-700">{addon.addon_name}</span>
                                    <span className="font-medium tabular-nums text-gray-900 shrink-0">₹{addon.addon_price ?? 0}</span>
                                    {addon.id ? (
                                      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                                        <input
                                          type="checkbox"
                                          checked={addonInStock}
                                          disabled={addonBusy}
                                          onChange={() => handleCustOptionStockToggle(item, 'addon', addon.id!, !addonInStock)}
                                          className="sr-only peer"
                                        />
                                        <div className={`relative h-4 w-7 rounded-full bg-gray-200 transition-all peer-checked:bg-green-500 ${addonBusy ? 'opacity-50' : ''}`}>
                                          <div className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${addonInStock ? 'translate-x-3' : ''}`} />
                                        </div>
                                      </label>
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
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-violet-700">Linked add-on groups</p>
                        <div className="space-y-2">
                          {linkedGroups.map((group, idx) => (
                            <div key={group.id || idx} className="rounded-lg border border-violet-100 bg-violet-50/30 p-2.5">
                              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900">{group.title}</p>
                                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200">
                                  {group.max_selection === 1 ? 'Single' : 'Multiple'}
                                </span>
                              </div>
                              <ul className="space-y-1">
                                {(group.options ?? []).map((opt, j) => {
                                  const optInStock = opt.in_stock !== false;
                                  const optBusy = custStockBusy === `modifier_option-${opt.id}`;
                                  return (
                                    <li
                                      key={opt.option_id || j}
                                      className="flex items-center justify-between gap-2 rounded border border-white bg-white px-2 py-1 text-sm"
                                    >
                                      <span className="min-w-0 flex-1 text-gray-700">{opt.name}</span>
                                      <span className="font-medium tabular-nums text-gray-900 shrink-0">₹{opt.price_delta ?? 0}</span>
                                      {opt.id ? (
                                        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                                          <input
                                            type="checkbox"
                                            checked={optInStock}
                                            disabled={optBusy}
                                            onChange={() => handleCustOptionStockToggle(item, 'modifier_option', opt.id!, !optInStock)}
                                            className="sr-only peer"
                                          />
                                          <div className={`relative h-4 w-7 rounded-full bg-gray-200 transition-all peer-checked:bg-green-500 ${optBusy ? 'opacity-50' : ''}`}>
                                            <div className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${optInStock ? 'translate-x-3' : ''}`} />
                                          </div>
                                        </label>
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
                    {variants.length === 0 && custGroups.length === 0 && linkedGroups.length === 0 ? (
                      <p className="text-xs text-gray-500">Customization flags set — open item to view full details.</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'card' ? (
          <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {searchedItems.map((item) => {
              const category = categories.find(cat => cat.id === item.category_id);
              const discount = Number(item.discount_percentage);
              const hasDiscount = discount > 0;
              
              const isLockedByPlan = isMenuItemLockedByPlan(item);
              return (
                <div
                  key={item.item_id}
                  className={`relative rounded-xl border shadow-sm transition-all overflow-hidden ${
                    isLockedByPlan
                      ? 'border-red-200/90 bg-gray-50 ring-1 ring-red-100'
                      : 'bg-white border-gray-200 hover:shadow-md'
                  }`}
                >
                  {isLockedByPlan ? (
                    <>
                      <div
                        className="pointer-events-none absolute inset-0 z-[1] bg-gray-200/40"
                        aria-hidden
                      />
                      <span className="absolute left-2 top-2 z-[2] inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
                        <Lock size={11} strokeWidth={2.5} aria-hidden />
                        Locked
                      </span>
                    </>
                  ) : null}
                  <div
                    className={`relative z-0 flex p-2.5 h-full gap-2.5 ${
                      isLockedByPlan ? 'opacity-60 saturate-[0.35] grayscale' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenItemPhoto(item)}
                      disabled={isLockedByPlan || !!photoUploadByItemId[item.id]}
                      className={`relative w-14 h-14 flex-shrink-0 rounded-lg border overflow-hidden ${
                        isLockedByPlan
                          ? 'border-gray-300 bg-gray-200 cursor-not-allowed'
                          : 'border-gray-200 bg-gray-100 cursor-pointer hover:ring-2 hover:ring-orange-300'
                      }`}
                      aria-label="Item photo"
                    >
                      {photoUploadByItemId[item.id] ? (
                        <>
                          <img
                            src={photoUploadByItemId[item.id].previewUri}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-end bg-black/30">
                            <div
                              className="h-1 bg-orange-500 transition-all"
                              style={{ width: `${Math.round(photoUploadByItemId[item.id].progress * 100)}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <R2Image
                          src={item.item_image_url}
                          alt={item.item_name}
                          className={`w-full h-full object-cover ${isLockedByPlan ? 'grayscale' : ''}`}
                          fallbackSrc={ITEM_PLACEHOLDER_SVG}
                        />
                      )}
                      {!isLockedByPlan && itemPhotoInReview(item) ? (
                        <span className="absolute bottom-0 left-0 right-0 bg-amber-500/90 px-0.5 py-px text-center text-[8px] font-bold text-white">
                          Review
                        </span>
                      ) : null}
                      {!isLockedByPlan && itemPhotoRejected(item) ? (
                        <span className="absolute bottom-0 left-0 right-0 bg-red-600/90 px-0.5 py-px text-center text-[8px] font-bold text-white">
                          Rejected
                        </span>
                      ) : null}
                    </button>
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-gray-900 truncate flex items-center gap-1.5 pr-14">
                            {item.item_name}
                          </div>
                          {isLockedByPlan ? (
                            <p className="mt-0.5 text-[10px] font-semibold text-red-600 leading-snug">
                              {menuItemLockHint(item)}
                            </p>
                          ) : null}
                          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
                            {category?.category_name || 'Uncategorized'}
                          </div>
                          {getItemOosLabel(item) ? (
                            <div className="text-[11px] font-semibold text-red-600 mt-0.5">
                              {getItemOosLabel(item)}
                            </div>
                          ) : (
                            <div className="text-[11px] font-semibold text-green-600 mt-0.5">
                              In stock
                            </div>
                          )}
                        </div>
                        <label className={`inline-flex items-center flex-shrink-0 ${isLockedByPlan ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={effectiveInStock(item)}
                            disabled={isLockedByPlan}
                            onChange={() => {
                              if (isLockedByPlan) {
                                toast.error('This item is locked. Upgrade your plan to unlock and manage it.');
                                return;
                              }
                              const next = !effectiveInStock(item);
                              if (!next) {
                                setOosChoice('HOURS');
                                setOosHours(5);
                                const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
                                setOosDate(d.toISOString().slice(0, 10));
                                setOosTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                                setOosModal({ kind: 'item', item_id: item.item_id, item_name: item.item_name });
                                return;
                              }
                              requestRestoreConfirm(() => clearOutOfStockForItem(item));
                            }}
                            className="sr-only peer"
                          />
                          <div className={`w-7 h-4 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative ${isLockedByPlan ? '!bg-gray-300' : ''}`}>
                            <div className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${effectiveInStock(item) ? 'translate-x-3' : ''}`}></div>
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

                      {/* Indicators for item properties */}
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {/* Pending approval badge — item not visible to customers yet */}
                        {String(item.approval_status ?? '').toUpperCase() === 'PENDING' && (
                          <span className="px-1.5 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-semibold rounded border border-yellow-200 flex items-center gap-0.5">
                            ⏳ Pending Approval
                          </span>
                        )}
                        {String(item.approval_status ?? '').toUpperCase() === 'REJECTED' && (
                          <span className="px-1.5 py-0.5 bg-red-50 text-red-700 text-[10px] font-semibold rounded border border-red-200 flex items-center gap-0.5">
                            ✗ Rejected
                          </span>
                        )}
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

                      {/* Action buttons - constrained so they never overflow */}
                      <div className="flex items-center gap-1.5 mt-auto min-w-0">
                        {(Array.isArray(item.customizations) && item.customizations.length > 0) || (Array.isArray(item.variants) && item.variants.length > 0) ? (
                          <button
                            onClick={e => { e.stopPropagation(); setViewCustModal({ open: true, item }); setViewCustModalTab('customizations'); }}
                            className="flex-shrink-0 flex items-center justify-center gap-0.5 px-1.5 py-1 bg-gray-100 text-gray-700 font-semibold rounded-md border border-gray-200 hover:bg-orange-50 transition-all text-[10px] whitespace-nowrap"
                            type="button"
                          >
                            Options
                          </button>
                        ) : null}
                        <button
                          onClick={() => {
                            if (isLockedByPlan) {
                              toast.error('This item is locked. Upgrade your plan to unlock and edit it.');
                              return;
                            }
                            handleOpenEditModal(item);
                          }}
                          disabled={isLockedByPlan}
                          className={`min-w-0 flex-1 flex items-center justify-center gap-0.5 px-1 py-1 font-bold rounded-md border transition-all text-[10px] ${
                            isLockedByPlan
                              ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                              : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          <Edit2 size={10} />
                          <span className="truncate">Edit item</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

            {searchedCombos.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-gray-800">Combos</h4>
                  <span className="text-xs text-gray-500">{searchedCombos.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {searchedCombos.map((c) => (
                    <div key={`combo-${c.id}`} className="rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden">
                      <div className="flex p-2.5 h-full gap-2.5">
                        {(() => {
                          const details = comboDetailsById[c.id];
                          const componentIds: number[] = Array.isArray(details?.components)
                            ? (details!.components as any[]).map((x) => Number((x as any)?.menu_item_id)).filter((n) => Number.isFinite(n))
                            : [];
                          const imgs = componentIds
                            .map((id) => menuItems.find((m) => Number(m.item_id) === id)?.item_image_url)
                            .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
                            .slice(0, 2);

                          const renderImg = (src: string | null | undefined, key: string) => (
                            <div key={key} className="w-7 h-14 rounded-lg border border-gray-200 bg-gray-100 overflow-hidden">
                              <R2Image
                                src={src}
                                alt={c.combo_name}
                                className="w-full h-full object-cover"
                                fallbackSrc={ITEM_PLACEHOLDER_SVG}
                              />
                            </div>
                          );

                          if (imgs.length >= 2) {
                            return (
                              <div className="flex gap-1 flex-shrink-0">
                                {renderImg(imgs[0], 'i1')}
                                {renderImg(imgs[1], 'i2')}
                              </div>
                            );
                          }
                          if (imgs.length === 1) {
                            return (
                              <div className="flex gap-1 flex-shrink-0">
                                {renderImg(imgs[0], 'i1')}
                                {renderImg(c.image_url, 'i2')}
                              </div>
                            );
                          }
                          return (
                            <div className="w-14 h-14 flex-shrink-0 rounded-lg border border-gray-200 bg-gray-100 overflow-hidden">
                              <R2Image
                                src={c.image_url}
                                alt={c.combo_name}
                                className="w-full h-full object-cover"
                                fallbackSrc={ITEM_PLACEHOLDER_SVG}
                              />
                            </div>
                          );
                        })()}
                        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                          <div className="font-bold text-sm text-gray-900 truncate">{c.combo_name}</div>
                          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Combo</div>
                          {getComboOosLabel(c) ? (
                            <div className="text-[11px] font-semibold text-red-600 mt-0.5">
                              {getComboOosLabel(c)}
                            </div>
                          ) : null}
                          {c.description ? (
                            <p className="text-[11px] text-gray-600 line-clamp-2 mt-1 flex-grow leading-tight">
                              {c.description}
                            </p>
                          ) : (
                            <div className="flex-grow" />
                          )}
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="text-sm font-extrabold text-orange-600">₹{Number(c.combo_price ?? 0)}</div>
                            <label className="inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={effectiveComboInStock(c)}
                                onChange={() => {
                                  const next = !effectiveComboInStock(c);
                                  if (!next) {
                                    setOosChoice('HOURS');
                                    setOosHours(5);
                                    const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
                                    setOosDate(d.toISOString().slice(0, 10));
                                    setOosTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                                    setOosModal({ kind: 'combo', comboId: c.id, comboName: c.combo_name });
                                    return;
                                  }
                                  requestRestoreConfirm(() => clearOutOfStockForCombo(c.id));
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                                <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveComboInStock(c) ? 'translate-x-5' : ''}`}></div>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {treeGroups.map((group) => {
              const allInStock = group.items.length > 0 && group.items.every((i) => effectiveInStock(i));
              const isOpen = !!openTreeGroups[group.key];
              const categoryIdNum = /^\d+$/.test(String(group.key)) ? Number(group.key) : NaN;

              return (
                <div key={group.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-3 py-2.5 flex items-center justify-between gap-3 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => setOpenTreeGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                      className="min-w-0 flex items-center gap-2 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                      <span className="min-w-0">
                        <span className="font-semibold text-gray-900 truncate block">
                          {group.categoryName} <span className="text-gray-400 font-medium">({group.items.length})</span>
                        </span>
                      </span>
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-700">In stock</span>
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allInStock}
                          onChange={async () => {
                            const target = !allInStock;
                            if (Number.isFinite(categoryIdNum) && categoryIdNum > 0) {
                              if (!target) {
                                setOosChoice('HOURS');
                                setOosHours(5);
                                const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
                                setOosDate(d.toISOString().slice(0, 10));
                                setOosTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                                const catName = group.categoryName ?? 'Category';
                                setOosModal({ kind: 'category', categoryId: categoryIdNum, categoryName: catName });
                                return;
                              }
                              requestRestoreConfirm(() => clearOutOfStockForCategory(categoryIdNum));
                              return;
                            }
                            // Uncategorized fallback: legacy per-item base stock.
                            const itemsToUpdate = group.items.filter((i) => (i.in_stock !== target) && !(i as any).is_locked_by_plan);
                            if (itemsToUpdate.length === 0) return;
                            try {
                              await Promise.all(itemsToUpdate.map(async (i) => {
                                const res = await fetch('/api/merchant/menu-items', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ item_id: i.item_id, storeId, in_stock: target }),
                                });
                                if (!res.ok) throw new Error('Failed to update stock');
                              }));
                              setMenuItems((prev) =>
                                prev.map((p) => (itemsToUpdate.some((x) => x.item_id === p.item_id) ? { ...p, in_stock: target } : p))
                              );
                              toast.success(`Updated ${itemsToUpdate.length} item(s).`);
                            } catch {
                              toast.error('Failed to update some items.');
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                          <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${allInStock ? 'translate-x-5' : ''}`}></div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="divide-y divide-gray-100">
                      {group.items.map((item) => {
                        const isLockedByPlan = isMenuItemLockedByPlan(item);
                        return (
                          <div
                            key={item.item_id}
                            className={`px-3 py-2 flex items-center justify-between gap-3 ${
                              isLockedByPlan ? 'bg-gray-50/90' : ''
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`text-sm font-semibold truncate ${
                                    isLockedByPlan ? 'text-gray-500' : 'text-gray-900'
                                  }`}
                                >
                                  {item.item_name}
                                </div>
                                {isLockedByPlan ? (
                                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-700">
                                    <Lock size={9} aria-hidden />
                                    {menuItemLockBadgeLabel(item)}
                                  </span>
                                ) : null}
                              </div>
                              {getItemOosLabel(item) ? (
                                <div className="text-xs font-semibold text-red-600 mt-0.5">
                                  {getItemOosLabel(item)}
                                </div>
                              ) : (
                                <div className="text-xs font-semibold text-green-600 mt-0.5">In stock</div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-sm font-bold text-gray-900">₹{item.selling_price}</div>
                              <label className={`inline-flex items-center ${isLockedByPlan ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                <input
                                  type="checkbox"
                                  checked={effectiveInStock(item)}
                                  disabled={isLockedByPlan}
                                  onChange={() => {
                                    if (isLockedByPlan) {
                                      toast.error('This item is locked. Upgrade your plan to unlock and manage it.');
                                      return;
                                    }
                                    const next = !effectiveInStock(item);
                                    if (!next) {
                                      setOosChoice('HOURS');
                                      setOosHours(5);
                                      const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
                                      setOosDate(d.toISOString().slice(0, 10));
                                      setOosTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                                      setOosModal({ kind: 'item', item_id: item.item_id, item_name: item.item_name });
                                      return;
                                    }
                                    requestRestoreConfirm(() => clearOutOfStockForItem(item));
                                  }}
                                  className="sr-only peer"
                                />
                                <div className={`w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative ${isLockedByPlan ? '!bg-gray-300' : ''}`}>
                                  <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveInStock(item) ? 'translate-x-5' : ''}`}></div>
                                </div>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {searchedCombos.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {(() => {
                  const key = 'combos';
                  const isOpen = !!openTreeGroups[key];
                  const allActive = searchedCombos.length > 0 && searchedCombos.every((c) => effectiveComboInStock(c));
                  return (
                    <>
                      <div className="px-3 py-2.5 flex items-center justify-between gap-3 bg-gray-50">
                        <button
                          type="button"
                          onClick={() => setOpenTreeGroups((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className="min-w-0 flex items-center gap-2 text-left"
                          aria-expanded={isOpen}
                        >
                          <span className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
                            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </span>
                          <span className="min-w-0">
                            <span className="font-semibold text-gray-900 truncate block">
                              Combos <span className="text-gray-400 font-medium">({searchedCombos.length})</span>
                            </span>
                          </span>
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">In stock</span>
                          <label className="inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allActive}
                              onChange={async () => {
                                const next = !allActive;
                                if (!next) {
                                  setOosChoice('MANUAL');
                                  setOosModal({ kind: 'combo', comboId: searchedCombos[0]!.id, comboName: 'Combos' });
                                  return;
                                }
                                requestRestoreConfirm(async () => {
                                  await Promise.all(searchedCombos.map((c) => clearOutOfStockForCombo(c.id)));
                                });
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                              <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${allActive ? 'translate-x-5' : ''}`}></div>
                            </div>
                          </label>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="divide-y divide-gray-100">
                          {searchedCombos.map((c) => (
                            <div key={`combo-tree-${c.id}`} className="px-3 py-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{c.combo_name}</div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-sm font-bold text-gray-900">₹{Number(c.combo_price ?? 0)}</div>
                                <label className="inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={effectiveComboInStock(c)}
                                    onChange={() => {
                                      const next = !effectiveComboInStock(c);
                                      if (!next) {
                                        setOosChoice('HOURS');
                                        setOosHours(5);
                                        const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
                                        setOosDate(d.toISOString().slice(0, 10));
                                        setOosTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                                        setOosModal({ kind: 'combo', comboId: c.id, comboName: c.combo_name });
                                        return;
                                      }
                                      requestRestoreConfirm(() => clearOutOfStockForCombo(c.id));
                                    }}
                                    className="sr-only peer"
                                  />
                                  <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                                    <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveComboInStock(c) ? 'translate-x-5' : ''}`}></div>
                                  </div>
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>
      </div>

      {/* Modals - portaled to body so overlay covers sidebar and blurs */}
      {/* Add Item Modal */}
      {showAddModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
          onClick={() => {
            setAddItemSaved(null);
            setShowAddModal(false);
            setAddImageValidationError('');
            setAddImageValidating(false);
            addImagePendingFileRef.current = null;
            setAddForm({
              item_name: '', item_description: '', item_image_url: '', image: null,
              food_type: '', spice_level: '', cuisine_type: '', base_price: '', selling_price: '',
              discount_percentage: '0', tax_percentage: '0', in_stock: true, available_quantity: '',
              low_stock_threshold: '', has_customizations: false, has_addons: false, has_variants: false,
              is_popular: false, is_recommended: false, preparation_time_minutes: 15,
              packaging_enabled: false, packaging_charges: '', serves: 1,
              is_active: true, allergens: '',
              available_for_delivery: true, weight_per_serving: '', weight_per_serving_unit: 'grams',
              calories_kcal: '', protein: '', protein_unit: 'mg', carbohydrates: '', carbohydrates_unit: 'mg',
              fat: '', fat_unit: 'mg', fibre: '', fibre_unit: 'mg', item_tags: '',
              category_id: null, customizations: [], variants: [],
            });
            setImagePreview('');
          }}
        >
          <div onClick={e => e.stopPropagation()}>
            <ItemForm
              isEdit={false}
              formData={addForm}
              setFormData={setAddForm}
              imagePreview={imagePreview}
              setImagePreview={setImagePreview}
              onProcessImage={(file) => processImageFile(file, false)}
              onSaveAndNext={handleAddSaveAndNext}
              onSubmitOptions={addItemSaved != null ? handleAddSubmitOptions : undefined}
              currentItemId={addItemSaved != null ? String(addItemSaved.id) : undefined}
              imageUploadAllowed={imageUploadAllowed}
              imageLimitReached={imageLimitReached}
              imageUsed={imageUsed}
              imageLimit={imageLimit}
              imageSlotsLeft={imageSlotsLeft}
              maxCuisinesPerItem={planLimits?.maxCuisinesPerItem ?? null}
              imageValidationError={addImageValidationError}
              imageValidating={addImageValidating}
              onNormalizeMenuItemImage={() => handleNormalizeMenuItemImage(false)}
              cuisineOptions={cuisineOptions}
              onCancel={() => {
                setAddItemSaved(null);
                setShowAddModal(false);
                setAddImageValidationError('');
                setAddImageValidating(false);
                addImagePendingFileRef.current = null;
                setAddForm({
                  item_name: '',
                  item_description: '',
                  item_image_url: '',
                  image: null,
                  food_type: '',
                  spice_level: '',
                  cuisine_type: '',
                  base_price: '',
                  selling_price: '',
                  discount_percentage: '0',
                  tax_percentage: '0',
                  in_stock: true,
                  available_quantity: '',
                  low_stock_threshold: '',
                  has_customizations: false,
                  has_addons: false,
                  has_variants: false,
                  is_popular: false,
                  is_recommended: false,
                  preparation_time_minutes: 15,
                  packaging_enabled: false,
                  packaging_charges: '',
                  serves: 1,
                  is_active: true,
                  allergens: '',
                  available_for_delivery: true,
                  weight_per_serving: '',
                  weight_per_serving_unit: 'grams',
                  calories_kcal: '',
                  protein: '',
                  protein_unit: 'mg',
                  carbohydrates: '',
                  carbohydrates_unit: 'mg',
                  fat: '',
                  fat_unit: 'mg',
                  fibre: '',
                  fibre_unit: 'mg',
                  item_tags: '',
                  category_id: null,
                  customizations: [],
                  variants: [],
                });
                setImagePreview('');
              }}
              isSaving={isSaving}
              error={addError}
              title="Add New Menu Item"
              categories={categories}
              storeDefaults={itemFormStoreDefaults}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Edit Item Modal */}
      {showEditModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md" onClick={() => setShowEditModal(false)}>
          <div onClick={e => e.stopPropagation()} className="max-h-[92vh] overflow-hidden">
            {(() => {
              const editingItem = menuItems.find((m) => m.item_id === editingId);
              const isEditingLocked = !!(editingItem as any)?.is_locked_by_plan;
              if (!isEditingLocked) return null;
              return (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-amber-900">
                    This item is locked. Upgrade your plan to edit it.
                  </p>
                  <a href="/mx/store-settings?tab=plans" className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700">
                    Upgrade
                  </a>
                </div>
              );
            })()}
            <ItemForm
              isEdit={true}
              readOnly={!!(menuItems.find((m) => m.item_id === editingId) as MenuItem | undefined)?.is_locked_by_plan}
              formData={editForm}
              setFormData={setEditForm}
              imagePreview={editImagePreview}
              setImagePreview={setEditImagePreview}
              onProcessImage={(file) => processImageFile(file, true)}
              onSaveAndNext={handleEditSaveAndNext}
              onSubmitOptions={handleEditSubmitOptions}
              onNormalizeMenuItemImage={() => handleNormalizeMenuItemImage(true)}
              imageUploadAllowed={imageUploadAllowed}
              imageLimitReached={imageLimitReached}
              imageUsed={imageUsed}
              imageLimit={imageLimit}
              imageSlotsLeft={imageSlotsLeft}
              maxCuisinesPerItem={planLimits?.maxCuisinesPerItem ?? null}
              imageValidationError={editImageValidationError}
              imageValidating={editImageValidating}
              cuisineOptions={cuisineOptions}
              onCancel={() => {
                setShowEditModal(false);
                setEditImageValidationError('');
                setEditImageValidating(false);
                setEditForm({
                  item_name: '',
                  item_description: '',
                  item_image_url: '',
                  image: null,
                  food_type: '',
                  spice_level: '',
                  cuisine_type: '',
                  base_price: '',
                  selling_price: '',
                  discount_percentage: '0',
                  tax_percentage: '0',
                  in_stock: true,
                  available_quantity: '',
                  low_stock_threshold: '',
                  has_customizations: false,
                  has_addons: false,
                  has_variants: false,
                  is_popular: false,
                  is_recommended: false,
                  preparation_time_minutes: 15,
                  packaging_enabled: false,
                  packaging_charges: '',
                  serves: 1,
                  is_active: true,
                  allergens: '',
                  available_for_delivery: true,
                  weight_per_serving: '',
                  weight_per_serving_unit: 'grams',
                  calories_kcal: '',
                  protein: '',
                  protein_unit: 'mg',
                  carbohydrates: '',
                  carbohydrates_unit: 'mg',
                  fat: '',
                  fat_unit: 'mg',
                  fibre: '',
                  fibre_unit: 'mg',
                  item_tags: '',
                  category_id: null,
                  customizations: [],
                  variants: [],
                });
                setEditImagePreview('');
              }}
              isSaving={isSavingEdit}
              error={editError}
              title="Edit Menu Item"
              categories={categories}
              currentItemId={editingId || ''}
              storeDefaults={itemFormStoreDefaults}
            />
          </div>
        </div>,
        document.body
      )}

      <CatalogItemPhotoModal
        open={itemPhotoModal != null}
        item={itemPhotoModal}
        storeId={storeId}
        imageLimitReached={imageLimitReached}
        onClose={() => setItemPhotoModal(null)}
        onUpdated={() => {
          void refetchMenuItems();
          void refetchImageCount();
        }}
        onRequestUploadOptions={() => {
          const current = itemPhotoModal;
          if (!current) return;
          if (imageLimitReached) {
            toast.error(
              imageLimit != null
                ? `Image limit reached (${imageLimit}/${imageLimit}). Upgrade your plan to add more.`
                : 'Image upload limit reached for your plan.',
            );
            return;
          }
          setItemPhotoModal(null);
          setItemUploadModal(current);
        }}
      />

      <CatalogPhotoUploadOptionsModal
        open={itemUploadModal != null}
        item={itemUploadModal}
        storeId={storeId}
        imageLimitReached={imageLimitReached}
        onClose={() => setItemUploadModal(null)}
        onUploaded={() => {
          void refetchMenuItems();
          void refetchImageCount();
        }}
        uploadCallbacks={catalogPhotoUploadCallbacks}
      />

      {showMenuFileSection && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9998] flex justify-end bg-black/40 backdrop-blur-sm"
          onClick={() => setShowMenuFileSection(false)}
        >
          <aside
            className="relative flex h-dvh w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mx-menu-file-sheet-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-br from-amber-50/80 to-orange-50/50 px-4 py-4">
              <div className="min-w-0">
                <h2 id="mx-menu-file-sheet-title" className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 text-amber-700">
                    <FileText size={20} />
                  </span>
                  Menu Files
                </h2>
                <p className="text-sm text-gray-600 mt-1.5">
                  Upload up to {MAX_MENU_IMAGES} images, or 1 PDF, or 1 CSV. Our team will add items from it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMenuFileSection(false)}
                aria-label="Close menu files"
                className="flex-shrink-0 rounded-lg p-2 text-gray-500 hover:bg-white hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
<div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 space-y-4">
            {/* Existing uploaded files with remove buttons */}
            {hasAnyUploadedMenuFiles && (
              <div className="rounded-xl bg-white/80 border border-amber-100 overflow-hidden">
                <div className="px-3 pt-3 pb-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Uploaded Files</p>
                </div>
                <ul className="list-none m-0 p-0 flex flex-col gap-0 divide-y divide-gray-100">
                  {menuFiles.map((file) => {
                    const fullUrl = file.url.startsWith('http') ? file.url : (typeof window !== 'undefined' ? window.location.origin : '') + file.url;
                    const rowKey = menuFileKey(file);
                    const isDeleting = menuDeleting === rowKey;
                    return (
                      <li key={rowKey} className="flex items-center gap-3 px-3 py-2.5">
                        {file.type === 'image' ? (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                            <img src={fullUrl} alt={file.fileName} className="w-full h-full object-cover" loading="lazy" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
                            <span className="text-xs font-bold text-gray-500 uppercase">{file.type}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{file.fileName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">View</a>
                            {file.verificationStatus === 'VERIFIED' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Verified</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">Pending</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleMenuFileDelete(file)}
                          className="text-xs text-rose-600 hover:text-rose-700 font-medium shrink-0 px-2 py-1.5 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <span className="inline-block w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Pending files (selected but not yet uploaded) */}
            {menuPendingFiles.length > 0 && (
              <div className="rounded-xl bg-white/80 border border-blue-100 overflow-hidden">
                <div className="px-3 pt-3 pb-2">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Ready to Upload</p>
                </div>
                <ul className="list-none m-0 p-0 flex flex-col gap-0 divide-y divide-gray-100">
                  {menuPendingFiles.map((file, idx) => (
                    <li key={`pending-${idx}`} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center">
                        {file.type.startsWith('image/') ? (
                          <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-gray-500 uppercase">{file.name.split('.').pop()}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMenuPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-rose-600 hover:text-rose-700 font-medium shrink-0 px-2 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Upload controls */}
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Upload New File</p>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {(['image', 'pdf', 'csv'] as const).map((mode) => {
                  const label = mode === 'image' ? `Images (max ${MAX_MENU_IMAGES})` : mode === 'pdf' ? 'PDF' : 'CSV';
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setMenuUploadMode(mode); setMenuPendingFiles([]); setCsvValidationError(''); setMenuReplaceError(''); }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${menuUploadMode === mode ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {menuUploadMode === 'image' && (
                <div className="space-y-3">
                  <input
                    ref={menuImageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      const remaining = MAX_MENU_IMAGES - menuImages.length - menuPendingFiles.length;
                      if (remaining <= 0) {
                        setMenuReplaceError(`Maximum ${MAX_MENU_IMAGES} images allowed. Remove existing images first.`);
                        return;
                      }
                      const toAdd = selected.slice(0, remaining);
                      if (toAdd.length < selected.length) {
                        setMenuReplaceError(`Only ${remaining} more image(s) can be added. ${selected.length - toAdd.length} file(s) skipped.`);
                      } else {
                        setMenuReplaceError('');
                      }
                      setMenuPendingFiles(prev => [...prev, ...toAdd]);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => menuImageInputRef.current?.click()}
                      disabled={menuImages.length + menuPendingFiles.length >= MAX_MENU_IMAGES}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload size={18} />
                      Choose images
                    </button>
                    <span className="text-xs text-gray-500">
                      {menuImages.length + menuPendingFiles.length} of {MAX_MENU_IMAGES} · JPG, PNG, WEBP · 5 MB each
                    </span>
                  </div>
                  {menuPendingFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleMenuFileUpload}
                      disabled={menuUploading}
                      className="px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-colors"
                    >
                      {menuUploading ? (
                        <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading…</>
                      ) : (
                        <>Upload {menuPendingFiles.length} image{menuPendingFiles.length > 1 ? 's' : ''}</>
                      )}
                    </button>
                  )}
                </div>
              )}

              {(menuUploadMode === 'pdf' || menuUploadMode === 'csv') && (
                <div className="space-y-3">
                  <input
                    ref={menuFileInputRef}
                    type="file"
                    accept={menuUploadMode === 'pdf' ? '.pdf,application/pdf' : '.csv,text/csv,application/csv'}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setMenuPendingFiles([f]);
                      setCsvValidationError('');
                      setMenuReplaceError('');
                      e.target.value = '';
                    }}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => menuFileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <Upload size={18} />
                      {menuPendingFiles.length > 0 ? menuPendingFiles[0].name : `Choose ${menuUploadMode.toUpperCase()} file`}
                    </button>
                    <span className="text-xs text-gray-500">
                      {menuUploadMode === 'pdf' ? '1 PDF · max 5 MB' : 'CSV with item_name + price columns'}
                    </span>
                  </div>
                  {menuPendingFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleMenuFileUpload}
                      disabled={menuUploading}
                      className="px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-colors"
                    >
                      {menuUploading ? (
                        <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading…</>
                      ) : (
                        <>{(menuUploadMode === 'pdf' ? menuPdfs : menuCsvs).length > 0 ? 'Replace' : 'Upload'} {menuUploadMode.toUpperCase()} file</>
                      )}
                    </button>
                  )}
                </div>
              )}

              {(csvValidationError || menuReplaceError) && (
                <p className="text-sm text-red-600 mt-2" role="alert">{csvValidationError || menuReplaceError}</p>
              )}
            </div>
          </div>
            </div>
          </aside>
        </div>,
        document.body
      )}

      {/* View Customizations & Variants Modal */}
      {viewCustModal.open && viewCustModal.item && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md" onClick={() => setViewCustModal({ open: false, item: null })}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-2 p-0 border border-gray-100 relative animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-base md:text-lg font-bold text-gray-900 truncate">Options</h2>
                {/* Toggle: Customizations | Variants */}
                <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewCustModalTab('customizations')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${viewCustModalTab === 'customizations' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Addons
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewCustModalTab('variants')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${viewCustModalTab === 'variants' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Variants
                  </button>
                </div>
              </div>
              <button
                onClick={() => setViewCustModal({ open: false, item: null })}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                tabIndex={0}
                aria-label="Close"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {viewCustModalTab === 'customizations' ? (
                Array.isArray(viewCustModal.item.customizations) && viewCustModal.item.customizations.length > 0 ? (
                  <div className="space-y-4">
                    {viewCustModal.item.customizations.map((group: any, idx: number) => (
                      <div key={idx} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-gray-800 text-sm">{group.customization_title || group.title}</div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            {group.is_required && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">Required</span>
                            )}
                            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">
                              {group.customization_type || 'Checkbox'}
                            </span>
                            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">
                              Select: {group.min_selection || 0}-{group.max_selection || 1}
                            </span>
                          </div>
                        </div>
                        <ul className="space-y-1">
                          {group.addons && group.addons.map((addon: any, i: number) => (
                            <li key={i} className="flex items-center justify-between py-1 px-2 bg-white rounded border">
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
              ) : (
                Array.isArray(viewCustModal.item.variants) && viewCustModal.item.variants.length > 0 ? (
                  <div className="space-y-3">
                    {/* Group by variant_type if present */}
                    {(() => {
                      const variants = viewCustModal.item.variants!;
                      const byType = variants.reduce((acc: Record<string, typeof variants>, v: any) => {
                        const type = v.variant_type || 'Variants';
                        if (!acc[type]) acc[type] = [];
                        acc[type].push(v);
                        return acc;
                      }, {});
                      return Object.entries(byType).map(([type, list]) => (
                        <div key={type} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                          <div className="font-semibold text-gray-800 text-sm mb-2">{type}</div>
                          <ul className="space-y-1">
                            {(list as any[]).map((v: any, i: number) => (
                              <li key={v.variant_id || i} className="flex items-center justify-between py-1 px-2 bg-white rounded border">
                                <span className="text-sm text-gray-700">{v.variant_name}</span>
                                <span className="text-sm font-medium text-gray-900">₹{typeof v.variant_price === 'number' ? v.variant_price : 0}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className="text-gray-500 text-sm">No variants available.</div>
                )
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/40 backdrop-blur-md">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Menu Item</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete this item? This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-all"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteItem}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 transition-all"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Out-of-stock Right Sheet (Item + Category) */}
      {oosModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-default"
            aria-label="Close"
            onClick={() => (!oosBusy ? setOosModal(null) : null)}
            disabled={oosBusy}
          />
          <aside
            className={`absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-gray-200 transition-transform duration-250 ease-out ${
              oosSheetShown ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="h-full flex flex-col">
              <div className="p-5 border-b border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-gray-900">
                      {oosModal.kind === 'category' ? 'Mark Category out of stock' : oosModal.kind === 'combo' ? 'Mark combo out of stock' : 'Mark item out of stock'}
                    </h3>
                    <p className="text-sm text-gray-600 truncate">
                      {oosModal.kind === 'category' ? oosModal.categoryName : oosModal.kind === 'combo' ? oosModal.comboName : oosModal.item_name}
                    </p>
                    {oosModal.kind === 'category' ? (
                      <p className="text-xs text-gray-600 mt-2 leading-5">
                        If you mark this category as out of stock, all items under this category will automatically be marked as out of stock.
                        When the category is marked back in stock, all items will be restored automatically.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => (!oosBusy ? setOosModal(null) : null)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                    aria-label="Close"
                    disabled={oosBusy}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* HOURS */}
                  <div className="px-4 py-3 bg-white hover:bg-gray-50">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="oos"
                          checked={oosChoice === 'HOURS'}
                          onChange={() => setOosChoice('HOURS')}
                          disabled={oosBusy}
                        />
                        <span className="text-sm font-semibold text-gray-900">For specific time</span>
                      </span>
                      <span className={`flex items-center gap-2 ${oosChoice !== 'HOURS' ? 'opacity-50' : ''}`}>
                        <button
                          type="button"
                          onClick={() => setOosHours((h) => Math.max(1, h - 1))}
                          className="h-7 w-7 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
                          disabled={oosBusy || oosChoice !== 'HOURS'}
                        >
                          −
                        </button>
                        <span className="text-sm font-bold text-gray-900">{oosHours} hour</span>
                        <button
                          type="button"
                          onClick={() => setOosHours((h) => Math.min(24 * 14, h + 1))}
                          className="h-7 w-7 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
                          disabled={oosBusy || oosChoice !== 'HOURS'}
                        >
                          +
                        </button>
                      </span>
                    </label>
                  </div>

                  <div className="h-px bg-gray-200" />

                  {/* NEXT OPEN */}
                  <label className="block px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="oos"
                        checked={oosChoice === 'NEXT_OPEN'}
                        onChange={() => setOosChoice('NEXT_OPEN')}
                        disabled={oosBusy}
                      />
                      <span className="text-sm font-semibold text-gray-900">Next business day · Opening time</span>
                    </span>
                  </label>

                  <div className="h-px bg-gray-200" />

                  {/* CUSTOM */}
                  <label className="block px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="oos"
                        checked={oosChoice === 'CUSTOM'}
                        onChange={() => setOosChoice('CUSTOM')}
                        disabled={oosBusy}
                      />
                      <span className="text-sm font-semibold text-gray-900">Custom date &amp; time</span>
                    </span>
                  </label>
                  {/* ALWAYS expanded custom date & time */}
                  <div className={`px-4 pb-3 bg-white ${oosChoice !== 'CUSTOM' ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                        <input
                          type="date"
                          value={oosDate}
                          onMouseDown={() => { setOosCustomTouched(true); setOosChoice('CUSTOM'); }}
                          onFocus={() => { setOosCustomTouched(true); setOosChoice('CUSTOM'); }}
                          onInput={(e) => { setOosCustomTouched(true); setOosChoice('CUSTOM'); setOosDate((e.target as HTMLInputElement).value); }}
                          onChange={(e) => { setOosCustomTouched(true); setOosChoice('CUSTOM'); setOosDate(e.target.value); }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          disabled={oosBusy}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Time</label>
                        <input
                          type="time"
                          value={oosTime}
                          onMouseDown={() => { setOosCustomTouched(true); setOosChoice('CUSTOM'); }}
                          onFocus={() => { setOosCustomTouched(true); setOosChoice('CUSTOM'); }}
                          onInput={(e) => { setOosCustomTouched(true); setOosChoice('CUSTOM'); setOosTime((e.target as HTMLInputElement).value); }}
                          onChange={(e) => { setOosCustomTouched(true); setOosChoice('CUSTOM'); setOosTime(e.target.value); }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          disabled={oosBusy}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-gray-200" />

                  {/* MANUAL */}
                  <label className="block px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer">
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="oos"
                        checked={oosChoice === 'MANUAL'}
                        onChange={() => setOosChoice('MANUAL')}
                        disabled={oosBusy}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="text-sm font-semibold text-gray-900 block">I will turn it on manually</span>
                        <span className="text-xs text-gray-500 block mt-0.5">
                          Item won&apos;t be visible to customers until you mark it back in stock
                        </span>
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="p-5 border-t border-gray-200 flex gap-3">
                <button
                  type="button"
                  onClick={() => (!oosBusy ? setOosModal(null) : null)}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all"
                  disabled={oosBusy}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmOutOfStock}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all disabled:opacity-60"
                  disabled={oosBusy}
                >
                  {oosBusy ? 'Updating...' : 'Confirm'}
                </button>
              </div>
            </div>
          </aside>
        </div>,
        document.body
      )}

      {/* Bring back in stock confirm */}
      {restoreConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-default"
            aria-label="Close"
            onClick={() => setRestoreConfirm(null)}
          />
          <div className="relative w-full max-w-md mx-3 bg-white rounded-2xl border border-gray-200 shadow-2xl p-5">
            <h3 className="text-lg font-extrabold text-gray-900">{restoreConfirm.title}</h3>
            <p className="text-sm text-gray-600 mt-2">{restoreConfirm.message}</p>
            <div className="mt-5 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setRestoreConfirm(null)}
                className="px-4 py-2.5 rounded-xl font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"
                disabled={oosBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => restoreConfirm.onConfirm()}
                className="px-4 py-2.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
                disabled={oosBusy}
              >
                Bring back in stock
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Category Management Modal - portaled so overlay covers sidebar and blurs */}
      {showCategoryModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
          onClick={() => {
            setShowCategoryModal(false);
            setCategoryForm({ category_name: '', is_active: true });
            setEditingCategoryId(null);
            setParentCategoryIdInForm(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {categoryModalMode === 'add'
                    ? parentCategoryIdInForm != null
                      ? 'Add Subcategory'
                      : 'Add New Category'
                    : 'Edit Category'}
                </h2>
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setCategoryForm({ category_name: '', is_active: true });
                    setEditingCategoryId(null);
                    setParentCategoryIdInForm(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  aria-label="Close"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              <div className="space-y-4">
                {categoryModalMode === 'add' && parentCategoryIdInForm != null && (
                  <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm text-gray-800">
                    <span className="font-medium">Subcategory under </span>
                    {categories.find((c) => c.id === parentCategoryIdInForm)?.category_name ?? 'parent'}
                  </div>
                )}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {useSubcategoryPeerSuggestions
                      ? 'Subcategory name * (max 30 characters)'
                      : 'Category name * (max 30 characters)'}
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                    value={categoryForm.category_name ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.slice(0, 30);
                      setCategoryForm({ ...categoryForm, category_name: v });
                      setCategorySuggestionsOpen(true);
                    }}
                    onFocus={() => setCategorySuggestionsOpen(true)}
                    onBlur={() => setTimeout(() => setCategorySuggestionsOpen(false), 180)}
                    placeholder={
                      useSubcategoryPeerSuggestions
                        ? 'Start typing — subcategory names from other stores'
                        : 'Start typing — category names from other stores'
                    }
                  />
                  {(categoryForm.category_name?.length ?? 0) > 0 && (
                    <span className="absolute right-3 top-9 text-xs text-gray-400">{(categoryForm.category_name?.length ?? 0)}/30</span>
                  )}
                  {categorySuggestionsOpen && (
                    <div className="absolute z-10 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                      {categoryPeerSuggestionsLoading ? (
                        <p className="px-3 py-2 text-sm text-gray-500">
                          {useSubcategoryPeerSuggestions
                            ? 'Loading subcategory suggestions from other stores…'
                            : 'Loading suggestions from other stores…'}
                        </p>
                      ) : (
                        (() => {
                          const q = (categoryForm.category_name ?? '').trim();
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
                                    ? 'No matching names from other stores yet. You can still use your own name.'
                                    : useSubcategoryPeerSuggestions
                                      ? 'Popular subcategory names from other stores.'
                                      : 'Popular names from other stores on the platform.'}
                                </p>
                              )}
                              {q.length > 0 && !exactInList && !duplicateOnStore && (
                                <div className="border-t border-gray-100 mt-1 pt-1">
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm text-orange-600 font-medium hover:bg-orange-50"
                                    onMouseDown={(e) => { e.preventDefault(); setCategorySuggestionsOpen(false); }}
                                  >
                                    Use &quot;{categoryForm.category_name}&quot; as new{' '}
                                    {useSubcategoryPeerSuggestions ? 'subcategory' : 'category'}
                                  </button>
                                </div>
                              )}
                              {duplicateOnStore && (
                                <p className="px-3 py-2 text-xs text-red-600 border-t border-gray-100">
                                  {useSubcategoryPeerSuggestions
                                    ? 'This name is already used under this category.'
                                    : 'This store already has a category with this name.'}
                                </p>
                              )}
                            </>
                          );
                        })()
                      )}
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
                  <label htmlFor="category-active" className="text-sm text-gray-700">Active</label>
                </div>
              </div>
              {categoryError && <div className="mt-4 text-red-500 text-sm">{categoryError}</div>}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setCategoryForm({ category_name: '', is_active: true });
                    setEditingCategoryId(null);
                    setParentCategoryIdInForm(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-all"
                  disabled={categoryLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCategory}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all"
                  disabled={categoryLoading}
                >
                  {categoryLoading
                    ? 'Saving...'
                    : categoryModalMode === 'add'
                      ? parentCategoryIdInForm != null
                        ? 'Add Subcategory'
                        : 'Add Category'
                      : 'Save Changes'}
                </button>
              </div>
              {categoryModalMode === 'edit' && editingCategoryId && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleDeleteCategory(editingCategoryId)}
                    className="w-full px-4 py-2.5 rounded-lg font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-all"
                    disabled={categoryLoading}
                  >
                    Delete Category
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </MXLayoutWhite>
  );
}

function MenuPageSuspenseFallback() {
  return (
    <MXLayoutWhite restaurantName="Loading..." restaurantId={undefined}>
      <PartnerPageHeader title="Menu Management" subtitle="Loading menu…" />
      <MenuPageSkeleton />
    </MXLayoutWhite>
  );
}

// Export a Suspense-wrapped page for Next.js app directory compliance
export default function MenuPage() {
  return (
    <Suspense fallback={<MenuPageSuspenseFallback />}>
      <MenuContent />
    </Suspense>
  );
}