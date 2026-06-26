'use client'

import EcomArcheHeader from './EcomArcheHeader'
import Footer from '@/components/layout/Footer'

/** Wraps ecom pages with Ecom Arche header, main content (normal flow), and footer. Main content always shows. */
export default function EcomArcheLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f1f5f9]">
      <EcomArcheHeader />
      <main className="flex-1 w-full">
        {children}
      </main>
      <Footer />
    </div>
  )
}
