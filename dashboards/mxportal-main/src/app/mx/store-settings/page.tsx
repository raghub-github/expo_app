'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { supabase } from '@/lib/supabase';
import { fetchRestaurantById as fetchStoreById, fetchRestaurantByName as fetchStoreByName } from '@/lib/database'
import { MerchantStore } from '@/lib/merchantStore'
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants'
import { Clock, Phone, Save, AlertCircle, CheckCircle2, X, Zap, Shield, BarChart3, Bell, Crown, Star, Check, MapPin, Settings, Calendar, Copy, Power, Plus, Trash2, ChevronDown, ChevronUp, Gift, Target, Globe, Users, Package, CreditCard, Sparkles } from 'lucide-react'
import { Toaster, toast } from 'sonner'

export const dynamic = 'force-dynamic'

// Day types
type DayType = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

interface TimeSlot {
  id: string
  openingTime: string
  closingTime: string
}

interface DaySchedule {
  day: DayType
  label: string
  isOpen: boolean
  slots: TimeSlot[]
  is24Hours: boolean
  isOutletClosed: boolean
  duration: string
  operationalHours: number
  operationalMinutes: number
}

function StoreSettingsContent() {
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'premium' | 'timings' | 'gatimitra'>(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab')
      if (urlTab === 'premium' || urlTab === 'timings' || urlTab === 'gatimitra') return urlTab as any
    }
    return 'basic'
  })

  // Sync tab with URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (activeTab !== (params.get('tab') || 'basic')) {
        params.set('tab', activeTab)
        const newUrl = `${window.location.pathname}?${params.toString()}`
        window.history.replaceState({}, '', newUrl)
      }
    }
  }, [activeTab])
  
  const [showStoreTimingModal, setShowStoreTimingModal] = useState(false)
  const [expandedDay, setExpandedDay] = useState<DayType | null>(null)

  // Form state
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [tempOffDuration, setTempOffDuration] = useState<number | null>(null)
  const [showTempOffModal, setShowTempOffModal] = useState(false)
  const [tempOffDurationInput, setTempOffDurationInput] = useState('30')
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false)
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('23:00')
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false)
  const [phone, setPhone] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [storeDescription, setStoreDescription] = useState('')

  // Premium Benefits state
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false)
  const [smartPricing, setSmartPricing] = useState(false)
  const [prioritySupport, setPrioritySupport] = useState(false)
  const [advancedSecurity, setAdvancedSecurity] = useState(false)
  const [promoNotifications, setPromoNotifications] = useState(true)
  const [marketingAutomation, setMarketingAutomation] = useState(false)
  const [subscriptionPlan, setSubscriptionPlan] = useState<'free' | 'pro' | 'enterprise'>('pro')

  // Outlet timings state - Loaded from Supabase
  const [applyMondayToAll, setApplyMondayToAll] = useState(false)
  const [force24Hours, setForce24Hours] = useState(false)
  const [closedDay, setClosedDay] = useState<DayType | null>(null)

  // Calculate total operational time for a day
  const calculateOperationalTime = (slots: TimeSlot[]) => {
    if (slots.length === 0) return { hours: 0, minutes: 0 }
    
    let totalMinutes = 0
    slots.forEach(slot => {
      const [openHour, openMinute] = slot.openingTime.split(':').map(Number)
      const [closeHour, closeMinute] = slot.closingTime.split(':').map(Number)
      
      let openingMinutes = openHour * 60 + openMinute
      let closingMinutes = closeHour * 60 + closeMinute
      
      // Handle next day closing (e.g., 1:00 AM)
      if (closingMinutes < openingMinutes) {
        closingMinutes += 24 * 60
      }
      
      totalMinutes += closingMinutes - openingMinutes
    })
    
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    
    return { hours, minutes }
  }

  // Initial store schedule
  const initialSchedule: DaySchedule[] = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ].map(day => ({
    day: day as DayType,
    label: day.toUpperCase(),
    isOpen: false,
    slots: [],
    is24Hours: false,
    isOutletClosed: false,
    duration: '0.0 hrs',
    operationalHours: 0,
    operationalMinutes: 0
  }))

  // Store timing schedule state
  const [storeSchedule, setStoreSchedule] = useState<DaySchedule[]>(initialSchedule)

  // Load timings from merchant_store_operating_hours on page load
  const fetchTimings = async () => {
    if (!storeId) return;
    try {
      // Get store bigint id from merchant_stores
      const storeRes = await fetch(`/api/store-id?store_id=${storeId}`);
      if (!storeRes.ok) return;
      const storeData = await storeRes.json();
      if (!storeData || !storeData.id) return;
      const storeBigIntId = storeData.id;

      // Fetch timings from merchant_store_operating_hours
      const res = await fetch(`/api/outlet-timings?store_id=${storeBigIntId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data || data.error) return;

      // Debug: Log fetched timings
      console.log('Fetched timings from /api/operating-hours:', data);

      // Map DB data to DaySchedule[]
      const days: DayType[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const loadedSchedule: DaySchedule[] = days.map(day => {
        const isOpen = !!data[`${day}_open`];
        const isOutletClosed = (data.closed_days || []).includes(day);
        const slots = [];
        let is24Hours = false;

        if (data[`${day}_slot1_start`] && data[`${day}_slot1_end`]) {
          slots.push({
            id: '1',
            openingTime: data[`${day}_slot1_start`],
            closingTime: data[`${day}_slot1_end`]
          });
          if (data[`${day}_slot1_start`] === '00:00' && data[`${day}_slot1_end`] === '00:00') {
            is24Hours = true;
          }
        }
        if (data[`${day}_slot2_start`] && data[`${day}_slot2_end`]) {
          slots.push({
            id: '2',
            openingTime: data[`${day}_slot2_start`],
            closingTime: data[`${day}_slot2_end`]
          });
        }

        // Calculate duration
        let minutes = data[`${day}_total_duration_minutes`] || 0;
        let hours = Math.floor(minutes / 60);
        let mins = minutes % 60;

        return {
          day,
          label: day.toUpperCase(),
          isOpen: isOpen && !isOutletClosed,
          slots,
          is24Hours,
          isOutletClosed,
          duration: is24Hours ? '24.0 hrs' : `${hours}.${mins.toString().padStart(2, '0')} hrs`,
          operationalHours: is24Hours ? 24 : hours,
          operationalMinutes: is24Hours ? 0 : mins
        };
      });

      setStoreSchedule(loadedSchedule);
      setApplyMondayToAll(!!data.same_for_all_days);
      setForce24Hours(!!data.is_24_hours);
      setClosedDay((data.closed_days && data.closed_days.length > 0) ? data.closed_days[0] : null);
      // Do NOT override toggles based on other logic, always use DB values
    } catch (error) {
      console.error('Error loading timings:', error);
    }
  };

  useEffect(() => {
    if (storeId) {
      fetchTimings();
    }
  }, [storeId]);

  // Add a manual refresh button for debugging
  const handleRefreshTimings = () => {
    fetchTimings();
    toast.info('Refetched timings from database. Check console for details.');
  };

  // Update duration when slots change
  useEffect(() => {
    const updateDurations = () => {
      setStoreSchedule(prev => prev.map(day => {
        if (day.is24Hours) {
          return { ...day, duration: '24.0 hrs', operationalHours: 24, operationalMinutes: 0 }
        }
        if (day.isOutletClosed) {
          return { ...day, duration: '0.0 hrs', operationalHours: 0, operationalMinutes: 0 }
        }
        
        const { hours, minutes } = calculateOperationalTime(day.slots)
        return {
          ...day,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }))
    }
    
    updateDurations()
  }, [])

  // Get store ID
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams?.get('storeId') ?? null
      if (!id) id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null
      if (!id) id = DEMO_STORE_ID
      setStoreId(id)
    }
    getStoreId()
  }, [searchParams])

  // Load store data
  useEffect(() => {
    if (!storeId) return

    const loadStore = async () => {
      setIsLoading(true)
      try {
        let storeData = await fetchStoreById(storeId)
        if (!storeData && !storeId.match(/^GMM\d{4}$/)) {
          storeData = await fetchStoreByName(storeId)
        }
        if (storeData) {
          setStore(storeData)
          setIsStoreOpen(true)
          setPhone(storeData.am_mobile || '')
          setStoreName(storeData.store_name || '')
          setStoreAddress(storeData.city || '')
          setStoreDescription(storeData.description || '')
          setLatitude('')
          setLongitude('')
        }
      } catch (error) {
        console.error('Error loading store:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadStore()
  }, [storeId])

  const handleStoreToggle = () => {
    if (isStoreOpen) {
      setShowTempOffModal(true)
    } else {
      setIsStoreOpen(true)
      setTempOffDuration(null)
      toast.success('🟢 Store is now OPEN')
    }
  }

  const handleTempOff = () => {
    const duration = parseInt(tempOffDurationInput)
    if (duration <= 0) {
      toast.error('⚠️ Please enter a valid duration')
      return
    }
    setIsStoreOpen(false)
    setTempOffDuration(duration)
    toast.success(`⏱️ Store closed temporarily for ${duration} minutes`)
    setShowTempOffModal(false)
    setTempOffDurationInput('30')
  }

  const handleMXDeliveryToggle = () => {
    const newValue = !mxDeliveryEnabled
    setMxDeliveryEnabled(newValue)
    if (newValue) {
      toast.success('✅ MX Self Delivery enabled - GatiMitra delivery disabled')
    } else {
      toast.success('✅ GatiMitra Delivery will handle all deliveries')
    }
  }

  const handleSaveSettings = async () => {
    if (!phone || !latitude || !longitude) {
      toast.error('⚠️ Please fill in all required fields')
      return
    }

    setIsSaving(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 800))
      toast.success('✅ Settings saved successfully!')
    } catch (error) {
      toast.error('❌ Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePremiumFeatureToggle = (feature: string, value: boolean) => {
    if (subscriptionPlan === 'free') {
      toast.error('💎 Upgrade to Pro plan to access this feature')
      return false
    }
    toast.success(`✅ ${feature} ${value ? 'enabled' : 'disabled'}`)
    return true
  }

  const handleUpgradePlan = (plan: 'pro' | 'enterprise') => {
    setSubscriptionPlan(plan)
    if (plan === 'pro') {
      setAnalyticsEnabled(true)
      setSmartPricing(true)
      setPrioritySupport(true)
    } else {
      setAnalyticsEnabled(true)
      setSmartPricing(true)
      setPrioritySupport(true)
      setAdvancedSecurity(true)
      setMarketingAutomation(true)
    }
    toast.success(`🎉 Upgraded to ${plan === 'pro' ? 'Pro' : 'Enterprise'} plan!`)
  }

  // Store timing functions
  const toggleDayExpansion = (day: DayType) => {
    setExpandedDay(expandedDay === day ? null : day)
  }

  const handleDayToggle = (day: DayType) => {
    setStoreSchedule(prev => prev.map(d => {
      if (d.day === day) {
        const newIsOpen = !d.isOpen;
        const newSlots = (newIsOpen && !d.is24Hours && !d.isOutletClosed) ? [] : d.slots;
        const { hours, minutes } = calculateOperationalTime(newSlots);
        
        // Disable same for all when any day is modified
        if (applyMondayToAll) {
          setApplyMondayToAll(false);
        }
        
        // Disable 24 hours when any day is modified
        if (force24Hours) {
          setForce24Hours(false);
        }
        
        // If day is being opened, remove from closed day
        if (newIsOpen && closedDay === day) {
          setClosedDay(null);
        }
        
        return {
          ...d,
          isOpen: newIsOpen,
          isOutletClosed: false,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }
      return d
    }))
    toast.success(`${day.charAt(0).toUpperCase() + day.slice(1)} ${storeSchedule.find(d => d.day === day)?.isOpen ? 'closed' : 'opened'}`)
  }

  const handle24HoursToggle = (day: DayType) => {
    setStoreSchedule(prev => prev.map(d => {
      if (d.day === day) {
        const new24Hours = !d.is24Hours
        
        // Disable same for all when individual day is modified
        if (applyMondayToAll) {
          setApplyMondayToAll(false);
        }
        
        // Disable force24Hours when individual day is modified
        if (force24Hours) {
          setForce24Hours(false);
        }
        
        // Remove from closed day if enabling 24 hours
        if (new24Hours && closedDay === day) {
          setClosedDay(null);
        }
        
        return {
          ...d,
          is24Hours: new24Hours,
          isOutletClosed: false,
          slots: new24Hours ? [{ id: '1', openingTime: '00:00', closingTime: '00:00' }] : [],
          duration: new24Hours ? '24.0 hrs' : '0.0 hrs',
          operationalHours: new24Hours ? 24 : 0,
          operationalMinutes: 0
        }
      }
      return d
    }))
    toast.success(`24 Hours ${storeSchedule.find(d => d.day === day)?.is24Hours ? 'disabled' : 'enabled'} for ${day}`)
  }

  const handleOutletClosedToggle = (day: DayType) => {
    const daySchedule = storeSchedule.find(d => d.day === day)
    if (!daySchedule) return
    
    const newOutletClosed = !daySchedule.isOutletClosed
    
    setStoreSchedule(prev => prev.map(d => {
      if (d.day === day) {
        return {
          ...d,
          isOutletClosed: newOutletClosed,
          is24Hours: false,
          slots: [],
          duration: '0.0 hrs',
          operationalHours: 0,
          operationalMinutes: 0
        }
      }
      return d
    }))
    
    if (newOutletClosed) {
      setClosedDay(day)
      // Disable same for all and 24 hours when any day is closed
      setApplyMondayToAll(false);
      setForce24Hours(false);
    } else if (closedDay === day) {
      setClosedDay(null)
    }
    
    toast.success(`Outlet ${newOutletClosed ? 'closed' : 'opened'} on ${day}`)
  }

  const addTimeSlot = (day: DayType) => {
    const daySchedule = storeSchedule.find(d => d.day === day)
    if (!daySchedule || daySchedule.slots.length >= 2) {
      toast.error('Maximum 2 slots allowed per day')
      return
    }
    
    const newSlot: TimeSlot = {
      id: Date.now().toString(),
      openingTime: '14:00',
      closingTime: '18:00'
    }
    
    setStoreSchedule(prev => prev.map(d => {
      if (d.day === day) {
        const newSlots = [...d.slots, newSlot]
        const { hours, minutes } = calculateOperationalTime(newSlots)
        
        // Disable same for all when individual day is modified
        if (applyMondayToAll) {
          setApplyMondayToAll(false);
        }
        
        // Disable 24 hours when slots are added
        if (force24Hours) {
          setForce24Hours(false);
        }
        
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }
      return d
    }))
    toast.success('New time slot added')
  }

  const removeTimeSlot = (day: DayType, slotId: string) => {
    const daySchedule = storeSchedule.find(d => d.day === day)
    if (daySchedule?.slots.length === 1) {
      toast.error('At least one time slot is required')
      return
    }
    
    setStoreSchedule(prev => prev.map(d => {
      if (d.day === day) {
        const newSlots = d.slots.filter(s => s.id !== slotId)
        const { hours, minutes } = calculateOperationalTime(newSlots)
        
        // Disable same for all when individual day is modified
        if (applyMondayToAll) {
          setApplyMondayToAll(false);
        }
        
        // Disable 24 hours when slots are modified
        if (force24Hours) {
          setForce24Hours(false);
        }
        
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }
      return d
    }))
    toast.success('Time slot removed')
  }

  const updateTimeSlot = (day: DayType, slotId: string, field: 'openingTime' | 'closingTime', value: string) => {
    setStoreSchedule(prev => {
      const newSchedule = prev.map(d => {
        if (d.day === day) {
          const newSlots = d.slots.map(slot => 
            slot.id === slotId ? { ...slot, [field]: value } : slot
          )
          const { hours, minutes } = calculateOperationalTime(newSlots)
          
          // Disable same for all when individual day is modified
          if (applyMondayToAll) {
            setApplyMondayToAll(false);
          }
          
          // Disable 24 hours when slots are modified
          if (force24Hours) {
            setForce24Hours(false);
          }
          
          return {
            ...d,
            slots: newSlots,
            duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
            operationalHours: hours,
            operationalMinutes: minutes
          }
        }
        return d
      });
      
      return newSchedule;
    });
    toast.success('Time slot updated')
  }

  const copyToAllDays = () => {
    const mondaySchedule = storeSchedule.find(d => d.day === 'monday')
    if (mondaySchedule) {
      setStoreSchedule(prev => prev.map(day => ({
        ...mondaySchedule,
        day: day.day,
        label: day.label,
        isOutletClosed: false // Reset outlet closed when copying
      })))
      
      // Enable same for all
      setApplyMondayToAll(true);
      // Reset closed day
      setClosedDay(null);
      toast.success('Timings copied to all days')
    }
  }

  const saveStoreTimings = async () => {
    if (!storeId) {
      toast.error('Store ID not found!');
      return;
    }
    
    setIsSaving(true);
    
    // Prepare timings object for API
    const timings: any = { 
      store_id: storeId,
      same_for_all: applyMondayToAll,
      force_24_hours: force24Hours,
      closed_day: closedDay
    };
    
    // If 24 hours is enabled for all, set all days to 24 hours
    if (force24Hours) {
      setApplyMondayToAll(true); // Auto-enable same for all
      timings.same_for_all = true;
      storeSchedule.forEach(day => {
        const prefix = day.day;
        timings[`${prefix}_open`] = true;
        timings[`${prefix}_slot1_start`] = '00:00';
        timings[`${prefix}_slot1_end`] = '00:00';
        timings[`${prefix}_slot2_start`] = null;
        timings[`${prefix}_slot2_end`] = null;
        timings[`${prefix}_total_duration_minutes`] = 24 * 60;
      });
    } 
    // If same for all is enabled, copy Monday's schedule to all days
    else if (applyMondayToAll) {
      const monday = storeSchedule.find(d => d.day === 'monday');
      if (monday) {
        storeSchedule.forEach(day => {
          const prefix = day.day;
          timings[`${prefix}_open`] = !monday.isOutletClosed;
          timings[`${prefix}_slot1_start`] = monday.slots[0]?.openingTime || null;
          timings[`${prefix}_slot1_end`] = monday.slots[0]?.closingTime || null;
          timings[`${prefix}_slot2_start`] = monday.slots[1]?.openingTime || null;
          timings[`${prefix}_slot2_end`] = monday.slots[1]?.closingTime || null;
          timings[`${prefix}_total_duration_minutes`] = monday.is24Hours ? 24 * 60 : (monday.operationalHours * 60 + monday.operationalMinutes);
        });
        timings.closed_day = monday.isOutletClosed ? 'monday' : null;
      }
    } 
    // Otherwise, save each day individually
    else {
      storeSchedule.forEach(day => {
        const prefix = day.day;
        timings[`${prefix}_open`] = day.isOpen && !day.isOutletClosed;
        timings[`${prefix}_slot1_start`] = day.slots[0]?.openingTime || null;
        timings[`${prefix}_slot1_end`] = day.slots[0]?.closingTime || null;
        timings[`${prefix}_slot2_start`] = day.slots[1]?.openingTime || null;
        timings[`${prefix}_slot2_end`] = day.slots[1]?.closingTime || null;
        timings[`${prefix}_total_duration_minutes`] = day.is24Hours ? 24 * 60 : (day.operationalHours * 60 + day.operationalMinutes);
      });
    }
    
    // Get user email from Supabase Auth
    let userEmail = '';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userEmail = user?.email || '';
    } catch (e) {
      userEmail = '';
    }
    timings.updated_by_email = userEmail;
    timings.updated_by_at = new Date().toISOString();

    try {
      const res = await fetch('/api/outlet-timings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timings),
      });
      
      if (res.ok) {
        toast.success('✅ Store timings saved successfully!');
        // Immediately refresh timings from Supabase
        await fetchTimings();
      } else {
        const data = await res.json();
        toast.error('Failed to save timings: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      toast.error('Failed to save timings: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  const formatTimeForDisplay = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const handleClosedDayChange = (day: DayType) => {
    // First, open all days
    const updatedSchedule = storeSchedule.map(d => ({
      ...d,
      isOutletClosed: false
    }))
    
    // Then close the selected day if not empty
    const finalSchedule = updatedSchedule.map(d => 
      d.day === day ? { 
        ...d, 
        isOutletClosed: true,
        is24Hours: false,
        slots: [],
        duration: '0.0 hrs',
        operationalHours: 0,
        operationalMinutes: 0
      } : d
    )
    
    setStoreSchedule(finalSchedule)
    setClosedDay(day)
    
    // Disable same for all and 24 hours when a day is closed
    setApplyMondayToAll(false);
    setForce24Hours(false);
    
    toast.success(`Outlet closed on ${day.toUpperCase()}`)
  }

  const toggle24HoursForAll = async () => {
    const newForce24Hours = !force24Hours;
    
    if (newForce24Hours) {
      // Set all days to 24 hours (00:00-00:00)
      const newSchedule = storeSchedule.map(d => ({
        ...d,
        is24Hours: true,
        isOutletClosed: false,
        isOpen: true,
        slots: [{ id: '1', openingTime: '00:00', closingTime: '00:00' }],
        duration: '24.0 hrs',
        operationalHours: 24,
        operationalMinutes: 0
      }));
      
      setStoreSchedule(newSchedule);
      setClosedDay(null);
      setApplyMondayToAll(true); // Auto-enable same for all
      setForce24Hours(true);
      
      toast.success('24 hours enabled for all days');
    } else {
      // Disable 24 hours for all
      setForce24Hours(false);
      // Don't reset schedule, let user modify individually
      toast.success('24 hours disabled for all days');
    }
  }

  const toggleSameForAllDays = () => {
    const newSameForAll = !applyMondayToAll;
    
    if (newSameForAll) {
      const monday = storeSchedule.find(d => d.day === 'monday');
      if (monday) {
        setStoreSchedule(prev =>
          prev.map(d => ({
            ...d,
            slots: monday.slots,
            is24Hours: monday.is24Hours,
            isOutletClosed: monday.isOutletClosed,
            isOpen: monday.isOpen,
            duration: monday.duration,
            operationalHours: monday.operationalHours,
            operationalMinutes: monday.operationalMinutes
          }))
        );
        
        // If Monday is closed, set closed day
        if (monday.isOutletClosed) {
          setClosedDay('monday');
        } else {
          setClosedDay(null);
        }
        
        // If Monday is 24 hours, enable force24Hours
        if (monday.is24Hours) {
          setForce24Hours(true);
        } else {
          setForce24Hours(false);
        }
      }
      
      setApplyMondayToAll(true);
      toast.success('Same timings applied to all days');
    } else {
      setApplyMondayToAll(false);
      toast.success('Same timings disabled');
    }
  }

  const handleViewStore = () => {
    window.open('https://gatimitra.com', '_blank', 'noopener,noreferrer')
  }

  if (isLoading) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''}>
        <div className="min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-7xl mx-auto">
            {/* Header Skeleton */}
            <div className="space-y-1 mb-6">
              <div className="h-10 bg-gray-200 rounded w-1/3 animate-pulse"></div>
              <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse"></div>
            </div>
            {/* Tabs Skeleton */}
            <div className="flex border-b border-gray-200 mb-8 gap-4">
              {[1,2,3].map((i) => (
                <div key={i} className="h-10 w-32 bg-gray-200 rounded-t animate-pulse"></div>
              ))}
            </div>
            {/* Content Skeleton */}
            <div className="space-y-6">
              <div className="h-24 bg-gray-100 rounded-lg animate-pulse"></div>
              <div className="h-40 bg-gray-100 rounded-lg animate-pulse"></div>
              <div className="h-16 bg-gray-100 rounded-lg animate-pulse"></div>
            </div>
          </div>
        </div>
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <Toaster />
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || DEMO_STORE_ID}>
        <div className="min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-7xl mx-auto">
            {/* Header with Tabs */}
            <div className="mb-8">
              <div className="space-y-1 mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Store Settings</h1>
                <p className="text-sm text-gray-600">Manage your store and delivery configuration</p>
              </div>
              
              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setActiveTab('basic')}
                  className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'basic'
                      ? 'border-orange-600 text-orange-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Settings size={16} />
                  Basic Settings
                </button>
                <button
                  onClick={() => setActiveTab('premium')}
                  className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'premium'
                      ? 'border-orange-600 text-orange-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Crown size={16} />
                  Premium Benefits
                </button>
                <button
                  onClick={() => setActiveTab('timings')}
                  className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'timings'
                      ? 'border-orange-600 text-orange-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Clock size={16} />
                  Outlet Timings
                </button>
                <button
                  onClick={() => setActiveTab('gatimitra')}
                  className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'gatimitra'
                      ? 'border-orange-600 text-orange-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <img src="/gstore.png" alt="Store" className="w-5 h-5" />
                  Store on Gatimitra
                </button>
              </div>
            </div>

            {activeTab === 'basic' && (
              <div className="space-y-6">
                {/* Store Status Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-gradient-to-br from-orange-50 to-amber-50">
                      <Power size={20} className="text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 mb-2">Store Status</h3>
                          <p className="text-sm text-gray-600">Control your store availability</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-2.5 h-2.5 rounded-full ${isStoreOpen ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                            <span className={`text-sm font-semibold ${isStoreOpen ? 'text-emerald-700' : 'text-red-700'}`}>
                              {isStoreOpen ? 'STORE OPEN' : 'STORE CLOSED'}
                            </span>
                          </div>
                          {tempOffDuration && (
                            <p className="text-xs text-gray-500">Temporarily closed for {tempOffDuration} more minutes</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <button
                          onClick={handleStoreToggle}
                          className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                            isStoreOpen
                              ? 'bg-gradient-to-r from-red-50 to-orange-50 text-red-700 hover:from-red-100 hover:to-orange-100 border-2 border-red-200 hover:border-red-300'
                              : 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 hover:from-emerald-100 hover:to-green-100 border-2 border-emerald-200 hover:border-emerald-300'
                          }`}
                        >
                          <Power size={16} />
                          {isStoreOpen ? 'Close Store Temporarily' : 'Open Store'}
                        </button>
                        <button
                          onClick={handleViewStore}
                          className="py-3 px-4 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-lg font-semibold hover:from-blue-100 hover:to-indigo-100 border-2 border-blue-200 hover:border-blue-300 transition-all"
                        >
                          View Store on GatiMitra
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Store Information Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-blue-50">
                      <Settings size={20} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Store Information</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Store Name</label>
                          <input
                            type="text"
                            value={storeName}
                            onChange={(e) => setStoreName(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter store name"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Phone Number *</label>
                          <div className="flex gap-2">
                            <div className="flex items-center px-4 border border-gray-300 rounded-lg bg-gray-50">
                              <Globe size={16} className="text-gray-500" />
                              <span className="ml-2 text-gray-700">+91</span>
                            </div>
                            <input
                              type="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Enter phone number"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Address</label>
                          <input
                            type="text"
                            value={storeAddress}
                            onChange={(e) => setStoreAddress(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter store address"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Description</label>
                          <textarea
                            value={storeDescription}
                            onChange={(e) => setStoreDescription(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter store description"
                            rows={3}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Latitude *</label>
                          <input
                            type="text"
                            value={latitude}
                            onChange={(e) => setLatitude(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter latitude"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Longitude *</label>
                          <input
                            type="text"
                            value={longitude}
                            onChange={(e) => setLongitude(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter longitude"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delivery Configuration Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-orange-50">
                      <Package size={20} className="text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Delivery Configuration</h3>
                      
                      <div className="space-y-4">
                        <div className={`p-4 rounded-lg border-2 transition-colors ${
                          mxDeliveryEnabled 
                            ? 'border-orange-300 bg-orange-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Zap size={16} className="text-orange-600" />
                                <p className="font-semibold text-gray-900">MX Self Delivery</p>
                              </div>
                              <p className="text-sm text-gray-600">Use your own delivery staff</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={mxDeliveryEnabled}
                                onChange={handleMXDeliveryToggle}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                            </label>
                          </div>
                        </div>

                        <div className={`p-4 rounded-lg border-2 transition-colors ${
                          !mxDeliveryEnabled 
                            ? 'border-purple-300 bg-purple-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Users size={16} className="text-purple-600" />
                                <p className="font-semibold text-gray-900">GatiMitra Delivery</p>
                              </div>
                              <p className="text-sm text-gray-600">Partner with external delivery service</p>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                              !mxDeliveryEnabled 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {!mxDeliveryEnabled ? 'Active' : 'Inactive'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="sticky bottom-4 bg-white rounded-xl border border-gray-200 p-4 shadow-lg">
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-lg hover:from-orange-700 hover:to-orange-600 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save size={18} />
                    {isSaving ? 'Saving Settings...' : 'Save All Settings'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'premium' && (
              <div className="space-y-8">
                {/* Subscription Plans */}
                <div className="bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-2xl p-6 mb-0" style={{ marginBottom: '0', paddingBottom: '0.1875rem' }}>
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Crown className="text-amber-600" size={24} />
                        <h2 className="text-2xl font-bold text-gray-900">Premium Benefits</h2>
                      </div>
                      <p className="text-gray-600">Unlock powerful Benefits to grow your business</p>
                    </div>
                    <div className="bg-gradient-to-r from-orange-100 to-amber-100 px-4 py-2 rounded-full border border-orange-300">
                      <span className="text-orange-700 font-bold text-sm flex items-center gap-2">
                        <Star size={14} className="fill-orange-700" />
                        Current: {subscriptionPlan.charAt(0).toUpperCase() + subscriptionPlan.slice(1)} Plan
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Free Plan */}
                    <div className={`bg-white rounded-xl px-3 py-2 md:px-4 md:py-3 border-2 max-w-[270px] mx-auto ${
                      subscriptionPlan === 'free' ? 'border-orange-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
                    } transition-all`}>
                      <div className="text-center mb-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Free</h3>
                        <div className="text-3xl font-bold text-gray-900 mb-1">₹0<span className="text-sm text-gray-500 font-normal">/month</span></div>
                        <p className="text-sm text-gray-600">Perfect for getting started</p>
                      </div>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Basic Store Management</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Standard Delivery Integration</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Email Support</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <X size={16} className="text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-400">Advanced Analytics</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <X size={16} className="text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-400">Priority Support</span>
                        </div>
                      </div>
                      
                      <button
                        disabled={subscriptionPlan === 'free'}
                        onClick={() => setSubscriptionPlan('free')}
                        className={`w-full py-3 rounded-lg font-semibold transition-all ${
                          subscriptionPlan === 'free'
                            ? 'bg-gray-100 text-gray-700 cursor-default'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {subscriptionPlan === 'free' ? 'Current Plan' : 'Select Free Plan'}
                      </button>
                    </div>

                    {/* Pro Plan */}
                    <div className={`bg-gradient-to-b from-orange-50 to-white rounded-xl px-3 py-2 md:px-4 md:py-3 border-2 max-w-[270px] mx-auto relative ${
                      subscriptionPlan === 'pro' ? 'border-orange-500 shadow-xl' : 'border-orange-300 hover:border-orange-400'
                    } transition-all`}>
                      {subscriptionPlan === 'pro' && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                          <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-md">
                            RECOMMENDED
                          </div>
                        </div>
                      )}
                      
                      <div className="text-center mb-6">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Star size={16} className="text-amber-600 fill-amber-600" />
                          <h3 className="text-xl font-bold text-gray-900">Pro</h3>
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">₹999<span className="text-sm text-gray-500 font-normal">/month</span></div>
                        <p className="text-sm text-gray-600">For growing businesses</p>
                      </div>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Everything in Free</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Advanced Analytics Dashboard</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Smart Dynamic Pricing</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Priority 24/7 Support</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Promotion & Marketing Tools</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleUpgradePlan('pro')}
                        className={`w-full py-3 rounded-lg font-semibold transition-all ${
                          subscriptionPlan === 'pro'
                            ? 'bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700'
                            : 'bg-gradient-to-r from-orange-600 to-amber-600 text-white hover:from-orange-700 hover:to-amber-700'
                        }`}
                      >
                        {subscriptionPlan === 'pro' ? 'Current Plan' : 'Upgrade to Pro →'}
                      </button>
                    </div>

                    {/* Enterprise Plan */}
                    <div className={`bg-gradient-to-b from-purple-50 to-white rounded-xl px-3 py-2 md:px-4 md:py-3 border-2 max-w-[270px] mx-auto ${
                      subscriptionPlan === 'enterprise' ? 'border-purple-500 shadow-xl' : 'border-purple-300 hover:border-purple-400'
                    } transition-all`}>
                      <div className="text-center mb-6">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Crown size={16} className="text-purple-600" />
                          <h3 className="text-xl font-bold text-gray-900">Enterprise</h3>
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">₹2,499<span className="text-sm text-gray-500 font-normal">/month</span></div>
                        <p className="text-sm text-gray-600">For established businesses</p>
                      </div>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Everything in Pro</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Advanced Security Suite</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Marketing Automation</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Dedicated Account Manager</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Custom API Integrations</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleUpgradePlan('enterprise')}
                        className={`w-full py-3 rounded-lg font-semibold transition-all ${
                          subscriptionPlan === 'enterprise'
                            ? 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700'
                            : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
                        }`}
                      >
                        {subscriptionPlan === 'enterprise' ? 'Current Plan' : 'Upgrade to Enterprise →'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Premium Benefits Grid */}
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-6 mt-2" style={{ marginTop: '8px' }}>Premium Benefits</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Analytics */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-50">
                            <BarChart3 size={18} className="text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Advanced Analytics</h4>
                            <p className="text-xs text-gray-500">Real-time insights & reports</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={analyticsEnabled}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Advanced Analytics', e.target.checked)
                              if (success) setAnalyticsEnabled(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan === 'free' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {subscriptionPlan === 'free' ? 'Pro Plan Required' : 'Available'}
                      </div>
                    </div>

                    {/* Smart Pricing */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-50">
                            <Sparkles size={18} className="text-green-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Smart Pricing</h4>
                            <p className="text-xs text-gray-500">Dynamic pricing automation</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={smartPricing}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Smart Pricing', e.target.checked)
                              if (success) setSmartPricing(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan === 'free' ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {subscriptionPlan === 'free' ? 'Pro Plan Required' : 'Available'}
                      </div>
                    </div>

                    {/* Priority Support */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-amber-50">
                            <Bell size={18} className="text-amber-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Priority Support</h4>
                            <p className="text-xs text-gray-500">24/7 dedicated assistance</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={prioritySupport}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Priority Support', e.target.checked)
                              if (success) setPrioritySupport(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan === 'free' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {subscriptionPlan === 'free' ? 'Pro Plan Required' : 'Available'}
                      </div>
                    </div>

                    {/* Advanced Security */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-purple-50">
                            <Shield size={18} className="text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Advanced Security</h4>
                            <p className="text-xs text-gray-500">Enhanced protection Benefits</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={advancedSecurity}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Advanced Security', e.target.checked)
                              if (success) setAdvancedSecurity(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan !== 'enterprise' ? 'bg-gray-100 text-gray-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {subscriptionPlan !== 'enterprise' ? 'Enterprise Only' : 'Available'}
                      </div>
                    </div>

                    {/* Marketing Automation */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-pink-50">
                            <Target size={18} className="text-pink-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Marketing Automation</h4>
                            <p className="text-xs text-gray-500">Automated campaigns</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={marketingAutomation}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Marketing Automation', e.target.checked)
                              if (success) setMarketingAutomation(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan !== 'enterprise' ? 'bg-gray-100 text-gray-700' : 'bg-pink-100 text-pink-700'
                      }`}>
                        {subscriptionPlan !== 'enterprise' ? 'Enterprise Only' : 'Available'}
                      </div>
                    </div>

                    {/* Promo Notifications */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-emerald-50">
                            <Gift size={18} className="text-emerald-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Promotion Notifications</h4>
                            <p className="text-xs text-gray-500">Platform promotions & deals</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={promoNotifications}
                            onChange={(e) => setPromoNotifications(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                      <div className="text-xs px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 w-fit">
                        All Plans
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'timings' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
                  {/* Refresh Timings button removed as requested */}
                  <div className="flex flex-row flex-wrap gap-6 items-center">
                    {/* Same Timing Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Same for all days
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyMondayToAll}
                          onChange={toggleSameForAllDays}
                          className="sr-only"
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors ${applyMondayToAll ? 'bg-blue-600' : 'bg-gray-300'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${applyMondayToAll ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>

                    {/* 24 Hours Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Open 24 hours (all days)
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={force24Hours}
                          onChange={toggle24HoursForAll}
                          className="sr-only"
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors ${force24Hours ? 'bg-blue-600' : 'bg-gray-300'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${force24Hours ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>

                    {/* Closed Day Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Outlet closed on
                      </span>
                      <select
                        value={closedDay || ''}
                        onChange={(e) => {
                          const value = e.target.value as DayType
                          if (value) {
                            handleClosedDayChange(value)
                          } else {
                            // Reset closed day
                            setStoreSchedule(prev =>
                              prev.map(d => ({ ...d, isOutletClosed: false }))
                            )
                            setClosedDay(null)
                          }
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select day</option>
                        {storeSchedule.map(day => (
                          <option key={day.day} value={day.day}>
                            {day.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Weekly Summary */}
                    <div className="flex items-center gap-2">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded border border-blue-200 p-1 min-w-[180px] flex flex-col justify-center">
                        <div className="flex flex-row items-center justify-between gap-7">
                          <div>
                            <h4 className="font-semibold text-gray-900 text-[10px] leading-tight mb-0">Weekly Operational Summary</h4>
                            <p className="text-[9px] text-gray-600 leading-tight mb-0">Total operating hours this week</p>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-blue-700 leading-tight">
                              {storeSchedule.reduce((total, day) => total + day.operationalHours, 0)} hrs
                            </div>
                            <div className="text-[9px] text-gray-600 leading-tight">
                              {storeSchedule.reduce((total, day) => total + day.operationalMinutes, 0)} minutes
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={saveStoreTimings}
                        disabled={isSaving}
                        className="flex items-center gap-4.5 px-1 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed text-[12px]"
                      >
                        <Save size={25} />
                        {isSaving ? 'Saving...' : 'Save All Outlet Timings'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Compact Days Grid - 7 Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {storeSchedule.map((daySchedule) => (
                    <div key={daySchedule.day} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      {/* Day Header with Open Store Toggle */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                            daySchedule.isOutletClosed ? 'bg-red-100' : daySchedule.is24Hours ? 'bg-blue-100' : daySchedule.isOpen ? 'bg-emerald-100' : 'bg-red-100'
                          }`}>
                            {daySchedule.isOutletClosed ? (
                              <X size={14} className="text-red-600" />
                            ) : daySchedule.is24Hours ? (
                              <Clock size={14} className="text-blue-600" />
                            ) : daySchedule.isOpen ? (
                              <CheckCircle2 size={14} className="text-emerald-600" />
                            ) : (
                              <X size={14} className="text-red-600" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-sm">{daySchedule.label}</h3>
                            <p className="text-xs text-gray-500">{daySchedule.duration}</p>
                          </div>
                        </div>
                        {/* Open Store Toggle */}
                        <label className="relative inline-flex items-center cursor-pointer ml-2">
                          <input
                            type="checkbox"
                            checked={daySchedule.isOpen && !daySchedule.isOutletClosed}
                            onChange={() => handleDayToggle(daySchedule.day)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>

                      {/* Status Badge */}
                      <div className="mb-3">
                        {daySchedule.isOutletClosed ? (
                          <span className="inline-block px-2 py-1 bg-red-50 text-red-700 rounded text-xs font-medium border border-red-200">
                            🔴 OUTLET CLOSED
                          </span>
                        ) : daySchedule.is24Hours ? (
                          <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium border border-blue-200">
                            ⚡ 24 HOURS OPEN
                          </span>
                        ) : daySchedule.isOpen ? (
                          <span className="inline-block px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium border border-emerald-200">
                            🟢 STORE OPEN
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-1 bg-red-50 text-red-700 rounded text-xs font-medium border border-red-200">
                            🔴 STORE CLOSED
                          </span>
                        )}
                      </div>

                      {/* Time Slots - Direct Editing */}
                      {!daySchedule.isOutletClosed && !daySchedule.is24Hours && daySchedule.isOpen && (
                        <div className="space-y-2 mb-3">
                          {daySchedule.slots.map((slot, index) => (
                            <div key={slot.id} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500">Slot {index + 1}</span>
                                {daySchedule.slots.length > 1 && (
                                  <button
                                    onClick={() => removeTimeSlot(daySchedule.day, slot.id)}
                                    className="text-gray-400 hover:text-red-600 text-xs"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-gray-600 mb-1 block">From</label>
                                  <input
                                    type="time"
                                    value={slot.openingTime}
                                    onChange={(e) => updateTimeSlot(daySchedule.day, slot.id, 'openingTime', e.target.value)}
                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600 mb-1 block">To</label>
                                  <input
                                    type="time"
                                    value={slot.closingTime}
                                    onChange={(e) => updateTimeSlot(daySchedule.day, slot.id, 'closingTime', e.target.value)}
                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Slot Button */}
                      {!daySchedule.isOutletClosed && !daySchedule.is24Hours && daySchedule.isOpen && daySchedule.slots.length < 2 && (
                        <button
                          onClick={() => addTimeSlot(daySchedule.day)}
                          className="w-full mb-3 text-xs px-2 py-1.5 border border-dashed border-gray-300 rounded hover:border-blue-400 hover:bg-blue-50 text-blue-600 flex items-center justify-center gap-1"
                        >
                          <Plus size={12} />
                          Add Another Slot (Max 2)
                        </button>
                      )}

                      {/* Quick Actions */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => toggleDayExpansion(daySchedule.day)}
                          className="flex-1 text-xs px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                        >
                          {expandedDay === daySchedule.day ? 'Hide Options' : 'More Options'}
                        </button>
                      </div>

                      {/* Expanded Options */}
                      {expandedDay === daySchedule.day && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium text-gray-700">24 Hours Mode</p>
                              <p className="text-xs text-gray-500">Open for 24 hours</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={daySchedule.is24Hours}
                                onChange={() => handle24HoursToggle(daySchedule.day)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium text-gray-700">Close Outlet</p>
                              <p className="text-xs text-gray-500">Mark outlet as closed</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={daySchedule.isOutletClosed}
                                onChange={() => handleOutletClosedToggle(daySchedule.day)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-600"></div>
                            </label>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium text-gray-700">Open Store</p>
                              <p className="text-xs text-gray-500">Toggle store open/closed</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={daySchedule.isOpen && !daySchedule.isOutletClosed}
                                onChange={() => handleDayToggle(daySchedule.day)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Save Button */}
              </div>
            )}

            {activeTab === 'gatimitra' && (
              <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl border border-gray-200 py-12">
                <img src="/gstore.png" alt="Store" className="w-64 h-64 mb-8" style={{ maxWidth: '320px', maxHeight: '320px' }} />
                <p className="text-xl font-semibold text-center mb-6" style={{ color: '#08a353ff' }}>Experience your store from a customer's perspective on <span style={{ color: '#a89a03ff' }}>GatiMitra</span>.</p>
                <a
                  href="https://gatimitra.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-12 py-4 rounded-xl bg-gradient-to-r from-indigo-400 to-red-400 text-white font-semibold text-lg shadow-md hover:from-indigo-500 hover:to-purple-500 transition text-center"
                  style={{ display: 'inline-block' }}
                >
                  View store now
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Temp Off Modal */}
        {showTempOffModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-sm w-full">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Close Store Temporarily</h2>
                <button onClick={() => setShowTempOffModal(false)} className="text-gray-500 hover:text-gray-900">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">For how many minutes do you want to close the store?</p>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={tempOffDurationInput}
                    onChange={(e) => setTempOffDurationInput(e.target.value)}
                    min="1"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="30"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default: 30 minutes</p>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleTempOff}
                    className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold transition-colors"
                  >
                    ✓ Close for {parseInt(tempOffDurationInput) || 30} Minutes
                  </button>
                  <button
                    onClick={() => setShowTempOffModal(false)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </MXLayoutWhite>
    </>
  )
}

export default StoreSettingsContent