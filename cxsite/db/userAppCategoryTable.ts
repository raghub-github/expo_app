import { bigserial, integer, pgTable, text } from 'drizzle-orm/pg-core'

/** Browse tiles — same table as customer app GET /v1/user-app/categories. */
export const userAppCategory = pgTable('user_app_category', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  displayOrder: integer('display_order').notNull().default(0),
  storeType: text('store_type').notNull(),
  status: text('status').notNull(),
})
