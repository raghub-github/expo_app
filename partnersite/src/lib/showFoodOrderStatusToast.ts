import { toast } from 'sonner';

/** Partner food-order status feedback — green accept, red cancel. */
export function showFoodOrderStatusToast(newStatus: string): void {
  const s = String(newStatus || '').toUpperCase();
  if (s === 'ACCEPTED') {
    toast.success('Order accepted', {
      id: `food-order-status-${s}`,
      classNames: { toast: 'mx-toast mx-toast--success' },
    });
    return;
  }
  if (s === 'CANCELLED') {
    toast.error('Order cancelled', {
      id: `food-order-status-${s}`,
      classNames: { toast: 'mx-toast mx-toast--error' },
    });
    return;
  }
  toast.success(`Order status updated to ${s}`, {
    id: `food-order-status-${s}`,
  });
}
