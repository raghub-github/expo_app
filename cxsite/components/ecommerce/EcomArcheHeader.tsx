'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAppSelector } from '@/lib/hooks'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'

const NAV_LINKS = [
  { label: 'Home', href: '/ecommerce' },
  { label: 'Shop', href: '/ecommerce' },
  { label: 'Mobiles', href: '/ecommerce/electronics/phones' },
  { label: 'Laptops', href: '/ecommerce/electronics/laptops' },
  { label: 'Appliances', href: '/ecommerce/electronics/appliances' },
  { label: 'Accessories', href: '/ecommerce/electronics/gadgets' },
]

export default function EcomArcheHeader() {
  const [searchQuery, setSearchQuery] = useState('')
  const { user, isAuthenticated } = useAppSelector((state) => state.auth)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  return (
    <>
      <header className="bg-[#0f172a] text-white sticky top-0 z-50 shadow-lg flex-shrink-0">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <Link href="/" className="flex items-center gap-2 shrink-0 no-underline text-white">
              <GatiMitraLogo alt="GatiMitra" className="h-10 w-auto object-contain" />
            </Link>

            <div className="flex-1 min-w-[200px] max-w-xl flex items-stretch rounded-lg overflow-hidden bg-white/10 border border-white/20">
              <input
                type="text"
                placeholder="Search for products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-transparent text-white placeholder-gray-400 text-sm outline-none"
              />
              <div className="relative border-l border-white/20">
                <button type="button" className="px-4 py-2.5 text-sm text-gray-300 hover:text-white flex items-center gap-1">
                  All Categories <i className="fas fa-chevron-down text-xs" />
                </button>
              </div>
              <button type="button" className="px-4 py-2.5 bg-[#ff6b35] hover:bg-[#ff8451] transition-colors">
                <i className="fas fa-search text-white" />
              </button>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[11px] text-gray-400">Want to sell with us?</span>
                <a
                  href="https://partner.gatimitra.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-semibold text-[#ff6b35] hover:text-[#ff8451] no-underline"
                >
                  Register as Merchant / Brand
                </a>
              </div>
              {isAuthenticated && user ? (
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ff6b35]/20 hover:bg-[#ff6b35]/30 text-white font-semibold text-sm transition-colors"
                >
                  <i className="fas fa-user-circle" /> {user.name || user.phone}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-2 text-sm text-gray-300 hover:text-white font-medium px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <i className="fas fa-user" /> Login / Sign Up
                </button>
              )}
              <button type="button" className="p-2 text-gray-400 hover:text-white">
                <i className="fas fa-heart" />
              </button>
              <Link href="/cart" className="relative p-2 text-gray-400 hover:text-white no-underline">
                <i className="fas fa-shopping-cart" />
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 py-3 border-t border-white/10">
            <button type="button" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm">
              <i className="fas fa-bars" /> All Categories
            </button>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="text-sm text-gray-300 hover:text-white no-underline flex items-center gap-1"
              >
                {link.label}
                {!['Home', 'Shop'].includes(link.label) && <i className="fas fa-chevron-down text-[10px]" />}
              </Link>
            ))}
            <div className="ml-auto flex items-center gap-3">
              <Link href="/ecommerce" className="text-sm text-gray-400 hover:text-[#ff6b35] no-underline flex items-center gap-1">
                <i className="fas fa-tag text-[#ff6b35]" /> Offers
              </Link>
              <span className="text-sm text-gray-400 flex items-center gap-1">
                <i className="fas fa-mobile-alt" /> Download App
              </span>
              <span className="text-sm text-gray-400 flex items-center gap-1">
                <i className="fas fa-question-circle" /> Support
              </span>
            </div>
          </div>
        </div>
      </header>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <UserProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
    </>
  )
}
