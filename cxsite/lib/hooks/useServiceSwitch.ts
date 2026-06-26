'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import { 
  ServiceCategory, 
  setCurrentService, 
  getUserCategories, 
  updateUserCategories 
} from '@/lib/slices/authSlice'

export function useServiceSwitch() {
  const dispatch = useAppDispatch()
  const { user, isAuthenticated, currentService } = useAppSelector(state => state.auth)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('food')
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // Check if user needs to see service switch popup
  // Now always show popup when switching services (all users have all 3 services)
  const needsSwitchPopup = useCallback(async (newService: ServiceCategory): Promise<boolean> => {
    if (!isAuthenticated || !user) return false
    if (currentService === newService) return false
    
    // All users have all 3 services, but we still show popup on every switch
    return true
  }, [isAuthenticated, user, currentService])

  // Initiate service switch
  const initiateSwitch = useCallback(async (
    newService: ServiceCategory, 
    navigationPath?: string
  ): Promise<boolean> => {
    if (!isAuthenticated || !user) {
      // Not authenticated, just switch
      dispatch(setCurrentService(newService))
      return true // Can proceed
    }

    if (currentService === newService) {
      return true // Already on this service
    }

    // All users have all 3 services - show switch popup every time
    setTargetService(newService)
    setPendingNavigation(navigationPath || null)
    setShowSwitchModal(true)
    return false // Navigation should wait
  }, [isAuthenticated, user, currentService, dispatch])

  // Handle successful switch from modal
  const handleSwitchComplete = useCallback(() => {
    setShowSwitchModal(false)
    if (pendingNavigation) {
      // Navigate after switch
      window.location.href = pendingNavigation
    }
  }, [pendingNavigation])

  // Handle modal close (cancel)
  const handleSwitchCancel = useCallback(() => {
    setShowSwitchModal(false)
    setPendingNavigation(null)
  }, [])

  // Refresh user categories
  const refreshCategories = useCallback(async () => {
    if (!user) return
    const categories = await getUserCategories(user.phone)
    dispatch(updateUserCategories(categories))
  }, [user, dispatch])

  // On mount, refresh categories
  useEffect(() => {
    if (isAuthenticated && user) {
      refreshCategories()
    }
  }, [isAuthenticated, user, refreshCategories])

  return {
    showSwitchModal,
    targetService,
    currentService,
    initiateSwitch,
    handleSwitchComplete,
    handleSwitchCancel,
    setShowSwitchModal,
  }
}
