'use client'

import { useEffect, useState } from 'react'
import { MXHeader } from '@/components/MXHeader'
import { TabNavigation } from '@/components/TabNavigation'
import { OrderTable } from '@/components/OrderTable'
import { FiltersBar } from '@/components/FiltersBar'
import { supabase } from '@/lib/supabase'
import { Order } from '@/lib/types'
import { Toaster } from 'sonner'
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton'

const DEMO_MERCHANT_ID = 'merchant_001'
const DEMO_MERCHANT_NAME = 'QFC - Quality Fried Chicken'

// Mark this as dynamic to prevent static generation
export const dynamic = 'force-dynamic'

export default function CancelledPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    async function loadOrders() {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('food_orders')
        .select('*')
        .eq('restaurant_id', DEMO_MERCHANT_ID)
        .eq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setOrders(data as Order[])
      }
      setIsLoading(false)
    }

    loadOrders()
  }, [])

  useEffect(() => {
    let filtered = orders

    if (searchTerm) {
      filtered = filtered.filter(
        (o) =>
          o.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          o.user_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredOrders(filtered)
  }, [orders, searchTerm])

  const handleFilterChange = (filters: any) => {
    setSearchTerm(filters.search || '')
  }

  return (
    <>
      <Toaster />
      <MXHeader restaurantName={DEMO_MERCHANT_NAME} />
      <TabNavigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="bg-white border-b border-gray-200 shadow-sm -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-4 mb-8">
          <div className="flex items-center gap-3">
            {/* Hamburger menu on left (mobile) */}
            <MobileHamburgerButton />
            {/* Heading - properly aligned */}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Cancelled Orders</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-0.5">Review cancelled orders and reasons</p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <FiltersBar onFilterChange={handleFilterChange} activeTab="cancelled" />
        </div>

        <OrderTable
          orders={filteredOrders}
          onStatusChange={() => {}}
          isLoading={isLoading}
          emptyMessage="No cancelled orders"
        />
      </main>
    </>
  )
}
