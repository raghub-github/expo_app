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

const serviceLabels: Record<
  ServiceCategory,
  { name: string; icon: string; tint: string; route: string }
> = {
  food: { name: 'Food Delivery', icon: 'fas fa-utensils', tint: '#109D4C', route: '/order' },
  person: { name: 'Ride Service', icon: 'fas fa-car', tint: '#0d7a3c', route: '/ride' },
  parcel: { name: 'Courier Service', icon: 'fas fa-box', tint: '#148f4a', route: '/parcel' },
}

type NavItem = {
  label: string
  icon: string
  href?: string
  onClick?: () => void
  danger?: boolean
}

export default function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const pathname = usePathname()
  const { user, currentService } = useAppSelector((state) => state.auth)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('food')
  const { enabled: parcelEnabled } = useParcelServiceEnabled()

  useEffect(() => {
    if (!isOpen) {
      setShowLogoutConfirm(false)
      setShowSwitchModal(false)
    }
  }, [isOpen])

  if (!isOpen || !user) return null

  const displayName = truncateDisplayName(user.name || user.phone)
  const initials = (user.name || user.phone || 'U').charAt(0).toUpperCase()

  const handleLogout = () => {
    dispatch(logout())
    onClose()
    router.push('/')
  }

  const formatPhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '').slice(-10)
    if (digits.length !== 10) return phone
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  }

  const handleServiceClick = (service: ServiceCategory) => {
    if (service === currentService) return
    if (service === 'parcel' && !parcelEnabled) return
    setTargetService(service)
    setShowSwitchModal(true)
  }

  const handleSwitchContinue = () => {
    dispatch(setCurrentService(targetService))
    setShowSwitchModal(false)
    onClose()
    router.push(serviceLabels[targetService].route)
  }

  const getOrdersRedirectUrl = () => {
    const decodedPath = decodeURIComponent(pathname || '/')
    if (decodedPath.includes('/order')) return '/orders?filter=food&from=%2Forder'
    if (decodedPath.includes('/ride')) return '/orders?filter=person&from=%2Fride'
    if (decodedPath.includes('/courier') || decodedPath.includes('/parcel')) {
      return '/orders?filter=parcel&from=%2Fcourier'
    }
    return '/orders?filter=all&from=%2F'
  }

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const accountNav: NavItem[] = [
    {
      label: 'My orders',
      icon: 'fas fa-bag-shopping',
      onClick: () => {
        onClose()
        window.location.href = getOrdersRedirectUrl()
      },
    },
    {
      label: 'Reviews & feedback',
      icon: 'fas fa-star',
      href: '/reviews',
    },
    {
      label: 'Help center',
      icon: 'fas fa-circle-question',
      href: '/help-center',
    },
    {
      label: 'Support',
      icon: 'fas fa-headset',
      href: '/support',
    },
  ]

  const settingsNav: NavItem[] = [
    {
      label: 'Privacy & account',
      icon: 'fas fa-shield-halved',
      href: '/privacy-policy',
    },
    {
      label: 'Delete account',
      icon: 'fas fa-user-xmark',
      href: '/account-deletion',
      danger: true,
    },
  ]

  return (
    <div className="fixed inset-0 z-[9999]">
      <button
        type="button"
        className="absolute inset-0 bg-[#0a1f12]/45 backdrop-blur-[3px]"
        onClick={onClose}
        aria-label="Close profile"
      />

      <aside className="gm-profile-sheet absolute right-0 top-0 flex h-full w-full max-w-[400px] flex-col overflow-hidden bg-[#f4f7f5] shadow-[-12px_0_40px_rgba(16,40,24,0.18)]">
        {/* Brand header */}
        <div className="relative shrink-0 overflow-hidden bg-[#109D4C] px-5 pb-6 pt-4 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 left-8 h-36 w-36 rounded-full bg-[#0d7a3c]/50"
          />

          <div className="relative flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/85">
              GatiMitra Account
            </p>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              aria-label="Close"
            >
              <i className="fas fa-times text-sm" />
            </button>
          </div>

          <div className="relative mt-4 flex items-center gap-3.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-extrabold text-[#109D4C] shadow-sm ring-2 ring-white/40">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold leading-tight tracking-tight" title={user.name || 'User'}>
                {displayName}
              </h2>
              <p className="mt-1 text-sm text-white/90">{formatPhoneNumber(user.phone)}</p>
              {user.email ? (
                <p className="mt-0.5 truncate text-xs text-white/75" title={user.email}>
                  {user.email}
                </p>
              ) : null}
            </div>
          </div>

          <div className="relative mt-4 inline-flex items-center gap-2 rounded-lg bg-black/15 px-3 py-1.5 backdrop-blur-sm">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">ID</span>
            <span className="font-mono text-xs font-bold tracking-wide text-white">
              {user.user_id || user.id}
            </span>
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#e8f3ec] px-2 py-0.5 text-[10px] font-bold text-[#0d7a3c]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#109D4C]" />
              Active
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Quick actions */}
          <section className="px-4 pt-4">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5a6b60]">
              Activity
            </p>
            <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
              {accountNav.map((item, i) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => (item.onClick ? item.onClick() : item.href && go(item.href))}
                  className={`flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition hover:bg-[#eef6f1] ${
                    i > 0 ? 'border-t border-black/[0.05]' : ''
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f3ec] text-[#109D4C]">
                    <i className={`${item.icon} text-sm`} />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-[#142018]">{item.label}</span>
                  <i className="fas fa-chevron-right text-[10px] text-[#9aa89f]" />
                </button>
              ))}
            </div>
          </section>

          {/* Services */}
          <section className="px-4 pt-5">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5a6b60]">
              Your services
            </p>
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
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      isCurrent
                        ? 'cursor-default border-[#109D4C]/35 bg-white shadow-[0_1px_0_rgba(16,157,76,0.08)]'
                        : parcelSoon
                          ? 'cursor-not-allowed border-black/[0.04] bg-white/70 opacity-55'
                          : 'cursor-pointer border-black/[0.06] bg-white hover:border-[#109D4C]/30 hover:bg-[#eef6f1]'
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: info.tint }}
                    >
                      <i className={`${info.icon} text-sm`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#142018]">{info.name}</span>
                      <span className="mt-0.5 block text-[11px] text-[#5a6b60]">
                        {parcelSoon ? 'Coming soon' : isCurrent ? 'Currently using' : 'Tap to switch'}
                      </span>
                    </span>
                    {parcelSoon ? (
                      <SoonBadge placement="inline" />
                    ) : isCurrent ? (
                      <span className="shrink-0 rounded-full bg-[#109D4C] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        Active
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#109D4C]">
                        Switch
                        <i className="fas fa-arrow-right text-[9px]" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Settings */}
          <section className="px-4 pt-5">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5a6b60]">
              Settings
            </p>
            <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
              {settingsNav.map((item, i) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.href && go(item.href)}
                  className={`flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition hover:bg-[#eef6f1] ${
                    i > 0 ? 'border-t border-black/[0.05]' : ''
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      item.danger ? 'bg-red-50 text-red-600' : 'bg-[#e8f3ec] text-[#109D4C]'
                    }`}
                  >
                    <i className={`${item.icon} text-sm`} />
                  </span>
                  <span
                    className={`flex-1 text-sm font-semibold ${
                      item.danger ? 'text-red-600' : 'text-[#142018]'
                    }`}
                  >
                    {item.label}
                  </span>
                  <i className="fas fa-chevron-right text-[10px] text-[#9aa89f]" />
                </button>
              ))}
            </div>
          </section>

          {/* Logout */}
          <section className="mt-auto px-4 pb-6 pt-5">
            {!showLogoutConfirm ? (
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-3 py-3.5 text-sm font-bold text-red-600 transition hover:bg-red-50"
              >
                <i className="fas fa-right-from-bracket" />
                Log out
              </button>
            ) : (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-3.5">
                <p className="mb-3 text-center text-sm font-medium text-red-800">
                  Log out of GatiMitra?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 rounded-xl border border-black/10 bg-white py-2.5 text-sm font-bold text-[#333] transition hover:bg-[#f7f7f5]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
            <p className="mt-3 text-center text-[10px] font-medium tracking-wide text-[#8a9a90]">
              GatiMitra On Demand Services Pvt. Ltd.
            </p>
          </section>
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
