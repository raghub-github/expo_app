import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface CartAddOn {
  id: string
  name: string
  price: number
}

interface CartSize {
  id: string
  name: string
  price: number
}

interface CartItem {
  // `id` is a unique cart entry id (composite of product + options)
  id: string
  productId: string
  name: string
  price: number // final unit price (base + size + addons)
  quantity: number
  size?: CartSize
  addons?: CartAddOn[]
  restaurantId?: string
  restaurantName?: string
  image?: string // product image URL
}

interface CartState {
  items: CartItem[]
  total: number
  restaurantId?: string
  restaurantName?: string
  lastActiveRestaurantId?: string // Most recently added restaurant (for sorting)
  restaurantOrder: string[] // Order of restaurants by most recent activity (first = most recent)
}

const initialState: CartState = {
  items: [],
  total: 0,
  restaurantId: undefined,
  restaurantName: undefined,
  lastActiveRestaurantId: undefined,
  restaurantOrder: [],
}

// Load cart from localStorage on client side
const loadFromLocalStorage = (): CartState => {
  if (typeof window === 'undefined') return initialState
  try {
    const stored = localStorage.getItem('cartState')
    return stored ? JSON.parse(stored) : initialState
  } catch {
    return initialState
  }
}

// Save cart to localStorage
const saveToLocalStorage = (state: CartState) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('cartState', JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save cart to localStorage:', error)
  }
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem: (state, action: PayloadAction<CartItem>) => {
      const payload = action.payload
      const newRestaurantId = payload.restaurantId

      // Update restaurant order (most recent first) - multi-restaurant support
      if (newRestaurantId) {
        // Remove from current position if exists (handle undefined restaurantOrder)
        state.restaurantOrder = (state.restaurantOrder || []).filter(id => id !== newRestaurantId)
        // Add to front (most recent)
        state.restaurantOrder.unshift(newRestaurantId)
        
        // Track last active restaurant
        state.lastActiveRestaurantId = newRestaurantId
        
        // Keep legacy fields for backward compatibility
        state.restaurantId = newRestaurantId
        state.restaurantName = payload.restaurantName
      }

      // Find existing item by composite id
      const existingItem = state.items.find(item => item.id === payload.id)

      if (existingItem) {
        existingItem.quantity += payload.quantity
        // Update image if provided
        if (payload.image) {
          existingItem.image = payload.image
        }
      } else {
        state.items.push(payload)
      }

      state.total = state.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      saveToLocalStorage(state)
    },
    
    removeItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(item => item.id !== action.payload)
      state.total = state.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      
      // Clean up restaurantOrder - remove restaurants with no items
      const activeRestaurantIds = new Set(state.items.map(i => i.restaurantId).filter(Boolean))
      state.restaurantOrder = (state.restaurantOrder || []).filter(id => activeRestaurantIds.has(id))
      
      // If cart is empty, reset restaurant info
      if (state.items.length === 0) {
        state.restaurantId = undefined
        state.restaurantName = undefined
        state.lastActiveRestaurantId = undefined
        state.restaurantOrder = []
      }
      
      saveToLocalStorage(state)
    },
    
    updateQuantity: (state, action: PayloadAction<{ id: string; quantity: number }>) => {
      const item = state.items.find(item => item.id === action.payload.id)
      if (item) {
        item.quantity = action.payload.quantity
        if (item.quantity <= 0) {
          state.items = state.items.filter(i => i.id !== action.payload.id)
        }
      }
      state.total = state.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      
      // Clean up restaurantOrder - remove restaurants with no items
      const activeRestaurantIds = new Set(state.items.map(i => i.restaurantId).filter(Boolean))
      state.restaurantOrder = (state.restaurantOrder || []).filter(id => activeRestaurantIds.has(id))
      
      // If cart is empty, reset restaurant info
      if (state.items.length === 0) {
        state.restaurantId = undefined
        state.restaurantName = undefined
        state.lastActiveRestaurantId = undefined
        state.restaurantOrder = []
      }
      
      saveToLocalStorage(state)
    },
    
    clearCart: (state) => {
      state.items = []
      state.total = 0
      state.restaurantId = undefined
      state.restaurantName = undefined
      state.lastActiveRestaurantId = undefined
      state.restaurantOrder = []
      saveToLocalStorage(state)
    },
    
    initializeCart: (state, action: PayloadAction<CartState>) => {
      return action.payload
    },
  },
})

export const { addItem, removeItem, updateQuantity, clearCart, initializeCart } = cartSlice.actions
export { loadFromLocalStorage }

export default cartSlice.reducer


