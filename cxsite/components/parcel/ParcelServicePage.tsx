'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import AppDownloadModal from '@/components/common/AppDownloadModal'
import AppLinkSentToast from '@/components/common/AppLinkSentToast'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import Footer from '@/components/layout/Footer'
import { ServiceCategory, setCurrentService } from '@/lib/slices/authSlice'
import { supabase } from '@/lib/supabase'

// Consistent number formatting
const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-IN').format(num)
}

// Parcel Categories
const parcelCategories = [
  {
    id: 'document',
    name: 'Documents',
    icon: '📄',
    description: 'Papers, certificates',
    basePrice: 30,
    maxWeight: '500g',
    maxValue: 5000,
    requiresInvoice: false,
  },
  {
    id: 'clothing',
    name: 'Clothing',
    icon: '👕',
    description: 'Apparel & fashion',
    basePrice: 50,
    maxWeight: '5kg',
    maxValue: 10000,
    requiresInvoice: false,
  },
  {
    id: 'electronics',
    name: 'Electronics',
    icon: '📱',
    description: 'Phones, gadgets',
    basePrice: 150,
    maxWeight: '10kg',
    maxValue: 50000,
    requiresInvoice: true,
  },
  {
    id: 'fragile',
    name: 'Fragile',
    icon: '🔮',
    description: 'Glass, artwork',
    basePrice: 200,
    maxWeight: '10kg',
    maxValue: 25000,
    requiresInvoice: true,
  },
  {
    id: 'food',
    name: 'Food',
    icon: '🍱',
    description: 'Perishables',
    basePrice: 80,
    maxWeight: '5kg',
    maxValue: 3000,
    requiresInvoice: false,
  },
  {
    id: 'medicine',
    name: 'Medicine',
    icon: '💊',
    description: 'Pharma items',
    basePrice: 100,
    maxWeight: '2kg',
    maxValue: 15000,
    requiresInvoice: true,
  },
  {
    id: 'jewelry',
    name: 'Jewelry',
    icon: '💎',
    description: 'Precious items',
    basePrice: 300,
    maxWeight: '1kg',
    maxValue: 100000,
    requiresInvoice: true,
  },
  {
    id: 'other',
    name: 'Other',
    icon: '📦',
    description: 'General items',
    basePrice: 60,
    maxWeight: '15kg',
    maxValue: 10000,
    requiresInvoice: false,
  }
]

const weightOptions = [
  { label: 'Under 500g', value: 'Under 500g' },
  { label: '500g - 1kg', value: '500g - 1kg' },
  { label: '1kg - 3kg', value: '1kg - 3kg' },
  { label: '3kg - 5kg', value: '3kg - 5kg' },
  { label: '5kg - 10kg', value: '5kg - 10kg' },
  { label: '10kg - 15kg', value: '10kg - 15kg' },
  { label: '15kg+', value: '15kg+' },
]

const deliveryTypes = [
  { id: 'standard', name: 'Standard', description: '24-48 hours', icon: '📦', multiplier: 1.0 },
  { id: 'same-day', name: 'Same Day', description: '4-8 hours', icon: '🌞', multiplier: 1.5 },
  { id: 'express', name: 'Express', description: '1-2 hours', icon: '⚡', multiplier: 2.5 }
]

interface ParcelDetails {
  trackingNumber?: string
  categoryName: string
  declaredValue: number
  estimatedPrice: number
  recipientName: string
}

