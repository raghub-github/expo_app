"use client";

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
  food_type?: string;
  spice_level?: string;
  cuisine_type?: string;
  display_order?: number;
  is_active?: boolean;
  store_id?: number;
  item_metadata?: any;
  nutritional_info?: any;
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
import { useSearchParams } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import { Plus, Edit2, Trash2, X, Upload, Package, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { 
  fetchStoreById, 
  fetchStoreByName, 
  fetchMenuItems, 
  createMenuItem, 
  updateMenuItem, 
  updateMenuItemStock, 
  deleteMenuItem, 
  getImageUploadStatus, 
  fetchMenuCategories, 
  createMenuCategory, 
  updateMenuCategory, 
  deleteMenuCategory
} from '@/lib/database'

// --- Menu Category interface ---
type MerchantStore = {
  store_id: string;
  store_name: string;
};

interface MenuCategory {
  id: number;
  store_id: number;
  category_name: string;
  category_description?: string;
  category_image_url?: string;
  display_order?: number;
  is_active?: boolean;
  category_metadata?: any;
  created_at?: string;
  updated_at?: string;
}

interface ItemFormProps {
  isEdit?: boolean;
  formData: any;
  setFormData: (data: any) => void;
  imagePreview: string;
  setImagePreview: (url: string) => void;
  onProcessImage: (file: File, isEdit: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string;
  title: string;
  categories: MenuCategory[];
  currentItemId?: string;
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
const CUISINE_TYPES = ['Indian', 'Chinese', 'Italian', 'Mexican', 'Continental', 'Thai', 'Japanese', 'American', 'Other'];

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
    onSubmit,
    onCancel,
    isSaving,
    error,
    title,
    categories,
    currentItemId
  } = props;

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

  const [activeTab, setActiveTab] = useState<'basic' | 'pricing' | 'customization' | 'advanced'>('basic');
  const [showFoodDropdown, setShowFoodDropdown] = useState(false);
  const [customizations, setCustomizations] = useState<Customization[]>(formData.customizations || []);
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
    if (file) {
      onProcessImage(file, isEdit);
    }
  };

  const handleAddCustomization = () => {
    if (!newCustomization.customization_title.trim()) {
      toast.error('Customization title is required');
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
    const updatedCustomizations = customizations.filter((_, i) => i !== index);
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
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-2 md:mx-0 p-0 border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-gray-900">{title}</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5">
            {isEdit ? `Editing: ${currentItemId}` : 'Enter details for the menu item'}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          tabIndex={0}
          aria-label="Close"
        >
          <X size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex px-5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'basic' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Basic Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'pricing' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Pricing & Stock
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('customization')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'customization' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Customizations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('advanced')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'advanced' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Form Content */}
      <form 
        className="px-5 py-4 max-h-[70vh] overflow-y-auto" 
        autoComplete="off" 
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      >
        {activeTab === 'basic' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Item Name */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Item Name *</label>
                <input
                  type="text"
                  placeholder="Enter item name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.item_name}
                  onChange={e => setFormData({ ...formData, item_name: e.target.value })}
                  required
                />
              </div>
              
              {/* Category (dropdown, required) */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Category *</label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.category_id ?? ''}
                  onChange={e => setFormData({ ...formData, category_id: e.target.value ? Number(e.target.value) : null })}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((cat: MenuCategory) => (
                    <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                  ))}
                </select>
              </div>
              
              {/* Food Type */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Food Type</label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.food_type || ''}
                  onChange={e => setFormData({ ...formData, food_type: e.target.value })}
                >
                  <option value="">Select food type</option>
                  {FOOD_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              
              {/* Spice Level */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Spice Level</label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.spice_level || ''}
                  onChange={e => setFormData({ ...formData, spice_level: e.target.value })}
                >
                  <option value="">Select spice level</option>
                  {SPICE_LEVELS.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              
              {/* Cuisine Type */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Cuisine Type</label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.cuisine_type || ''}
                  onChange={e => setFormData({ ...formData, cuisine_type: e.target.value })}
                >
                  <option value="">Select cuisine type</option>
                  {CUISINE_TYPES.map(cuisine => (
                    <option key={cuisine} value={cuisine}>{cuisine}</option>
                  ))}
                </select>
              </div>
              
              {/* Display Order */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Display Order</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.display_order || 0}
                  onChange={e => setFormData({ ...formData, display_order: Number(e.target.value) })}
                />
              </div>
            </div>
            
            {/* Image Upload */}
            <div className="flex flex-col gap-2 mt-4">
              <label className="text-xs font-semibold text-gray-700">Item Image (Optional)</label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden">
                  {imagePreview ? (
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={32} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1">
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer transition-colors">
                    <Upload size={16} />
                    <span className="text-sm font-medium">{imagePreview ? 'Change Image' : 'Upload Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-2">Recommended: 1:1 ratio, max 2MB</p>
                </div>
              </div>
            </div>
            
            {/* Item Description */}
            <div className="flex flex-col gap-2 mt-4">
              <label className="text-xs font-semibold text-gray-700">Item Description</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                value={formData.item_description || ''}
                onChange={e => setFormData({ ...formData, item_description: e.target.value })}
                placeholder="Enter item description (optional)"
                rows={3}
              />
            </div>
            
            {/* Allergens */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-700">Allergens (comma separated)</label>
              <input
                type="text"
                placeholder="e.g., Nuts, Dairy, Gluten"
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                value={formData.allergens || ''}
                onChange={e => setFormData({ ...formData, allergens: e.target.value })}
              />
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Base Price */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Base Price (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`w-full px-3 py-2 border rounded-md focus:ring-1 text-sm ${
                    isBasePriceInvalid 
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100' 
                      : 'border-gray-200 focus:border-orange-400 focus:ring-orange-100'
                  }`}
                  value={formData.base_price}
                  onChange={e => setFormData({ ...formData, base_price: e.target.value })}
                  required
                />
                {isBasePriceInvalid && (
                  <span className="text-xs text-red-500">Base price must be greater than 0</span>
                )}
              </div>
              
              {/* Selling Price */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Selling Price (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`w-full px-3 py-2 border rounded-md focus:ring-1 text-sm ${
                    isSellingPriceInvalid 
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100' 
                      : 'border-gray-200 focus:border-orange-400 focus:ring-orange-100'
                  }`}
                  value={formData.selling_price}
                  readOnly
                  required
                />
                {isSellingPriceInvalid && (
                  <span className="text-xs text-red-500">Selling price must be greater than 0</span>
                )}
              </div>
              
              {/* Discount Percentage */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Discount (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={`w-full px-3 py-2 border rounded-md focus:ring-1 text-sm ${
                    isOfferPercentInvalid 
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100' 
                      : 'border-gray-200 focus:border-orange-400 focus:ring-orange-100'
                  }`}
                  value={formData.discount_percentage}
                  onChange={e => setFormData({ ...formData, discount_percentage: e.target.value })}
                />
                {isOfferPercentInvalid && (
                  <span className="text-xs text-red-500">Enter a valid discount percentage (0-100)</span>
                )}
              </div>
              
              {/* Tax Percentage */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Tax (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={`w-full px-3 py-2 border rounded-md focus:ring-1 text-sm ${
                    isTaxPercentInvalid 
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100' 
                      : 'border-gray-200 focus:border-orange-400 focus:ring-orange-100'
                  }`}
                  value={formData.tax_percentage}
                  onChange={e => setFormData({ ...formData, tax_percentage: e.target.value })}
                />
                {isTaxPercentInvalid && (
                  <span className="text-xs text-red-500">Enter a valid tax percentage (0-100)</span>
                )}
              </div>
              
              {/* Available Quantity */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Available Quantity</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.available_quantity || ''}
                  onChange={e => setFormData({ ...formData, available_quantity: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              
              {/* Low Stock Threshold */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Low Stock Threshold</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.low_stock_threshold || ''}
                  onChange={e => setFormData({ ...formData, low_stock_threshold: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              
              {/* Preparation Time */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Preparation Time (minutes)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.preparation_time_minutes || 15}
                  onChange={e => setFormData({ ...formData, preparation_time_minutes: Number(e.target.value) })}
                />
              </div>
              
              {/* Serves */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Serves (persons)</label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm text-gray-900"
                  value={formData.serves || 1}
                  onChange={e => setFormData({ ...formData, serves: Number(e.target.value) })}
                />
              </div>
            </div>
            
            {/* In Stock Toggle */}
            <div className="flex items-center gap-3 mt-4">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.in_stock}
                  onChange={e => setFormData({ ...formData, in_stock: e.target.checked })}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative`}>
                  <div className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${formData.in_stock ? 'translate-x-5' : ''}`}></div>
                </div>
              </label>
              <span className="text-sm font-medium text-gray-700">In Stock</span>
            </div>
          </div>
        )}

        {activeTab === 'customization' && (
          <div className="space-y-6">
            {/* Add/Edit Customization Form */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                {editingCustomizationIndex !== null ? 'Edit Customization' : 'Add New Customization'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Title *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                    value={newCustomization.customization_title}
                    onChange={e => setNewCustomization({...newCustomization, customization_title: e.target.value})}
                    placeholder="e.g., Choose Size, Select Toppings"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Type</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                    value={newCustomization.customization_type}
                    onChange={e => setNewCustomization({...newCustomization, customization_type: e.target.value})}
                  >
                    {CUSTOMIZATION_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Min Selection</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                    value={newCustomization.min_selection}
                    onChange={e => setNewCustomization({...newCustomization, min_selection: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Max Selection</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                    value={newCustomization.max_selection}
                    onChange={e => setNewCustomization({...newCustomization, max_selection: Number(e.target.value)})}
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newCustomization.is_required}
                        onChange={e => setNewCustomization({...newCustomization, is_required: e.target.checked})}
                        className="h-4 w-4"
                      />
                      <span className="text-sm text-gray-700">Required</span>
                    </label>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Display Order</label>
                      <input
                        type="number"
                        min="0"
                        className="w-20 px-3 py-2 border border-gray-200 rounded-md text-sm"
                        value={newCustomization.display_order}
                        onChange={e => setNewCustomization({...newCustomization, display_order: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleAddCustomization}
                  className="px-4 py-2 bg-orange-500 text-white rounded-md text-sm font-medium hover:bg-orange-600"
                >
                  {editingCustomizationIndex !== null ? 'Update' : 'Add'} Customization
                </button>
                {editingCustomizationIndex !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewCustomization({
                        customization_title: '',
                        customization_type: 'Checkbox',
                        is_required: false,
                        min_selection: 0,
                        max_selection: 1,
                        display_order: customizations.length
                      });
                      setEditingCustomizationIndex(null);
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            {/* Customizations List */}
            {customizations.length > 0 ? (
              <div className="space-y-4">
                {customizations.map((cust, custIndex) => (
                  <div key={custIndex} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium text-gray-900">{cust.customization_title}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                            {cust.customization_type}
                          </span>
                          {cust.is_required && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                              Required
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            Select: {cust.min_selection}-{cust.max_selection}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditCustomization(custIndex)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomization(custIndex)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Addons for this customization */}
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-sm font-medium text-gray-700">Addons</h5>
                        <button
                          type="button"
                          onClick={() => handleAddAddon(custIndex)}
                          className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                        >
                          + Add Addon
                        </button>
                      </div>
                      {cust.addons && cust.addons.length > 0 ? (
                        <div className="space-y-2">
                          {cust.addons.map((addon, addonIndex) => (
                            <div key={addonIndex} className="flex items-center justify-between bg-white border rounded-md p-2">
                              <div className="flex-1">
                                <input
                                  type="text"
                                  className="w-full px-2 py-1 border-0 focus:ring-0 text-sm"
                                  value={addon.addon_name}
                                  onChange={e => handleUpdateAddon(custIndex, addonIndex, 'addon_name', e.target.value)}
                                  placeholder="Addon name"
                                />
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center">
                                  <span className="text-sm text-gray-500 mr-1">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-20 px-2 py-1 border rounded text-sm"
                                    value={addon.addon_price}
                                    onChange={e => handleUpdateAddon(custIndex, addonIndex, 'addon_price', Number(e.target.value))}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAddon(custIndex, addonIndex)}
                                  className="p-1 text-red-500 hover:text-red-700"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No addons added yet</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No customizations added yet.</p>
                <p className="text-sm mt-1">Add customizations like sizes, toppings, or addons.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Popular & Recommended Toggles */}
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.is_popular}
                    onChange={e => setFormData({ ...formData, is_popular: e.target.checked })}
                    className="h-4 w-4 text-orange-500 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Mark as Popular</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.is_recommended}
                    onChange={e => setFormData({ ...formData, is_recommended: e.target.checked })}
                    className="h-4 w-4 text-orange-500 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Mark as Recommended</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.has_customizations}
                    onChange={e => setFormData({ ...formData, has_customizations: e.target.checked })}
                    className="h-4 w-4 text-orange-500 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Has Customizations</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.has_variants}
                    onChange={e => setFormData({ ...formData, has_variants: e.target.checked })}
                    className="h-4 w-4 text-orange-500 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Has Variants</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 text-orange-500 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Active (Visible to customers)</span>
                </label>
              </div>
              
              {/* Metadata JSON (optional) */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">Item Metadata (JSON)</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm font-mono"
                  value={formData.item_metadata ? JSON.stringify(formData.item_metadata, null, 2) : ''}
                  onChange={e => {
                    try {
                      const value = e.target.value.trim();
                      const metadata = value ? JSON.parse(value) : null;
                      setFormData({ ...formData, item_metadata: metadata });
                    } catch {
                      // Keep as is if invalid JSON
                    }
                  }}
                  placeholder='{"key": "value"}'
                  rows={6}
                />
                <p className="text-xs text-gray-500">Optional JSON metadata for extended properties</p>
              </div>
            </div>
            
            {/* Nutritional Info JSON (optional) */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-700">Nutritional Information (JSON)</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-sm font-mono"
                value={formData.nutritional_info ? JSON.stringify(formData.nutritional_info, null, 2) : ''}
                onChange={e => {
                  try {
                    const value = e.target.value.trim();
                    const nutritional = value ? JSON.parse(value) : null;
                    setFormData({ ...formData, nutritional_info: nutritional });
                  } catch {
                    // Keep as is if invalid JSON
                  }
                }}
                placeholder='{"calories": 500, "protein": "20g", "carbs": "60g"}'
                rows={4}
              />
              <p className="text-xs text-gray-500">Optional nutritional information in JSON format</p>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200">
          <button
            type="button"
            className="px-4 py-2 rounded-lg font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-all"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all disabled:opacity-60"
              disabled={
                isSaving ||
                isOfferPercentInvalid ||
                isTaxPercentInvalid ||
                isBasePriceInvalid ||
                isSellingPriceInvalid ||
                !formData.base_price ||
                !formData.discount_percentage ||
                !formData.tax_percentage ||
                !formData.selling_price
              }
            >
              {isSaving ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save Changes' : 'Add Item')}
            </button>
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
    category_description: '', 
    display_order: 0, 
    is_active: true,
    category_metadata: {}
  });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

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
    serves: 1,
    display_order: 0,
    is_active: true,
    allergens: '',
    category_id: null as number | null,
    customizations: [] as Customization[],
    item_metadata: {},
    nutritional_info: {}
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
    preparation_time_minutes: 15,
    serves: 1,
    display_order: 0,
    is_active: true,
    allergens: '',
    category_id: null as number | null,
    customizations: [] as Customization[],
    item_metadata: {},
    nutritional_info: {}
  });

  const [imagePreview, setImagePreview] = useState('');
  const [editImagePreview, setEditImagePreview] = useState('');
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stockToggleItem, setStockToggleItem] = useState<{ item_id: string; newStatus: boolean } | null>(null);
  const [isTogglingStock, setIsTogglingStock] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMenuItemId, setEditingMenuItemId] = useState<number | null>(null);

  const [imageUploadStatus, setImageUploadStatus] = useState<any>(null);
  const [storeError, setStoreError] = useState<string | null>(null);

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
        
        const items = await fetchMenuItems(storeId);
        setMenuItems(items);

        const status = await getImageUploadStatus(storeId);
        setImageUploadStatus(status);
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
    if (!categoryForm.category_name?.trim()) {
      setCategoryError('Category name is required');
      return;
    }
    setCategoryLoading(true);
    try {
      if (categoryModalMode === 'add') {
        const newCat = await createMenuCategory(storeId!, categoryForm);
        if (newCat) setCategories((prev) => [...prev, newCat]);
      } else if (categoryModalMode === 'edit' && editingCategoryId) {
        const updated = await updateMenuCategory(editingCategoryId, categoryForm);
        if (updated) setCategories((prev) => prev.map((cat) => cat.id === editingCategoryId ? updated : cat));
      }
      setShowCategoryModal(false);
      setCategoryForm({ category_name: '', category_description: '', display_order: 0, is_active: true, category_metadata: {} });
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
        toast.success('Category deleted successfully');
      }
    } catch {
      toast.error('Error deleting category');
    }
    setCategoryLoading(false);
  };

  const processImageFile = (file: File, isEdit: boolean = false) => {
    const canAddImage = !imageUploadStatus || imageUploadStatus.totalUsed < 10;
    if (!canAddImage && !addForm.item_image_url) {
      toast.error('Image upload limit reached. Please upgrade your subscription.');
      return;
    }

    // Show local preview immediately
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

    // Save file for upload
    if (isEdit) {
      setEditForm(prev => ({ ...prev, image: file }));
    } else {
      setAddForm(prev => ({ ...prev, image: file }));
    }
  };

  async function handleAddItem() {
    if (!storeId) {
      toast.error('Please select a store first');
      return;
    }
    
    setAddError("");
    
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
      if (addForm.image) {
        // Upload image first
        const formData = new FormData();
        formData.append("file", addForm.image);
        formData.append("parent", "menuitems");
        
        const uploadRes = await fetch("/api/upload/r2", {
          method: "POST",
          body: formData,
        });
        
        if (!uploadRes.ok) {
          setAddError("Image upload failed.");
          setIsSaving(false);
          return;
        }
        
        const uploadData = await uploadRes.json();
        itemImageUrl = uploadData.url;
        setImagePreview(itemImageUrl);
      }

      // Prepare allergens as array
      const allergensArray = addForm.allergens 
        ? addForm.allergens.split(',').map((a: string) => a.trim()).filter(Boolean)
        : [];

      // Use a ref to persist counter across renders (could be replaced with a DB sequence in production)
      if (!window.menuItemIdCounterRef) {
        window.menuItemIdCounterRef = { current: 0 };
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
        display_order: addForm.display_order,
        is_active: addForm.is_active,
        allergens: allergensArray,
        category_id: addForm.category_id,
        customizations: addForm.customizations || [],
        item_metadata: addForm.item_metadata,
        nutritional_info: addForm.nutritional_info,
        restaurant_id: storeId,
      };

      const result = await createMenuItem(newItem);
      if (result && result.item_id) {
        setMenuItems((prev) => [result, ...prev]);
        setShowAddModal(false);
        
        // Reset form
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
          serves: 1,
          display_order: 0,
          is_active: true,
          allergens: '',
          category_id: null,
          customizations: [],
          item_metadata: {},
          nutritional_info: {}
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

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingId(item.item_id);
    setEditingMenuItemId(item.id);
    setEditImagePreview(item.item_image_url || '');
    
    // Prepare allergens as comma-separated string
    const allergensString = Array.isArray(item.allergens) 
      ? item.allergens.join(', ') 
      : (typeof item.allergens === 'string' ? item.allergens : '');
    
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
      tax_percentage: item.tax_percentage?.toString() || '0',
      in_stock: item.in_stock ?? true,
      available_quantity: item.available_quantity?.toString() || '',
      low_stock_threshold: item.low_stock_threshold?.toString() || '',
      has_customizations: item.has_customizations ?? false,
      has_addons: item.has_addons ?? false,
      has_variants: item.has_variants ?? false,
      is_popular: item.is_popular ?? false,
      is_recommended: item.is_recommended ?? false,
      preparation_time_minutes: item.preparation_time_minutes || 15,
      serves: item.serves || 1,
      display_order: item.display_order || 0,
      is_active: item.is_active ?? true,
      allergens: allergensString,
      category_id: item.category_id ?? null,
      customizations: item.customizations || [],
      item_metadata: item.item_metadata || {},
      nutritional_info: item.nutritional_info || {}
    });
    setShowEditModal(true);
  };

  async function handleSaveEdit() {
    setEditError("");
    
    if (!editingId || !editingMenuItemId) {
      setEditError("No item selected for editing.");
      return;
    }

    // Validation
    const itemName = (editForm.item_name ?? "").toString().trim();
    if (!itemName) return setEditError("Name is required");
    if (!editForm.category_id) return setEditError("Category is required");
    if (!editForm.base_price || isNaN(Number(editForm.base_price)) || Number(editForm.base_price) <= 0) 
      return setEditError("Valid base price is required (greater than 0)");
    if (!editForm.selling_price || isNaN(Number(editForm.selling_price)) || Number(editForm.selling_price) <= 0) 
      return setEditError("Valid selling price is required (greater than 0)");
    if (editForm.discount_percentage && (isNaN(Number(editForm.discount_percentage)) || Number(editForm.discount_percentage) < 0 || Number(editForm.discount_percentage) > 100)) {
      return setEditError("Discount % must be between 0 and 100");
    }
    if (editForm.tax_percentage && (isNaN(Number(editForm.tax_percentage)) || Number(editForm.tax_percentage) < 0 || Number(editForm.tax_percentage) > 100)) {
      return setEditError("Tax % must be between 0 and 100");
    }

    setIsSavingEdit(true);
    try {
      let itemImageUrl = editForm.item_image_url;
      if (editForm.image) {
        // Upload new image
        const formData = new FormData();
        formData.append("file", editForm.image);
        formData.append("parent", "menuitems");
        formData.append("menu_item_id", editingMenuItemId.toString());
        
        const uploadRes = await fetch("/api/upload/r2", {
          method: "POST",
          body: formData,
        });
        
        if (!uploadRes.ok) {
          setEditError("Image upload failed.");
          setIsSavingEdit(false);
          return;
        }
        
        const uploadData = await uploadRes.json();
        itemImageUrl = uploadData.url;
        setEditImagePreview(itemImageUrl);
      }

      // Prepare allergens as array
      const allergensArray = editForm.allergens 
        ? editForm.allergens.split(',').map((a: string) => a.trim()).filter(Boolean)
        : [];

      const hasCustomizations = Array.isArray(editForm.customizations) && editForm.customizations.length > 0;
      const hasAddons = Array.isArray(editForm.customizations) && 
        editForm.customizations.some((c: any) => Array.isArray(c.addons) && c.addons.length > 0);

      const updatedItem = {
        item_name: itemName,
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
        display_order: editForm.display_order,
        is_active: editForm.is_active,
        allergens: allergensArray,
        category_id: editForm.category_id,
        customizations: Array.isArray(editForm.customizations) ? editForm.customizations : [],
        item_metadata: editForm.item_metadata,
        nutritional_info: editForm.nutritional_info,
        restaurant_id: storeId,
      };

      const result = await updateMenuItem(editingId, updatedItem);
      if (result && result.success !== false) {
        // Fetch the updated item with customizations
        const updatedMenuItem = await fetchMenuItems(storeId!).then(items => 
          items.find(item => item.item_id === editingId)
        );

        if (updatedMenuItem) {
          setMenuItems((prev) =>
            prev.map((item) =>
              item.item_id === editingId
                ? updatedMenuItem
                : item
            )
          );
        } else {
          // Fallback to updating with current data
          setMenuItems((prev) =>
            prev.map((item) =>
              item.item_id === editingId
                ? {
                    ...item,
                    ...updatedItem,
                    item_image_url: itemImageUrl,
                    base_price: Number(updatedItem.base_price),
                    selling_price: Number(updatedItem.selling_price),
                    discount_percentage: Number(updatedItem.discount_percentage),
                    tax_percentage: Number(updatedItem.tax_percentage),
                    available_quantity: updatedItem.available_quantity !== null && updatedItem.available_quantity !== undefined ? Number(updatedItem.available_quantity) : undefined,
                    low_stock_threshold: updatedItem.low_stock_threshold !== null && updatedItem.low_stock_threshold !== undefined ? Number(updatedItem.low_stock_threshold) : undefined,
                    preparation_time_minutes: updatedItem.preparation_time_minutes,
                    serves: updatedItem.serves,
                    allergens: allergensArray,
                    display_order: updatedItem.display_order,
                    customizations: updatedItem.customizations
                  } as MenuItem
                : item
            )
          );
        }
        
        setShowEditModal(false);
        toast.success("Item updated successfully!");
      } else {
        setEditError("Failed to update item. Please try again.");
      }
    } catch (e) {
      console.error("Error updating item:", e);
      setEditError("Error updating item.");
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
    if (!stockToggleItem) return;
    
    setIsTogglingStock(true);
    try {
      const result = await updateMenuItemStock(stockToggleItem.item_id, stockToggleItem.newStatus);
      if (result) {
        setMenuItems(prev => prev.map(item =>
          item.item_id === stockToggleItem.item_id
            ? { ...item, in_stock: stockToggleItem.newStatus }
            : item
        ));
        setShowStockModal(false);
        setStockToggleItem(null);
        toast.success(`Item marked as ${stockToggleItem.newStatus ? 'In Stock' : 'Out of Stock'}!`);
      } else {
        toast.error('Failed to update stock status.');
      }
    } catch (error) {
      toast.error('Error updating stock status.');
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
      <Toaster richColors position="top-right" />
      <style>{globalStyles}</style>
      
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between px-6 py-4 gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Menu Management</h1>
            <p className="text-gray-600 text-sm mt-1">Manage your menu items and categories</p>
            {store && (
              <p className="text-sm text-gray-500 mt-1">Store: {store.store_name}</p>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setCategoryModalMode('add');
                setCategoryForm({ 
                  category_name: '', 
                  category_description: '', 
                  display_order: 0, 
                  is_active: true,
                  category_metadata: {}
                });
                setShowCategoryModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-orange-600 font-bold border border-orange-600 rounded-lg hover:bg-orange-50 transition-colors"
            >
              <Plus size={18} />
              Add Category
            </button>
            
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Plus size={18} />
              Add Menu Item
            </button>
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex flex-wrap gap-4 px-6 pb-4">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 min-w-[180px]">
            <div className="text-gray-500 text-sm font-medium">Total Items</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{menuItems.length}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 min-w-[180px]">
            <div className="text-gray-500 text-sm font-medium">In Stock</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{inStock}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 min-w-[180px]">
            <div className="text-gray-500 text-sm font-medium">Out of Stock</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{outStock} ({outStockPercent}%)</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 min-w-[180px]">
            <div className="text-gray-500 text-sm font-medium">Categories</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{categories.length}</div>
          </div>
        </div>
        
        {/* Search and Categories */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 pb-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder="Search menu items..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-gray-900"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="absolute right-3 top-3 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`px-4 py-2 rounded-lg font-medium text-sm ${selectedCategoryId === null ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              All Categories
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                className={`px-4 py-2 rounded-lg font-medium text-sm ${selectedCategoryId === category.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {category.category_name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Items Grid */}
      <div className="px-6 py-4 relative">
        {isLoading ? (
          <div className="w-full flex flex-col gap-8 animate-pulse">
            <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm min-h-[160px]">
                  <div className="flex p-3 h-full">
                    <div className="w-16 h-16 flex-shrink-0 mr-3 bg-gray-200 rounded-lg" />
                    <div className="flex-1 space-y-3 py-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                      <div className="h-3 bg-gray-100 rounded w-1/3" />
                      <div className="h-3 bg-gray-100 rounded w-1/4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                <div key={item.item_id} className="bg-white rounded-xl border border-gray-300 shadow-sm hover:shadow-md transition-shadow min-h-[160px]">
                  <div className="flex p-3 h-full">
                    <div className="w-16 h-16 flex-shrink-0 mr-3">
                      <img 
                        src={item.item_image_url && item.item_image_url !== '' ? item.item_image_url : '/placeholder.png'} 
                        alt={item.item_name} 
                        className="w-full h-full object-cover rounded-lg border border-gray-200" 
                      />
                    </div>
                    <div className="flex-1 flex flex-col min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-gray-900 truncate">
                            {item.item_name}
                          </div>
                          <div className="text-xs text-gray-500 font-bold uppercase tracking-wide mt-0.5">
                            {category?.category_name || 'Uncategorized'}
                          </div>
                        </div>
                        <label className="inline-flex items-center cursor-pointer ml-2 flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={item.in_stock}
                            onChange={() => {
                              setStockToggleItem({ item_id: item.item_id, newStatus: !item.in_stock });
                              setShowStockModal(true);
                            }}
                            className="sr-only peer"
                          />
                          <div className={`w-8 h-4.5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-all relative`}>
                            <div className={`absolute left-0.5 top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-md transition-transform ${item.in_stock ? 'translate-x-4' : ''}`}></div>
                          </div>
                        </label>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        {hasDiscount ? (
                          <>
                            <span className="text-base font-bold text-orange-700">₹{item.selling_price}</span>
                            <span className="text-sm font-semibold text-gray-500 line-through">₹{item.base_price}</span>
                            <span className="ml-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-bold">
                              {discount}% OFF
                            </span>
                          </>
                        ) : (
                          <span className="text-base font-bold text-orange-700">₹{item.selling_price}</span>
                        )}
                      </div>
                      {item.item_description && (
                        <p className="text-xs text-gray-600 line-clamp-2 mb-3 flex-grow">
                          {item.item_description}
                        </p>
                      )}
                      
                      {/* Indicators for item properties */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {item.is_popular && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded">
                            Popular
                          </span>
                        )}
                        {item.is_recommended && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
                            Recommended
                          </span>
                        )}
                        {item.has_customizations && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                            Customizable
                          </span>
                        )}
                        {item.has_variants && (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded">
                            Variants
                          </span>
                        )}
                        {item.food_type && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded">
                            {item.food_type}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-row gap-2 mt-3 w-full">
                        {Array.isArray(item.customizations) && item.customizations.length > 0 && (
                          <button
                            onClick={e => { e.stopPropagation(); setViewCustModal({ open: true, item }); }}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-100 text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-orange-50 transition-all text-xs whitespace-nowrap"
                            type="button"
                          >
                            View Options
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200 hover:bg-blue-100 transition-all text-xs whitespace-nowrap"
                        >
                          <Edit2 size={12} />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setDeleteItemId(item.item_id);
                            setShowDeleteModal(true);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 text-red-600 font-bold rounded-lg border border-red-200 hover:bg-red-100 transition-all text-xs whitespace-nowrap"
                        >
                          <Trash2 size={12} />
                          Delete
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

      {/* Modals */}
      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div onClick={e => e.stopPropagation()}>
            <ItemForm
              isEdit={false}
              formData={addForm}
              setFormData={setAddForm}
              imagePreview={imagePreview}
              setImagePreview={setImagePreview}
              onProcessImage={(file) => processImageFile(file, false)}
              onSubmit={handleAddItem}
              onCancel={() => {
                setShowAddModal(false);
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
                  serves: 1,
                  display_order: 0,
                  is_active: true,
                  allergens: '',
                  category_id: null,
                  customizations: [],
                  item_metadata: {},
                  nutritional_info: {}
                });
                setImagePreview('');
              }}
              isSaving={isSaving}
              error={addError}
              title="Add New Menu Item"
              categories={categories}
            />
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div onClick={e => e.stopPropagation()}>
            <ItemForm
              isEdit={true}
              formData={editForm}
              setFormData={setEditForm}
              imagePreview={editImagePreview}
              setImagePreview={setEditImagePreview}
              onProcessImage={(file) => processImageFile(file, true)}
              onSubmit={handleSaveEdit}
              onCancel={() => {
                setShowEditModal(false);
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
                  serves: 1,
                  display_order: 0,
                  is_active: true,
                  allergens: '',
                  category_id: null,
                  customizations: [],
                  item_metadata: {},
                  nutritional_info: {}
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
        </div>
      )}

      {/* View Customizations Modal */}
      {viewCustModal.open && viewCustModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewCustModal({ open: false, item: null })}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-2 p-0 border border-gray-100 relative animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-base md:text-lg font-bold text-gray-900">Customizations & Addons</h2>
              <button
                onClick={() => setViewCustModal({ open: false, item: null })}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                tabIndex={0}
                aria-label="Close"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {Array.isArray(viewCustModal.item.customizations) && viewCustModal.item.customizations.length > 0 ? (
                <div className="space-y-4">
                  {viewCustModal.item.customizations.map((group: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-gray-800 text-sm">{group.customization_title || group.title}</div>
                        <div className="flex gap-2">
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40">
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
        </div>
      )}

      {/* Stock Toggle Confirmation Modal */}
      {showStockModal && stockToggleItem && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40">
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
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {categoryModalMode === 'add' ? 'Add New Category' : 'Edit Category'}
                </h2>
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setCategoryForm({ 
                      category_name: '', 
                      category_description: '', 
                      display_order: 0, 
                      is_active: true,
                      category_metadata: {}
                    });
                    setEditingCategoryId(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category Name *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                    value={categoryForm.category_name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, category_name: e.target.value })}
                    placeholder="Enter category name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                    value={categoryForm.category_description || ''}
                    onChange={(e) => setCategoryForm({ ...categoryForm, category_description: e.target.value })}
                    placeholder="Enter category description"
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                      value={categoryForm.display_order || 0}
                      onChange={(e) => setCategoryForm({ ...categoryForm, display_order: Number(e.target.value) })}
                    />
                  </div>
                  
                  <div className="flex items-center justify-end">
                    <label className="flex items-center gap-2 mt-6">
                      <input
                        type="checkbox"
                        checked={categoryForm.is_active}
                        onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })}
                        className="h-4 w-4 text-orange-500 rounded"
                      />
                      <span className="text-sm text-gray-700">Active</span>
                    </label>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Metadata (JSON, Optional)</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100 font-mono text-sm"
                    value={categoryForm.category_metadata ? JSON.stringify(categoryForm.category_metadata, null, 2) : ''}
                    onChange={(e) => {
                      try {
                        const value = e.target.value.trim();
                        const metadata = value ? JSON.parse(value) : null;
                        setCategoryForm({ ...categoryForm, category_metadata: metadata });
                      } catch {
                        // Keep as is if invalid JSON
                      }
                    }}
                    placeholder='{"key": "value"}'
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional JSON metadata for extended properties</p>
                </div>
              </div>
              
              {categoryError && (
                <div className="mt-4 text-red-500 text-sm">{categoryError}</div>
              )}
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setCategoryForm({ 
                      category_name: '', 
                      category_description: '', 
                      display_order: 0, 
                      is_active: true,
                      category_metadata: {}
                    });
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
        </div>
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