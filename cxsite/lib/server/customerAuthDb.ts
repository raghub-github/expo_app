import { customers } from '@/db/customersTable'
import type { AppDb } from '@/lib/db'
import {
  primaryMobileLookupVariantsFromNormalized,
  primaryMobileLookupVariantsFromRaw,
} from '@/lib/phoneNormalize'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

const GMMS_PREFIX = 'GMMS'
const GMMS_ID_LENGTH = 4

function formatGMMSId(num: number): string {
  return `${GMMS_PREFIX}${String(num).padStart(GMMS_ID_LENGTH, '0')}`
}

function parseGMMSId(id: string): number {
  if (!id || !id.startsWith(GMMS_PREFIX)) return 0
  const numPart = id.replace(GMMS_PREFIX, '')
  return parseInt(numPart, 10) || 0
}

function variantsForLookup(phoneInput: string): string[] {
  const fromRaw = primaryMobileLookupVariantsFromRaw(phoneInput)
  if (fromRaw.length) return fromRaw
  return primaryMobileLookupVariantsFromNormalized(phoneInput)
}

export async function findCustomerByPrimaryMobile(db: AppDb, phoneInput: string) {
  const variants = variantsForLookup(phoneInput)
  if (!variants.length) return null
  const rows = await db
    .select()
    .from(customers)
    .where(and(inArray(customers.primaryMobile, variants), isNull(customers.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export async function customerExists(db: AppDb, phoneInput: string): Promise<boolean> {
  const row = await findCustomerByPrimaryMobile(db, phoneInput)
  return row != null
}

export async function getNextGMMSCustomerId(db: AppDb): Promise<string> {
  const rows = await db
    .select({ customerId: customers.customerId })
    .from(customers)
    .where(sql`${customers.customerId} ~ '^GMMS[0-9]+$'`)
    .orderBy(desc(customers.id))
    .limit(1)

  if (!rows.length) return formatGMMSId(1)

  const n = parseGMMSId(rows[0].customerId)
  return formatGMMSId(n + 1)
}

export function mapCustomerRowToUserPayload(row: typeof customers.$inferSelect) {
  return {
    id: String(row.id),
    user_id: row.customerId,
    name: row.fullName,
    user_number: row.primaryMobile,
    email: row.email ?? null,
    address_line1: row.addressLine1 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
  }
}

export async function insertCustomer(db: AppDb, input: {
  customerId: string
  fullName: string
  primaryMobile: string
  email?: string | null
  createdVia?: string
}) {
  const [row] = await db
    .insert(customers)
    .values({
      customerId: input.customerId,
      fullName: input.fullName,
      primaryMobile: input.primaryMobile,
      email: input.email ?? null,
      createdVia: input.createdVia ?? 'web',
      profileCompleted: false,
    })
    .returning()
  return row
}

export async function updateCustomerByMobile(
  db: AppDb,
  phoneInput: string,
  patch: {
    fullName?: string
    email?: string | null
    referredBy?: string | null
    smsPermission?: boolean
    profileCompleted?: boolean
    lastLoginAt?: Date
  }
) {
  const set: {
    fullName?: string
    email?: string | null
    referredBy?: string | null
    smsPermission?: boolean
    profileCompleted?: boolean
    lastLoginAt?: string
  } = {}
  if (patch.fullName !== undefined) set.fullName = patch.fullName
  if (patch.email !== undefined) set.email = patch.email
  if (patch.referredBy !== undefined) set.referredBy = patch.referredBy
  if (patch.smsPermission !== undefined) set.smsPermission = patch.smsPermission
  if (patch.profileCompleted !== undefined) set.profileCompleted = patch.profileCompleted
  if (patch.lastLoginAt !== undefined) set.lastLoginAt = patch.lastLoginAt.toISOString()

  if (Object.keys(set).length === 0) return null

  const found = await findCustomerByPrimaryMobile(db, phoneInput)
  if (!found) return null

  const [row] = await db
    .update(customers)
    .set(set)
    .where(and(eq(customers.id, found.id), isNull(customers.deletedAt)))
    .returning()
  return row ?? null
}
