'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import { ServiceCategory, setCurrentService } from '@/lib/slices/authSlice'
import { useParcelServiceEnabled } from '@/components/common/ParcelServiceControl'
import { SoonBadge } from '@/components/common/SoonBadge'

export default function QuickCategories() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user, isAuthenticated, currentService } = useAppSelector(state => state.auth)
  const [showVoucherPopup, setShowVoucherPopup] = useState(false)
  const { enabled: parcelEnabled } = useParcelServiceEnabled()
  
  // Service switch modal states
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('food')
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // Map paths to services (correct mapping)
  // /order page = food service
  // /ride page = person service (ride booking)
  // /courier page = parcel service (courier/parcel delivery)
  const pathToService: Record<string, ServiceCategory> = {
    '/order': 'food',
    '/ride': 'person',    // RidePage uses 'person' service
    '/courier': 'parcel', // CourierPage uses 'parcel' service
  }

  // Handle navigation with service switch check
  const handleServiceNavigation = (path: string, targetServiceOverride?: ServiceCategory) => {
    const service = targetServiceOverride || pathToService[path]
    if (service === 'parcel' && !parcelEnabled) return
    if (!service) {
      router.push(path)
      return
    }

    if (!isAuthenticated || !user) {
      // Not authenticated, just navigate (service check will happen on destination page)
      router.push(path)
      return
    }

    // All users have access to all 3 services
    if (service === currentService) {
      router.push(path)
    } else {
      // Show switch modal with correct target service
      setTargetService(service)
      setPendingNavigation(path)
      setShowSwitchModal(true)
    }
  }

  // Handle successful switch
  const handleSwitchComplete = () => {
    setShowSwitchModal(false)
    if (pendingNavigation) {
      router.push(pendingNavigation)
      setPendingNavigation(null)
    }
  }

  const categories = [
    {
      tag: 'Food Delivery',
      title: 'Order Your Meal',
      image: '/img/food.png', // Real food icon
      href: '/order',
      service: 'food' as ServiceCategory,
      iconBg: 'from-[#FF6B35]/20 to-[#FF6B35]/10',
      borderColor: 'rgba(255, 107, 53, 0.3)',
      gradient: 'from-[#FF6B35] to-[#FF9500]',
    },
    {
      tag: 'Book a Ride',
      title: 'Request a Ride',
      image: '/img/ridecard.png', // Custom taxi icon (place the provided image in public/img/taxi-icon.png)
      href: '/ride',
      service: 'person' as ServiceCategory,
      iconBg: 'from-[#4b2ad4]/20 to-[#4b2ad4]/10',
      borderColor: 'rgba(75, 42, 212, 0.3)',
      gradient: 'from-[#4b2ad4] to-[#7E69AB]',
    },
    {
      tag: 'Courier Service',
      title: 'Send Parcels',
      image: '/img/parcelcard.png', // Real package icon
      href: '/courier#parcel-form',
      service: 'parcel' as ServiceCategory,
      iconBg: 'from-[#16c2a5]/20 to-[#16c2a5]/10',
      borderColor: 'rgba(22, 194, 165, 0.3)',
      gradient: 'from-[#16c2a5] to-[#2DCCCD]',
    },
    {
      tag: 'E-Commerce',
      title: 'Elect and Ecom',
      image: '/img/ecomer.png',
      href: '/ecommerce',
      iconBg: 'from-[#2196F3]/20 to-[#2196F3]/10',
      borderColor: 'rgba(33, 150, 243, 0.3)',
      gradient: 'from-[#2196F3] to-[#03A9F4]',
    },
    {
      tag: 'Deals & Offers',
      title: 'Online Vouchers',
      image: '/img/voucher.png', // Real discount icon
      href: '#',
      onClick: () => setShowVoucherPopup(true),
      iconBg: 'from-[#FF4081]/20 to-[#FF4081]/10',
      borderColor: 'rgba(255, 64, 129, 0.3)',
      gradient: 'from-[#FF4081] to-[#FF6EC7]',
    },
    {
      tag: 'Explore Nearby',
      title: 'Near Me',
      image: '/img/loc.png', // Real location icon
      href: '/india/All/Stores?view=near',
      iconBg: 'from-[#9C27B0]/20 to-[#9C27B0]/10',
      borderColor: 'rgba(156, 39, 176, 0.3)',
      gradient: 'from-[#9C27B0] to-[#E040FB]',
    },
  ]

  return (
    <>
      <section className="px-4 md:px-6 lg:px-8 py-8 relative overflow-visible z-30 -mt-[100px]" style={{ pointerEvents: 'auto' }}>
       {/* Categories grid - full width with even gaps, no overlap */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-5 w-full max-w-[1400px] mx-auto drop-shadow-2xl" style={{zIndex: 30, gridAutoRows: '1fr'}}>
          {categories.map((category, index) => {
            const isParcelSoon = category.service === 'parcel' && !parcelEnabled
            // Create card content
            const cardContent = (
              <div
                className={`w-full min-w-0 h-[135px] rounded-[15px] relative overflow-hidden group transition-all duration-300 flex flex-col justify-between bg-[#ffffff] border ${
                  isParcelSoon ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:-translate-y-[6px]'
                }`}
                style={{
                  border: `1px solid ${category.borderColor}`,
                  boxShadow: '0 8px 32px rgba(7, 0, 0, 0.08), inset 0 1px 0 rgba(108, 107, 107, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.05)',
                  backdropFilter: 'blur(18px)',
                  WebkitBackdropFilter: 'blur(18px)'
                }}
              >
                {isParcelSoon ? <SoonBadge placement="corner" className="right-2 top-2" /> : null}
                {/* Card tag (bordered) at top-left */}
                <div className="absolute top-3 left-3 z-20">
                  <div 
                    className="text-[9px] rounded-[5px] font-semibold px-3 py-1 inline-block tracking-wide border"
                    style={{
                      background: `linear-gradient(135deg, ${category.iconBg})`,
                      borderColor: category.borderColor,
                      color: '#171818',
                      letterSpacing: '0.3px'
                    }}
                  >
                    {category.tag}
                  </div>
                </div>
                {/* Card image at top-right */}
                <div className="absolute top-3 right-3 z-10">
                  <div className="w-[98px] h-[98px] flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <img
                      src={category.image}
                      alt={category.title}
                      className="w-[98px] h-[98px] object-contain drop-shadow-xxxl"
                    />
                  </div>
                </div>
                {/* Card title (main text) lower at bottom-left */}
                <div className="absolute left-3 bottom-5 z-20 text-left">
                  <h3
                    className="text-[15px] font-extrabold mb-[-5px] text-gray-800 leading-tight px-1 drop-shadow-lg mt-4 font-poppins tracking-wide"
                    style={{letterSpacing: '0.5px'}}
                  >
                    {category.title}
                  </h3>
                </div>
                {/* Hover glow effect */}
                <div 
                  className="absolute inset-0 rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 80% 20%, ${category.iconBg.split(' ')[0]} 0%, transparent 70%)`,
                    boxShadow: `inset 0 0 40px ${category.iconBg.split(' ')[0].replace('/20', '/10')}`
                  }}
                ></div>
                {/* Shine effect on hover */}
                <div 
                  className="absolute inset-0 rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)',
                  }}
                ></div>
              </div>
            )

            // Return different wrapper based on category type
            if (category.onClick) {
              return (
                <div 
                  key={index} 
                  onClick={category.onClick} 
                  className="cursor-pointer"
                >
                  {cardContent}
                </div>
              )
            }

            // For service-based categories, use click handler for service switching
            if (category.service) {
              return (
                <div 
                  key={index} 
                  onClick={() => !isParcelSoon && handleServiceNavigation(category.href, category.service)}
                  className={isParcelSoon ? 'cursor-not-allowed' : 'cursor-pointer'}
                  title={isParcelSoon ? 'Parcel — Coming soon in your area' : undefined}
                  aria-disabled={isParcelSoon}
                >
                  {cardContent}
                </div>
              )
            }

            // For regular links (without service switching)
            return (
              <Link key={index} href={category.href || '/'} className="block">
                {cardContent}
              </Link>
            )
          })}
        </div>
      </section>

      {showVoucherPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[22px] max-w-[420px] text-center shadow-[0_30px_80px_rgba(0,0,0,0.4)] animate-popupScale relative">
            <button
              onClick={() => setShowVoucherPopup(false)}
              className="absolute top-[18px] right-[22px] text-2xl cursor-pointer text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
            <h2 className="text-2xl mb-3 text-purple">Coming Soon 🚀</h2>
            <p className="text-[15px] text-gray-600 leading-relaxed">
              We&apos;re working on exciting deals & vouchers.<br />
              This feature will be live very soon on GatiMitra.
            </p>
            <button
              onClick={() => setShowVoucherPopup(false)}
              className="mt-5 px-7 py-3 border-none rounded-[30px] bg-gradient-to-br from-pink to-purple text-white font-semibold cursor-pointer hover:shadow-lg transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      )}
      
      {/* Service Switch Modal */}
      <ServiceSwitchModal
        isOpen={showSwitchModal}
        onClose={() => { setShowSwitchModal(false); setPendingNavigation(null); }}
        targetService={targetService}
        onContinue={handleSwitchComplete}
      />
    </>
  )
}