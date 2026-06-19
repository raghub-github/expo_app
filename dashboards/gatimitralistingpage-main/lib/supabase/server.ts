import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdminInstance: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  // Return cached instance if already created
  if (supabaseAdminInstance) {
    return supabaseAdminInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }

  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminInstance;
}

// Create a lazy getter object that only initializes when actually used
// This prevents errors during module compilation
function createLazySupabaseClient() {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      try {
        const client = getSupabaseAdmin();
        const value = (client as any)[prop];
        // Bind methods to the client instance so 'this' works correctly
        return typeof value === 'function' ? value.bind(client) : value;
      } catch (error: any) {
        // If env vars are missing, the API route should handle this
        // But we need to prevent the error from crashing during module load
        if (error.message?.includes('Missing Supabase')) {
          // Return a mock that will fail when actually used, but won't crash module load
          return () => {
            throw new Error('Supabase not configured. Please set up .env.local file.');
          };
        }
        throw error;
      }
    },
  });
}

// Export the lazy client - only initializes when properties are accessed
export const supabaseAdmin = createLazySupabaseClient();
