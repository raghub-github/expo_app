'use client'

import { useState, useEffect, createContext } from 'react'

interface FlyingItem {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  itemName: string
  image?: string
}

interface CartAnimationContextType {
  addFlyingAnimation: (item: FlyingItem) => void
}

export const CartAnimationContext = createContext<CartAnimationContextType | null>(null)

export function CartAnimationProvider({ children }: { children: React.ReactNode }) {
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([])

  const addFlyingAnimation = (item: FlyingItem) => {
    const newItem = { ...item, id: `${item.id}-${Date.now()}` }
    setFlyingItems(prev => [...prev, newItem])

    // Remove the item after animation completes
    setTimeout(() => {
      setFlyingItems(prev => prev.filter(i => i.id !== newItem.id))
    }, 1100)
  }

  return (
    <CartAnimationContext.Provider value={{ addFlyingAnimation }}>
      {children}
      <FlyingItemsContainer items={flyingItems} />
      <style jsx global>{`
        .cart-bounce {
          animation: cartBounce 360ms cubic-bezier(.2,.9,.3,1);
        }

        @keyframes cartBounce {
          0% { transform: translateY(0) scale(1); }
          40% { transform: translateY(-6px) scale(1.08); }
          70% { transform: translateY(0) scale(0.98); }
          100% { transform: translateY(0) scale(1); }
        }
      `}</style>
    </CartAnimationContext.Provider>
  )
}

function FlyingItemsContainer({ items }: { items: FlyingItem[] }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {items.map((item) => (
        <FlyingItem key={item.id} item={item} />
      ))}
    </div>
  )
}

function FlyingItem({ item }: { item: FlyingItem }) {
  // create control points for a cubic bezier path above the items for a clear arc
  const c1x = item.startX
  const c1y = Math.min(item.startY, item.endY) - 140
  const c2x = item.endX
  const c2y = Math.min(item.startY, item.endY) - 80

  // size of the flying thumbnail
  const size = 64

  // accessibility: alt text uses itemName
  return (
    <div className="fixed left-0 top-0 pointer-events-none z-[9999]" style={{ width: size, height: size }}>
      <div
        className="absolute w-full h-full rounded-xl overflow-hidden will-change-transform"
        style={{
          offsetPath: `path('M ${item.startX} ${item.startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${item.endX} ${item.endY}')`,
          offsetRotate: 'auto',
          animation: 'flyAnim 0.9s cubic-bezier(0.22,0.9,0.26,1) forwards',
          transformOrigin: 'center center',
        }}
      >
        {item.image ? (
          <img src={item.image} alt={item.itemName} className="w-full h-full object-cover rounded-xl shadow-lg" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#FF6B35] to-orange-500 flex items-center justify-center text-white text-2xl">
            <i className="fas fa-shopping-bag"></i>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes flyAnim {
          0% {
            offset-distance: 0%;
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          70% {
            offset-distance: 85%;
            transform: translate(-50%, -50%) scale(0.6);
            opacity: 1;
          }
          100% {
            offset-distance: 100%;
            transform: translate(-50%, -50%) scale(0.25);
            opacity: 0;
          }
        }

      `}</style>
    </div>
  )
}

export function useCartAnimation() {
  const context = require('react').useContext(CartAnimationContext)
  if (!context) {
    throw new Error('useCartAnimation must be used within CartAnimationProvider')
  }
  return context
}

export function triggerCartAnimation(
  itemElement: HTMLElement | null,
  cartButtonElement: HTMLElement | null,
  itemName: string,
  image: string | undefined,
  addFlyingAnimation: (item: FlyingItem) => void
) {
  if (!itemElement || !cartButtonElement) return

  const itemRect = itemElement.getBoundingClientRect()
  const cartRect = cartButtonElement.getBoundingClientRect()

  const startX = itemRect.left + itemRect.width / 2
  const startY = itemRect.top + itemRect.height / 2
  const endX = cartRect.left + cartRect.width / 2
  const endY = cartRect.top + cartRect.height / 2

  addFlyingAnimation({
    id: `item-${Date.now()}`,
    startX,
    startY,
    endX,
    endY,
    itemName,
    image,
  })

  // play a subtle bounce on the cart button to indicate drop
  try {
    cartButtonElement.classList.add('cart-bounce')
    setTimeout(() => cartButtonElement.classList.remove('cart-bounce'), 380)
  } catch (e) {
    // ignore
  }
}
