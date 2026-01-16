// ============================================
// GATIMITRA FOOD ORDERS - TYPESCRIPT TYPES
// ============================================

export type OrderStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'preparing' 
  | 'ready' 
  | 'out_for_delivery' 
  | 'delivered' 
  | 'cancelled';

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'wallet';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

// Order Item Structure
export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  size?: {
    name: string;
    price: number;
  };
  addons?: Array<{
    name: string;
    price: number;
  }>;
}

// Delivery Address
export interface DeliveryAddress {
  address: string;
  city: string;
  pincode: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
}

// Food Order Interface
export interface FoodOrder {
  order_number: string;
  
  // User info
  user_id: string;
  user_name: string;
  user_phone: string;
  user_email?: string;
  
  // Restaurant info
  restaurant_id: string;
  restaurant_name: string;
  restaurant_image?: string;
  
  // Order items
  items: OrderItem[];
  
  // Pricing
  subtotal: number;
  delivery_fee: number;
  taxes: number;
  discount: number;
  total_amount: number;
  
  // Coupon
  coupon_code?: string;
  coupon_discount?: number;
  
  // Delivery
  delivery_address: DeliveryAddress;
  delivery_instructions?: string;
  
  // Status
  status: OrderStatus;
  
  // Payment
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  confirmed_at?: string;
  estimated_delivery_time?: string;
  delivered_at?: string;
  
  // Ratings
  rating?: number;
  review?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

// Restaurant/Merchant Interface
export interface Restaurant {
  restaurant_id: string;
  restaurant_name: string;
  
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  
  email?: string;
  phone?: string;
  cuisine_type?: string;
  description?: string;
  
  address?: string;
  city: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  
  // Ratings and Reviews
  avg_rating: number;
  total_reviews: number;
  total_orders: number;

  // Store Banner
  store_banner?: string;
  
  // Business Information
  is_active: boolean;
  is_verified: boolean;
  verification_date?: string;
  
  // Operating Hours
  opening_time?: string;
  closing_time?: string;
  delivery_time_minutes?: number;
  min_order_amount?: number;
  
  // Documents and Registration
  registration_date?: string;
  gstin?: string;
  fssai_license?: string;
  pan_number?: string;
  bank_account?: string;
  ifsc_code?: string;
  
  // Metadata
  created_at: string;
  updated_at: string;
  last_login?: string;
}

// Dashboard Statistics
// Fallback type for merchant_stores table (schema-aligned, minimal)
export interface MerchantStore {
  id: number;
  store_id: string;
  store_name: string;
  city: string;
  state?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface OrderStats {
  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  preparing_orders: number;
  ready_orders: number;
  out_for_delivery_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  total_revenue: number;
  average_order_value: number;
  average_rating: number;
}

// Create Order Request
export interface CreateOrderRequest {
  user_id: string;
  user_name: string;
  user_phone: string;
  user_email?: string;
  restaurant_id: string;
  restaurant_name: string;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  taxes: number;
  discount?: number;
  delivery_address: DeliveryAddress;
  delivery_instructions?: string;
  payment_method: PaymentMethod;
  coupon_code?: string;
}

// Update Order Status Request
export interface UpdateOrderStatusRequest {
  order_id: string;
  status: OrderStatus;
  notes?: string;
}

// Legacy type alias for backward compatibility
export type Order = FoodOrder;
export interface Merchant {
  merchant_id: string;
  outlet_name: string;
  city: string;
  locality: string;
  phone: string;
  email: string;
  user_id: string;
}

export interface NotificationPayload {
  type: 'NEW_ORDER' | 'ORDER_STATUS_UPDATE' | 'ORDER_DELIVERED' | 'RIDER_PICKUP'
  order_id: string;
  message: string;
}
