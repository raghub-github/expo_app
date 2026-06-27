import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only client with the service role key — bypasses RLS.
 * Use only in Route Handlers / server code for public reads that anon cannot access.
 */
let cached: SupabaseClient | null | undefined

export function getSupabaseServiceRole(): SupabaseClient | null {
  if (typeof window !== 'undefined') return null
  if (cached !== undefined) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    cached = null
    return null
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
