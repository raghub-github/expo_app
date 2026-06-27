import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { customers } from '@/db/customersTable'
import { customerAddresses } from '@/db/customerAddressesTable'
import { customerAddressHistory } from '@/db/customerAddressHistoryTable'

const schema = { customers, customerAddresses, customerAddressHistory }

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

export type AppDb = NonNullable<ReturnType<typeof getDb>>
