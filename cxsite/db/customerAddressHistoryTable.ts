import { bigint, bigserial, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/** Audit / recently-used trail for customer address picks (links to customer_addresses.id). */
export const customerAddressHistory = pgTable('customer_address_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  addressId: bigint('address_id', { mode: 'number' }).notNull(),
  customerId: bigint('customer_id', { mode: 'number' }).notNull(),
  addressSnapshot: jsonb('address_snapshot').notNull(),
  changeType: text('change_type').notNull(),
  changedFields: text('changed_fields').array(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})
