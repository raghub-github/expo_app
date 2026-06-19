export interface User {
  id: string;
  email: string;
  password?: string;
  name?: string;
  role: 'super_admin' | 'admin' | 'agent';
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  agentId: string;
  email: string;
  password: string;
  name?: string;
  isActive: boolean;
  isApproved: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: 'super_admin' | 'admin' | 'agent';
  description?: string;
}

export interface Permission {
  id: string;
  userId: string;
  canAccessOrders: boolean;
  canAccessFoodDepartment: boolean;
  canAccessParcelDepartment: boolean;
  canAccessPersonDepartment: boolean;
  canAccessOrderDetails: boolean;
  canCreateRefund: boolean;
  canAccessCancellation: boolean;
  canManageAgents: boolean;
  canManageDepartments: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  name: 'food' | 'parcel' | 'person';
  isEnabled: boolean;
  enabledBy?: string;
  enabledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderId: string;
  action: string;
  routedTo: string;
  orderTime: string;
  updatedTime: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  customerAddress?: string;
  customerLatLon?: string;
  merchantLatLon?: string;
  customerInstructions?: string;
  merchantId: string;
  merchantMobile: string;
  merchantLocality: string;
  parentMerchantId?: string;
  parentMerchantName?: string;
  merchantUserId?: string;
  deliveryProvider: string;
  status: 'PAYMENT DONE' | 'ACCEPTED' | 'DESPATCH READY' | 'DESPATCHED' | 'Delivered' | 'Cancelled';
  category: 'Food' | 'Fashion' | 'Grocery' | 'Pharma' | 'Pickup' | 'Catalog';
  deliveryType: 'GatiMitra' | 'Merchant';
  userType: 'Premium' | 'Very Good' | 'Good' | 'Bad' | 'VERY_GOOD';
  userId?: string;
  department: 'food' | 'parcel' | 'person';
  // Payment fields
  totalAmount?: string;
  totalCTM?: string;
  totalCashback?: string;
  deliveryFee?: string;
  paymentSource?: string;
  paymentMode?: string;
  // Rider fields
  riderProvider?: string;
  riderName?: string;
  riderMobile?: string;
  trackingOrderId?: string;
  trackingUrl?: string;
  otp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Refund {
  id: string;
  orderId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Cancellation {
  id: string;
  orderId: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}


