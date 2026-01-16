import { OrderStatus } from './types'

// ============================================
// ORDER STATUS CONFIGURATION
// ============================================
export const ORDER_STATUS_CONFIG: Record<OrderStatus, { 
  label: string
  color: string
  bg: string
  icon: string
  description: string
}> = {
  pending: {
    label: 'Pending',
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    icon: '⏳',
    description: 'Order placed, awaiting confirmation',
  },
  confirmed: {
    label: 'Confirmed',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    icon: '✓',
    description: 'Order confirmed by restaurant',
  },
  preparing: {
    label: 'Preparing',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    icon: '👨‍🍳',
    description: 'Food is being prepared',
  },
  ready: {
    label: 'Ready',
    color: 'text-green-600',
    bg: 'bg-green-50',
    icon: '📦',
    description: 'Food is ready for pickup',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    icon: '🚚',
    description: 'Order is on the way',
  },
  delivered: {
    label: 'Delivered',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    icon: '🎉',
    description: 'Order delivered successfully',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-red-600',
    bg: 'bg-red-50',
    icon: '❌',
    description: 'Order has been cancelled',
  },
}

// ============================================
// PAYMENT STATUS CONFIGURATION
// ============================================
export const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-700' },
  paid: { label: 'Paid', color: 'text-green-700' },
  failed: { label: 'Failed', color: 'text-red-700' },
  refunded: { label: 'Refunded', color: 'text-blue-700' },
}

// ============================================
// VALID STATUS TRANSITIONS
// ============================================
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
}

export const isValidTransition = (from: OrderStatus, to: OrderStatus): boolean => {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

// ============================================
// PAYMENT METHOD CONFIGURATION
// ============================================
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: '💵 Cash on Delivery',
  upi: '📱 UPI',
  card: '💳 Credit/Debit Card',
  wallet: '🎁 Wallet',
}

// ============================================
// DEMO & CONFIG
// ============================================
export const DEMO_RESTAURANT_ID = 'GMM0001'
export const ITEMS_PER_PAGE = 10
export const MAX_ITEMS_PREVIEW = 2

export const TOAST_MESSAGES = {
  orderConfirmed: 'Order confirmed successfully',
  orderCancelled: 'Order cancelled successfully',
  orderUpdated: 'Order status updated',
  orderDelivered: 'Order marked as delivered',
  errorUpdating: 'Error updating order',
  errorLoading: 'Error loading orders',
}
