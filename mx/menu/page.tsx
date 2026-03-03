"use client";

// Default placeholder for menu items when no image is set (restaurant-style)
const ITEM_PLACEHOLDER_SVG = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" fill="#f3f4f6"/><path d="M32 18c-5 0-9 4-9 9s4 9 9 9 9-4 9-9-4-9-9-9zm0 14c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="#d1d5db"/><path d="M20 38l4 12h16l4-12H20z" fill="#9ca3af"/><ellipse cx="32" cy="44" rx="12" ry="3" fill="#e5e7eb"/></svg>'
);

// Suggested category names for type-ahead (max 30 chars per name)
const CATEGORY_SUGGESTIONS = [
  "North Indian", "South Indian", "Mughlai", "Punjabi", "Rajasthani", "Gujarati", "Maharashtrian", "Bengali", "Bihari", "Awadhi", "Kashmiri", "Hyderabadi",
  "Chinese", "Indo-Chinese", "Thai", "Asian", "Japanese", "Korean", "Vietnamese", "Italian", "Mexican", "American", "Mediterranean", "Lebanese", "Turkish", "Arabian", "Continental", "European",
  "Fast Food", "Street Food", "Cafe", "Bakery", "Desserts", "Ice Cream", "Beverages", "Juices", "Smoothies", "Shake & Thick Shakes", "Tea", "Coffee",
  "Pizza", "Burger", "Sandwich", "Wraps & Rolls", "Frankie", "Kathi Roll", "Momos", "Noodles", "Pasta", "Biryani", "Pulao", "Kebab", "Tandoor", "Grill", "BBQ",
  "Seafood", "Fish & Chips", "Chicken Special", "Mutton Dishes", "Egg Dishes", "Pure Veg", "Jain Food", "Healthy Food", "Salads", "Diet Food", "Protein Meals",
  "Home Style Food", "Thali", "Mini Meals", "Combo Meals", "Lunch Box", "Dinner Specials", "Breakfast", "Brunch", "Snacks", "Chaat", "Panipuri", "Sweets", "Mithai", "Halwa", "Lassi", "Kulfi", "Falooda",
  "Waffles", "Pancakes", "Donuts", "Brownies", "Cakes", "Pastries", "Cupcakes", "Chocolate Special", "Frozen Desserts", "Mocktails", "Soft Drinks", "Energy Drinks", "Milkshakes", "Fruit Bowls",
  "Organic Food", "Vegan", "Gluten Free", "Regional Indian", "Coastal Food", "Andhra Cuisine", "Chettinad", "Malabar", "Kerala Food", "Tamil Cuisine", "Telangana Cuisine", "Street Chinese", "Fusion Food",
  "Cloud Kitchen", "Family Restaurant", "Fine Dining", "Quick Bites", "Budget Meals", "Late Night Delivery", "Takeaway Only", "Bulk Orders", "Party Orders", "Catering",
].map(n => n.length > 30 ? n.slice(0, 30) : n);

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
  serves?: number;
  allergens?: string[];
  customizations?: Customization[];
  variants?: Variant[];
  food_type?: string;
  spice_level?: string;
  cuisine_type?: string;
  is_active?: boolean;
  store_id?: number;
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
}

import React, { useState, useEffect, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import { Plus, Edit2, Trash2, X, Upload, Package, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Image as ImageIcon, Info, Search, FileText } from 'lucide-react'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
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
import { MenuItemsGridSkeleton } from '@/components/PageSkeleton'
import { R2Image } from '@/components/R2Image'

// --- Menu Category interface ---
type MerchantStore = {
  store_id: string;
  store_name: string;
};

interface MenuCategory {
  id: number;
  store_id: number;
  category_name: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

const CUSTOMIZATION_VARIANT_LIMIT = 10;

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

// Menu item image upload rules (production)
const MENU_ITEM_IMAGE = {
  MAX_SIZE_BYTES: 1 * 1024 * 1024, // 1 MB
  ACCEPT_TYPES: ['image/png', 'image/jpeg', 'image/jpg'] as const,
  IDEAL_MIN_KB: 200,
  IDEAL_MAX_KB: 500,
  RECOMMENDED_PX: 800,
} as const;

function validateMenuItemImage(file: File): Promise<{ valid: true } | { valid: false; error: string }> {
  const type = file.type?.toLowerCase();
  const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!type || !allowed.includes(type)) {
    return Promise.resolve({ valid: false, error: 'Only PNG and JPG/JPEG images are allowed.' });
  }
  if (file.size > MENU_ITEM_IMAGE.MAX_SIZE_BYTES) {
    return Promise.resolve({ valid: false, error: 'Image must be 1 MB or smaller.' });
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth !== img.naturalHeight) {
        resolve({ valid: false, error: 'Please upload a square image (1:1 ratio).' });
      } else {
        resolve({ valid: true });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, error: 'Could not read image. Use a valid PNG or JPG file.' });
    };
    img.src = url;
  });
}

interface ItemFormProps {
  isEdit?: boolean;
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
}

export const dynamic = 'force-dynamic'

// Hide scrollbar globally but keep functionality
const globalStyles = `
  ::-webkit-scrollbar { display: none; }
  html { scrollbar-width: none; -ms-overflow-style: none; }
`;

// Food type options
const FOOD_TYPES = ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Eggitarian'];
const SPICE_LEVELS = ['Mild', 'Medium', 'Hot', 'Very Hot'];
const CUISINE_TYPES = [
  'North Indian', 'Chinese', 'Fast Food', 'South Indian', 'Biryani', 'Pizza', 'Bakery', 'Street Food', 'Burger', 'Mughlai', 'Momos', 'Sandwich', 'Mithai', 'Rolls', 'Beverages', 'Desserts', 'Cafe', 'Healthy Food', 'Maharashtrian', 'Tea', 'Bengali', 'Ice Cream', 'Juices', 'Shake', 'Shawarma', 'Gujarati', 'Italian', 'Continental', 'Lebanese', 'Salad', 'Andhra', 'Waffle', 'Coffee', 'Kebab', 'Arabian', 'Kerala', 'Asian', 'Seafood', 'Pasta', 'BBQ', 'Rajasthani', 'Wraps', 'Paan', 'Hyderabadi', 'Mexican', 'Bihari', 'Goan', 'Assamese', 'American', 'Mandi', 'Chettinad', 'Mishti', 'Bar Food', 'Malwani', 'Odia', 'Roast Chicken', 'Tamil', 'Japanese', 'Finger Food', 'Korean', 'North Eastern', 'Thai', 'Kathiyawadi', 'Bubble Tea', 'Mangalorean', 'Burmese', 'Sushi', 'Lucknowi', 'Modern Indian', 'Tibetan', 'Afghan', 'Oriental', 'Pancake', 'Kashmiri', 'Middle Eastern', 'Grocery', 'Konkan', 'European', 'Awadhi', 'Hot dogs', 'Sindhi', 'Turkish', 'Naga', 'Mediterranean', 'Nepalese', 'Cuisine Varies', 'Saoji', 'Charcoal Chicken', 'Steak', 'Frozen Yogurt', 'Panini', 'Parsi', 'Sichuan', 'Iranian', 'Grilled Chicken', 'French', 'Raw Meats', 'Drinks Only', 'Vietnamese', 'Liquor', 'Greek', 'Himachali', 'Bohri', 'Garhwali', 'Cantonese', 'Malaysian', 'Belgian', 'British', 'African', 'Spanish', 'Manipuri', 'Egyptian', 'Sri Lankan', 'Relief fund', 'Bangladeshi', 'Indonesian', 'Tex-Mex', 'Irish', 'Singaporean', 'South American', 'Mongolian', 'German', 'Russian', 'Brazilian', 'Pakistani', 'Australian', 'Moroccan', 'Filipino', 'Hot Pot', 'Retail Products', 'Mizo', 'Portuguese', 'Indian', 'Tripuri', 'Delight Goodies', 'Meghalayan', 'Sikkimese', 'Armenian', 'Afghani',
];
const CUISINE_TOP_COUNT = 7;

