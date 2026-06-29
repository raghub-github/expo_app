import { integer, pgTable, text } from 'drizzle-orm/pg-core'

export const appStaticAssets = pgTable('app_static_assets', {
  id: text('id').primaryKey(),
  app: text('app').notNull(),
  section: text('section'),
  label: text('label'),
  description: text('description'),
  r2Key: text('r2_key'),
  proxyUrl: text('proxy_url'),
  sortOrder: integer('sort_order'),
})
