'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAppDispatch, useAppSelector } from '@/lib/hooks'
import { logout, ServiceCategory, setCurrentService } from '@/lib/slices/authSlice'
import ServiceSwitchModal from './ServiceSwitchModal'
import { truncateDisplayName } from '@/lib/truncateDisplayName'
import { useParcelServiceEnabled } from '@/components/common/ParcelServiceControl'
import { SoonBadge } from '@/components/common/SoonBadge'

interface UserProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

const serviceLabels: Record<ServiceCategory, { name: string; icon: string; color: string; route: string }> = {
  food: { name: 'Food Delivery', icon: 'fas fa-utensils', color: 'bg-[#16c2a5]', route: '/order' },
  person: { name: 'Ride Service', icon: 'fas fa-car', color: 'bg-[#0f9f89]', route: '/ride' },
  parcel: { name: 'Courier Service', icon: 'fas fa-box', color: 'bg-[#0d9488]', route: '/parcel' },
}

export default function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const pathname = usePathname()
  const { user, currentService } = useAppSelector(state => state.auth)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('food')
  const { enabled: parcelEnabled } = useParcelServiceEnabled()

  // Close logout confirm when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowLogoutConfirm(false)
      setShowSwitchModal(false)
    }
  }, [isOpen])

  if (!isOpen || !user) return null

  const displayName = truncateDisplayName(user.name || user.phone)

  const handleLogout = () => {
    dispatch(logout())
    onClose()
    router.push('/')
  }

  const formatPhoneNumber = (phone: string) => {
    return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
  }

  // Handle service click - ALWAYS show popup
  const handleServiceClick = (service: ServiceCategory) => {
    if (service === currentService) return // Don't switch to same service
    if (service === 'parcel' && !parcelEnabled) return

    // ALWAYS show switch popup - every single time
    setTargetService(service)
    setShowSwitchModal(true)
  }

  // Handle switch confirmation
  const handleSwitchContinue = () => {
    dispatch(setCurrentService(targetService))
    setShowSwitchModal(false)
    onClose()
    // Navigate to the service page
    const route = serviceLabels[targetService].route
    router.push(route)
  }

  // Determine filter and from URL based on current pathname
  const getOrdersRedirectUrl = () => {
    // Decode pathname to handle encoded URLs
    const decodedPath = decodeURIComponent(pathname || '/')
    
    if (decodedPath.includes('/order')) {
      return '/orders?filter=food&from=%2Forder'
    } else if (decodedPath.includes('/ride')) {
      return '/orders?filter=person&from=%2Fride'
    } else if (decodedPath.includes('/courier') || decodedPath.includes('/parcel')) {
      return '/orders?filter=parcel&from=%2Fcourier'
    }
    // Default to all orders from home
    return '/orders?filter=all&from=%2F'
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close profile"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[380px] flex-col border-l border-slate-200/80 bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header — GatiMitra teal / mint */}
        <div className="relative shrink-0 bg-gradient-to-br from-[#16c2a5] via-[#12b396] to-[#0f9f89] px-5 pb-5 pt-4 text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            aria-label="Close"
          >
            <i className="fas fa-times text-sm" />
          </button>
          <div className="flex items-start gap-3 pr-10">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold ring-2 ring-white/35">
              {(user.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold leading-tight" title={user.name || 'User'}>
                {displayName}
              </h2>
              <p className="mt-1 text-xs text-white/90">{formatPhoneNumber(user.phone)}</p>
              {user.email ? (
                <p className="mt-0.5 truncate text-[11px] text-white/80" title={user.email}>
                  {user.email}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="p-4">
            <div className="mb-4 flex justify-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#16c2a5]/25 bg-[#e8fbf7] px-3 py-1.5">
                <span className="text-[11px] font-medium text-slate-500">User ID</span>
                <span className="font-mono text-sm font-bold text-[#0f9f89]">{user.user_id || user.id}</span>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Your services{' '}
                <span className="font-semibold text-[#0f9f89]">(all active)</span>
              </h3>
              <div className="space-y-2">
                {(['food', 'person', 'parcel'] as ServiceCategory[]).map((service) => {
                  const info = serviceLabels[service]
                  const isCurrent = service === currentService
                  const parcelSoon = service === 'parcel' && !parcelEnabled

                  return (
                    <button
                      key={service}
                      type="button"
                      onClick={() => handleServiceClick(service)}
                      disabled={isCurrent || parcelSoon}
                      title={parcelSoon ? 'Parcel — Coming soon in your area' : undefined}
                      className={`relative flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                        isCurrent
                          ? 'cursor-default border-[#16c2a5]/35 bg-[#e8fbf7]'
                          : parcelSoon
                            ? 'cursor-not-allowed border-slate-100 bg-slate-50/80 opacity-50'
                            : 'cursor-pointer border-slate-100 bg-slate-50/80 hover:border-[#16c2a5]/30 hover:bg-[#f0fdf9]'
                      }`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${info.color} shadow-sm`}>
                        <i className={`${info.icon} text-xs text-white`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{info.name}</p>
                      </div>
                      {parcelSoon ? (
                        <SoonBadge placement="inline" />
                      ) : isCurrent ? (
                        <span className="shrink-0 rounded-full bg-[#16c2a5] px-2 py-0.5 text-[10px] font-semibold text-white">
                          Active
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-[#0f9f89]">
                          Switch <i className="fas fa-chevron-right text-[9px]" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Account status</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#0f9f89]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16c2a5]" />
                  Active
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose()
                window.location.href = getOrdersRedirectUrl()
              }}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#16c2a5] to-[#0f9f89] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
            >
              <i className="fas fa-shopping-bag text-sm" />
              My orders
            </button>

            {!showLogoutConfirm ? (
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-200/90 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <i className="fas fa-sign-out-alt" />
                Logout
              </button>
            ) : (
              <div className="rounded-xl border border-red-100 bg-red-50/80 p-3">
                <p className="mb-3 text-center text-xs text-red-800">Are you sure you want to logout?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <ServiceSwitchModal
        isOpen={showSwitchModal}
        onClose={() => setShowSwitchModal(false)}
        targetService={targetService}
        onContinue={handleSwitchContinue}
      />
    </div>
  )
}