// Customization types
const CUSTOMIZATION_TYPES = ['Radio', 'Checkbox', 'Dropdown', 'Text'];

function ItemForm(props: ItemFormProps) {
  const {
    isEdit = false,
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
  } = props;

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

  // Auto-calculate Selling Price
  useEffect(() => {
    const base = parseFloat(formData.base_price) || 0;
    const discount = parseFloat(formData.discount_percentage) || 0;
    const tax = parseFloat(formData.tax_percentage) || 0;
    if (base > 0) {
      const selling = base - (base * discount / 100) + (base * tax / 100);
      if (!isNaN(selling)) {
        setFormData((prev: any) => ({ ...prev, selling_price: selling.toFixed(2) }));
      }
    } else {
      setFormData((prev: any) => ({ ...prev, selling_price: '' }));
    }
  }, [formData.base_price, formData.discount_percentage, formData.tax_percentage, setFormData]);

  const [activeSection, setActiveSection] = useState<'main' | 'customization'>('main');
  const [showFoodDropdown, setShowFoodDropdown] = useState(false);
  const [cuisineSearch, setCuisineSearch] = useState('');
  const [cuisineViewMore, setCuisineViewMore] = useState(false);
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
    setFormData({ ...formData, customizations: updatedCustomizations });
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
    setFormData({ ...formData, customizations: updatedCustomizations });
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
    setFormData({ ...formData, customizations: updatedCustomizations });
  };

  const handleUpdateAddon = (customizationIndex: number, addonIndex: number, field: string, value: any) => {
    const updatedCustomizations = [...customizations];
    const addons = updatedCustomizations[customizationIndex].addons || [];
    addons[addonIndex] = { ...addons[addonIndex], [field]: value };
    updatedCustomizations[customizationIndex].addons = addons;
    setCustomizations(updatedCustomizations);
    setFormData({ ...formData, customizations: updatedCustomizations });
  };

  const handleDeleteAddon = (customizationIndex: number, addonIndex: number) => {
    const updatedCustomizations = [...customizations];
    const addons = updatedCustomizations[customizationIndex].addons || [];
    addons.splice(addonIndex, 1);
    updatedCustomizations[customizationIndex].addons = addons;
    setCustomizations(updatedCustomizations);
    setFormData({ ...formData, customizations: updatedCustomizations });
  };

  // Validation helpers
  const offerPercentNum = Number(formData.discount_percentage);
  const isOfferPercentInvalid =
    formData.discount_percentage !== '' && (isNaN(offerPercentNum) || offerPercentNum < 0 || offerPercentNum > 100);

  const taxPercentNum = Number(formData.tax_percentage);
  const isTaxPercentInvalid =
    formData.tax_percentage !== '' && (isNaN(taxPercentNum) || taxPercentNum < 0 || taxPercentNum > 100);

  const basePriceNum = Number(formData.base_price);
  const isBasePriceInvalid = formData.base_price !== '' && (isNaN(basePriceNum) || basePriceNum <= 0);

  const sellingPriceNum = Number(formData.selling_price);
  const isSellingPriceInvalid = formData.selling_price !== '' && (isNaN(sellingPriceNum) || sellingPriceNum <= 0);

  return (
    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-2 md:mx-0 border border-gray-100">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{isEdit ? `Editing: ${currentItemId}` : 'Enter details for the menu item'}</p>
        </div>
        <button type="button" onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close">
          <X size={18} className="text-gray-600" />
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveSection('main')}
          className={`px-3 py-2 text-xs font-medium border-b-2 ${activeSection === 'main' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}
        >
          Item & pricing
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('customization')}
          className={`px-3 py-2 text-xs font-medium border-b-2 ${activeSection === 'customization' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}
        >
          Customizations & variants
        </button>
      </div>

      <form
        className="px-4 py-3 max-h-[70vh] overflow-y-auto"
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          if (activeSection === 'main') {
            if (onSaveAndNext) {
              try {
                await onSaveAndNext();
                setActiveSection('customization');
              } catch (_) {}
            } else if (onSubmit) onSubmit();
          } else {
            if (onSubmitOptions) {
              try {
                await onSubmitOptions();
              } catch (_) {}
            } else if (onSubmit) onSubmit();
          }
        }}
      >
        {activeSection === 'main' && (
          <div className="space-y-3">
            {/* Row 1: Name, Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Item name *</label>
                <input type="text" placeholder="Name" className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.item_name} onChange={e => setFormData({ ...formData, item_name: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Category *</label>
                <select className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.category_id ?? ''} onChange={e => setFormData({ ...formData, category_id: e.target.value ? Number(e.target.value) : null })} required>
                  <option value="">Select</option>
                  {categories.map((cat: MenuCategory) => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
                </select>
              </div>
            </div>
            {/* Row 2: Food type, Spice */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Food type</label>
                <select className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.food_type || ''} onChange={e => setFormData({ ...formData, food_type: e.target.value })}>
                  <option value="">—</option>
                  {FOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Spice</label>
                <select className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.spice_level || ''} onChange={e => setFormData({ ...formData, spice_level: e.target.value })}>
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
              {cuisineViewMore && CUISINE_TYPES.length > CUISINE_TOP_COUNT && (
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
              {(() => {
                const q = cuisineSearch.trim().toLowerCase();
                const filtered = q
                  ? CUISINE_TYPES.filter((c) => c.toLowerCase().includes(q))
                  : CUISINE_TYPES;
                const topCuisines = CUISINE_TYPES.slice(0, CUISINE_TOP_COUNT);
                const showAsTop = !cuisineViewMore && !q ? topCuisines : filtered;
                const hasMore = !cuisineViewMore && !q && CUISINE_TYPES.length > CUISINE_TOP_COUNT;
                const customAdd = q && !CUISINE_TYPES.some((c) => c.toLowerCase() === q) && !selectedCuisines.some((c) => c.toLowerCase() === q);
                return (
                  <>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {showAsTop.map((c) => {
                        const checked = selectedCuisines.includes(c);
                        const disabled = !checked && cuisineAtLimit;
                        return (
                          <label
                            key={c}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border cursor-pointer transition-colors ${
                              disabled ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : checked ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-white border-gray-200 text-gray-700 hover:border-orange-200'
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
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => setCuisineViewMore(true)}
                        className="mt-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium"
                      >
                        View more cuisines ({CUISINE_TYPES.length - CUISINE_TOP_COUNT} more)
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
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
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
                  </>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-xs font-medium text-gray-600">Description</label>
                <textarea className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm resize-none" rows={2} placeholder="Optional" value={formData.item_description || ''} onChange={e => setFormData({ ...formData, item_description: e.target.value })} />
                <label className="text-xs font-medium text-gray-600 mt-1 block">Allergens (comma)</label>
                <input type="text" placeholder="e.g. Nuts, Dairy" className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.allergens || ''} onChange={e => setFormData({ ...formData, allergens: e.target.value })} />
              </div>
            </div>
            {/* Pricing row: base, selling, discount%, tax% */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Base price (₹) *</label>
                <input type="number" min="0" step="0.01" className={`w-full px-2.5 py-1.5 border rounded text-sm ${isBasePriceInvalid ? 'border-red-300' : 'border-gray-200'}`} value={formData.base_price} onChange={e => setFormData({ ...formData, base_price: e.target.value })} required />
                {isBasePriceInvalid && <span className="text-xs text-red-500">&gt; 0</span>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Selling (₹) *</label>
                <input type="number" min="0" step="0.01" readOnly className={`w-full px-2.5 py-1.5 border rounded text-sm bg-gray-50 ${isSellingPriceInvalid ? 'border-red-300' : 'border-gray-200'}`} value={formData.selling_price} required />
                {isSellingPriceInvalid && <span className="text-xs text-red-500">&gt; 0</span>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Discount %</label>
                <input type="number" min="0" max="100" step="0.01" className={`w-full px-2.5 py-1.5 border rounded text-sm ${isOfferPercentInvalid ? 'border-red-300' : 'border-gray-200'}`} value={formData.discount_percentage} onChange={e => setFormData({ ...formData, discount_percentage: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tax %</label>
                <input type="number" min="0" max="100" step="0.01" className={`w-full px-2.5 py-1.5 border rounded text-sm ${isTaxPercentInvalid ? 'border-red-300' : 'border-gray-200'}`} value={formData.tax_percentage} onChange={e => setFormData({ ...formData, tax_percentage: e.target.value })} />
              </div>
            </div>
            {/* Stock & prep */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={formData.in_stock} onChange={e => setFormData({ ...formData, in_stock: e.target.checked })} className="h-4 w-4 text-orange-500 rounded" />
                <span className="text-xs font-medium text-gray-700">In stock</span>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Avail. qty</label>
                <input type="number" min="0" className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.available_quantity || ''} onChange={e => setFormData({ ...formData, available_quantity: e.target.value || '' })} placeholder="—" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Low stock at</label>
                <input type="number" min="0" className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.low_stock_threshold || ''} onChange={e => setFormData({ ...formData, low_stock_threshold: e.target.value || '' })} placeholder="—" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Prep (min)</label>
                <input type="number" min="0" className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.preparation_time_minutes ?? 15} onChange={e => setFormData({ ...formData, preparation_time_minutes: Number(e.target.value) || 15 })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Serves</label>
                <input type="number" min="1" className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm" value={formData.serves ?? 1} onChange={e => setFormData({ ...formData, serves: Number(e.target.value) || 1 })} />
              </div>
            </div>
            {/* Flags: popular, recommended, customizations, variants, active */}
            <div className="flex flex-wrap gap-4 pt-1 border-t border-gray-100">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={formData.is_popular} onChange={e => setFormData({ ...formData, is_popular: e.target.checked })} className="h-3.5 w-3.5 text-orange-500 rounded" /><span className="text-xs text-gray-700">Popular</span></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={formData.is_recommended} onChange={e => setFormData({ ...formData, is_recommended: e.target.checked })} className="h-3.5 w-3.5 text-orange-500 rounded" /><span className="text-xs text-gray-700">Recommended</span></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={formData.has_customizations} onChange={e => setFormData({ ...formData, has_customizations: e.target.checked })} className="h-3.5 w-3.5 text-orange-500 rounded" /><span className="text-xs text-gray-700">Customizations</span></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={formData.has_variants} onChange={e => setFormData({ ...formData, has_variants: e.target.checked })} className="h-3.5 w-3.5 text-orange-500 rounded" /><span className="text-xs text-gray-700">Variants</span></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} className="h-3.5 w-3.5 text-orange-500 rounded" /><span className="text-xs text-gray-700">Active</span></label>
            </div>
          </div>
        )}

        {activeSection === 'customization' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Max {CUSTOMIZATION_VARIANT_LIMIT} customizations & variants total. Current: {totalOptionsCount}/{CUSTOMIZATION_VARIANT_LIMIT}</p>
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">{editingCustomizationIndex !== null ? 'Edit' : 'Add'} customization</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-600">Title *</label>
                  <input type="text" className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" value={newCustomization.customization_title} onChange={e => setNewCustomization({...newCustomization, customization_title: e.target.value})} placeholder="e.g. Choose Size" />
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
                    {editingCustomizationIndex !== null ? 'Update' : 'Add'}
                  </button>
                  {editingCustomizationIndex !== null && (
                    <button type="button" onClick={() => { setNewCustomization({ customization_title: '', customization_type: 'Checkbox', is_required: false, min_selection: 0, max_selection: 1, display_order: customizations.length }); setEditingCustomizationIndex(null); }} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300">Cancel</button>
                  )}
                </div>
              </div>
            </div>

            {customizations.length > 0 ? (
              <div className="space-y-2">
                {customizations.map((cust, custIndex) => (
                  <div key={custIndex} className="border border-gray-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900">{cust.customization_title}</span>
                        <span className="text-xs text-gray-500 ml-2">{cust.customization_type}</span>
                        {cust.is_required && <span className="text-xs text-red-600 ml-1">Required</span>}
                        <span className="text-xs text-gray-400 ml-1">{cust.min_selection}-{cust.max_selection}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button type="button" onClick={() => handleEditCustomization(custIndex)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={12} /></button>
                        <button type="button" onClick={() => handleDeleteCustomization(custIndex)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 size={12} /></button>
                        <button type="button" onClick={() => handleAddAddon(custIndex)} className="text-xs text-orange-600 font-medium px-1.5 py-0.5">+ Addon</button>
                      </div>
                    </div>
                    {cust.addons && cust.addons.length > 0 && (
                      <div className="mt-2 pl-2 border-l border-gray-200 space-y-1">
                        {cust.addons.map((addon, addonIndex) => (
                          <div key={addonIndex} className="flex items-center gap-2">
                            <input type="text" className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs" value={addon.addon_name} onChange={e => handleUpdateAddon(custIndex, addonIndex, 'addon_name', e.target.value)} placeholder="Name" />
                            <span className="text-gray-500 text-xs">₹</span>
                            <input type="number" min="0" step="0.01" className="w-14 px-2 py-1 border border-gray-200 rounded text-xs" value={addon.addon_price} onChange={e => handleUpdateAddon(custIndex, addonIndex, 'addon_price', Number(e.target.value))} />
                            <button type="button" onClick={() => handleDeleteAddon(custIndex, addonIndex)} className="p-0.5 text-red-500"><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 py-2">No customizations. Add sizes, toppings, or addons.</p>
            )}

            <div className="border-t border-gray-200 pt-3">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">
                Variants (optional)
                {(formData.customizations?.length || 0) + (formData.variants?.length || 0) >= CUSTOMIZATION_VARIANT_LIMIT && (
                  <span className="text-amber-600 font-normal ml-1">— Max {CUSTOMIZATION_VARIANT_LIMIT} total</span>
                )}
              </h3>
              {(formData.variants || []).map((v: Variant, idx: number) => (
                <div key={idx} className="flex flex-wrap items-end gap-3 mb-3 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="min-w-[120px]">
                    <label className="text-xs text-gray-600 block mb-0.5">Title *</label>
                    <input type="text" className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" value={v.variant_type ?? ''} onChange={e => { const vars = [...(formData.variants || [])]; vars[idx] = { ...vars[idx], variant_type: e.target.value }; setFormData({ ...formData, variants: vars }); }} placeholder="e.g. Choose Size" />
                  </div>
                  <div className="min-w-[100px]">
                    <label className="text-xs text-gray-600 block mb-0.5">Name *</label>
                    <input type="text" className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" value={v.variant_name} onChange={e => { const vars = [...(formData.variants || [])]; vars[idx] = { ...vars[idx], variant_name: e.target.value }; setFormData({ ...formData, variants: vars }); }} placeholder="e.g. Medium" />
                  </div>
                  <div className="min-w-[80px]">
                    <label className="text-xs text-gray-600 block mb-0.5">Price (₹) *</label>
                    <input type="number" min="0" step="0.01" className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" value={typeof v.variant_price === 'number' ? v.variant_price : ''} onChange={e => { const vars = [...(formData.variants || [])]; vars[idx] = { ...vars[idx], variant_price: Number(e.target.value) || 0 }; setFormData({ ...formData, variants: vars }); }} placeholder="0" />
                  </div>
                  <button type="button" onClick={() => { const vars = (formData.variants || []).filter((_: Variant, i: number) => i !== idx); setFormData({ ...formData, variants: vars, has_variants: vars.length > 0 }); }} className="p-1.5 text-red-600 hover:bg-red-50 rounded self-end"><Trash2 size={14} /></button>
                </div>
              ))}
              <button
                type="button"
                disabled={(formData.customizations?.length || 0) + (formData.variants?.length || 0) >= CUSTOMIZATION_VARIANT_LIMIT}
                onClick={() => {
                  const vars = [...(formData.variants || []), { variant_name: '', variant_type: '', variant_price: 0, menu_item_id: 0 }];
                  setFormData({ ...formData, variants: vars, has_variants: true });
                }}
                className="mt-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add Variant
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
          <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100" onClick={onCancel} disabled={isSaving}>Cancel</button>
          {activeSection === 'main' ? (
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
              disabled={isSaving || !!imageValidationError || isOfferPercentInvalid || isTaxPercentInvalid || isBasePriceInvalid || isSellingPriceInvalid || !formData.base_price || !formData.discount_percentage || !formData.tax_percentage || !formData.selling_price}
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
          )}
        </div>
        {error && <div className="text-red-500 text-xs mt-2">{error}</div>}
      </form>
    </div>
  );
}

function MenuContent() {
  // --- Dynamic Menu Categories State ---
  const [storeId, setStoreId] = useState<string | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState<'add' | 'edit'>('add');
  const [categoryForm, setCategoryForm] = useState<Partial<MenuCategory>>({ 
    category_name: '', 
    is_active: true,
  });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const categoryScrollRef = React.useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [viewCustModal, setViewCustModal] = useState<{ open: boolean; item: MenuItem | null }>({ open: false, item: null });
  const [viewCustModalTab, setViewCustModalTab] = useState<'customizations' | 'variants'>('customizations');

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
    tax_percentage: '5',
    in_stock: true,
    available_quantity: '',
    low_stock_threshold: '',
    has_customizations: false,
    has_addons: false,
    has_variants: false,
    is_popular: false,
    is_recommended: false,
    preparation_time_minutes: 15,
    serves: 1,
    is_active: true,
    allergens: '',
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
    tax_percentage: '5',
    in_stock: true,
    available_quantity: '',
    low_stock_threshold: '',
    has_customizations: false,
    has_addons: false,
    has_variants: false,
    is_popular: false,
    is_recommended: false,
    preparation_time_minutes: 25,
    serves: 1,
    is_active: true,
    allergens: '',
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
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  /** After "Save and Next" we have created the item; Submit will sync options for this item */
  const [addItemSaved, setAddItemSaved] = useState<{ item_id: string; id: number } | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stockToggleItem, setStockToggleItem] = useState<{ item_id: string; newStatus: boolean } | null>(null);
  const [isTogglingStock, setIsTogglingStock] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMenuItemId, setEditingMenuItemId] = useState<number | null>(null);

  const [imageUploadStatus, setImageUploadStatus] = useState<any>(null);
  const [storeImageCount, setStoreImageCount] = useState<{ totalUsed: number } | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [planLimits, setPlanLimits] = useState<{
    maxMenuItems: number | null;
    maxMenuCategories: number | null;
    imageUploadAllowed: boolean;
    maxImageUploads: number | null;
    maxCuisinesPerItem: number | null;
    planName?: string;
  } | null>(null);

  const [existingMenuSpreadsheetUrl, setExistingMenuSpreadsheetUrl] = useState<string | null>(null);
  const [existingMenuImageUrls, setExistingMenuImageUrls] = useState<string[]>([]);
  const [existingMenuSpreadsheetFileName, setExistingMenuSpreadsheetFileName] = useState<string | null>(null);
  const [existingMenuImageFileNames, setExistingMenuImageFileNames] = useState<string[]>([]);
  const [menuSpreadsheetVerificationStatus, setMenuSpreadsheetVerificationStatus] = useState<string | null>(null);
  const [menuImageVerificationStatuses, setMenuImageVerificationStatuses] = useState<string[]>([]);
  const [menuUploadMode, setMenuUploadMode] = useState<'csv' | 'image' | null>(null);
  const [menuFile, setMenuFile] = useState<File | null>(null);
  const [menuUploading, setMenuUploading] = useState(false);
  const [menuReplaceError, setMenuReplaceError] = useState('');
  const [csvValidationError, setCsvValidationError] = useState('');
  const [showMenuFileSection, setShowMenuFileSection] = useState(false);
  const menuFileSectionRef = React.useRef<HTMLDivElement>(null);

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

  const refetchExistingMenuMedia = React.useCallback(async () => {
    const storeDbId = (store as { id?: number })?.id;
    if (storeDbId == null) return;
    try {
      const menuRes = await fetch(`/api/auth/store-menu-media-signed?storeDbId=${storeDbId}`);
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        setExistingMenuSpreadsheetUrl(menuData.menuSpreadsheetUrl ?? null);
        setExistingMenuImageUrls(Array.isArray(menuData.menuImageUrls) ? menuData.menuImageUrls : []);
        setExistingMenuSpreadsheetFileName(menuData.menuSpreadsheetFileName ?? null);
        setExistingMenuImageFileNames(Array.isArray(menuData.menuImageFileNames) ? menuData.menuImageFileNames : []);
        setMenuSpreadsheetVerificationStatus(menuData.menuSpreadsheetVerificationStatus ?? null);
        setMenuImageVerificationStatuses(Array.isArray(menuData.menuImageVerificationStatuses) ? menuData.menuImageVerificationStatuses : []);
      }
    } catch {
      // keep previous
    }
  }, [store]);

  const handleMenuFileUpload = async () => {
    if (!storeId || !menuUploadMode || !menuFile) {
      toast.error('Select CSV or image and choose a file.');
      return;
    }
    const storeDbId = (store as { id?: number })?.id;
    if (storeDbId == null) {
      toast.error('Store not loaded.');
      return;
    }
    if (menuUploadMode === 'csv') {
      const validation = await validateMenuCsv(menuFile);
      if (!validation.valid) {
        setCsvValidationError(validation.error);
        return;
      }
      setCsvValidationError('');
    }
    setMenuReplaceError('');
    setMenuUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', menuFile);
      formData.append('storeId', storeId);
      formData.append('menuUploadMode', menuUploadMode === 'csv' ? 'CSV' : 'IMAGE');
      const res = await fetch('/api/merchant/menu-upload', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMenuReplaceError(data?.error || 'Upload failed.');
        toast.error(data?.error || 'Upload failed.');
        return;
      }
      setMenuFile(null);
      setMenuUploadMode(null);
      toast.success('Menu file uploaded. It will replace the previous file. Our team will add items from it.');
      await refetchExistingMenuMedia();
    } catch (e) {
      setMenuReplaceError('Upload failed. Please try again.');
      toast.error('Upload failed.');
    } finally {
      setMenuUploading(false);
    }
  };

  // Fetch store ID from params or localStorage
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams ? searchParams.get('storeId') : null;
      if (!id) id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null;
      setStoreId(id);
    };
    getStoreId();
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

  // Fetch store and menu items
  useEffect(() => {
    if (!storeId) {
      setStoreError('Please select a store first. No store ID found in URL or localStorage.');
      setIsLoading(false);
      return;
    }
    
    const loadData = async () => {
      setIsLoading(true);
      setStoreError(null);
      try {
        let data = await fetchStoreById(storeId);
        if (!data) {
          data = await fetchStoreByName(storeId);
        }
        
        if (!data) {
          setStoreError(`Store not found with ID/Name: ${storeId}`);
          setIsLoading(false);
          return;
        }
        
        setStore(data);
        
        const res = await fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}`);
        const items = res.ok ? await res.json() : [];
        setMenuItems(Array.isArray(items) ? items : []);

        const status = await getImageUploadStatus(storeId);
        setImageUploadStatus(status);
        const countRes = await fetch(`/api/merchant/store-image-count?storeId=${encodeURIComponent(storeId)}`);
        if (countRes.ok) {
          const countData = await countRes.json();
          setStoreImageCount({ totalUsed: countData.totalUsed ?? 0 });
        } else {
          setStoreImageCount(null);
        }

        // Plan-driven limits: no hardcoding; works with any number of plans from DB
        try {
          const subRes = await fetch(`/api/merchant/subscription?storeId=${encodeURIComponent(storeId)}`);
          if (subRes.ok) {
            const subJson = await subRes.json();
            const plan = subJson.plan ?? subJson.subscription?.merchant_plans ?? null;
            if (plan && typeof plan === 'object') {
              const maxImg = plan.max_image_uploads ?? null;
              // Allow image upload if plan allows it OR has a positive limit (e.g. Free plan with 5 images)
              const canUploadImages = plan.image_upload_allowed === true || (maxImg != null && maxImg > 0);
              setPlanLimits({
                maxMenuItems: plan.max_menu_items ?? null,
                maxMenuCategories: plan.max_menu_categories ?? null,
                imageUploadAllowed: canUploadImages,
                maxImageUploads: maxImg,
                maxCuisinesPerItem: plan.max_cuisines ?? null,
                planName: plan.plan_name ?? undefined,
              });
            } else {
              setPlanLimits(null); // No plan = no restrictions (allow all)
            }
          } else {
            setPlanLimits(null);
          }
        } catch {
          setPlanLimits(null);
        }

        const storeDbId = (data as { id?: number })?.id;
        if (storeDbId != null) {
          try {
            const menuRes = await fetch(`/api/auth/store-menu-media-signed?storeDbId=${storeDbId}`);
            if (menuRes.ok) {
              const menuData = await menuRes.json();
              setExistingMenuSpreadsheetUrl(menuData.menuSpreadsheetUrl ?? null);
              setExistingMenuImageUrls(Array.isArray(menuData.menuImageUrls) ? menuData.menuImageUrls : []);
              setExistingMenuSpreadsheetFileName(menuData.menuSpreadsheetFileName ?? null);
              setExistingMenuImageFileNames(Array.isArray(menuData.menuImageFileNames) ? menuData.menuImageFileNames : []);
              setMenuSpreadsheetVerificationStatus(menuData.menuSpreadsheetVerificationStatus ?? null);
              setMenuImageVerificationStatuses(Array.isArray(menuData.menuImageVerificationStatuses) ? menuData.menuImageVerificationStatuses : []);
            }
          } catch {
            // keep defaults
          }
        }
      } catch (error) {
        console.error('Error loading menu:', error);
        setStoreError('Error loading store data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [storeId]);

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
    } else {
      setAddImageValidationError('');
      setAddImageValidating(true);
    }

    const result = await validateMenuItemImage(file);
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
    if (addForm.tax_percentage && (isNaN(Number(addForm.tax_percentage)) || Number(addForm.tax_percentage) < 0 || Number(addForm.tax_percentage) > 100)) {
      return setAddError("Tax % must be between 0 and 100");
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
        itemImageUrl = uploadData.key ?? addForm.item_image_url;
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
        tax_percentage: addForm.tax_percentage ? Number(addForm.tax_percentage) : 0,
        in_stock: addForm.in_stock,
        available_quantity: addForm.available_quantity ? Number(addForm.available_quantity) : null,
        low_stock_threshold: addForm.low_stock_threshold ? Number(addForm.low_stock_threshold) : null,
        has_customizations: addForm.customizations?.length > 0,
        has_addons: addForm.customizations?.some(c => c.addons && c.addons.length > 0),
        has_variants: addForm.has_variants,
        is_popular: addForm.is_popular,
        is_recommended: addForm.is_recommended,
        preparation_time_minutes: addForm.preparation_time_minutes,
        serves: addForm.serves,
        is_active: addForm.is_active,
        allergens: allergensArray,
        category_id: addForm.category_id,
        customizations: addForm.customizations || [],
        restaurant_id: storeId,
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
          tax_percentage: '5',
          in_stock: true,
          available_quantity: '',
          low_stock_threshold: '',
          has_customizations: false,
          has_addons: false,
          has_variants: false,
          is_popular: false,
          is_recommended: false,
          preparation_time_minutes: 15,
          serves: 1,
          is_active: true,
          allergens: '',
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
      return;
    }
    if (!canAddItem) {
      toast.error('Menu item limit reached for your plan. Upgrade to add more items.');
      return;
    }
    setAddError('');
    if (!addForm.item_name.trim()) return setAddError('Name is required');
    if (!addForm.category_id) return setAddError('Category is required');
    if (!addForm.base_price || isNaN(Number(addForm.base_price)) || Number(addForm.base_price) <= 0)
      return setAddError('Valid base price is required (greater than 0)');
    if (!addForm.selling_price || isNaN(Number(addForm.selling_price)) || Number(addForm.selling_price) <= 0)
      return setAddError('Valid selling price is required (greater than 0)');
    if (addForm.discount_percentage && (isNaN(Number(addForm.discount_percentage)) || Number(addForm.discount_percentage) < 0 || Number(addForm.discount_percentage) > 100))
      return setAddError('Discount % must be between 0 and 100');
    if (addForm.tax_percentage && (isNaN(Number(addForm.tax_percentage)) || Number(addForm.tax_percentage) < 0 || Number(addForm.tax_percentage) > 100))
      return setAddError('Tax % must be between 0 and 100');

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
          setAddError(err?.error || 'Image upload failed.');
          setIsSaving(false);
          return;
        }
        const uploadData = await uploadRes.json();
        itemImageUrl = uploadData.key ?? addForm.item_image_url;
        setImagePreview(itemImageUrl);
      }
      const allergensArray = addForm.allergens
        ? addForm.allergens.split(',').map((a: string) => a.trim()).filter(Boolean)
        : [];
      if (!addForm.category_id || !storeId) {
        setAddError('Category and store are required.');
        setIsSaving(false);
        return;
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
        tax_percentage: addForm.tax_percentage ? Number(addForm.tax_percentage) : 0,
        in_stock: addForm.in_stock,
        available_quantity: addForm.available_quantity ? Number(addForm.available_quantity) : null,
        low_stock_threshold: addForm.low_stock_threshold ? Number(addForm.low_stock_threshold) : null,
        has_customizations: false,
        has_addons: false,
        has_variants: false,
        is_popular: addForm.is_popular,
        is_recommended: addForm.is_recommended,
        preparation_time_minutes: addForm.preparation_time_minutes,
        serves: addForm.serves,
        is_active: addForm.is_active,
        allergens: allergensArray,
        category_id: addForm.category_id,
        customizations: [],
        restaurant_id: storeId,
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
        setAddItemSaved({ item_id: result.item_id, id: result.id });
        setMenuItems((prev) => [result, ...prev]);
        toast.success('Item saved. Add customizations/variants or click Submit.');
      } else {
        setAddError('Failed to save item.');
      }
    } catch (e) {
      console.error('Error saving item:', e);
      setAddError('Error saving item.');
    }
    setIsSaving(false);
  }

  async function handleAddSubmitOptions() {
    if (!addItemSaved || !storeId) {
      toast.error('Save the item first (Save and Next).');
      return;
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
        tax_percentage: '5',
        in_stock: true,
        available_quantity: '',
        low_stock_threshold: '',
        has_customizations: false,
        has_addons: false,
        has_variants: false,
        is_popular: false,
        is_recommended: false,
        preparation_time_minutes: 15,
        serves: 1,
        is_active: true,
        allergens: '',
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
      setAddError('Error saving options.');
    }
    setIsSaving(false);
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
    
    setEditForm({
      item_name: item.item_name || '',
      item_description: item.item_description || '',
      item_image_url: item.item_image_url || '',
      image: null,
      food_type: item.food_type || '',
      spice_level: item.spice_level || '',
      cuisine_type: item.cuisine_type || '',
      base_price: item.base_price?.toString() || '',
      selling_price: item.selling_price?.toString() || '',
      discount_percentage: item.discount_percentage?.toString() || '0',
      tax_percentage: item.tax_percentage?.toString() ?? '5',
      in_stock: item.in_stock ?? true,
      available_quantity: item.available_quantity?.toString() || '',
      low_stock_threshold: item.low_stock_threshold?.toString() || '',
      has_customizations: customizationsWithAddons.length > 0,
      has_addons: customizationsWithAddons.some(c => (c.addons?.length ?? 0) > 0),
      has_variants: variantsList.length > 0,
      is_popular: item.is_popular ?? false,
      is_recommended: item.is_recommended ?? false,
      preparation_time_minutes: item.preparation_time_minutes || 15,
      serves: item.serves || 1,
      is_active: item.is_active ?? true,
      allergens: allergensString,
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
    if (editForm.tax_percentage && (isNaN(Number(editForm.tax_percentage)) || Number(editForm.tax_percentage) < 0 || Number(editForm.tax_percentage) > 100))
      return 'Tax % must be between 0 and 100';
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
        itemImageUrl = uploadData.key ?? editForm.item_image_url;
        setEditImagePreview(itemImageUrl);
      }
      const allergensArray = editForm.allergens
        ? editForm.allergens.split(',').map((a: string) => a.trim()).filter(Boolean)
        : [];
      const hasCustomizations = Array.isArray(editForm.customizations) && editForm.customizations.length > 0;
      const hasAddons = Array.isArray(editForm.customizations) && editForm.customizations.some((c: any) => Array.isArray(c.addons) && c.addons.length > 0);
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
        tax_percentage: editForm.tax_percentage ? Number(editForm.tax_percentage) : 0,
        in_stock: editForm.in_stock,
        available_quantity: editForm.available_quantity ? Number(editForm.available_quantity) : null,
        low_stock_threshold: editForm.low_stock_threshold ? Number(editForm.low_stock_threshold) : null,
        has_customizations: hasCustomizations,
        has_addons: hasAddons,
        has_variants: editForm.has_variants,
        is_popular: editForm.is_popular,
        is_recommended: editForm.is_recommended,
        preparation_time_minutes: editForm.preparation_time_minutes,
        serves: editForm.serves,
        is_active: editForm.is_active,
        allergens: allergensArray,
        category_id: editForm.category_id,
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
      const listRes = await fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}`);
      const listJson = await listRes.json().catch(() => []);
      const itemsList = listRes.ok && Array.isArray(listJson) ? listJson : [];
      const updatedMenuItem = itemsList.find((item: any) => item.item_id === editingId);
      if (updatedMenuItem) {
        setMenuItems((prev) => prev.map((item) => (item.item_id === editingId ? { ...item, ...updatedMenuItem } : item)));
      }
      setShowEditModal(false);
      await refetchImageCount();
      toast.success('Item updated successfully!');
    } catch (e) {
      console.error('Error saving options:', e);
      setEditError('Error saving options.');
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
        itemImageUrl = uploadData.key ?? editForm.item_image_url;
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
          tax_percentage: editForm.tax_percentage ? Number(editForm.tax_percentage) : 0,
          in_stock: editForm.in_stock,
          available_quantity: editForm.available_quantity ? Number(editForm.available_quantity) : null,
          low_stock_threshold: editForm.low_stock_threshold ? Number(editForm.low_stock_threshold) : null,
          has_customizations: hasCustomizations,
          has_addons: hasAddons,
          has_variants: editForm.has_variants,
          is_popular: editForm.is_popular,
          is_recommended: editForm.is_recommended,
          preparation_time_minutes: editForm.preparation_time_minutes,
          serves: editForm.serves,
          is_active: editForm.is_active,
          allergens: allergensArray,
          category_id: editForm.category_id,
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
      if (result?.item_id) {
        const listRes = await fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId!)}`);
        const listJson = await listRes.json().catch(() => []);
        const itemsList = listRes.ok && Array.isArray(listJson) ? listJson : [];
        const updatedMenuItem = itemsList.find((item: any) => item.item_id === editingId);
        if (updatedMenuItem) {
          setMenuItems((prev) => prev.map((item) => (item.item_id === editingId ? { ...item, ...updatedMenuItem } : item)));
        } else {
          setMenuItems((prev) => prev.map((item) => (item.item_id === editingId ? { ...item, ...result, item_image_url: itemImageUrl } : item)));
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

  async function handleStockToggle() {
    if (!stockToggleItem || !storeId) return;

    setIsTogglingStock(true);
    try {
      const res = await fetch('/api/merchant/menu-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: stockToggleItem.item_id,
          storeId,
          in_stock: stockToggleItem.newStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to update stock');
      }
      setMenuItems((prev) =>
        prev.map((item) =>
          item.item_id === stockToggleItem.item_id
            ? { ...item, in_stock: stockToggleItem.newStatus }
            : item
        )
      );
      setShowStockModal(false);
      setStockToggleItem(null);
      toast.success(`Item marked as ${stockToggleItem.newStatus ? 'In Stock' : 'Out of Stock'}!`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error updating stock status.';
      toast.error(message);
    } finally {
      setIsTogglingStock(false);
    }
  }

  // Calculate stats
  const inStock = menuItems.filter(item => item.in_stock).length;
  const outStock = menuItems.filter(item => !item.in_stock).length;
  const outStockPercent = menuItems.length ? Math.round((outStock / menuItems.length) * 100) : 0;

  // Filter items by selected category
  const filteredItems = selectedCategoryId === null
    ? menuItems
    : menuItems.filter(item => item.category_id === selectedCategoryId);

  // Filter by search term
  const searchedItems = searchTerm
    ? filteredItems.filter(item => 
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.item_description && item.item_description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : filteredItems;

  // Plan-driven: no hardcoding. When planLimits is null (no plan) = no restrictions
  const canAddItem = planLimits == null || planLimits.maxMenuItems == null || menuItems.length < planLimits.maxMenuItems;
  const canAddCategory = planLimits == null || planLimits.maxMenuCategories == null || categories.length < planLimits.maxMenuCategories;
  // Image count from server-side API (accurate); fallback to client status for backward compat
  const imageUsed = storeImageCount?.totalUsed ?? imageUploadStatus?.totalUsed ?? 0;
  const imageLimit = planLimits?.maxImageUploads ?? null;
  const imageUploadAllowed = planLimits == null || planLimits.imageUploadAllowed === true;
  const imageLimitReached = planLimits != null && imageLimit != null && imageUsed >= imageLimit;
  const imageSlotsLeft = imageLimit != null ? Math.max(0, imageLimit - imageUsed) : null;

  // Show error if no store is selected
  if (storeError) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name || "Unknown Store"} restaurantId={storeId || "No ID"}>
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
    <MXLayoutWhite restaurantName={store?.store_name || "Loading..."} restaurantId={storeId || "No ID"}>
      <Toaster richColors position="top-right" style={{ zIndex: 100002 }} />
      <style>{globalStyles}</style>
      
      {/* Header - compact */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-2 gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
            <MobileHamburgerButton />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-gray-900">Menu Management</h1>
              <p className="text-gray-500 text-xs mt-0 flex items-center gap-2 flex-wrap">
                <span>Manage your menu items and categories</span>
                {planLimits?.planName != null && planLimits.planName !== '' && (
                  <span className="text-gray-400">· Plan: {planLimits.planName}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                if (!canAddCategory) return;
                setCategoryModalMode('add');
                setCategoryForm({
                  category_name: '',
                  is_active: true,
                });
                setShowCategoryModal(true);
              }}
              disabled={!canAddCategory}
              title={!canAddCategory ? `Category limit reached (${planLimits?.maxMenuCategories ?? 0})` : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${canAddCategory ? 'bg-white text-orange-600 border border-orange-600 hover:bg-orange-50' : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'}`}
            >
              <Plus size={16} />
              Add Category
              {planLimits?.maxMenuCategories != null && (
                <span className="text-xs opacity-80">({categories.length}/{planLimits.maxMenuCategories})</span>
              )}
            </button>
            <button
              onClick={() => {
                if (canAddItem) {
                  setAddItemSaved(null);
                  refetchImageCount();
                  setShowAddModal(true);
                }
              }}
              disabled={!canAddItem}
              title={!canAddItem ? `Menu item limit reached (${planLimits?.maxMenuItems ?? 0})` : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${canAddItem ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
            >
              <Plus size={16} />
              Add Menu Item
              {planLimits?.maxMenuItems != null && (
                <span className="text-xs opacity-90">({menuItems.length}/{planLimits.maxMenuItems})</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMenuFileSection(true);
                setTimeout(() => menuFileSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-amber-600 text-amber-700 bg-white hover:bg-amber-50 transition-colors"
            >
              <Upload size={16} />
              Menu file
            </button>
          </div>
        </div>
        {/* Stats - compact row */}
        <div className="flex flex-wrap gap-2 px-3 sm:px-4 pb-2">
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 min-w-[100px]">
            <div className="text-gray-500 text-xs font-medium">
              Total Items
              {planLimits?.maxMenuItems != null && (
                <span className="ml-1 text-gray-400">/ {planLimits.maxMenuItems}</span>
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
            <div className="text-lg font-bold text-red-600 leading-tight">{outStock} ({outStockPercent}%)</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 min-w-[100px]">
            <div className="text-gray-500 text-xs font-medium">
              Categories
              {planLimits?.maxMenuCategories != null && (
                <span className="ml-1 text-gray-400">/ {planLimits.maxMenuCategories}</span>
              )}
            </div>
            <div className="text-lg font-bold text-blue-600 leading-tight">{categories.length}</div>
          </div>
        </div>

        {/* Menu file (CSV or image) – card shown when "Menu file" button clicked; clear Close button */}
        {showMenuFileSection && (
        <div ref={menuFileSectionRef} className="mx-3 sm:mx-4 mb-3 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-orange-50/80 shadow-sm overflow-hidden">
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
          {(existingMenuSpreadsheetUrl || existingMenuImageUrls.length > 0) && (
            <div className="mb-4 p-3 rounded-xl bg-white/70 border border-amber-100">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Current file from onboarding</p>
              <div className="flex flex-wrap gap-2 items-center">
                {existingMenuSpreadsheetUrl && (
                  <span className="inline-flex items-center gap-2 flex-wrap">
                    <a
                      href={existingMenuSpreadsheetUrl.startsWith('http') ? existingMenuSpreadsheetUrl : (typeof window !== 'undefined' ? window.location.origin : '') + existingMenuSpreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-amber-200 text-sm font-medium text-amber-800 hover:bg-amber-50 hover:border-amber-300 transition-colors shadow-sm"
                    >
                      <FileText size={16} />
                      {existingMenuSpreadsheetFileName || 'View spreadsheet'}
                    </a>
                    {menuSpreadsheetVerificationStatus === 'PENDING' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                        Pending verification
                      </span>
                    )}
                    {menuSpreadsheetVerificationStatus === 'VERIFIED' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                        Verified
                      </span>
                    )}
                  </span>
                )}
                {existingMenuImageUrls.map((url, i) => (
                  <span key={i} className="inline-flex items-center gap-2">
                    <a
                      href={url.startsWith('http') ? url : (typeof window !== 'undefined' ? window.location.origin : '') + url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-amber-200 text-sm font-medium text-amber-800 hover:bg-amber-50 hover:border-amber-300 transition-colors shadow-sm"
                    >
                      <ImageIcon size={16} />
                      {existingMenuImageFileNames[i] || `Image ${i + 1}`}
                    </a>
                    {menuImageVerificationStatuses[i] === 'PENDING' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                        Pending
                      </span>
                    )}
                    {menuImageVerificationStatuses[i] === 'VERIFIED' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                        Verified
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMenuUploadMode('csv'); setMenuFile(null); setCsvValidationError(''); setMenuReplaceError(''); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${menuUploadMode === 'csv' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                Upload CSV
              </button>
              <button
                type="button"
                onClick={() => { setMenuUploadMode('image'); setMenuFile(null); setMenuReplaceError(''); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${menuUploadMode === 'image' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                Upload image
              </button>
            </div>
            {menuUploadMode && (
              <>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                  <Upload size={18} />
                  {menuFile ? menuFile.name : 'Choose file'}
                  <input
                    type="file"
                    accept={menuUploadMode === 'csv' ? '.csv,text/csv,application/csv' : 'image/*'}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setMenuFile(f || null);
                      setCsvValidationError('');
                      setMenuReplaceError('');
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleMenuFileUpload}
                  disabled={!menuFile || menuUploading}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-colors"
                >
                  {menuUploading ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    'Replace menu file'
                  )}
                </button>
              </>
            )}
          </div>
          {menuUploadMode === 'csv' && (
            <p className="text-xs text-gray-500 mt-3">
              CSV format: header row with at least <strong>item_name</strong> (or name) and <strong>price</strong> (or base_price / selling_price). Min {MENU_CSV_MIN_ROWS} row(s), max {MENU_CSV_MAX_ROWS} rows.
            </p>
          )}
          {(csvValidationError || menuReplaceError) && (
            <p className="text-sm text-red-600 mt-2" role="alert">{csvValidationError || menuReplaceError}</p>
          )}
          </div>
        </div>
        )}

        {/* Search and Categories - single row, sticky All + horizontal scroll */}
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
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${selectedCategoryId === null ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'}`}
            >
              All Categories
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-hidden">
              {categories.length > 0 && (
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
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategoryId(category.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap max-w-[140px] truncate ${selectedCategoryId === category.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
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

      {/* Menu Items Grid */}
      <div className="px-3 sm:px-4 py-3 relative">
        {isLoading ? (
          <MenuItemsGridSkeleton />
        ) : (searchedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package size={48} className="text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-700">No menu items found</h3>
            <p className="text-gray-500 mt-2">
              {searchTerm ? 'Try a different search term' : 'Add your first menu item to get started'}
            </p>
            {categories.length === 0 && (
              <p className="text-sm text-gray-400 mt-2">You need to create a category first</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {searchedItems.map((item) => {
              const category = categories.find(cat => cat.id === item.category_id);
              const discount = Number(item.discount_percentage);
              const hasDiscount = discount > 0;
              
              return (
                <div key={item.item_id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
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
                          <div className="font-bold text-sm text-gray-900 truncate">
                            {item.item_name}
                          </div>
                          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
                            {category?.category_name || 'Uncategorized'}
                          </div>
                        </div>
                        <label className="inline-flex items-center cursor-pointer flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={item.in_stock}
                            onChange={() => {
                              setStockToggleItem({ item_id: item.item_id, newStatus: !item.in_stock });
                              setShowStockModal(true);
                            }}
                            className="sr-only peer"
                          />
                          <div className={`w-7 h-4 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative`}>
                            <div className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${item.in_stock ? 'translate-x-3' : ''}`}></div>
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
        ))}
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
            setAddForm({
              item_name: '', item_description: '', item_image_url: '', image: null,
              food_type: '', spice_level: '', cuisine_type: '', base_price: '', selling_price: '',
              discount_percentage: '0', tax_percentage: '5', in_stock: true, available_quantity: '',
              low_stock_threshold: '', has_customizations: false, has_addons: false, has_variants: false,
              is_popular: false, is_recommended: false, preparation_time_minutes: 15, serves: 1,
              is_active: true, allergens: '', category_id: null, customizations: [], variants: [],
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
              onSubmitOptions={handleAddSubmitOptions}
              imageUploadAllowed={imageUploadAllowed}
              imageLimitReached={imageLimitReached}
              imageUsed={imageUsed}
              imageLimit={imageLimit}
              imageSlotsLeft={imageSlotsLeft}
              maxCuisinesPerItem={planLimits?.maxCuisinesPerItem ?? null}
              imageValidationError={addImageValidationError}
              imageValidating={addImageValidating}
              onCancel={() => {
                setAddItemSaved(null);
                setShowAddModal(false);
                setAddImageValidationError('');
                setAddImageValidating(false);
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
                  tax_percentage: '5',
                  in_stock: true,
                  available_quantity: '',
                  low_stock_threshold: '',
                  has_customizations: false,
                  has_addons: false,
                  has_variants: false,
                  is_popular: false,
                  is_recommended: false,
                  preparation_time_minutes: 15,
                  serves: 1,
                  is_active: true,
                  allergens: '',
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
            />
          </div>
        </div>,
        document.body
      )}

      {/* Edit Item Modal */}
      {showEditModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md" onClick={() => setShowEditModal(false)}>
          <div onClick={e => e.stopPropagation()}>
            <ItemForm
              isEdit={true}
              formData={editForm}
              setFormData={setEditForm}
              imagePreview={editImagePreview}
              setImagePreview={setEditImagePreview}
              onProcessImage={(file) => processImageFile(file, true)}
              onSaveAndNext={handleEditSaveAndNext}
              onSubmitOptions={handleEditSubmitOptions}
              imageUploadAllowed={imageUploadAllowed}
              imageLimitReached={imageLimitReached}
              imageUsed={imageUsed}
              imageLimit={imageLimit}
              imageSlotsLeft={imageSlotsLeft}
              maxCuisinesPerItem={planLimits?.maxCuisinesPerItem ?? null}
              imageValidationError={editImageValidationError}
              imageValidating={editImageValidating}
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
                  tax_percentage: '5',
                  in_stock: true,
                  available_quantity: '',
                  low_stock_threshold: '',
                  has_customizations: false,
                  has_addons: false,
                  has_variants: false,
                  is_popular: false,
                  is_recommended: false,
                  preparation_time_minutes: 15,
                  serves: 1,
                  is_active: true,
                  allergens: '',
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
            />
          </div>
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

      {/* Stock Toggle Confirmation Modal */}
      {showStockModal && stockToggleItem && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/40 backdrop-blur-md">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="text-center">
                <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${stockToggleItem.newStatus ? 'bg-green-100' : 'bg-red-100'} mb-4`}>
                  {stockToggleItem.newStatus ? (
                    <div className="h-6 w-6 text-green-600">✓</div>
                  ) : (
                    <div className="h-6 w-6 text-red-600">✗</div>
                  )}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {stockToggleItem.newStatus ? 'Mark as In Stock' : 'Mark as Out of Stock'}
                </h3>
                <p className="text-gray-600 mb-6">
                  {stockToggleItem.newStatus 
                    ? 'This item will be available for customers to order.' 
                    : 'This item will be hidden from customers and marked as unavailable.'}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowStockModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-all"
                  disabled={isTogglingStock}
                >
                  Cancel
                </button>
                <button
                  onClick={handleStockToggle}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-bold text-white transition-all ${
                    stockToggleItem.newStatus 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : 'bg-red-500 hover:bg-red-600'
                  }`}
                  disabled={isTogglingStock}
                >
                  {isTogglingStock ? 'Updating...' : 'Confirm'}
                </button>
              </div>
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
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {categoryModalMode === 'add' ? 'Add New Category' : 'Edit Category'}
                </h2>
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setCategoryForm({ category_name: '', is_active: true });
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category Name * (max 30 characters)</label>
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
                    placeholder="Start typing for suggestions..."
                  />
                  {(categoryForm.category_name?.length ?? 0) > 0 && (
                    <span className="absolute right-3 top-9 text-xs text-gray-400">{(categoryForm.category_name?.length ?? 0)}/30</span>
                  )}
                  {categorySuggestionsOpen && (
                    <div className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                      {(() => {
                        const q = (categoryForm.category_name ?? '').toLowerCase().trim();
                        const matched = q.length === 0
                          ? CATEGORY_SUGGESTIONS.slice(0, 12)
                          : CATEGORY_SUGGESTIONS.filter(c => c.toLowerCase().includes(q)).slice(0, 12);
                        const exactMatch = q && CATEGORY_SUGGESTIONS.some(c => c.toLowerCase() === q);
                        return (
                          <>
                            {matched.map((s) => (
                              <button
                                key={s}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-orange-50"
                                onMouseDown={(e) => { e.preventDefault(); setCategoryForm({ ...categoryForm, category_name: s }); setCategorySuggestionsOpen(false); }}
                              >
                                {s}
                              </button>
                            ))}
                            {q && !exactMatch && (
                              <div className="border-t border-gray-100 mt-1 pt-1">
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm text-orange-600 font-medium hover:bg-orange-50"
                                  onMouseDown={(e) => { e.preventDefault(); setCategorySuggestionsOpen(false); }}
                                >
                                  Add &quot;{categoryForm.category_name}&quot; as custom category
                                </button>
                              </div>
                            )}
                            {matched.length === 0 && !q && (
                              <p className="px-3 py-2 text-sm text-gray-500">Start typing to see suggestions</p>
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
                  {categoryLoading ? 'Saving...' : (categoryModalMode === 'add' ? 'Add Category' : 'Save Changes')}
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

// Export a Suspense-wrapped page for Next.js app directory compliance
export default function MenuPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center">Loading...</div>}>
      <MenuContent />
    </Suspense>
  );
}