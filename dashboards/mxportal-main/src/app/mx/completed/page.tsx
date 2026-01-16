'use client'

import { useEffect, useState } from 'react'
import { MXHeader } from '@/components/MXHeader'
import { TabNavigation } from '@/components/TabNavigation'
import { OrderTable } from '@/components/OrderTable'
import { FiltersBar } from '@/components/FiltersBar'
import { supabase } from '@/lib/supabase'
import { Order } from '@/lib/types'
import { Toaster } from 'sonner'

const DEMO_MERCHANT_ID = 'merchant_001'
const DEMO_MERCHANT_NAME = 'QFC - Quality Fried Chicken'

// Mark this as dynamic to prevent static generation
export const dynamic = 'force-dynamic'

export default function CompletedPage() {
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
        .eq('status', 'delivered')
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

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Completed Orders</h2>
          <p className="text-gray-600">View your successfully delivered orders</p>
        </div>

        <div className="mb-6">
          <FiltersBar onFilterChange={handleFilterChange} activeTab="completed" />
        </div>

        <OrderTable
          orders={filteredOrders}
          onStatusChange={() => {}}
          isLoading={isLoading}
          emptyMessage="No completed orders yet"
        />
      </main>
    </>
  )
}
