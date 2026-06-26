import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Check if Supabase is properly configured
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder') &&
  supabaseUrl.startsWith('https://')
)

// Log configuration status for debugging
if (typeof window !== 'undefined') {
  console.log('[Supabase] Configuration check:', {
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabaseAnonKey),
    isConfigured: isSupabaseConfigured,
    url: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET'
  })
}

// Create the Supabase client
let supabase: SupabaseClient

if (isSupabaseConfigured) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  })
  console.log('[Supabase] Client initialized successfully')
} else {
  // Create a mock client for development without Supabase
  console.warn('[Supabase] Not configured - using mock client. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  supabase = {
    from: (table: string) => ({
      select: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      insert: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      update: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      delete: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      eq: () => ({
        select: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        single: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        limit: () => ({
          single: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        }),
      }),
    }),
    auth: {
      signInWithOtp: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      verifyOtp: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
    },
  } as unknown as SupabaseClient
}

export { supabase }
export default supabase

