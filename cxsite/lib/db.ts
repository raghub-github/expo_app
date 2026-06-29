import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { customers } from '@/db/customersTable'
import { customerAddresses } from '@/db/customerAddressesTable'
import { customerAddressHistory } from '@/db/customerAddressHistoryTable'
import {
  ordersCore,
  ordersCoreItems,
  ordersFood,
  ordersParcel,
  ordersRide,
} from '@/db/hybridOrdersTables'
import { userAppCategory } from '@/db/userAppCategoryTable'
import { appStaticAssets } from '@/db/appStaticAssetsTable'

const schema = {
  customers,
  customerAddresses,
  customerAddressHistory,
  ordersCore,
  ordersFood,
  ordersRide,
  ordersParcel,
  ordersCoreItems,
  userAppCategory,
  appStaticAssets,
}

declare global {
  var __gatimitra_postgres: ReturnType<typeof postgres> | undefined
}

function getConnectionString(): string | null {
  const url = process.env.DATABASE_URL
  return url && url.length > 0 ? url : null
}

export function isCustomersDbConfigured(): boolean {
  return Boolean(getConnectionString())
}

export function getDb() {
  const url = getConnectionString()
  if (!url) return null

  if (!globalThis.__gatimitra_postgres) {
    globalThis.__gatimitra_postgres = postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }

  return drizzle(globalThis.__gatimitra_postgres, { schema })
}

/** Raw postgres.js client for commission resolver and other tagged SQL. */
export function getSql() {
  const url = getConnectionString()
  if (!url) return null
  if (!globalThis.__gatimitra_postgres) {
    globalThis.__gatimitra_postgres = postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }
  return globalThis.__gatimitra_postgres
}

export type AppDb = NonNullable<ReturnType<typeof getDb>>
