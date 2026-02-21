import { useCartStore } from "@/store/cartStore";

export function useCart() {
  const items = useCartStore((s) => s.items);
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const merchantId = useCartStore((s) => s.merchantId);
  const merchantName = useCartStore((s) => s.merchantName);
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return {
    items,
    count,
    merchantId,
    merchantName,
    subtotal,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
}
