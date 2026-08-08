/**
 * Resolve store by store_id (text e.g. GMMC1015), validate merchant owns it.
 * Use for menu/combos/modifier-groups etc. in partnersite.
 */
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant'
import { isNetworkOrTransientError } from '@/lib/auth/session-errors'
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { client as pgClient } from '@/lib/drizzle'

// Lazy singleton — building this at module load fails during `next build`'s
// "Collecting page data" pass because process.env.NEXT_PUBLIC_SUPABASE_URL is
// not yet populated for routes that import this module. Defer until first
// request handler call.
let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'assertStoreAccess: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    )
  }
  _supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _supabase
}

export type AssertStoreResult =
  | { ok: true; storeIdNum: number; isPlatformStaff?: boolean }
  | { ok: false; error: string; status: number }

/** Active system_users with SUPER_ADMIN / ADMIN / SUPPORT / MANAGER — bypass merchant ownership. */
export async function isPlatformStaffEmail(userEmail: string | null | undefined): Promise<boolean> {
  return findSystemUserOverride(userEmail ?? null)
}

function normalizePhoneForLookup(phone: string): { e164: string; tenDigit: string } {
  const digits = phone.replace(/\D/g, '')
  const ten = digits.length > 10 ? digits.slice(-10) : digits
  const tenDigit = ten.length === 10 ? ten : ''
  const e164 = tenDigit ? `+91${tenDigit}` : phone.startsWith('+') ? phone : ''
  return { e164, tenDigit }
}

/** Store row when the logged-in user owns the store via supabase id, email, or phone. */
async function findStoreOwnedBySessionUser(
  storeIdPublic: string,
  user: { id: string; email?: string | null; phone?: string | null }
): Promise<{ id: number; parent_id: number } | null> {
  const emailNorm = user.email?.trim().toLowerCase() ?? ''
  const phoneRaw = user.phone?.trim() ?? ''
  const { e164, tenDigit } = phoneRaw ? normalizePhoneForLookup(phoneRaw) : { e164: '', tenDigit: '' }

  const rows = await pgClient`
    SELECT s.id, s.parent_id
    FROM merchant_stores s
    INNER JOIN merchant_parents p ON p.id = s.parent_id
    WHERE s.store_id = ${storeIdPublic.trim()}
      AND (
        p.supabase_user_id = ${user.id}
        OR (${emailNorm} <> '' AND lower(trim(coalesce(p.owner_email, ''))) = ${emailNorm})
        OR (${e164} <> '' AND p.registered_phone = ${e164})
        OR (${tenDigit} <> '' AND p.registered_phone_normalized = ${tenDigit})
      )
    LIMIT 1
  `

  const row = rows[0] as { id: unknown; parent_id: unknown } | undefined
  if (!row) return null
  const id = Number(row.id)
  const parent_id = Number(row.parent_id)
  if (!Number.isFinite(id) || !Number.isFinite(parent_id)) return null
  return { id, parent_id }
}

/**
 * Super-admins (and support / admin roles) can view any store, so they must
 * bypass the "does this merchant own this store" check that gates real
 * merchants. Falls through to the merchant path if the user isn't in
 * system_users at all.
 */
async function findSystemUserOverride(
  userEmail: string | null,
): Promise<boolean> {
  if (!userEmail?.trim()) return false
  try {
    const rows = await pgClient`
      SELECT primary_role, status
      FROM system_users
      WHERE lower(email) = ${userEmail.trim().toLowerCase()}
      LIMIT 1
    `
    const row = rows[0] as { primary_role: string | null; status: string | null } | undefined
    if (!row) return false
    if ((row.status ?? '').toUpperCase() !== 'ACTIVE') return false
    const role = (row.primary_role ?? '').toUpperCase()
    return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'SUPPORT' || role === 'MANAGER'
  } catch {
    return false
  }
}

export async function assertStoreAccess(storeIdParam: string | null): Promise<AssertStoreResult> {
  if (!storeIdParam || String(storeIdParam).trim() === '') {
    return { ok: false, error: 'storeId required', status: 400 }
  }
  if (!isValidPartnerStoreId(storeIdParam)) {
    return { ok: false, error: 'Invalid storeId', status: 400 }
  }

  let user: { id: string; email?: string | null; phone?: string | null } | null = null
  try {
    const supabaseServer = await createServerSupabaseClient()
    let { data: { user: sessionUser }, error: userError } = await supabaseServer.auth.getUser()
    if (userError || !sessionUser) {
      // Cookie session can lag after OTP/set-cookie — refresh once then retry.
      try {
        await supabaseServer.auth.getSession()
      } catch {
        /* ignore */
      }
      const retry = await supabaseServer.auth.getUser()
      sessionUser = retry.data.user
      userError = retry.error
    }
    if (userError || !sessionUser) {
      return { ok: false, error: 'Not authenticated', status: 401 }
    }
    user = sessionUser
  } catch (e) {
    // DNS blips / connect timeouts to Supabase throw TypeError: fetch failed
    // instead of returning an AuthError — surface a clean status, don't crash the route.
    if (isNetworkOrTransientError(e)) {
      return { ok: false, error: 'Auth service unavailable', status: 503 }
    }
    throw e
  }
  if (!user) {
    return { ok: false, error: 'Not authenticated', status: 401 }
  }

  const storePublicId = String(storeIdParam).trim()
  const { data: storeRow, error: storeError } = await getSupabase()
    .from('merchant_stores')
    .select('id, parent_id, area_manager_id')
    .eq('store_id', storePublicId)
    .maybeSingle()

  if (storeError) {
    return { ok: false, error: 'Store lookup failed', status: 500 }
  }
  if (!storeRow?.id) {
    return { ok: false, error: 'Store not found', status: 404 }
  }
  const storeIdNum = Number(storeRow.id)
  if (!Number.isFinite(storeIdNum) || storeIdNum < 1) {
    return { ok: false, error: 'Store not found', status: 404 }
  }

  // Super-admins / admins / support / managers can browse any store.
  if (await findSystemUserOverride(user.email ?? null)) {
    return { ok: true, storeIdNum, isPlatformStaff: true }
  }

  const validation = await validateMerchantFromSession({
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
  })

  // Canonical ownership: session merchant parent owns this store.
  // Prefer parent_id match over re-joining auth fields (avoids false 403s when
  // email/phone formatting differs but supabase_user_id already resolved the parent).
  if (
    validation.isValid &&
    validation.merchantParentId != null &&
    Number(storeRow.parent_id) === Number(validation.merchantParentId)
  ) {
    return { ok: true, storeIdNum }
  }

  // Assigned area manager (same rule as getMerchantStoreById).
  try {
    const { getAreaManagerRecordIdForAuthUser } = await import(
      '@/lib/merchant/get-merchant-store'
    )
    const amId = await getAreaManagerRecordIdForAuthUser(getSupabase(), user.email ?? null)
    const storeAmId =
      storeRow.area_manager_id != null ? Number(storeRow.area_manager_id) : null
    if (amId != null && storeAmId != null && amId === storeAmId) {
      return { ok: true, storeIdNum }
    }
  } catch {
    /* ignore AM lookup failures */
  }

  // Legacy ownership join (phone / email edge cases).
  const owned = await findStoreOwnedBySessionUser(storePublicId, user)
  if (owned) {
    return { ok: true, storeIdNum: owned.id }
  }

  if (!validation.isValid) {
    return { ok: false, error: validation.error ?? 'Merchant not found', status: 403 }
  }

  return { ok: false, error: 'Store does not belong to this merchant', status: 403 }
}
