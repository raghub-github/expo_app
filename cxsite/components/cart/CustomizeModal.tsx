'use client'

import { useState, useEffect } from 'react'

interface AddOn {
  id: string
  name: string
  price: number
}

interface SizeOption {
  id: string
  name: string
  price: number
}

interface MenuItemForModal {
  id: string
  name: string
  basePrice: number
  sizes?: SizeOption[]
  addons?: AddOn[]
  image?: string
}

export default function CustomizeModal({
  open,
  onClose,
  item,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  item?: MenuItemForModal | null
  onConfirm: (selection: { quantity: number; size?: SizeOption; addons?: AddOn[] }) => void
}) {
  const [quantity, setQuantity] = useState(1)
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null)
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (open) {
      setQuantity(1)
      setSelectedSizeId(item?.sizes?.[0]?.id ?? null)
      setSelectedAddOns({})
    }
  }, [open, item])

  if (!open || !item) return null

  const toggleAddOn = (id: string) => {
    setSelectedAddOns(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const confirm = () => {
    const addons = item.addons?.filter(a => selectedAddOns[a.id]) ?? []
    const selectedSize = item.sizes?.find(s => s.id === selectedSizeId) ?? undefined
    onConfirm({ quantity, size: selectedSize, addons })
    onClose()
  }

  const unitPrice = () => {
    const base = item.basePrice
    const sizePrice = item.sizes?.find(s => s.id === selectedSizeId)?.price ?? 0
    const addonsPrice = item.addons?.filter(a => selectedAddOns[a.id]).reduce((s, a) => s + a.price, 0) ?? 0
    return base + sizePrice + addonsPrice
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold">Customize {item.name}</h3>
            <p className="text-sm text-gray-600">Choose size and add-ons</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="font-semibold">Size</h4>
            <div className="mt-2 flex gap-2 flex-wrap">
              {item.sizes?.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSizeId(s.id)}
                  className={`px-3 py-2 border rounded-lg ${selectedSizeId === s.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}
                >
                  {s.name} (+₹{s.price})
                </button>
              ))}
              {!item.sizes && <div className="text-sm text-gray-500">No size options</div>}
            </div>
          </div>

          <div>
            <h4 className="font-semibold">Add-ons</h4>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {item.addons?.map(a => (
                <label key={a.id} className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer">
                  <input type="checkbox" checked={!!selectedAddOns[a.id]} onChange={() => toggleAddOn(a.id)} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-gray-500">+₹{a.price}</div>
                  </div>
                </label>
              ))}
              {!item.addons && <div className="text-sm text-gray-500">No add-ons</div>}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-3 py-1 bg-gray-100 rounded">−</button>
              <div className="px-4 font-bold">{quantity}</div>
              <button onClick={() => setQuantity(q => q + 1)} className="px-3 py-1 bg-gray-100 rounded">+</button>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Unit</div>
              <div className="font-bold">₹{unitPrice()}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={confirm} className="flex-1 px-4 py-3 bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white font-bold rounded-lg">Add to Cart</button>
            <button onClick={onClose} className="px-4 py-3 border border-gray-200 rounded-lg">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
