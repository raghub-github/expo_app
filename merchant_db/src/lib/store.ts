// Placeholder: Replace with real DB logic
// Fetch stores for the user from Supabase (using parent_id as userId)
import { supabaseAdmin } from './supabase';
import { create } from 'zustand';

export async function fetchStoresForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('merchant_store')
    .select('*')
    .eq('parent_id', userId);
  if (error) {
    console.error('Error fetching stores:', error.message);
    return [];
  }
  // Optionally map/transform data to match expected shape
  return (data || []).map(store => ({
    store_id: store.id,
    store_name: store.store_name,
    full_address: store.full_address,
    store_phones: store.store_phones,
    approval_status: store.approval_status,
    is_active: store.is_active,
    parent_id: store.parent_id,
  }));
}


interface OrderStore {
  orders: Order[]
  setOrders: (orders: Order[]) => void
  addOrder: (order: Order) => void
  updateOrder: (orderId: string, updates: Partial<Order>) => void
  removeOrder: (orderId: string) => void
  newOrderCount: number
  setNewOrderCount: (count: number) => void
}

export const useOrderStore = create<OrderStore>((set) => ({
  orders: [],
  setOrders: (orders) => set({ orders }),
  addOrder: (order) =>
    set((state) => {
      const exists = state.orders.find((o) => o.id === order.id)
      if (exists) return state
      return { orders: [order, ...state.orders] }
    }),
  updateOrder: (orderId, updates) =>
    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === orderId ? { ...order, ...updates } : order
      ),
    })),
  removeOrder: (orderId) =>
    set((state) => ({
      orders: state.orders.filter((order) => order.id !== orderId),
    })),
  newOrderCount: 0,
  setNewOrderCount: (count) => set({ newOrderCount: count }),
}))

interface AuthStore {
  merchant: any | null
  setMerchant: (merchant: any) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  merchant: null,
  setMerchant: (merchant) => set({ merchant }),
  logout: () => set({ merchant: null }),
}))