export default function ParcelServicePageV2() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user, isAuthenticated, currentService } = useAppSelector(state => state.auth)
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('parcel')
  const [hasCheckedService, setHasCheckedService] = useState(false)
  
  // Form states
  const [currentStep, setCurrentStep] = useState(1)
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedDeliveryType, setSelectedDeliveryType] = useState('standard')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [parcelWeight, setParcelWeight] = useState('')
  const [declaredValue, setDeclaredValue] = useState('')
  const [parcelDescription, setParcelDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  
  // Tracking states
  const [trackingType, setTrackingType] = useState<'mobile' | 'gmid' | 'partnerid'>('mobile')
  const [trackingInput, setTrackingInput] = useState('')
  const [isTrackingLoading, setIsTrackingLoading] = useState(false)
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [trackedParcel, setTrackedParcel] = useState<any>(null)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  
  // UI states
  const [valueError, setValueError] = useState<string | null>(null)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isBooking, setIsBooking] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [bookingDetails, setBookingDetails] = useState<ParcelDetails | null>(null)
  const [currentLocation, setCurrentLocation] = useState('Detecting...')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)
  const [showAppLinkToast, setShowAppLinkToast] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Service check
  useEffect(() => {
    if (isAuthenticated && user && !hasCheckedService) {
      // Check if user just switched services within the last 5 seconds
      const lastSwitchTime = sessionStorage.getItem('lastServiceSwitch')
      const now = Date.now()
      const timeSinceLastSwitch = lastSwitchTime ? now - parseInt(lastSwitchTime) : null
      
      if (currentService !== 'parcel') {
        // Only show modal if more than 5 seconds have passed since last switch
        if (!timeSinceLastSwitch || timeSinceLastSwitch > 5000) {
          setTargetService('parcel')
          setShowSwitchModal(true)
        }
      } else {
        dispatch(setCurrentService('parcel'))
      }
      setHasCheckedService(true)
    }
  }, [isAuthenticated, user, dispatch, currentService, hasCheckedService])

  // Auto-detect location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            )
            const data = await response.json()
            const location = data.address?.city || data.address?.town || 'Your Location'
            setCurrentLocation(location)
            setPickup(location)
          } catch {
            setCurrentLocation('Chennai, Tamil Nadu')
            setPickup('Chennai, Tamil Nadu')
          }
        }
      )
    }
  }, [])

  // Handle scroll to parcel form when navigating from hero with hash
  useEffect(() => {
    if (window.location.hash === '#parcel-form') {
      const element = document.getElementById('parcel-form')
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    }
  }, [])

  const handleNavigation = (path: string, service: ServiceCategory) => {
    if (!isAuthenticated) {
      router.push(path)
      return
    }
    if (service === currentService) {
      router.push(path)
    } else {
      setTargetService(service)
      setShowSwitchModal(true)
    }
  }

  const validateDeclaredValue = (value: string) => {
    if (!selectedCategory || !value) return true
    const category = parcelCategories.find(c => c.id === selectedCategory)
    if (!category) return true
    const numValue = parseInt(value.replace(/,/g, ''))
    if (isNaN(numValue) || numValue <= 0) {
      setValueError('Enter valid amount')
      return false
    }
    if (numValue > category.maxValue) {
      setValueError(`Max ₹${formatNumber(category.maxValue)}`)
      return false
    }
    setValueError(null)
    return true
  }

  const handleDeclaredValueChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9]/g, '')
    setDeclaredValue(cleanValue)
    validateDeclaredValue(cleanValue)
  }

  const handleInvoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setInvoiceFile(file)
    }
  }

  const isInvoiceRequired = () => {
    if (!selectedCategory || !declaredValue) return false
    const category = parcelCategories.find(c => c.id === selectedCategory)
    if (!category) return false
    const numValue = parseInt(declaredValue.replace(/,/g, '')) || 0
    return category.requiresInvoice || numValue > 10000
  }

  const calculatePrice = () => {
    if (!selectedCategory) return 0
    const category = parcelCategories.find(c => c.id === selectedCategory)
    const delivery = deliveryTypes.find(d => d.id === selectedDeliveryType)
    if (!category || !delivery) return 0
    const basePrice = category.basePrice
    const numValue = parseInt(declaredValue.replace(/,/g, '')) || 0
    const insuranceCharge = Math.round(numValue * 0.01)
    return Math.round(basePrice * delivery.multiplier + 20 + insuranceCharge)
  }

  const handleTrackParcel = async () => {
    if (!isAuthenticated || !user) {
      setIsAuthModalOpen(true)
      return
    }

    if (!trackingInput.trim()) return
    
    setIsTrackingLoading(true)
    setTrackingError(null)
    
    try {
      let parcelData = null
      
      // Search in Supabase based on tracking type
      if (trackingType === 'gmid') {
        // Search by GatiMitra Order ID
        const { data, error } = await supabase
          .from('parcel_orders')
          .select('*')
          .eq('order_number', trackingInput.toUpperCase())
          .single()
        
        if (error || !data) {
          setTrackingError('No parcel found with this GatiMitra ID')
        } else {
          parcelData = data
        }
      } else if (trackingType === 'partnerid') {
        // Search by Partner Order ID
        const { data, error } = await supabase
          .from('parcel_orders')
          .select('*')
          .eq('partner_order_id', trackingInput)
          .single()
        
        if (error || !data) {
          setTrackingError('No parcel found with this Partner ID')
        } else {
          parcelData = data
        }
      } else if (trackingType === 'mobile') {
        // Search by mobile number - get most recent parcel
        const { data, error } = await supabase
          .from('parcel_orders')
          .select('*')
          .eq('sender_phone', trackingInput)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        if (error || !data) {
          setTrackingError('No parcels found for this mobile number')
        } else {
          parcelData = data
        }
      }
      
      if (parcelData) {
        setTrackedParcel({
          orderNumber: parcelData.order_number,
          status: parcelData.status || 'pending',
          senderName: parcelData.sender_name,
          recipientName: parcelData.recipient_name,
          pickupAddress: parcelData.pickup_address?.address || parcelData.pickup_address,
          deliveryAddress: parcelData.delivery_address?.address || parcelData.delivery_address,
          estimatedDelivery: parcelData.estimated_delivery_date,
          currentLocation: parcelData.current_location || 'Warehouse',
          lastUpdate: parcelData.last_update || new Date().toISOString(),
          category: parcelData.category,
          weight: parcelData.weight,
          amount: parcelData.amount,
          partnerOrderId: parcelData.partner_order_id
        })
        setShowTrackingModal(true)
      }
      
    } catch (error) {
      console.error('Tracking error:', error)
      setTrackingError('Unable to track parcel. Please try again.')
    } finally {
      setIsTrackingLoading(false)
    }
  }

  const handleBookParcel = async () => {
    // Web booking is intentionally blocked for parcel.
    setShowAppDownloadModal(true)
    return

    if (!isAuthenticated || !user) {
      setIsAuthModalOpen(true)
      return
    }

    if (!pickup || !dropoff || !selectedCategory || !recipientName || !recipientPhone || !declaredValue || !termsAccepted) {
      return
    }

    if (isInvoiceRequired() && !invoiceFile) {
      alert('Invoice required for this parcel')
      return
    }

    const category = parcelCategories.find(c => c.id === selectedCategory)
    if (!category) return

    setIsBooking(true)

    try {
      const numValue = parseInt(declaredValue.replace(/,/g, '')) || 0
      const basePrice = category.basePrice
      const delivery = deliveryTypes.find(d => d.id === selectedDeliveryType)
      const multiplier = delivery?.multiplier || 1
      const insuranceCharge = Math.round(numValue * 0.01)
      const distanceCharge = 20
      const subtotal = Math.round(basePrice * multiplier + distanceCharge + insuranceCharge)
      const taxes = Math.round(subtotal * 0.05)
      const totalAmount = subtotal + taxes

      const parcelData = {
        senderId: user.user_id || user.id,
        senderName: user.name || 'User',
        senderPhone: user.phone,
        senderEmail: user.email || '',
        recipientName,
        recipientPhone,
        parcelType: selectedCategory,
        parcelTypeName: category.name,
        parcelWeight,
        parcelDescription,
        declaredValue: numValue,
        pickupAddress: { address: pickup },
        deliveryAddress: { address: dropoff },
        deliveryType: selectedDeliveryType,
        basePrice,
        expressCharge: selectedDeliveryType === 'express' ? 50 : 0,
        insuranceCharge,
        taxes,
        totalAmount,
        isScheduled: false,
        paymentMethod: 'razorpay',
        instructions,
        hasInvoice: !!invoiceFile,
      }

      // Store parcel details in session for payment page
      sessionStorage.setItem('parcelBookingData', JSON.stringify({
        parcelData,
        totalAmount,
        serviceType: 'parcel',
      }))

      // Redirect to payment page
      router.push('/payment?service=parcel')
    } catch (error) {
      console.error('Error preparing parcel booking:', error)
      alert('Failed to prepare parcel booking. Please try again.')
    } finally {
      setIsBooking(false)
    }
  }

  return (
    <>
      <style jsx global>{`
        /* Global styles for Parcel Service Page */
        .parcel-page {
          min-height: 100vh;
          background: linear-gradient(to bottom, #f9fafb, #ffffff);
        }
        
        /* ===== HEADER NAVIGATION ===== */
        header {
          transition: box-shadow 0.2s ease;
          z-index: 40;
        }
        
        header button {
          position: relative;
          transition: all 0.25s ease;
          padding: 10px 20px !important;
          border-radius: 24px !important;
          font-weight: 600 !important;
          border: none !important;
          cursor: pointer;
        }
        
        header button.active {
          background: linear-gradient(135deg, #16c2a5 0%, #0fa982 100%) !important;
          color: white !important;
          box-shadow: 0 4px 15px rgba(22, 194, 165, 0.3) !important;
        }
        
        header button:not(.active) {
          background-color: transparent !important;
          color: #b0b0d0 !important;
        }
        
        header button:not(.active):hover {
          background-color: #2a2a4e !important;
          color: #374151 !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
        }
        
        /* ===== PROGRESS INDICATOR ===== */
        .parcel-progress-step {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          transition: all 0.25s ease;
          position: relative;
        }
        
        .parcel-progress-step.active {
          background: linear-gradient(135deg, #9333ea, #db2777);
          color: white;
          box-shadow: 0 6px 20px rgba(147, 51, 234, 0.35);
          transform: scale(1.05);
        }
        
        .parcel-progress-step.completed {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
        }
        
        .parcel-progress-step.completed::after {
          content: '✓';
          position: absolute;
          font-size: 20px;
        }
        
        .parcel-progress-step.inactive {
          background-color: #f3f4f6;
          color: #9ca3af;
          border: 2px solid #e5e7eb;
        }
        
        .parcel-progress-line {
          flex: 1;
          height: 3px;
          border-radius: 2px;
          margin: 0 12px;
          transition: all 0.25s ease;
        }
        
        .parcel-progress-line.active {
          background: linear-gradient(90deg, #9333ea, #db2777);
          box-shadow: 0 2px 8px rgba(147, 51, 234, 0.2);
        }
        
        .parcel-progress-line.inactive {
          background-color: #e5e7eb;
        }
        
        /* ===== FORM INPUTS ===== */
        .parcel-input {
          width: 100%;
          padding: 13px 16px 13px 48px;
          border-width: 2px;
          border-color: #e5e7eb;
          border-radius: 12px;
          background-color: #f9fafb;
          outline: none;
          font-size: 15px;
          font-weight: 500;
          color: #111827;
          transition: all 0.25s ease;
        }
        
        .parcel-input::placeholder {
          color: #9ca3af;
        }
        
        .parcel-input:focus {
          border-color: #9333ea;
          box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.1), 0 0 0 1px rgba(147, 51, 234, 0.2);
          background-color: white;
          transform: translateY(-1px);
        }
        
        .parcel-input:hover:not(:focus) {
          background-color: white;
          border-color: #d1d5db;
        }
        
        .parcel-input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          width: 13px;
          height: 13px;
          border-radius: 50%;
          transition: all 0.2s ease;
        }
        
        .parcel-input-icon.pickup {
          background-color: #10b981;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
        }
        
        .parcel-input-icon.dropoff {
          background-color: #ef4444;
          box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
        }
        
        /* ===== CATEGORY DROPDOWN ===== */
        .parcel-category-dropdown {
          position: fixed !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          display: flex !important;
          flex-direction: column !important;
          visibility: visible !important;
          opacity: 1 !important;
          background-color: white;
          border: 2px solid #e9d5ff;
          border-radius: 16px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
          z-index: 9999 !important;
          max-height: 70vh;
          width: 90%;
          max-width: 500px;
          overflow-y: auto;
          animation: slideUp 0.3s ease-out;
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translate(-50%, -40%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        
        /* Modal backdrop */
        .parcel-category-dropdown::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: -1;
        }
        
        .parcel-category-item {
          width: 100%;
          padding: 16px 18px;
          text-align: left;
          border-bottom: 1px solid #f3f4f6;
          transition: all 0.2s ease;
          cursor: pointer;
          font-weight: 500;
          font-size: 14px;
          color: #374151;
          background-color: white;
          display: block;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
        }
        
        .parcel-category-item:last-child {
          border-bottom: none;
        }
        
        .parcel-category-item:hover {
          background-color: #faf5ff;
          color: #9333ea;
          padding-left: 22px;
        }
        
        .parcel-category-item.selected {
          background: linear-gradient(90deg, rgba(147, 51, 234, 0.1) 0%, rgba(219, 39, 119, 0.1) 100%);
          color: #9333ea;
          font-weight: 700;
          border-left: 4px solid #9333ea;
          padding-left: 14px;
        }
        
        /* ===== DELIVERY TYPE CARDS ===== */
        .parcel-delivery-card {
          padding: 20px;
          border-radius: 14px;
          border: 2px solid #e5e7eb;
          text-align: center;
          transition: all 0.25s ease;
          background-color: #f9fafb;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        
        .parcel-delivery-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(147, 51, 234, 0.02), rgba(219, 39, 119, 0.02));
          opacity: 0;
          transition: opacity 0.25s ease;
          pointer-events: none;
        }
        
        .parcel-delivery-card:hover {
          border-color: #d8b4fe;
          background-color: #faf8ff;
          box-shadow: 0 4px 16px rgba(147, 51, 234, 0.08);
        }
        
        .parcel-delivery-card.selected {
          border-color: #9333ea;
          background: linear-gradient(135deg, #faf5ff 0%, #f5edff 100%);
          box-shadow: 0 8px 24px rgba(147, 51, 234, 0.25);
          transform: scale(1.02);
        }
        
        .parcel-delivery-card.selected::after {
          content: '✓';
          position: absolute;
          top: 8px;
          right: 12px;
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #9333ea, #db2777);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: bold;
        }
        
        .parcel-delivery-icon {
          font-size: 2rem;
          display: block;
          margin-bottom: 10px;
        }
        
        /* ===== ALERT BOXES ===== */
        .parcel-warning-box {
          background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%);
          border: 2px solid #fcd34d;
          border-radius: 13px;
          padding: 15px;
          box-shadow: 0 4px 12px rgba(250, 176, 0, 0.1);
        }
        
        .parcel-info-box {
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border: 2px solid #a5d8ff;
          border-radius: 13px;
          padding: 15px;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
        }
        
        .parcel-danger-box {
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          border: 2px solid #fca5a5;
          border-radius: 13px;
          padding: 15px;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.1);
        }
        
        .parcel-success-box {
          background: linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%);
          border: 2px solid #86efac;
          border-radius: 13px;
          padding: 15px;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1);
        }
        
        /* ===== BUTTONS ===== */
        .parcel-primary-btn {
          width: 100%;
          padding: 15px 24px;
          background: linear-gradient(135deg, #9333ea 0%, #db2777 100%);
          color: white;
          border-radius: 13px;
          font-weight: 700;
          font-size: 15px;
          transition: all 0.25s ease;
          border: none;
          outline: none;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(147, 51, 234, 0.25);
          position: relative;
          overflow: hidden;
        }
        
        .parcel-primary-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.15);
          transition: left 0.25s ease;
        }
        
        .parcel-primary-btn:hover:not(:disabled)::before {
          left: 100%;
        }
        
        .parcel-primary-btn:hover:not(:disabled) {
          box-shadow: 0 12px 24px rgba(147, 51, 234, 0.35);
          transform: translateY(-2px);
        }
        
        .parcel-primary-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 4px 12px rgba(147, 51, 234, 0.25);
        }
        
        .parcel-primary-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        
        .parcel-secondary-btn {
          flex: 1;
          padding: 13px 18px;
          border: 2px solid #d1d5db;
          border-radius: 12px;
          color: #374151;
          font-weight: 600;
          font-size: 14px;
          background-color: white;
          transition: all 0.2s ease;
          outline: none;
          cursor: pointer;
        }
        
        .parcel-secondary-btn:hover {
          background-color: #f9fafb;
          border-color: #9ca3af;
          color: #1f2937;
        }
        
        .parcel-secondary-btn:active {
          background-color: #f3f4f6;
        }
        
        /* ===== FILE UPLOAD ===== */
        .parcel-file-upload {
          width: 100%;
          padding: 18px 16px;
          border: 2px dashed #f59e0b;
          border-radius: 13px;
          color: #92400e;
          font-weight: 600;
          font-size: 14px;
          background-color: #fffbeb;
          transition: all 0.25s ease;
          cursor: pointer;
          outline: none;
        }
        
        .parcel-file-upload:hover {
          background-color: #fef3c7;
          border-color: #d97706;
          box-shadow: 0 4px 12px rgba(217, 119, 6, 0.1);
          transform: translateY(-1px);
        }
        
        .parcel-file-upload:active {
          transform: translateY(0);
        }
        
        /* ===== SUCCESS MODAL ===== */
        .parcel-success-modal {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: fadeIn 0.2s ease-out;
        }
        
        .parcel-success-content {
          background-color: white;
          border-radius: 20px;
          max-width: 420px;
          width: 100%;
          padding: 40px 32px;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          animation: scaleUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes scaleUp {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .parcel-success-icon {
          width: 88px;
          height: 88px;
          background: linear-gradient(135deg, #d1fae5, #a7f3d0);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 28px;
          font-size: 48px;
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.25);
        }
        
        /* ===== UTILITY CLASSES ===== */
        .parcel-gradient-text {
          background: linear-gradient(135deg, #9333ea, #db2777);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-weight: 700;
        }
        
        /* ===== ANIMATIONS ===== */
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-slide-up {
          animation: slideUp 0.3s ease-out;
        }
        
        @keyframes spinLoader {
          to {
            transform: rotate(360deg);
          }
        }
        
        .animate-spin {
          animation: spinLoader 1s linear infinite;
        }
        
        /* ===== RESPONSIVE STYLES ===== */
        @media (max-width: 768px) {
          header .hidden.md\:flex {
            display: none !important;
          }
          
          .parcel-main-card {
            border-radius: 16px;
            margin: 80px auto 20px;
            padding: 20px;
          }
          
          .parcel-success-content {
            padding: 32px 24px;
          }
          
          .parcel-primary-btn {
            padding: 14px 20px;
            font-size: 14px;
          }
          
          .parcel-delivery-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
        
        /* ===== SCROLLBAR STYLING ===== */
        .parcel-category-dropdown::-webkit-scrollbar {
          width: 6px;
        }
        
        .parcel-category-dropdown::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }
        
        .parcel-category-dropdown::-webkit-scrollbar-thumb {
          background: #d8b4fe;
          border-radius: 3px;
        }

        .parcel-category-dropdown::-webkit-scrollbar-thumb:hover {
          background: #c084fc;
        }

        /* ===== HERO SECTION ANIMATIONS ===== */
        @keyframes float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(2deg);
          }
        }

        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-blob {
          animation: blob 7s infinite;
        }
          border-radius: 3px;
        }
        
        .parcel-category-dropdown::-webkit-scrollbar-thumb:hover {
          background: #c084fc;
        }
        
        /* Custom Checkbox */
        .parcel-checkbox {
          width: 20px;
          height: 20px;
          margin-top: 2px;
          accent-color: #9333ea;
          cursor: pointer;
        }
        
        /* Swap Button Animation */
        @keyframes swapRotate {
          0% {
            transform: rotate(0deg);
          }
          50% {
            transform: rotate(180deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        
        .parcel-swap-btn:hover i {
          animation: swapRotate 0.5s ease;
        }
      `}</style>

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 bg-gradient-to-r from-[#0c0c1a] via-[#1a1a2e] to-[#0c0c1a] shadow-lg z-40 border-b border-[#2a2a4e]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <GatiMitraLogo variant="icon" alt="GatiMitra" className="w-12 h-12 sm:w-14 sm:h-14" />
            <span className="text-2xl font-black">
              <span className="text-[#16c2a5]">Gati</span>
              <span className="text-[#ff6b35]">Mitra</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1 bg-[#1a1a2e] rounded-full p-1 border border-[#2a2a4e]">
            {['Food', 'Ride', 'Parcel'].map((service, i) => (
              <button
                key={i}
                onClick={() => handleNavigation(i === 0 ? '/order' : i === 1 ? '/ride' : '#', ['food', 'person', 'parcel'][i] as ServiceCategory)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  service === 'Parcel'
                    ? 'bg-gradient-to-r from-[#16c2a5] to-[#0fa982] text-white'
                    : 'text-[#b0b0d0] hover:text-white hover:bg-[#2a2a4e]'
                }`}
              >
                {service}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                <button
                  onClick={() => router.push('/orders?filter=parcel&from=%2Fcourier')}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-[#16c2a5]/10 text-[#16c2a5] font-medium text-sm hover:bg-[#16c2a5]/20 transition-colors"
                >
                  <i className="fas fa-box"></i>
                  My Parcels
                </button>
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#16c2a5] to-[#0fa982] text-white font-medium text-sm hover:shadow-lg transition-all"
                >
                  <i className="fas fa-user-circle"></i>
                  {user.name || user.phone}
                </button>
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="sm:hidden w-9 h-9 rounded-full bg-gradient-to-r from-[#16c2a5] to-[#0fa982] text-white flex items-center justify-center font-bold hover:shadow-lg transition-all"
                >
                  {user.name?.charAt(0) || 'U'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-[#16c2a5] to-[#0fa982] text-white rounded-lg font-medium text-sm hover:shadow-lg transition-all"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="parcel-page mt-20 min-h-screen">
        {/* ===== PREMIUM HERO SECTION ===== */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pt-16 pb-20 sm:pt-24 sm:pb-32">

          {/* Content */}
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* LEFT SIDE - HERO TEXT & BUTTONS */}
              <div className="text-white space-y-8">
                {/* Headline */}
                <div className="space-y-4">
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight">
                    <span className="bg-gradient-to-r from-cyan-300 via-blue-200 to-purple-300 bg-clip-text text-transparent">Fast & Secure</span>
                    <br />
                    Parcel Delivery
                  </h1>
                  <p className="text-lg sm:text-xl text-slate-300 leading-relaxed max-w-xl">
                    Track, send, and manage your parcels seamlessly with GatiMitra. Fast delivery, real-time tracking, and complete peace of mind.
                  </p>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button 
                    onClick={() => {
                      setShowAppDownloadModal(true)
                    }}
                    className="group relative px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl hover:shadow-2xl transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden">
                    <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                    <span className="relative flex items-center gap-2">
                      <i className="fas fa-box"></i>
                      Send a Parcel
                    </span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      if (!isAuthenticated || !user) {
                        setIsAuthModalOpen(true)
                      } else {
                        const trackingCard = document.getElementById('tracking-card')
                        if (trackingCard) {
                          trackingCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      }
                    }}
                    className="px-8 py-4 border-2 border-cyan-400 text-cyan-300 font-bold rounded-xl hover:bg-cyan-400 hover:bg-opacity-10 transition-all duration-300 flex items-center justify-center gap-2">
                    <i className="fas fa-map-marker-alt"></i>
                    Track Your Order
                  </button>
                </div>

                {/* Trust indicators */}
                <div className="flex flex-wrap gap-6 pt-4 text-sm">
                  <div className="flex items-center gap-2 text-slate-300">
                    <div className="w-10 h-10 rounded-full bg-green-500 bg-opacity-20 flex items-center justify-center">
                      <i className="fas fa-check text-green-400 text-sm"></i>
                    </div>
                    <span>50,000+ Happy Customers</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <div className="w-10 h-10 rounded-full bg-blue-500 bg-opacity-20 flex items-center justify-center">
                      <i className="fas fa-clock text-blue-400 text-sm"></i>
                    </div>
                    <span>24/7 Support</span>
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE - TRACKING SYSTEM */}
              <div className="relative">
                {/* Tracking Card */}
                <div id="tracking-card" className="relative bg-white bg-opacity-95 backdrop-blur rounded-2xl shadow-2xl p-8 border border-white border-opacity-20">
                  {/* Card Header */}
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Track Your Parcel</h3>

                  {/* Tracking Tabs */}
                  <div className={`${!isAuthenticated ? 'pointer-events-none select-none blur-[2px] opacity-60' : ''}`}>
                  <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
                    {[
                      { id: 'mobile', label: 'Mobile', icon: 'fas fa-mobile-alt' },
                      { id: 'gmid', label: 'GM Order ID', icon: 'fas fa-barcode' },
                      { id: 'partnerid', label: 'Partner ID', icon: 'fas fa-id-card' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setTrackingType(tab.id as any)}
                        className={`flex-1 py-2.5 px-3 rounded-md font-medium transition-all duration-200 flex items-center justify-center gap-2 text-sm ${
                          trackingType === tab.id
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <i className={tab.icon}></i>
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Input Field */}
                  <div className="mb-6 space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      {trackingType === 'mobile' && 'Enter Mobile Number'}
                      {trackingType === 'gmid' && 'Enter GatiMitra Order ID'}
                      {trackingType === 'partnerid' && 'Enter Partner Order ID'}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        placeholder={
                          trackingType === 'mobile' ? '+91 XXXXX XXXXX' :
                          trackingType === 'gmid' ? 'GMC0001234' :
                          'PARTNER-12345'
                        }
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none transition-colors"
                      />
                      <i className="absolute right-4 top-1/2 -translate-y-1/2 fas fa-search text-gray-400"></i>
                    </div>
                  </div>

                  {/* Track Button */}
                  <button
                    onClick={handleTrackParcel}
                    disabled={!trackingInput.trim() || isTrackingLoading}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isTrackingLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Tracking...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-map-pin"></i>
                        Track Now
                      </>
                    )}
                  </button>

                  {/* Info Text */}
                  <p className="text-xs text-gray-500 mt-4 text-center">
                    Enter your mobile number, GatiMitra ID, or Partner tracking ID to get live updates
                  </p>
                  </div>

                  {!isAuthenticated && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/65 backdrop-blur-[1px]">
                      <div className="mx-4 w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 text-center shadow-lg">
                        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Preview (masked)</p>
                          <div className="space-y-1.5 text-xs text-gray-700">
                            <div className="flex items-center justify-between">
                              <span>Mobile</span>
                              <span className="font-semibold">+91 *****1234</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>GM Order ID</span>
                              <span className="font-semibold">GMC******</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Partner ID</span>
                              <span className="font-semibold">PARTNER-****</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">Tracking is available for logged-in users only</p>
                        <p className="mt-1 text-xs text-gray-600">Sign in to track your parcel by mobile, GM Order ID, or Partner ID.</p>
                        <button
                          type="button"
                          onClick={() => setIsAuthModalOpen(true)}
                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#16c2a5] to-[#0fa982] px-4 py-2 text-sm font-semibold text-white hover:shadow-lg transition-all"
                        >
                          <i className="fas fa-user"></i>
                          Sign In to Track
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Floating badge */}
                <div className="absolute -top-4 -right-4 bg-gradient-to-r from-green-400 to-emerald-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg flex items-center gap-2">
                  <i className="fas fa-bolt"></i>
                  Real-time Tracking
                </div>
              </div>
            </div>
          </div>
        </section>
        <div id="parcel-form" className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* BOOKING FORM CARD */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-200 parcel-main-card">
            {/* PROGRESS INDICATOR */}
            <div className="px-6 sm:px-8 pt-6 pb-4">
              <div className="flex items-center justify-between">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center flex-1">
                    <div
                      className={`parcel-progress-step ${
                        currentStep >= step ? 'active' : 'inactive'
                      }`}
                    >
                      {currentStep > step ? <i className="fas fa-check text-sm"></i> : step}
                    </div>
                    {step < 3 && (
                      <div
                        className={`parcel-progress-line ${
                          currentStep > step ? 'active' : 'inactive'
                        }`}
                      ></div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* FORM CONTENT */}
            <div className="px-6 sm:px-8 py-8">
              {/* STEP 1: LOCATIONS */}
              {currentStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <h2 className="text-2xl font-bold text-gray-900">Pickup & Delivery</h2>

                  {/* PICKUP */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Pickup Location <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="parcel-input-icon pickup"></div>
                      <input
                        type="text"
                        value={pickup}
                        onChange={(e) => setPickup(e.target.value)}
                        placeholder="Enter pickup address"
                        className="parcel-input"
                      />
                      <button className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-600 hover:bg-purple-100 p-2 rounded-full transition-colors">
                        <i className="fas fa-crosshairs text-sm"></i>
                      </button>
                    </div>
                  </div>

                  {/* SWAP BUTTON */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        const temp = pickup
                        setPickup(dropoff)
                        setDropoff(temp)
                      }}
                      className="parcel-swap-btn w-12 h-12 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gradient-to-r hover:from-purple-600 hover:to-pink-600 hover:text-white hover:border-transparent transition-all hover:shadow-lg"
                    >
                      <i className="fas fa-exchange-alt"></i>
                    </button>
                  </div>

                  {/* DELIVERY */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Delivery Location <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="parcel-input-icon dropoff"></div>
                      <input
                        type="text"
                        value={dropoff}
                        onChange={(e) => setDropoff(e.target.value)}
                        placeholder="Enter delivery address"
                        className="parcel-input"
                      />
                    </div>
                  </div>

                  {/* CONTINUE BUTTON */}
                  <button
                    onClick={() => pickup && dropoff && setShowAppDownloadModal(true)}
                    disabled={!pickup || !dropoff}
                    className="parcel-primary-btn"
                  >
                    Continue in App
                  </button>
                </div>
              )}

              {/* STEP 2: PARCEL DETAILS */}
              {currentStep === 2 && (
                <div className="space-y-6 animate-fade-in">
                  <h2 className="text-2xl font-bold text-gray-900">Parcel Details</h2>

                  {/* CATEGORY DROPDOWN */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Parcel Type <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <button
                        onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-left bg-gray-50 hover:bg-white hover:border-purple-400 transition-all flex items-center justify-between focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                      >
                        <span className={selectedCategory ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                          {selectedCategory ? parcelCategories.find(c => c.id === selectedCategory)?.name : 'Select category'}
                        </span>
                        <i
                          className={`fas fa-chevron-down text-gray-500 transition-transform ${
                            showCategoryDropdown ? 'rotate-180' : ''
                          }`}
                        ></i>
                      </button>

                      {/* MODAL BACKDROP + DROPDOWN */}
                      {showCategoryDropdown && (
                        <>
                          {/* Backdrop */}
                          <div 
                            className="fixed inset-0 z-[9998]"
                            onClick={() => setShowCategoryDropdown(false)}
                          />
                          {/* Dropdown Modal */}
                          <div className="parcel-category-dropdown">
                            <div className="p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
                              <h3 className="text-lg font-bold text-gray-900">Select Parcel Type</h3>
                            </div>
                            <div className="overflow-y-auto">
                              {parcelCategories.map((cat) => (
                                <button
                                  key={cat.id}
                                  onClick={() => {
                                    setSelectedCategory(cat.id)
                                    setShowCategoryDropdown(false)
                                  }}
                                  className={`parcel-category-item ${
                                    selectedCategory === cat.id ? 'selected' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-3xl flex-shrink-0">{cat.icon}</span>
                                    <div className="flex-1 text-left">
                                      <p className="font-semibold text-gray-900">{cat.name}</p>
                                      <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
                                      <p className="text-xs text-gray-400 mt-1">Max: ₹{formatNumber(cat.maxValue)} | Weight: {cat.maxWeight}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-sm font-bold text-purple-600">₹{cat.basePrice}+</p>
                                      {selectedCategory === cat.id && (
                                        <i className="fas fa-check text-green-500 mt-1"></i>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {selectedCategory && (
                    <>
                      {/* DECLARED VALUE */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Declared Value <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                          <input
                            type="text"
                            value={declaredValue ? formatNumber(parseInt(declaredValue)) : ''}
                            onChange={(e) => handleDeclaredValueChange(e.target.value)}
                            placeholder="Enter value"
                            className={`parcel-input pl-10 ${
                              valueError
                                ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                                : ''
                            }`}
                          />
                        </div>
                        {valueError && (
                          <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                            <i className="fas fa-exclamation-circle"></i>
                            {valueError}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Max: ₹{formatNumber(parcelCategories.find(c => c.id === selectedCategory)?.maxValue || 0)}
                        </p>
                      </div>

                      {/* WEIGHT */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Weight</label>
                        <select
                          value={parcelWeight}
                          onChange={(e) => setParcelWeight(e.target.value)}
                          className="parcel-input px-4"
                        >
                          <option value="">Select weight</option>
                          {weightOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* INVOICE UPLOAD */}
                      {isInvoiceRequired() && (
                        <div className="parcel-warning-box">
                          <p className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
                            <i className="fas fa-exclamation-triangle"></i>
                            Invoice Required
                          </p>
                          <input ref={fileInputRef} type="file" onChange={handleInvoiceUpload} className="hidden" />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="parcel-file-upload"
                          >
                            <i className="fas fa-upload"></i>
                            {invoiceFile ? 'Change Invoice' : 'Upload Invoice'}
                          </button>
                          {invoiceFile && <p className="text-xs text-amber-700 mt-2">{invoiceFile.name}</p>}
                        </div>
                      )}

                      {/* RECIPIENT */}
                      <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                        <h3 className="font-semibold text-gray-900">Recipient Info</h3>
                        <input
                          type="text"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="Name *"
                          className="parcel-input px-4 bg-white"
                        />
                        <input
                          type="tel"
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                          placeholder="Phone *"
                          className="parcel-input px-4 bg-white"
                        />
                      </div>

                      {/* BUTTONS */}
                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => setCurrentStep(1)}
                          className="parcel-secondary-btn"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => {
                            if (selectedCategory && recipientName && recipientPhone && declaredValue && !valueError) {
                              if (isInvoiceRequired() && !invoiceFile) {
                                alert('Please upload invoice')
                                return
                              }
                              setShowAppDownloadModal(true)
                            }
                          }}
                          className="parcel-primary-btn flex-1"
                        >
                          Continue in App
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* STEP 3: DELIVERY & CONFIRMATION */}
              {currentStep === 3 && (
                <div className="space-y-6 animate-fade-in">
                  <h2 className="text-2xl font-bold text-gray-900">Confirm Order</h2>

                  {/* DELIVERY TYPE */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Delivery Speed</label>
                    <div className="grid grid-cols-3 gap-3 parcel-delivery-grid">
                      {deliveryTypes.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => setSelectedDeliveryType(type.id)}
                          className={`parcel-delivery-card ${
                            selectedDeliveryType === type.id ? 'selected' : ''
                          }`}
                        >
                          <span className="parcel-delivery-icon">{type.icon}</span>
                          <p className="font-semibold text-gray-900 text-sm">{type.name}</p>
                          <p className="text-xs text-gray-500">{type.description}</p>
                          <p className="text-purple-600 font-bold text-sm mt-2">
                            ₹{Math.round((parcelCategories.find(c => c.id === selectedCategory)?.basePrice || 0) * type.multiplier)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ADDITIONAL INFO */}
                  <textarea
                    value={parcelDescription}
                    onChange={(e) => setParcelDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="parcel-input px-4 resize-none"
                  />

                  {/* SAFETY WARNING */}
                  <div className="parcel-danger-box">
                    <p className="text-sm font-semibold text-red-800 flex items-center gap-2 mb-3">
                      <i className="fas fa-shield-alt"></i>
                      Important
                    </p>
                    <ul className="text-sm text-red-700 space-y-2">
                      <li className="flex items-start gap-2">
                        <i className="fas fa-check-circle mt-0.5"></i>
                        <span>Refunds limited to declared value only</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <i className="fas fa-check-circle mt-0.5"></i>
                        <span>Parcel will be verified at pickup</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <i className="fas fa-check-circle mt-0.5"></i>
                        <span>Photo proof required</span>
                      </li>
                    </ul>
                  </div>

                  {/* PRICE BREAKDOWN */}
                  <div className="parcel-info-box">
                    <h3 className="font-semibold text-gray-900 mb-3">Price Breakdown</h3>
                    <div className="space-y-2 text-sm mb-3 pb-3 border-b border-gray-300">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Base Price</span>
                        <span className="font-medium">₹{parcelCategories.find(c => c.id === selectedCategory)?.basePrice || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Insurance (1%)</span>
                        <span className="font-medium">₹{Math.round((parseInt(declaredValue || '0')) * 0.01)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Distance</span>
                        <span className="font-medium">₹20</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-900">Total</span>
                      <span className="text-2xl font-black parcel-gradient-text">
                        ₹{calculatePrice() + Math.round(calculatePrice() * 0.05)}
                      </span>
                    </div>
                  </div>

                  {/* CONFIRMATION CHECKBOX */}
                  <label className="flex items-start gap-3 p-4 bg-purple-50 border-2 border-purple-200 rounded-xl cursor-pointer hover:bg-purple-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="parcel-checkbox"
                    />
                    <span className="text-sm text-gray-700">
                      I confirm that all details are correct and parcel value is ₹{formatNumber(parseInt(declaredValue || '0'))}.
                    </span>
                  </label>

                  {/* ACTION BUTTONS */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="parcel-secondary-btn"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleBookParcel}
                      disabled={isBooking || !termsAccepted}
                      className="parcel-primary-btn flex-1"
                    >
                      {isBooking ? (
                        <>
                          <i className="fas fa-spinner animate-spin"></i>
                          Booking...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-box"></i>
                          Place Order in App
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* SUCCESS MODAL */}
      {bookingSuccess && bookingDetails && (
        <div className="parcel-success-modal">
          <div className="parcel-success-content">
            <div className="parcel-success-icon">
              <i className="fas fa-check text-green-600 text-4xl"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Parcel Booked!</h2>
            <p className="text-gray-600 mb-6">Your parcel is ready for pickup</p>

            {bookingDetails.trackingNumber && (
              <div className="parcel-success-box mb-6">
                <p className="text-xs text-purple-600 mb-1 font-semibold">Tracking Number</p>
                <p className="text-2xl font-black text-purple-700 font-mono">{bookingDetails.trackingNumber}</p>
              </div>
            )}

            <div className="parcel-info-box mb-6 text-left space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Package</span>
                <span className="font-medium">{bookingDetails.categoryName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Value</span>
                <span className="font-medium">₹{formatNumber(bookingDetails.declaredValue)}</span>
              </div>
              <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between">
                <span className="text-gray-600 font-medium">Total</span>
                <span className="font-bold text-purple-600">₹{bookingDetails.estimatedPrice}</span>
              </div>
            </div>

            <button
              onClick={() => router.push('/orders?filter=parcel&from=%2Fcourier')}
              className="parcel-primary-btn"
            >
              View Order
            </button>
          </div>
        </div>
      )}

      {/* WHY CHOOSE GATIMITRA SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Why Choose <span className="parcel-gradient-text">GatiMitra</span>
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            India&apos;s most trusted courier service with thousands of happy customers
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: '⚡', title: 'Fast Delivery', desc: 'Same-day delivery available in major cities' },
            { icon: '🔒', title: 'Safe & Secure', desc: '100% insured packages with real-time tracking' },
            { icon: '💰', title: 'Best Prices', desc: 'Competitive rates with discounts for bulk orders' },
            { icon: '24/7', title: '24/7 Support', desc: 'Round-the-clock customer support in Hindi & English' },
          ].map((item, i) => (
            <div key={i} className="parcel-main-card p-6 text-center hover:shadow-lg transition-all">
              <div className="text-4xl mb-4">{item.icon}</div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">{item.title}</h3>
              <p className="text-sm text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 sm:p-12">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              How It Works
            </h2>
            <p className="text-gray-600">Simple 3-step process to book your parcel</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { num: '1', title: 'Book', desc: 'Enter pickup & delivery locations' },
              { num: '2', title: 'Pack', desc: 'Prepare your parcel safely' },
              { num: '3', title: 'Track', desc: 'Get real-time delivery updates' },
            ].map((step, i) => (
              <div key={i} className="relative">
                {/* Connector line */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 -right-4 w-8 h-0.5 bg-gradient-to-r from-purple to-pink"></div>
                )}
                
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple to-pink text-white font-bold text-xl mb-4 mx-auto">
                    {step.num}
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-600">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SPECIAL OFFERS SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Special Offers
          </h2>
          <p className="text-gray-600">Exclusive deals and discounts for you</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { title: '🎉 New User Special', desc: '30% off on your first parcel', code: 'FIRST30', color: 'from-orange-400 to-pink-500' },
            { title: '📦 Bulk Orders', desc: 'Flat ₹99 for 5+ parcels', code: 'BULK99', color: 'from-blue-400 to-cyan-500' },
            { title: '💳 Credit Card Offer', desc: '₹50 cashback on HDFC cards', code: 'HDFC50', color: 'from-purple-400 to-pink-500' },
            { title: '🚀 Speed Delivery', desc: '₹29 express delivery anywhere', code: 'EXPRESS29', color: 'from-green-400 to-emerald-500' },
          ].map((offer, i) => (
            <div key={i} className={`bg-gradient-to-br ${offer.color} rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition-all`}>
              <h3 className="font-bold text-xl mb-2">{offer.title}</h3>
              <p className="text-white/90 mb-4">{offer.desc}</p>
              <div className="bg-white/20 rounded-lg px-4 py-2 inline-block">
                <p className="text-xs text-white/80">Use Code:</p>
                <p className="font-mono font-bold text-lg">{offer.code}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PROMO CODE BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-gradient-to-r from-purple via-pink to-purple rounded-2xl p-8 sm:p-12 text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Have a Promo Code?</h2>
          <p className="text-white/90 mb-6 max-w-2xl mx-auto">
            Enter your promo code to unlock exclusive discounts on your next parcel delivery
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input 
              type="text" 
              placeholder="Enter promo code"
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button className="px-8 py-3 bg-white text-purple font-bold rounded-lg hover:bg-gray-100 transition-all">
              Apply
            </button>
          </div>
          <p className="text-white/70 text-sm mt-4">
            Try: FIRST30, BULK99, EXPRESS29
          </p>
        </div>
      </section>

      {/* MODALS */}
      {isAuthModalOpen && <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />}
      <UserProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      {showSwitchModal && (
        <ServiceSwitchModal
          isOpen={showSwitchModal}
          onClose={() => setShowSwitchModal(false)}
          targetService={targetService}
          onContinue={() => {
            setShowSwitchModal(false)
            router.push(targetService === 'food' ? '/order' : targetService === 'person' ? '/ride' : '#')
          }}
        />
      )}

      <AppDownloadModal
        isOpen={showAppDownloadModal}
        onClose={() => setShowAppDownloadModal(false)}
        variant="customer"
        title="Send parcels in the GatiMitra App"
        description="Web parcel booking is currently unavailable. Please download the app to send parcels."
        onLinkSent={() => setShowAppLinkToast(true)}
      />
      <AppLinkSentToast open={showAppLinkToast} onClose={() => setShowAppLinkToast(false)} />

      {/* TRACKING MODAL */}
      {showTrackingModal && trackedParcel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowTrackingModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 sm:px-8 py-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Tracking Details</h2>
                <p className="text-purple-100 text-sm mt-1">Order ID: {trackedParcel.orderNumber}</p>
              </div>
              <button
                onClick={() => setShowTrackingModal(false)}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <i className="fas fa-times text-white"></i>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Status Badge */}
              <div className={`p-4 rounded-xl text-center ${
                trackedParcel.status === 'delivered' ? 'bg-green-100' :
                trackedParcel.status === 'in_transit' ? 'bg-blue-100' :
                trackedParcel.status === 'pending' ? 'bg-yellow-100' :
                'bg-gray-100'
              }`}>
                <p className={`text-sm font-semibold uppercase tracking-wide ${
                  trackedParcel.status === 'delivered' ? 'text-green-700' :
                  trackedParcel.status === 'in_transit' ? 'text-blue-700' :
                  trackedParcel.status === 'pending' ? 'text-yellow-700' :
                  'text-gray-700'
                }`}>
                  {trackedParcel.status === 'delivered' && '✓ Delivered'}
                  {trackedParcel.status === 'in_transit' && '📦 In Transit'}
                  {trackedParcel.status === 'pending' && '⏳ Pending'}
                  {!['delivered', 'in_transit', 'pending'].includes(trackedParcel.status) && trackedParcel.status}
                </p>
                <p className="text-xs text-gray-500 mt-2">Last updated: {new Date(trackedParcel.lastUpdate).toLocaleString()}</p>
              </div>

              {/* Parcel Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Sender</p>
                  <p className="font-medium text-gray-900">{trackedParcel.senderName}</p>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Recipient</p>
                  <p className="font-medium text-gray-900">{trackedParcel.recipientName}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Category</p>
                  <p className="font-medium text-gray-900 capitalize">{trackedParcel.category}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Weight</p>
                  <p className="font-medium text-gray-900">{trackedParcel.weight || 'N/A'}</p>
                </div>
              </div>

              {/* Location Timeline */}
              <div className="space-y-4 py-4 border-y border-gray-200">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Pickup Address</p>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="fas fa-check text-white text-xs"></i>
                    </div>
                    <p className="text-sm text-gray-700">{trackedParcel.pickupAddress}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Current Location</p>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="fas fa-map-pin text-white text-xs"></i>
                    </div>
                    <p className="text-sm text-gray-700">{trackedParcel.currentLocation}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Delivery Address</p>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="fas fa-home text-gray-400 text-xs"></i>
                    </div>
                    <p className="text-sm text-gray-700">{trackedParcel.deliveryAddress}</p>
                  </div>
                </div>
              </div>

              {/* Estimated Delivery */}
              {trackedParcel.estimatedDelivery && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Estimated Delivery</p>
                  <p className="text-sm text-blue-900">{new Date(trackedParcel.estimatedDelivery).toLocaleDateString()}</p>
                </div>
              )}

              {/* Amount */}
              {trackedParcel.amount && (
                <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
                  <span className="font-semibold text-gray-700">Total Amount</span>
                  <span className="text-2xl font-bold text-purple-600">₹{formatNumber(trackedParcel.amount)}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={() => setShowTrackingModal(false)}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:shadow-lg transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRACKING ERROR MODAL */}
      {trackingError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setTrackingError(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center" onClick={(e) => e.stopPropagation()}>
            {/* NDF Image */}
            <div className="mb-6">
              <img src="/ndf.svg" alt="No Data Found" className="w-full h-auto max-w-xs mx-auto" />
            </div>
            
            {/* Error Details */}
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Parcel Not Found</h3>
            <p className="text-gray-600 mb-6 text-sm">{trackingError}</p>
            
            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => setTrackingError(null)}
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:shadow-lg transition-all"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  setTrackingError(null)
                  setTrackingInput('')
                }}
                className="w-full py-2.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-all"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  )
}