import {
  bigserial,
  bigint,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

/** Minimal orders_core columns for web order history (same DB as customer app). */
export const ordersCore = pgTable('orders_core', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: text('order_id'),
  orderType: text('order_type').notNull(),
  customerId: bigint('customer_id', { mode: 'number' }),
  merchantStoreId: bigint('merchant_store_id', { mode: 'number' }),
  pickupAddressRaw: text('pickup_address_raw'),
  dropAddressRaw: text('drop_address_raw'),
  status: text('status'),
  currentStatus: text('current_status'),
  grandTotal: numeric('grand_total', { precision: 12, scale: 2 }),
  placedAt: timestamp('placed_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
  formattedOrderId: text('formatted_order_id'),
  items: jsonb('items'),
  deliveryAddress: text('delivery_address'),
  paymentStatus: text('payment_status'),
  paymentMethod: text('payment_method'),
  billingSnapshot: jsonb('billing_snapshot'),
})

export const ordersFood = pgTable('orders_food', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: bigint('order_id', { mode: 'number' }),
  coreOrderId: text('core_order_id'),
  restaurantName: text('restaurant_name'),
  rejectedReason: text('rejected_reason'),
  cancelledByLabel: text('cancelled_by_label'),
  orderStatus: text('order_status'),
  foodItemsTotalValue: numeric('food_items_total_value', { precision: 12, scale: 2 }),
})

export const ordersRide = pgTable('orders_ride', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: bigint('order_id', { mode: 'number' }),
  rideType: text('ride_type'),
  pickupAddress: text('pickup_address'),
  dropAddress: text('drop_address'),
})

export const ordersParcel = pgTable('orders_parcel', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: bigint('order_id', { mode: 'number' }),
  parcelType: text('parcel_type'),
})

export const ordersCoreItems = pgTable('orders_core_items', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: text('order_id').notNull(),
  menuItemId: bigint('menu_item_id', { mode: 'number' }),
  itemName: text('item_name'),
  quantity: integer('quantity'),
  totalPrice: numeric('total_price', { precision: 12, scale: 2 }),
  basePrice: numeric('base_price', { precision: 12, scale: 2 }),
  variantName: text('variant_name'),
})
