import {
  bigserial,
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/** Subset of public.customers used for web auth (maps to full table in Postgres). */
export const customers = pgTable('customers', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  customerId: text('customer_id').notNull(),
  fullName: text('full_name').notNull(),
  email: text('email'),
  primaryMobile: text('primary_mobile').notNull(),
  referralCode: text('referral_code'),
  referredBy: text('referred_by'),
  /** Stored as enum in DB; Drizzle sends text — Postgres casts. */
  accountStatus: text('account_status').notNull().default('ACTIVE'),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  customerUuid: uuid('customer_uuid').notNull().defaultRandom(),
  smsPermission: boolean('sms_permission').default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  createdVia: text('created_via').default('app'),
  profileCompleted: boolean('profile_completed').default(false),
  addressLine1: text('address_line1'),
  city: text('city'),
  state: text('state'),
  pincode: text('pincode'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
})
