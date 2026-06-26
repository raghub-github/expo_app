import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  text,
  boolean,
  numeric,
  integer,
  timestamp,
  jsonb
} from "drizzle-orm/pg-core";

// =========================
// ORDERS (MASTER TABLE)
// =========================
export const orders = pgTable("orders", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderUuid: uuid("order_uuid").defaultRandom().unique(),
  orderCategory: text("order_category"),
  orderType: text("order_type"),
  vegNonVeg: text("veg_non_veg"),
  orderSource: text("order_source"),
  buyerAppName: text("buyer_app_name"),
  merchantId: bigint("merchant_id", { mode: "number" }),
  merchantParentId: bigint("merchant_parent_id", { mode: "number" }),
  merchantName: text("merchant_name"),
  merchantAddress: text("merchant_address"),
  merchantLat: numeric("merchant_lat", { precision: 10, scale: 6 }),
  merchantLng: numeric("merchant_lng", { precision: 10, scale: 6 }),
  customerId: bigint("customer_id", { mode: "number" }),
  customerName: text("customer_name"),
  customerMobile: text("customer_mobile"),
  customerEmail: text("customer_email"),
  deliveryAddressAuto: text("delivery_address_auto"),
  deliveryAddressManual: text("delivery_address_manual"),
  deliveryLat: numeric("delivery_lat", { precision: 10, scale: 6 }),
  deliveryLng: numeric("delivery_lng", { precision: 10, scale: 6 }),
  alternateMobiles: text("alternate_mobiles").array(),
  deviceType: text("device_type"),
  deviceOs: text("device_os"),
  deviceAppVersion: text("device_app_version"),
  deviceIp: text("device_ip"),
  isSelfOrder: boolean("is_self_order"),
  orderForName: text("order_for_name"),
  orderForMobile: text("order_for_mobile"),
  contactLessDelivery: boolean("contact_less_delivery"),
  specialDeliveryNotes: text("special_delivery_notes"),
  totalItemValue: numeric("total_item_value", { precision: 12, scale: 2 }),
  totalTax: numeric("total_tax", { precision: 12, scale: 2 }),
  totalDiscount: numeric("total_discount", { precision: 12, scale: 2 }),
  totalDeliveryFee: numeric("total_delivery_fee", { precision: 12, scale: 2 }),
  totalCtm: numeric("total_ctm", { precision: 12, scale: 2 }),
  totalPayable: numeric("total_payable", { precision: 12, scale: 2 }),
  hasTip: boolean("has_tip"),
  tipAmount: numeric("tip_amount", { precision: 10, scale: 2 }),
  isBulkOrder: boolean("is_bulk_order"),
  bulkReason: text("bulk_reason"),
  deliveryType: text("delivery_type"),
  deliveryInitiator: text("delivery_initiator"),
  localityType: text("locality_type"),
  deliveredBy: text("delivered_by"),
  defaultSystemKptMinutes: integer("default_system_kpt_minutes"),
  merchantUpdatedKptMinutes: integer("merchant_updated_kpt_minutes"),
  firstEta: timestamp("first_eta"),
  promisedEta: timestamp("promised_eta"),
  currentStatus: text("current_status"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// =========================
// ORDER ITEMS
// =========================
export const orderItems = pgTable("order_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).references(() => orders.id),
  itemId: bigint("item_id", { mode: "number" }),
  merchantMenuId: bigint("merchant_menu_id", { mode: "number" }),
  itemName: text("item_name"),
  itemTitle: text("item_title"),
  itemDescription: text("item_description"),
  itemImageUrl: text("item_image_url"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  quantity: integer("quantity"),
  taxPercentage: numeric("tax_percentage", { precision: 5, scale: 2 }),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }),
  customizationId: bigint("customization_id", { mode: "number" }), // FK to order_customizations
  addonId: bigint("addon_id", { mode: "number" }) // FK to order_addons
});

// =========================
// ORDER CUSTOMIZATIONS
// =========================
export const orderCustomizations = pgTable("order_customizations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderItemId: bigint("order_item_id", { mode: "number" }).references(() => orderItems.id),
  title: text("title"),
  required: boolean("required"),
  maxSelection: integer("max_selection"),
  createdAt: timestamp("created_at").defaultNow()
});

// =========================
// ORDER ADDONS
// =========================
export const orderAddons = pgTable("order_addons", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  customizationId: bigint("customization_id", { mode: "number" }).references(() => orderCustomizations.id),
  addonItemId: bigint("addon_item_id", { mode: "number" }),
  addonName: text("addon_name"),
  addonPrice: numeric("addon_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow()
});

// =========================
// ORDER STATUS HISTORY
// =========================
export const orderStatusHistory = pgTable("order_status_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).references(() => orders.id),
  status: text("status"),
  changedByApp: text("changed_by_app"),
  changedByUserId: text("changed_by_user_id"),
  changedByRole: text("changed_by_role"),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow()
});

// =========================
// ORDER PAYMENTS
// =========================
export const orderPayments = pgTable("order_payments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).references(() => orders.id),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status"),
  transactionId: text("transaction_id"),
  paidAt: timestamp("paid_at"),
  refundStatus: text("refund_status"),
  refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }),
  refundReason: text("refund_reason")
});

// =========================
// ORDER DELIVERY
// =========================
export const orderDelivery = pgTable("order_delivery", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).references(() => orders.id),
  assignedRiderId: bigint("assigned_rider_id", { mode: "number" }),
  assignedRiderName: text("assigned_rider_name"),
  assignedRiderMobile: text("assigned_rider_mobile"),
  deliveryOtp: text("delivery_otp"),
  deliveryProofImage: text("delivery_proof_image"),
  deliveryStatus: text("delivery_status"),
  pickedUpAt: timestamp("picked_up_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason")
});

// =========================
// AUDIT LOGS
// =========================
export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  action: text("action"),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  performedBy: text("performed_by"),
  performedByEmail: text("performed_by_email"),
  createdAt: timestamp("created_at").defaultNow()
});
