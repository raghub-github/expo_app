'use client'

import React, { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { fetchStoreById, fetchStoreByName, fetchAllOffers, createOffer, updateOffer, deleteOffer, uploadOfferImage, fetchMenuItems } from '@/lib/database'
import { Plus, Edit2, Trash2, Zap, X, Calendar, Percent, DollarSign, Tag, Gift, User, Clock, ShoppingBag, CheckCircle, ChevronDown, Copy, Search, Check, Sparkles, ExternalLink, ChevronRight, Star, Shield, Award, Target, TrendingUp } from 'lucide-react'
import { Toaster, toast } from 'sonner'

export const dynamic = 'force-dynamic'

interface MerchantStore {
  id: string;
  store_name: string;
}

interface Offer {
  offer_id: string;
  store_id: number; // bigint
  offer_title: string;
  offer_description: string | null;
  offer_type: 'BUY_N_GET_M' | 'PERCENTAGE' | 'FLAT' | 'COUPON' | 'FREE_ITEM';
  offer_sub_type: 'ALL_ORDERS' | 'SPECIFIC_ITEM';
  menu_item_ids: string[] | null;
  discount_value: string | null; // numeric(10,2) comes as string
  min_order_amount: string | null; // numeric(10,2) comes as string
  buy_quantity: number | null;
  get_quantity: number | null;
  coupon_code: string | null;
  image_url: string | null;
  valid_from: string;
  valid_till: string;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

interface MenuItem {
  item_id: string;
  item_name: string;
  category_type: string;
  food_category_item: string;
  actual_price: number;
  in_stock: boolean;
}

function OffersContent() {
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [offers, setOffers] = useState<Offer[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  
  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'details' | 'validity'>('basic')
  
  // Form state - FIX: Use controlled components with proper state management
  const [formData, setFormData] = useState({
    offer_title: '',
    offer_description: '',
    offer_type: 'PERCENTAGE' as Offer['offer_type'],
    offer_sub_type: 'ALL_ORDERS' as Offer['offer_sub_type'],
    menu_item_ids: [] as string[],
    discount_value: '',
    min_order_amount: '',
    buy_quantity: '',
    get_quantity: '',
    valid_from: '',
    valid_till: ''
  })
  
  // Track if form is initialized from an existing offer
  const [formInitialized, setFormInitialized] = useState(false)
  
  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  
  // Dropdown states
  const [showOfferTypeDropdown, setShowOfferTypeDropdown] = useState(false)
  const [showApplyToDropdown, setShowApplyToDropdown] = useState(false)
  
  // Menu items search state
  const [menuItemSearch, setMenuItemSearch] = useState('')
  const [showMenuItemSuggestions, setShowMenuItemSuggestions] = useState(false)
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItem[]>([])
  
  // Coupon code state
  const [generatedCouponCode, setGeneratedCouponCode] = useState<string>('')
  const [isGeneratingCoupon, setIsGeneratingCoupon] = useState(false)
  
  // Refs for handling clicks outside
  const menuItemSuggestionsRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const modalContentRef = useRef<HTMLDivElement>(null)
  const offerTypeRef = useRef<HTMLDivElement>(null)
  const applyToRef = useRef<HTMLDivElement>(null)

  // FIX: Create controlled input handlers to prevent overwriting
  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }))
  }

  const handleNumberInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow empty string or valid numbers
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
  }

  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams.get('storeId')
      if (!id) id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null
      setStoreId(id)
    }
    getStoreId()
  }, [searchParams])

  useEffect(() => {
    if (!storeId) {
      setIsLoading(false)
      return
    }
    
    const loadData = async () => {
      setIsLoading(true)
      try {
        // Load store
        let storeData = await fetchStoreById(storeId)
        if (!storeData) {
          storeData = await fetchStoreByName(storeId)
        }
        setStore(storeData)

        // Load offers (all, not just active)
        const offersData = await fetchAllOffers(storeId)
        setOffers(offersData || [])
        
        // Load menu items for selection
        const items = await fetchMenuItems(storeId)
        setMenuItems(items || [])
        setFilteredMenuItems(items || [])
        
      } catch (error) {
        console.error('Error loading offers:', error)
        toast.error('Failed to load offers')
      } finally {
        setIsLoading(false)
      }
    }
    
    loadData()
  }, [storeId])

  // Filter menu items based on search
  useEffect(() => {
    if (menuItemSearch.trim() === '') {
      setFilteredMenuItems(menuItems)
    } else {
      const filtered = menuItems.filter(item =>
        item.item_name.toLowerCase().includes(menuItemSearch.toLowerCase())
      )
      setFilteredMenuItems(filtered)
    }
  }, [menuItemSearch, menuItems])

  // Handle clicks outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close offer type dropdown
      if (showOfferTypeDropdown && 
          offerTypeRef.current && 
          !offerTypeRef.current.contains(event.target as Node)) {
        setShowOfferTypeDropdown(false)
      }
      
      // Close apply to dropdown
      if (showApplyToDropdown && 
          applyToRef.current && 
          !applyToRef.current.contains(event.target as Node)) {
        setShowApplyToDropdown(false)
      }
      
      // Close menu item suggestions
      if (showMenuItemSuggestions && 
          menuItemSuggestionsRef.current && 
          !menuItemSuggestionsRef.current.contains(event.target as Node)) {
        setShowMenuItemSuggestions(false)
      }
      
      // Do NOT close modal on outside click anymore
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showOfferTypeDropdown, showApplyToDropdown, showMenuItemSuggestions, showModal])

  // Auto-generate coupon when COUPON type is selected
  useEffect(() => {
    if (formData.offer_type === 'COUPON' && !generatedCouponCode && !editingId) {
      generateCoupon()
    }
  }, [formData.offer_type])

  const generateCoupon = () => {
    setIsGeneratingCoupon(true)
    
    // Generate a random coupon code
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let coupon = ''
    
    // Format: STORE-XXXX-XXXX where X is alphanumeric
    const storePrefix = store?.store_name ? store.store_name.substring(0, 3).toUpperCase() : 'OFF'
    
    for (let i = 0; i < 8; i++) {
      coupon += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    
    // Insert hyphen after 4 characters
    coupon = coupon.slice(0, 4) + '-' + coupon.slice(4)
    
    // Add store prefix
    const finalCoupon = `${storePrefix}-${coupon}`
    
    setTimeout(() => {
      setGeneratedCouponCode(finalCoupon)
      setIsGeneratingCoupon(false)
      toast.success('Coupon code generated!')
    }, 500)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleOpenModal = (offer?: Offer) => {
    if (offer) {
      setEditingId(offer.offer_id)
      setFormData({
        offer_title: offer.offer_title,
        offer_description: offer.offer_description || '',
        offer_type: offer.offer_type,
        offer_sub_type: offer.offer_sub_type,
        menu_item_ids: offer.menu_item_ids || [],
        discount_value: offer.discount_value?.toString() || '',
        min_order_amount: offer.min_order_amount?.toString() || '',
        buy_quantity: offer.buy_quantity?.toString() || '',
        get_quantity: offer.get_quantity?.toString() || '',
        valid_from: offer.valid_from.split('T')[0],
        valid_till: offer.valid_till.split('T')[0]
      })
      setImagePreview(offer.image_url)
      if (offer.offer_type === 'COUPON') {
        setGeneratedCouponCode(offer.coupon_code || '')
      }
      setFormInitialized(true)
    } else {
      setEditingId(null)
      setFormData({
        offer_title: '',
        offer_description: '',
        offer_type: 'PERCENTAGE',
        offer_sub_type: 'ALL_ORDERS',
        menu_item_ids: [],
        discount_value: '',
        min_order_amount: '',
        buy_quantity: '',
        get_quantity: '',
        valid_from: '',
        valid_till: ''
      })
      setImagePreview(null)
      setGeneratedCouponCode('')
      setFormInitialized(true)
    }
    setImageFile(null)
    setShowOfferTypeDropdown(false)
    setShowApplyToDropdown(false)
    setShowMenuItemSuggestions(false)
    setMenuItemSearch('')
    setShowModal(true)
    setActiveTab('basic')
  }

  const handleSaveOffer = async () => {
    if (!store || !store.id) {
      toast.error('Store context not loaded. Please reload the page.')
      return
    }

    // Validation
    if (!formData.offer_title.trim()) {
      toast.error('Offer title is required')
      return
    }
    
    if (!formData.valid_from || !formData.valid_till) {
      toast.error('Valid dates are required')
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const validFrom = new Date(formData.valid_from)
    if (validFrom < today) {
      toast.error('Offer start date cannot be before today')
      return
    }

    if (new Date(formData.valid_till) < validFrom) {
      toast.error('End date must be after start date')
      return
    }

    // Specific items validation
    if (formData.offer_sub_type === 'SPECIFIC_ITEM' && formData.menu_item_ids.length === 0) {
      toast.error('Please select at least one menu item when applying to specific items')
      return
    }

    // Type-specific validation
    let isValid = true
    let errorMessage = ''

    switch (formData.offer_type) {
      case 'BUY_N_GET_M':
        if (!formData.buy_quantity || !formData.get_quantity) {
          isValid = false
          errorMessage = 'Buy quantity and Get quantity are required'
        }
        break
      case 'PERCENTAGE':
        if (!formData.discount_value) {
          isValid = false
          errorMessage = 'Discount percentage is required'
        }
        if (parseFloat(formData.discount_value) < 0 || parseFloat(formData.discount_value) > 100) {
          isValid = false
          errorMessage = 'Discount percentage must be between 0 and 100'
        }
        break
      case 'FLAT':
      case 'COUPON':
        if (!formData.discount_value) {
          isValid = false
          errorMessage = 'Discount amount is required'
        }
        if (parseFloat(formData.discount_value) <= 0) {
          isValid = false
          errorMessage = 'Discount amount must be greater than 0'
        }
        break
      case 'FREE_ITEM':
        if (!formData.min_order_amount) {
          isValid = false
          errorMessage = 'Minimum order amount is required for free item offers'
        }
        break
    }

    // Coupon validation
    if (formData.offer_type === 'COUPON' && !generatedCouponCode) {
      isValid = false
      errorMessage = 'Please generate a coupon code'
    }

    if (!isValid) {
      toast.error(errorMessage)
      return
    }

    setIsSaving(true)

    try {
      // Prepare offer data
      const offerPayload: any = {
        store_id: store.id,
        offer_title: formData.offer_title,
        offer_description: formData.offer_description || null,
        offer_type: formData.offer_type,
        offer_sub_type: formData.offer_sub_type,
        menu_item_ids: formData.offer_sub_type === 'SPECIFIC_ITEM' && formData.menu_item_ids.length > 0 
          ? formData.menu_item_ids 
          : null,
        discount_value: formData.discount_value !== '' ? formData.discount_value : null,
        min_order_amount: formData.min_order_amount !== '' ? formData.min_order_amount : null,
        buy_quantity: formData.buy_quantity ? parseInt(formData.buy_quantity) : null,
        get_quantity: formData.get_quantity ? parseInt(formData.get_quantity) : null,
        coupon_code: formData.offer_type === 'COUPON' ? generatedCouponCode : null,
        valid_from: new Date(formData.valid_from).toISOString(),
        valid_till: new Date(formData.valid_till).toISOString(),
        is_active: true
      }

      let result: Offer | null = null

      // Handle image upload if new image selected
      if (imageFile) {
        const imageUrl = await uploadOfferImage(storeId, editingId || 'temp', imageFile)
        if (imageUrl) {
          offerPayload.image_url = imageUrl
        }
      }

      if (editingId) {
        // Update existing offer
        result = await updateOffer(editingId, offerPayload)
      } else {
        // Create new offer
        result = await createOffer(offerPayload)
      }

      if (result) {
        // Update local state instantly with new offer data
        setOffers(prev => {
          if (editingId) {
            // Replace the edited offer with the new result
            return prev.map(offer => offer.offer_id === editingId ? result : offer);
          } else {
            // Add new offer to the top
            return [result, ...prev];
          }
        });
        toast.success(editingId ? 'Offer updated successfully!' : 'Offer created successfully!');
        setShowModal(false);
        resetForm();
      } else {
        toast.error('Failed to save offer');
      }
    } catch (error) {
      console.error('Error saving offer:', error)
      toast.error('Error saving offer')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteOffer = async (offerId: string) => {
    if (confirm('Are you sure you want to delete this offer?')) {
      const success = await deleteOffer(offerId)
      if (success) {
        setOffers(prev => prev.filter(offer => offer.offer_id !== offerId))
        toast.success('Offer deleted successfully!')
      } else {
        toast.error('Failed to delete offer')
      }
    }
  }

  const resetForm = () => {
    setFormData({
      offer_title: '',
      offer_description: '',
      offer_type: 'PERCENTAGE',
      offer_sub_type: 'ALL_ORDERS',
      menu_item_ids: [],
      discount_value: '',
      min_order_amount: '',
      buy_quantity: '',
      get_quantity: '',
      valid_from: '',
      valid_till: ''
    })
    setImageFile(null)
    setImagePreview(null)
    setEditingId(null)
    setActiveTab('basic')
    setShowOfferTypeDropdown(false)
    setShowApplyToDropdown(false)
    setShowMenuItemSuggestions(false)
    setMenuItemSearch('')
    setGeneratedCouponCode('')
    setFormInitialized(false)
  }

  const toggleMenuItemSelection = (itemId: string) => {
    setFormData(prev => {
      const isSelected = prev.menu_item_ids.includes(itemId)
      if (isSelected) {
        return {
          ...prev,
          menu_item_ids: prev.menu_item_ids.filter(id => id !== itemId)
        }
      } else {
        return {
          ...prev,
          menu_item_ids: [...prev.menu_item_ids, itemId]
        }
      }
    })
  }

  const getMenuItemName = (itemId: string) => {
    const item = menuItems.find(mi => mi.item_id === itemId)
    return item ? item.item_name : 'Unknown Item'
  }

  const getOfferIcon = (offerType: Offer['offer_type']) => {
    switch (offerType) {
      case 'BUY_N_GET_M':
        return <Gift size={16} className="text-purple-600" />
      case 'PERCENTAGE':
        return <Percent size={16} className="text-green-600" />
      case 'FLAT':
        return <DollarSign size={16} className="text-blue-600" />
      case 'COUPON':
        return <Tag size={16} className="text-red-600" />
      case 'FREE_ITEM':
        return <User size={16} className="text-orange-600" />
      default:
        return <Zap size={16} className="text-yellow-600" />
    }
  }

  const getOfferDescription = (offer: Offer) => {
    switch (offer.offer_type) {
      case 'BUY_N_GET_M':
        return `Buy ${offer.buy_quantity} Get ${offer.get_quantity}`
      case 'PERCENTAGE':
        return `${offer.discount_value}% OFF${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ''}`
      case 'FLAT':
        return `Flat ₹${offer.discount_value} OFF${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ''}`
      case 'COUPON':
        return `Coupon: ${offer.coupon_code} - ₹${offer.discount_value} OFF${offer.min_order_amount ? ` on min. order of ₹${offer.min_order_amount}` : ''}`
      case 'FREE_ITEM':
        return `Free Item for New Users${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ''}`
      default:
        return offer.offer_description || ''
    }
  }

  const getOfferTypeDisplay = (type: Offer['offer_type']) => {
    switch (type) {
      case 'PERCENTAGE': return 'Percentage Discount'
      case 'FLAT': return 'Flat Amount Discount'
      case 'COUPON': return 'Coupon Discount'
      case 'BUY_N_GET_M': return 'Buy N Get M'
      case 'FREE_ITEM': return 'Free Item'
      default: return 'Percentage Discount'
    }
  }

  const getApplyToDisplay = (type: Offer['offer_sub_type']) => {
    switch (type) {
      case 'ALL_ORDERS': return 'All Orders'
      case 'SPECIFIC_ITEM': return 'Specific Items'
      default: return 'All Orders'
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard!')
  }

  const handleOfferTypeChange = (type: Offer['offer_type']) => {
    setFormData(prev => ({ ...prev, offer_type: type }))
    setShowOfferTypeDropdown(false)
    
    // Reset coupon code if switching away from COUPON type
    if (type !== 'COUPON') {
      setGeneratedCouponCode('')
    }
  }

  const handleApplyToChange = (type: Offer['offer_sub_type']) => {
    setFormData(prev => ({ ...prev, offer_sub_type: type }))
    setShowApplyToDropdown(false)
  }

  const getStatusColor = (offer: Offer) => {
    const isExpired = new Date(offer.valid_till) < new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validFrom = new Date(offer.valid_from);
    const isUpcoming = validFrom > today;
    
    if (isExpired) return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'EXPIRED' };
    if (!offer.is_active) return { bg: 'bg-yellow-50', text: 'text-amber-700', label: 'INACTIVE' };
    if (isUpcoming) return { bg: 'bg-blue-50', text: 'text-blue-700', label: 'UPCOMING' };
    return { bg: 'bg-green-50', text: 'text-green-700', label: 'ACTIVE' };
  }

  const getOfferBadgeColor = (offerType: Offer['offer_type']) => {
    switch (offerType) {
      case 'PERCENTAGE': return 'bg-gradient-to-r from-emerald-500 to-green-600';
      case 'FLAT': return 'bg-gradient-to-r from-blue-500 to-cyan-600';
      case 'COUPON': return 'bg-gradient-to-r from-rose-500 to-pink-600';
      case 'BUY_N_GET_M': return 'bg-gradient-to-r from-purple-500 to-violet-600';
      case 'FREE_ITEM': return 'bg-gradient-to-r from-amber-500 to-orange-600';
      default: return 'bg-gradient-to-r from-gray-500 to-gray-600';
    }
  }

  if (isLoading) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name || "Loading..."} restaurantId={storeId || ""}>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-10 bg-gray-200 rounded w-64"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="bg-white rounded-xl p-6 space-y-4 shadow-sm">
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-100 rounded w-full"></div>
                    <div className="h-4 bg-gray-100 rounded w-2/3"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <MXLayoutWhite restaurantName={store?.store_name || "Offers"} restaurantId={storeId || ""}>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between px-4 md:px-6 pt-6 pb-4 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                Offers & Promotions
              </h1>
              <p className="text-gray-600 mt-1 text-sm md:text-base flex items-center gap-2">
                <ShoppingBag size={16} />
                Manage offers for <span className="font-semibold text-orange-600">{store?.store_name || 'your store'}</span>
              </p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-lg hover:from-orange-600 hover:to-red-600 transition-all text-sm shadow-lg hover:shadow-xl"
            >
              <Plus size={18} />
              Create Offer
            </button>
          </div>

          {/* Offers Grid - REDESIGNED CARDS */}
          <div className="px-4 md:px-6 py-6">
            {offers.length === 0 ? (
              <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-8 md:p-12 text-center max-w-2xl mx-auto">
                <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Zap size={32} className="text-orange-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">No offers created yet</h3>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">Create your first offer to attract more customers and boost your sales</p>
                <button
                  onClick={() => handleOpenModal()}
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  Create First Offer
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {offers.map(offer => {
                  const now = new Date();
                  const validFrom = new Date(offer.valid_from);
                  const validTill = new Date(offer.valid_till);
                  let daysLeft = 0;
                  let statusLabel = '';
                  if (now < validFrom) {
                    // Offer not started yet
                    const totalDuration = Math.ceil((validTill.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24));
                    const startsIn = Math.ceil((validFrom.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    statusLabel = `Starts in ${startsIn} day${startsIn !== 1 ? 's' : ''} (Duration: ${totalDuration} day${totalDuration !== 1 ? 's' : ''})`;
                  } else if (now > validTill) {
                    // Offer expired
                    statusLabel = 'Expired';
                  } else {
                    // Offer is active, show days left from now to validTill
                    daysLeft = Math.ceil((validTill.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    statusLabel = `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;
                  }
                  const status = getStatusColor(offer);
                  const badgeColor = getOfferBadgeColor(offer.offer_type);
                  
                  return (
                    <div
                      key={offer.offer_id || Math.random()}
                      className={`bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group relative overflow-hidden${statusLabel === 'Expired' ? ' opacity-80' : ''}`}
                      style={{ minHeight: 'auto', maxWidth: 340, cursor: 'pointer', paddingTop: 0, paddingBottom: 0 }}
                    >
                      {/* Top accent bar */}
                      <div className={`absolute top-0 left-0 right-0 h-1 ${badgeColor}`}></div>
                      {/* Content */}
                      <div className="p-1.5 md:p-2">
                        {/* Header row */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-0.5">
                              {getOfferIcon(offer.offer_type)}
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${status.bg} ${status.text}`}>
                                {status.label}
                              </span>
                            </div>
                            <h3 className="font-bold text-gray-900 text-xs truncate group-hover:text-orange-600 transition-colors">
                              {offer.offer_title}
                            </h3>
                            <p className="text-[9px] text-gray-500 font-mono mt-0.5">
                              ID: {offer.offer_id.substring(0, 8)}...
                            </p>
                          </div>
                          
                          {/* Scope badge */}
                          <div className="flex-shrink-0">
                            {offer.offer_sub_type === 'SPECIFIC_ITEM' ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-50 text-indigo-700 relative hover:bg-indigo-100"
                                style={{ cursor: 'pointer', position: 'relative' }}
                                tabIndex={0}
                                onMouseEnter={e => {
                                  const tooltip = e.currentTarget.querySelector('.offer-items-tooltip');
                                  if (tooltip) tooltip.style.opacity = '1';
                                  if (tooltip) tooltip.style.pointerEvents = 'auto';
                                }}
                                onMouseLeave={e => {
                                  const tooltip = e.currentTarget.querySelector('.offer-items-tooltip');
                                  if (tooltip) tooltip.style.opacity = '0';
                                  if (tooltip) tooltip.style.pointerEvents = 'none';
                                }}
                              >
                                Specific Items
                                <span className="offer-items-tooltip absolute left-1/2 z-50 -translate-x-1/2 mt-2 min-w-max bg-white border border-gray-300 rounded-lg shadow-lg text-xs text-gray-900 px-3 py-2 whitespace-pre-line opacity-0 pointer-events-none transition-opacity duration-200"
                                  style={{
                                    top: '100%',
                                    whiteSpace: 'pre-line',
                                    minWidth: '180px',
                                    maxWidth: '260px',
                                    fontSize: '11px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                  }}
                                >
                                  {offer.menu_item_ids && offer.menu_item_ids.length > 0
                                    ? offer.menu_item_ids.map(
                                        id => {
                                          // Some menuItems may use id or item_id, so check both
                                          const item = menuItems.find(m => m.item_id === id || m.id === id);
                                          return item ? `• ${item.item_name}` : null;
                                        }
                                      ).filter(Boolean).join('\n')
                                    : 'No items found'}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-700">
                                All Orders
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Offer details */}
                        <div className="mb-2">
                          {offer.offer_type === 'COUPON' && offer.coupon_code && (
                            <div className="mb-1.5">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-600">Coupon Code</span>
                                <button
                                  onClick={() => copyToClipboard(offer.coupon_code!)}
                                  className="text-xs font-medium text-gray-500 hover:text-orange-600 transition-colors flex items-center gap-1"
                                >
                                  <Copy size={10} />
                                  Copy
                                </button>
                              </div>
                              <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-300 rounded-lg p-2">
                                <code className="text-sm font-bold text-gray-900 font-mono tracking-wider block text-center">
                                  {offer.coupon_code}
                                </code>
                              </div>
                            </div>
                          )}

                          {/* Discount summary */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1">
                              <div className="p-1 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100">
                                {offer.offer_type === 'PERCENTAGE' ? (
                                  <Percent size={14} className="text-green-600" />
                                ) : offer.offer_type === 'FLAT' ? (
                                  <DollarSign size={14} className="text-blue-600" />
                                ) : offer.offer_type === 'BUY_N_GET_M' ? (
                                  <Gift size={14} className="text-purple-600" />
                                ) : (
                                  <Tag size={14} className="text-red-600" />
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-gray-900">
                                  {getOfferDescription(offer)}
                                </p>
                                {offer.min_order_amount && (
                                  <p className="text-[9px] text-gray-500 mt-0.5">
                                    Min. order: ₹{offer.min_order_amount}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Validity */}
                          <div className="flex items-center justify-between text-[10px] text-gray-600 bg-gray-50 rounded-lg p-1.5">
                            <div className="flex items-center gap-1">
                              <Calendar size={12} className="text-gray-500" />
                              <span className="font-medium">
                                {new Date(offer.valid_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - {new Date(offer.valid_till).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            {(statusLabel && statusLabel !== 'Expired') && (
                              <div className="flex items-center gap-1 bg-gradient-to-r from-amber-100 to-orange-100 px-2 py-1 rounded-full">
                                <Clock size={10} className="text-amber-700" />
                                <span className="font-bold text-amber-800 text-[10px]">
                                  {statusLabel}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Image preview if available */}
                          {offer.image_url && (
                            <div className="mt-0.5 rounded-lg overflow-hidden border border-gray-200">
                              <img
                                src={offer.image_url}
                                alt={offer.offer_title}
                                className="w-full h-10 object-cover"
                              />
                            </div>
                          )}

                          {/* Description if available */}
                          {offer.offer_description && (
                            <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                              {offer.offer_description}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-gray-400">
                              Updated: {new Date(offer.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => handleOpenModal(offer)}
                              className="p-1 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 hover:from-blue-100 hover:to-blue-200 transition-all duration-200 group/btn"
                              title="Edit offer"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteOffer(offer.offer_id)}
                              className="p-1 rounded-lg bg-gradient-to-r from-red-50 to-red-100 text-red-700 hover:from-red-100 hover:to-red-200 transition-all duration-200 group/btn"
                              title="Delete offer"
                            >
                              <Trash2 size={12} />
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

        {/* Create/Edit Modal - FIX: Updated input handlers to prevent overwriting */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 md:p-4 backdrop-blur-[2px]">
            <div 
              ref={modalRef}
              className="bg-white w-full max-w-md border border-gray-200 shadow-2xl flex flex-col max-h-[90vh]"
              style={{ borderRadius: '20px', overflow: 'hidden' }}
            >
              {/* Header - Fixed */}
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Offer' : 'Create New Offer'}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Enter details for the offer</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false)
                    resetForm()
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              {/* Compact Tabs - Fixed */}
              <div className="flex-shrink-0 border-b border-gray-200 bg-white">
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => setActiveTab('basic')}
                    className={`flex-1 px-3 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'basic' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    Basic Info
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('details')}
                    className={`flex-1 px-3 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'details' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    Offer Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('validity')}
                    className={`flex-1 px-3 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'validity' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    Validity
                  </button>
                </div>
              </div>

              {/* Form Content - Scrollable */}
              <div 
                ref={modalContentRef}
                className="flex-1 overflow-y-auto hide-scrollbar"
              >
                <form className="px-5 py-4" autoComplete="off" onSubmit={e => { e.preventDefault(); handleSaveOffer(); }}>
                  {activeTab === 'basic' && (
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 mb-2">
                        <h3 className="text-sm font-bold text-blue-800 mb-1">Basic Information</h3>
                        <p className="text-xs text-blue-600">Fill in the basic details of your offer</p>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Offer Title *
                        </label>
                        <input
                          type="text"
                          value={formData.offer_title}
                          onChange={handleInputChange('offer_title')}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm transition-all"
                          placeholder="e.g., Summer Special, Weekend Discount"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Description (Optional)
                        </label>
                        <textarea
                          value={formData.offer_description}
                          onChange={handleInputChange('offer_description')}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm transition-all"
                          placeholder="Describe your offer..."
                          rows={2}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Offer Image (Optional)
                        </label>
                        <div className="flex items-center gap-3">
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageChange}
                              className="hidden"
                            />
                            <div className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold rounded-lg hover:from-orange-600 hover:to-red-600 transition-all shadow-md">
                              Choose Image
                            </div>
                          </label>
                          {imagePreview && (
                            <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-gray-200">
                              <img 
                                src={imagePreview} 
                                alt="Preview" 
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          Recommended: 800x400px
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'details' && (
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 mb-2">
                        <h3 className="text-sm font-bold text-blue-800 mb-1">Offer Configuration</h3>
                        <p className="text-xs text-blue-600">Configure the type and rules of your offer</p>
                      </div>
                      
                      {/* Offer Type Dropdown */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            Offer Type *
                          </label>
                          <div className="relative" ref={offerTypeRef}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowOfferTypeDropdown(!showOfferTypeDropdown)
                                setShowApplyToDropdown(false)
                                setShowMenuItemSuggestions(false)
                              }}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-gray-100">
                                  {getOfferIcon(formData.offer_type)}
                                </div>
                                <span className="text-sm font-medium text-gray-900">{getOfferTypeDisplay(formData.offer_type)}</span>
                              </div>
                              <ChevronDown size={16} className={`text-gray-500 transition-transform ${showOfferTypeDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {showOfferTypeDropdown && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl hide-scrollbar max-h-60 overflow-y-auto">
                                {[
                                  { type: 'PERCENTAGE' as const, label: 'Percentage Discount', icon: <Percent size={14} className="text-green-600" /> },
                                  { type: 'FLAT' as const, label: 'Flat Amount Discount', icon: <DollarSign size={14} className="text-blue-600" /> },
                                  { type: 'COUPON' as const, label: 'Coupon Discount', icon: <Tag size={14} className="text-red-600" /> },
                                  { type: 'BUY_N_GET_M' as const, label: 'Buy N Get M', icon: <Gift size={14} className="text-purple-600" /> },
                                  { type: 'FREE_ITEM' as const, label: 'Free Item', icon: <User size={14} className="text-orange-600" /> }
                                ].map((option) => (
                                  <div
                                    key={option.type}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOfferTypeChange(option.type)
                                    }}
                                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${
                                      formData.offer_type === option.type ? 'bg-orange-50' : ''
                                    }`}
                                  >
                                    <div className="p-1.5 rounded-full bg-gray-100">
                                      {option.icon}
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">{option.label}</div>
                                    </div>
                                    {formData.offer_type === option.type && (
                                      <div className="ml-auto w-2 h-2 bg-green-500 rounded-full"></div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Apply To Dropdown */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            Apply To *
                          </label>
                          <div className="relative" ref={applyToRef}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowApplyToDropdown(!showApplyToDropdown)
                                setShowOfferTypeDropdown(false)
                                setShowMenuItemSuggestions(false)
                              }}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                            >
                              <span className="text-sm font-medium text-gray-900">{getApplyToDisplay(formData.offer_sub_type)}</span>
                              <ChevronDown size={16} className={`text-gray-500 transition-transform ${showApplyToDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {showApplyToDropdown && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl">
                                {[
                                  { type: 'ALL_ORDERS' as const, label: 'All Orders' },
                                  { type: 'SPECIFIC_ITEM' as const, label: 'Specific Items' }
                                ].map((option) => (
                                  <div
                                    key={option.type}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleApplyToChange(option.type)
                                    }}
                                    className={`px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${
                                      formData.offer_sub_type === option.type ? 'bg-orange-50' : ''
                                    }`}
                                  >
                                    <div className="text-sm font-medium text-gray-900">{option.label}</div>
                                    {formData.offer_sub_type === option.type && (
                                      <div className="ml-auto w-2 h-2 bg-green-500 rounded-full"></div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Menu Items Selection (Only when Apply To is Specific Item) */}
                      {formData.offer_sub_type === 'SPECIFIC_ITEM' && (
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            Select Menu Items *
                          </label>
                          
                          {/* Selected Items Display */}
                          {formData.menu_item_ids.length > 0 && (
                            <div className="mb-2">
                              <div className="text-xs font-semibold text-gray-600 mb-1">Selected Items ({formData.menu_item_ids.length}):</div>
                              <div className="flex flex-wrap gap-1">
                                {formData.menu_item_ids.map(itemId => (
                                  <div
                                    key={itemId}
                                    className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs"
                                  >
                                    <span>{getMenuItemName(itemId)}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleMenuItemSelection(itemId)
                                      }}
                                      className="text-green-800 hover:text-green-900"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Search Input */}
                          <div className="relative">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                              <input
                                type="text"
                                value={menuItemSearch}
                                onChange={(e) => {
                                  setMenuItemSearch(e.target.value)
                                  setShowMenuItemSuggestions(true)
                                }}
                                onFocus={() => setShowMenuItemSuggestions(true)}
                                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                                placeholder="Search menu items..."
                              />
                            </div>
                            
                            {/* Combined Suggestions Dropdown */}
                            {showMenuItemSuggestions && (
                              <div 
                                ref={menuItemSuggestionsRef}
                                className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl hide-scrollbar max-h-60 overflow-y-auto"
                              >
                                {filteredMenuItems.length === 0 ? (
                                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                                    No menu items found
                                  </div>
                                ) : (
                                  filteredMenuItems.map(item => {
                                    const isSelected = formData.menu_item_ids.includes(item.item_id)
                                    return (
                                      <div
                                        key={item.item_id}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          toggleMenuItemSelection(item.item_id)
                                          if (!menuItemSearch) {
                                            // Only close if not searching
                                            setShowMenuItemSuggestions(false)
                                          }
                                        }}
                                        className={`px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 flex items-center justify-between ${
                                          isSelected ? 'bg-green-50' : ''
                                        }`}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <div className="text-sm font-medium text-gray-900 truncate">
                                              {item.item_name}
                                            </div>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                              item.category_type === 'NON_VEG' 
                                                ? 'bg-red-100 text-red-800' 
                                                : item.category_type === 'VEG'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-800'
                                            }`}>
                                              {item.category_type}
                                            </span>
                                          </div>
                                          <div className="text-xs text-gray-500 mt-0.5">
                                            {item.food_category_item} • ₹{item.actual_price}
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <Check size={16} className="text-green-600 flex-shrink-0 ml-2" />
                                        )}
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Instructions */}
                          <p className="text-xs text-gray-500 mt-1">
                            {menuItems.length > 0 
                              ? `Found ${menuItems.length} menu items. Search or click to select.` 
                              : 'No menu items available for this store.'}
                          </p>
                        </div>
                      )}

                      {/* Offer Rules */}
                      <div className="space-y-3">
                        <div className="border-t border-gray-200 pt-3">
                          <h4 className="text-xs font-bold text-gray-700 mb-2">Offer Rules & Values</h4>
                          
                          {formData.offer_type === 'BUY_N_GET_M' && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                  Buy Quantity *
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={formData.buy_quantity}
                                  onChange={handleNumberInputChange('buy_quantity')}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                  Get Quantity *
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={formData.get_quantity}
                                  onChange={handleNumberInputChange('get_quantity')}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                                  required
                                />
                              </div>
                            </div>
                          )}
                          
                          {(formData.offer_type === 'PERCENTAGE' || formData.offer_type === 'FLAT' || formData.offer_type === 'COUPON') && (
                            <>
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                  Discount Value *
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={formData.discount_value}
                                    onChange={handleNumberInputChange('discount_value')}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                                    placeholder={formData.offer_type === 'PERCENTAGE' ? 'e.g., 10 for 10%' : 'e.g., 50 for ₹50'}
                                    required
                                  />
                                  {formData.offer_type === 'PERCENTAGE' ? (
                                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold">%</div>
                                  ) : null}
                                </div>
                              </div>
                              
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                  Minimum Order Amount (Optional)
                                </label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold">₹</span>
                                  <input
                                    type="text"
                                    value={formData.min_order_amount}
                                    onChange={handleNumberInputChange('min_order_amount')}
                                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                                    placeholder="e.g., 500"
                                  />
                                </div>
                              </div>
                            </>
                          )}
                          
                          {formData.offer_type === 'FREE_ITEM' && (
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Minimum Order Amount for New Users *
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold">₹</span>
                                <input
                                  type="text"
                                  value={formData.min_order_amount}
                                  onChange={handleNumberInputChange('min_order_amount')}
                                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                                  placeholder="Order amount required for free item"
                                  required
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Coupon Code Generator - Only for COUPON type */}
                        {formData.offer_type === 'COUPON' && (
                          <div className="mt-3 p-3 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg">
                            <label className="block text-xs font-bold text-red-800 mb-2">
                              Coupon Code *
                            </label>
                            
                            {generatedCouponCode ? (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Tag size={14} className="text-red-600" />
                                    <span className="text-sm font-semibold text-red-700">Generated Code:</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(generatedCouponCode)}
                                    className="text-xs font-medium text-red-700 hover:text-red-800"
                                  >
                                    <Copy size={12} className="inline mr-1" />
                                    Copy
                                  </button>
                                </div>
                                <div className="bg-white px-3 py-2 rounded border border-red-300">
                                  <code className="text-lg font-bold text-red-800 font-mono tracking-wider">
                                    {generatedCouponCode}
                                  </code>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <div className="flex-1">
                                    <p className="text-xs text-red-600">
                                      ✓ Coupon code auto-generated
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={generateCoupon}
                                    disabled={isGeneratingCoupon}
                                    className="text-xs font-medium text-red-700 hover:text-red-800"
                                  >
                                    {isGeneratingCoupon ? 'Regenerating...' : 'Regenerate'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center">
                                <button
                                  type="button"
                                  onClick={generateCoupon}
                                  disabled={isGeneratingCoupon}
                                  className={`w-full py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-bold ${
                                    isGeneratingCoupon
                                      ? 'bg-gradient-to-r from-red-300 to-red-400 cursor-not-allowed'
                                      : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                                  } text-white transition-all shadow-md hover:shadow-lg`}
                                >
                                  {isGeneratingCoupon ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                      Generating...
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={14} />
                                      Generate Coupon Code
                                    </>
                                  )}
                                </button>
                                <p className="text-xs text-red-600 mt-2">
                                  Click to generate a unique coupon code for this offer
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'validity' && (
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 mb-2">
                        <h3 className="text-sm font-bold text-blue-800 mb-1">Validity Period</h3>
                        <p className="text-xs text-blue-600">Set when your offer will be active</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            Start Date *
                          </label>
                          <input
                            type="date"
                            value={formData.valid_from}
                            onChange={handleInputChange('valid_from')}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                            min={new Date().toISOString().split('T')[0]}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            End Date *
                          </label>
                          <input
                            type="date"
                            value={formData.valid_till}
                            onChange={handleInputChange('valid_till')}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                            min={formData.valid_from || new Date().toISOString().split('T')[0]}
                            required
                          />
                        </div>
                      </div>
                      
                      {formData.valid_from && formData.valid_till && (
                        <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                          <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                            <Calendar size={12} />
                            Valid from <span className="text-orange-600">{formData.valid_from}</span> to <span className="text-orange-600">{formData.valid_till}</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Offer Summary */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gradient-to-br from-white to-gray-50">
                        <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                          <h4 className="text-sm font-bold text-gray-900">Offer Summary</h4>
                        </div>
                        <div className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-600">Title:</span>
                              <span className="text-xs font-bold text-gray-900">{formData.offer_title || 'Not set'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-600">Type:</span>
                              <span className="text-xs font-bold text-gray-900">{getOfferTypeDisplay(formData.offer_type)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-600">Apply To:</span>
                              <span className="text-xs font-bold text-gray-900">{getApplyToDisplay(formData.offer_sub_type)}</span>
                            </div>
                            {formData.offer_sub_type === 'SPECIFIC_ITEM' && formData.menu_item_ids.length > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-600">Selected Items:</span>
                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
                                  {formData.menu_item_ids.length} item(s)
                                </span>
                              </div>
                            )}
                            {formData.offer_type === 'COUPON' && generatedCouponCode && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-600">Coupon Code:</span>
                                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded font-mono">
                                  {generatedCouponCode}
                                </span>
                              </div>
                            )}
                            {formData.discount_value && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-600">Discount:</span>
                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
                                  {formData.offer_type === 'PERCENTAGE' ? `${formData.discount_value}% OFF` : `₹${formData.discount_value} OFF`}
                                </span>
                              </div>
                            )}
                            {formData.min_order_amount && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-600">Min. Order:</span>
                                <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                  ₹{formData.min_order_amount}+
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons - Fixed at bottom of content */}
                  <div className="flex items-center justify-between gap-2 pt-6 mt-6 border-t border-gray-200">
                    <div>
                      {activeTab !== 'basic' && (
                        <button
                          type="button"
                          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 border border-gray-300 text-gray-700 hover:from-gray-200 hover:to-gray-300 transition-all text-xs font-bold flex items-center gap-1"
                          onClick={() => {
                            if (activeTab === 'details') setActiveTab('basic')
                            if (activeTab === 'validity') setActiveTab('details')
                          }}
                        >
                          ← Previous
                        </button>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      {activeTab !== 'validity' && (
                        <button
                          type="button"
                          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-gray-800 to-gray-900 text-white hover:from-gray-900 hover:to-black transition-all text-xs font-bold flex items-center gap-1"
                          onClick={() => {
                            if (activeTab === 'basic') setActiveTab('details')
                            if (activeTab === 'details') setActiveTab('validity')
                          }}
                        >
                          Next →
                        </button>
                      )}
                      
                      {activeTab === 'validity' && (
                        <button
                          type="submit"
                          disabled={isSaving || !formData.offer_title.trim() || !formData.valid_from || !formData.valid_till || 
                            (formData.offer_sub_type === 'SPECIFIC_ITEM' && formData.menu_item_ids.length === 0) ||
                            (formData.offer_type === 'COUPON' && !generatedCouponCode)}
                          className={`px-6 py-2.5 rounded-lg font-bold text-white transition-all text-xs ${
                            isSaving || !formData.offer_title.trim() || !formData.valid_from || !formData.valid_till || 
                            (formData.offer_sub_type === 'SPECIFIC_ITEM' && formData.menu_item_ids.length === 0) ||
                            (formData.offer_type === 'COUPON' && !generatedCouponCode)
                              ? 'bg-gradient-to-r from-orange-300 to-red-300 cursor-not-allowed' 
                              : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg hover:shadow-xl'
                          }`}
                        >
                          {isSaving ? (
                            <span className="flex items-center gap-1">
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              Saving...
                            </span>
                          ) : (
                            editingId ? 'Update Offer' : 'Create Offer'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </MXLayoutWhite>

      {/* Add global CSS for hiding scrollbars */}
      <style jsx global>{`
        .hide-scrollbar {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;      /* Firefox */
        }
        
        .hide-scrollbar::-webkit-scrollbar {
          display: none;              /* Chrome, Safari and Opera */
        }
        
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  )
}

export default function OffersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading offers...</p>
        </div>
      </div>
    }>
      <OffersContent />
    </Suspense>
  )
}