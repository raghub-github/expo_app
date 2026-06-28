import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/lib/hooks'
import { initializeCart, addItem, removeItem, updateQuantity, clearCart } from '@/lib/slices/cartSlice'
import { loadFromLocalStorage } from '@/lib/slices/cartSlice'

export const useCart = () => {
  const dispatch = useAppDispatch()
  const { items, total, restaurantId, restaurantName, lastActiveRestaurantId, restaurantOrder } = useAppSelector(state => state.cart)

  // Initialize cart from localStorage on mount
  useEffect(() => {
    const savedCart = loadFromLocalStorage()
    if (savedCart.items.length > 0 || savedCart.restaurantId) {
      dispatch(initializeCart(savedCart))
    }
  }, [dispatch])

  const addToCart = (item: any) => {
    // Support both new (basePrice + size/addons) and legacy ({ price }) call shapes
    if (typeof item.price === 'number') {
      // Legacy shape: id, name, price, quantity
      const cartId = `${item.id}::default::`
      dispatch(addItem({
        id: cartId,
        productId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        restaurantId: item.restaurantId,
        restaurantName: item.restaurantName,
        image: item.image, // Include product image
      }))
      return
    }

    const addons = item.addons || []
    const sizePrice = item.size?.price || 0
    const addonsPrice = addons.reduce((s: number, a: any) => s + a.price, 0)
    const unitPrice = (item.basePrice || 0) + sizePrice + addonsPrice

    // Create composite cart id to differentiate items with different options
    const addonIds = addons.map((a: any) => a.id).sort().join(',')
    const cartId = `${item.id}::${item.size?.id || 'default'}::${addonIds}`

    dispatch(addItem({
      id: cartId,
      productId: item.id,
      name: item.name,
      price: unitPrice,
      quantity: item.quantity || 1,
      size: item.size,
      addons: addons,
      restaurantId: item.restaurantId,
      restaurantName: item.restaurantName,
      image: item.image, // Include product image
    }))
  }

  // Check if adding item from a different restaurant (for confirmation popup)
  const isFromDifferentRestaurant = (newRestaurantId: string) => {
    if (!newRestaurantId) return false
    if (items.length === 0) return false
    // Check if any item exists from a different restaurant
    const existingRestaurantIds = new Set(items.map(i => i.restaurantId).filter(Boolean))
    return existingRestaurantIds.size > 0 && !existingRestaurantIds.has(newRestaurantId)
  }

  // Get list of unique restaurant IDs currently in cart
  const getRestaurantIdsInCart = () => {
    return Array.from(new Set(items.map(i => i.restaurantId).filter(Boolean))) as string[]
  }

  // Get items grouped by restaurant (ordered by restaurantOrder - most recent first)
  const getItemsGroupedByRestaurant = () => {
    const groups: Record<string, typeof items> = {}
    
    items.forEach(item => {
      const restId = item.restaurantId || 'unknown'
      if (!groups[restId]) {
        groups[restId] = []
      }
      groups[restId].push(item)
    })

    // Sort groups by restaurantOrder (most recent first)
    const sortedGroups: Array<{ restaurantId: string; restaurantName: string; items: typeof items }> = []
    
    // First add restaurants in order (handle undefined restaurantOrder)
    const orderList = restaurantOrder || []
    orderList.forEach(restId => {
      if (groups[restId]) {
        const restItems = groups[restId]
        sortedGroups.push({
          restaurantId: restId,
          restaurantName: restItems[0]?.restaurantName || 'Restaurant',
          items: restItems
        })
        delete groups[restId]
      }
    })
    
    // Add any remaining (shouldn't happen but fallback)
    Object.entries(groups).forEach(([restId, restItems]) => {
      sortedGroups.push({
        restaurantId: restId,
        restaurantName: restItems[0]?.restaurantName || 'Restaurant',
        items: restItems
      })
    })

    return sortedGroups
  }

  const removeFromCart = (itemId: string) => {
    // If itemId matches a cart entry id, remove directly
    const exact = items.find(i => i.id === itemId)
    if (exact) {
      dispatch(removeItem(itemId))
      return
    }

    // Otherwise try to remove by productId (remove first matching cart entry)
    const byProduct = items.find(i => i.productId === itemId)
    if (byProduct) {
      dispatch(removeItem(byProduct.id))
    }
  }

  const updateItemQuantity = (itemId: string, quantity: number) => {
    const exact = items.find(i => i.id === itemId)
    if (exact) {
      dispatch(updateQuantity({ id: itemId, quantity }))
      return
    }
    const byProduct = items.find(i => i.productId === itemId)
    if (byProduct) {
      dispatch(updateQuantity({ id: byProduct.id, quantity }))
    }
  }

  // Decrease quantity by one for the given productId (used by restaurant listing)
  const decreaseItem = (productId: string) => {
    const entry = items.find(i => i.productId === productId)
    if (!entry) return
    if (entry.quantity > 1) {
      dispatch(updateQuantity({ id: entry.id, quantity: entry.quantity - 1 }))
    } else {
      dispatch(removeItem(entry.id))
    }
  }

  // Update an existing cart entry's options (size/addons) and optionally quantity.
  // If options change resulting composite id differs, remove old entry and add new one.
  const updateItemOptions = (cartEntryId: string, basePrice: number, opts: { size?: any; addons?: any[] }, newQuantity?: number) => {
    const existing = items.find(i => i.id === cartEntryId)
    if (!existing) return

    const addons = opts.addons || []
    const sizePrice = opts.size?.price || 0
    const addonsPrice = addons.reduce((s: number, a: any) => s + a.price, 0)
    const unitPrice = basePrice + sizePrice + addonsPrice
    const addonIds = addons.map((a: any) => a.id).sort().join(',')
    const newCartId = `${existing.productId}::${opts.size?.id || 'default'}::${addonIds}`

    // If id same, just update price/size/addons/quantity via remove+add for simplicity
    if (newCartId === existing.id) {
      dispatch(updateQuantity({ id: existing.id, quantity: newQuantity ?? existing.quantity }))
      return
    }

    // Remove old entry and add new one with same or provided quantity
    dispatch(removeItem(existing.id))
    dispatch(addItem({
      id: newCartId,
      productId: existing.productId,
      name: existing.name,
      price: unitPrice,
      quantity: newQuantity ?? existing.quantity,
      size: opts.size,
      addons: addons,
      restaurantId: existing.restaurantId,
      restaurantName: existing.restaurantName,
    }))
  }

  const clearCartItems = (restaurantIds?: string[]) => {
    if (restaurantIds && restaurantIds.length > 0) {
      // Clear only items from specific restaurants
      items.forEach(item => {
        if (restaurantIds.includes(item.restaurantId || '')) {
          dispatch(removeItem(item.id))
        }
      })
    } else {
      // Clear all items
      dispatch(clearCart())
    }
  }

  const getCartQuantity = (itemId: string) => {
    // Sum quantities of all cart entries that belong to the given product id
    return items.filter(i => i.productId === itemId).reduce((s, i) => s + i.quantity, 0)
  }

  return {
    items,
    total,
    restaurantId,
    restaurantName,
    lastActiveRestaurantId,
    restaurantOrder,
    cartCount: items.reduce((sum, item) => sum + item.quantity, 0),
    addToCart,
    removeFromCart,
    updateItemQuantity,
    decreaseItem,
    updateItemOptions,
    clearCartItems,
    getCartQuantity,
    isFromDifferentRestaurant,
    getRestaurantIdsInCart,
    getItemsGroupedByRestaurant,
  }
}
