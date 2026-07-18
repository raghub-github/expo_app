'use client'

import { useCallback, useState } from 'react'
import EnableLocationModal from '@/components/location-search/EnableLocationModal'
import LocationSheet from '@/components/location-search/LocationSheet'
import type { LocationItem } from '@/components/location-search/LocationPopup'
import { useLocationContext } from '@/components/providers/LocationProvider'

/**
 * Global location gate for every visit:
 * - Permission denied → enable-location modal (pan-India until fixed)
 * - Manual entry sheet from that modal
 */
export default function LocationVisitGate() {
  const {
    showPermissionModal,
    setShowPermissionModal,
    requestDeviceLocation,
    locationLoading,
    setLocation,
  } = useLocationContext()
  const [showSheet, setShowSheet] = useState(false)

  const handleTryAgain = useCallback(() => {
    void requestDeviceLocation({ force: true })
  }, [requestDeviceLocation])

  const handleManual = useCallback(() => {
    setShowPermissionModal(false)
    setShowSheet(true)
  }, [setShowPermissionModal])

  const handleSelectLocation = useCallback(
    (displayName: string, item?: LocationItem) => {
      setLocation(displayName, item?.latitude ?? undefined, item?.longitude ?? undefined, {
        userInitiated: true,
        source: 'selected',
      })
      setShowSheet(false)
      setShowPermissionModal(false)
    },
    [setLocation, setShowPermissionModal]
  )

  return (
    <>
      <EnableLocationModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onTryAgain={handleTryAgain}
        onManualEntry={handleManual}
        loading={locationLoading}
      />
      <LocationSheet
        isOpen={showSheet}
        onClose={() => setShowSheet(false)}
        onSelectLocation={handleSelectLocation}
      />
    </>
  )
}
